import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkManifest, type AppManifest } from '@weave/core';

/*
 * Services Weave ships: WebAssembly components built from packages/shipped by Weave's own build, next to the daemon
 * (shipped/) or, in a checkout, in packages/shipped/dist. Each is known by its SHA-256: a packaged daemon has the
 * digests built into it (WEAVE_SHIPPED), so a file changed on disk doesn't start, and every member's Weave can tell
 * whether a service's profile claims exactly what their own Weave ships.
 *
 *   shipped.json  {"<name>": {"component": "<name>.wasm", "digest": "sha256:…", "manifest": {weave.app.json}}}
 */

declare const WEAVE_SHIPPED: Record<string, string> | undefined;

export interface ShippedService {
  name: string;
  /** sha256:<hex> of its component. */
  digest: string;
  manifest: AppManifest;
  /** What it's for, in a sentence or two (its README's first paragraph). */
  about?: string;
  /** Its component, and its site's folder if it has one. */
  file: string;
  site?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
/** Where the shipped services are: next to the packaged daemon, or built in a checkout. */
export const SHIPPED_DIR = [join(here, 'shipped'), join(here, '..', '..', 'shipped', 'dist')].find((dir) => existsSync(join(dir, 'shipped.json')));

/** The digests this Weave was built with: the packaged daemon's own; in a checkout, those its build wrote. */
const builtIn = (): Record<string, string> | undefined => (typeof WEAVE_SHIPPED === 'undefined' ? undefined : WEAVE_SHIPPED);

export const digestOf = (file: string): string => `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`;

/** The services this Weave ships, from a folder (tests give their own). */
export function shippedServices(dir: string | undefined = SHIPPED_DIR): Map<string, ShippedService> {
  const out = new Map<string, ShippedService>();
  if (!dir || !existsSync(join(dir, 'shipped.json'))) return out;
  const listed = JSON.parse(readFileSync(join(dir, 'shipped.json'), 'utf8')) as Record<string, { component?: unknown; digest?: unknown; manifest?: unknown; about?: unknown; site?: unknown }>;
  const digests = builtIn();
  for (const [name, entry] of Object.entries(listed)) {
    const manifest = checkManifest(entry.manifest).manifest;
    const digest = digests ? digests[name] : entry.digest;
    if (!manifest || typeof entry.component !== 'string' || typeof digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(digest)) continue;
    out.set(name, { name, digest, manifest, ...(typeof entry.about === 'string' ? { about: entry.about.slice(0, 400) } : {}), file: join(dir, entry.component), ...(typeof entry.site === 'string' ? { site: join(dir, entry.site) } : {}) });
  }
  return out;
}

/** Why a shipped service's file can't run (it isn't there, or isn't what this Weave ships), or undefined: it can. */
export function shippedProblem(s: ShippedService): string | undefined {
  if (!existsSync(s.file)) return `${s.name}'s component isn't next to Weave (${s.file})`;
  const digest = digestOf(s.file);
  return digest === s.digest ? undefined : `${s.name}'s component isn't what this Weave ships: it is ${digest}, Weave ships ${s.digest}`;
}
