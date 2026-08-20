import { simpleEffect } from '../engine';
import type { EffectDef } from '../types';

const signed = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;
const plain = (v: number) => `${Math.round(v)}`;

/**
 * Exposure and white balance happen in linear light, where they mean something
 * physical; lift/gamma/gain, contrast and saturation happen after the encode,
 * which is where those controls are actually defined.
 */
export const grade: EffectDef = simpleEffect({
  id: 'grade',
  name: 'Grade',
  category: 'colour',
  params: [
    {
      key: 'exposure',
      label: 'Exposure',
      min: -2,
      max: 2,
      step: 0.01,
      neutral: 0,
      format: (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV`,
    },
    {
      key: 'temperature',
      label: 'Temperature',
      min: -100,
      max: 100,
      step: 1,
      neutral: 0,
      format: (v) => (v === 0 ? '0 K' : `${v > 0 ? '+' : '−'}${Math.abs(Math.round(v * 20))} K`),
    },
    { key: 'tint', label: 'Tint', min: -100, max: 100, step: 1, neutral: 0, format: signed },
    { key: 'saturation', label: 'Saturation', min: -100, max: 100, step: 1, neutral: 0, format: signed },
    { key: 'lift', label: 'Lift', min: -100, max: 100, step: 1, neutral: 0, format: signed },
    { key: 'gamma', label: 'Gamma', min: 0.4, max: 2.5, step: 0.01, neutral: 1, format: (v) => v.toFixed(2) },
    { key: 'gain', label: 'Gain', min: -100, max: 100, step: 1, neutral: 0, format: signed },
    { key: 'contrast', label: 'Contrast', min: -100, max: 100, step: 1, neutral: 0, format: signed },
  ],
  fragment: /* glsl */ `
uniform float uExposure;
uniform float uTemperature;
uniform float uTint;
uniform float uSaturation;
uniform float uLift;
uniform float uGamma;
uniform float uGain;
uniform float uContrast;

void main() {
  vec3 lin = srgbToLinear(texture2D(uSource, vScreen).rgb);

  float t = uTemperature / 100.0;
  float m = uTint / 100.0;
  vec3 wb = vec3(1.0 + 0.26 * t, 1.0 - 0.16 * m, 1.0 - 0.26 * t);
  // Normalised so white balance cannot double as an exposure control.
  wb /= dot(wb, vec3(0.2126, 0.7152, 0.0722));
  lin *= exp2(uExposure) * wb;

  vec3 col = linearToSrgb(lin);

  float lift = (uLift / 100.0) * 0.25;
  float gain = (uGain / 100.0) * 0.4;
  col = clamp(col * (1.0 + gain - lift) + lift, 0.0, 1.0);
  col = pow(col, vec3(1.0 / uGamma));

  float contrast = uContrast / 100.0;
  if (contrast > 0.0) {
    col = mix(col, smoothstep(0.0, 1.0, col), contrast);
  } else {
    col = mix(col, col * 0.5 + 0.25, -contrast);
  }

  col = clamp(mix(vec3(luma(col)), col, 1.0 + uSaturation / 100.0), 0.0, 1.0);
  gl_FragColor = vec4(col, 1.0);
}
`,
});

/**
 * Grain coordinates come from the image rather than the screen, so a given size
 * covers the same fraction of the frame whether the preview is downscaled or a
 * 4K export is being written — what you tune is what you get.
 */
export const grain: EffectDef = simpleEffect({
  id: 'grain',
  name: 'Grain',
  category: 'film',
  params: [
    { key: 'strength', label: 'Grain', min: 0, max: 100, step: 1, neutral: 0, format: plain },
    {
      key: 'size',
      label: 'Grain size',
      min: 25,
      max: 250,
      step: 1,
      neutral: 100,
      format: (v) => `${(v / 100).toFixed(2)}×`,
    },
  ],
  isIdentity: (values) => (values.strength ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uStrength;
uniform float uSize;
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  vec2 gp = imageUv() * uAspect * (90000.0 / uSize) + uSeed;
  float n = vnoise(gp) * 0.65 + vnoise(gp * 2.137 + 17.31) * 0.35;
  // Real film shows its grain in the midtones and shadows; a flat overlay reads
  // as digital noise in the highlights.
  float l = luma(col);
  float w = pow(1.0 - l, 1.35) * (0.35 + 0.65 * smoothstep(0.0, 0.18, l));
  col += (n - 0.5) * (uStrength / 100.0) * 0.34 * w;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
});

export const vignette: EffectDef = simpleEffect({
  id: 'vignette',
  name: 'Vignette',
  category: 'colour',
  params: [{ key: 'amount', label: 'Vignette', min: 0, max: 100, step: 1, neutral: 0, format: plain }],
  isIdentity: (values) => (values.amount ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uAmount;
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  vec2 q = (imageUv() - 0.5) * uAspect;
  float falloff = smoothstep(0.30, 0.95, length(q) / max(uAspect.x, uAspect.y));
  col *= 1.0 - (uAmount / 100.0) * 0.85 * falloff;
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
});
