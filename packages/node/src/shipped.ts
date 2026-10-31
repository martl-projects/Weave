import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkManifest, parsePack, type AppManifest, type Pack } from '@weave/core';

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
  /** Its panels' pages: shown in its card to whoever may see each. */
  panel?: string;
}

const here = dirname(fileURLToPath(import.meta.url));
/** Where the shipped services are: next to the packaged daemon, or built in a checkout. */
export const SHIPPED_DIR = [join(here, 'shipped'), join(here, '..', '..', 'shipped', 'dist')].find((dir) => existsSync(join(dir, 'shipped.json')));

/** The digests this Weave was built with: the packaged daemon's own; in a checkout, those its build wrote. */
const builtIn = (): Record<string, string> | undefined => (typeof WEAVE_SHIPPED === 'undefined' ? undefined : WEAVE_SHIPPED);

export const digestOf = (file: string): string => `sha256:${createHash('sha256').update(readFileSync(file)).digest('hex')}`;

/** The services this Weave ships, from a folder (tests give their own). */
/** When the folder's list last changed: what's kept of it is read again after a build (shipped.json's time). */
export function shippedStamp(dir: string | undefined): string {
  try {
    return dir ? `${dir}|${statSync(join(dir, 'shipped.json')).mtimeMs}` : '';
  } catch {
    return `${dir}|`;
  }
}

export function shippedServices(dir: string | undefined = SHIPPED_DIR): Map<string, ShippedService> {
  const out = new Map<string, ShippedService>();
  if (!dir || !existsSync(join(dir, 'shipped.json'))) return out;
  const listed = JSON.parse(readFileSync(join(dir, 'shipped.json'), 'utf8')) as Record<string, { component?: unknown; digest?: unknown; manifest?: unknown; about?: unknown; site?: unknown; panel?: unknown }>;
  const digests = builtIn();
  for (const [name, entry] of Object.entries(listed)) {
    const manifest = checkManifest(entry.manifest).manifest;
    const digest = digests ? digests[name] : entry.digest;
    if (!manifest || typeof entry.component !== 'string' || typeof digest !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(digest)) continue;
    out.set(name, { name, digest, manifest, ...(typeof entry.about === 'string' ? { about: entry.about.slice(0, 400) } : {}), file: join(dir, entry.component), ...(typeof entry.site === 'string' ? { site: join(dir, entry.site) } : {}), ...(typeof entry.panel === 'string' ? { panel: join(dir, entry.panel) } : {}) });
  }
  return out;
}

/** The setup packs this Weave ships (packs.json beside its services): checked as catalogs' are. */
export function shippedPacks(dir: string | undefined = SHIPPED_DIR): Pack[] {
  if (!dir || !existsSync(join(dir, 'packs.json'))) return [];
  try {
    const all = JSON.parse(readFileSync(join(dir, 'packs.json'), 'utf8')) as unknown[];
    return all.flatMap((p) => (parsePack(p).pack ? [parsePack(p).pack!] : []));
  } catch {
    return [];
  }
}

/** Why a shipped service's file can't run (it isn't there, or isn't what this Weave ships), or undefined: it can. */
export function shippedProblem(s: ShippedService): string | undefined {
  if (!existsSync(s.file)) return `${s.name}'s component isn't next to Weave (${s.file})`;
  const digest = digestOf(s.file);
  return digest === s.digest ? undefined : `${s.name}'s component isn't what this Weave ships: it is ${digest}, Weave ships ${s.digest}`;
}
