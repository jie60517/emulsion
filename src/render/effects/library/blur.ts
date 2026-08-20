import { applyCommon, makeMaterial, simpleEffect } from '../engine';
import type { EffectDef, EffectParamSpec } from '../types';
import { PYRAMID_SAMPLERS, addPyramidUniforms, createPyramid } from './blurKit';

const pct = (v: number) => `${Math.round(v)}`;
const deg = (v: number) => `${Math.round(v)}°`;

const RADIUS: EffectParamSpec = {
  key: 'radius',
  label: 'Radius',
  min: 0,
  max: 100,
  step: 1,
  neutral: 0,
  format: pct,
};

/** Builds an effect that needs the shared blur pyramid: the boilerplate of
 *  building it, binding it and drawing once lives here rather than in each. */
function pyramidEffect(config: {
  id: string;
  name: string;
  category: EffectDef['category'];
  params: EffectParamSpec[];
  fragment: string;
  /** Which parameter drives how far up the pyramid to read. */
  radiusKey?: string;
  isIdentity: (values: Record<string, number>) => boolean;
  /** Fed the untouched photograph instead of the chain so far. */
  fromSource?: boolean;
}): EffectDef {
  return {
    id: config.id,
    name: config.name,
    category: config.category,
    params: config.params,
    isIdentity: config.isIdentity,
    create() {
      const pyramid = createPyramid();
      const material = makeMaterial(PYRAMID_SAMPLERS + config.fragment, config.params);
      addPyramidUniforms(material);

      return {
        render(ctx, values) {
          const input = config.fromSource ? ctx.source : ctx.input;
          const levels = pyramid.build(ctx, input, config.id);
          applyCommon(material, ctx, values, config.params);
          pyramid.bind(material, levels, (values[config.radiusKey ?? 'radius'] ?? 0) / 100);
          ctx.blit(material, ctx.output);
        },
        dispose() {
          pyramid.dispose();
          material.dispose();
        },
      };
    },
  };
}

export const blur: EffectDef = pyramidEffect({
  id: 'blur',
  name: 'Blur',
  category: 'blur',
  params: [RADIUS],
  isIdentity: (values) => (values.radius ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uRadius;
void main() {
  gl_FragColor = vec4(clamp(sampleBlurred(vScreen), 0.0, 1.0), 1.0);
}
`,
});

export const bloom: EffectDef = pyramidEffect({
  id: 'bloom',
  name: 'Bloom',
  category: 'blur',
  params: [
    { key: 'amount', label: 'Amount', min: 0, max: 150, step: 1, neutral: 0, format: pct },
    { key: 'radius', label: 'Radius', min: 0, max: 100, step: 1, neutral: 55, format: pct },
    { key: 'threshold', label: 'Threshold', min: 0, max: 100, step: 1, neutral: 70, format: pct },
  ],
  isIdentity: (values) => (values.amount ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uAmount;
uniform float uRadius;
uniform float uThreshold;
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  vec3 blurred = sampleBlurred(vScreen);
  // Only what is already brighter than the threshold is allowed to glow, so
  // bloom lifts highlights instead of fogging the whole frame.
  float keep = smoothstep(uThreshold / 100.0 - 0.1, uThreshold / 100.0 + 0.1, luma(blurred));
  vec3 lin = srgbToLinear(col) + srgbToLinear(blurred) * keep * (uAmount / 100.0);
  gl_FragColor = vec4(clamp(linearToSrgb(lin), 0.0, 1.0), 1.0);
}
`,
});

export const tiltShift: EffectDef = pyramidEffect({
  id: 'tilt-shift',
  name: 'Tilt shift',
  category: 'blur',
  params: [
    { key: 'amount', label: 'Amount', min: 0, max: 100, step: 1, neutral: 0, format: pct },
    { key: 'radius', label: 'Radius', min: 0, max: 100, step: 1, neutral: 60, format: pct },
    { key: 'position', label: 'Focus', min: 0, max: 100, step: 1, neutral: 50, format: pct },
    { key: 'width', label: 'Band', min: 1, max: 100, step: 1, neutral: 25, format: pct },
  ],
  isIdentity: (values) => (values.amount ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uAmount;
uniform float uRadius;
uniform float uPosition;
uniform float uWidth;
void main() {
  vec3 sharp = texture2D(uSource, vScreen).rgb;
  vec3 soft = sampleBlurred(vScreen);
  // Distance from the focus band, measured down the picture so the band stays
  // put when the view is zoomed.
  float d = abs(imageUv().y - uPosition / 100.0);
  float band = uWidth / 200.0;
  float blurness = smoothstep(band, band * 2.5, d) * (uAmount / 100.0);
  gl_FragColor = vec4(clamp(mix(sharp, soft, blurness), 0.0, 1.0), 1.0);
}
`,
});

/** Directional and radial blurs read the chain straight, tap by tap: a pyramid
 *  cannot express a smear that runs one way. */
export const motionBlur: EffectDef = simpleEffect({
  id: 'motion-blur',
  name: 'Motion blur',
  category: 'blur',
  params: [
    { key: 'amount', label: 'Length', min: 0, max: 100, step: 1, neutral: 0, format: pct },
    { key: 'angle', label: 'Angle', min: 0, max: 360, step: 1, neutral: 0, format: deg },
  ],
  isIdentity: (values) => (values.amount ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uAmount;
uniform float uAngle;
void main() {
  vec2 dir = vec2(cos(radians(uAngle)), sin(radians(uAngle))) * (uAmount / 100.0) * 0.06;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 17; i++) {
    float t = float(i) / 16.0 - 0.5;
    sum += texture2D(uSource, vScreen + dir * t).rgb;
  }
  gl_FragColor = vec4(sum / 17.0, 1.0);
}
`,
});

export const zoomBlur: EffectDef = simpleEffect({
  id: 'zoom-blur',
  name: 'Zoom blur',
  category: 'blur',
  params: [{ key: 'amount', label: 'Amount', min: 0, max: 100, step: 1, neutral: 0, format: pct }],
  isIdentity: (values) => (values.amount ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uAmount;
void main() {
  vec2 toCentre = vec2(0.5) - vScreen;
  vec3 sum = vec3(0.0);
  for (int i = 0; i < 17; i++) {
    float t = float(i) / 16.0;
    sum += texture2D(uSource, vScreen + toCentre * t * (uAmount / 100.0) * 0.25).rgb;
  }
  gl_FragColor = vec4(sum / 17.0, 1.0);
}
`,
});

export const starGlow: EffectDef = simpleEffect({
  id: 'star-glow',
  name: 'Star glow',
  category: 'blur',
  params: [
    { key: 'amount', label: 'Amount', min: 0, max: 150, step: 1, neutral: 0, format: pct },
    { key: 'length', label: 'Length', min: 1, max: 100, step: 1, neutral: 40, format: pct },
    { key: 'points', label: 'Points', min: 2, max: 8, step: 1, neutral: 4, format: (v) => `${Math.round(v)}` },
    { key: 'threshold', label: 'Threshold', min: 0, max: 100, step: 1, neutral: 75, format: pct },
  ],
  isIdentity: (values) => (values.amount ?? 0) <= 0,
  fragment: /* glsl */ `
uniform float uAmount;
uniform float uLength;
uniform float uPoints;
uniform float uThreshold;
void main() {
  vec3 col = texture2D(uSource, vScreen).rgb;
  float reach = (uLength / 100.0) * 0.12;
  vec3 streak = vec3(0.0);

  // Streaks are cast along evenly spaced axes, gathering only what is already
  // above the threshold, which is what makes the flare come from the lights
  // rather than from everything.
  for (int p = 0; p < 8; p++) {
    if (float(p) >= uPoints) break;
    float a = 3.14159265 * float(p) / uPoints;
    vec2 dir = vec2(cos(a), sin(a));
    for (int i = 1; i < 9; i++) {
      float t = float(i) / 8.0;
      float falloff = 1.0 - t;
      vec3 a0 = texture2D(uSource, vScreen + dir * reach * t).rgb;
      vec3 b0 = texture2D(uSource, vScreen - dir * reach * t).rgb;
      streak += (a0 * step(uThreshold / 100.0, luma(a0)) +
                 b0 * step(uThreshold / 100.0, luma(b0))) * falloff;
    }
  }
  streak /= max(1.0, uPoints * 8.0);
  gl_FragColor = vec4(clamp(col + streak * (uAmount / 100.0), 0.0, 1.0), 1.0);
}
`,
});
