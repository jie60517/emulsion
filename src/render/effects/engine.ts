import * as THREE from 'three';
import {
  FULL_VIEW,
  type ChainNode,
  type EffectDef,
  type EffectParamSpec,
  type EffectRuntime,
  type EffectValues,
  type PassContext,
  type RenderView,
} from './types';

/**
 * Every pass shares this preamble. The chain carries sRGB-encoded values —
 * effects are overwhelmingly defined in display space — and any effect that
 * genuinely needs linear light, halation above all, decodes and re-encodes
 * around its own maths. Storage is half-float so those round trips do not band.
 */
export const GLSL_PREAMBLE = /* glsl */ `
precision highp float;

// Two coordinate systems, and mixing them up flips the picture.
//
// vUv is the photograph's own space, V inverted because source textures carry
// EXIF orientation and so cannot use flipY. Only passes that read the original
// image — or that must scale with it, like grain — use it.
//
// vScreen is the framebuffer's space, and it is what every read of the chain's
// own intermediate targets must use. Those targets were written by a previous
// pass in this same space; flipping again once per pass turns the image upside
// down on every odd-numbered effect.
varying vec2 vUv;
varying vec2 vScreen;
uniform sampler2D uSource;
uniform vec2 uAspect;
uniform float uSeed;
/** One pixel, in UV. Neighbour-sampling effects need it to know how far to step. */
uniform vec2 uTexelSize;

// Where this pixel sits in the photograph rather than on screen. Effects whose
// scale must follow the picture — grain, vignette — use imageUv() so that
// zooming in magnifies them like a loupe instead of resampling them finer.
uniform vec2 uViewScale;
uniform vec2 uViewOffset;
vec2 imageUv() { return vUv * uViewScale + uViewOffset; }

vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 linearToSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
    f.y
  );
}
`;

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec2 vScreen;
void main() {
  vUv = vec2(uv.x, 1.0 - uv.y);
  vScreen = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export function uniformName(key: string): string {
  return `u${key.charAt(0).toUpperCase()}${key.slice(1)}`;
}

export function makeMaterial(fragment: string, params: EffectParamSpec[] = []): THREE.ShaderMaterial {
  const uniforms: Record<string, THREE.IUniform> = {
    uSource: { value: null },
    uAspect: { value: new THREE.Vector2(1, 1) },
    uSeed: { value: 0 },
    uTexelSize: { value: new THREE.Vector2(1 / 1024, 1 / 1024) },
    uViewScale: { value: new THREE.Vector2(1, 1) },
    uViewOffset: { value: new THREE.Vector2(0, 0) },
  };
  for (const spec of params) uniforms[uniformName(spec.key)] = { value: spec.neutral };

  return new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: GLSL_PREAMBLE + fragment,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
}

export function applyCommon(
  material: THREE.ShaderMaterial,
  ctx: PassContext,
  values: EffectValues,
  params: EffectParamSpec[],
) {
  material.uniforms.uSource.value = ctx.input;
  (material.uniforms.uAspect.value as THREE.Vector2).copy(ctx.aspect);
  material.uniforms.uSeed.value = ctx.seed;
  (material.uniforms.uTexelSize.value as THREE.Vector2).set(1 / ctx.width, 1 / ctx.height);
  (material.uniforms.uViewScale.value as THREE.Vector2).set(ctx.view.scale, ctx.view.scale);
  (material.uniforms.uViewOffset.value as THREE.Vector2).set(ctx.view.offsetX, ctx.view.offsetY);
  for (const spec of params) {
    const uniform = material.uniforms[uniformName(spec.key)];
    if (uniform) uniform.value = values[spec.key] ?? spec.neutral;
  }
}

/** The common case: one fragment shader, one draw. Roughly twenty lines of GLSL
 *  buys an effect. */
export function simpleEffect(config: {
  id: string;
  name: string;
  category: EffectDef['category'];
  params: EffectParamSpec[];
  fragment: string;
  isIdentity?: (values: EffectValues) => boolean;
}): EffectDef {
  return {
    id: config.id,
    name: config.name,
    category: config.category,
    params: config.params,
    isIdentity:
      config.isIdentity ?? ((values) => config.params.every((p) => values[p.key] === p.neutral)),
    create(): EffectRuntime {
      const material = makeMaterial(config.fragment, config.params);
      return {
        render(ctx, values) {
          applyCommon(material, ctx, values, config.params);
          ctx.blit(material, ctx.output);
        },
        dispose() {
          material.dispose();
        },
      };
    },
  };
}

const HEAD_FRAG = /* glsl */ `
void main() {
  gl_FragColor = vec4(texture2D(uSource, imageUv()).rgb, 1.0);
}
`;

const TAIL_FRAG = /* glsl */ `
uniform sampler2D uOriginal;
uniform float uMix;
uniform float uSplit;
void main() {
  vec3 processed = texture2D(uSource, vScreen).rgb;
  vec3 original = texture2D(uOriginal, vScreen).rgb;
  vec3 col = mix(original, processed, uMix);
  if (uSplit >= 0.0 && vScreen.x < uSplit) col = original;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export type ChainRenderOptions = {
  seed?: number;
  mix?: number;
  view?: RenderView;
  split?: number;
};

/**
 * Ping-pong evaluator for a chain of effects. Nothing here knows what any
 * individual effect does, which is the whole point: adding one is registering a
 * definition, not editing the engine.
 */
export class EffectEngine {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;

  private readonly headMat: THREE.ShaderMaterial;
  private readonly tailMat: THREE.ShaderMaterial;

  private readonly runtimes = new Map<string, EffectRuntime>();
  private readonly scratchPool = new Map<string, THREE.WebGLRenderTarget>();

  private ping: THREE.WebGLRenderTarget | null = null;
  private pong: THREE.WebGLRenderTarget | null = null;
  private original: THREE.WebGLRenderTarget | null = null;
  private chainWidth = 0;
  private chainHeight = 0;

  readonly renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer) {
    this.renderer = renderer;
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
    this.scene.add(this.quad);
    this.headMat = makeMaterial(HEAD_FRAG);
    this.tailMat = makeMaterial(TAIL_FRAG);
    this.tailMat.uniforms.uOriginal = { value: null };
    this.tailMat.uniforms.uMix = { value: 1 };
    this.tailMat.uniforms.uSplit = { value: -1 };
  }

  private blit = (material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
  };

  private scratch = (key: string, width: number, height: number) => {
    const existing = this.scratchPool.get(key);
    if (existing && existing.width === width && existing.height === height) return existing;
    existing?.dispose();
    const target = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    this.scratchPool.set(key, target);
    return target;
  };

  private ensureChainTargets(width: number, height: number) {
    if (this.chainWidth === width && this.chainHeight === height && this.ping) return;
    for (const t of [this.ping, this.pong, this.original]) t?.dispose();
    const options: THREE.RenderTargetOptions = {
      type: THREE.HalfFloatType,
      format: THREE.RGBAFormat,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    };
    this.ping = new THREE.WebGLRenderTarget(width, height, options);
    this.pong = new THREE.WebGLRenderTarget(width, height, options);
    this.original = new THREE.WebGLRenderTarget(width, height, options);
    this.chainWidth = width;
    this.chainHeight = height;
  }

  private runtimeFor(node: ChainNode, registry: Map<string, EffectDef>): EffectRuntime | null {
    const def = registry.get(node.effectId);
    if (!def) return null;
    let runtime = this.runtimes.get(node.nodeId);
    if (!runtime) {
      runtime = def.create();
      this.runtimes.set(node.nodeId, runtime);
    }
    return runtime;
  }

  render(
    source: THREE.Texture,
    chain: ChainNode[],
    registry: Map<string, EffectDef>,
    width: number,
    height: number,
    target: THREE.WebGLRenderTarget | null,
    options: ChainRenderOptions = {},
  ) {
    const { seed = 0, mix = 1, view = FULL_VIEW, split = -1 } = options;
    this.ensureChainTargets(width, height);

    const aspectRatio = width / height;
    const aspect = new THREE.Vector2(
      aspectRatio >= 1 ? aspectRatio : 1,
      aspectRatio >= 1 ? 1 : 1 / aspectRatio,
    );

    // Head: sample the photograph through the current view into chain space.
    this.headMat.uniforms.uSource.value = source;
    (this.headMat.uniforms.uViewScale.value as THREE.Vector2).set(view.scale, view.scale);
    (this.headMat.uniforms.uViewOffset.value as THREE.Vector2).set(view.offsetX, view.offsetY);
    this.blit(this.headMat, this.original);

    let read = this.original!;
    let write = this.ping!;

    for (const node of chain) {
      if (!node.enabled) continue;
      const def = registry.get(node.effectId);
      if (!def) continue;
      if (def.isIdentity?.(node.values)) continue;

      const runtime = this.runtimeFor(node, registry);
      if (!runtime) continue;

      const ctx: PassContext = {
        blit: this.blit,
        scratch: this.scratch,
        input: read.texture,
        output: write,
        source,
        view,
        width,
        height,
        aspect,
        seed,
      };
      runtime.render(ctx, node.values);

      // The first effect reads the untouched copy, so only swap between the two
      // working targets after that.
      const next = read === this.original ? this.pong! : read;
      read = write;
      write = next;
    }

    this.tailMat.uniforms.uSource.value = read.texture;
    this.tailMat.uniforms.uOriginal.value = this.original!.texture;
    this.tailMat.uniforms.uMix.value = mix;
    this.tailMat.uniforms.uSplit.value = split;
    this.blit(this.tailMat, target);
    this.renderer.setRenderTarget(null);
  }

  /** Drops runtimes for nodes that have left the chain. */
  prune(chain: ChainNode[]) {
    const live = new Set(chain.map((n) => n.nodeId));
    for (const [nodeId, runtime] of this.runtimes) {
      if (!live.has(nodeId)) {
        runtime.dispose();
        this.runtimes.delete(nodeId);
      }
    }
  }

  dispose() {
    for (const runtime of this.runtimes.values()) runtime.dispose();
    this.runtimes.clear();
    for (const t of this.scratchPool.values()) t.dispose();
    this.scratchPool.clear();
    for (const t of [this.ping, this.pong, this.original]) t?.dispose();
    this.headMat.dispose();
    this.tailMat.dispose();
    this.quad.geometry.dispose();
  }
}
