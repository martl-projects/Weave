// Services Weave ships from repositories of their own: one release of each, pinned by its archive's SHA-256
// (pinned.json). Their source lives only there; what Weave ships is the very file their project releases.
//
// An archive is fetched once into .cache/, checked against its pin and unpacked there; after that it builds offline.
// The repositories may be private: GitHub access comes from GH_TOKEN (CI: a secret that reads them), or the GitHub
// CLI's login.

import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const here = import.meta.dirname;
// Test files run side by side, each may fetch and unpack the same release: each writes its own parts, the first done wins.
const mine = `${process.pid}-${randomBytes(4).toString('hex')}`;

/** Put a finished part in place, unless another process already did (then its rename fails, and that one stays). */
function settle(part: string, to: string, done: () => boolean): void {
  if (!done()) {
    try {
      renameSync(part, to);
      return;
    } catch (error) {
      if (!done()) throw error;
    }
  }
  rmSync(part, { recursive: true, force: true });
}

export interface Pin {
  /** owner/name on GitHub. */
  repo: string;
  tag: string;
  /** The release's archive: the component, weave.app.json and README.md. */
  asset: string;
  sha256: string;
}

export function pins(): Record<string, Pin> {
  const file = join(here, 'pinned.json');
  return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as Record<string, Pin>) : {};
}

/** A pinned release, unpacked: its folder (weave.app.json, its component, README.md). Fetched the first time. */
export async function pinnedRelease(name: string): Promise<string> {
  const pin = pins()[name];
  if (!pin) throw new Error(`pinned.json pins no ${name}`);
  const dir = join(here, '.cache', `${name}-${pin.sha256.slice(0, 16)}`);
  if (existsSync(join(dir, 'weave.app.json'))) return dir;
  const archive = join(here, '.cache', `${pin.sha256}.tar.gz`);
  if (!existsSync(archive)) await download(pin, archive);
  const bytes = readFileSync(archive);
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got !== pin.sha256) {
    rmSync(archive);
    throw new Error(`${pin.repo} ${pin.tag}'s ${pin.asset} isn't the pinned one (sha256 ${got}, pinned ${pin.sha256})`);
  }
  const unpacking = `${dir}.${mine}.part`;
  mkdirSync(unpacking, { recursive: true });
  for (const [path, content] of untar(gunzipSync(bytes))) writeFileSync(join(unpacking, path), content);
  if (!existsSync(join(unpacking, 'weave.app.json'))) {
    rmSync(unpacking, { recursive: true, force: true });
    throw new Error(`${pin.asset} holds no weave.app.json`);
  }
  settle(unpacking, dir, () => existsSync(join(dir, 'weave.app.json')));
  return dir;
}

/** GitHub access: GH_TOKEN or GITHUB_TOKEN, else the GitHub CLI's login, else none (public repositories). */
function token(): string | undefined {
  const set = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (set) return set;
  try {
    return execFileSync('gh', ['auth', 'token'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || undefined;
  } catch {
    return undefined;
  }
}

async function download(pin: Pin, to: string): Promise<void> {
  const auth = token();
  const headers = { 'user-agent': 'weave-shipped', 'x-github-api-version': '2022-11-28', ...(auth ? { authorization: `Bearer ${auth}` } : {}) };
  const failed = (why: string) => new Error(`couldn't fetch ${pin.repo} ${pin.tag} (${pin.asset}): ${why}. Set GH_TOKEN to a token that reads it (or log in with gh), or put the archive at ${to}`);
  const release = await fetch(`https://api.github.com/repos/${pin.repo}/releases/tags/${pin.tag}`, { headers: { ...headers, accept: 'application/vnd.github+json' } });
  if (!release.ok) throw failed(`GitHub said ${release.status}${auth ? '' : ' (no GitHub access found)'}`);
  const asset = ((await release.json()) as { assets: Array<{ name: string; url: string }> }).assets.find((a) => a.name === pin.asset);
  if (!asset) throw failed('the release has no such file');
  // GitHub sends it on to its file store; the token isn't passed there (another origin).
  const file = await fetch(asset.url, { headers: { ...headers, accept: 'application/octet-stream' } });
  if (!file.ok) throw failed(`GitHub said ${file.status} for the file`);
  mkdirSync(join(here, '.cache'), { recursive: true });
  writeFileSync(`${to}.${mine}.part`, Buffer.from(await file.arrayBuffer()));
  settle(`${to}.${mine}.part`, to, () => existsSync(to));
}

/** A tar archive's plain files at its top level, by name: all a release's archive holds. */
function untar(tar: Buffer): Map<string, Buffer> {
  const files = new Map<string, Buffer>();
  for (let at = 0; at + 512 <= tar.length; ) {
    const header = tar.subarray(at, at + 512);
    if (header.every((b) => b === 0)) break;
    const field = (from: number, length: number) => header.subarray(from, from + length).toString('utf8').replace(/\0.*$/s, '');
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1);
    const name = field(0, 100).replace(/^\.\//, '');
    if ((type === '0' || type === '') && name && !name.includes('/') && !name.includes('\\') && name !== '..') files.set(name, Buffer.from(tar.subarray(at + 512, at + 512 + size)));
    at += 512 + Math.ceil(size / 512) * 512;
  }
  return files;
}
