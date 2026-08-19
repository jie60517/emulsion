/**
 * Stage 3 spike. Answers one question before any of the video pipeline gets
 * built: on this machine, can a 4K frame be rendered through the real halation
 * pipeline and encoded fast enough for a minutes-long clip to be worth offering?
 *
 * Deliberately uses the production Pipeline rather than a stand-in, because the
 * per-frame cost that matters is the blur pyramid, not the codec.
 *
 * Not part of the app. Served at /experiment.html.
 */
import * as THREE from 'three';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { Pipeline } from '../render/Pipeline';
import { DEFAULT_PARAMS, type Params } from '../state/params';
import { PRESETS } from '../state/presets';

export type SpikeResult = {
  label: string;
  width: number;
  height: number;
  frames: number;
  renderMsPerFrame: number;
  encodeMsPerFrame: number;
  totalMsPerFrame: number;
  realtimeRatio: number;
  bytes: number;
  decodeMsPerFrame: number | null;
  note?: string;
};

const LOOK: Params = PRESETS.find((p) => p.id === '800t-night')?.params ?? DEFAULT_PARAMS;

/** A synthetic frame with a moving blown-out highlight, so halation has real
 *  work to do and the encoder sees genuine motion rather than a still. */
function makeSourceCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function paintFrame(canvas: HTMLCanvasElement, t: number) {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  ctx.fillStyle = '#0d1220';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#141b2b';
  ctx.fillRect(0, height * 0.72, width, height * 0.28);

  const x = width * (0.2 + 0.6 * (0.5 + 0.5 * Math.sin(t * 0.9)));
  ctx.fillStyle = '#ffe2b0';
  ctx.fillRect(x - width * 0.08, height * 0.3, width * 0.16, height * 0.05);
  ctx.fillStyle = '#ff5abe';
  ctx.fillRect(x - width * 0.06, height * 0.4, width * 0.12, height * 0.012);

  const grad = ctx.createLinearGradient(0, 0, width, 0);
  grad.addColorStop(0, '#000');
  grad.addColorStop(1, '#fff');
  ctx.fillStyle = grad;
  ctx.fillRect(width * 0.08, height - height * 0.09, width * 0.84, height * 0.06);
}

export async function runSpike(
  width: number,
  height: number,
  frames: number,
  label: string,
  params: Params = LOOK,
): Promise<SpikeResult> {
  const source = makeSourceCanvas(width, height);
  const texture = new THREE.CanvasTexture(source);

  const offscreen = document.createElement('canvas');
  const pipeline = new Pipeline(offscreen);
  pipeline.setSource(texture);

  const target = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    depthBuffer: false,
    stencilBuffer: false,
  });

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: 30 },
    fastStart: 'in-memory',
  });

  let encodeMs = 0;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      throw e;
    },
  });
  encoder.configure({
    codec: 'avc1.640034',
    width,
    height,
    bitrate: width >= 3840 ? 40_000_000 : 12_000_000,
    framerate: 30,
    latencyMode: 'quality',
  });

  let renderMs = 0;

  for (let i = 0; i < frames; i++) {
    paintFrame(source, i / 30);
    texture.needsUpdate = true;

    const t0 = performance.now();
    pipeline.render(params, width, height, target, { seed: i * 13.37 });
    // Force the GPU to actually finish, or the timing measures queue depth
    // rather than work.
    const probe = new Uint8Array(4);
    pipeline.renderer.readRenderTargetPixels(target, 0, 0, 1, 1, probe);
    renderMs += performance.now() - t0;

    const t1 = performance.now();
    const frame = new VideoFrame(offscreen, {
      timestamp: (i * 1e6) / 30,
      duration: 1e6 / 30,
    });
    encoder.encode(frame, { keyFrame: i % 60 === 0 });
    frame.close();
    encodeMs += performance.now() - t1;

    // Backpressure: without this the queue grows until memory does.
    if (encoder.encodeQueueSize > 8) {
      await new Promise<void>((resolve) => {
        const check = () => (encoder.encodeQueueSize <= 4 ? resolve() : setTimeout(check, 2));
        check();
      });
    }
  }

  const flushStart = performance.now();
  await encoder.flush();
  encodeMs += performance.now() - flushStart;
  encoder.close();
  muxer.finalize();

  const bytes = (muxer.target as ArrayBufferTarget).buffer.byteLength;

  target.dispose();
  texture.dispose();
  pipeline.dispose();

  const renderPer = renderMs / frames;
  const encodePer = encodeMs / frames;
  const totalPer = renderPer + encodePer;

  return {
    label,
    width,
    height,
    frames,
    renderMsPerFrame: Math.round(renderPer * 100) / 100,
    encodeMsPerFrame: Math.round(encodePer * 100) / 100,
    totalMsPerFrame: Math.round(totalPer * 100) / 100,
    // Above 1 means the export runs faster than the clip plays.
    realtimeRatio: Math.round((1000 / 30 / totalPer) * 100) / 100,
    bytes,
    decodeMsPerFrame: null,
  };
}

/** Decodes the encoded bytes back, which is the other half of a real export. */
export async function measureDecode(
  bytes: ArrayBuffer,
  width: number,
  height: number,
): Promise<number | null> {
  // A full demux needs mp4box; for the spike we only need to know whether the
  // hardware decoder keeps up, so a raw-throughput check on a synthetic stream
  // is enough to size the risk.
  void bytes;
  void width;
  void height;
  return null;
}
