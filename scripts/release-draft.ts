// The GitHub Release of a tag, for the release workflow: made as a draft with its notes (again: its notes updated),
// and published once its files are there. Only a tag like v1.2.0-beta.1 is a pre-release; the rest become Latest.
// Plain Node, no gh, so it runs on every runner.
//
//   GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/name node scripts/release-draft.ts draft <tag> <notes file>
//   GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/name node scripts/release-draft.ts publish <tag>

import { readFileSync } from 'node:fs';

const [step, tag, notesFile] = process.argv.slice(2);
const token = process.env.GITHUB_TOKEN;
const repo = process.env.GITHUB_REPOSITORY;
if (!tag || !token || !repo || (step !== 'draft' && step !== 'publish') || (step === 'draft' && !notesFile)) throw new Error('usage: GITHUB_TOKEN=… GITHUB_REPOSITORY=owner/name node scripts/release-draft.ts draft <tag> <notes file> | publish <tag>');

const api = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`https://api.github.com/repos/${repo}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'weave-release', ...(init.body ? { 'content-type': 'application/json' } : {}) } });
  if (!res.ok) throw new Error(`GitHub said ${res.status} for ${path}: ${await res.text()}`);
  return res.json() as Promise<{ id: number; tag_name: string; draft: boolean }>;
};

// A draft isn't found by its tag: look through the newest releases.
const found = ((await api('/releases?per_page=30')) as unknown as Array<{ id: number; tag_name: string; draft: boolean }>).find((r) => r.tag_name === tag);

if (step === 'draft') {
  const body = readFileSync(notesFile, 'utf8');
  if (found) await api(`/releases/${found.id}`, { method: 'PATCH', body: JSON.stringify({ body }) });
  else await api('/releases', { method: 'POST', body: JSON.stringify({ tag_name: tag, name: `Weave ${tag}`, body, draft: true, prerelease: tag.includes('-') }) });
  console.log(`${tag}: ${found ? 'notes updated' : 'drafted'}`);
} else {
  if (!found) throw new Error(`no release for ${tag}`);
  await api(`/releases/${found.id}`, { method: 'PATCH', body: JSON.stringify({ draft: false }) });
  console.log(`${tag}: published`);
}
