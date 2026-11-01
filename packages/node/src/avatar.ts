/**
 * Someone's avatar: their figure (Weave avatar, martl-projects/weave-avatar) as a few small numbers, in a public
 * `weave.avatar` state event; the latest one wins, and `{ figure: null }` takes it back (the pixel sprite again).
 * Weave keeps only numbers by name; what they mean is the renderer's, which cleans them when it draws.
 */
export const KIND_AVATAR = 'weave.avatar';

/** A figure: part → variant, like { hair: 3, hairColor: 1, eyes: 12 }. */
export type AvatarFigure = Record<string, number>;

const PART = /^[a-zA-Z]{1,24}$/;

/** A figure from anything: only names of letters with whole numbers 0 to 255, at most 64 of them; else none. */
export function sanitizeFigure(input: unknown): AvatarFigure | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const figure: AvatarFigure = {};
  for (const [part, value] of Object.entries(input).slice(0, 64)) {
    if (PART.test(part) && Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 255) figure[part] = value as number;
  }
  return Object.keys(figure).length ? figure : undefined;
}
