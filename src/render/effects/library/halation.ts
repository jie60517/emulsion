import * as THREE from 'three';
import { makeMaterial } from '../engine';
import type { EffectDef, EffectParamSpec } from '../types';

const LEVELS = 5;

/** Per-channel diffusion multipliers. Red scatters furthest through the
 *  emulsion, blue barely at all — this ratio is what makes the halo read
 *  white → orange → red rather than a flat red fog, and it is the one thing
 *  here that no tint slider can imitate. */
const CHANNEL_SPREAD = [1.0, 0.6, 0.32];
const SPREAD_SIGMA = 0.95;

const PARAMS: EffectParamSpec[] = [
  { key: 'strength', label: 'Halation', min: 0, max: 150, step: 1, neutral: 0 },
  { key: 'radius', label: 'Bloom radius', min: 0, max: 100, step: 1, neutral: 45 },
  { key: 'threshold', label: 'Threshold', min: 0, max: 100, step: 1, neutral: 62 },
  { key: 'warmth', label: 'Warmth', min: 0, max: 100, step: 1, neutral: 40 },
];

/** Highlight extraction, in linear light: blurring gamma-encoded values spreads
 *  the wrong amount of energy and turns bloom into grey mud. Reads the
 *  photograph directly rather than the chain, so the halo stays anchored to the
 *  picture no matter what precedes it or how far in the view is zoomed. */
const THRESHOLD_FRAG = /* glsl */ `
uniform float uThresholdLinear;
uniform float uKnee;
void main() {
  vec3 lin = srgbToLinear(texture2D(uSource, vUv).rgb);
  float w = smoothstep(uThresholdLinear - uKnee, uThresholdLinear + uKnee, luma(lin));
  gl_FragColor = vec4(lin * w, 1.0);
}
`;

const DOWNSAMPLE_FRAG = /* glsl */ `
uniform vec2 uTexel;
void main() {
  vec3 s = texture2D(uSource, vScreen + uTexel * vec2(-1.0, -1.0)).rgb;
  s += texture2D(uSource, vScreen + uTexel * vec2(1.0, -1.0)).rgb;
  s += texture2D(uSource, vScreen + uTexel * vec2(-1.0, 1.0)).rgb;
  s += texture2D(uSource, vScreen + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(s * 0.25, 1.0);
}
`;

const BLUR_FRAG = /* glsl */ `
uniform vec2 uDir;
void main() {
  vec3 s = texture2D(uSource, vScreen).rgb * 0.227027;
  s += texture2D(uSource, vScreen + uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(uSource, vScreen - uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(uSource, vScreen + uDir * 3.2307692308).rgb * 0.0702702703;
  s += texture2D(uSource, vScreen - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}
`;

/** On real film the reflection re-exposes the emulsion, so the halo is added in
 *  linear light as part of the capture rather than blended over the top. */
const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D uHalo0;
uniform sampler2D uHalo1;
uniform sampler2D uHalo2;
uniform sampler2D uHalo3;
uniform sampler2D uHalo4;
uniform vec3 uWeight[${LEVELS}];
uniform vec3 uTint;
uniform float uAmount;

/**
 * Film has a shoulder. Light added by the halo should compress towards white
 * rather than stop dead at it, which is why film keeps detail in a bright sky
 * where a sensor gives back a flat sheet of paper.
 */
vec3 shoulder(vec3 x) {
  const float knee = 0.8;
  vec3 over = max(x - knee, vec3(0.0));
  vec3 compressed = knee + (1.0 - knee) * (1.0 - exp(-over / (1.0 - knee)));
  return mix(x, compressed, step(vec3(knee), x));
}

void main() {
  // The pyramid was written by a pass that sampled the photograph, so its rows
  // run bottom-up in framebuffer order while imageUv() runs top-down. Read it
  // at the same image point the chain's head sampled, with that flip undone.
  vec2 iuv = imageUv();
  vec2 uv = vec2(iuv.x, 1.0 - iuv.y);
  vec3 halo = texture2D(uHalo0, uv).rgb * uWeight[0];
  halo += texture2D(uHalo1, uv).rgb * uWeight[1];
  halo += texture2D(uHalo2, uv).rgb * uWeight[2];
  halo += texture2D(uHalo3, uv).rgb * uWeight[3];
  halo += texture2D(uHalo4, uv).rgb * uWeight[4];

  vec3 added = halo * uTint * uAmount;
  vec3 sum = srgbToLinear(texture2D(uSource, vScreen).rgb) + added;
  // Weighted by how much light the halo actually contributed, so a pixel the
  // halo never reached comes through untouched.
  float w = clamp(luma(added) * 4.0, 0.0, 1.0);
  gl_FragColor = vec4(linearToSrgb(mix(sum, shoulder(sum), w)), 1.0);
}
`;

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Gaussian falloff across pyramid levels, computed separately per channel. */
function haloWeights(radius01: number): THREE.Vector3[] {
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

export const halation: EffectDef = {
  id: 'halation',
  name: 'Halation',
  category: 'film',
  params: PARAMS,
  isIdentity: (values) => (values.strength ?? 0) <= 0,
  create() {
    const thresholdMat = makeMaterial(THRESHOLD_FRAG);
    thresholdMat.uniforms.uThresholdLinear = { value: 0.5 };
    thresholdMat.uniforms.uKnee = { value: 0.1 };

    const downMat = makeMaterial(DOWNSAMPLE_FRAG);
    downMat.uniforms.uTexel = { value: new THREE.Vector2() };

    const blurMat = makeMaterial(BLUR_FRAG);
    blurMat.uniforms.uDir = { value: new THREE.Vector2() };

    const compositeMat = makeMaterial(COMPOSITE_FRAG);
    compositeMat.uniforms.uWeight = {
      value: Array.from({ length: LEVELS }, () => new THREE.Vector3()),
    };
    compositeMat.uniforms.uTint = { value: new THREE.Vector3(1, 0.4, 0.32) };
    compositeMat.uniforms.uAmount = { value: 0 };
    for (let i = 0; i < LEVELS; i++) compositeMat.uniforms[`uHalo${i}`] = { value: null };

    return {
      render(ctx, values) {
        const thresholdLinear = srgbToLinear((values.threshold ?? 62) / 100);
        thresholdMat.uniforms.uSource.value = ctx.source;
        thresholdMat.uniforms.uThresholdLinear.value = thresholdLinear;
        thresholdMat.uniforms.uKnee.value = Math.max(0.02, thresholdLinear * 0.55);

        const levels = Array.from({ length: LEVELS }, (_, i) =>
          ctx.scratch(
            `halo${i}`,
            Math.max(2, ctx.width >> (i + 1)),
            Math.max(2, ctx.height >> (i + 1)),
          ),
        );
        ctx.blit(thresholdMat, levels[0]);

        for (let i = 1; i < LEVELS; i++) {
          const src = levels[i - 1];
          downMat.uniforms.uSource.value = src.texture;
          (downMat.uniforms.uTexel.value as THREE.Vector2).set(1 / src.width, 1 / src.height);
          ctx.blit(downMat, levels[i]);
        }

        for (let i = 0; i < LEVELS; i++) {
          const level = levels[i];
          const tmp = ctx.scratch(`haloTmp${i}`, level.width, level.height);
          blurMat.uniforms.uSource.value = level.texture;
          (blurMat.uniforms.uDir.value as THREE.Vector2).set(1 / level.width, 0);
          ctx.blit(blurMat, tmp);

          blurMat.uniforms.uSource.value = tmp.texture;
          (blurMat.uniforms.uDir.value as THREE.Vector2).set(0, 1 / level.height);
          ctx.blit(blurMat, level);
        }

        const weights = haloWeights((values.radius ?? 45) / 100);
        const dst = compositeMat.uniforms.uWeight.value as THREE.Vector3[];
        for (let i = 0; i < LEVELS; i++) {
          dst[i].copy(weights[i]);
          compositeMat.uniforms[`uHalo${i}`].value = levels[i].texture;
        }

        const warmth = (values.warmth ?? 40) / 100;
        (compositeMat.uniforms.uTint.value as THREE.Vector3).set(
          1.0,
          0.24 + 0.34 * warmth,
          0.44 - 0.22 * warmth,
        );
        compositeMat.uniforms.uAmount.value = (values.strength ?? 0) / 100;

        compositeMat.uniforms.uSource.value = ctx.input;
        (compositeMat.uniforms.uViewScale.value as THREE.Vector2).set(ctx.view.scale, ctx.view.scale);
        (compositeMat.uniforms.uViewOffset.value as THREE.Vector2).set(
          ctx.view.offsetX,
          ctx.view.offsetY,
        );
        ctx.blit(compositeMat, ctx.output);
      },
      dispose() {
        thresholdMat.dispose();
        downMat.dispose();
        blurMat.dispose();
        compositeMat.dispose();
      },
    };
  },
};
