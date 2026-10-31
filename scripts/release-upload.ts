// Attaches files to the GitHub Release of a tag (a draft too), replacing any of the same name: each build job of the
// release workflow uploads its own, so nothing goes through the Actions artifact storage and its quota. Plain Node,
// no gh, so it runs on every runner.
//
//   GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/name node scripts/release-upload.ts <tag> <file or folder>...
//
// A folder stands for the installers in it (.exe .msi .dmg .pkg .zip .AppImage; the zip is the Mac app as its updater
// takes it): no shell globbing, the same on Windows.

import { createReadStream, readdirSync, statSync } from 'node:fs';
import { request } from 'node:https';
import { basename, join } from 'node:path';

const [tag, ...given] = process.argv.slice(2);
const files = given.flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p).filter((f) => /\.(exe|msi|dmg|pkg|zip|AppImage)$/.test(f)).map((f) => join(p, f)) : [p]));
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
if (!tag || !given.length || !token || !repo) throw new Error('usage: GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/name node scripts/release-upload.ts <tag> <file or folder>...');
if (!files.length) throw new Error(`nothing to attach in ${given.join(', ')}`);

const headers = { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'weave-release' };
const api = async (url: string, init: RequestInit = {}) => {
  const res = await fetch(url.startsWith('https://') ? url : `https://api.github.com${url}`, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  if (!res.ok && res.status !== 404) throw new Error(`GitHub said ${res.status} for ${url}: ${await res.text()}`);
  return res;
};

// A draft isn't found by its tag: look through the newest releases.
const releases = (await (await api(`/repos/${repo}/releases?per_page=30`)).json()) as Array<{ id: number; tag_name: string; upload_url: string; assets: Array<{ id: number; name: string }> }>;
const release = releases.find((r) => r.tag_name === tag);
if (!release) throw new Error(`no release for ${tag} in ${repo}: the release workflow's draft job makes it`);

// The file goes up as a stream over plain https: GitHub answers only once all of it is in, and fetch gives up on an
// answer after 5 minutes, which a big installer from a slow runner takes longer than.
const upload = (url: string, file: string, size: number) =>
  new Promise<number>((done, fail) => {
    const req = request(url, { method: 'POST', headers: { ...headers, 'content-type': 'application/octet-stream', 'content-length': size } }, (res) => {
      let text = '';
      res.on('data', (chunk) => (text += chunk));
      res.on('end', () => (res.statusCode && res.statusCode < 300 ? done(res.statusCode) : fail(new Error(`GitHub said ${res.statusCode}: ${text}`))));
    });
    req.on('error', fail);
    createReadStream(file).on('error', fail).pipe(req);
  });

for (const file of files) {
  const name = basename(file);
  const size = statSync(file).size;
  const url = `${release.upload_url.replace(/\{.*\}$/, '')}?name=${encodeURIComponent(name)}`;
  console.log(`${name}: ${size} bytes`);
  // Up to three tries; what an earlier one left half there goes first, as a file of the same name from an earlier run.
  for (let attempt = 1; ; attempt++) {
    const assets = (await (await api(`/repos/${repo}/releases/${release.id}/assets?per_page=100`)).json()) as Array<{ id: number; name: string }>;
    for (const kept of assets.filter((a) => a.name === name)) await api(`/repos/${repo}/releases/assets/${kept.id}`, { method: 'DELETE' });
    try {
      await upload(url, file, size);
      break;
    } catch (err) {
      if (attempt === 3) throw new Error(`uploading ${name} failed: ${(err as Error).message}`);
      console.log(`  try ${attempt} failed (${(err as Error).message}), again`);
    }
  }
  console.log(`  attached to ${tag}`);
}
