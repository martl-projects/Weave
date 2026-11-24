import type { Json } from './bytes.ts';
import { boxTo, openBox, type Box } from './crypto.ts';
import { isDid, type Did } from './keys.ts';
import type { EventView } from './records.ts';
import type { EncryptionKeyOf, Inner, Recipient } from './spaces.ts';

/*
 * Guests of a release channel (a project's releases again, for those who use one of its lenses elsewhere): they knock
 * once, with the reader link a board carries along with the lens, and only read. Who they are is the project's
 * maintainers' alone: never in the channel (whose readers would see one another), nor readable by the project's other
 * members.
 *
 *   weave.lens.guest   {boxes: {maintainer: box}}   in the project, by a maintainer; each box, to a maintainer's
 *                                                   encryption key, holds {channel, did, name?, on, at}: let in
 *                                                   (on) or taken off (off). The latest per guest counts.
 *
 * A maintainer's node gives the channel to the guests it reads here (sync protocol 4 gives a space to its members
 * otherwise): the guests find only the maintainers at its meeting points, never one another.
 */
export const KIND_LENS_GUEST = 'weave.lens.guest';

export interface GuestNote {
  channel: string;
  did: Did;
  name?: string;
  on: boolean;
  at: string;
}

/** The note a maintainer writes in the project: boxed to each of its maintainers, itself included. */
export function guestNote(note: GuestNote, maintainers: Did[], encryptionKeyOf: EncryptionKeyOf): Inner {
  const boxes: Record<string, Box> = {};
  const value = { channel: note.channel, did: note.did, on: note.on, at: note.at, ...(note.name ? { name: note.name.slice(0, 80) } : {}) };
  for (const did of new Set(maintainers)) boxes[did] = boxTo(encryptionKeyOf(did), value as unknown as Json);
  return { kind: KIND_LENS_GUEST, body: { boxes: boxes as unknown as Json } };
}

/** A note boxed to `me`, opened; undefined when it isn't one, or not to me. */
export function openGuestNote(event: EventView, me: Recipient): GuestNote | undefined {
  const boxes = (event.body as { boxes?: Record<string, Box> } | null)?.boxes;
  const box = boxes?.[me.author];
  if (event.kind !== KIND_LENS_GUEST || !box) return undefined;
  try {
    const opened = openBox(me.keys.secretKey, me.keys.publicKey, box) as Partial<GuestNote> | null;
    if (!opened || typeof opened.channel !== 'string' || !isDid(opened.did) || typeof opened.on !== 'boolean' || typeof opened.at !== 'string') return undefined;
    return { channel: opened.channel, did: opened.did, on: opened.on, at: opened.at, ...(typeof opened.name === 'string' ? { name: opened.name } : {}) };
  } catch {
    return undefined;
  }
}

/** The guests of a channel as the notes say, latest per guest (by its own time): each one's last note. */
export function guestsOf(notes: GuestNote[], channel: string): Map<Did, GuestNote> {
  const out = new Map<Did, GuestNote>();
  for (const note of notes.filter((n) => n.channel === channel).sort((a, b) => a.at.localeCompare(b.at))) out.set(note.did, note);
  return out;
}
