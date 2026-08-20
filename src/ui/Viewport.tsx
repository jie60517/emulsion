import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Center } from '@astryxdesign/core/Center';
import { EmptyState } from '@astryxdesign/core/EmptyState';
import { Icon } from '@astryxdesign/core/Icon';
import { LayoutContent, VStack } from '@astryxdesign/core/Layout';
import { Text } from '@astryxdesign/core/Text';
import { ToggleButton } from '@astryxdesign/core/ToggleButton';
import { Toolbar } from '@astryxdesign/core/Toolbar';
import * as THREE from 'three';
import { Pipeline, type Histogram, type RenderView } from '../render/Pipeline';
import { chainFromLegacyParams } from '../render/effects';
import type { LoadedImage } from '../io/image';
import type { Params } from '../state/params';
import { PhotoIcon } from './icons';

/** Preview cap. Full resolution is only ever rendered on export — this is what
 *  keeps a 24MP file interactive, and the effects are resolution-independent so
 *  what you tune here is what you get out. */
const PREVIEW_MAX = 2048;

const MAX_ZOOM = 16;

/**
 * The one colour in this app that is deliberately not a theme token. The
 * surround of the image has to be neutral grey: a tinted background changes how
 * warm the photo looks and quietly biases every colour decision made against it.
 * It still has to follow the interface between light and dark, or a light theme
 * would frame the photo in a black hole.
 */
const NEUTRAL_SURROUND_DARK = '#1a1a1a';
const NEUTRAL_SURROUND_LIGHT = '#e8e8e8';

type Props = {
  image: LoadedImage | null;
  params: Params;
  intensity: number;
  onPipelineReady: (pipeline: Pipeline) => void;
  onFiles: (files: FileList | null) => void;
  onPickFile: () => void;
  isDark: boolean;
  onHistogram: (histogram: Histogram | null) => void;
};

export function Viewport({
  image,
  params,
  intensity,
  onPipelineReady,
  onFiles,
  onPickFile,
  isDark,
  onHistogram,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const panRef = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  const [dragging, setDragging] = useState(false);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [centre, setCentre] = useState({ x: 0.5, y: 0.5 });
  const [compare, setCompare] = useState(false);
  const [isSplit, setIsSplit] = useState(false);
  const [render, setRender] = useState({ width: 0, height: 0, cssWidth: 0, cssHeight: 0 });
  const [isTilt, setIsTilt] = useState(true);
  const [pointer, setPointer] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (!canvasRef.current || pipelineRef.current) return;
    const pipeline = new Pipeline(canvasRef.current);
    pipelineRef.current = pipeline;
    onPipelineReady(pipeline);
    return () => {
      pipeline.dispose();
      pipelineRef.current = null;
    };
  }, [onPipelineReady]);

  useLayoutEffect(() => {
    const el = frameRef.current;
    if (!el) return;

    // Measure straight away rather than waiting for the observer's first
    // callback: ResizeObserver only delivers during a rendering frame, so a
    // background or non-compositing tab would never get a first size at all.
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const width = rect.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = rect.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      setBox((previous) =>
        previous.width === width && previous.height === height ? previous : { width, height },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  useEffect(() => {
    const pipeline = pipelineRef.current;
    if (!pipeline) return;

    textureRef.current?.dispose();
    if (!image) {
      textureRef.current = null;
      pipeline.setSource(null);
      return;
    }
    const texture = new THREE.Texture(image.bitmap as unknown as HTMLImageElement);
    textureRef.current = texture;
    pipeline.setSource(texture);
    setZoom(1);
    setCentre({ x: 0.5, y: 0.5 });
  }, [image]);

  // Size the canvas to the image's aspect inside the available box.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image || !box.width || !box.height) return;

    const fit = Math.min(box.width / image.width, box.height / image.height, 1);
    const cssWidth = Math.max(1, Math.round(image.width * fit));
    const cssHeight = Math.max(1, Math.round(image.height * fit));

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const longEdge = Math.max(cssWidth, cssHeight) * dpr;
    const clamp = longEdge > PREVIEW_MAX ? PREVIEW_MAX / longEdge : 1;

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;
    setRender({
      width: Math.max(1, Math.round(cssWidth * dpr * clamp)),
      height: Math.max(1, Math.round(cssHeight * dpr * clamp)),
      cssWidth,
      cssHeight,
    });
  }, [image, box]);

  const view = useMemo<RenderView>(() => {
    const scale = 1 / zoom;
    const half = scale / 2;
    // Keep the window inside the image so panning cannot reveal edge-clamped
    // texels pretending to be photograph.
    const clampCentre = (v: number) => Math.min(1 - half, Math.max(half, v));
    return {
      scale,
      offsetX: clampCentre(centre.x) - half,
      offsetY: clampCentre(centre.y) - half,
    };
  }, [zoom, centre]);

  // Depth is decoration, and decoration yields to judgement: the moment the
  // image is being inspected at zoom, compared, or split, the plane goes flat.
  const tilt = isTilt && zoom === 1 && !isSplit && !compare ? pointer : null;

  useEffect(() => {
    const pipeline = pipelineRef.current;
    if (!pipeline || !image || !render.width) return;
    pipeline.setBackground(isDark ? NEUTRAL_SURROUND_DARK : NEUTRAL_SURROUND_LIGHT);
    pipeline.render(params, render.width, render.height, null, {
      mix: compare ? 0 : intensity / 100,
      view,
      split: isSplit ? 0.5 : -1,
      tilt,
    });
  }, [image, params, intensity, render, view, compare, isSplit, tilt, isDark]);

  // Measured off the main render, and debounced: dragging a slider should not
  // stall on a GPU readback for every intermediate value.
  useEffect(() => {
    const pipeline = pipelineRef.current;
    if (!pipeline || !image || !render.width) {
      onHistogram(null);
      return;
    }
    const id = setTimeout(() => {
      const height = Math.max(1, Math.round((192 * render.height) / render.width));
      onHistogram(
        pipeline.readHistogram(chainFromLegacyParams(params), 192, height, {
          mix: intensity / 100,
          view,
        }),
      );
    }, 140);
    return () => clearTimeout(id);
  }, [image, params, intensity, render, view, onHistogram]);

  /** Zoom at which one image pixel covers one device pixel. */
  const nativeZoom = useMemo(
    () => (image && render.width ? image.width / render.width : 1),
    [image, render.width],
  );

  const zoomAt = useCallback((factor: number, atX = 0.5, atY = 0.5) => {
    setZoom((previous) => {
      const next = Math.min(MAX_ZOOM, Math.max(1, previous * factor));
      if (next === previous) return previous;
      // Keep the point under the cursor fixed while the scale changes.
      setCentre((c) => {
        const scale = 1 / previous;
        const nextScale = 1 / next;
        const pointX = c.x + (atX - 0.5) * scale;
        const pointY = c.y + (atY - 0.5) * scale;
        return { x: pointX - (atX - 0.5) * nextScale, y: pointY - (atY - 0.5) * nextScale };
      });
      return next;
    });
  }, []);

  const hasImage = Boolean(image);

  return (
    <LayoutContent padding={0}>
      <VStack gap={0} height="100%">
        <Toolbar
          label="View"
          size="sm"
          dividers={['bottom']}
          startContent={
            <>
              <Button
                label="Fit"
                variant="ghost"
                size="sm"
                isDisabled={!hasImage}
                onClick={() => {
                  setZoom(1);
                  setCentre({ x: 0.5, y: 0.5 });
                }}
              />
              <Button
                label="1:1"
                variant="ghost"
                size="sm"
                isDisabled={!hasImage}
                onClick={() => setZoom(Math.min(MAX_ZOOM, Math.max(1, nativeZoom)))}
              />
              <Text type="supporting" color="secondary" hasTabularNumbers>
                {Math.round(zoom * 100)}%
              </Text>
            </>
          }
          endContent={
            <>
              <ToggleButton
                label="Depth"
                size="sm"
                isPressed={isTilt}
                isDisabled={!hasImage}
                onPressedChange={setIsTilt}
              />
              <ToggleButton
                label="Split"
                size="sm"
                isPressed={isSplit}
                isDisabled={!hasImage}
                onPressedChange={setIsSplit}
              />
              <Button
                label="Original"
                variant="ghost"
                size="sm"
                isDisabled={!hasImage}
                onPointerDown={() => setCompare(true)}
                onPointerUp={() => setCompare(false)}
                onPointerLeave={() => setCompare(false)}
              />
            </>
          }
        />

        <Center
          ref={frameRef}
          axis="both"
          height="100%"
          padding={3}
          style={{
            background: isDark ? NEUTRAL_SURROUND_DARK : NEUTRAL_SURROUND_LIGHT,
            overflow: 'hidden',
            cursor: zoom > 1 ? 'grab' : undefined,
            outline: dragging ? '2px dashed var(--color-border-emphasized)' : undefined,
            outlineOffset: 'calc(-1 * var(--spacing-2))',
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFiles(e.dataTransfer.files);
          }}
          onWheel={(e) => {
            if (!hasImage) return;
            const rect = e.currentTarget.getBoundingClientRect();
            zoomAt(
              e.deltaY < 0 ? 1.15 : 1 / 1.15,
              (e.clientX - rect.left) / rect.width,
              (e.clientY - rect.top) / rect.height,
            );
          }}
          onPointerDown={(e) => {
            if (!hasImage || zoom <= 1) return;
            e.currentTarget.setPointerCapture?.(e.pointerId);
            panRef.current = { x: e.clientX, y: e.clientY, cx: centre.x, cy: centre.y };
          }}
          onPointerMove={(e) => {
            const pan = panRef.current;
            if (!pan) {
              const rect = e.currentTarget.getBoundingClientRect();
              // Quantised, so a mouse crossing the frame does not queue a full
              // pipeline render for every pixel it passes over.
              const q = (v: number) => Math.round(v * 50) / 50;
              setPointer({
                x: q(((e.clientX - rect.left) / rect.width) * 2 - 1),
                y: q(((e.clientY - rect.top) / rect.height) * 2 - 1),
              });
              return;
            }
            if (!render.cssWidth) return;
            const scale = 1 / zoom;
            setCentre({
              x: pan.cx - ((e.clientX - pan.x) / render.cssWidth) * scale,
              y: pan.cy - ((e.clientY - pan.y) / render.cssHeight) * scale,
            });
          }}
          onPointerUp={() => {
            panRef.current = null;
          }}
          onPointerLeave={() => setPointer({ x: 0, y: 0 })}
        >
          <canvas ref={canvasRef} hidden={!image} style={{ display: 'block' }} />
          {!image && (
            <EmptyState
              icon={<Icon icon={PhotoIcon} size="lg" />}
              title="Drop a photo"
              actions={
                <Button label="Open photo" variant="secondary" size="sm" onClick={onPickFile} />
              }
            />
          )}
        </Center>
      </VStack>
    </LayoutContent>
  );
}
