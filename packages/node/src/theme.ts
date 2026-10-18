/**
 * A space's theme (presentation level 1): values only, so any renderer can
 * apply it safely. Published as a public `weave.theme` state event; the latest
 * one wins. Unknown or malformed values fall back to defaults.
 */
export const KIND_THEME = 'weave.theme';

export const FONTS = ['sans', 'serif', 'mono', 'rounded'] as const;
export const PATTERNS = ['none', 'weave', 'dots', 'glow'] as const;

export interface Theme {
  accent: string;
  background: string;
  surface: string;
  text: string;
  font: (typeof FONTS)[number];
  pattern: (typeof PATTERNS)[number];
}

export const DEFAULT_THEME: Theme = {
  accent: '#f5b729',
  background: '#0d0e12',
  surface: '#171a22',
  text: '#e9e7e1',
  font: 'sans',
  pattern: 'weave',
};

const COLOR = /^#[0-9a-fA-F]{6}$/;

export function sanitizeTheme(value: unknown): Theme {
  const input = (value && typeof value === 'object' ? value : {}) as Record<string, unknown>;
  const color = (key: 'accent' | 'background' | 'surface' | 'text') =>
    typeof input[key] === 'string' && COLOR.test(input[key] as string) ? (input[key] as string).toLowerCase() : DEFAULT_THEME[key];
  return {
    accent: color('accent'),
    background: color('background'),
    surface: color('surface'),
    text: color('text'),
    font: FONTS.includes(input.font as Theme['font']) ? (input.font as Theme['font']) : DEFAULT_THEME.font,
    pattern: PATTERNS.includes(input.pattern as Theme['pattern']) ? (input.pattern as Theme['pattern']) : DEFAULT_THEME.pattern,
  };
}
