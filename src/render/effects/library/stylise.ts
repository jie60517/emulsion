import { simpleEffect } from '../engine';
import type { EffectDef } from '../types';

const pct = (v: number) => `${Math.round(v)}`;
const deg = (v: number) => `${Math.round(v)}°`;

/**
 * Cell-based effects size their cells against the image rather than the
 * framebuffer, so a halftone screen or a pixel grid stays put when the preview
 * is downscaled and comes out of a 4K export at the same relative size.
 */
const CELLS = /* glsl */ `
vec2 cellGrid(float cells) {
  return imageUv() * uAspect * cells;
}
`;

export const posterize: EffectDef = simpleEffect({
  id: 'posterize',
  name: 'Posterize',
  category: 'stylise',
  params: [
    { key: 'levels', label: 'Levels', min: 2, max: 32, step: 1, neutral: 32, format: (v) => `${Math.round(v)}` },
  ],
  isIdentity: (values) => (values.levels ?? 32) >= 32,
  fragment: /* glsl */ `
uniform float uLevels;
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  gl_FragColor = vec4(floor(col * uLevels + 0.5) / uLevels, 1.0);
}
`,
});

export const threshold: EffectDef = simpleEffect({
  id: 'threshold',
  name: 'Threshold',
  category: 'stylise',
  params: [
    { key: 'amount', label: 'Amount', min: 0, max: 100, step: 1, neutral: 0, format: pct },
    { key: 'level', label: 'Level', min: 0, max: 100, step: 1, neutral: 50, format: pct },
    { key: 'softness', label: 'Softness', min: 0, max: 100, step: 1, neutral: 8, format: pct },
  ],
  isIdentity: (values) => (values.amount ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uAmount;
uniform float uLevel;
uniform float uSoftness;
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  float l = luma(col);
  float edge = uLevel / 100.0;
  float soft = max(0.001, uSoftness / 100.0);
  float bw = smoothstep(edge - soft, edge + soft, l);
  gl_FragColor = vec4(mix(col, vec3(bw), uAmount / 100.0), 1.0);
}
`,
});

export const halftone: EffectDef = simpleEffect({
  id: 'halftone',
  name: 'Halftone',
  category: 'stylise',
  params: [
    { key: 'amount', label: 'Amount', min: 0, max: 100, step: 1, neutral: 0, format: pct },
    { key: 'cells', label: 'Frequency', min: 20, max: 400, step: 1, neutral: 120, format: (v) => `${Math.round(v)}` },
    { key: 'angle', label: 'Screen angle', min: 0, max: 90, step: 1, neutral: 45, format: deg },
  ],
  isIdentity: (values) => (values.amount ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uAmount;
uniform float uCells;
uniform float uAngle;
${CELLS}
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  float l = luma(col);

  float a = radians(uAngle);
  mat2 rot = mat2(cos(a), -sin(a), sin(a), cos(a));
  vec2 grid = rot * cellGrid(uCells);
  vec2 cell = fract(grid) - 0.5;

  // Dot area tracks tone, the way a real screen works: dark tones grow the dot
  // until the cells touch.
  float radius = sqrt(1.0 - l) * 0.72;
  float dot0 = smoothstep(radius, radius - 0.08, length(cell));
  gl_FragColor = vec4(mix(col, vec3(1.0 - dot0), uAmount / 100.0), 1.0);
}
`,
});

export const dither: EffectDef = simpleEffect({
  id: 'dither',
  name: 'Dither',
  category: 'stylise',
  params: [
    { key: 'amount', label: 'Amount', min: 0, max: 100, step: 1, neutral: 0, format: pct },
    { key: 'levels', label: 'Levels', min: 2, max: 16, step: 1, neutral: 3, format: (v) => `${Math.round(v)}` },
    { key: 'cells', label: 'Grid', min: 100, max: 1200, step: 10, neutral: 600, format: (v) => `${Math.round(v)}` },
  ],
  isIdentity: (values) => (values.amount ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uAmount;
uniform float uLevels;
uniform float uCells;
${CELLS}

/** 4x4 Bayer matrix, read without bitwise operators so this stays GLSL ES 1.0. */
float bayer(vec2 cell) {
  vec2 p = floor(mod(cell, 4.0));
  float i = p.y * 4.0 + p.x;
  float m = 0.0;
  if (i < 1.0) m = 0.0;       else if (i < 2.0) m = 8.0;
  else if (i < 3.0) m = 2.0;  else if (i < 4.0) m = 10.0;
  else if (i < 5.0) m = 12.0; else if (i < 6.0) m = 4.0;
  else if (i < 7.0) m = 14.0; else if (i < 8.0) m = 6.0;
  else if (i < 9.0) m = 3.0;  else if (i < 10.0) m = 11.0;
  else if (i < 11.0) m = 1.0; else if (i < 12.0) m = 9.0;
  else if (i < 13.0) m = 15.0;else if (i < 14.0) m = 7.0;
  else if (i < 15.0) m = 13.0;else m = 5.0;
  return (m + 0.5) / 16.0 - 0.5;
}

void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  float steps = max(2.0, uLevels) - 1.0;
  float t = bayer(cellGrid(uCells)) / steps;
  vec3 quantised = floor((col + t) * steps + 0.5) / steps;
  gl_FragColor = vec4(clamp(mix(col, quantised, uAmount / 100.0), 0.0, 1.0), 1.0);
}
`,
});

export const pixelate: EffectDef = simpleEffect({
  id: 'pixelate',
  name: 'Pixelate',
  category: 'stylise',
  params: [
    { key: 'cells', label: 'Resolution', min: 8, max: 400, step: 1, neutral: 400, format: (v) => `${Math.round(v)}` },
  ],
  isIdentity: (values) => (values.cells ?? 400) >= 400,
  fragment: /* glsl */ `
uniform float uCells;
void main() {
  // Snap in the photograph's space, then convert back, so the blocks stay
  // locked to the picture when the view is zoomed rather than to the window.
  vec2 grid = uAspect * uCells;
  vec2 snappedImage = (floor(imageUv() * grid) + 0.5) / grid;
  vec2 back = (snappedImage - uViewOffset) / uViewScale;
  gl_FragColor = vec4(texture2D(uSource, vec2(back.x, 1.0 - back.y)).rgb, 1.0);
}
`,
});

export const emboss: EffectDef = simpleEffect({
  id: 'emboss',
  name: 'Emboss',
  category: 'stylise',
  params: [
    { key: 'amount', label: 'Amount', min: 0, max: 100, step: 1, neutral: 0, format: pct },
    { key: 'angle', label: 'Light angle', min: 0, max: 360, step: 1, neutral: 135, format: deg },
  ],
  isIdentity: (values) => (values.amount ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uAmount;
uniform float uAngle;
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  vec2 step0 = vec2(cos(radians(uAngle)), sin(radians(uAngle))) * uTexelSize;
  float a = luma(texture2D(uSource, vScreen + step0).rgb);
  float b = luma(texture2D(uSource, vScreen - step0).rgb);
  vec3 relief = vec3(0.5 + (a - b) * 4.0);
  gl_FragColor = vec4(clamp(mix(col, relief, uAmount / 100.0), 0.0, 1.0), 1.0);
}
`,
});

export const sharpen: EffectDef = simpleEffect({
  id: 'sharpen',
  name: 'Sharpen',
  category: 'stylise',
  params: [{ key: 'amount', label: 'Amount', min: 0, max: 200, step: 1, neutral: 0, format: pct }],
  isIdentity: (values) => (values.amount ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uAmount;
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  vec3 blur = (
    texture2D(uSource, vScreen + vec2(uTexelSize.x, 0.0)).rgb +
    texture2D(uSource, vScreen - vec2(uTexelSize.x, 0.0)).rgb +
    texture2D(uSource, vScreen + vec2(0.0, uTexelSize.y)).rgb +
    texture2D(uSource, vScreen - vec2(0.0, uTexelSize.y)).rgb
  ) * 0.25;
  // Unsharp mask: add back what a blur threw away.
  gl_FragColor = vec4(clamp(col + (col - blur) * (uAmount / 100.0), 0.0, 1.0), 1.0);
}
`,
});

export const scanlines: EffectDef = simpleEffect({
  id: 'scanlines',
  name: 'Scanlines',
  category: 'retro',
  params: [
    { key: 'amount', label: 'Amount', min: 0, max: 100, step: 1, neutral: 0, format: pct },
    { key: 'lines', label: 'Lines', min: 60, max: 1200, step: 10, neutral: 480, format: (v) => `${Math.round(v)}` },
  ],
  isIdentity: (values) => (values.amount ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uAmount;
uniform float uLines;
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  // Counted down the picture, so the line count means the same thing at any
  // export size.
  float band = 0.5 + 0.5 * cos(imageUv().y * uLines * 6.28318);
  gl_FragColor = vec4(col * (1.0 - (uAmount / 100.0) * 0.65 * band), 1.0);
}
`,
});
