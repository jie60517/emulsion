import { DEFAULT_PARAMS, PARAM_SPECS, type Params } from './params';

export type PresetGroup = 'film' | 'cinematic' | 'texture';

export type Preset = {
  id: string;
  name: string;
  /** Small print under the name. Where a look references a film, the reference
   *  lives here rather than in the name — the look is the product, not the
   *  director's name. */
  note: string;
  group: PresetGroup;
  params: Params;
};

/** Presets are sparse overrides of the neutral defaults, so a preset only has
 *  to state what it actually changes. */
function preset(
  id: string,
  name: string,
  note: string,
  group: PresetGroup,
  overrides: Partial<Params>,
): Preset {
  return { id, name, note, group, params: { ...DEFAULT_PARAMS, ...overrides } };
}

export const PRESET_GROUP_LABELS: Record<PresetGroup, string> = {
  film: 'Film stock',
  cinematic: 'Cinematic',
  texture: 'Texture',
};

export const PRESET_GROUP_ORDER: PresetGroup[] = ['film', 'cinematic', 'texture'];

export const PRESETS: Preset[] = [
  preset('800t-night', '800T Night', 'The tungsten stock, wide open', 'film', {
    halationStrength: 85,
    halationRadius: 55,
    halationThreshold: 55,
    halationWarmth: 30,
    grainStrength: 34,
    grainSize: 110,
    temperature: -18,
    tint: 6,
    lift: 8,
    contrast: 12,
    saturation: 6,
    vignette: 18,
  }),
  preset('portra-warm', 'Portra Warm', 'Soft skin, low contrast', 'film', {
    halationStrength: 25,
    halationRadius: 40,
    halationThreshold: 70,
    halationWarmth: 65,
    grainStrength: 20,
    grainSize: 95,
    exposure: 0.1,
    temperature: 16,
    tint: -4,
    lift: 12,
    gamma: 1.05,
    gain: -4,
    contrast: -14,
    saturation: -6,
    vignette: 10,
  }),
  preset('tri-x-mono', 'Tri-X Mono', 'Black and white, coarse', 'film', {
    halationStrength: 30,
    halationRadius: 45,
    halationThreshold: 60,
    grainStrength: 62,
    grainSize: 130,
    lift: 6,
    gamma: 0.95,
    gain: 6,
    contrast: 26,
    saturation: -100,
    vignette: 22,
  }),

  preset('cold-steel', 'Cold Steel', 'Tenet, Dunkirk', 'cinematic', {
    halationStrength: 18,
    halationRadius: 50,
    halationThreshold: 72,
    halationWarmth: 20,
    grainStrength: 14,
    exposure: -0.1,
    temperature: -30,
    tint: -10,
    lift: 14,
    gain: -6,
    contrast: 10,
    saturation: -34,
    vignette: 14,
  }),
  preset('amber-field', 'Amber Field', 'Interstellar', 'cinematic', {
    halationStrength: 40,
    halationRadius: 55,
    halationThreshold: 62,
    halationWarmth: 75,
    grainStrength: 22,
    grainSize: 105,
    exposure: 0.08,
    temperature: 34,
    tint: 4,
    lift: 10,
    gamma: 1.02,
    contrast: 6,
    saturation: -12,
    vignette: 16,
  }),
  preset('fission', 'Fission', 'Oppenheimer', 'cinematic', {
    halationStrength: 46,
    halationRadius: 48,
    halationThreshold: 58,
    halationWarmth: 62,
    grainStrength: 36,
    grainSize: 120,
    temperature: 22,
    tint: 8,
    lift: 16,
    gamma: 1.06,
    gain: -6,
    contrast: 16,
    saturation: -20,
    vignette: 20,
  }),

  preset('heavy-grain', 'Heavy Grain', 'Texture only', 'texture', {
    grainStrength: 78,
    grainSize: 145,
  }),
  preset('soft-bloom', 'Soft Bloom', 'Halo only', 'texture', {
    halationStrength: 110,
    halationRadius: 72,
    halationThreshold: 48,
    halationWarmth: 55,
  }),
];

export function findPreset(id: string | null): Preset | null {
  return PRESETS.find((p) => p.id === id) ?? null;
}

/** True when every parameter still matches the preset that was applied. Used to
 *  tell the user their edits have taken the look away from the preset, rather
 *  than leaving a preset highlighted that no longer describes the image. */
export function matchesPreset(params: Params, preset: Preset): boolean {
  return PARAM_SPECS.every((spec) => params[spec.key] === preset.params[spec.key]);
}
