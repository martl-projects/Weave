// GitHub checkout: fetches a release file from GitHub for its person, with what a GitHub releases service granted
// them (a download address of GitHub's file store), or with their own GitHub access where the grant leaves it to
// them (the repository, tag and file). It writes the bytes to Weave, which checks them against the release's digest:
// it can't hand over another file than the one released.
import { log, setting, write } from 'weave:service/fetching@0.1.0';

const API = 'https://api.github.com';

/** A GitHub API call with its person's token, if they gave one. */
function github(path, token, init = {}) {
  return globalThis.fetch(`${API}${path}`, {
    ...init,
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'weave-github-checkout', 'x-github-api-version': '2022-11-28', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
}

/** Hand a download's bytes to Weave as they come. */
async function stream(url) {
  const res = await globalThis.fetch(url, { headers: { 'user-agent': 'weave-github-checkout' }, redirect: 'manual' });
  if (!res.ok || !res.body) throw new Error(`GitHub's file store said ${res.status}`);
  const reader = res.body.getReader();
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    write(value);
    bytes += value.byteLength;
  }
  return bytes;
}

/** Where GitHub keeps a release's file, asked with its person's own access. */
async function locate(repo, tag, file) {
  const token = setting('GITHUB_TOKEN');
  const res = await github(`/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, token);
  if (res.status === 404) throw new Error(`GitHub shows you no release ${tag} in ${repo}${token ? '' : ': for a private repository, give it your GitHub token'}`);
  if (!res.ok) throw new Error(`GitHub said ${res.status} for ${repo} ${tag}`);
  const found = (await res.json()).assets.find((a) => a.name === file);
  if (!found) throw new Error(`the release ${tag} on GitHub has no file ${file}`);
  const download = await github(`/repos/${repo}/releases/assets/${found.id}`, token, { headers: { accept: 'application/octet-stream' }, redirect: 'manual' });
  const url = download.headers.get('location');
  if (download.status < 300 || download.status >= 400 || !url) throw new Error(`GitHub said ${download.status} instead of a download address`);
  return url;
}

export async function fetch(text) {
  const { grant, asset } = JSON.parse(text);
  if (typeof grant?.url === 'string' && grant.url.startsWith('https://')) {
    const bytes = await stream(grant.url);
    log(`${asset.file}: ${bytes} bytes, as granted`);
    return 'GitHub, as its provider granted';
  }
  const { repo, tag, file } = grant ?? {};
  if (typeof repo !== 'string' || typeof tag !== 'string') throw new Error('the grant names no repository and release');
  const bytes = await stream(await locate(repo, tag, typeof file === 'string' ? file : asset.file));
  log(`${asset.file}: ${bytes} bytes, with your own access`);
  return 'GitHub, with your own access';
}
