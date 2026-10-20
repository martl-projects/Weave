import type { Json } from './bytes.ts';
import type { Did } from './keys.ts';
import { isDid } from './keys.ts';
import { isRepoName } from './github.ts';

/*
 * Rooms and shared apps. A project can declare an app (its manifest); a host
 * opens a room and shares that app from their computer, and players use it
 * through an encrypted tunnel, as if it ran on theirs.
 *
 *   weave.app    {app, name, version, services, start}   a maintainer publishes the project's app manifest;
 *                                                       start: {hint, command}: how the host starts the app; Weave
 *                                                       runs the command only on the host's say-so (see node)
 *                                                       install: {github, tag, assets, steps}: where hosts get the app,
 *                                                       see AppInstall
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
  /**
   * How to start the app on the host's computer. `hint` is shown to people;
   * `command` (program and arguments, no shell) can be run by Weave in the
   * host's own copy of the app, after the host has seen and approved it.
   */
  start?: { hint?: string; command?: string[] };
  /** How hosts get the app onto their computer. */
  install?: AppInstall;
}

/**
 * Getting the app: release files on GitHub, one per platform, each with the
 * SHA-256 a maintainer published here (Weave refuses a file that doesn't
 * match, whatever GitHub serves), and steps for an agent where there's no
 * file for your computer (building from source and the like).
 */
export interface AppInstall {
  /** owner/name of the repository whose release holds the files. */
  github?: string;
  /** The release's tag, like v1.4: also the version people see. */
  tag?: string;
  /** By platform, as Node names it (win32-x64, darwin-arm64, linux-x64…): the release file. */
  assets?: Record<string, AppAsset>;
  /** For an agent installing it by hand. */
  steps?: string[];
}

export interface AppAsset {
  /** The file's name in the release. */
  file: string;
  sha256: string;
  /** In bytes. */
  size?: number;
}

const PLATFORM = /^(win32|darwin|linux)-(x64|arm64|ia32|arm)$/;
const TAG = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$/;

/** An install block from untrusted input; undefined when it says nothing usable. */
export function parseInstall(input: unknown): AppInstall | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const i = input as Record<string, unknown>;
  const steps = Array.isArray(i.steps) ? i.steps.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 500)).slice(0, 30) : [];
  const assets: Record<string, AppAsset> = {};
  if (i.assets && typeof i.assets === 'object') {
    for (const [platform, raw] of Object.entries(i.assets as Record<string, unknown>).slice(0, 12)) {
      const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const file = text(a.file, 200);
      const sha256 = text(a.sha256, 64).toLowerCase();
      if (!PLATFORM.test(platform) || !file || /[\\/]/.test(file) || !/^[0-9a-f]{64}$/.test(sha256)) throw new Error(`install.assets.${platform}: needs "file" (a name in the release) and its "sha256"`);
      const size = Number(a.size);
      assets[platform] = { file, sha256, ...(Number.isInteger(size) && size > 0 ? { size } : {}) };
    }
  }
  const has = Object.keys(assets).length > 0;
  const github = text(i.github, 140);
  const tag = text(i.tag, 100);
  if (has && !isRepoName(github)) throw new Error('"install.github" is the repository, owner/name');
  if (has && !TAG.test(tag)) throw new Error('"install.tag" is the tag of the release, like v1.4');
  if (!has && !steps.length) return undefined;
  return { ...(has ? { github, tag, assets } : {}), ...(steps.length ? { steps } : {}) };
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
  const rawStart = (m.start && typeof m.start === 'object' ? m.start : {}) as Record<string, unknown>;
  const hint = text(rawStart.hint, 200);
  let command: string[] | undefined;
  if (rawStart.command !== undefined) {
    const parts = rawStart.command;
    if (!Array.isArray(parts) || parts.length === 0 || parts.length > 32 || !parts.every((p) => typeof p === 'string' && p.length > 0 && p.length <= 500 && !p.includes('\0'))) {
      throw new Error('"start.command" is the program and its arguments, e.g. ["node", "server.js"]');
    }
    command = parts as string[];
  }
  const start = hint || command ? { ...(hint ? { hint } : {}), ...(command ? { command } : {}) } : undefined;
  const install = parseInstall(m.install);
  return { app, name, version: Number.isInteger(m.version) ? (m.version as number) : 1, services, ...(start ? { start } : {}), ...(install ? { install } : {}) };
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
