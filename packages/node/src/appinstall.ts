import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, createWriteStream, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

/*
 * Putting a project's app on this computer from a release file: download it,
 * refuse it unless its SHA-256 is the one a maintainer published in Weave,
 * and unpack it into a folder of its own. Weave never runs anything from the
 * file while installing; the app's start command still needs the host's OK.
 */

/** This computer's platform, as manifests name them: win32-x64, darwin-arm64, linux-x64… */
export const platformKey = (platform: string = process.platform, arch: string = process.arch): string => `${platform}-${arch}`;

/** Which platform a release file is for, guessed from its name (Gameshow-1.4-win-x64.zip → win32-x64). */
export function guessPlatform(name: string): string | undefined {
  const n = name.toLowerCase();
  const os = /mac|darwin|osx|\.dmg$/.test(n) ? 'darwin' : /win|\.exe$|\.msi$/.test(n) ? 'win32' : /linux|\.appimage$|\.deb$/.test(n) ? 'linux' : undefined;
  if (!os) return undefined;
  const arch = /arm64|aarch64/.test(n) ? 'arm64' : /x64|amd64|x86_64|win64/.test(n) ? 'x64' : /ia32|x86|win32-?32|i386/.test(n) ? 'ia32' : os === 'darwin' && /universal/.test(n) ? 'arm64' : 'x64';
  return `${os}-${arch}`;
}

/** Write a stream to a file, hashing it on the way; the SHA-256 must match or the file is gone again. */
export async function saveVerified(body: ReadableStream<Uint8Array>, file: string, sha256: string | undefined, onBytes: (n: number) => void = () => {}): Promise<string> {
  const hash = createHash('sha256');
  const out = createWriteStream(file);
  try {
    const reader = body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      hash.update(value);
      if (!out.write(value)) await new Promise((r) => out.once('drain', r));
      onBytes(value.byteLength);
    }
    await new Promise<void>((resolve, reject) => out.end((error?: Error | null) => (error ? reject(error) : resolve())));
  } catch (error) {
    out.destroy();
    rmSync(file, { force: true });
    throw error;
  }
  const got = hash.digest('hex');
  if (sha256 && got !== sha256) {
    rmSync(file, { force: true });
    throw new Error(`the downloaded file isn't the one the project published (SHA-256 ${got.slice(0, 12)}…, expected ${sha256.slice(0, 12)}…): not installed`);
  }
  return got;
}

const ARCHIVE = /\.(zip|tar|tar\.gz|tgz|tar\.xz|txz|tar\.bz2)$/i;

/** The system's tar: bsdtar on Windows and macOS (which also reads zip files), GNU or bsd tar on Linux. */
const tar = () => (process.platform === 'win32' ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar');

/**
 * Unpack a release file into `into` (which must not exist yet). Archives are
 * unpacked with the system's tools, which refuse paths leading outside; a
 * plain file is kept as it is and made executable. Returns the app's folder:
 * the one folder inside, if the archive holds just that.
 */
export function unpack(file: string, into: string): string {
  const staging = `${into}.unpacking`;
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });
  try {
    const name = basename(file);
    if (ARCHIVE.test(name)) {
      const zip = /\.zip$/i.test(name);
      const run = zip && process.platform === 'linux' ? spawnSync('unzip', ['-q', '-o', file, '-d', staging]) : spawnSync(tar(), ['-xf', file, '-C', staging], { windowsHide: true });
      if (run.error || run.status !== 0) throw new Error(`couldn't unpack ${name}: ${run.error?.message ?? run.stderr?.toString().trim().slice(0, 300) ?? `exit ${run.status}`}${zip && process.platform === 'linux' && run.error ? ' (is unzip installed?)' : ''}`);
    } else {
      renameSync(file, join(staging, name));
      if (process.platform !== 'win32') chmodSync(join(staging, name), 0o755);
    }
    renameSync(staging, into);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  const inside = readdirSync(into);
  return inside.length === 1 && statSync(join(into, inside[0])).isDirectory() ? join(into, inside[0]) : into;
}

/** A folder name from a tag (v1.4 → v1.4; anything odd becomes _). */
export const tagFolder = (tag: string): string => tag.replace(/[^A-Za-z0-9._+-]/g, '_') || 'release';

