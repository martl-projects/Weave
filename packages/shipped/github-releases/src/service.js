// GitHub releases: hands a project's release files to its participants (artifact.fetch). Asked for a release and a
// platform, it answers with GitHub's download address for that file, reached with its own GitHub access: a token, or
// its person's GitHub App (Weave signs the App's JWT; the key never reaches this code). Only releases its projects'
// maintainers published count (release() in the WIT), whatever a request names, and whoever downloads checks the file
// against the release's digest, so nobody has to trust the address it hands out.
import { answer, release, setting, sign } from 'weave:service/host@0.1.0';

const API = 'https://api.github.com';
const PROTOCOL = 'artifact.fetch';
const encode = (text) => new TextEncoder().encode(text);
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A GitHub API call: JSON back, or why not. */
async function github(path, token, init = {}) {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'weave-github-releases', 'x-github-api-version': '2022-11-28', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) },
  });
  return res;
}

/** Installation tokens of its GitHub App, by account: kept until a few minutes before they run out. */
const installations = new Map();

/** Its GitHub App's token for a repository, if it has an App and the App is installed there. */
async function appToken(repo) {
  const id = setting('GITHUB_APP_ID');
  if (!id) return undefined;
  const owner = repo.split('/')[0].toLowerCase();
  const kept = installations.get(owner);
  if (kept && kept.expires - Date.now() > 5 * 60_000) return kept.token;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))}.${base64url(encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: id })))}`;
  const jwt = `${unsigned}.${base64url(sign('GITHUB_APP_KEY', 'RS256', encode(unsigned)))}`;
  const installed = await github(`/repos/${repo}/installation`, jwt);
  if (installed.status === 404) return undefined;
  if (!installed.ok) throw new Error(`GitHub said ${installed.status} for the App's installation on ${repo}`);
  // A POST with a body of its own: one without never ends its request.
  const minted = await github(`/app/installations/${(await installed.json()).id}/access_tokens`, jwt, { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } });
  if (!minted.ok) throw new Error(`GitHub said ${minted.status} for the App's token`);
  const { token, expires_at } = await minted.json();
  installations.set(owner, { token, expires: Date.parse(expires_at) });
  return token;
}

/** Where to download a release's file for a platform: GitHub's address for it, which works for a while without access. */
async function locate(space, data) {
  if (data?.protocol !== PROTOCOL) throw new Error(`it answers ${PROTOCOL} only`);
  const found = release(space, String(data.artifact ?? ''));
  if (!found) throw new Error('no such release in this project');
  const { tag, name, manifest } = JSON.parse(found);
  const asset = manifest.install?.assets?.[String(data.platform)];
  if (!asset) throw new Error(`${name} ${tag} has no file for ${data.platform}`);
  const repo = manifest.install?.github;
  if (!repo) throw new Error(`${name} ${tag} isn't released on GitHub`);
  const token = (await appToken(repo)) ?? setting('GITHUB_TOKEN');
  const res = await github(`/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`, token);
  if (res.status === 404) throw new Error(`GitHub shows no release ${tag} in ${repo}${token ? ' that it may see' : ': it has no GitHub access (a token, or an App) for a private repository'}`);
  if (!res.ok) throw new Error(`GitHub said ${res.status} for ${repo} ${tag}`);
  const file = (await res.json()).assets.find((a) => a.name === asset.file);
  if (!file) throw new Error(`the release ${tag} on GitHub has no file ${asset.file}`);
  // GitHub answers with a redirect to its file store: that address is the answer.
  const download = await github(`/repos/${repo}/releases/assets/${file.id}`, token, { headers: { accept: 'application/octet-stream' }, redirect: 'manual' });
  const url = download.headers.get('location');
  if (download.status < 300 || download.status >= 400 || !url) throw new Error(`GitHub said ${download.status} instead of a download address`);
  return { url, file: asset.file, sha256: asset.sha256, ...(asset.size ? { size: asset.size } : {}) };
}

export async function onEvent(text) {
  const item = JSON.parse(text);
  if (item.kind !== 'weave.service.request') return;
  try {
    answer(item.id, undefined, JSON.stringify(await locate(item.space.id, item.body?.data)), undefined);
  } catch (error) {
    answer(item.id, undefined, undefined, error?.message ?? String(error));
  }
}
