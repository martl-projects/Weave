/*
 * How long text in events may be. Readers cut anything longer, so writers
 * check first and refuse: text is never shortened without the author knowing.
 * No dependencies, so the desktop renderer can import it for its counters.
 */
export const TEXT_LIMITS = {
  /** Post, issue, proposal and thread titles. */
  title: 200,
  /** Post, chat, reply and thread text (Markdown). */
  text: 10_000,
  link: 500,
  /** A work item's starting prompt. */
  prompt: 4_000,
  /** A project page's body (Markdown). */
  page: 100_000,
  pageTitle: 100,
  pageSubtitle: 300,
} as const;

/** The error for text over a limit: how long it is, what's allowed, and what to do. */
export function tooLong(what: string, length: number, max: number): Error {
  const n = (x: number) => x.toLocaleString('en');
  return new Error(`${what} is too long: ${n(length)} characters, at most ${n(max)}. Shorten it or split it (for a post, the rest can go in its chat).`);
}

/** Refuse a body whose title, text or link is over its limit. */
export function checkTextFields(body: unknown): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;
  const b = body as Record<string, unknown>;
  for (const [key, what, max] of [
    ['title', 'The title', TEXT_LIMITS.title],
    ['text', 'The text', TEXT_LIMITS.text],
    ['link', 'The link', TEXT_LIMITS.link],
    ['prompt', 'The starting prompt', TEXT_LIMITS.prompt],
  ] as const) {
    const value = b[key];
    if (typeof value === 'string' && value.length > max) throw tooLong(what, value.length, max);
  }
}

/**
 * A time as a person or agent gives it on the command line or in a tool call: ISO 8601 as it is, or how long ago
 * (30m, 2h, 3d, 1w) as the time that was. Anything else goes through for whoever reads it to refuse.
 */
export function timeGiven(given: string, now = Date.now()): string {
  const ago = /^(\d+)\s*([mhdw])$/i.exec(given.trim());
  if (!ago) return given;
  const unit = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 }[ago[2].toLowerCase() as 'm' | 'h' | 'd' | 'w'];
  return new Date(now - Number(ago[1]) * unit).toISOString();
}
