import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath, sep } from 'node:path';
import { type AppAsset, type AppManifest, checkManifest, decryptBlob, encryptBlob, MAX_BLOB } from '@weave/core';

/*
 * Releases from Weave: a maintainer's folder, published without GitHub. Its weave.app.json names what it brings (a
 * WebAssembly component, its site and panel); those are packed into one archive for "wasm", the same as a release
 * file would be, and the archive is kept as encrypted blobs in the project. The project's Weave releases service
 * publishes the release with each file's size, SHA-256 and blobs; every member's Weave fetches the blobs from whoever
 * holds them, puts the file together and checks it against what the maintainer signed, before anything unpacks it.
 */

/** A release from Weave is at most this big, all its files together. */
export const MAX_WEAVE_RELEASE = 32 * 1024 * 1024;
/** What one blob holds of a file: a blob is at most MAX_BLOB once encrypted (nonce, tag and media type added). */
export const WEAVE_PART = MAX_BLOB - 512;
/** The media type its blobs carry. */
const PART_TYPE = 'application/octet-stream';

/** The provider a release from Weave names as its source. */
export const WEAVE_SOURCE = 'weave';

/** A folder to release: its manifest (as written) and its files, each for a platform (wasm), as bytes. */
export interface PackedRelease {
  manifest: Record<string, unknown>;
  files: Record<string, { file: string; bytes: Uint8Array }>;
}

/** The system's tar (bsdtar on Windows and macOS, GNU or bsd tar on Linux): what unpacks release files too. */
const tar = () => (process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar');

/** A path the manifest names, inside the folder (nothing outside it). */
function inside(folder: string, path: string, what: string): string {
  const full = resolvePath(folder, path);
  if (full !== folder && !full.startsWith(folder.endsWith(sep) ? folder : folder + sep)) throw new Error(`weave.app.json: ${what} "${path}" is outside the folder`);
  if (!existsSync(full)) throw new Error(`${what} "${path}" isn't in ${folder}: build it first`);
  return full;
}

/**
 * Read a folder to release: its weave.app.json, checked, and what it names packed into one archive for "wasm" (its
 * component, and its site and panel folders), as tar.gz. What it can't release from Weave is said plainly.
 */
export function packFolder(from: string): PackedRelease {
  const folder = resolvePath(from);
  if (!existsSync(folder) || !statSync(folder).isDirectory()) throw new Error(`${from} isn't a folder on this computer`);
  const file = join(folder, 'weave.app.json');
  if (!existsSync(file)) throw new Error(`${folder} has no weave.app.json: it says what the release is`);
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`weave.app.json isn't JSON: ${(error as Error).message}`);
  }
  const checked = checkManifest(raw);
  if (!checked.manifest) throw new Error(`weave.app.json: ${checked.problems.join('; ')}`);
  const manifest = checked.manifest;
  // What it brings: the components and folders its manifest names (a service's, a client service's, a mark or hint service's).
  const parts = new Map<string, string>();
  for (const [what, block] of [['wasm', manifest.wasm], ['client', manifest.client], ['marks', manifest.marks], ['hints', manifest.hints]] as const) {
    if (!block) continue;
    for (const key of ['component', 'site', 'panel'] as const) {
      const path = (block as unknown as Record<string, unknown>)[key];
      if (typeof path === 'string' && path) parts.set(path.replace(/\\/g, '/').replace(/^\.\//, ''), inside(folder, path, `${what}.${key}`));
    }
  }
  if (!parts.size) throw new Error(`${manifest.name}: a release from Weave brings a WebAssembly component ("wasm": {"component": …} in weave.app.json); a container image is released with weave service release`);
  const staging = mkdtempSync(join(tmpdir(), 'weave-release-'));
  try {
    const content = join(staging, 'content');
    mkdirSync(content);
    // Its manifest next to its parts, as a checkout has it (and so the archive is never one folder, which unpacking
    // would take for the release's own folder).
    cpSync(file, join(content, 'weave.app.json'));
    for (const [path, full] of parts) {
      const into = join(content, path);
      mkdirSync(join(into, '..'), { recursive: true });
      cpSync(full, into, { recursive: true });
    }
    const archive = join(staging, `${manifest.app}-wasm.tar.gz`);
    const run = spawnSync(tar(), ['-czf', archive, '-C', content, '.'], { windowsHide: true });
    if (run.error || run.status !== 0) throw new Error(`couldn't pack ${folder}: ${run.error?.message ?? run.stderr?.toString().trim().slice(0, 300) ?? `exit ${run.status}`}`);
    return { manifest: raw as Record<string, unknown>, files: { wasm: { file: `${manifest.app}-wasm.tar.gz`, bytes: new Uint8Array(readFileSync(archive)) } } };
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

/**
 * A release's files as blobs: each encrypted in parts of at most WEAVE_PART bytes and kept here (put), with its size
 * and SHA-256. More than MAX_WEAVE_RELEASE in all is refused before anything is kept.
 */
export function storeFiles(files: PackedRelease['files'], put: (data: Uint8Array) => void): Record<string, Required<Pick<AppAsset, 'file' | 'sha256' | 'size' | 'parts'>>> {
  const total = Object.values(files).reduce((n, f) => n + f.bytes.length, 0);
  if (total > MAX_WEAVE_RELEASE) throw new Error(`a release from Weave is at most ${MAX_WEAVE_RELEASE / 1024 / 1024} MB, and this one is ${(total / 1024 / 1024).toFixed(1)} MB: release it on GitHub instead`);
  const assets: Record<string, Required<Pick<AppAsset, 'file' | 'sha256' | 'size' | 'parts'>>> = {};
  for (const [platform, f] of Object.entries(files)) {
    if (!f.bytes.length) throw new Error(`${f.file} is empty`);
    const parts: Array<{ hash: string; key: string }> = [];
    for (let at = 0; at < f.bytes.length; at += WEAVE_PART) {
      const { data, ref } = encryptBlob(f.bytes.subarray(at, at + WEAVE_PART), PART_TYPE);
      put(data);
      parts.push(ref);
    }
    assets[platform] = { file: f.file, sha256: createHash('sha256').update(f.bytes).digest('hex'), size: f.bytes.length, parts };
  }
  return assets;
}

/**
 * A release file from Weave, put together from its blobs (fetched from whoever holds them) and checked against the
 * size and SHA-256 its maintainer signed: the file, or why not.
 */
export async function assembleFile(manifest: AppManifest, asset: AppAsset, fetchBlob: (hash: string) => Promise<Uint8Array>): Promise<Uint8Array> {
  const label = `${manifest.name} ${manifest.install?.tag ?? ''}`.trim();
  if (!asset.parts?.length) throw new Error(`${label}: ${asset.file} names no blobs to fetch it from`);
  if (!asset.size || asset.size > MAX_WEAVE_RELEASE) throw new Error(`${label}: ${asset.file} has no size Weave fetches (at most ${MAX_WEAVE_RELEASE / 1024 / 1024} MB)`);
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (const part of asset.parts) {
    let bytes: Uint8Array;
    try {
      bytes = decryptBlob(await fetchBlob(part.hash), part.key).bytes;
    } catch (error) {
      throw new Error(`${label}: a part of ${asset.file} couldn't be read: ${(error as Error).message}`);
    }
    size += bytes.length;
    if (size > asset.size) throw new Error(`${label}: ${asset.file} is bigger than its release says (${asset.size} bytes): not installed`);
    chunks.push(bytes);
  }
  if (size !== asset.size) throw new Error(`${label}: ${asset.file} is ${size} bytes, its release says ${asset.size}: not installed`);
  const file = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    file.set(c, at);
    at += c.length;
  }
  const got = createHash('sha256').update(file).digest('hex');
  if (got !== asset.sha256) throw new Error(`${label}: ${asset.file} isn't the one the project published (SHA-256 ${got.slice(0, 12)}…, expected ${asset.sha256.slice(0, 12)}…): not installed`);
  return file;
}
