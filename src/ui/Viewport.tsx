import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Center, EmptyState } from '@astryxdesign/core';
import * as THREE from 'three';
import { Pipeline } from '../render/Pipeline';
import type { LoadedImage } from '../io/image';
import type { Params } from '../state/params';
import { PhotoIcon } from './icons';

/** Preview cap. Full resolution is only ever rendered on export — this is what
 *  keeps a 24MP file interactive, and the effects are resolution-independent so
 *  what you tune here is what you get out. */
const PREVIEW_MAX = 2048;

/**
 * The one colour in this app that is deliberately not a theme token. The
 * surround of the image has to be neutral grey: a tinted background changes how
 * warm the photo looks and quietly biases every colour decision made against it.
 */
const NEUTRAL_SURROUND = '#1a1a1a';

type Props = {
  image: LoadedImage | null;
  params: Params;
  intensity: number;
  onPipelineReady: (pipeline: Pipeline) => void;
  onFiles: (files: FileList | null) => void;
  onPickFile: () => void;
};

export function Viewport({ image, params, intensity, onPipelineReady, onFiles, onPickFile }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<Pipeline | null>(null);
  const textureRef = useRef<THREE.Texture | null>(null);
  const [dragging, setDragging] = useState(false);
  const [box, setBox] = useState({ width: 0, height: 0 });

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
  }, [image]);

  useEffect(() => {
    const pipeline = pipelineRef.current;
    const canvas = canvasRef.current;
    if (!pipeline || !canvas || !image || !box.width || !box.height) return;

    const scale = Math.min(box.width / image.width, box.height / image.height, 1);
    const cssWidth = Math.max(1, Math.round(image.width * scale));
    const cssHeight = Math.max(1, Math.round(image.height * scale));

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const longEdge = Math.max(cssWidth, cssHeight) * dpr;
    const clamp = longEdge > PREVIEW_MAX ? PREVIEW_MAX / longEdge : 1;
    const renderWidth = Math.max(1, Math.round(cssWidth * dpr * clamp));
    const renderHeight = Math.max(1, Math.round(cssHeight * dpr * clamp));

    canvas.style.width = `${cssWidth}px`;
    canvas.style.height = `${cssHeight}px`;

    // Rendered synchronously. React already coalesces rapid slider changes into
    // one effect run, and going through rAF would stall the preview whenever the
    // tab is not compositing.
    pipeline.render(params, renderWidth, renderHeight, null, 0, intensity / 100);
  }, [image, params, intensity, box]);

  return (
    <Center
      ref={frameRef}
      axis="both"
      height="100%"
      padding={3}
      style={{
        background: NEUTRAL_SURROUND,
        overflow: 'hidden',
        outline: dragging ? '2px dashed var(--color-border-emphasized)' : undefined,
        outlineOffset: '-12px',
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
    >
      <canvas ref={canvasRef} hidden={!image} style={{ display: 'block' }} />
      {!image && (
        <EmptyState
          icon={<PhotoIcon style={{ width: '2em', height: '2em' }} />}
          title="Drop a photo to begin"
          description="JPEG, PNG or WebP. Nothing is uploaded — every pixel stays on your machine."
          actions={<Button label="Open photo" variant="secondary" size="sm" onClick={onPickFile} />}
        />
      )}
    </Center>
  );
}
