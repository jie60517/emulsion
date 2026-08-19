import { runSpike, type SpikeResult } from './webcodecs-spike';
import { setPyramidBaseShift } from '../render/Pipeline';
import { DEFAULT_PARAMS } from '../state/params';
import { PRESETS } from '../state/presets';

declare global {
  interface Window {
    runSpikes: (frames?: number) => Promise<SpikeResult[]>;
    runPyramidSweep: (frames?: number) => Promise<SpikeResult[]>;
    runCostBreakdown: (frames?: number) => Promise<SpikeResult[]>;
  }
}

const out = document.getElementById('out')!;

window.runSpikes = async (frames = 45) => {
  const results: SpikeResult[] = [];
  for (const [w, h, label] of [
    [1920, 1080, '1080p'],
    [3840, 2160, '4K'],
  ] as const) {
    out.textContent = `running ${label}...`;
    results.push(await runSpike(w, h, frames, label));
    out.textContent = JSON.stringify(results, null, 2);
  }
  return results;
};

window.runPyramidSweep = async (frames = 45) => {
  const results: SpikeResult[] = [];
  for (const shift of [1, 2, 3]) {
    setPyramidBaseShift(shift);
    out.textContent = `4K, pyramid base 1/${2 ** shift}...`;
    const r = await runSpike(3840, 2160, frames, `4K pyramid 1/${2 ** shift}`);
    results.push(r);
    out.textContent = JSON.stringify(results, null, 2);
  }
  setPyramidBaseShift(1);
  return results;
};

window.runCostBreakdown = async (frames = 45) => {
  const look = PRESETS.find((p) => p.id === '800t-night')!.params;
  const variants: Array<[string, typeof look]> = [
    ['everything', look],
    ['no grain', { ...look, grainStrength: 0 }],
    ['no halation', { ...look, halationStrength: 0 }],
    ['grade only', { ...look, grainStrength: 0, halationStrength: 0 }],
    ['neutral', DEFAULT_PARAMS],
  ];
  const results: SpikeResult[] = [];
  for (const [name, params] of variants) {
    out.textContent = `4K — ${name}...`;
    results.push(await runSpike(3840, 2160, frames, name, params));
    out.textContent = JSON.stringify(results, null, 2);
  }
  return results;
};

out.textContent = 'ready';
