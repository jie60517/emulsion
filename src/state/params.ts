export type Params = {
  halationStrength: number;
  halationRadius: number;
  halationThreshold: number;
  halationWarmth: number;

  grainStrength: number;
  grainSize: number;

  exposure: number;
  temperature: number;
  tint: number;

  lift: number;
  gamma: number;
  gain: number;

  contrast: number;
  saturation: number;
  vignette: number;
};

export type ParamKey = keyof Params;

export type ParamSpec = {
  key: ParamKey;
  label: string;
  group: 'halation' | 'grain' | 'colour' | 'tone';
  min: number;
  max: number;
  step: number;
  /** Value at which this parameter is a no-op. */
  neutral: number;
  format: (v: number) => string;
};

const pct = (v: number) => `${Math.round(v)}`;
const signedPct = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;
const ev = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV`;
const kelvin = (v: number) => (v === 0 ? '0 K' : `${v > 0 ? '+' : '\u2212'}${Math.abs(Math.round(v * 20))} K`);
const ratio = (v: number) => v.toFixed(2);

export const PARAM_SPECS: ParamSpec[] = [
  { key: 'halationStrength', label: 'Halation', group: 'halation', min: 0, max: 150, step: 1, neutral: 0, format: pct },
  { key: 'halationRadius', label: 'Bloom radius', group: 'halation', min: 0, max: 100, step: 1, neutral: 45, format: pct },
  { key: 'halationThreshold', label: 'Threshold', group: 'halation', min: 0, max: 100, step: 1, neutral: 62, format: pct },
  { key: 'halationWarmth', label: 'Warmth', group: 'halation', min: 0, max: 100, step: 1, neutral: 40, format: pct },

  { key: 'grainStrength', label: 'Grain', group: 'grain', min: 0, max: 100, step: 1, neutral: 0, format: pct },
  { key: 'grainSize', label: 'Grain size', group: 'grain', min: 25, max: 250, step: 1, neutral: 100, format: (v) => `${(v / 100).toFixed(2)}\u00d7` },

  { key: 'exposure', label: 'Exposure', group: 'colour', min: -2, max: 2, step: 0.01, neutral: 0, format: ev },
  { key: 'temperature', label: 'Temperature', group: 'colour', min: -100, max: 100, step: 1, neutral: 0, format: kelvin },
  { key: 'tint', label: 'Tint', group: 'colour', min: -100, max: 100, step: 1, neutral: 0, format: signedPct },
  { key: 'saturation', label: 'Saturation', group: 'colour', min: -100, max: 100, step: 1, neutral: 0, format: signedPct },

  { key: 'lift', label: 'Lift', group: 'tone', min: -100, max: 100, step: 1, neutral: 0, format: signedPct },
  { key: 'gamma', label: 'Gamma', group: 'tone', min: 0.4, max: 2.5, step: 0.01, neutral: 1, format: ratio },
  { key: 'gain', label: 'Gain', group: 'tone', min: -100, max: 100, step: 1, neutral: 0, format: signedPct },
  { key: 'contrast', label: 'Contrast', group: 'tone', min: -100, max: 100, step: 1, neutral: 0, format: signedPct },
  { key: 'vignette', label: 'Vignette', group: 'tone', min: 0, max: 100, step: 1, neutral: 0, format: pct },
];

export const GROUP_LABELS: Record<ParamSpec['group'], string> = {
  halation: 'Halation',
  grain: 'Grain',
  colour: 'Colour',
  tone: 'Tone',
};

export const DEFAULT_PARAMS: Params = PARAM_SPECS.reduce((acc, spec) => {
  acc[spec.key] = spec.neutral;
  return acc;
}, {} as Params);

export function clampParams(input: Partial<Params>): Params {
  const out = { ...DEFAULT_PARAMS };
  for (const spec of PARAM_SPECS) {
    const v = input[spec.key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[spec.key] = Math.min(spec.max, Math.max(spec.min, v));
    }
  }
  return out;
}
