# Emulsion

Cinestill 800T halation, film grain and cinematic grading for photos and video —
entirely in the browser, no server, no upload.

Live: https://jie60517.github.io/emulsion/

## Status

**Stages 1 and 2 of 4 complete.** Photos load, grade and export at full
resolution. Eight built-in looks with an intensity blend, custom looks saved to
the browser, shareable URLs and .json import/export. Zoom to 1:1, pan,
hold-to-compare, split view, live histogram, and a parallax presentation that
switches itself off whenever the image is being judged rather than admired.

Stage 3 is the video pipeline; stage 4 is batch processing and the mobile
layout.

## How the halation works

Cinestill 800T is Kodak Vision3 500T with the remjet anti-halation backing
stripped off. Without that layer, light from a bright source passes through the
emulsion, reflects off the back of the film base and re-exposes the emulsion from
behind. Red light scatters furthest, so the halo reads white at the core, then
orange, then red at its edge — and it only appears around genuine highlights.

The pipeline reproduces this rather than approximating it with a tinted blur:

1. Decode sRGB to linear light. Blurring gamma-encoded values spreads the wrong
   amount of energy and turns bloom into grey mud.
2. Extract highlights with a soft-knee luminance threshold.
3. Build a five-level blur pyramid.
4. Composite the pyramid with **separate per-channel weights** — red is pulled
   from the wide levels, blue from the tight ones. The colour gradient in the
   halo is a consequence of that, not a tint applied on top.
5. Add it to the base in linear light, because on real film the reflection is
   part of the exposure, not a post effect.
6. Grade, then grain, then encode back to sRGB.

Grain is procedural and driven by UV rather than pixel coordinates, so its size
is a fraction of the frame. What you tune on the downscaled preview is what comes
out of a full-resolution export.

## Running it

```bash
npm install
npm run dev
```

`public/sample/night-test.png` is a synthetic night scene with a blown-out neon
sign, a small hot lamp and a grey ramp — the halation, grain and contrast
controls are all legible against it.

## Stack

Vite · React 19 · three.js · [Astryx](https://astryx.atmeta.com/) (gothic theme).

Astryx is pinned to an exact version, not a caret range: it is a 0.4.x beta and
its API can still move.
