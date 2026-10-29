// GitHub access: gives a project's members access to its GitHub repositories, and takes it back when they leave: the
// project's own (where its releases come from), or those its maintainers chose for it (REPOS, a setting picked from
// the repositories it reaches). A repository can be chosen in any number of projects: it gets everyone any of them
// lets in. Members get it with a GitHub account they proved and shared with the project (weave.account, checked by
// GitHub's verifier): read access to an organization's repository, write access to a person's (GitHub has no
// read-only collaborators there). All of it as whoever runs it, with their own GitHub App (GITHUB_APP: they create it
// once, on GitHub, and install it on their repositories; Weave signs its JWTs, the key never reaches this code), or a
// token of theirs (GITHUB_TOKEN). Weave only says who is in a project and whose accounts hold (readers, accounts), and
// knows nothing of GitHub. Each change it records in the project (github.added), to take back what it gave and
// nothing else.
import { accounts, answer, load, log, me, publish, readers, save, setting, sign, tickEvery } from 'weave:service/host@0.1.0';

const API = 'https://api.github.com';
const isRepo = (value) => typeof value === 'string' && /^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/.test(value);
const NOT_SIGNED_IN = "whoever runs it hasn't made its GitHub App yet: they do, once, in its Settings";
const encode = (text) => new TextEncoder().encode(text);
const base64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** Its person's GitHub App, if they made one: {id, slug, html_url, owner.login}. */
const app = () => {
  try {
    return JSON.parse(setting('GITHUB_APP') ?? 'null');
  } catch {
    return null;
  }
};

/** The App's JWT (Weave signs it with the App's key): for asking GitHub about the App and its installations. */
function appJwt(id) {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })))}.${base64url(encode(JSON.stringify({ iat: now - 60, exp: now + 540, iss: String(id) })))}`;
  return `${unsigned}.${base64url(sign('GITHUB_APP', 'RS256', encode(unsigned)))}`;
}

/** Installation tokens, by installation: kept until a few minutes before they run out. */
const minted = new Map();
async function installationToken(installation) {
  const kept = minted.get(installation);
  if (kept && kept.expires - Date.now() > 5 * 60_000) return kept.token;
  const { token, expires_at } = await github(appJwt(app().id), 'POST', `/app/installations/${installation}/access_tokens`);
  minted.set(installation, { token, expires: Date.parse(expires_at) });
  return token;
}

/** Its access to a repository: its App's installation there, or its person's token. */
async function tokenFor(repo) {
  const a = app();
  if (!a) return setting('GITHUB_TOKEN');
  let installation;
  try {
    installation = (await github(appJwt(a.id), 'GET', `/repos/${repo}/installation`)).id;
  } catch (error) {
    if (/ 404 /.test(error?.message ?? '')) throw new Error(`${a.slug} isn't installed on ${repo}: install it there (${a.html_url}/installations/new)`);
    throw error;
  }
  return installationToken(installation);
}

/** Whether it may act at all: its person made their App, or gave a token. */
const signedIn = () => !!app() || !!setting('GITHUB_TOKEN');

/** Its projects, each with its repositories: those chosen there, or else the project's own (its releases' source). */
const projects = () =>
  JSON.parse(me()).spaces.map((s) => {
    const chosen = [...new Set(String(s.settings?.REPOS ?? '').split(/[\s,]+/).filter(isRepo))];
    const own = [...new Set((s.sources ?? []).filter((x) => x.provider === 'github' && isRepo(x.ref)).map((x) => x.ref))];
    return { id: s.id, name: s.name, repos: chosen.length ? chosen : own, own: !chosen.length && own.length > 0 };
  });

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
  if (res.status === 401) throw new Error("GitHub doesn't take its access (any more): whoever runs it makes its App again, or gives another token, in its Settings");
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
  if (!signedIn()) return log('no GitHub App yet');
  // Whom it acts as there, to show: its App (and whose it is), or its person's account (a token).
  const a = app();
  const as = a ? `${a.slug}${a['owner.login'] ? ` (${a['owner.login']}'s)` : ''}` : (await github(setting('GITHUB_TOKEN'), 'GET', '/user').catch((error) => log(error?.message ?? String(error))))?.login;
  if (as && as !== state().login) change((s) => void (s.login = as));
  const byRepo = new Map(Object.keys(state().gave).map((repo) => [repo, []]));
  for (const project of projects()) for (const repo of project.repos) byRepo.set(repo, [...(byRepo.get(repo) ?? []), project]);
  for (const [repo, chosen] of byRepo) {
    try {
      await syncRepo(repo, chosen, await tokenFor(repo));
    } catch (error) {
      change((s) => void (s.status[repo] = { ...(s.status[repo] ?? {}), problem: error?.message ?? String(error), time: new Date().toISOString() }));
    }
  }
}

/** The repositories it reaches, to choose from (REPOS): those its App is installed on (or, with a token, those it administers first). */
async function reachable() {
  if (!signedIn()) throw new Error(NOT_SIGNED_IN);
  const a = app();
  if (a) {
    const repos = [];
    for (const installation of (await github(appJwt(a.id), 'GET', '/app/installations?per_page=100')) ?? []) {
      const got = await github(await installationToken(installation.id), 'GET', '/installation/repositories?per_page=100');
      repos.push(...(got?.repositories ?? []));
    }
    if (!repos.length) throw new Error(`${a.slug} isn't installed on any repository yet: install it (${a.html_url}/installations/new)`);
    return repos.map((r) => ({ value: r.full_name, ...(r.private || r.owner?.type !== 'Organization' ? { note: [r.private ? 'private' : '', r.owner?.type === 'Organization' ? '' : "a person's: members get write access"].filter(Boolean).join(' · ') } : {}) }));
  }
  const all = (await github(setting('GITHUB_TOKEN'), 'GET', '/user/repos?per_page=100&sort=updated')) ?? [];
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
    ...(project?.own ? { own: true } : {}),
    signedIn: signedIn(),
    ...(signedIn() && s.login ? { as: s.login } : {}),
    ...(app() ? { install: `${app().html_url}/installations/new` } : {}),
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
