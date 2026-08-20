import { simpleEffect } from '../engine';
import type { EffectDef, EffectParamSpec } from '../types';

const pct = (v: number) => `${Math.round(v)}`;
const deg = (v: number) => `${Math.round(v)}°`;

const amount = (label = 'Amount'): EffectParamSpec => ({
  key: 'amount',
  label,
  min: 0,
  max: 100,
  step: 1,
  neutral: 0,
  format: pct,
});

/** Hue in degrees to RGB at full saturation and value. Shared by the effects
 *  that let the user pick a colour with a single slider. */
const HUE_TO_RGB = /* glsl */ `
vec3 hueToRgb(float degrees) {
  float h = mod(degrees, 360.0) / 60.0;
  float x = 1.0 - abs(mod(h, 2.0) - 1.0);
  if (h < 1.0) return vec3(1.0, x, 0.0);
  if (h < 2.0) return vec3(x, 1.0, 0.0);
  if (h < 3.0) return vec3(0.0, 1.0, x);
  if (h < 4.0) return vec3(0.0, x, 1.0);
  if (h < 5.0) return vec3(x, 0.0, 1.0);
  return vec3(1.0, 0.0, x);
}
`;

export const sepia: EffectDef = simpleEffect({
  id: 'sepia',
  name: 'Sepia',
  category: 'colour',
  params: [amount()],
  fragment: /* glsl */ `
uniform float uAmount;
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  // The classic photographic sepia matrix, not a brown tint over grey.
  vec3 toned = vec3(
    dot(col, vec3(0.393, 0.769, 0.189)),
    dot(col, vec3(0.349, 0.686, 0.168)),
    dot(col, vec3(0.272, 0.534, 0.131))
  );
  gl_FragColor = vec4(clamp(mix(col, toned, uAmount / 100.0), 0.0, 1.0), 1.0);
}
`,
});

export const duotone: EffectDef = simpleEffect({
  id: 'duotone',
  name: 'Duotone',
  category: 'colour',
  params: [
    amount(),
    { key: 'shadow', label: 'Shadow hue', min: 0, max: 360, step: 1, neutral: 220, format: deg },
    { key: 'highlight', label: 'Highlight hue', min: 0, max: 360, step: 1, neutral: 40, format: deg },
  ],
  isIdentity: (values) => (values.amount ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uAmount;
uniform float uShadow;
uniform float uHighlight;
${HUE_TO_RGB}
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  // Map luminance across the two hues, keeping the ends from clipping to pure
  // primaries so the result still reads as a photograph.
  float l = luma(col);
  vec3 mapped = mix(hueToRgb(uShadow) * 0.45, mix(hueToRgb(uHighlight), vec3(1.0), 0.25), l);
  gl_FragColor = vec4(clamp(mix(col, mapped, uAmount / 100.0), 0.0, 1.0), 1.0);
}
`,
});

export const hueShift: EffectDef = simpleEffect({
  id: 'hue-shift',
  name: 'Hue shift',
  category: 'colour',
  params: [{ key: 'angle', label: 'Hue', min: -180, max: 180, step: 1, neutral: 0, format: deg }],
  fragment: /* glsl */ `
uniform float uAngle;
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  float a = radians(uAngle);
  float c = cos(a);
  float s = sin(a);
  // Rotation about the luminance axis in YIQ, which leaves greys grey.
  float y = dot(col, vec3(0.299, 0.587, 0.114));
  float i = dot(col, vec3(0.596, -0.274, -0.322));
  float q = dot(col, vec3(0.211, -0.523, 0.312));
  float i2 = i * c - q * s;
  float q2 = i * s + q * c;
  vec3 outCol = vec3(
    y + 0.956 * i2 + 0.621 * q2,
    y - 0.272 * i2 - 0.647 * q2,
    y - 1.106 * i2 + 1.703 * q2
  );
  gl_FragColor = vec4(clamp(outCol, 0.0, 1.0), 1.0);
}
`,
});

export const rgbShift: EffectDef = simpleEffect({
  id: 'rgb-shift',
  name: 'RGB shift',
  category: 'colour',
  params: [
    { key: 'amount', label: 'Shift', min: 0, max: 100, step: 1, neutral: 0, format: pct },
    { key: 'angle', label: 'Angle', min: 0, max: 360, step: 1, neutral: 0, format: deg },
  ],
  isIdentity: (values) => (values.amount ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uAmount;
uniform float uAngle;
void main() {
  // Offset in image proportion rather than pixels, so the split stays the same
  // size whether this is a downscaled preview or a full-resolution export.
  vec2 dir = vec2(cos(radians(uAngle)), sin(radians(uAngle))) * (uAmount / 100.0) * 0.02;
  float r = texture2D(uSource, vScreen + dir).r;
  float g = texture2D(uSource, vScreen).g;
  float b = texture2D(uSource, vScreen - dir).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}
`,
});

export const thermal: EffectDef = simpleEffect({
  id: 'thermal',
  name: 'Thermal',
  category: 'colour',
  params: [amount()],
  fragment: /* glsl */ `
uniform float uAmount;
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  float l = luma(col);
  // Black through blue, magenta and orange to white — the usual thermal ramp.
  vec3 ramp = clamp(vec3(
    smoothstep(0.25, 0.75, l) + smoothstep(0.85, 1.0, l),
    smoothstep(0.55, 1.0, l),
    smoothstep(0.0, 0.35, l) - smoothstep(0.45, 0.85, l) + smoothstep(0.9, 1.0, l)
  ), 0.0, 1.0);
  gl_FragColor = vec4(clamp(mix(col, ramp, uAmount / 100.0), 0.0, 1.0), 1.0);
}
`,
});

export const cyanotype: EffectDef = simpleEffect({
  id: 'cyanotype',
  name: 'Cyanotype',
  category: 'colour',
  params: [amount()],
  fragment: /* glsl */ `
uniform float uAmount;
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  float l = luma(col);
  // Prussian blue in the shadows lifting to a paper white, as the process does.
  vec3 blue = mix(vec3(0.02, 0.09, 0.22), vec3(0.86, 0.93, 0.96), pow(l, 0.85));
  gl_FragColor = vec4(clamp(mix(col, blue, uAmount / 100.0), 0.0, 1.0), 1.0);
}
`,
});

export const invert: EffectDef = simpleEffect({
  id: 'invert',
  name: 'Invert',
  category: 'colour',
  params: [amount()],
  fragment: /* glsl */ `
uniform float uAmount;
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  gl_FragColor = vec4(mix(col, 1.0 - col, uAmount / 100.0), 1.0);
}
`,
});
