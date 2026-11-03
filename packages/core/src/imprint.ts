import type { Json } from './bytes.ts';
import type { Did } from './keys.ts';
import { TEXT_LIMITS } from './limits.ts';

/*
 * A person's imprint (Impressum): who is behind this hub, as the law where they live asks them to say it (name,
 * address, a way to reach them, a VAT id where there is one). Free text, Markdown, kept by the person themself on
 * their hub, public like their profile: whoever sees the hub sees it. The latest one counts; an empty one takes it
 * back.
 *
 *   weave.imprint  {text}   latest wins; text '' removes it
 */

export const KIND_IMPRINT = 'weave.imprint';

export interface Imprint {
  /** The imprint's text (Markdown). */
  text: string;
  /** When this version was set. */
  time: string;
}

/** The text an imprint event holds, when it holds one (anything else or too long: none). */
export function parseImprint(body: Json | null | undefined): string | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const text = (body as Record<string, unknown>).text;
  if (typeof text !== 'string' || text.length > TEXT_LIMITS.imprint) return undefined;
  return text;
}

/** The imprint these events leave: the latest word of the person, none when the latest is empty or there is none. */
export function imprintOf(events: Array<{ kind: string; body: Json | null; author: Did; time: string }>): Imprint | undefined {
  let latest: Imprint | undefined;
  for (const event of events) {
    if (event.kind !== KIND_IMPRINT) continue;
    if (latest && event.time < latest.time) continue;
    const text = parseImprint(event.body);
    if (text === undefined) continue;
    latest = { text, time: event.time };
  }
  return latest && latest.text.trim() ? latest : undefined;
}
