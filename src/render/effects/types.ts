import type * as THREE from 'three';

export type EffectCategory = 'film' | 'colour' | 'blur' | 'stylise' | 'retro' | 'distort';

export type EffectParamSpec = {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Value at which the parameter does nothing. */
  neutral: number;
  format?: (value: number) => string;
};

export type EffectValues = Record<string, number>;

/**
 * A window onto the image in normalised coordinates: scale 1 with offset 0 shows
 * the whole frame, 0.25 shows a quarter of it.
 */
export type RenderView = { scale: number; offsetX: number; offsetY: number };

export const FULL_VIEW: RenderView = { scale: 1, offsetX: 0, offsetY: 0 };

export type PassContext = {
  /** Draws a full-screen pass. `null` targets whatever the chain is writing to. */
  blit: (material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) => void;
  /** A pooled render target, keyed so it survives between frames. */
  scratch: (key: string, width: number, height: number) => THREE.WebGLRenderTarget;

  /** Result of every effect so far, already in the current view. */
  input: THREE.Texture;
  output: THREE.WebGLRenderTarget | null;

  /**
   * The untouched photograph, in full-image space. An effect whose radius must
   * stay fixed relative to the picture — halation, above all — works from this
   * and applies `view` itself, rather than inheriting an already-cropped input
   * and shrinking as the user zooms in.
   */
  source: THREE.Texture;
  view: RenderView;

  width: number;
  height: number;
  /** Longest edge normalised to 1, so effects can stay isotropic. */
  aspect: THREE.Vector2;
  /** Advances per video frame; effects that must not strobe key off it. */
  seed: number;
};

export type EffectRuntime = {
  render: (ctx: PassContext, values: EffectValues) => void;
  dispose: () => void;
};

export type EffectDef = {
  id: string;
  name: string;
  category: EffectCategory;
  params: EffectParamSpec[];
  /**
   * True when the effect does nothing at these values, letting the engine skip
   * the pass entirely rather than paying for an identity blit.
   */
  isIdentity?: (values: EffectValues) => boolean;
  create: () => EffectRuntime;
};

/** One effect placed in the chain, with its own values. */
export type ChainNode = {
  /** Stable across reorders, so React keys and focus survive a move. */
  nodeId: string;
  effectId: string;
  enabled: boolean;
  values: EffectValues;
};

export function defaultValues(def: EffectDef): EffectValues {
  const out: EffectValues = {};
  for (const spec of def.params) out[spec.key] = spec.neutral;
  return out;
}
