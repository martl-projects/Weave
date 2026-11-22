import type { Json } from './bytes.ts';
import type { Did } from './keys.ts';

/*
 * Mirrors: a release file a member's Weave fetched from its provider (GitHub, say) and checked, kept by it as
 * encrypted blobs in the project, so others can put it together from whoever holds them, like a release from Weave.
 * That is how a page (Weave Web) gets a lens's or a widget's release from GitHub: GitHub's download host lets no page
 * read it, and a page runs no fetcher with a network. Any member may say so; nobody is trusted for it: whoever
 * assembles the file checks it against the size and SHA-256 the release itself names, and a mirror that doesn't
 * match is simply passed over.
 *
 *   weave.artifact.mirror  {release, platform, file, size, sha256, parts: [{hash, key}]}
 *                          by a member of the project; the newest per release and platform first
 */
export const KIND_ARTIFACT_MIRROR = 'weave.artifact.mirror';

export interface ArtifactMirror {
  /** The weave.artifact.mirror event. */
  id: string;
  /** The release (its weave.app event's id) and which of its files: "wasm", "file", or a platform. */
  release: string;
  platform: string;
  file: string;
  size: number;
  sha256: string;
  /** Its blobs, in order: each one's hash and the key that opens it. */
  parts: Array<{ hash: string; key: string }>;
  by: Did;
  time: string;
}

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const HEX64 = /^[0-9a-f]{64}$/;
/** At most this many parts: a mirror is for files a page fetches (32 MB in parts of about 4 MB). */
const MAX_PARTS = 64;

/** A mirror's body from untrusted input, or undefined. */
export function parseArtifactMirror(body: unknown): Omit<ArtifactMirror, 'id' | 'by' | 'time'> | undefined {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return undefined;
  const b = body as Record<string, unknown>;
  const release = typeof b.release === 'string' ? b.release : '';
  const platform = typeof b.platform === 'string' ? b.platform : '';
  const file = typeof b.file === 'string' ? b.file.slice(0, 200) : '';
  const size = Number(b.size);
  const sha256 = typeof b.sha256 === 'string' ? b.sha256.toLowerCase() : '';
  if (!ID.test(release) || !/^[a-z0-9-]{1,40}$/.test(platform) || !file || !Number.isSafeInteger(size) || size <= 0 || !HEX64.test(sha256)) return undefined;
  if (!Array.isArray(b.parts) || !b.parts.length || b.parts.length > MAX_PARTS) return undefined;
  const parts: Array<{ hash: string; key: string }> = [];
  for (const p of b.parts) {
    const part = (p && typeof p === 'object' ? p : {}) as Record<string, unknown>;
    if (typeof part.hash !== 'string' || typeof part.key !== 'string' || part.hash.length > 200 || part.key.length > 200) return undefined;
    parts.push({ hash: part.hash, key: part.key });
  }
  return { release, platform, file, size, sha256, parts };
}

/** The mirrors of one release file in a space, newest first: by its members only (`members`). */
export function mirrorsOf(entries: Array<{ id: string; kind: string; body: Json; event: { author: Did; time: string } }>, members: (did: Did) => boolean, release: string, platform: string): ArtifactMirror[] {
  const out: ArtifactMirror[] = [];
  for (const e of entries) {
    if (e.kind !== KIND_ARTIFACT_MIRROR || !members(e.event.author)) continue;
    const m = parseArtifactMirror(e.body);
    if (!m || m.release !== release || m.platform !== platform) continue;
    out.push({ ...m, id: e.id, by: e.event.author, time: e.event.time });
  }
  return out.sort((a, b) => b.time.localeCompare(a.time));
}
