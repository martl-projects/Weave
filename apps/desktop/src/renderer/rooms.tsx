import { useEffect, useState, type FormEvent } from 'react';
import type { AppLaunchInfo, AppManifest, MemberInfo, ProjectInfo, RoomChatMessage, RoomInfo, SpaceInfo, ShowInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bridge, bump, clock, shortDid, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Avatar, Modal, toast } from './ui.tsx';
import { ShowsSection } from './shows.tsx';
import { Page } from './views.tsx';
import { copy } from './posts.tsx';

/*
 * Rooms: a host shares the project's app from their computer, players use it
 * through an encrypted tunnel. The ▶ button opens it in its own window; nobody
 * sees an address. Who is in a room and what they say there is never stored.
 */

const play = (room: RoomInfo) => {
  if (!room.url) return;
  // On a phone the address is the computer's own: the phone app reaches it through the computer.
  if (bridge.phone) return void bridge.phone.openRoom(room.id, room.url).catch((error: Error) => toast(error.message, 'error'));
  void bridge.openApp(room.url, `${room.app?.name ?? 'App'} · ${room.name}`);
};

function RoomChat({ room }: { room: RoomInfo }) {
  const { data: messages } = useApi(() => api<RoomChatMessage[]>('roomChat', room.id), [room.id]);
  const [text, setText] = useState('');
  return (
    <div className="room-chat">
      <div className="room-messages sunken">
        {(messages ?? []).map((m) => (
          <div key={m.id} className="room-message">
            <time>{clock(m.time)}</time> <b>{m.mine ? 'You' : (m.by.name ?? shortDid(m.by.did))}</b> {m.text}
          </div>
        ))}
        {messages?.length === 0 && <div className="small muted">Room chat: not stored, gone when the room ends.</div>}
      </div>
      <form
        className="room-say"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const message = text.trim();
          if (!message) return;
          setText('');
          if ((await attempt(() => api('sayInRoom', { room: room.id, text: message }).then(() => true))) === undefined) setText(message);
          bump();
        }}
      >
        <input value={text} placeholder="Say something…" onChange={(e) => setText(e.target.value)} disabled={!room.connected} aria-label="Room chat" />
        <button disabled={!room.connected}>Send</button>
      </form>
    </div>
  );
}

function RoomCard({ room }: { room: RoomInfo }) {
  const label = room.service?.label ?? (room.mine ? 'Open' : 'Play');
  let main;
  if (room.mine)
    main = room.service?.ready ? (
      <button className="default play" onClick={() => play(room)}>
        ▶ {label}
      </button>
    ) : (
      <span className="waiting">
        <button disabled>{room.app?.canLaunch ? 'Start the app above first' : 'Start the app first'}</button>
        {!room.app?.canLaunch && room.app?.startHint && <span className="small"> {room.app.startHint}</span>}{' '}
        <button onClick={bump}>Check again</button>
      </span>
    );
  else if (!room.joined)
    main = room.mayJoin ? (
      <AsyncButton className="default" onClick={() => attempt(() => api('joinRoom', room.id).then(bump))}>
        Join
      </AsyncButton>
    ) : (
      <span className="small muted">You're not invited to this room.</span>
    );
  else
    main = room.url ? (
      <button className="default play" onClick={() => play(room)}>
        ▶ {label}
      </button>
    ) : (
      <button disabled>
        {room.connected ? `Waiting for ${room.host.name ?? 'the host'} to start ${room.app?.name ?? 'the app'}…` : `Waiting for ${room.host.name ?? 'the host'}…`}
      </button>
    );
  return (
    <article className="room window">
      <div className="title-bar">
        <div className="title-bar-text">
          {room.name} · {room.app?.name}
        </div>
      </div>
      <div className="window-body">
        <div className="room-head">
          <span className="live-dot" /> {room.mine ? 'You host this room' : `Hosted by ${room.host.name ?? shortDid(room.host.did)}`}
          {room.joined && (
            <span className="room-peers">
              {room.peers.map((p) => (
                <span key={p.did} className="tag" title={p.did}>
                  <Avatar did={p.did} size={12} /> {p.name ?? shortDid(p.did)}
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="room-actions">
          {main}
          <span className="grow" />
          {room.mine ? (
            <AsyncButton onClick={async () => (await ask(`End "${room.name}"? Everyone in it is disconnected.`, 'End room')) && attempt(() => api('endRoom', room.id).then(bump), 'Room ended')}>End room</AsyncButton>
          ) : (
            room.joined && <AsyncButton onClick={() => attempt(() => api('leaveRoom', room.id).then(bump))}>Leave</AsyncButton>
          )}
        </div>
        {!room.mine && !room.joined && room.mayJoin && <p className="small muted">Joining connects you directly to {room.host.name ?? 'the host'}'s computer.</p>}
        {room.joined && <RoomChat room={room} />}
      </div>
    </article>
  );
}

/** Asking before Weave runs a program: the exact command and where. */
function ApproveLaunch({ app, launch, onApprove, onClose }: { app: AppManifest; launch: AppLaunchInfo; onApprove(): void; onClose(): void }) {
  return (
    <Modal title={`Start ${app.name}?`} onClose={onClose}>
      <div className="approve-launch">
        <Icon name="warning" size={32} />
        {launch.container?.active ? (
          <div>
            <p>
              Weave will run {app.name} in a container, from the image the project released ({launch.container.image}:{launch.container.tag}):
            </p>
            <pre className="launch-command">{launch.command!.join(' ')}</pre>
            <p className="small">
              It's sealed off from your computer: it gets only its own ports (on this computer, for the room), the settings you filled in, and none of your files. Weave asks again when a new release
              brings another image.
            </p>
          </div>
        ) : (
          <div>
            <p>Weave will run this program on your computer, as you:</p>
            <pre className="launch-command">{launch.command!.join(' ')}</pre>
            <p className="small">
              in <code>{launch.folder}</code>
            </p>
            <p className="small">It comes from the project's app manifest. Only run it if you trust the people who maintain {app.name}. Weave asks again whenever the command or the folder changes.</p>
          </div>
        )}
      </div>
      <div className="buttons">
        <button onClick={onClose}>Cancel</button>
        <button className="default" onClick={onApprove}>
          Run it
        </button>
      </div>
    </Modal>
  );
}

const mb = (bytes?: number) => (bytes ? `${bytes < 1e6 ? (bytes / 1e6).toFixed(1) : Math.round(bytes / 1e6)} MB` : '');

/** Installing (or updating) the app from its release: what comes from where, and what then runs. */
function InstallDialog({ app, launch, onInstall, onClose }: { app: AppManifest; launch: AppLaunchInfo; onInstall(): void; onClose(): void }) {
  const i = launch.install!;
  return (
    <Modal title={`${i.installed ? 'Update' : 'Install'} ${app.name} ${i.version ?? ''}`} onClose={onClose}>
      <table className="install-facts">
        <tbody>
          <tr>
            <th>From</th>
            <td>
              github.com/{i.repo}, release {i.version}
            </td>
          </tr>
          <tr>
            <th>File</th>
            <td>
              {i.asset!.file} {i.asset!.size ? `(${mb(i.asset!.size)})` : ''}
            </td>
          </tr>
          <tr>
            <th>Checked</th>
            <td>it must match the fingerprint the project's maintainers published in Weave, or it isn't installed</td>
          </tr>
          <tr>
            <th>Into</th>
            <td>Weave's apps folder, its own folder for {app.name}</td>
          </tr>
          {(i.command ?? launch.command) && (
            <tr>
              <th>Then starts with</th>
              <td>
                <code>{(i.command ?? launch.command)!.join(' ')}</code>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="small">
        Installing only downloads and unpacks; nothing runs until you start {app.name}. Only install it if you trust the people who maintain it.
        {i.command ?? launch.command ? ' Installing also approves its start command.' : ''}
      </p>
      <div className="buttons">
        <button onClick={onClose}>Cancel</button>
        <button className="default" onClick={onInstall}>
          {i.installed ? 'Update' : 'Install'}
        </button>
      </div>
    </Modal>
  );
}

/** What to paste into an agent harness, so the agent installs the app by hand. */
const agentPrompt = (project: SpaceInfo, app: AppManifest, launch: AppLaunchInfo) =>
  [
    `Please install ${app.name}${launch.install?.version ? ` ${launch.install.version}` : ''} on this computer, for the Weave project "${project.name}".`,
    launch.install?.repo ? `It lives in the GitHub repository ${launch.install.repo}.` : '',
    'The project gives these steps:',
    ...(launch.install?.steps ?? []).map((step, n) => `${n + 1}. ${step}`),
    `When it works, tell Weave where it is: weave app folder <that folder> -p "${project.name}" (the folder needs the app's weave.app.json).`,
    'Ask me before running anything that changes more than that folder.',
  ]
    .filter(Boolean)
    .join('\n');

type Release = { tag: string; name: string; published?: string; files: number; prerelease: boolean };

/** Maintainers: point the app at one of its repository's GitHub releases (Weave reads weave.app.json at that tag and fingerprints the files). */
function ReleasePicker({ project, app, onClose }: { project: SpaceInfo; app: AppManifest; onClose(): void }) {
  const { data, error } = useApi(() => api<{ repo: string; releases: Release[]; releaseWorkflow?: boolean }>('appReleases', project.id), [project.id]);
  const [busy, setBusy] = useState<string>();
  const use = async (tag: string) => {
    setBusy(tag);
    const done = await attempt(() => api<AppManifest>('releaseApp', { project: project.id, tag }).then(bump), `${app.name} ${tag} is ready to install from Live`);
    setBusy(undefined);
    if (done !== undefined) onClose();
  };
  return (
    <Modal title={`Use a GitHub release · ${app.name}`} onClose={onClose}>
      {error ? (
        <p>{error}</p>
      ) : !data ? (
        <p className="small">Asking GitHub for releases…</p>
      ) : data.releases.length === 0 ? (
        <p>
          <b>{data.repo}</b> has no releases yet.{' '}
          {data.releaseWorkflow === false ? (
            <>
              It has no workflow that makes releases from tags either, so a pushed tag alone won't do: add Weave's release workflow (<code>weave app workflow</code>, or ask your agent), or create
              a release on GitHub and attach the builds.
            </>
          ) : (
            <>Push a version tag (like v0.1.0): its release workflow builds the release in a few minutes. Then come back here.</>
          )}
        </p>
      ) : (
        <>
          <p className="small">
            Releases of <b>{data.repo}</b>. Weave reads <code>weave.app.json</code> at the tag you pick and fingerprints each file once; then everyone in {project.name} can install it here.
          </p>
          <table className="release-list">
            <tbody>
              {data.releases.map((r) => (
                <tr key={r.tag}>
                  <td>
                    <b>{r.name}</b> {r.name !== r.tag && <span className="small muted">{r.tag}</span>} {r.prerelease && <span className="tag">pre-release</span>}
                    <div className="small muted">
                      {r.published ? ago(r.published) : ''} · {r.files} file{r.files === 1 ? '' : 's'}
                    </div>
                  </td>
                  <td>
                    <button className="default" disabled={!!busy || r.files === 0} title={r.files === 0 ? 'No files to install: GitHub\'s source archives don\'t count' : undefined} onClick={() => use(r.tag)}>
                      {busy === r.tag ? 'Fingerprinting…' : 'Use this'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div className="buttons">
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

/** Before any release: say so, and let maintainers pick one from GitHub. */
function NoReleaseBox({ project, app, launch }: { project: SpaceInfo; app: AppManifest; launch: AppLaunchInfo }) {
  const [picking, setPicking] = useState(false);
  const r = launch.release;
  if (launch.install?.version || !r) return null;
  return (
    <div className="install-box">
      <span className="grow small">
        {r.canRelease ? (
          r.repo ? (
            <>
              No release of {app.name} for people to install yet. Push a version tag to <b>{r.repo}</b> (its release workflow builds one), then pick it here.
            </>
          ) : (
            <>No release of {app.name} yet: link its GitHub repository in the project's settings, and people can install releases with one click.</>
          )
        ) : (
          <>There's no ready-made download of {app.name} yet{launch.folder ? '' : '; if you have a copy, choose its folder'}.</>
        )}
      </span>
      {r.canRelease && r.repo && <button onClick={() => setPicking(true)}>Use a GitHub release…</button>}
      {picking && <ReleasePicker project={project} app={app} onClose={() => setPicking(false)} />}
    </div>
  );
}

/** Getting the app: install or update from its release, or have an agent do it by hand. */
function InstallBox({ project, app, launch, onPick }: { project: SpaceInfo; app: AppManifest; launch: AppLaunchInfo; onPick(): void }) {
  const [confirming, setConfirming] = useState(false);
  const [picking, setPicking] = useState(false);
  const i = launch.install;
  // While installing, look every second.
  useEffect(() => {
    if (!i?.progress) return;
    const timer = setInterval(bump, 1000);
    return () => clearInterval(timer);
  }, [!!i?.progress]);
  if (!i) return null;
  const install = () => {
    setConfirming(false);
    void attempt(() => api('installApp', { project: project.id, approve: true }).then(bump));
  };
  const agent = i.steps && (
    <button onClick={() => copy(agentPrompt(project, app, launch), 'Copied: paste it to your agent')} title="Copies instructions for your agent harness">
      Copy steps for my agent
    </button>
  );
  if (i.progress)
    return (
      <div className="install-box">
        <span className="grow">
          {i.progress.state === 'downloading' ? `Downloading ${app.name} ${i.version}… ${mb(i.progress.done)}${i.progress.total ? ` of ${mb(i.progress.total)}` : ''}` : `Unpacking ${app.name} ${i.version}…`}
          {i.progress.total ? <progress max={i.progress.total} value={i.progress.done} /> : null}
        </span>
      </div>
    );
  const outdated = i.installed && i.version && i.installed !== i.version;
  const other = launch.release?.canRelease && launch.release.repo && (
    <a
      href="#"
      className="small"
      onClick={(e) => {
        e.preventDefault();
        setPicking(true);
      }}
    >
      Use another release…
    </a>
  );
  return (
    <>
      {picking && <ReleasePicker project={project} app={app} onClose={() => setPicking(false)} />}
      {i.error && <div className="small error-text">The last install didn't work: {i.error}</div>}
      {i.otherApp && (
        <div className="small">
          {app.name}'s releases download through the GitHub App{' '}
          <a href={`https://github.com/apps/${i.otherApp}`} target="_blank" rel="noopener noreferrer">
            {i.otherApp}
          </a>
          . If the repository is private, sign in through that app (Keys &amp; devices → Linked accounts → Use your own app).
        </div>
      )}
      {i.asset && (!i.installed || outdated) ? (
        <div className="install-box">
          <span className="grow">
            {outdated ? (
              <>
                <b>
                  {app.name} {i.version}
                </b>{' '}
                is out; you have {i.installed}.
              </>
            ) : (
              <>
                Get{' '}
                <b>
                  {app.name} {i.version}
                </b>{' '}
                from GitHub ({mb(i.asset.size)}){launch.folder ? ', or keep using your own copy' : ''}.
              </>
            )}
          </span>
          {agent}
          <button className="default" onClick={() => setConfirming(true)}>
            {outdated ? 'Update…' : 'Install…'}
          </button>
        </div>
      ) : i.installed && other ? (
        <div className="install-box">
          <span className="grow small">
            {app.name} {i.installed}, installed by Weave.
          </span>
          {other}
        </div>
      ) : !i.asset && !launch.folder ? (
        <div className="install-box">
          <span className="grow">
            {i.version ? `There's no ready-made ${app.name} ${i.version} for this computer (${i.platform}).` : `${app.name} has no ready-made download.`}
            {i.steps ? ' Your agent can install it by hand.' : ''}
          </span>
          {agent}
          <button onClick={onPick}>Choose folder…</button>
        </div>
      ) : null}
      {confirming && <InstallDialog app={app} launch={launch} onInstall={install} onClose={() => setConfirming(false)} />}
    </>
  );
}

/** One setting the app asks hosts for (an API key…): typed here, kept on this computer, never shown again when secret. */
function SettingRow({ project, setting }: { project: SpaceInfo; setting: NonNullable<AppLaunchInfo['settings']>[number] }) {
  const [editing, setEditing] = useState(!setting.set);
  const [value, setValue] = useState('');
  useEffect(() => setEditing(!setting.set), [setting.set]);
  const save = (next: string | null) =>
    attempt(() => api('setAppSetting', { project: project.id, name: setting.name, value: next }).then(() => (setValue(''), bump())), next ? `${setting.label} saved on this computer` : `${setting.label} removed`);
  return (
    <div className="app-setting">
      <label htmlFor={`setting-${setting.name}`}>
        {setting.label}
        {setting.optional ? <span className="muted"> (optional)</span> : null}
      </label>
      {editing ? (
        <form
          className="field-row"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            if (value.trim()) void save(value);
          }}
        >
          <input id={`setting-${setting.name}`} className="grow" type={setting.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={value} placeholder={setting.name} onChange={(e) => setValue(e.target.value)} />
          <button type="submit" disabled={!value.trim()}>
            Save
          </button>
          {setting.set && (
            <button type="button" onClick={() => (setValue(''), setEditing(false))}>
              Cancel
            </button>
          )}
        </form>
      ) : (
        <div className="field-row">
          <span className="grow">✓ Saved on this computer</span>
          <button onClick={() => setEditing(true)}>Change…</button>
          <AsyncButton onClick={() => save(null)}>Remove</AsyncButton>
        </div>
      )}
      {setting.hint && <div className="small muted">{setting.hint}</div>}
    </div>
  );
}

/** Settings the app asks for. Values stay on this computer and go to this app alone when Weave starts it. */
function AppSettings({ project, app, launch }: { project: SpaceInfo; app: AppManifest; launch: AppLaunchInfo }) {
  if (!launch.settings?.length) return null;
  return (
    <div className="app-settings">
      <div className="small">
        {app.name} asks for {launch.settings.length === 1 ? 'a setting' : 'settings'}. Whatever you type stays on this computer: Weave hands it to {app.name} when it starts it here, and to nobody else (not the project, the room or your agents).
      </div>
      {launch.settings.map((s) => (
        <SettingRow key={s.name} project={project} setting={s} />
      ))}
    </div>
  );
}

/** The app on this computer: where it is, start and stop, and what it printed. */
function AppPanel({ project, app }: { project: SpaceInfo; app: AppManifest }) {
  const { data: launch } = useApi(() => api<AppLaunchInfo>('appLaunch', project.id), [project.id]);
  const [asking, setAsking] = useState(false);
  const [showLog, setShowLog] = useState(false);
  if (!launch) return null;
  const pick = async () => {
    const folder = await bridge.pickFolder(`Where is ${app.name} on this computer? (the folder with its weave.app.json)`);
    if (folder) await attempt(() => api('setAppFolder', { project: project.id, folder }).then(bump), 'Folder saved');
  };
  const start = (approve = false) => attempt(() => api('launchApp', { project: project.id, approve }).then(bump), `${app.name} is starting`);
  const missing = (launch.settings ?? []).filter((s) => !s.optional && !s.set);
  if (!launch.command && !launch.install)
    return launch.hint ? (
      <p className="small">
        To host, start {app.name} yourself: {launch.hint}
      </p>
    ) : null;
  return (
    <fieldset className="app-panel">
      <legend>{app.name} on this computer</legend>
      <NoReleaseBox project={project} app={app} launch={launch} />
      <InstallBox project={project} app={app} launch={launch} onPick={pick} />
      <AppSettings project={project} app={app} launch={launch} />
      {!launch.command ? (
        launch.hint && <p className="small">To host, start {app.name} yourself: {launch.hint}</p>
      ) : launch.install?.progress ? null : !launch.folder && !launch.container?.active ? (
        launch.install?.asset ? null : (
        <div className="field-row">
          <span className="grow small">To host a room, Weave can start {app.name} for you. Where is it on this computer?</span>
          <button onClick={pick}>Choose folder…</button>
        </div>
        )
      ) : (
        <>
          <div className="field-row">
            <span className={`status-dot ${launch.running ? 'on' : ''}`} />
            <span className="grow">
              {launch.running ? `Running since ${clock(launch.started!)}` : launch.exit ? (launch.exit.stopped ? 'Stopped' : `Exited by itself${launch.exit.code ? ` (code ${launch.exit.code})` : ''}`) : 'Not running'}
            </span>
            {launch.running ? (
              <AsyncButton onClick={() => attempt(() => api('stopApp', project.id).then(bump), 'Stopped')}>Stop app</AsyncButton>
            ) : (
              <button
                className="default"
                disabled={missing.length > 0}
                title={missing.length ? `Fill in ${missing.map((m) => m.label).join(', ')} first` : undefined}
                onClick={() => (launch.approved ? void start() : setAsking(true))}
              >
                ▶ Start {app.name}
              </button>
            )}
            {launch.log.length > 0 && <button onClick={() => setShowLog(!showLog)}>{showLog ? 'Hide output' : 'Output'}</button>}
          </div>
          {launch.container?.active ? (
            <div className="small muted">
              In a container: {launch.container.image}:{launch.container.tag}, sealed off from this computer (Docker)
            </div>
          ) : (
            <div className="small muted">
              {launch.command.join(' ')} · in {launch.install?.installed ? `${app.name} ${launch.install.installed}, installed by Weave` : launch.folder}{' '}
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  void pick();
                }}
              >
                change
              </a>
            </div>
          )}
          {launch.container && !launch.container.docker && (
            <div className="small muted">{app.name} also comes as a container image: with Docker running on this computer, Weave runs it sealed off from your files.</div>
          )}
          {showLog && <pre className="app-log sunken">{launch.log.slice(-60).join('\n')}</pre>}
        </>
      )}
      {asking && (
        <ApproveLaunch
          app={app}
          launch={launch}
          onClose={() => setAsking(false)}
          onApprove={() => {
            setAsking(false);
            void start(true);
          }}
        />
      )}
    </fieldset>
  );
}

function HostDialog({ project, members, meDid, app, groups, onClose }: { project: SpaceInfo; members: MemberInfo[]; meDid: string; app: AppManifest; groups: ProjectInfo['groups']; onClose(): void }) {
  const [name, setName] = useState('');
  const [who, setWho] = useState<'everyone' | 'people' | 'paid'>('everyone');
  const everyone = who === 'everyone';
  const [picked, setPicked] = useState<string[]>([]);
  const { data: shows } = useApi(() => api<ShowInfo[]>('shows', project.id), [project.id]);
  const mine = (shows ?? []).filter((s) => s.mine && !s.cancelled && Date.parse(s.ends) > Date.now());
  const [show, setShow] = useState('');
  const [tiers, setTiers] = useState<string[]>([]);
  return (
    <Modal title={`Host a room · ${app.name}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const access = who === 'people' ? { invite: picked } : who === 'paid' ? { ...(show ? { show } : {}), ...(tiers.length ? { groups: tiers } : {}) } : {};
          const room = await attempt(() => api<RoomInfo>('hostRoom', { project: project.id, name, ...access }), 'Room is open');
          if (room) {
            bump();
            onClose();
          }
        }}
      >
        <div className="field-row-stacked">
          <label htmlFor="room-name">Name</label>
          <input id="room-name" autoFocus maxLength={60} placeholder="Saturday show" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <p className="small">
          Shares <b>{app.name}</b> from this computer (port {app.services[0].port}). Only that port; nothing else on your computer.
        </p>
        <fieldset>
          <legend>Who may join</legend>
          <div className="field-row">
            <input id="who-all" type="radio" checked={everyone} onChange={() => setWho('everyone')} />
            <label htmlFor="who-all">Everyone in p/{project.name}</label>
          </div>
          <div className="field-row">
            <input id="who-some" type="radio" checked={who === 'people'} onChange={() => setWho('people')} />
            <label htmlFor="who-some">Only…</label>
          </div>
          {who === 'people' &&
            members
              .filter((m) => m.did !== meDid)
              .map((m) => (
                <div className="field-row indent" key={m.did}>
                  <input id={`who-${m.did}`} type="checkbox" checked={picked.includes(m.did)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.did] : p.filter((x) => x !== m.did)))} />
                  <label htmlFor={`who-${m.did}`}>{m.name ?? shortDid(m.did)}</label>
                </div>
              ))}
          {(mine.length > 0 || groups.length > 0) && (
            <div className="field-row">
              <input id="who-paid" type="radio" checked={who === 'paid'} onChange={() => setWho('paid')} />
              <label htmlFor="who-paid">Ticket holders, or members of tiers</label>
            </div>
          )}
          {who === 'paid' && (
            <>
              {mine.length > 0 && (
                <div className="field-row indent">
                  <label htmlFor="who-show">Show</label>
                  <select id="who-show" value={show} onChange={(e) => setShow(e.target.value)}>
                    <option value="">none</option>
                    {mine.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <span className="small">its ticket holders, while it's on</span>
                </div>
              )}
              {groups.map((g) => (
                <div className="field-row indent" key={g.id}>
                  <input id={`who-tier-${g.id}`} type="checkbox" checked={tiers.includes(g.id)} onChange={(e) => setTiers((t) => (e.target.checked ? [...t, g.id] : t.filter((x) => x !== g.id)))} />
                  <label htmlFor={`who-tier-${g.id}`}>members of {g.name}</label>
                </div>
              ))}
            </>
          )}
        </fieldset>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default" disabled={(who === 'people' && picked.length === 0) || (who === 'paid' && !show && tiers.length === 0)}>
            Open room
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PublishApp({ project }: { project: SpaceInfo }) {
  const [text, setText] = useState('');
  return (
    <fieldset>
      <legend>Publish the project's app</legend>
      <p className="small">
        Paste the app's <code>weave.app.json</code>: the ports a room may share and what host and players open. (Or: <code>weave app publish -p "{project.name}"</code> in the app's folder.)
      </p>
      <textarea className="wide code" rows={8} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder={'{\n  "app": "my-app",\n  "name": "My App",\n  "services": [{ "id": "web", "port": 3000, "open": { "host": { "path": "/", "label": "Open" }, "joiner": { "path": "/", "label": "Play" } } }]\n}'} />
      <div className="buttons">
        <AsyncButton
          className="default"
          onClick={() =>
            attempt(async () => {
              let manifest: unknown;
              try {
                manifest = JSON.parse(text);
              } catch {
                throw new Error("that isn't valid JSON");
              }
              await api('publishApp', { project: project.id, manifest });
              bump();
            }, 'App published')
          }
        >
          Publish
        </AsyncButton>
      </div>
    </fieldset>
  );
}

export function RoomsView({ project, members, meDid }: { project: SpaceInfo; members: MemberInfo[]; meDid: string }) {
  const { data: rooms } = useApi(() => api<RoomInfo[]>('rooms', project.id), [project.id]);
  const { data: app } = useApi(() => api<AppManifest | null>('projectApp', project.id), [project.id]);
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const [hosting, setHosting] = useState(false);
  return (
    <Page
      title={<><Icon name="zap" /> Live · p/{project.name}</>}
      actions={
        app && (
          <button onClick={() => setHosting(true)}>
            <Icon name="plus" /> Host room…
          </button>
        )
      }
    >
      {app === null && (info?.maintainer ? <PublishApp project={project} /> : <p className="empty">This project has no app to share yet; its maintainers can publish one.</p>)}
      {app && (
        <p className="small">
          <b>{app.name}</b> runs on the host's computer; players use it through an encrypted tunnel. Who's in a room and what's said there is never stored.
        </p>
      )}
      {app && <AppPanel project={project} app={app} />}
      <ShowsSection project={project} maintainer={!!info?.maintainer} />
      {(rooms ?? []).map((room) => (
        <RoomCard key={room.id} room={room} />
      ))}
      {app && rooms?.length === 0 && <p className="empty">No open rooms. Host one to share {app.name}.</p>}
      {hosting && app && <HostDialog project={project} members={members} meDid={meDid} app={app} groups={info?.groups ?? []} onClose={() => setHosting(false)} />}
    </Page>
  );
}
