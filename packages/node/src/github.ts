/*
 * GitHub, as seen from a Weave node: what anyone reaches without signing in. Gists that prove a GitHub account is a
 * person's, and a repository's public releases (for the update check). Weave signs in to GitHub nowhere: services
 * that need access (GitHub releases, GitHub access) have their own, in their settings.
 *
 * `fetch` can be replaced, so tests run against a stand-in GitHub.
 */

const API = 'https://api.github.com';

export type Fetch = typeof fetch;

export interface ReleaseAsset {
  id: number;
  name: string;
  size: number;
}

export interface GitHubUser {
  login: string;
  id: number;
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
  /** A gist of the signed-in account: public, or secret (unlisted: only who knows its id finds it). */
  async createGist(description: string, filename: string, content: string, visible = true): Promise<{ id: string; url: string }> {
    const { data } = await this.#call<{ id: string; html_url: string }>('POST', '/gists', { description, public: visible, files: { [filename]: { content } } });
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

  /**
   * Where a release file can be downloaded for a while without signing in: the signed address GitHub redirects to.
   * What a provider hands out, so people without access to the repository get the file too.
   */
  async downloadUrl(repo: string, asset: number): Promise<string> {
    const res = await this.#fetch(`${API}/repos/${repo}/releases/assets/${asset}`, {
      headers: { accept: 'application/octet-stream', ...(this.#token ? { authorization: `Bearer ${this.#token}` } : {}), 'x-github-api-version': '2022-11-28' },
      redirect: 'manual',
    });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) return location;
    throw new Error(res.status === 404 ? `GitHub didn't let this node download from ${repo}: does its sign-in have access?` : `GitHub said ${res.status} instead of a download address`);
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
