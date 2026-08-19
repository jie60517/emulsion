import * as THREE from 'three';
import type { Params } from '../state/params';
import { BLUR_FRAG, COMPOSITE_FRAG, DOWNSAMPLE_FRAG, LEVELS, THRESHOLD_FRAG, VERT } from './shaders';

/** Per-channel diffusion multipliers. Red scatters furthest through the emulsion,
 *  blue barely at all — this ratio is what makes the halo read white → orange → red
 *  instead of a flat red fog. */
const CHANNEL_SPREAD = [1.0, 0.6, 0.32];
const SPREAD_SIGMA = 0.95;

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

type Target = THREE.WebGLRenderTarget;

/** A window onto the image in normalised coordinates: scale 1 with offset 0
 *  shows the whole frame, scale 0.25 shows a quarter of it. */
export type RenderView = { scale: number; offsetX: number; offsetY: number };

export const FULL_VIEW: RenderView = { scale: 1, offsetX: 0, offsetY: 0 };

export type RenderOptions = {
  seed?: number;
  /** Blend of the finished look back towards the untouched photo. */
  mix?: number;
  view?: RenderView;
  /** Fraction of the width left showing the original. Negative disables it. */
  split?: number;
};

export class Pipeline {
  readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;

  private readonly thresholdMat: THREE.ShaderMaterial;
  private readonly downsampleMat: THREE.ShaderMaterial;
  private readonly blurMat: THREE.ShaderMaterial;
  private readonly compositeMat: THREE.ShaderMaterial;

  private levels: Target[] = [];
  private scratch: Target[] = [];
  private pyramidWidth = 0;
  private pyramidHeight = 0;

  private source: THREE.Texture | null = null;

  constructor(canvas?: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    this.renderer.autoClear = false;
    // The composite shader emits values that are already sRGB-encoded, so the
    // renderer must hand them through untouched.
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.quad = new THREE.Mesh(geometry);
    this.scene.add(this.quad);

    this.thresholdMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: THRESHOLD_FRAG,
      uniforms: {
        uSource: { value: null },
        uThreshold: { value: 0.5 },
        uKnee: { value: 0.1 },
      },
      depthTest: false,
      depthWrite: false,
    });

    this.downsampleMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: DOWNSAMPLE_FRAG,
      uniforms: { uTex: { value: null }, uTexel: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    });

    this.blurMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: BLUR_FRAG,
      uniforms: { uTex: { value: null }, uDir: { value: new THREE.Vector2() } },
      depthTest: false,
      depthWrite: false,
    });

    this.compositeMat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: COMPOSITE_FRAG,
      uniforms: {
        uSource: { value: null },
        uHalo0: { value: null },
        uHalo1: { value: null },
        uHalo2: { value: null },
        uHalo3: { value: null },
        uHalo4: { value: null },
        uHaloWeight: { value: Array.from({ length: LEVELS }, () => new THREE.Vector3()) },
        uHaloStrength: { value: 0 },
        uHaloTint: { value: new THREE.Vector3(1, 0.4, 0.32) },
        uExposure: { value: 0 },
        uWhiteBalance: { value: new THREE.Vector3(1, 1, 1) },
        uLift: { value: 0 },
        uGamma: { value: 1 },
        uGain: { value: 0 },
        uContrast: { value: 0 },
        uSaturation: { value: 0 },
        uVignette: { value: 0 },
        uGrainStrength: { value: 0 },
        uGrainScale: { value: 900 },
        uGrainSeed: { value: 0 },
        uAspect: { value: new THREE.Vector2(1, 1) },
        uMix: { value: 1 },
        uViewScale: { value: new THREE.Vector2(1, 1) },
        uViewOffset: { value: new THREE.Vector2(0, 0) },
        uSplit: { value: -1 },
      },
      depthTest: false,
      depthWrite: false,
    });
  }

  setSource(texture: THREE.Texture | null) {
    this.source = texture;
    if (texture) {
      // We decode sRGB by hand inside the shaders, so three must not touch it.
      texture.colorSpace = THREE.NoColorSpace;
      // flipY is unreliable for ImageBitmap sources; the vertex shader flips V.
      texture.flipY = false;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
    }
  }

  private blit(material: THREE.ShaderMaterial, target: Target | null) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  }

  private ensurePyramid(width: number, height: number) {
    if (this.pyramidWidth === width && this.pyramidHeight === height && this.levels.length) return;
    this.disposePyramid();
    this.pyramidWidth = width;
    this.pyramidHeight = height;

    const options: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    };

    for (let i = 0; i < LEVELS; i++) {
      const w = Math.max(2, width >> (i + 1));
      const h = Math.max(2, height >> (i + 1));
      this.levels.push(new THREE.WebGLRenderTarget(w, h, options));
      this.scratch.push(new THREE.WebGLRenderTarget(w, h, options));
    }
  }

  private disposePyramid() {
    for (const t of [...this.levels, ...this.scratch]) t.dispose();
    this.levels = [];
    this.scratch = [];
    this.pyramidWidth = 0;
    this.pyramidHeight = 0;
  }

  /** Gaussian falloff across pyramid levels, computed separately per channel. */
  private haloWeights(radius01: number): THREE.Vector3[] {
    const out = Array.from({ length: LEVELS }, () => new THREE.Vector3());
    const axes = ['x', 'y', 'z'] as const;
    for (let c = 0; c < 3; c++) {
      const centre = radius01 * (LEVELS - 1) * CHANNEL_SPREAD[c];
      const raw: number[] = [];
      let sum = 0;
      for (let i = 0; i < LEVELS; i++) {
        const d = i - centre;
        const w = Math.exp(-(d * d) / (2 * SPREAD_SIGMA * SPREAD_SIGMA));
        raw.push(w);
        sum += w;
      }
      for (let i = 0; i < LEVELS; i++) out[i][axes[c]] = raw[i] / sum;
    }
    return out;
  }

  private applyParams(
    p: Params,
    width: number,
    height: number,
    { seed = 0, mix = 1, view = FULL_VIEW, split = -1 }: RenderOptions,
  ) {
    const u = this.compositeMat.uniforms;

    const weights = this.haloWeights(p.halationRadius / 100);
    const dst = u.uHaloWeight.value as THREE.Vector3[];
    for (let i = 0; i < LEVELS; i++) dst[i].copy(weights[i]);

    u.uHaloStrength.value = p.halationStrength / 100;

    const warmth = p.halationWarmth / 100;
    (u.uHaloTint.value as THREE.Vector3).set(1.0, 0.24 + 0.34 * warmth, 0.44 - 0.22 * warmth);

    const t = p.temperature / 100;
    const m = p.tint / 100;
    let r = 1 + 0.26 * t;
    let g = 1 - 0.16 * m;
    let b = 1 - 0.26 * t;
    // Keep white balance luminance-neutral so it does not double as an exposure control.
    const norm = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r /= norm;
    g /= norm;
    b /= norm;
    (u.uWhiteBalance.value as THREE.Vector3).set(r, g, b);

    u.uExposure.value = p.exposure;
    u.uLift.value = (p.lift / 100) * 0.25;
    u.uGamma.value = p.gamma;
    u.uGain.value = (p.gain / 100) * 0.4;
    u.uContrast.value = p.contrast / 100;
    u.uSaturation.value = p.saturation / 100;
    u.uVignette.value = (p.vignette / 100) * 0.85;

    u.uGrainStrength.value = (p.grainStrength / 100) * 0.34;
    // Grain coordinates are driven by UV, not pixels, so a given grain size covers
    // the same fraction of the frame whether we are previewing or exporting 4K.
    u.uGrainScale.value = 90000 / p.grainSize;
    u.uGrainSeed.value = seed;
    u.uMix.value = mix;

    (u.uViewScale.value as THREE.Vector2).set(view.scale, view.scale);
    (u.uViewOffset.value as THREE.Vector2).set(view.offsetX, view.offsetY);
    u.uSplit.value = split;

    const aspect = width / height;
    (u.uAspect.value as THREE.Vector2).set(aspect >= 1 ? aspect : 1, aspect >= 1 ? 1 : 1 / aspect);

    const thresholdLinear = srgbToLinear(p.halationThreshold / 100);
    this.thresholdMat.uniforms.uThreshold.value = thresholdLinear;
    this.thresholdMat.uniforms.uKnee.value = Math.max(0.02, thresholdLinear * 0.55);
  }

  render(
    params: Params,
    width: number,
    height: number,
    target: Target | null,
    options: RenderOptions = {},
  ) {
    if (!this.source) return;

    this.ensurePyramid(width, height);
    this.applyParams(params, width, height, options);

    if (params.halationStrength > 0) {
      this.thresholdMat.uniforms.uSource.value = this.source;
      this.blit(this.thresholdMat, this.levels[0]);

      for (let i = 1; i < LEVELS; i++) {
        const src = this.levels[i - 1];
        this.downsampleMat.uniforms.uTex.value = src.texture;
        (this.downsampleMat.uniforms.uTexel.value as THREE.Vector2).set(1 / src.width, 1 / src.height);
        this.blit(this.downsampleMat, this.levels[i]);
      }

      for (let i = 0; i < LEVELS; i++) {
        const level = this.levels[i];
        this.blurMat.uniforms.uTex.value = level.texture;
        (this.blurMat.uniforms.uDir.value as THREE.Vector2).set(1 / level.width, 0);
        this.blit(this.blurMat, this.scratch[i]);

        this.blurMat.uniforms.uTex.value = this.scratch[i].texture;
        (this.blurMat.uniforms.uDir.value as THREE.Vector2).set(0, 1 / level.height);
        this.blit(this.blurMat, level);
      }
    }

    const u = this.compositeMat.uniforms;
    u.uSource.value = this.source;
    for (let i = 0; i < LEVELS; i++) {
      u['uHalo' + i].value = this.levels[i].texture;
    }

    this.renderer.setSize(width, height, false);
    this.blit(this.compositeMat, target);
    this.renderer.setRenderTarget(null);
  }

  /** Renders at full source resolution and reads the pixels back, top row first. */
  /** Always renders the whole frame: a zoomed preview must not crop the export. */
  renderToPixels(
    params: Params,
    width: number,
    height: number,
    options: RenderOptions = {},
  ): Uint8ClampedArray {
    const target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });

    try {
      this.render(params, width, height, target, { ...options, view: FULL_VIEW, split: -1 });
      const raw = new Uint8Array(width * height * 4);
      this.renderer.readRenderTargetPixels(target, 0, 0, width, height, raw);

      // WebGL hands back rows bottom-up; canvas wants them top-down.
      const flipped = new Uint8ClampedArray(width * height * 4);
      const stride = width * 4;
      for (let y = 0; y < height; y++) {
        const from = (height - 1 - y) * stride;
        flipped.set(raw.subarray(from, from + stride), y * stride);
      }
      return flipped;
    } finally {
      target.dispose();
      this.disposePyramid();
    }
  }

  dispose() {
    this.disposePyramid();
    this.thresholdMat.dispose();
    this.downsampleMat.dispose();
    this.blurMat.dispose();
    this.compositeMat.dispose();
    this.quad.geometry.dispose();
    this.renderer.dispose();
  }
}
