import { halation } from './library/halation';
import { grade, grain, vignette } from './library/basics';
import { cyanotype, duotone, hueShift, invert, rgbShift, sepia, thermal } from './library/colour';
import {
  dither,
  emboss,
  halftone,
  pixelate,
  posterize,
  scanlines,
  sharpen,
  threshold,
} from './library/stylise';
import { bloom, blur, motionBlur, starGlow, tiltShift, zoomBlur } from './library/blur';
import { defaultValues, type ChainNode, type EffectCategory, type EffectDef } from './types';
import type { Params } from '../../state/params';

export * from './types';
export { EffectEngine, simpleEffect } from './engine';

export const EFFECTS: EffectDef[] = [
  // Film
  halation,
  grain,
  // Colour
  grade,
  vignette,
  sepia,
  duotone,
  hueShift,
  rgbShift,
  thermal,
  cyanotype,
  invert,
  // Stylise
  posterize,
  threshold,
  halftone,
  dither,
  pixelate,
  emboss,
  sharpen,
  // Blur
  blur,
  bloom,
  motionBlur,
  zoomBlur,
  tiltShift,
  starGlow,
  // Retro
  scanlines,
];

export const REGISTRY: Map<string, EffectDef> = new Map(EFFECTS.map((e) => [e.id, e]));

export const CATEGORY_LABELS: Record<EffectCategory, string> = {
  film: 'Film',
  colour: 'Colour',
  blur: 'Blur',
  stylise: 'Stylise',
  retro: 'Retro',
  distort: 'Distort',
};

let counter = 0;

export function makeNode(effectId: string): ChainNode | null {
  const def = REGISTRY.get(effectId);
  if (!def) return null;
  counter += 1;
  return {
    nodeId: `${effectId}-${counter.toString(36)}`,
    effectId,
    enabled: true,
    values: defaultValues(def),
  };
}

/**
 * The chain that reproduces the fixed pipeline this engine replaced, in the
 * order that pipeline baked in: the halo is part of the exposure, so it lands
 * before the grade; grain and vignette sit on top of the graded image.
 */
export function defaultChain(): ChainNode[] {
  return ['halation', 'grade', 'grain', 'vignette']
    .map(makeNode)
    .filter((n): n is ChainNode => n !== null);
}

/** Rebuilds a chain from the flat parameter set the app used before effects
 *  became reorderable, so saved looks and shared links keep working. */
export function chainFromLegacyParams(params: Params): ChainNode[] {
  const chain = defaultChain();
  const byEffect: Record<string, Record<string, number>> = {
    halation: {
      strength: params.halationStrength,
      radius: params.halationRadius,
      threshold: params.halationThreshold,
      warmth: params.halationWarmth,
    },
    grain: { strength: params.grainStrength, size: params.grainSize },
    grade: {
      exposure: params.exposure,
      temperature: params.temperature,
      tint: params.tint,
      saturation: params.saturation,
      lift: params.lift,
      gamma: params.gamma,
      gain: params.gain,
      contrast: params.contrast,
    },
    vignette: { amount: params.vignette },
  };
  for (const node of chain) {
    Object.assign(node.values, byEffect[node.effectId] ?? {});
  }
  return chain;
}
