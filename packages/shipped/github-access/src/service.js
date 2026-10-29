// GitHub access: keeps the GitHub repositories linked in its spaces in step with who is in them. Its maintainers link
// a repository to a space (a repository to any number of spaces, a space to any number of repositories): linked, it
// gives nobody anything yet. Then they say who there gets access (everyone, a board's readers, or people they pick to
// write); members who proved their GitHub account in the space (weave.account, checked by GitHub's verifier) get it,
// and whoever leaves loses it. All of it with its own sign-in (an admin's): Weave only says who reads the space and
// whose accounts hold (readers, accounts), and knows nothing of GitHub. Each change it records in the space
// (github.added), to take back what it gave and nothing else.
import { accounts, answer, load, log, me, publish, readers, save, setting, tickEvery } from 'weave:service/host@0.1.0';

const API = 'https://api.github.com';
/** Its access: a maintainer's sign-in (renewed by Weave), or a token they gave. */
const token = () => setting('GITHUB') ?? setting('GITHUB_TOKEN');
const isRepo = (value) => typeof value === 'string' && /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(value);
const ACCESS = ['none', 'read', 'write'];
const NOT_SIGNED_IN = "it isn't signed in to GitHub yet: one of its maintainers signs it in, in its Settings (an admin of the repositories)";

/**
 * What it keeps (in its own folder): links by space, whom it gave access by repository (and in which space), and how
 * each went. A round may still wait for GitHub while another event comes: each change reads it afresh, changes only
 * its own part and keeps it at once (no await in between), so none undoes another's.
 */
const state = () => {
  const s = JSON.parse(load('state') ?? '{"links":{},"gave":{},"status":{}}');
  // From before: whom it gave access, without where.
  for (const [repo, gave] of Object.entries(s.gave)) if (Array.isArray(gave)) s.gave[repo] = Object.fromEntries(gave.map((login) => [login, '']));
  return s;
};
const change = (edit) => {
  const s = state();
  edit(s);
  save('state', JSON.stringify(s));
};

/** A GitHub API call with its token: its JSON (or nothing), or why not. */
async function github(method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'weave-github-access', 'x-github-api-version': '2022-11-28', authorization: `Bearer ${token()}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : method === 'POST' || method === 'PUT' ? { body: '{}' } : {}),
  });
  if (res.status === 401) throw new Error("GitHub doesn't take its sign-in (any more): one of its maintainers signs it in again, in its Settings");
  if (!res.ok) throw new Error(`GitHub said ${res.status} for ${method} ${path}`);
  return res.status === 204 ? undefined : res.json().catch(() => undefined);
}

/** Who should be in a repository by one space's link: their logins, with the space and whether they write. */
function wantedBy(space, link, person) {
  if (!link.access || link.access === 'none') return [];
  const proven = JSON.parse(accounts(space, 'github')).filter((a) => a.verified);
  const allowed = new Set(link.access === 'write' ? (link.writers ?? []) : JSON.parse(readers(space, link.board)));
  // Its person's repository: they're never invited to it.
  return proven.filter((a) => allowed.has(a.did) && a.did !== person).map((a) => ({ login: a.handle.toLowerCase(), space, write: link.access === 'write' }));
}

/**
 * Bring one repository in step with every space it's linked to: invite whom any of them lets in, take back what it
 * gave those none does any more.
 */
async function syncRepo(repo, linked) {
  const { person, spaces } = JSON.parse(me());
  const want = new Map();
  for (const { space, link } of linked)
    for (const w of wantedBy(space, link, person)) {
      const before = want.get(w.login);
      if (!before || (w.write && !before.write)) want.set(w.login, w);
    }
  const gave = state().gave[repo] ?? {};
  const people = await github('GET', `/repos/${repo}/collaborators?affiliation=direct&per_page=100`);
  const invites = await github('GET', `/repos/${repo}/invitations?per_page=100`);
  const collaborators = new Set(people.map((p) => p.login.toLowerCase()));
  const invited = new Map(invites.filter((i) => i.invitee).map((i) => [i.invitee.login.toLowerCase(), i.id]));
  // Someone it invited who isn't in (or invited) any more declined or left on GitHub: not asked again.
  const invite = [...want.values()].filter((w) => !collaborators.has(w.login) && !invited.has(w.login) && !(w.login in gave));
  const remove = Object.keys(gave).filter((l) => !want.has(l) && (collaborators.has(l) || invited.has(l)));
  const here = new Set(spaces.map((s) => s.id));
  const given = (login, space) =>
    change((s) => {
      const now = (s.gave[repo] ??= {});
      if (space === undefined) delete now[login];
      else now[login] = space;
    });
  for (const w of invite) {
    await github('PUT', `/repos/${repo}/collaborators/${w.login}`, { permission: w.write ? 'push' : 'pull' });
    given(w.login, w.space);
    publish(w.space, 'github.added', JSON.stringify({ repo, login: w.login, on: true }));
  }
  for (const login of remove) {
    if (invited.has(login)) await github('DELETE', `/repos/${repo}/invitations/${invited.get(login)}`);
    else await github('DELETE', `/repos/${repo}/collaborators/${login}`);
    given(login, undefined);
    if (here.has(gave[login])) publish(gave[login], 'github.added', JSON.stringify({ repo, login, on: false }));
  }
  change((s) => {
    if (!Object.keys(s.gave[repo] ?? {}).length) delete s.gave[repo];
    s.status[repo] = { given: Object.keys(s.gave[repo] ?? {}).length, time: new Date().toISOString() };
  });
}

/** Every repository linked in a space it's in, each with all its spaces; unlinked ones only take back what it gave. */
async function syncAll() {
  if (!token()) return log('not signed in to GitHub: one of its maintainers signs it in (an admin of the repositories)');
  const { links, gave } = state();
  const byRepo = new Map(Object.keys(gave).map((repo) => [repo, []]));
  for (const space of JSON.parse(me()).spaces) for (const [repo, link] of Object.entries(links[space.id] ?? {})) byRepo.set(repo, [...(byRepo.get(repo) ?? []), { space: space.id, link }]);
  for (const [repo, linked] of byRepo) {
    try {
      await syncRepo(repo, linked);
    } catch (error) {
      change((s) => void (s.status[repo] = { problem: error?.message ?? String(error), time: new Date().toISOString() }));
    }
  }
}

/** A repository as given: owner/name, or its page. */
const repoOf = (value) => String(value ?? '').trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');

/** Link a repository to a space (maintainers): linked only, nobody gets anything by it until they say who does. */
async function link(space, input) {
  const repo = repoOf(input.repo);
  if (!isRepo(repo)) throw new Error('a repository looks like owner/name');
  if (!token()) throw new Error(NOT_SIGNED_IN);
  const found = await github('GET', `/repos/${repo}`).catch(() => undefined);
  if (!found) throw new Error(`its GitHub sign-in doesn't reach ${repo}`);
  if (state().links[space]?.[found.full_name]) return `${found.full_name} is linked here already`;
  change((s) => void ((s.links[space] ??= {})[found.full_name] = { access: 'none' }));
  if (input.access && input.access !== 'none') return setAccess(space, { ...input, repo: found.full_name });
  return `${found.full_name} is linked here: nobody gets access by it yet`;
}

/** Who in a space gets access to a repository linked there (maintainers): nobody, everyone, a board's readers, or people picked to write. */
async function setAccess(space, input) {
  const repo = repoOf(input.repo);
  if (!state().links[space]?.[repo]) throw new Error(`${repo} isn't linked here`);
  const access = ACCESS.includes(input.access) ? input.access : undefined;
  if (!access) throw new Error('access is none, read or write');
  const board = access === 'read' && input.board ? String(input.board).trim() : undefined;
  // A board that isn't there: Weave says so.
  if (board) readers(space, board);
  if (access === 'read') {
    if (!token()) throw new Error(NOT_SIGNED_IN);
    const found = await github('GET', `/repos/${repo}`).catch(() => undefined);
    if (!found) throw new Error(`its GitHub sign-in doesn't reach ${repo}: is whoever signed it in an admin of that repository?`);
    if (found.owner?.type !== 'Organization')
      throw new Error(`${repo} belongs to a person, not an organization: GitHub gives its collaborators write access, never read-only. Move it to an organization (free; its Settings, Transfer), or let people you pick write`);
  }
  change((s) => void (s.links[space][repo] = { access, ...(board ? { board } : {}), ...(access === 'write' ? { writers: (input.writers ?? []).map(String) } : {}) }));
  if (access === 'none') return `${repo} stays linked: nobody gets access by it`;
  return `${repo}: ${access === 'write' ? 'the people picked write' : board ? `the readers of ${board} read` : 'everyone here reads'}, once they proved their GitHub account here`;
}

/** The repositories linked here, and how each is going. */
function repos(space) {
  const s = state();
  return Object.entries(s.links[space] ?? {}).map(([repo, l]) => ({ repo, url: `https://github.com/${repo}`, ...l, ...(s.status[repo] ?? {}) }));
}

/** The repositories its sign-in reaches, to pick one to link (maintainers): those it administers first. */
async function available() {
  if (!token()) throw new Error(NOT_SIGNED_IN);
  const all = (await github('GET', '/user/repos?per_page=100&sort=updated')) ?? [];
  return all.map((r) => ({ repo: r.full_name, private: !!r.private, org: r.owner?.type === 'Organization', admin: !!r.permissions?.admin })).sort((a, b) => Number(b.admin) - Number(a.admin));
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
    if (action === 'available') return void answer(item.id, undefined, JSON.stringify(await available()), undefined);
    if (action === 'link') {
      answer(item.id, await link(item.space.id, data ?? {}), undefined, undefined);
      return syncAll().catch((error) => log(String(error?.message ?? error)));
    }
    // Who gets access changed: answered at once, then brought in step with GitHub.
    if (action === 'access') {
      answer(item.id, await setAccess(item.space.id, data ?? {}), undefined, undefined);
      return syncAll().catch((error) => log(String(error?.message ?? error)));
    }
    if (action === 'unlink') {
      const repo = repoOf(data?.repo);
      if (!state().links[item.space.id]?.[repo]) throw new Error(`${repo} isn't linked here`);
      change((s) => void delete s.links[item.space.id][repo]);
      answer(item.id, `${repo} unlinked: access it gave by it is taken back`, undefined, undefined);
      return syncAll().catch((error) => log(String(error?.message ?? error)));
    }
    throw new Error('it answers repos, available, link, access and unlink');
  } catch (error) {
    answer(item.id, undefined, undefined, error?.message ?? String(error));
  }
}
