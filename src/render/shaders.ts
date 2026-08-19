/**
 * Source textures come from ImageBitmap decoded with EXIF orientation applied,
 * which rules out relying on `flipY` — so the V axis is inverted here instead,
 * once, for every pass.
 */
export const VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = vec2(uv.x, 1.0 - uv.y);
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const COLOR_HELPERS = /* glsl */ `
vec3 srgbToLinear(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
vec3 linearToSrgb(vec3 c) {
  c = max(c, vec3(0.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
`;

/**
 * Highlight extraction. Runs in linear light: the source is decoded from sRGB
 * first, because a blur of gamma-encoded values spreads the wrong amount of
 * energy and turns bloom into grey mud.
 */
export const THRESHOLD_FRAG = /* glsl */ `
uniform sampler2D uSource;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
${COLOR_HELPERS}
void main() {
  vec3 lin = srgbToLinear(texture2D(uSource, vUv).rgb);
  float l = luma(lin);
  float w = smoothstep(uThreshold - uKnee, uThreshold + uKnee, l);
  gl_FragColor = vec4(lin * w, 1.0);
}
`;

/** Half-resolution downsample with a 4-tap tent, riding on bilinear filtering. */
export const DOWNSAMPLE_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(uTex, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  s += texture2D(uTex, vUv + uTexel * vec2(1.0, -1.0)).rgb;
  s += texture2D(uTex, vUv + uTexel * vec2(-1.0, 1.0)).rgb;
  s += texture2D(uTex, vUv + uTexel * vec2(1.0, 1.0)).rgb;
  gl_FragColor = vec4(s * 0.25, 1.0);
}
`;

/** Separable 9-tap gaussian; run once horizontally then once vertically. */
export const BLUR_FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 s = texture2D(uTex, vUv).rgb * 0.227027;
  s += texture2D(uTex, vUv + uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(uTex, vUv - uDir * 1.3846153846).rgb * 0.3162162162;
  s += texture2D(uTex, vUv + uDir * 3.2307692308).rgb * 0.0702702703;
  s += texture2D(uTex, vUv - uDir * 3.2307692308).rgb * 0.0702702703;
  gl_FragColor = vec4(s, 1.0);
}
`;

export const LEVELS = 5;

/**
 * Final composite. Halation is added in linear light before grading, because on
 * real film the reflected light re-exposes the emulsion — it is part of the
 * capture, not a post effect. Grading runs after the sRGB encode, which is where
 * lift/gamma/gain are actually defined.
 */
export const COMPOSITE_FRAG = /* glsl */ `
uniform sampler2D uSource;
uniform sampler2D uHalo0;
uniform sampler2D uHalo1;
uniform sampler2D uHalo2;
uniform sampler2D uHalo3;
uniform sampler2D uHalo4;
uniform vec3 uHaloWeight[${LEVELS}];
uniform float uHaloStrength;
uniform vec3 uHaloTint;

uniform float uExposure;
uniform vec3 uWhiteBalance;

uniform float uLift;
uniform float uGamma;
uniform float uGain;
uniform float uContrast;
uniform float uSaturation;
uniform float uVignette;

uniform float uGrainStrength;
uniform float uGrainScale;
uniform float uGrainSeed;

uniform vec2 uAspect;
uniform float uMix;

// Zoom and pan. The threshold pass and the blur pyramid deliberately stay in
// full-image space, so the halo keeps a fixed size relative to the photograph
// however far in the view is zoomed — magnifying a crop must magnify the halo
// with it, not shrink it.
uniform vec2 uViewScale;
uniform vec2 uViewOffset;

// Below this fraction of the width the untouched photo shows through. Negative
// disables the split entirely.
uniform float uSplit;

varying vec2 vUv;
${COLOR_HELPERS}

float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  vec2 uv = vUv * uViewScale + uViewOffset;

  vec3 base = srgbToLinear(texture2D(uSource, uv).rgb);
  vec3 original = base;

  vec3 halo = texture2D(uHalo0, uv).rgb * uHaloWeight[0];
  halo += texture2D(uHalo1, uv).rgb * uHaloWeight[1];
  halo += texture2D(uHalo2, uv).rgb * uHaloWeight[2];
  halo += texture2D(uHalo3, uv).rgb * uHaloWeight[3];
  halo += texture2D(uHalo4, uv).rgb * uHaloWeight[4];

  vec3 lin = base + halo * uHaloTint * uHaloStrength;
  lin *= exp2(uExposure) * uWhiteBalance;

  vec3 col = linearToSrgb(lin);

  col = clamp(col * (1.0 + uGain - uLift) + uLift, 0.0, 1.0);
  col = pow(col, vec3(1.0 / uGamma));

  if (uContrast > 0.0) {
    col = mix(col, smoothstep(0.0, 1.0, col), uContrast);
  } else {
    col = mix(col, col * 0.5 + 0.25, -uContrast);
  }

  float l = luma(col);
  col = clamp(mix(vec3(l), col, 1.0 + uSaturation), 0.0, 1.0);

  if (uGrainStrength > 0.0) {
    // Grain rides on image coordinates, so zooming in magnifies the grain the
    // way a loupe would rather than resampling it finer.
    vec2 gp = uv * uAspect * uGrainScale + uGrainSeed;
    float n = vnoise(gp) * 0.65 + vnoise(gp * 2.137 + 17.31) * 0.35;
    float gl = luma(col);
    float w = pow(1.0 - gl, 1.35) * (0.35 + 0.65 * smoothstep(0.0, 0.18, gl));
    col += (n - 0.5) * uGrainStrength * w;
  }

  if (uVignette > 0.0) {
    vec2 q = (uv - 0.5) * uAspect;
    col *= 1.0 - uVignette * smoothstep(0.30, 0.95, length(q) / max(uAspect.x, uAspect.y));
  }

  col = mix(linearToSrgb(original), clamp(col, 0.0, 1.0), uMix);

  if (uSplit >= 0.0 && vUv.x < uSplit) {
    col = linearToSrgb(original);
  }

  gl_FragColor = vec4(col, 1.0);
}
`;
