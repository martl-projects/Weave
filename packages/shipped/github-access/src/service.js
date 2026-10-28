// GitHub access: keeps the repositories linked in its spaces in step with who is in them. Weave says who should have
// access (repoAccess: members who proved their GitHub account, people picked to write, whom it gave access before);
// it invites and removes them on GitHub with its own token (an admin's), and records each change in the space
// (weave.github.added), so access it gave is taken back when someone leaves or a repository is unlinked.
import { log, me, publish, repoAccess, repoSynced, setting, tickEvery } from 'weave:service/host@0.1.0';

const API = 'https://api.github.com';

/** A GitHub API call with its token: its JSON (or nothing), or why not. */
async function github(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'weave-github-access', 'x-github-api-version': '2022-11-28', authorization: `Bearer ${setting('GITHUB_TOKEN')}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : method === 'POST' || method === 'PUT' ? { body: '{}' } : {}),
  });
  if (!res.ok) throw new Error(`GitHub said ${res.status} for ${method} ${path}`);
  return res.status === 204 ? undefined : res.json().catch(() => undefined);
}

/** Who is in a repository now: its direct collaborators, and who is invited (with the invitation). */
async function accessOf(repo) {
  const people = await github('GET', `/repos/${repo}/collaborators?affiliation=direct&per_page=100`);
  const invites = await github('GET', `/repos/${repo}/invitations?per_page=100`);
  return { collaborators: new Set(people.map((p) => p.login.toLowerCase())), invited: new Map(invites.filter((i) => i.invitee).map((i) => [i.invitee.login.toLowerCase(), i.id])) };
}

/** Bring one repository in step: invite who should be in, take back what it gave those who shouldn't. */
async function syncRepo(space, r) {
  const want = new Set([...r.want, ...r.keep.filter((l) => r.gave.includes(l))]);
  const gave = new Set(r.gave);
  const access = await accessOf(r.repo);
  // Someone it invited who isn't in (or invited) any more declined or left on GitHub: not asked again.
  let invite = [...want].filter((l) => !access.collaborators.has(l) && !access.invited.has(l) && !gave.has(l));
  const remove = [...gave].filter((l) => !want.has(l) && (access.collaborators.has(l) || access.invited.has(l)));
  // A person's repository can't take read-only collaborators: nobody new is invited there.
  if (!r.write && invite.length && (await github('GET', `/repos/${r.repo}`)).owner?.type !== 'Organization') {
    invite = [];
    repoSynced(r.repo, `${r.repo} belongs to a person, not an organization: GitHub gives its collaborators write access, so nobody gets read access through Weave. Move it to an organization, or pick people to write`);
  } else repoSynced(r.repo, undefined);
  for (const login of invite) {
    await github('PUT', `/repos/${r.repo}/collaborators/${login}`, { permission: r.write ? 'push' : 'pull' });
    publish(space, 'weave.github.added', JSON.stringify({ repo: r.repo, login, on: true }));
  }
  for (const login of remove) {
    if (access.invited.has(login)) await github('DELETE', `/repos/${r.repo}/invitations/${access.invited.get(login)}`);
    else await github('DELETE', `/repos/${r.repo}/collaborators/${login}`);
    publish(space, 'weave.github.added', JSON.stringify({ repo: r.repo, login, on: false }));
  }
}

/** Every repository of every space it's in. */
async function syncAll() {
  if (!setting('GITHUB_TOKEN')) return log('no GitHub token: its maintainers give it one (an admin of the repositories)');
  for (const space of JSON.parse(me()).spaces) {
    for (const r of JSON.parse(repoAccess(space.id))) {
      try {
        await syncRepo(space.id, r);
      } catch (error) {
        repoSynced(r.repo, error?.message ?? String(error));
      }
    }
  }
}

export async function onEvent(text) {
  const item = JSON.parse(text);
  // Who's in changes without a word to it (someone leaves): checked every few minutes too.
  if (item.kind === 'weave.start') tickEvery(5 * 60_000);
  // Started, a link or an account changed, or it's time: everything in step again.
  if (['weave.start', 'weave.tick', 'weave.github.repo', 'weave.github.account'].includes(item.kind)) await syncAll();
}
