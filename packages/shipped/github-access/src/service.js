// GitHub access: gives a project's members access to the GitHub repositories its maintainers chose for it (REPOS, a
// setting picked from what its GitHub sign-in reaches), and takes it back when they leave. A repository can be chosen
// in any number of projects: it gets everyone any of them lets in. Members get it with a GitHub account they proved
// and shared with the project (weave.account, checked by GitHub's verifier): read access to an organization's
// repository, write access to a person's (GitHub has no read-only collaborators there). All of it as whoever runs it,
// with their GitHub sign-in (GITHUB, theirs: once, for every project they run it in): Weave only says who is in a
// project and whose accounts hold (readers, accounts), and knows nothing of GitHub. Each change it records in the project (github.added), to take back what it gave and nothing else.
import { accounts, answer, load, log, me, publish, readers, save, setting, tickEvery } from 'weave:service/host@0.1.0';

const API = 'https://api.github.com';
const isRepo = (value) => typeof value === 'string' && /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(value);
const NOT_SIGNED_IN = "whoever runs it hasn't signed it in to GitHub yet: they do, once, in its Settings (as an admin of the repositories)";

/** Its sign-in: its person's GitHub, the same for every project. */
const token = () => setting('GITHUB') ?? setting('GITHUB_TOKEN');

/** Its projects, each with the repositories chosen there. */
const projects = () =>
  JSON.parse(me()).spaces.map((s) => ({
    id: s.id,
    name: s.name,
    repos: [...new Set(String(s.settings?.REPOS ?? '').split(/[\s,]+/).filter(isRepo))],
  }));

/**
 * What it keeps (in its own folder): whom it gave access by repository (and in which project), and how each went. A
 * round may still wait for GitHub while another event comes: each change reads it afresh, changes only its own part
 * and keeps it at once (no await in between), so none undoes another's.
 */
const state = () => {
  const s = JSON.parse(load('state') ?? '{"gave":{},"status":{}}');
  // From before: whom it gave access, without where.
  for (const [repo, gave] of Object.entries(s.gave)) if (Array.isArray(gave)) s.gave[repo] = Object.fromEntries(gave.map((login) => [login, '']));
  return s;
};
const change = (edit) => {
  const s = state();
  edit(s);
  save('state', JSON.stringify(s));
};

/** A GitHub API call with a sign-in: its JSON (or nothing), or why not. */
async function github(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'weave-github-access', 'x-github-api-version': '2022-11-28', authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : method === 'POST' || method === 'PUT' ? { body: '{}' } : {}),
  });
  if (res.status === 401) throw new Error("GitHub doesn't take its sign-in (any more): whoever runs it signs it in again, in its Settings");
  if (!res.ok) throw new Error(`GitHub said ${res.status} for ${method} ${path}`);
  return res.status === 204 ? undefined : res.json().catch(() => undefined);
}

/** The members of a project with a GitHub account proven there: their logins (its person never: it's their repository). */
function wantedIn(project, person) {
  const members = new Set(JSON.parse(readers(project.id)));
  return JSON.parse(accounts(project.id, 'github'))
    .filter((a) => a.verified && members.has(a.did) && a.did !== person)
    .map((a) => ({ login: a.handle.toLowerCase(), project: project.id }));
}

/** Bring one repository in step with every project that chose it: invite whom any lets in, take back the rest it gave. */
async function syncRepo(repo, chosen, token) {
  const person = JSON.parse(me()).person;
  const want = new Map();
  for (const project of chosen) for (const w of wantedIn(project, person)) if (!want.has(w.login)) want.set(w.login, w);
  const known = state().status[repo];
  // A person's repository takes collaborators who write; an organization's, ones who only read.
  const personal = known?.personal ?? (await github(token, 'GET', `/repos/${repo}`)).owner?.type !== 'Organization';
  const gave = state().gave[repo] ?? {};
  const people = await github(token, 'GET', `/repos/${repo}/collaborators?affiliation=direct&per_page=100`);
  const invites = await github(token, 'GET', `/repos/${repo}/invitations?per_page=100`);
  const collaborators = new Set(people.map((p) => p.login.toLowerCase()));
  const invited = new Map(invites.filter((i) => i.invitee).map((i) => [i.invitee.login.toLowerCase(), i.id]));
  // Someone it invited who isn't in (or invited) any more declined or left on GitHub: not asked again.
  const invite = [...want.values()].filter((w) => !collaborators.has(w.login) && !invited.has(w.login) && !(w.login in gave));
  const remove = Object.keys(gave).filter((l) => !want.has(l) && (collaborators.has(l) || invited.has(l)));
  const here = new Set(projects().map((p) => p.id));
  const given = (login, project) =>
    change((s) => {
      const now = (s.gave[repo] ??= {});
      if (project === undefined) delete now[login];
      else now[login] = project;
    });
  for (const w of invite) {
    await github(token, 'PUT', `/repos/${repo}/collaborators/${w.login}`, { permission: personal ? 'push' : 'pull' });
    given(w.login, w.project);
    publish(w.project, 'github.added', JSON.stringify({ repo, login: w.login, on: true }));
  }
  for (const login of remove) {
    if (invited.has(login)) await github(token, 'DELETE', `/repos/${repo}/invitations/${invited.get(login)}`);
    else await github(token, 'DELETE', `/repos/${repo}/collaborators/${login}`);
    given(login, undefined);
    if (here.has(gave[login])) publish(gave[login], 'github.added', JSON.stringify({ repo, login, on: false }));
  }
  change((s) => {
    if (!Object.keys(s.gave[repo] ?? {}).length) delete s.gave[repo];
    s.status[repo] = { given: Object.keys(s.gave[repo] ?? {}).length, personal, time: new Date().toISOString() };
  });
}

/** Every repository its projects chose, each with all of them; ones no project chooses any more only take back what it gave. */
async function syncAll() {
  const signIn = token();
  if (!signIn) return log('not signed in to GitHub');
  // Whom it acts as there, to show: its person's GitHub account.
  try {
    const login = (await github(signIn, 'GET', '/user'))?.login;
    if (login && login !== state().login) change((s) => void (s.login = login));
  } catch (error) {
    log(error?.message ?? String(error));
  }
  const byRepo = new Map(Object.keys(state().gave).map((repo) => [repo, []]));
  for (const project of projects()) for (const repo of project.repos) byRepo.set(repo, [...(byRepo.get(repo) ?? []), project]);
  for (const [repo, chosen] of byRepo) {
    try {
      await syncRepo(repo, chosen, signIn);
    } catch (error) {
      change((s) => void (s.status[repo] = { ...(s.status[repo] ?? {}), problem: error?.message ?? String(error), time: new Date().toISOString() }));
    }
  }
}

/** The repositories its sign-in reaches, to choose from (REPOS): those it administers first. */
async function reachable() {
  const signIn = token();
  if (!signIn) throw new Error(NOT_SIGNED_IN);
  const all = (await github(signIn, 'GET', '/user/repos?per_page=100&sort=updated')) ?? [];
  return all
    .map((r) => ({ value: r.full_name, admin: !!r.permissions?.admin, note: [r.private ? 'private' : '', r.owner?.type === 'Organization' ? '' : "a person's: members get write access", r.permissions?.admin ? '' : "its sign-in isn't an admin"].filter(Boolean).join(' · ') }))
    .sort((a, b) => Number(b.admin) - Number(a.admin))
    .map(({ admin, ...r }) => (r.note ? r : { value: r.value }));
}

/** How it's going in a project: its repositories, whom it acts as on GitHub, and whether the one asking gets access (and as whom). */
function status(space, who) {
  const project = projects().find((p) => p.id === space);
  const s = state();
  const mine = JSON.parse(accounts(space, 'github')).find((a) => a.did === who && a.verified);
  return {
    repos: (project?.repos ?? []).map((repo) => ({ repo, url: `https://github.com/${repo}`, ...(s.status[repo] ?? {}) })),
    signedIn: !!token(),
    ...(token() && s.login ? { as: s.login } : {}),
    ...(mine ? { me: { handle: mine.handle } } : {}),
  };
}

export async function onEvent(text) {
  const item = JSON.parse(text);
  // Who's in changes without a word to it (someone leaves): checked every few minutes too. A changed setting (the
  // repositories chosen) starts it again.
  if (item.kind === 'weave.start') tickEvery(5 * 60_000);
  if (['weave.start', 'weave.tick', 'weave.account'].includes(item.kind)) return syncAll();
  if (item.kind !== 'weave.service.request') return;
  const { action } = item.body ?? {};
  try {
    if (action === 'reachable') return void answer(item.id, undefined, JSON.stringify(await reachable()), undefined);
    if (action === 'status') return void answer(item.id, undefined, JSON.stringify(status(item.space.id, item.author)), undefined);
    throw new Error('it answers reachable and status');
  } catch (error) {
    answer(item.id, undefined, undefined, error?.message ?? String(error));
  }
}
