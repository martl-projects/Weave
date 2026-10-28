// Attaches files to the GitHub Release of a tag (a draft too), replacing any of the same name: each build job of the
// release workflow uploads its own, so nothing goes through the Actions artifact storage and its quota. Plain Node,
// no gh, so it runs on every runner.
//
//   GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/name node scripts/release-upload.ts <tag> <file or folder>...
//
// A folder stands for the installers in it (.exe .msi .dmg .pkg .AppImage): no shell globbing, the same on Windows.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, join } from 'node:path';

const [tag, ...given] = process.argv.slice(2);
const files = given.flatMap((p) => (statSync(p).isDirectory() ? readdirSync(p).filter((f) => /\.(exe|msi|dmg|pkg|AppImage)$/.test(f)).map((f) => join(p, f)) : [p]));
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

for (const file of files) {
  const name = basename(file);
  const kept = release.assets.find((a) => a.name === name);
  if (kept) await api(`/repos/${repo}/releases/assets/${kept.id}`, { method: 'DELETE' });
  const url = `${release.upload_url.replace(/\{.*\}$/, '')}?name=${encodeURIComponent(name)}`;
  const res = await api(url, { method: 'POST', body: readFileSync(file), headers: { 'content-type': 'application/octet-stream' } });
  console.log(`${name}: ${statSync(file).size} bytes`);
  if (!res.ok) throw new Error(`uploading ${name} failed: ${res.status}`);
  console.log(`  attached to ${tag}`);
}
