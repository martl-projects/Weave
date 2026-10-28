import { useEffect, useState, useSyncExternalStore } from 'react';
import type { Actor, AppOpen, BoardInfo, Profile, RepoInfo, SpaceInfo, SpaceRepos } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bridge, bump, navigate, onItem, shortDid, useApi } from './lib.ts';
import { copy, spaceHref } from './posts.tsx';
import { ask, attempt, AsyncButton, Modal } from './ui.tsx';

/*
 * GitHub repositories that follow a group, tier or project, and the GitHub accounts of its people. Nobody signs in to
 * GitHub in Weave: a space's GitHub access service (its own token) gives and takes access, and people prove their
 * account with a gist they make themselves, naming them. Weave only ever takes away access it gave.
 */

/**
 * Proving a GitHub account is yours: a gist you make on github.com holding a line that names you, its address pasted
 * here. Weave checks it (and everyone's Weave checks it again, every hour).
 */
export function GitHubProofDialog({ title, about, onProve, onClose }: { title: string; about: string; onProve(login: string, gist: string): Promise<unknown>; onClose(): void }) {
  const [login, setLogin] = useState('');
  const [gist, setGist] = useState('');
  const { data: proof } = useApi(() => (/^[A-Za-z0-9-]{1,39}$/.test(login) ? api<{ text: string; url: string }>('githubProof', { login }) : Promise.resolve(undefined)), [login]);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const done = await attempt(() => onProve(login, gist).then(() => (bump(), true)), `${login} is proven yours`);
          if (done !== undefined) onClose();
        }}
      >
        <p className="small">{about}</p>
        <div className="field-row-stacked">
          <label htmlFor="proof-login">Your GitHub username</label>
          <input id="proof-login" required autoFocus value={login} onChange={(e) => setLogin(e.target.value.trim())} placeholder="octocat" />
        </div>
        {proof && (
          <ol className="steps small">
            <li>
              On{' '}
              <a href={proof.url} target="_blank" rel="noopener noreferrer">
                gist.github.com
              </a>
              , signed in as <b>{login}</b>, make a gist (secret is fine) holding this line:
              <div className="user-code sunken small" title="Click to copy" onClick={() => copy(proof.text.trim(), 'Copied')}>
                {proof.text.trim()}
              </div>
            </li>
            <li>Paste its address here:</li>
          </ol>
        )}
        <div className="field-row-stacked">
          <label htmlFor="proof-gist">The gist</label>
          <input id="proof-gist" required value={gist} onChange={(e) => setGist(e.target.value)} placeholder={`https://gist.github.com/${login || 'you'}/…`} />
        </div>
        <p className="small muted">Weave checks that the gist belongs to {login || 'that account'} and names you. Delete the gist, and the proof goes with it.</p>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default" disabled={!login || !gist}>
            Prove it
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** In Keys & devices: your GitHub account on your hub, proven by a gist of yours. */
export function LinkedAccountsBox() {
  const { data: me } = useApi(() => api<Profile>('profile'), []);
  const [proving, setProving] = useState(false);
  return (
    <fieldset>
      <legend>Linked accounts</legend>
      <div className="field-row">
        <Icon name="externalLink" />
        <span className="grow">
          <b>GitHub</b>{' '}
          {me?.github ? (
            <span className="small">
              your hub shows{' '}
              <a href={me.github.url} target="_blank" rel="noopener noreferrer">
                {me.github.login}
              </a>
              {me.github.verified ? ' ✓' : ''}
            </span>
          ) : (
            <span className="small muted">not shown</span>
          )}
        </span>
        {me?.github ? (
          <AsyncButton onClick={() => attempt(() => api('showGithubOnHub', { on: false }).then(bump), 'Your hub no longer shows GitHub')}>Stop showing</AsyncButton>
        ) : (
          <button onClick={() => setProving(true)}>Show on my hub…</button>
        )}
      </div>
      <p className="small">Nobody signs in to GitHub in Weave. Spaces whose repositories follow them ask for your account, proven by a gist of yours; their GitHub access service gives you access.</p>
      {proving && <GitHubProofDialog title="Show your GitHub account" about="Your hub shows it, with a check: anyone can see that the gist of that account names you." onProve={(login, gist) => api('showGithubOnHub', { on: true, login, gist })} onClose={() => setProving(false)} />}
    </fieldset>
  );
}

/** Give a space your GitHub account, proven by a gist of yours. */
function useShare(space: SpaceInfo) {
  const [proving, setProving] = useState(false);
  const share = async () => setProving(true);
  const dialog = proving && (
    <GitHubProofDialog
      title={`Give ${space.name} your GitHub account`}
      about={`Its repositories invite this account: ${space.name}'s GitHub access service gives it access while you're in it, and takes it back when you leave.`}
      onProve={(login, gist) => api('shareGithub', { space: space.id, on: true, login, gist })}
      onClose={() => setProving(false)}
    />
  );
  return { share, dialog };
}

/** Before someone gives a space their GitHub account: who sees the name, and what it's for. */
function whoSeesIt(data: SpaceRepos, space: SpaceInfo): string {
  const linkers = [...new Set(data.repos.filter((r) => !r.mine).map((r) => r.by.name ?? shortDid(r.by.did)))];
  const by = linkers.length ? `${linkers.join(' and ')}, who linked ${data.repos.length === 1 ? 'the repository' : 'its repositories'}, ${linkers.length === 1 ? 'uses' : 'use'} it` : 'Whoever linked its repositories uses it';
  return `Your GitHub name goes to this ${space.kind}, sealed for its members (not public). ${by} to invite you on GitHub.`;
}

/** On a space's page: its repositories wait for your GitHub account. */
export function RepoBanner({ space }: { space: SpaceInfo }) {
  const { data } = useApi(() => api<SpaceRepos>('spaceRepos', space.id).catch(() => undefined), [space.id]);
  const { share, dialog } = useShare(space);
  const theirs = data?.repos.filter((r) => r.forYou) ?? [];
  const writes = theirs.some((r) => r.access === 'write');
  if (!data || data.shared || !theirs.length) return dialog || null;
  return (
    <div className="repo-banner">
      <Icon name="info" />
      <span className="grow">
        {theirs.length === 1 ? (
          <>
            <b>{theirs[0].repo}</b> on GitHub
          </>
        ) : (
          <>{theirs.length} GitHub repositories</>
        )}{' '}
        follow{theirs.length === 1 ? 's' : ''} this {space.kind}. Give it your GitHub account to get {writes ? 'access (you were picked to write)' : 'read access'}.
        <div className="small muted">{whoSeesIt(data, space)}</div>
      </span>
      <AsyncButton className="default" onClick={share}>
        Give my GitHub account
      </AsyncButton>
      {dialog}
    </div>
  );
}

// ---------------------------------------------------------------- agents opening the app for their person

/** A Link a repository dialog an agent asked for, waiting for that space's settings to show it. */
let wantedLink: { space: string; repo?: string } | undefined;
const linkListeners = new Set<() => void>();
const subscribeLink = (listener: () => void) => (linkListeners.add(listener), () => void linkListeners.delete(listener));

/** Where a space's settings are: groups and tiers, and projects, have Settings; a community its About page. */
const settingsHref = (space: NonNullable<AppOpen['space']>) => `${spaceHref(space)}/${space.kind === 'community' ? 'about' : 'settings'}`;

let opening = false;

/** Agents can bring the app to the front, at a space, its Link a repository dialog or the Inbox (weave_open_in_app). Once per app. */
export function startAppOpens(): void {
  if (opening) return;
  opening = true;
  onItem((item) => {
    if (item.kind !== 'weave.open') return;
    const open = item.body as unknown as AppOpen;
    void bridge.show();
    // A post (Open in Weave on its page): PublicPost takes it to where it lives.
    if (open.what === 'post' && open.post) return navigate(`#/post/${open.post.id}`);
    if (open.what === 'person' && open.person) return navigate(`#/space/${open.person.did}`);
    if (open.what === 'inbox' || !open.space) return navigate('#/inbox');
    if (open.what === 'link-repo') {
      wantedLink = { space: open.space.id, ...(open.repo ? { repo: open.repo } : {}) };
      for (const listener of linkListeners) listener();
      return navigate(settingsHref(open.space));
    }
    navigate(spaceHref(open.space));
  });
}

/** In a space's settings: its repositories, linking more (owner, maintainers), and your account. */
export function RepoSettings({ space }: { space: SpaceInfo }) {
  const { data } = useApi(() => api<SpaceRepos>('spaceRepos', space.id), [space.id]);
  const [linking, setLinking] = useState<false | { repo?: string; link?: RepoInfo }>(false);
  // An agent asked for this space's link dialog: open it, with its repository.
  const wanted = useSyncExternalStore(subscribeLink, () => wantedLink);
  useEffect(() => {
    if (wanted?.space !== space.id) return;
    setLinking({ repo: wanted.repo });
    wantedLink = undefined;
  }, [wanted, space.id]);
  const { share, dialog } = useShare(space);
  if (!data) return null;
  return (
    <fieldset>
      <legend>GitHub repositories</legend>
      {data.repos.map((r) => (
        <div className="field-row" key={r.repo}>
          <Icon name="notes" />
          <span className="grow">
            <a href={r.url} target="_blank" rel="noopener noreferrer">
              {r.repo}
            </a>
            {r.board && <span className="small muted"> · readers of {r.board}</span>}
            {r.access === 'none' && <span className="small muted"> · linked only, nobody gets access</span>}
            {r.access === 'write' && <span className="small muted"> · can write: {(r.writers ?? []).map((w) => w.name ?? shortDid(w.did)).join(', ')}</span>}
            <span className="small muted"> · linked by {r.mine ? 'you' : (r.by.name ?? shortDid(r.by.did))}</span>
            {r.synced && !r.problem && <span className="small muted"> · in step {ago(r.synced)}</span>}
            {r.problem && <div className="small error-text">{r.problem}</div>}
            {r.problem && /belongs to a person/.test(r.problem) && <MoveToOrganization repo={r.repo} />}
          </span>
          {r.mine && r.access === 'write' && <button onClick={() => setLinking({ repo: r.repo, link: r })}>Who can write…</button>}
          {(r.mine || data.canLink) && (
            <AsyncButton onClick={async () => (await ask(`Unlink ${r.repo}? Access Weave gave is taken back${r.mine ? '' : ' (by whoever linked it)'}.`, 'Unlink')) && attempt(() => api('linkRepo', { space: space.id, repo: r.repo, on: false }).then(bump), `${r.repo} unlinked`)}>
              Unlink
            </AsyncButton>
          )}
        </div>
      ))}
      {data.repos.length === 0 && <p className="small">No repositories yet.{data.canLink ? " Link one, and members who prove their GitHub account get read access from its GitHub access service; they lose it when they leave." : ''}</p>}
      {data.missing && data.missing.length > 0 && (
        <p className="small">
          Not given their GitHub account yet: {data.missing.map((a) => a.name ?? shortDid(a.did)).join(', ')}.
        </p>
      )}
      {data.repos.length > 0 && (
        <div className="field-row">
          <span className="grow small">
            {data.shared ? <>You gave it your GitHub account <b>{data.shared}</b>.</> : "You haven't given it your GitHub account."}
            {!data.shared && <div className="muted">{whoSeesIt(data, space)}</div>}
          </span>
          {data.shared ? (
            <AsyncButton onClick={() => attempt(() => api('shareGithub', { space: space.id, on: false }).then(bump), 'Your GitHub account was taken back')}>Take it back</AsyncButton>
          ) : (
            <AsyncButton onClick={share}>Give my GitHub account</AsyncButton>
          )}
        </div>
      )}
      {data.canLink && (
        <div className="buttons">
          <button onClick={() => setLinking({})}>Link a repository…</button>
        </div>
      )}
      {linking && <LinkRepoDialog space={space} initialRepo={linking.repo} link={linking.link} mayWrite={data.mayWrite ?? []} onClose={() => setLinking(false)} />}
      {dialog}
    </fieldset>
  );
}

/** Where a person's repository can move to give all members read access: a new (free) organization, and the repository's Transfer. */
function MoveToOrganization({ repo }: { repo: string }) {
  return (
    <p className="small">
      For read access for everyone in it, move the repository to a GitHub organization:{' '}
      <a href="https://github.com/account/organizations/new" target="_blank" rel="noopener noreferrer">
        create one
      </a>{' '}
      (free), then{' '}
      <a href={`https://github.com/${repo}/settings`} target="_blank" rel="noopener noreferrer">
        transfer it
      </a>{' '}
      (Settings → Danger Zone → Transfer), and link it again. Issues, stars and links come along; Pages addresses, package names (ghcr.io/…) and your local remotes change.
    </p>
  );
}

function LinkRepoDialog({ space, initialRepo, link, mayWrite, onClose }: { space: SpaceInfo; initialRepo?: string; link?: RepoInfo; mayWrite: Actor[]; onClose(): void }) {
  const { data: boards } = useApi(() => (space.kind === 'project' ? api<BoardInfo[]>('boards', space.id) : Promise.resolve([])), [space.id]);
  const [repo, setRepo] = useState(link?.repo ?? initialRepo ?? '');
  const [board, setBoard] = useState('');
  const [access, setAccess] = useState<'read' | 'none' | 'write'>(link?.access ?? 'read');
  const [writers, setWriters] = useState<string[]>(link?.writers?.map((w) => w.did) ?? []);
  const name = repo.trim().replace(/^https:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/$/, '');
  const pick = (did: string, on: boolean) => setWriters((list) => (on ? [...list, did] : list.filter((d) => d !== did)));
  return (
    <Modal title="Link a repository" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const how = access === 'read' ? { board: board || undefined } : { access, ...(access === 'write' ? { writers } : {}) };
          const done = await attempt(() => api('linkRepo', { space: space.id, repo: name, ...how, on: true }).then(() => (bump(), true)), link ? `Who can write to ${name} changed` : `${name} now follows ${space.name}`);
          if (done !== undefined) onClose();
        }}
      >
        <div className="field-row-stacked">
          <label htmlFor="link-repo">Repository</label>
          <input id="link-repo" required disabled={!!link} value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/name, or its address" />
        </div>
        <div className="field-row-stacked">
          <label>Who gets access</label>
          <div className="field-row">
            <input type="radio" id="repo-read" checked={access === 'read'} onChange={() => setAccess('read')} />
            <label htmlFor="repo-read">Read access for {space.kind === 'project' && boards?.length ? 'its people' : `everyone in ${space.name}`} (an organization's repository)</label>
          </div>
          {access === 'read' && space.kind === 'project' && boards && boards.length > 0 && (
            <select value={board} onChange={(e) => setBoard(e.target.value)}>
              <option value="">Everyone in {space.name}</option>
              {boards.map((b) => (
                <option key={b.name} value={b.name}>
                  Whoever may read {b.title || b.name}
                </option>
              ))}
            </select>
          )}
          <div className="field-row">
            <input type="radio" id="repo-write" checked={access === 'write'} onChange={() => setAccess('write')} />
            <label htmlFor="repo-write">Write access for people I pick: push, delete branches, close issues</label>
          </div>
          {access === 'write' && (
            <div className="sunken" style={{ padding: 6 }}>
              {mayWrite.length === 0 && <p className="small">Nobody to pick yet: only people in {space.name} personally can write, not those in through a group or tier. Invite them personally first.</p>}
              {mayWrite.map((m) => (
                <div className="field-row" key={m.did}>
                  <input type="checkbox" id={`writer-${m.did}`} checked={writers.includes(m.did)} onChange={(e) => pick(m.did, e.target.checked)} />
                  <label htmlFor={`writer-${m.did}`}>{m.name ?? shortDid(m.did)}</label>
                </div>
              ))}
            </div>
          )}
          <div className="field-row">
            <input type="radio" id="repo-none" checked={access === 'none'} onChange={() => setAccess('none')} />
            <label htmlFor="repo-none">Link it only: it shows here, nobody gets access through Weave</label>
          </div>
        </div>
        <p className="small">
          The space's <b>GitHub access</b> service gives the access, with its own token (an admin's of the repository): add it under Services if it isn't there. People prove their GitHub account with a gist; leaving takes the access back. People you added on GitHub yourself stay. A person's repository (not an organization's) can't give read-only access.
        </p>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default" disabled={!name || (access === 'write' && writers.length === 0)}>
            {link ? 'Save' : 'Link'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Under a hub's name: the GitHub account they show, opening their profile. */
export function HubGitHubLink({ profile }: { profile: Profile }) {
  const g = profile.github;
  if (!g) return null;
  return (
    <a className="hub-github" href={g.url} target="_blank" rel="noopener noreferrer" title={g.verified ? 'A public gist of this GitHub account names this identity' : "Not checked: GitHub couldn't be reached"}>
      <Icon name="github" /> {g.login}
      {g.verified && ' ✓'}
    </a>
  );
}
