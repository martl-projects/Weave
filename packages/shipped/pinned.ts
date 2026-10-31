// Services Weave ships from repositories of their own: one release of each, pinned by its archive's SHA-256
// (pinned.json). Their source lives only there; what Weave ships is the very file their project releases.
//
// An archive is fetched once (with the GitHub CLI: the repositories may be private) into .cache/, checked against its
// pin and unpacked there; after that it builds offline.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

const here = import.meta.dirname;

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
export function pinnedRelease(name: string): string {
  const pin = pins()[name];
  if (!pin) throw new Error(`pinned.json pins no ${name}`);
  const dir = join(here, '.cache', `${name}-${pin.sha256.slice(0, 16)}`);
  if (existsSync(join(dir, 'weave.app.json'))) return dir;
  const archive = join(here, '.cache', `${pin.sha256}.tar.gz`);
  if (!existsSync(archive)) download(pin, archive);
  const bytes = readFileSync(archive);
  const got = createHash('sha256').update(bytes).digest('hex');
  if (got !== pin.sha256) {
    rmSync(archive);
    throw new Error(`${pin.repo} ${pin.tag}'s ${pin.asset} isn't the pinned one (sha256 ${got}, pinned ${pin.sha256})`);
  }
  const unpacking = `${dir}.part`;
  rmSync(unpacking, { recursive: true, force: true });
  mkdirSync(unpacking, { recursive: true });
  for (const [path, content] of untar(gunzipSync(bytes))) writeFileSync(join(unpacking, path), content);
  if (!existsSync(join(unpacking, 'weave.app.json'))) throw new Error(`${pin.asset} holds no weave.app.json`);
  rmSync(dir, { recursive: true, force: true });
  renameSync(unpacking, dir);
  return dir;
}

function download(pin: Pin, to: string): void {
  const into = mkdtempSync(join(tmpdir(), 'weave-pinned-'));
  try {
    execFileSync('gh', ['release', 'download', pin.tag, '--repo', pin.repo, '--pattern', pin.asset, '--dir', into], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (e) {
    rmSync(into, { recursive: true, force: true });
    const said = (e as { stderr?: Buffer }).stderr?.toString().trim();
    throw new Error(`couldn't fetch ${pin.repo} ${pin.tag} (${pin.asset}) with the GitHub CLI (gh, logged in with access to it)${said ? `: ${said}` : ''}; or put the archive at ${to}`);
  }
  mkdirSync(join(here, '.cache'), { recursive: true });
  renameSync(join(into, pin.asset), to);
  rmSync(into, { recursive: true, force: true });
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
