import type { Json } from './bytes.ts';
import type { Did } from './keys.ts';
import { IMAGE_REF, type AppImage } from './rooms.ts';

/*
 * Catalogs: a space whose maintainers list artifacts in it, for its people to find and install. Any space can be
 * one, and anyone can host one. An entry points at a release by where it comes from (its project and release, ids
 * only) and, for a Weave service, at its image by digest. Whoever installs it reads the manifest from the image
 * itself, at that digest: the catalog is trusted for what it recommends, never for what runs.
 *
 *   weave.catalog.entry  {app, name, summary?, origin: {project, release, tag}, image: {ref, tag, digest}, removed?}
 *                        by a maintainer of the space; the latest per app counts (removed: taken off the list)
 */
export const KIND_CATALOG_ENTRY = 'weave.catalog.entry';

export interface CatalogEntry {
  /** The weave.catalog.entry event. */
  id: string;
  /** The app's id: one entry per app in a catalog. */
  app: string;
  name: string;
  summary: string;
  /** The release it comes from: its project and the weave.app event, ids only. */
  origin: { project: string; release: string; tag: string };
  /** The Weave service's image, pinned by digest. */
  image: AppImage;
  /** The maintainer who listed it. */
  by: Did;
  time: string;
}

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** An entry's body from untrusted input (what a maintainer lists), or undefined. */
export function parseCatalogEntry(body: unknown): Omit<CatalogEntry, 'id' | 'by' | 'time'> | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const b = body as Record<string, unknown>;
  const app = text(b.app, 32);
  const origin = (b.origin && typeof b.origin === 'object' ? b.origin : {}) as Record<string, unknown>;
  const image = (b.image && typeof b.image === 'object' ? b.image : {}) as Record<string, unknown>;
  if (!/^[a-z0-9][a-z0-9-]{0,31}$/.test(app) || !ID.test(text(origin.project, 100)) || !ID.test(text(origin.release, 100)) || !text(origin.tag, 100)) return undefined;
  if (!IMAGE_REF.test(text(image.ref, 255)) || !text(image.tag, 128) || !DIGEST.test(text(image.digest, 80))) return undefined;
  return {
    app,
    name: text(b.name, 60) || app,
    summary: text(b.summary, 500),
    origin: { project: text(origin.project, 100), release: text(origin.release, 100), tag: text(origin.tag, 100) },
    image: { ref: text(image.ref, 255), tag: text(image.tag, 128), digest: text(image.digest, 80), packaged: true },
  };
}

/** A catalog's entries, newest first: the latest per app, by a maintainer of the space, unless taken off. */
export function catalogOf(entries: Array<{ id: string; kind: string; body: Json; event: { author: Did; time: string } }>, maintainers: Set<Did>): CatalogEntry[] {
  const latest = new Map<string, CatalogEntry | undefined>();
  for (const e of [...entries].filter((x) => x.kind === KIND_CATALOG_ENTRY && maintainers.has(x.event.author)).sort((a, b) => a.event.time.localeCompare(b.event.time))) {
    const body = (e.body && typeof e.body === 'object' && !Array.isArray(e.body) ? e.body : {}) as Record<string, unknown>;
    if (body.removed === true && typeof body.app === 'string') {
      latest.set(body.app, undefined);
      continue;
    }
    const parsed = parseCatalogEntry(body);
    if (parsed) latest.set(parsed.app, { ...parsed, id: e.id, by: e.event.author, time: e.event.time });
  }
  return [...latest.values()].filter((x): x is CatalogEntry => !!x).sort((a, b) => b.time.localeCompare(a.time));
}
