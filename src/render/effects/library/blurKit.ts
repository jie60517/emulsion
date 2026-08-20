import * as THREE from 'three';
import { makeMaterial } from '../engine';
import type { PassContext } from '../types';

export const BLUR_LEVELS = 5;

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

/** Declared once so every effect that samples the pyramid agrees on the names. */
export const PYRAMID_SAMPLERS = /* glsl */ `
uniform sampler2D uBlur0;
uniform sampler2D uBlur1;
uniform sampler2D uBlur2;
uniform sampler2D uBlur3;
uniform sampler2D uBlur4;
uniform float uBlurWeight[${BLUR_LEVELS}];

vec3 sampleBlurred(vec2 uv) {
  vec3 c = texture2D(uBlur0, uv).rgb * uBlurWeight[0];
  c += texture2D(uBlur1, uv).rgb * uBlurWeight[1];
  c += texture2D(uBlur2, uv).rgb * uBlurWeight[2];
  c += texture2D(uBlur3, uv).rgb * uBlurWeight[3];
  c += texture2D(uBlur4, uv).rgb * uBlurWeight[4];
  return c;
}
`;

const SIGMA = 0.95;

/**
 * Gaussian falloff across pyramid levels. Radius 0 sits on the sharpest level,
 * so the weights are what turns a fixed pyramid into a continuous radius.
 */
export function levelWeights(radius01: number): number[] {
  const centre = radius01 * (BLUR_LEVELS - 1);
  const raw: number[] = [];
  let sum = 0;
  for (let i = 0; i < BLUR_LEVELS; i++) {
    const d = i - centre;
    const w = Math.exp(-(d * d) / (2 * SIGMA * SIGMA));
    raw.push(w);
    sum += w;
  }
  return raw.map((w) => w / sum);
}

export type Pyramid = {
  /** Blurs `input` into the pooled scratch targets and returns the levels. */
  build: (ctx: PassContext, input: THREE.Texture, key: string) => THREE.WebGLRenderTarget[];
  /** Points a material's uBlur* samplers and weights at a built pyramid. */
  bind: (
    material: THREE.ShaderMaterial,
    levels: THREE.WebGLRenderTarget[],
    radius01: number,
  ) => void;
  dispose: () => void;
};

/**
 * The blur pyramid, extracted so every effect that needs one shares it: a
 * downsample chain plus a separable gaussian per level, all in pooled scratch
 * targets. Halation keeps its own copy — it weights the levels separately per
 * colour channel, which is the whole point of it and not something a generic
 * blur should carry.
 */
export function createPyramid(): Pyramid {
  const downMat = makeMaterial(DOWNSAMPLE_FRAG);
  downMat.uniforms.uTexel = { value: new THREE.Vector2() };

  const blurMat = makeMaterial(BLUR_FRAG);
  blurMat.uniforms.uDir = { value: new THREE.Vector2() };

  return {
    build(ctx, input, key) {
      const levels = Array.from({ length: BLUR_LEVELS }, (_, i) =>
        ctx.scratch(
          `${key}${i}`,
          Math.max(2, ctx.width >> (i + 1)),
          Math.max(2, ctx.height >> (i + 1)),
        ),
      );

      downMat.uniforms.uSource.value = input;
      (downMat.uniforms.uTexel.value as THREE.Vector2).set(1 / ctx.width, 1 / ctx.height);
      ctx.blit(downMat, levels[0]);

      for (let i = 1; i < BLUR_LEVELS; i++) {
        const src = levels[i - 1];
        downMat.uniforms.uSource.value = src.texture;
        (downMat.uniforms.uTexel.value as THREE.Vector2).set(1 / src.width, 1 / src.height);
        ctx.blit(downMat, levels[i]);
      }

      for (let i = 0; i < BLUR_LEVELS; i++) {
        const level = levels[i];
        const tmp = ctx.scratch(`${key}tmp${i}`, level.width, level.height);
        blurMat.uniforms.uSource.value = level.texture;
        (blurMat.uniforms.uDir.value as THREE.Vector2).set(1 / level.width, 0);
        ctx.blit(blurMat, tmp);

        blurMat.uniforms.uSource.value = tmp.texture;
        (blurMat.uniforms.uDir.value as THREE.Vector2).set(0, 1 / level.height);
        ctx.blit(blurMat, level);
      }

      return levels;
    },

    bind(material, levels, radius01) {
      const weights = levelWeights(radius01);
      for (let i = 0; i < BLUR_LEVELS; i++) {
        material.uniforms[`uBlur${i}`].value = levels[i].texture;
      }
      material.uniforms.uBlurWeight.value = weights;
    },

    dispose() {
      downMat.dispose();
      blurMat.dispose();
    },
  };
}

/** Adds the sampler/weight uniforms a pyramid-consuming material needs. */
export function addPyramidUniforms(material: THREE.ShaderMaterial) {
  for (let i = 0; i < BLUR_LEVELS; i++) material.uniforms[`uBlur${i}`] = { value: null };
  material.uniforms.uBlurWeight = { value: new Array(BLUR_LEVELS).fill(0) };
}
