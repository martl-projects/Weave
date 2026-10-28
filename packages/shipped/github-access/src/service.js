// GitHub access: keeps the GitHub repositories linked in its spaces in step with who is in them. Its maintainers link
// a repository (for everyone there, or a board's readers, or people they pick to write); members who proved their
// GitHub account in the space (weave.account, checked by GitHub's verifier) get access; whoever leaves loses it. All
// of it with its own token (an admin's): Weave only says who reads the space and whose accounts hold (readers,
// accounts), and knows nothing of GitHub. Each change it records in the space (github.added), to take back what it
// gave and nothing else.
import { accounts, answer, load, log, me, publish, readers, save, setting, tickEvery } from 'weave:service/host@0.1.0';

const API = 'https://api.github.com';
const isRepo = (value) => typeof value === 'string' && /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(value);

/**
 * What it keeps (in its own folder): links by space, whom it gave access by repository, and how each went. A round
 * may still wait for GitHub while another event comes: each change reads it afresh, changes only its own part and
 * keeps it at once (no await in between), so none undoes another's.
 */
const state = () => JSON.parse(load('state') ?? '{"links":{},"gave":{},"status":{}}');
const change = (edit) => {
  const s = state();
  edit(s);
  save('state', JSON.stringify(s));
};

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

/** Bring one repository in step: invite who should be in, take back what it gave those who shouldn't. */
async function syncRepo(space, repo, link) {
  const proven = space ? JSON.parse(accounts(space, 'github')).filter((a) => a.verified) : [];
  const allowed = new Set(link.access === 'write' ? (link.writers ?? []) : space ? JSON.parse(readers(space, link.board)) : []);
  // Its person's repository: they're never invited to it.
  const person = JSON.parse(me()).person;
  const want = new Set(link.access === 'none' ? [] : proven.filter((a) => allowed.has(a.did) && a.did !== person).map((a) => a.handle.toLowerCase()));
  const gave = new Set(state().gave[repo] ?? []);
  const people = await github('GET', `/repos/${repo}/collaborators?affiliation=direct&per_page=100`);
  const invites = await github('GET', `/repos/${repo}/invitations?per_page=100`);
  const collaborators = new Set(people.map((p) => p.login.toLowerCase()));
  const invited = new Map(invites.filter((i) => i.invitee).map((i) => [i.invitee.login.toLowerCase(), i.id]));
  // Someone it invited who isn't in (or invited) any more declined or left on GitHub: not asked again.
  const invite = [...want].filter((l) => !collaborators.has(l) && !invited.has(l) && !gave.has(l));
  const remove = [...gave].filter((l) => !want.has(l) && (collaborators.has(l) || invited.has(l)));
  const given = (login, on) =>
    change((s) => {
      const now = new Set(s.gave[repo] ?? []);
      if (on) now.add(login);
      else now.delete(login);
      s.gave[repo] = [...now];
    });
  for (const login of invite) {
    await github('PUT', `/repos/${repo}/collaborators/${login}`, { permission: link.access === 'write' ? 'push' : 'pull' });
    given(login, true);
    if (space) publish(space, 'github.added', JSON.stringify({ repo, login, on: true }));
  }
  for (const login of remove) {
    if (invited.has(login)) await github('DELETE', `/repos/${repo}/invitations/${invited.get(login)}`);
    else await github('DELETE', `/repos/${repo}/collaborators/${login}`);
    given(login, false);
    if (space) publish(space, 'github.added', JSON.stringify({ repo, login, on: false }));
  }
  change((s) => {
    if (!s.gave[repo]?.length) delete s.gave[repo];
    s.status[repo] = { given: s.gave[repo]?.length ?? 0, time: new Date().toISOString() };
  });
}

/** Every repository of every space it's in; unlinked ones only take back what it gave. */
async function syncAll() {
  if (!setting('GITHUB_TOKEN')) return log('no GitHub token: its maintainers give it one (an admin of the repositories)');
  const spaces = JSON.parse(me()).spaces;
  const { links, gave } = state();
  for (const space of spaces) {
    for (const [repo, link] of Object.entries(links[space.id] ?? {})) {
      try {
        await syncRepo(space.id, repo, link);
      } catch (error) {
        change((s) => void (s.status[repo] = { problem: error?.message ?? String(error), time: new Date().toISOString() }));
      }
    }
  }
  for (const repo of Object.keys(gave)) {
    if (Object.values(links).some((l) => l[repo])) continue;
    try {
      await syncRepo(spaces[0]?.id, repo, { access: 'none' });
    } catch (error) {
      log(`${repo}: ${error?.message ?? error}`);
    }
  }
}

/** Link a repository (maintainers): checked with GitHub first. A person's repository gives no read-only access. */
async function link(space, input) {
  const repo = String(input?.repo ?? '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  if (!isRepo(repo)) throw new Error('a repository looks like owner/name');
  if (!setting('GITHUB_TOKEN')) throw new Error('it has no GitHub token yet: its maintainers give it one (an admin of the repository)');
  const found = await github('GET', `/repos/${repo}`).catch(() => undefined);
  if (!found) throw new Error(`its token doesn't reach ${repo}: is it an admin's, for that repository?`);
  const access = input.access === 'write' || input.access === 'none' ? input.access : 'read';
  if (access === 'read' && found.owner?.type !== 'Organization')
    throw new Error(`${repo} belongs to a person, not an organization: GitHub gives its collaborators write access, never read-only. Move it to an organization (free; its Settings, Transfer), or link it for people you pick to write`);
  const board = input.board ? String(input.board).trim() : undefined;
  // A board that isn't there: Weave says so.
  if (board) readers(space, board);
  change((s) => void ((s.links[space] ??= {})[found.full_name] = { access, ...(board ? { board } : {}), ...(access === 'write' ? { writers: (input.writers ?? []).map(String) } : {}) }));
  await syncAll();
  return `${found.full_name} follows this space now`;
}

/** The repositories linked here, and how each is going. */
function repos(space) {
  const s = state();
  return Object.entries(s.links[space] ?? {}).map(([repo, l]) => ({ repo, url: `https://github.com/${repo}`, ...l, ...(s.status[repo] ?? {}) }));
}

export async function onEvent(text) {
  const item = JSON.parse(text);
  // Who's in changes without a word to it (someone leaves): checked every few minutes too.
  if (item.kind === 'weave.start') tickEvery(5 * 60_000);
  if (['weave.start', 'weave.tick', 'weave.account'].includes(item.kind)) return syncAll();
  if (item.kind !== 'weave.service.request') return;
  const { action, data } = item.body ?? {};
  try {
    if (action === 'repos') return void answer(item.id, undefined, JSON.stringify(repos(item.space.id)), undefined);
    if (action === 'link') return void answer(item.id, await link(item.space.id, data), undefined, undefined);
    if (action === 'unlink') {
      const repo = String(data?.repo ?? '');
      if (!state().links[item.space.id]?.[repo]) throw new Error(`${repo} isn't linked here`);
      change((s) => void delete s.links[item.space.id][repo]);
      await syncAll();
      return void answer(item.id, `${repo} unlinked: access it gave is taken back`, undefined, undefined);
    }
    throw new Error('it answers repos, link and unlink');
  } catch (error) {
    answer(item.id, undefined, undefined, error?.message ?? String(error));
  }
}
