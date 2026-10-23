import { useEffect, useState, useSyncExternalStore } from 'react';
import type { AppOpen, BoardInfo, GitHubInfo, Profile, SpaceInfo, SpaceRepos } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bridge, bump, navigate, onItem, shortDid, useApi } from './lib.ts';
import { copy, spaceHref } from './posts.tsx';
import { ask, attempt, AsyncButton, Modal } from './ui.tsx';

/*
 * GitHub repositories that follow a group, tier or project. Whoever links one
 * signs in to GitHub once (a code entered on github.com, through the Weave
 * GitHub app); members give the space their GitHub account with one click and
 * get read access, and lose it when they leave. Weave only ever takes away
 * access it gave.
 */

/**
 * The honest part about GitHub Apps: whoever owns one can act on every
 * repository it's installed on (with a key Weave never uses). Shown wherever
 * people sign in or install it.
 */
export function AppTrust({ github }: { github?: GitHubInfo }) {
  if (!github) return null;
  const { app } = github;
  return (
    <p className="small app-trust">
      You sign in through the GitHub App{' '}
      <a href={app.url} target="_blank" rel="noopener noreferrer">
        {app.name}
      </a>
      , owned by <b>{app.owner}</b>
      {app.own ? ' (your own choice)' : ''}. A GitHub App's owner can act on every repository it's installed on, so install it only on the repositories you link, or use your own app (Keys &amp; devices → Linked accounts).
    </p>
  );
}

/** Signing in to GitHub: the code to type on github.com, until GitHub says yes. */
export function GitHubConnectDialog({ onClose, onDone }: { onClose(): void; onDone?(login: string): void }) {
  const [info, setInfo] = useState<GitHubInfo>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    let alive = true;
    api<GitHubInfo>('connectGithub').then(
      (g) => alive && setInfo(g),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, []);

  // The person approves on github.com; look every two seconds.
  useEffect(() => {
    if (!info?.pending) return;
    const timer = setInterval(async () => {
      const g = await api<GitHubInfo>('github').catch(() => undefined);
      if (!g) return;
      if (g.error) setError(g.error);
      if (g.login && !g.pending) {
        setInfo(g);
        bump();
        onDone?.(g.login);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [info?.pending?.userCode]);

  const done = info?.login && !info.pending;
  return (
    <Modal title="Connect GitHub" onClose={onClose}>
      {error ? (
        <p>{error}</p>
      ) : done ? (
        <p>
          <Icon name="info" /> Connected as <b>{info.login}</b>.
        </p>
      ) : !info?.pending ? (
        <p className="small">Asking GitHub for a code…</p>
      ) : (
        <div className="github-code">
          <ol className="steps">
            <li>
              Open{' '}
              <a href={info.pending.verificationUri} target="_blank" rel="noopener noreferrer">
                {info.pending.verificationUri.replace('https://', '')}
              </a>
            </li>
            <li>Enter this code and allow Weave:</li>
          </ol>
          <div className="user-code sunken" title="Click to copy" onClick={() => copy(info.pending!.userCode, 'Code copied')}>
            {info.pending.userCode}
          </div>
          <p className="small">The sign-in stays on this computer. With it, Weave manages collaborators and downloads releases only on repositories where the app is installed and you have access yourself.</p>
          <AppTrust github={info} />
        </div>
      )}
      <div className="buttons">
        <button className={done || error ? 'default' : ''} onClick={onClose}>
          {done ? 'Done' : 'Close'}
        </button>
      </div>
    </Modal>
  );
}

/** In Keys & devices: the GitHub account this computer is signed in with. */
export function LinkedAccountsBox() {
  const { data: github } = useApi(() => api<GitHubInfo>('github'), []);
  const { data: me } = useApi(() => api<Profile>('profile'), []);
  const [connecting, setConnecting] = useState(false);
  const [ownApp, setOwnApp] = useState(false);
  return (
    <fieldset>
      <legend>Linked accounts</legend>
      <div className="field-row">
        <Icon name="externalLink" />
        <span className="grow">
          <b>GitHub</b>{' '}
          {github?.login ? (
            <span className="small">
              signed in as{' '}
              <a href={`https://github.com/${github.login}`} target="_blank" rel="noopener noreferrer">
                {github.login}
              </a>
            </span>
          ) : (
            <span className="small muted">{github && !github.available ? "not available in this copy of Weave yet" : 'not connected'}</span>
          )}
        </span>
        {github?.login ? (
          <AsyncButton onClick={async () => (await ask(`Disconnect GitHub? Repositories you linked stop following their spaces until you connect again.`, 'Disconnect')) && attempt(() => api('disconnectGithub').then(bump), 'GitHub disconnected')}>
            Disconnect
          </AsyncButton>
        ) : (
          github?.available && <button onClick={() => setConnecting(true)}>Connect…</button>
        )}
      </div>
      {github && (
        <div className="field-row">
          <span className="grow small">
            Through{' '}
            <a href={github.app.url} target="_blank" rel="noopener noreferrer">
              {github.app.name}
            </a>
            , owned by {github.app.owner}
            {github.app.own ? ' (your own app)' : ''}.
          </span>
          {github.app.own ? (
            <AsyncButton onClick={async () => (await ask('Go back to Weave Connect? You sign in again through it.', 'Go back')) && attempt(() => api('setGithubApp', null).then(bump), 'Back to Weave Connect')}>Use Weave Connect</AsyncButton>
          ) : (
            <button onClick={() => setOwnApp(true)}>Use your own app…</button>
          )}
        </div>
      )}
      {github?.login && me && (
        <div className="field-row">
          <input
            type="checkbox"
            id="github-on-hub"
            checked={!!me.github}
            onChange={(e) => void attempt(() => api('showGithubOnHub', { on: e.target.checked }).then(bump), e.target.checked ? 'Your hub shows your GitHub account' : 'Your hub no longer shows GitHub')}
          />
          <label htmlFor="github-on-hub">Show {github.login} on my hub</label>
          <span className="small muted">(proven by a public gist naming your identity, which Weave creates once)</span>
        </div>
      )}
      <p className="small">With GitHub connected, groups, tiers and projects can give you access to their repositories, and you can link your own.</p>
      {connecting && <GitHubConnectDialog onClose={() => setConnecting(false)} />}
      {ownApp && <OwnAppDialog onClose={() => setOwnApp(false)} />}
    </fieldset>
  );
}

/** Registering your own GitHub App, so nobody else's app touches your repositories. */
function OwnAppDialog({ onClose }: { onClose(): void }) {
  const [link, setLink] = useState('');
  return (
    <Modal title="Use your own GitHub App" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const done = await attempt(() => api<GitHubInfo>('setGithubApp', link).then(bump), 'Your own app is set: connect GitHub through it');
          if (done !== undefined) onClose();
        }}
      >
        <p className="small">Weave Connect's owner could act on every repository it's installed on. With your own app, only you (or your organization) could. Register it once:</p>
        <ol className="steps small">
          <li>
            On GitHub: Settings → Developer settings → GitHub Apps →{' '}
            <a href="https://github.com/settings/apps/new" target="_blank" rel="noopener noreferrer">
              New GitHub App
            </a>{' '}
            (or the same under your organization).
          </li>
          <li>Any name and homepage. Tick “Enable Device Flow”, untick “Expire user authorization tokens”, untick the webhook.</li>
          <li>Repository permissions: Administration read and write, Contents read-only. Account permissions: Gists read and write (only for showing GitHub on your hub).</li>
          <li>Where can it be installed: “Any account”, if people outside your account link repositories with it.</li>
          <li>Don't generate a private key: Weave doesn't need one.</li>
        </ol>
        <div className="field-row-stacked">
          <label htmlFor="own-app">Its public link</label>
          <input id="own-app" required placeholder="https://github.com/apps/…" value={link} onChange={(e) => setLink(e.target.value)} />
        </div>
        <p className="small">Changing apps signs you out of GitHub; connect again through the new one. Members downloading a private release need to sign in through the app installed on that repository.</p>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default">Use this app</button>
        </div>
      </form>
    </Modal>
  );
}

/** Give a space your GitHub account (connecting first if needed). */
function useShare(space: SpaceInfo) {
  const [connecting, setConnecting] = useState(false);
  const share = async () => {
    const g = await api<GitHubInfo>('github');
    if (!g.login) return setConnecting(true);
    await attempt(() => api('shareGithub', { space: space.id, on: true }).then(bump), `${space.name} has your GitHub account: its repositories invite you`);
  };
  const dialog = connecting && (
    <GitHubConnectDialog
      onClose={() => setConnecting(false)}
      onDone={() => {
        setConnecting(false);
        void attempt(() => api('shareGithub', { space: space.id, on: true }).then(bump), `${space.name} has your GitHub account: its repositories invite you`);
      }}
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
  const theirs = data?.repos.filter((r) => !r.mine) ?? [];
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
        follow{theirs.length === 1 ? 's' : ''} this {space.kind}. Give it your GitHub account to get read access.
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
  const [linking, setLinking] = useState<false | { repo?: string }>(false);
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
            <span className="small muted"> · linked by {r.mine ? 'you' : (r.by.name ?? shortDid(r.by.did))}</span>
            {r.mine && r.synced && !r.problem && <span className="small muted"> · in step {ago(r.synced)}</span>}
            {r.problem && <div className="small error-text">{r.problem}</div>}
          </span>
          {(r.mine || data.canLink) && (
            <AsyncButton onClick={async () => (await ask(`Unlink ${r.repo}? Access Weave gave is taken back${r.mine ? '' : ' (by whoever linked it)'}.`, 'Unlink')) && attempt(() => api('linkRepo', { space: space.id, repo: r.repo, on: false }).then(bump), `${r.repo} unlinked`)}>
              Unlink
            </AsyncButton>
          )}
        </div>
      ))}
      {data.repos.length === 0 && <p className="small">No repositories yet.{data.canLink ? ' Link one, and members who give their GitHub account get read access; they lose it when they leave.' : ''}</p>}
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
      {linking && <LinkRepoDialog space={space} initialRepo={linking.repo} onClose={() => setLinking(false)} />}
      {dialog}
    </fieldset>
  );
}

function LinkRepoDialog({ space, initialRepo, onClose }: { space: SpaceInfo; initialRepo?: string; onClose(): void }) {
  const { data: github, reload } = useApi(() => api<GitHubInfo>('github'), []);
  const { data: repos, error, reload: reloadRepos } = useApi(() => (github?.login ? api<string[]>('githubRepos') : Promise.resolve(undefined)), [github?.login]);
  const { data: boards } = useApi(() => (space.kind === 'project' ? api<BoardInfo[]>('boards', space.id) : Promise.resolve([])), [space.id]);
  const [repo, setRepo] = useState(initialRepo ?? '');
  const [board, setBoard] = useState('');
  const [connecting, setConnecting] = useState(false);
  // Coming back from GitHub (after adding a repository to the app): look again.
  useEffect(() => {
    window.addEventListener('focus', reloadRepos);
    return () => window.removeEventListener('focus', reloadRepos);
  }, [reloadRepos]);
  const known = (r: string) => repos?.find((x) => x.toLowerCase() === r.toLowerCase());
  const missing = repo && repos && !known(repo) ? repo : undefined;
  const chosen = (repo && known(repo)) || (missing ? '' : repos?.[0]) || '';

  if (github && !github.login)
    return connecting ? (
      <GitHubConnectDialog onClose={onClose} onDone={() => (setConnecting(false), reload())} />
    ) : (
      <Modal title="Link a repository" onClose={onClose}>
        <p>
          {github.available
            ? 'To link a repository, connect your GitHub account first. Weave uses it to invite and remove people on the repositories you choose.'
            : "This copy of Weave can't reach GitHub yet: it doesn't know the Weave GitHub app. A newer version will."}
        </p>
        <div className="buttons">
          <button onClick={onClose}>Cancel</button>
          <button className="default" onClick={() => setConnecting(true)} disabled={!github.available}>
            Connect GitHub…
          </button>
        </div>
      </Modal>
    );

  return (
    <Modal title="Link a repository" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const done = await attempt(() => api('linkRepo', { space: space.id, repo: chosen, board: board || undefined, on: true }).then(bump), `${chosen} now follows ${space.name}`);
          if (done !== undefined) onClose();
        }}
      >
        {error ? (
          <p>{error}</p>
        ) : !repos ? (
          <p className="small">{github ? 'Asking GitHub which repositories Weave may manage…' : '…'}</p>
        ) : missing ? (
          <div className="install-box">
            <span className="grow">
              <b>{missing}</b> isn't in {github?.app.name ?? 'the app'} yet.{' '}
              <a href={github?.installUrl} target="_blank" rel="noopener noreferrer">
                Add it on GitHub
              </a>
              : choose <b>Only select repositories</b>, tick it, save, and come back. Weave looks again then.
            </span>
            <button type="button" onClick={reloadRepos}>
              Look again
            </button>
          </div>
        ) : repos.length === 0 ? (
          <p>
            Weave can't manage any of your repositories yet.{' '}
            <a href={github?.installUrl} target="_blank" rel="noopener noreferrer">
              Install {github?.app.name ?? 'the app'} on GitHub
            </a>
            : choose <b>Only select repositories</b> and pick the ones you want to share, then come back.
          </p>
        ) : (
          <>
            <div className="field-row-stacked">
              <label>Repository</label>
              <select value={chosen} onChange={(e) => setRepo(e.target.value)}>
                {repos.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
              <span className="small muted">
                Missing one?{' '}
                <a href={github?.installUrl} target="_blank" rel="noopener noreferrer">
                  Add it to {github?.app.name ?? 'the app'}
                </a>{' '}
                (Only select repositories, then tick it).
              </span>
            </div>
            {space.kind === 'project' && boards && boards.length > 0 && (
              <div className="field-row-stacked">
                <label>Who gets access</label>
                <select value={board} onChange={(e) => setBoard(e.target.value)}>
                  <option value="">Everyone in {space.name}</option>
                  {boards.map((b) => (
                    <option key={b.name} value={b.name}>
                      Whoever may read {b.title || b.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <p className="small">Members who give their GitHub account get read access and an invitation from GitHub. When they leave, Weave takes it back. People you added on GitHub yourself stay.</p>
            <AppTrust github={github} />
          </>
        )}
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default" disabled={!chosen}>
            Link
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
