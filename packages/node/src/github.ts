/*
 * GitHub, as seen from a Weave node: a repository's public releases, for the update check (Weave's own releases are
 * there). Weave signs in to GitHub nowhere, and knows nothing else of it: services and client apps that need GitHub
 * (GitHub releases, GitHub access, GitHub checkout, GitHub verify) bring their own access.
 *
 * `fetch` can be replaced, so tests run against a stand-in GitHub.
 */

const API = 'https://api.github.com';

export type Fetch = typeof fetch;

/** A repository's public releases, newest first: what anyone sees. */
export async function publicReleases(repo: string, fetchImpl: Fetch = fetch): Promise<Array<{ tag: string; name: string; published?: string; files: number; prerelease: boolean }>> {
  const res = await fetchImpl(`${API}/repos/${repo}/releases?per_page=20`, { headers: { accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`GitHub said ${res.status}`);
  const data = (await res.json()) as Array<{ tag_name: string; name?: string; published_at?: string; draft?: boolean; prerelease?: boolean; assets?: unknown[] }>;
  return data.filter((r) => !r.draft).map((r) => ({ tag: r.tag_name, name: r.name || r.tag_name, ...(r.published_at ? { published: r.published_at } : {}), files: r.assets?.length ?? 0, prerelease: !!r.prerelease }));
}
