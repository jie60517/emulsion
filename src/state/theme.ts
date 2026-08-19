export const THEMES = [
  'neutral',
  'gothic',
  'stone',
  'chocolate',
  'matcha',
  'butter',
  'y2k',
] as const;

export type ThemeName = (typeof THEMES)[number];

/** 'system' leaves the choice to the OS, which is what Astryx does by default. */
export type SchemeName = 'system' | 'light' | 'dark';

export const THEME_LABELS: Record<ThemeName, string> = {
  neutral: 'Neutral',
  gothic: 'Gothic',
  stone: 'Stone',
  chocolate: 'Chocolate',
  matcha: 'Matcha',
  butter: 'Butter',
  y2k: 'Y2K',
};

/** Gothic ships no light-dark() pairs at all — it is a dark-only theme, so the
 *  light/dark switch has nothing to act on while it is selected. */
export const DARK_ONLY_THEMES: ThemeName[] = ['gothic'];

const THEME_KEY = 'emulsion.theme.v1';
const SCHEME_KEY = 'emulsion.scheme.v1';

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const value = window.localStorage.getItem(key);
    return allowed.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
}

export function loadTheme(): ThemeName {
  return read(THEME_KEY, THEMES, 'gothic');
}

export function loadScheme(): SchemeName {
  return read(SCHEME_KEY, ['system', 'light', 'dark'] as const, 'dark');
}

/**
 * Astryx's component styles bind to the theme when the stylesheet is first
 * resolved: swapping `data-astryx-theme` at runtime moves the tokens and text
 * colours, but leaves button fills on the theme the page loaded with. Verified
 * by measurement — after a reload the same attribute produces the right colours.
 * So a theme change is persisted and the page reloaded, rather than shipping a
 * switcher that only half works.
 */
export function chooseTheme(theme: ThemeName, scheme: SchemeName) {
  applyTheme(theme, scheme);
  window.location.reload();
}

export function applyTheme(theme: ThemeName, scheme: SchemeName) {
  const root = document.documentElement;
  root.setAttribute('data-astryx-theme', theme);
  // Two different attributes, and they are easy to confuse. `data-theme` on
  // <html> is what drives `color-scheme`, and therefore which half of every
  // light-dark() pair wins. `data-astryx-media` lives inside the theme's
  // @scope and only ever matches descendants of the scope root, so setting it
  // here would silently do nothing.
  if (scheme === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', scheme);
  }
  try {
    window.localStorage.setItem(THEME_KEY, theme);
    window.localStorage.setItem(SCHEME_KEY, scheme);
  } catch {
    // Private browsing refuses writes; the choice still applies this session.
  }
}

/** Whether the interface is actually painting dark right now, which decides
 *  which neutral grey belongs behind the photo. */
export function isDarkNow(theme: ThemeName, scheme: SchemeName): boolean {
  if (DARK_ONLY_THEMES.includes(theme)) return true;
  if (scheme === 'dark') return true;
  if (scheme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}
