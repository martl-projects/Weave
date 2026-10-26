/*
 * GitHub, as seen from a Weave node: signing in with GitHub's device flow
 * (a code the person approves on github.com; no server, no secret, only the
 * public client ID of a GitHub App), and the few repository calls group
 * access and app installs need.
 *
 * Which app: Weave Connect by default. A GitHub App's owner can act on every
 * repository the app is installed on (with a private key Weave never uses),
 * so people who'd rather not trust that owner register their own app and
 * enter it in Linked accounts.
 *
 * `fetch` can be replaced, so tests run against a stand-in GitHub.
 */

const API = 'https://api.github.com';

export type Fetch = typeof fetch;

/** A GitHub App people sign in through: its public client ID (not a secret), its page (github.com/apps/<slug>) and who owns it. */
export interface GitHubApp {
  clientId: string;
  slug: string;
  name: string;
  /** The GitHub account that owns the app. */
  owner: string;
}

/** Weave Connect (app id 5393663), owned by martldennl. WEAVE_GITHUB_CLIENT_ID and WEAVE_GITHUB_APP_SLUG override it, e.g. for a test app. */
export const DEFAULT_GITHUB_APP: GitHubApp = {
  clientId: process.env.WEAVE_GITHUB_CLIENT_ID ?? 'Iv23liJqCYJwODDieXu5',
  slug: process.env.WEAVE_GITHUB_APP_SLUG ?? 'weave-connect',
  name: 'Weave Connect',
  owner: 'martldennl',
};
export const GITHUB_CLIENT_ID = DEFAULT_GITHUB_APP.clientId;

/** Where people install an app on their repositories. */
export const githubInstallUrl = (slug = DEFAULT_GITHUB_APP.slug) => `https://github.com/apps/${slug}/installations/new`;

/** A GitHub App's public facts from its page link (https://github.com/apps/<slug>) or slug. */
export async function lookUpGitHubApp(link: string, fetchImpl: Fetch = fetch): Promise<GitHubApp> {
  const slug = link.trim().replace(/^https:\/\/github\.com\/apps\//, '').replace(/\/.*$/, '');
  if (!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)) throw new Error("that isn't a GitHub App's page: it looks like https://github.com/apps/<name>");
  const res = await fetchImpl(`${API}/apps/${slug}`, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) throw new Error(`GitHub has no public app "${slug}": make it installable on any account, or check the link`);
  if (!res.ok) throw new Error(`GitHub said ${res.status}`);
  const data = (await res.json()) as { client_id?: string; slug?: string; name?: string; owner?: { login?: string } };
  if (!data.client_id) throw new Error(`GitHub didn't give the client ID of ${slug}`);
  return { clientId: data.client_id, slug: data.slug ?? slug, name: data.name ?? slug, owner: data.owner?.login ?? '?' };
}


export interface DeviceCode {
  deviceCode: string;
  /** What the person types on github.com/login/device, like WDJB-MJHT. */
  userCode: string;
  verificationUri: string;
  /** Seconds between polls. */
  interval: number;
  expiresAt: string;
}

export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
}

export interface GitHubUser {
  login: string;
  id: number;
}

/** Start signing in: GitHub hands out a code for the person to approve. */
export async function startDeviceFlow(clientId: string, fetchImpl: Fetch = fetch): Promise<DeviceCode> {
  if (!clientId) throw new Error("GitHub isn't set up in this copy of Weave yet (no GitHub App client ID)");
  const res = await fetchImpl('https://github.com/login/device/code', {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId }),
  });
  const data = (await res.json()) as { device_code?: string; user_code?: string; verification_uri?: string; interval?: number; expires_in?: number; error?: string };
  if (!data.device_code || !data.user_code) throw new Error(`GitHub didn't start the sign-in${data.error ? `: ${data.error}` : ''}`);
  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri ?? 'https://github.com/login/device',
    interval: data.interval ?? 5,
    expiresAt: new Date(Date.now() + (data.expires_in ?? 900) * 1000).toISOString(),
  };
}

/** Wait until the person approved the code; resolves to the access token. */
export async function finishDeviceFlow(clientId: string, code: DeviceCode, fetchImpl: Fetch = fetch, signal?: AbortSignal, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))): Promise<string> {
  let interval = code.interval;
  while (Date.now() < Date.parse(code.expiresAt)) {
    if (signal?.aborted) throw new Error('sign-in cancelled');
    await sleep(interval * 1000);
    const res = await fetchImpl('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, device_code: code.deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }),
    });
    const data = (await res.json()) as { access_token?: string; error?: string; interval?: number };
    if (data.access_token) return data.access_token;
    if (data.error === 'authorization_pending') continue;
    if (data.error === 'slow_down') {
      interval = data.interval ?? interval + 5;
      continue;
    }
    throw new Error(data.error === 'access_denied' ? 'the sign-in was declined on GitHub' : data.error === 'expired_token' ? 'the code expired: start again' : `GitHub sign-in failed: ${data.error ?? res.status}`);
  }
  throw new Error('the code expired: start again');
}

/** The calls group access needs, with a signed-in person's token. */
export class GitHub {
  readonly #token: string;
  readonly #fetch: Fetch;

  constructor(token: string, fetchImpl: Fetch = fetch) {
    this.#token = token;
    this.#fetch = fetchImpl;
  }

  async #call<T>(method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
    const res = await this.#fetch(`${API}${path}`, {
      method,
      headers: {
        accept: 'application/vnd.github+json',
        ...(this.#token ? { authorization: `Bearer ${this.#token}` } : {}),
        'x-github-api-version': '2022-11-28',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text();
    const data = (text ? JSON.parse(text) : null) as T;
    if (res.status >= 400) {
      const message = (data as { message?: string } | null)?.message;
      throw new Error(res.status === 401 ? 'GitHub no longer accepts this sign-in: connect GitHub again' : `GitHub said ${res.status}${message ? `: ${message}` : ''}`);
    }
    return { status: res.status, data };
  }

  async user(): Promise<GitHubUser> {
    const { data } = await this.#call<{ login: string; id: number }>('GET', '/user');
    return { login: data.login, id: data.id };
  }

  /** Repositories the Weave app is installed on and this person administers: the ones it can manage. */
  async repos(): Promise<string[]> {
    const { data } = await this.#call<{ installations: Array<{ id: number }> }>('GET', '/user/installations?per_page=100');
    const out: string[] = [];
    for (const installation of data.installations) {
      const { data: page } = await this.#call<{ repositories: Array<{ full_name: string; permissions?: { admin?: boolean } }> }>('GET', `/user/installations/${installation.id}/repositories?per_page=100`);
      for (const repo of page.repositories) if (repo.permissions?.admin !== false) out.push(repo.full_name);
    }
    return [...new Set(out)].sort();
  }

  /** Who owns a repository: an organization, or a person (whose repositories can't have read-only collaborators). */
  async owner(repo: string): Promise<'Organization' | 'User'> {
    const { data } = await this.#call<{ owner?: { type?: string } }>('GET', `/repos/${repo}`);
    return data.owner?.type === 'Organization' ? 'Organization' : 'User';
  }

  /** Who has access now, and who was invited and hasn't accepted yet (lowercase logins). */
  async access(repo: string): Promise<{ collaborators: Set<string>; invited: Map<string, number> }> {
    const { data: people } = await this.#call<Array<{ login: string }>>('GET', `/repos/${repo}/collaborators?affiliation=direct&per_page=100`);
    const { data: invites } = await this.#call<Array<{ id: number; invitee: { login: string } | null }>>('GET', `/repos/${repo}/invitations?per_page=100`);
    return {
      collaborators: new Set(people.map((p) => p.login.toLowerCase())),
      invited: new Map(invites.filter((i) => i.invitee).map((i) => [i.invitee!.login.toLowerCase(), i.id])),
    };
  }

  /** A public gist with one file (the proof behind a GitHub account on a hub). */
  async createGist(description: string, filename: string, content: string): Promise<{ id: string; url: string }> {
    const { data } = await this.#call<{ id: string; html_url: string }>('POST', '/gists', { description, public: true, files: { [filename]: { content } } });
    return { id: data.id, url: data.html_url };
  }

  async deleteGist(id: string): Promise<void> {
    await this.#call('DELETE', `/gists/${encodeURIComponent(id)}`);
  }

  /** A file in a repository at a tag or branch (default: its default branch), or undefined when there's none. */
  async fileAt(repo: string, path: string, ref?: string): Promise<string | undefined> {
    try {
      const { data } = await this.#call<{ content?: string; encoding?: string }>('GET', `/repos/${repo}/contents/${path}${ref ? `?ref=${encodeURIComponent(ref)}` : ''}`);
      return data.content && data.encoding === 'base64' ? Buffer.from(data.content, 'base64').toString('utf8') : undefined;
    } catch (error) {
      if (/ 404/.test((error as Error).message)) return undefined;
      throw error;
    }
  }

  /**
   * Whether the repository has a GitHub Actions workflow that runs on pushed tags and makes
   * releases (like Weave's): without one, a pushed tag never becomes a release by itself.
   * Undefined when GitHub can't say.
   */
  async hasReleaseWorkflow(repo: string): Promise<boolean | undefined> {
    try {
      const { data } = await this.#call<Array<{ name: string; path: string; type: string }>>('GET', `/repos/${repo}/contents/.github/workflows`);
      for (const file of data.filter((f) => f.type === 'file' && /\.ya?ml$/.test(f.name))) {
        const text = await this.fileAt(repo, file.path);
        if (text && /\btags\b/.test(text) && /release/i.test(text)) return true;
      }
      return false;
    } catch (error) {
      return / 404/.test((error as Error).message) ? false : undefined;
    }
  }

  /** A repository's recent releases, newest first (drafts left out). */
  async releases(repo: string): Promise<Array<{ tag: string; name: string; published?: string; files: number; prerelease: boolean }>> {
    const { data } = await this.#call<Array<{ tag_name: string; name: string | null; published_at: string | null; draft: boolean; prerelease: boolean; assets: unknown[] }>>('GET', `/repos/${repo}/releases?per_page=15`);
    return data
      .filter((r) => !r.draft)
      .map((r) => ({ tag: r.tag_name, name: r.name || r.tag_name, ...(r.published_at ? { published: r.published_at } : {}), files: r.assets.length, prerelease: r.prerelease }));
  }

  /** A release by its tag, with its files. */
  async release(repo: string, tag: string): Promise<{ tag: string; assets: ReleaseAsset[] }> {
    const { data } = await this.#call<{ tag_name: string; assets: Array<{ id: number; name: string; size: number }> }>('GET', `/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`).catch((error: Error) => {
      if (!/ 404/.test(error.message)) throw error;
      throw new Error(`GitHub shows no release ${tag} in ${repo}${this.#token ? ', or you have no access to it yet' : ': if the repository is private, connect GitHub first (Keys & devices)'}. If a workflow is building it, try again in a few minutes`);
    });
    return { tag: data.tag_name, assets: data.assets.map((a) => ({ id: a.id, name: a.name, size: a.size })) };
  }

  /** A release file's contents, as a stream (GitHub redirects to its file store). */
  async download(repo: string, asset: number, signal?: AbortSignal): Promise<{ body: ReadableStream<Uint8Array>; size?: number }> {
    const res = await this.#fetch(`${API}/repos/${repo}/releases/assets/${asset}`, {
      headers: { accept: 'application/octet-stream', ...(this.#token ? { authorization: `Bearer ${this.#token}` } : {}), 'x-github-api-version': '2022-11-28' },
      redirect: 'follow',
      ...(signal ? { signal } : {}),
    });
    if (!res.ok || !res.body) throw new Error(res.status === 404 ? `GitHub didn't let you download from ${repo}: do you have access to it?` : `GitHub said ${res.status} for the download`);
    const size = Number(res.headers.get('content-length'));
    return { body: res.body, ...(size > 0 ? { size } : {}) };
  }

  /** Give someone access (read, or write where they were picked to write); GitHub sends them an invitation to accept. */
  async invite(repo: string, login: string, permission: 'pull' | 'push' = 'pull'): Promise<void> {
    await this.#call('PUT', `/repos/${repo}/collaborators/${encodeURIComponent(login)}`, { permission });
  }

  /** Take access away again: the collaborator, or the invitation they haven't accepted. */
  async remove(repo: string, login: string, invitation?: number): Promise<void> {
    if (invitation !== undefined) await this.#call('DELETE', `/repos/${repo}/invitations/${invitation}`);
    else await this.#call('DELETE', `/repos/${repo}/collaborators/${encodeURIComponent(login)}`);
  }
}

/**
 * Whether a gist proves a GitHub account belongs to a Weave person: it must
 * be owned by that account and name the person's did. Anyone can check this,
 * without signing in. Undefined when GitHub couldn't be asked.
 */
export async function checkGistProof(gist: string, login: string, did: string, fetchImpl: Fetch = fetch): Promise<boolean | undefined> {
  try {
    const res = await fetchImpl(`${API}/gists/${encodeURIComponent(gist)}`, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10_000) });
    if (res.status === 404) return false;
    if (!res.ok) return undefined;
    const data = (await res.json()) as { owner?: { login?: string }; files?: Record<string, { content?: string }> };
    if (data.owner?.login?.toLowerCase() !== login.toLowerCase()) return false;
    return Object.values(data.files ?? {}).some((f) => f.content?.includes(did));
  } catch {
    return undefined;
  }
}
