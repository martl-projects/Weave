// GitHub accounts: whether a GitHub account is a person's. The proof is a gist (its address or id) that belongs to
// the account and holds the line Weave gives (their Weave id). Asked of GitHub without signing in: secret gists too
// are there for whoever knows their address.
import { log } from 'weave:service/verifying@0.1.0';

export async function verify(text) {
  const { handle, proof, text: line } = JSON.parse(text);
  const id = String(proof ?? '').trim().replace(/\/+$/, '').split('/').pop() ?? '';
  if (!/^[0-9a-f]{20,40}$/i.test(id)) return false;
  const res = await fetch(`https://api.github.com/gists/${id}`, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'weave-github-verify', 'x-github-api-version': '2022-11-28' } });
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`GitHub said ${res.status}`);
  const gist = await res.json();
  const ok = String(gist.owner?.login ?? '').toLowerCase() === String(handle).toLowerCase() && Object.values(gist.files ?? {}).some((f) => String(f.content ?? '').includes(line));
  log(`${handle}: ${ok ? 'holds' : "doesn't hold"}`);
  return ok;
}
