import { useTheme } from '@astryxdesign/core/theme';
import { VStack } from '@astryxdesign/core/Layout';
import type { Histogram as HistogramData } from '../render/Pipeline';

const HEIGHT = 56;
const BINS = 256;

/**
 * Astryx ships no chart component, and its guidance for that case is to draw
 * with `useTheme` rather than invent colours — so the three channels take the
 * theme's own red, green and blue.
 */
function path(bins: Uint32Array, peak: number): string {
  const points: string[] = [`M 0 ${HEIGHT}`];
  for (let i = 0; i < BINS; i++) {
    const x = (i / (BINS - 1)) * BINS;
    // Log scale: a photograph's histogram is dominated by a few huge bins, and a
    // linear axis flattens everything else into the floor.
    const y = HEIGHT - (Math.log1p(bins[i]) / Math.log1p(peak)) * HEIGHT;
    points.push(`L ${x.toFixed(1)} ${y.toFixed(1)}`);
  }
  points.push(`L ${BINS} ${HEIGHT} Z`);
  return points.join(' ');
}

export function Histogram({ data }: { data: HistogramData | null }) {
  const { token } = useTheme();
  if (!data) return null;

  const channels: Array<[Uint32Array, string]> = [
    [data.r, token('--color-icon-red')],
    [data.g, token('--color-icon-green')],
    [data.b, token('--color-icon-blue')],
  ];

  return (
    <VStack gap={0} paddingBlock={1}>
      <svg
        viewBox={`0 0 ${BINS} ${HEIGHT}`}
        preserveAspectRatio="none"
        width="100%"
        height={HEIGHT}
        role="img"
        aria-label="Levels"
        style={{ display: 'block', borderRadius: 'var(--radius-primitive-sm, 4px)' }}
      >
        <rect x="0" y="0" width={BINS} height={HEIGHT} fill="var(--color-background-muted)" />
        {channels.map(([bins, colour], i) => (
          <path
            key={i}
            d={path(bins, data.peak)}
            fill={colour}
            // Screen keeps overlapping channels readable and turns a neutral
            // image's three curves back into one white one.
            style={{ mixBlendMode: 'screen' }}
            opacity={0.75}
          />
        ))}
      </svg>
    </VStack>
  );
}
