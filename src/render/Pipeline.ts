import * as THREE from 'three';
import { EffectEngine, REGISTRY, chainFromLegacyParams, type ChainNode, type RenderView } from './effects';
import { FULL_VIEW } from './effects/types';
import type { Params } from '../state/params';

export type { RenderView, ChainNode };
export { FULL_VIEW };

/** 256 bins per channel, counted from what the viewer is actually looking at. */
export type Histogram = { r: Uint32Array; g: Uint32Array; b: Uint32Array; peak: number };

export type RenderOptions = {
  seed?: number;
  /** Blend of the finished look back towards the untouched photo. */
  mix?: number;
  view?: RenderView;
  /** Fraction of the width left showing the original. Negative disables it. */
  split?: number;
  /**
   * Pointer position in -1..1, which tilts the image as a plane in space. Only
   * honoured when drawing to the canvas, and the caller is expected to withhold
   * it whenever the image is being judged rather than admired — a tilted plane
   * resamples the picture and cannot be trusted at 1:1.
   */
  tilt?: { x: number; y: number } | null;
};

/** Kept small on purpose. Past a couple of degrees the parallax stops reading as
 *  depth and starts reading as a mistake. */
const MAX_TILT = 0.032;
const PLANE_FILL = 0.94;

/**
 * Owns the WebGL context and everything around the effect chain: presentation,
 * readback, export. What the picture actually passes through lives in
 * `effects/` — this class deliberately knows nothing about any single effect.
 */
export class Pipeline {
  readonly renderer: THREE.WebGLRenderer;
  private readonly engine: EffectEngine;

  private source: THREE.Texture | null = null;

  private presentTarget: THREE.WebGLRenderTarget | null = null;
  private readonly presentScene = new THREE.Scene();
  private readonly presentCamera = new THREE.PerspectiveCamera(28, 1, 0.1, 10);
  private readonly presentMesh: THREE.Mesh;

  constructor(canvas?: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    this.renderer.autoClear = false;
    // The chain emits values that are already sRGB-encoded, so the renderer must
    // hand them through untouched.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    this.engine = new EffectEngine(this.renderer);

    this.presentCamera.position.z = 3;
    this.presentMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
    );
    this.presentScene.add(this.presentMesh);
  }

  /** The colour behind the tilted plane. Matches the viewport surround so the
   *  picture reads as floating on it rather than on a black hole. */
  setBackground(colour: string) {
    // The renderer's output space is linear-through, so the clear colour must be
    // handed over already-encoded. Letting three convert it from sRGB would put
    // #1a1a1a on screen as rgb(3,3,3).
    this.renderer.setClearColor(new THREE.Color().setStyle(colour, THREE.LinearSRGBColorSpace), 1);
  }

  setSource(texture: THREE.Texture | null) {
    this.source = texture;
    if (texture) {
      // The shaders decode sRGB by hand, so three must not touch it.
      texture.colorSpace = THREE.NoColorSpace;
      // flipY is unreliable for ImageBitmap sources; the vertex shader flips V.
      texture.flipY = false;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
    }
  }

  renderChain(
    chain: ChainNode[],
    width: number,
    height: number,
    target: THREE.WebGLRenderTarget | null,
    options: RenderOptions = {},
  ) {
    if (!this.source) return;

    this.renderer.setSize(width, height, false);

    const tilt = options.tilt;
    if (target === null && tilt) {
      const offscreen = this.ensurePresentTarget(width, height);
      this.engine.render(this.source, chain, REGISTRY, width, height, offscreen, options);
      this.presentTilted(width, height, tilt);
    } else {
      this.engine.render(this.source, chain, REGISTRY, width, height, target, options);
    }
    this.renderer.setRenderTarget(null);
  }

  /** Bridge for callers still holding the flat parameter set. */
  render(
    params: Params,
    width: number,
    height: number,
    target: THREE.WebGLRenderTarget | null,
    options: RenderOptions = {},
  ) {
    this.renderChain(chainFromLegacyParams(params), width, height, target, options);
  }

  private ensurePresentTarget(width: number, height: number) {
    if (
      !this.presentTarget ||
      this.presentTarget.width !== width ||
      this.presentTarget.height !== height
    ) {
      this.presentTarget?.dispose();
      this.presentTarget = new THREE.WebGLRenderTarget(width, height, {
        type: THREE.UnsignedByteType,
        format: THREE.RGBAFormat,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: false,
        stencilBuffer: false,
      });
    }
    return this.presentTarget;
  }

  /** Draws the finished frame as a plane under a perspective camera so the
   *  picture sits in space rather than flat against the glass. */
  private presentTilted(width: number, height: number, tilt: { x: number; y: number }) {
    const aspect = width / height;
    this.presentCamera.aspect = aspect;
    this.presentCamera.updateProjectionMatrix();

    const visibleHeight =
      2 * this.presentCamera.position.z * Math.tan((this.presentCamera.fov * Math.PI) / 360);
    this.presentMesh.scale.set(visibleHeight * aspect * PLANE_FILL, visibleHeight * PLANE_FILL, 1);
    this.presentMesh.rotation.set(-tilt.y * MAX_TILT, tilt.x * MAX_TILT, 0);

    const material = this.presentMesh.material as THREE.MeshBasicMaterial;
    material.map = this.presentTarget!.texture;
    material.needsUpdate = true;

    this.renderer.setRenderTarget(null);
    this.renderer.clear();
    this.renderer.render(this.presentScene, this.presentCamera);
  }

  private withReadTarget<T>(
    width: number,
    height: number,
    body: (target: THREE.WebGLRenderTarget, pixels: Uint8Array) => T,
  ): T {
    const target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    try {
      const pixels = new Uint8Array(width * height * 4);
      return body(target, pixels);
    } finally {
      target.dispose();
    }
  }

  /** Always renders the whole frame: a zoomed preview must not crop the export. */
  renderToPixels(
    chain: ChainNode[],
    width: number,
    height: number,
    options: RenderOptions = {},
  ): Uint8ClampedArray {
    return this.withReadTarget(width, height, (target, raw) => {
      this.renderChain(chain, width, height, target, {
        ...options,
        view: FULL_VIEW,
        split: -1,
        tilt: null,
      });
      this.renderer.readRenderTargetPixels(target, 0, 0, width, height, raw);

      // WebGL hands back rows bottom-up; canvas wants them top-down.
      const flipped = new Uint8ClampedArray(width * height * 4);
      const stride = width * 4;
      for (let y = 0; y < height; y++) {
        const from = (height - 1 - y) * stride;
        flipped.set(raw.subarray(from, from + stride), y * stride);
      }
      return flipped;
    });
  }

  /**
   * Bins the composited result. Measured from a small render of the current view
   * rather than the full frame: a histogram is about distribution, and 24k
   * samples settle it while staying cheap enough to run on every edit.
   */
  readHistogram(
    chain: ChainNode[],
    width: number,
    height: number,
    options: RenderOptions = {},
  ): Histogram | null {
    if (!this.source) return null;

    return this.withReadTarget(width, height, (target, pixels) => {
      this.renderChain(chain, width, height, target, { ...options, tilt: null });
      this.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);

      const r = new Uint32Array(256);
      const g = new Uint32Array(256);
      const b = new Uint32Array(256);
      for (let i = 0; i < pixels.length; i += 4) {
        r[pixels[i]]++;
        g[pixels[i + 1]]++;
        b[pixels[i + 2]]++;
      }
      let peak = 1;
      for (let i = 0; i < 256; i++) peak = Math.max(peak, r[i], g[i], b[i]);
      return { r, g, b, peak };
    });
  }

  prune(chain: ChainNode[]) {
    this.engine.prune(chain);
  }

  dispose() {
    this.engine.dispose();
    this.presentTarget?.dispose();
    this.presentMesh.geometry.dispose();
    (this.presentMesh.material as THREE.Material).dispose();
    this.renderer.dispose();
  }
}
