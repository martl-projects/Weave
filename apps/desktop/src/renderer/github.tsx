import { useEffect, useState } from 'react';
import type { BoardInfo, GitHubInfo, HubGitHub, Profile, SpaceInfo, SpaceRepos } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bump, shortDid, useApi } from './lib.ts';
import { copy } from './posts.tsx';
import { ask, attempt, AsyncButton, Modal } from './ui.tsx';

/*
 * GitHub repositories that follow a group, tier or project. Whoever links one
 * signs in to GitHub once (a code entered on github.com, through the Weave
 * GitHub app); members give the space their GitHub account with one click and
 * get read access, and lose it when they leave. Weave only ever takes away
 * access it gave.
 */

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
          <p className="small">
            Weave can then add and remove collaborators on the repositories you install its GitHub app on, nothing else. The sign-in stays on this computer.
          </p>
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
  const [connecting, setConnecting] = useState(false);
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
      <p className="small">With GitHub connected, groups, tiers and projects can give you access to their repositories, and you can link your own.</p>
      {connecting && <GitHubConnectDialog onClose={() => setConnecting(false)} />}
    </fieldset>
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
      </span>
      <AsyncButton className="default" onClick={share}>
        Give my GitHub account
      </AsyncButton>
      {dialog}
    </div>
  );
}

/** In a space's settings: its repositories, linking more (owner, maintainers), and your account. */
export function RepoSettings({ space }: { space: SpaceInfo }) {
  const { data } = useApi(() => api<SpaceRepos>('spaceRepos', space.id), [space.id]);
  const [linking, setLinking] = useState(false);
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
          <span className="grow small">{data.shared ? <>You gave it your GitHub account <b>{data.shared}</b>.</> : "You haven't given it your GitHub account."}</span>
          {data.shared ? (
            <AsyncButton onClick={() => attempt(() => api('shareGithub', { space: space.id, on: false }).then(bump), 'Your GitHub account was taken back')}>Take it back</AsyncButton>
          ) : (
            <AsyncButton onClick={share}>Give my GitHub account</AsyncButton>
          )}
        </div>
      )}
      {data.canLink && (
        <div className="buttons">
          <button onClick={() => setLinking(true)}>Link a repository…</button>
        </div>
      )}
      {linking && <LinkRepoDialog space={space} onClose={() => setLinking(false)} />}
      {dialog}
    </fieldset>
  );
}

function LinkRepoDialog({ space, onClose }: { space: SpaceInfo; onClose(): void }) {
  const { data: github, reload } = useApi(() => api<GitHubInfo>('github'), []);
  const { data: repos, error } = useApi(() => (github?.login ? api<string[]>('githubRepos') : Promise.resolve(undefined)), [github?.login]);
  const { data: boards } = useApi(() => (space.kind === 'project' ? api<BoardInfo[]>('boards', space.id) : Promise.resolve([])), [space.id]);
  const [repo, setRepo] = useState('');
  const [board, setBoard] = useState('');
  const [connecting, setConnecting] = useState(false);
  const chosen = repo || repos?.[0] || '';

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
        ) : repos.length === 0 ? (
          <p>
            Weave can't manage any of your repositories yet.{' '}
            <a href={github?.installUrl} target="_blank" rel="noopener noreferrer">
              Install the Weave app on GitHub
            </a>{' '}
            for the repositories you want to share, then come back.
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
                  Install the Weave app on it
                </a>
                .
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
          </>
        )}
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default" disabled={!repos?.length}>
            Link
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** On a hub: the GitHub account someone shows, proven by a gist naming their did; on your own, choosing it. */
export function HubGitHubBox({ profile }: { profile: Profile }) {
  const [editing, setEditing] = useState(false);
  const g = profile.github;
  if (!g && !profile.me) return null;
  return (
    <section className="space-box">
      <h3>GitHub</h3>
      {g ? (
        <>
          <p>
            <a href={g.url} target="_blank" rel="noopener noreferrer">
              {g.login}
            </a>{' '}
            {g.verified ? <span className="tag friend" title="A public gist of this account names this identity">✓ proven</span> : <span className="small muted">(not checked: GitHub unreachable)</span>}
          </p>
          {g.repos.length > 0 && (
            <ul className="hub-repos">
              {g.repos.map((r) => (
                <li key={r}>
                  <a href={`https://github.com/${r}`} target="_blank" rel="noopener noreferrer">
                    {r}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="small">Show your GitHub account and the repositories you want people to see. Weave proves the account is yours with a public gist naming your identity.</p>
      )}
      {profile.me && (
        <div className="buttons">
          {g && <AsyncButton onClick={() => attempt(() => api('showGithubOnHub', { on: false }).then(bump), 'Your hub no longer shows GitHub')}>Hide</AsyncButton>}
          <button onClick={() => setEditing(true)}>{g ? 'Choose repositories…' : 'Show GitHub…'}</button>
        </div>
      )}
      {editing && <HubGitHubDialog current={g} onClose={() => setEditing(false)} />}
    </section>
  );
}

function HubGitHubDialog({ current, onClose }: { current?: HubGitHub; onClose(): void }) {
  const { data: github, reload } = useApi(() => api<GitHubInfo>('github'), []);
  const { data: repos, error } = useApi(() => (github?.login ? api<string[]>('githubPublicRepos') : Promise.resolve(undefined)), [github?.login]);
  const [chosen, setChosen] = useState<string[]>(current?.repos ?? []);
  const [connecting, setConnecting] = useState(false);

  if (github && !github.login)
    return connecting ? (
      <GitHubConnectDialog onClose={onClose} onDone={() => (setConnecting(false), reload())} />
    ) : (
      <Modal title="Show GitHub on your hub" onClose={onClose}>
        <p>{github.available ? 'Connect your GitHub account first.' : "This copy of Weave can't reach GitHub yet."}</p>
        <div className="buttons">
          <button onClick={onClose}>Cancel</button>
          <button className="default" onClick={() => setConnecting(true)} disabled={!github.available}>
            Connect GitHub…
          </button>
        </div>
      </Modal>
    );

  const toggle = (r: string) => setChosen(chosen.includes(r) ? chosen.filter((x) => x !== r) : [...chosen, r].slice(0, 12));
  return (
    <Modal title="Show GitHub on your hub" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const done = await attempt(() => api('showGithubOnHub', { on: true, repos: chosen }).then(bump), 'Your hub shows GitHub');
          if (done !== undefined) onClose();
        }}
      >
        {error ? (
          <p>{error}</p>
        ) : !repos ? (
          <p className="small">…</p>
        ) : (
          <>
            <p className="small">
              Your hub shows <b>{github?.login}</b>{current ? '' : ', proven by a public gist Weave creates in your account (it names your identity)'}. Pick up to 12 public repositories:
            </p>
            <div className="hub-repo-picker sunken">
              {repos.length === 0 && <p className="small">No public repositories.</p>}
              {repos.map((r) => (
                <div className="field-row" key={r}>
                  <input type="checkbox" id={`repo-${r}`} checked={chosen.includes(r)} onChange={() => toggle(r)} />
                  <label htmlFor={`repo-${r}`}>{r}</label>
                </div>
              ))}
            </div>
          </>
        )}
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default" disabled={!repos}>
            Show on my hub
          </button>
        </div>
      </form>
    </Modal>
  );
}
