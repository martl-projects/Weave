import type { Json } from './bytes.ts';
import type { Did } from './keys.ts';
import { isDid } from './keys.ts';

/*
 * Rooms and shared apps. A project can declare an app (its manifest); a host
 * opens a room and shares that app from their computer, and players use it
 * through an encrypted tunnel, as if it ran on theirs.
 *
 *   weave.app    {app, name, version, services, start}   a maintainer publishes the project's app manifest;
 *                                                       sealed in the project, the latest by a maintainer counts
 *   weave.room   {room, name, service, key, invite, open}
 *                                                       the host announces a room (open) or ends it (open: false);
 *                                                       `key` is the room's DHT public key, so only participants find it
 *
 * Who is in a room, what they say there and the app's traffic never touch the logs.
 */
export const KIND_APP = 'weave.app';
export const KIND_ROOM = 'weave.room';

export interface AppService {
  id: string;
  /** The port on the host's computer. */
  port: number;
  protocol: 'http' | 'tcp';
  /** Which page each side opens, and the button label. */
  open?: { host?: { path: string; label: string }; joiner?: { path: string; label: string } };
}

export interface AppManifest {
  app: string;
  name: string;
  version: number;
  /** The only ports a room may ever forward. */
  services: AppService[];
  /** Shown to the host; never run by Weave. */
  start?: { hint: string };
}

const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;
const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');
const path = (value: unknown): string => {
  const p = text(value, 200);
  return p.startsWith('/') ? p : `/${p}`;
};

/** A manifest checked and cleaned, or an error saying what's wrong with it. */
export function parseManifest(input: unknown): AppManifest {
  const m = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const app = text(m.app, 32);
  if (!SLUG.test(app)) throw new Error('"app" is a short id: lowercase letters, digits and dashes');
  const name = text(m.name, 40) || app;
  if (!Array.isArray(m.services) || m.services.length === 0) throw new Error('"services" lists at least one port to share');
  const services = m.services.slice(0, 8).map((raw, i): AppService => {
    const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const port = Number(s.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`service ${i + 1}: "port" is 1 to 65535`);
    const id = text(s.id, 32) || `service-${i + 1}`;
    if (!SLUG.test(id)) throw new Error(`service ${i + 1}: "id" uses lowercase letters, digits and dashes`);
    const protocol = s.protocol === 'tcp' ? 'tcp' : 'http';
    const open = (s.open && typeof s.open === 'object' ? s.open : {}) as Record<string, Record<string, unknown> | undefined>;
    const side = (o: Record<string, unknown> | undefined, label: string) => (o ? { path: path(o.path), label: text(o.label, 30) || label } : undefined);
    const host = side(open.host, 'Open');
    const joiner = side(open.joiner, 'Play');
    return { id, port, protocol, ...(host || joiner ? { open: { ...(host ? { host } : {}), ...(joiner ? { joiner } : {}) } } : {}) };
  });
  const start = m.start && typeof m.start === 'object' ? text((m.start as Record<string, unknown>).hint, 200) : '';
  return { app, name, version: Number.isInteger(m.version) ? (m.version as number) : 1, services, ...(start ? { start: { hint: start } } : {}) };
}

export interface Room {
  id: string;
  host: Did;
  name: string;
  /** Which of the app's services is shared. */
  service: string;
  /** The room's DHT public key (hex). */
  key: string;
  /** Who may join: every participant, or these people. */
  invite: 'participants' | Did[];
  open: boolean;
  time: string;
}

/** Rooms from announcements, the latest per room by its host counting. */
export function roomsOf(entries: Array<{ event: { author: Did; time: string }; kind: string; body: Json }>): Room[] {
  const rooms = new Map<string, Room>();
  for (const e of [...entries].filter((x) => x.kind === KIND_ROOM).sort((a, b) => a.event.time.localeCompare(b.event.time))) {
    const b = (e.body && typeof e.body === 'object' ? e.body : {}) as Record<string, unknown>;
    const id = text(b.room, 64);
    if (!id) continue;
    const before = rooms.get(id);
    if (before && before.host !== e.event.author) continue; // only the host changes a room
    if (b.open === false) {
      if (before) before.open = false;
      continue;
    }
    const key = text(b.key, 64);
    if (!/^[0-9a-f]{64}$/.test(key)) continue;
    const invite = Array.isArray(b.invite) ? b.invite.filter(isDid) : 'participants';
    rooms.set(id, { id, host: e.event.author, name: text(b.name, 60) || 'Room', service: text(b.service, 32), key, invite, open: true, time: e.event.time });
  }
  return [...rooms.values()];
}
