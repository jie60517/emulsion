# Review follow-ups

Findings from a two-axis review of `c838554...f0b1fdf` — the effect-chain engine
rewrite, the effect library, the chain editor, and the halation shoulder. Nothing
here has been fixed yet. Ordered by the sequence they should be taken in, since
the later ones are easier once the earlier ones land.

The documented standard for this repo is `.claude/CLAUDE.md`, installed by
`npx astryx init`. The review found **zero breaches** of it — every finding below
is either a spec problem or a judgement-call code smell.

## 1. Effect scale is bound to the framebuffer, not the picture

The most serious finding, because it breaks a constraint agreed in stage 1: what
is tuned on a downscaled preview must match a full-resolution export.

- `library/stylise.ts` — `emboss` and `sharpen` step by `uTexelSize`, which is
  one *framebuffer* pixel. The preview is capped at `PREVIEW_MAX = 2048`; the
  export is full resolution. A sharpen tuned on a 1200px preview is close to
  invisible in a 6000px export.
- `library/blur.ts` — `blur`, `bloom` and `tiltShift` build their pyramid from
  `ctx.input`, which the head has already cropped to the current view, so the
  radius shrinks in image terms as the user zooms in. `rgbShift` (in
  `library/colour.ts`), `motionBlur` and `zoomBlur` offset in `vScreen` and drift
  the same way.
- `zoomBlur` additionally centres on `vec2(0.5) - vScreen`, the middle of the
  *window*. Panning moves the burst; the export centres on the image.

Grain and vignette already do this correctly via `imageUv()`, and `types.ts`
documents the rule. These effects simply did not follow it.

Fix: express offsets and radii as a fraction of the image and convert through the
view, the way `pixelate` does after its own fix:

```glsl
vec2 snappedImage = (floor(imageUv() * grid) + 0.5) / grid;
vec2 back = (snappedImage - uViewOffset) / uViewScale;
```

## 2. Removed effects leak their GPU resources

`Pipeline.prune()` delegates to `EffectEngine.prune()`, which disposes the
runtimes of nodes that have left the chain. **Nothing in `src/` calls it**, so
materials for removed effects are never disposed. Either call it after every
chain edit, or drop both methods and dispose from the engine's render loop.

## 3. Reset cannot undo structural edits

`ControlPanel.tsx` disables Reset via `isChainNeutral()` (`state/chain.ts`), which
inspects values only:

```ts
chain.every(node => !node.enabled || def.params.every(spec => node.values[spec.key] === spec.neutral))
```

Add six effects without touching a slider, or delete every effect, and Reset is
greyed out — the default chain becomes unrecoverable. The check needs to compare
structure against `defaultChain()` as well as values.

## 4. Untrusted chain input is not bounded

`deserialiseChain()` clamps every value but never bounds `raw.length`. A shared
URL carrying ten thousand nodes allocates ten thousand materials and renders ten
thousand passes a frame. Cap the length.

## 5. An emptied chain silently refills

`deserialiseChain()` returns `null` when the result is empty, so `readChain()`
falls through to the legacy branch and reinstates halation/grade/grain/vignette.
Deliberately removing every effect and sharing that link gives the recipient the
default chain. Distinguish "no chain field" from "an empty chain".

## 6. The blur pyramid exists twice

`library/halation.ts` and `library/blurKit.ts` carry byte-identical
`DOWNSAMPLE_FRAG` and `BLUR_FRAG`, and `haloWeights` is `levelWeights` run three
times. blurKit's comment justifies only the per-channel *weighting* — which is
genuinely halation's own — but the *construction* is not different. Have
`createPyramid()` return the levels and let halation weight them per channel.

## 7. Smaller judgement calls

- `pct` / `deg` / `plain` format helpers are redeclared in four library files,
  and then re-inlined anyway (`blur.ts:182` writes the body of `pct` 177 lines
  below its definition).
- The `distort` category has no effects: declared in the union, given a label,
  listed in `CATEGORY_ORDER`, then filtered back out.
- Adding a category means editing three places — the union, `CATEGORY_LABELS`,
  and `ChainEditor`'s `CATEGORY_ORDER`. One ordered array would do.
- `App.tsx` calls `chainFromLegacyParams()` during render to derive
  `activeChain`, which mints new node ids and bumps the module-level `counter` on
  every render. Memoise it, or compare without minting.
- `params.ts` `GROUP_LABELS` and `ParamSpec['group']` lost their only consumer
  when the panel became a chain editor.
- `pyramidEffect`'s `fromSource` option is never set by any effect.
- `test/parity-reference.json` is a fixture no code reads — the comparison is
  done by hand in the browser. Either wire it into a test or say in the file
  that it is a manual reference.

## 8. Halation ignores what precedes it

`library/halation.ts` reads `ctx.source` for its threshold pass rather than
`ctx.input`, so effects placed before it never reach the halo: Invert → Halation
and Halation → Invert produce identical halos. This is deliberate — it is what
keeps the halo anchored to the picture under zoom, and it is commented as such —
but it is a hole in the reorder guarantee and the interface says nothing about
it. Either surface it, or offer the choice.

## Not defects

- The **highlight shoulder** (`f0b1fdf`) was flagged as unrequested scope. It was
  a fix for a measured defect: on a real photograph 800T Night clipped 10.69% of
  the frame to flat white where the source had clipped nothing. Keep it.
- **Gradient Map** and **Risograph** from the agreed batch, and the five effects
  added beyond it, are scope bookkeeping rather than faults.

## Where things stand

Stages 1 and 2 are done and deployed. The renderer is an effect chain with 25
effects. Stage 3, the video pipeline, is measured but unimplemented — see the
spike at `/experiment.html` and `src/experiments/`.

Personal test photographs sit in `public/local-test/`, which is gitignored
because this repository is public.
