import { boxTo, managersOf, openBox, type Box, type Did, type Entry, type Json, type SpaceState } from '@weave/core';
import type { Notice } from './backend.ts';
import type { StoredSpace } from './spacestore.ts';

/*
 * Pushes to a closed Weave Web (docs/web-push.md, stage 3). Each browser with pushes on has an address and a push key
 * of its own for every place it's in, and says them in that place as a `weave.push.target`, sealed to those who manage
 * it (in a direct chat: the other one). Nobody else learns the address; a place that goes quiet takes its address back.
 * When one of them writes a message there, their node seals a short notice to each target it can open and hands it to
 * that target's relay (a storage node), which sends it on with Web Push.
 */

export const KIND_PUSH_TARGET = 'weave.push.target';

/** Where to push for one place: the relay (a storage node's address), the address there, and the key to seal to. */
export interface PushTarget {
  relay: string;
  address: string;
  key: Did;
}

/** What a sender seals to a target's key: the notification, in short (the service worker shows it). */
export interface PushNotice {
  title: string;
  text?: string;
  /** Where a tap leads: the place, as a notice says it. */
  open?: Notice['open'];
  /** Several from one place replace each other. */
  tag?: string;
}

/** A browser with pushes on: its own addresses and keys, one per place, made and taken back there. */
export interface PushHost {
  /** This browser, among its person's (each says its targets apart). */
  device: string;
  /** The target this browser has for a place, if any. */
  targetFor(space: string): Promise<PushTarget | undefined>;
  /** A new address and key for a place (a new one each time: the old one goes with drop). */
  make(space: string): Promise<PushTarget>;
  /** Take a place's address back: the relay forgets it, the key goes. */
  drop(space: string): Promise<void>;
}

/** Hand a sealed notice to a target's relay. */
export type PushSend = (target: PushTarget, message: { from: Did; sealed: Json }) => Promise<void>;

/** A rule from the notification settings (Unread's): who or where, and whether it notifies. */
interface Rule {
  who?: string;
  space?: string;
  board?: string;
  notify?: boolean;
}

export interface PushTargetsHost {
  me(): Did;
  places(): Array<{ space: StoredSpace; peer?: Did }>;
  state(space: StoredSpace): SpaceState;
  entries(space: StoredSpace): Entry[];
  publish(input: { kind: string; body: Json; space: string }): Promise<unknown>;
  encryptionKeyOf(person: Did): Did;
  tryOpen<T>(open: (me: { keys: { secretKey: Uint8Array; publicKey: Uint8Array } }) => T | undefined): T | undefined;
  nameOf(did: Did): string | undefined;
  spaceName(space: StoredSpace): string;
  rules(): Promise<Rule[]>;
}

/** By default (a computer): post it to the relay. */
export const postPush: PushSend = async (target, message) => {
  const relay = new URL(target.relay);
  if (relay.protocol !== 'https:' && !(relay.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(relay.hostname))) return;
  const res = await fetch(new URL(`/push/${encodeURIComponent(target.address)}`, relay), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(message), signal: AbortSignal.timeout(10_000) });
  if (!res.ok && res.status !== 404) throw new Error(`${relay.host} didn't take the push: ${res.status}`);
};

const MAX_TEXT = 160;

export class PushTargets {
  #host?: PushHost;
  #send: PushSend = postPush;
  #timer?: ReturnType<typeof setTimeout>;
  #running?: Promise<void>;
  #again = false;

  readonly h: PushTargetsHost;

  constructor(h: PushTargetsHost) {
    this.h = h;
  }

  /** A browser turning pushes on (a host) or off (none: every place's address taken back first). */
  async setHost(host: PushHost | undefined): Promise<void> {
    if (!host && this.#host) {
      const before = this.#host;
      await this.#settle();
      for (const { space } of this.h.places()) await this.#takeBack(before, space).catch(() => undefined);
    }
    this.#host = host;
    if (host) this.changed(0);
  }

  get on(): boolean {
    return !!this.#host;
  }

  /** How sealed notices leave this node (a browser: through its own storage node). */
  setSender(send: PushSend): void {
    this.#send = send;
  }

  /** Something changed (a place, its managers, a rule): look again, a moment later. */
  changed(delay = 3000): void {
    if (!this.#host) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.reconcile(), delay);
    this.#timer.unref?.();
  }

  async #settle(): Promise<void> {
    clearTimeout(this.#timer);
    await this.#running?.catch(() => undefined);
  }

  /** Every place's target as it should be: there and sealed to its managers now, or taken back. */
  reconcile(): Promise<void> {
    if (this.#running) {
      this.#again = true;
      return this.#running;
    }
    this.#running = this.#reconcile()
      .catch((error: Error) => console.warn('weave: push targets:', error.message))
      .finally(() => {
        this.#running = undefined;
        if (this.#again) {
          this.#again = false;
          this.changed(500);
        }
      });
    return this.#running;
  }

  async #reconcile(): Promise<void> {
    const host = this.#host;
    if (!host) return;
    const rules = await this.h.rules().catch(() => [] as Rule[]);
    for (const { space, peer } of this.h.places()) {
      if (this.#host !== host) return;
      const state = this.h.state(space);
      const recipients = this.#recipients(space, state, peer);
      const wanted = !state.closed && recipients.length > 0 && notifies(rules, space.id, peer);
      if (!wanted) {
        await this.#takeBack(host, space);
        continue;
      }
      const said = this.#said(space, host.device);
      const target = await host.targetFor(space.id);
      const sealedTo = (said && !said.off ? Object.keys(said.boxes ?? {}) : []) as Did[];
      if (target && sealedTo.length === recipients.length && recipients.every((d) => sealedTo.includes(d))) continue;
      // Someone who managed it no more knows the old address: a new one, then.
      const gone = sealedTo.some((d) => !recipients.includes(d));
      if (target && gone) await host.drop(space.id);
      const now = target && !gone ? target : await host.make(space.id);
      const boxes: Record<string, Json> = {};
      for (const did of recipients) boxes[did] = boxTo(this.h.encryptionKeyOf(did), now as unknown as Json) as unknown as Json;
      await this.h.publish({ kind: KIND_PUSH_TARGET, body: { device: host.device, boxes }, space: space.id });
    }
  }

  /** Who may push here: those who manage the place, or the other one in a direct chat; never me. */
  #recipients(space: StoredSpace, state: SpaceState, peer?: Did): Did[] {
    const me = this.h.me();
    const all = space.kind === 'direct' ? (peer ? [peer] : []) : [...managersOf(state)].filter((d) => state.members.has(d));
    return [...new Set(all)].filter((d) => d !== me).sort();
  }

  /** What this browser said last in a place. */
  #said(space: StoredSpace, device: string): { boxes?: Record<string, Box>; off?: boolean } | undefined {
    const me = this.h.me();
    let last: { boxes?: Record<string, Box>; off?: boolean } | undefined;
    for (const e of this.h.entries(space)) {
      if (e.kind !== KIND_PUSH_TARGET || e.event.author !== me) continue;
      const body = e.body as { device?: string; boxes?: Record<string, Box>; off?: boolean } | null;
      if (body?.device === device) last = body;
    }
    return last;
  }

  async #takeBack(host: PushHost, space: StoredSpace): Promise<void> {
    const said = this.#said(space, host.device);
    if (await host.targetFor(space.id)) await host.drop(space.id);
    if (said && !said.off) await this.h.publish({ kind: KIND_PUSH_TARGET, body: { device: host.device, off: true }, space: space.id });
  }

  /** The targets in a place that I may push to: each browser's latest, of those still in it, sealed to me. */
  targetsIn(place: StoredSpace | string): Array<{ person: Did; target: PushTarget }> {
    const space = typeof place === 'string' ? this.h.places().find((p) => p.space.id === place)?.space : place;
    if (!space) return [];
    const me = this.h.me();
    const latest = new Map<string, { person: Did; boxes?: Record<string, Box>; off?: boolean }>();
    for (const e of this.h.entries(space)) {
      if (e.kind !== KIND_PUSH_TARGET || e.event.author === me) continue;
      const body = e.body as { device?: string; boxes?: Record<string, Box>; off?: boolean } | null;
      if (typeof body?.device !== 'string') continue;
      latest.set(`${e.event.author} ${body.device}`, { person: e.event.author, boxes: body.boxes, off: body.off });
    }
    const out: Array<{ person: Did; target: PushTarget }> = [];
    for (const { person, boxes, off } of latest.values()) {
      const box = !off && boxes?.[me];
      if (!box) continue;
      const target = this.h.tryOpen((r) => {
        try {
          return openBox(r.keys.secretKey, r.keys.publicKey, box) as unknown as PushTarget;
        } catch {
          return undefined;
        }
      });
      if (target && typeof target.relay === 'string' && typeof target.address === 'string' && typeof target.key === 'string') out.push({ person, target });
    }
    return out;
  }

  /** I wrote a message in a place: tell those there whose browsers are closed (those that gave me their address). */
  async said(space: StoredSpace, body: { text?: string; file?: { name?: string }; channel?: string; post?: string }): Promise<number> {
    const targets = this.targetsIn(space);
    if (!targets.length) return 0;
    const me = this.h.me();
    const name = this.h.nameOf(me) ?? 'Someone';
    const raw = body.text?.trim() || (body.file?.name ? `📎 ${body.file.name}` : '');
    const text = raw.length > MAX_TEXT ? `${raw.slice(0, MAX_TEXT - 1)}…` : raw;
    let sent = 0;
    await Promise.all(
      targets.map(async ({ person, target }) => {
        const where = space.kind === 'direct' ? undefined : this.h.spaceName(space);
        const notice: PushNotice = {
          title: where ? `${name} · ${where}` : name,
          ...(text ? { text } : {}),
          open: { space: { id: space.id, kind: space.kind, name: where ?? name }, ...(body.channel ? { channel: body.channel } : {}), ...(body.post ? { post: body.post } : {}) },
          tag: space.id,
        };
        try {
          await this.#send(target, { from: me, sealed: boxTo(target.key, notice as unknown as Json) as unknown as Json });
          sent++;
        } catch (error) {
          console.warn(`weave: a push to ${this.h.nameOf(person) ?? person} didn't go out:`, (error as Error).message);
        }
      }),
    );
    return sent;
  }
}

/** Whether a place notifies, by the most specific rule (a person's for a direct chat, then the place's, then all). */
export function notifies(rules: Rule[], space: string, peer?: Did): boolean {
  let best: Rule | undefined;
  let score = -1;
  for (const rule of rules) {
    if (rule.board) continue;
    if (rule.who && (!peer || rule.who !== peer)) continue;
    if (rule.space && rule.space !== space) continue;
    const s = (rule.who ? 4 : 0) + (rule.space ? 2 : 0);
    if (s >= score) {
      best = rule;
      score = s;
    }
  }
  return !best || best.notify !== false;
}

