import type { SVGProps } from 'react';

/**
 * Stroke icons drawn on a 24-unit grid, inheriting colour and sizing from the
 * button that holds them. Kept inline rather than pulled from an icon package:
 * two glyphs are not worth a dependency, and the app ships as a static bundle.
 */
const base: SVGProps<SVGSVGElement> = {
  width: '1.25em',
  height: '1.25em',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
  focusable: false,
};

/** A framed photo with a horizon and a sun — "open a picture". */
export function PhotoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="9.5" r="1.75" />
      <path d="M3.5 17.5 8 13a2 2 0 0 1 2.8 0l3.4 3.4M13 15.5l2.2-2.2a2 2 0 0 1 2.8 0l2.5 2.5" />
    </svg>
  );
}

/** Arrow into a tray — "write this out to a file". */
export function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5v10.5" />
      <path d="m7.75 9.75 4.25 4.25 4.25-4.25" />
      <path d="M4 16.5v2A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5v-2" />
    </svg>
  );
}
