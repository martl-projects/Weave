// Weave releases: publishes a project's releases from a folder on a maintainer's computer. Their Weave packs the
// folder's files into encrypted blobs in the project and asks this service to publish the release: it checks what it
// was given (the manifest, each file's size, SHA-256 and blobs) and publishes it as the project's weave.app, with the
// project itself as its source. Members' Weave fetches those files itself, from whoever holds the blobs, and checks
// each one against what is published here: this service never hands a file out.
import { answer, load, publish, release, save } from 'weave:service/host@0.1.0';

/** A release is at most this big, all its files together. */
const MAX_RELEASE = 32 * 1024 * 1024;
/** A blob holds at most this much (Weave's MAX_BLOB), less what encrypting it adds. */
const MAX_PART = 2 * 1024 * 1024 - 512;
const TAG = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,99}$/;
const PLATFORM = /^((win32|darwin|linux)-(x64|arm64|ia32|arm)|wasm|file)$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,39}$/;
const BLOB = /^[A-Za-z0-9_-]{43}$/;

export function onEvent(text) {
  const item = JSON.parse(text);
  if (item.kind !== 'weave.service.request') return;
  const body = item.body ?? {};
  const data = body.data ?? {};
  try {
    // Asked where a file is: Weave fetches a release from Weave itself, from the blobs in the project.
    if (data.protocol === 'artifact.fetch') return void answer(item.id, undefined, undefined, 'a release from Weave is fetched by Weave itself, from the blobs in its project: nothing to hand out');
    if (body.action === 'publish') return void published(item, data);
    if (body.action === 'releases') return void answer(item.id, undefined, JSON.stringify(releases(item.space.id, item.space.name)), undefined);
    answer(item.id, "I publish releases from a maintainer's folder: weave app release <tag> --from <folder> -p <project>.", undefined, undefined);
  } catch (error) {
    answer(item.id, undefined, undefined, String(error?.payload ?? error?.message ?? error));
  }
}

/** Check what a maintainer's Weave hands over, publish it as the project's release, and say what was published. */
function published(item, data) {
  const space = item.space.id;
  const tag = typeof data.tag === 'string' ? data.tag.trim() : '';
  if (!TAG.test(tag)) throw new Error('a release needs a tag, like v1.0 or dev-3');
  if (data.source !== undefined && data.source !== space) throw new Error('a release from Weave comes from the project it is published in');
  const manifest = data.manifest;
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('weave.app.json is missing: the folder needs one');
  if (typeof manifest.app !== 'string' || !SLUG.test(manifest.app)) throw new Error('weave.app.json: "app" is its id (lowercase letters, digits and dashes)');
  if (typeof manifest.name !== 'string' || !manifest.name.trim()) throw new Error('weave.app.json: "name" is what it is called');
  const given = data.assets && typeof data.assets === 'object' && !Array.isArray(data.assets) ? Object.entries(data.assets) : [];
  if (!given.length) throw new Error('a release brings its files: none were given');
  if (given.length > 12) throw new Error('at most 12 files a release');
  let total = 0;
  const assets = {};
  for (const [platform, raw] of given) {
    const a = raw ?? {};
    if (!PLATFORM.test(platform)) throw new Error(`${platform}: a file is for a platform (wasm, linux-x64, …) or "file"`);
    if (typeof a.file !== 'string' || !a.file || a.file.length > 200 || /[\\/]/.test(a.file)) throw new Error(`${platform}: its file needs a name (no folders)`);
    if (typeof a.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(a.sha256)) throw new Error(`${a.file}: its SHA-256 is missing`);
    if (!Number.isInteger(a.size) || a.size < 1) throw new Error(`${a.file}: its size is missing`);
    total += a.size;
    if (total > MAX_RELEASE) throw new Error(`a release from Weave is at most ${MAX_RELEASE / 1024 / 1024} MB: put a bigger one on GitHub`);
    const parts = Array.isArray(a.parts) ? a.parts : [];
    if (!parts.length || parts.length > Math.ceil(a.size / MAX_PART) + 1) throw new Error(`${a.file}: ${parts.length} blobs don't fit its ${a.size} bytes`);
    for (const p of parts) if (!p || !BLOB.test(p.hash ?? '') || !BLOB.test(p.key ?? '')) throw new Error(`${a.file}: a blob without its hash and key`);
    assets[platform] = { file: a.file, sha256: a.sha256, size: a.size, parts: parts.map((p) => ({ hash: p.hash, key: p.key })) };
  }
  const { install: _install, ...rest } = manifest;
  const body = { ...rest, install: { tag, source: { provider: 'weave', ref: space }, assets } };
  const out = JSON.parse(publish(space, 'weave.app', JSON.stringify(body)));
  const kept = JSON.parse(load('releases.json') ?? '[]');
  kept.push({ space, id: out.id, tag, app: manifest.app, name: manifest.name, files: Object.keys(assets).length, time: out.time ?? new Date().toISOString() });
  save('releases.json', JSON.stringify(kept.slice(-500)));
  answer(item.id, `${manifest.name} ${tag} is released`, JSON.stringify({ id: out.id, manifest: body }), undefined);
}

/** The releases published here from Weave, newest first, as long as the project still has them. */
function releases(space, name) {
  const kept = JSON.parse(load('releases.json') ?? '[]').filter((r) => r.space === space && release(space, r.id));
  return {
    repo: name ?? space,
    where: "Weave: published from a maintainer's folder (weave app release <tag> --from <folder>)",
    ...(kept.length ? {} : { empty: 'Nothing released from Weave yet: weave app release <tag> --from <folder> -p <project>' }),
    releases: kept.reverse().map((r) => ({ tag: r.tag, name: r.name, published: r.time, files: r.files, prerelease: false })),
  };
}
