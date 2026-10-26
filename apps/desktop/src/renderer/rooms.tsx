import { useEffect, useState, type FormEvent } from 'react';
import type { AppManifest, ArtifactInfo, MemberInfo, ProjectInfo, RoomChatMessage, RoomInfo, ServiceInfo, SpaceInfo, ShowInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bridge, bump, clock, shortDid, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Avatar, Modal, toast } from './ui.tsx';
import { ShowsSection } from './shows.tsx';
import { Page } from './views.tsx';

/*
 * Rooms: a service's web page. Someone in the project starts an artifact (a project's release) as a service on
 * their computer; players use it through an encrypted tunnel. The ▶ button opens it in its own window; nobody sees
 * an address. Who is in a room and what they say there is never stored.
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

function RoomCard({ room, shows, project }: { room: RoomInfo; shows: ShowInfo[]; project: SpaceInfo }) {
  const show = room.show ? shows.find((s) => s.id === room.show) : undefined;
  const who = [...(room.show ? [`ticket holders of ${show?.name ?? 'a show'}`] : []), ...(room.groups ?? []).map((g) => `members of ${g.name ?? 'a tier'}`)];
  const label = room.service?.label ?? (room.mine ? 'Open' : 'Play');
  // A room a service offers: "board, offered by martl · board". Ending it here takes the service out of this project.
  const offered = room.offeredBy ? `${room.host.name ?? shortDid(room.host.did)} · ${room.offeredBy.name ?? 'a service'}` : undefined;
  let main;
  if (room.mine && offered)
    main = room.service?.ready ? (
      <button className="default play" onClick={() => play(room)}>
        ▶ {label}
      </button>
    ) : (
      <span className="waiting">
        <button disabled>Waiting for the service to answer…</button> <button onClick={bump}>Check again</button>
      </span>
    );
  else if (room.mine)
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
      <span className="small muted">{who.length ? `For ${who.join(' or ')}${show && !show.open ? ', while the show is on' : ''}.` : "You're not invited to this room."}</span>
    );
  else
    main = room.url ? (
      <button className="default play" onClick={() => play(room)}>
        ▶ {label}
      </button>
    ) : (
      <button disabled>
        {offered ? (room.connected ? `Waiting for ${offered}…` : `Connecting to ${offered}…`) : room.connected ? `Waiting for ${room.host.name ?? 'the host'} to start ${room.app?.name ?? 'the app'}…` : `Waiting for ${room.host.name ?? 'the host'}…`}
      </button>
    );
  return (
    <article className="room window">
      <div className="title-bar">
        <div className="title-bar-text">
          {room.name}
          {room.app?.name ? ` · ${room.app.name}` : ''}
        </div>
      </div>
      <div className="window-body">
        <div className="room-head">
          <span className="live-dot" /> {offered ? `Offered by ${offered}${room.mine ? ', running here' : ''}` : room.mine ? 'You host this room' : `Hosted by ${room.host.name ?? shortDid(room.host.did)}`}
          {who.length > 0 && <span className="tag">🎟 {who.join(' · ')}</span>}
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
          {offered && room.mine ? (
            <AsyncButton
              onClick={async () => {
                const services = await api<ServiceInfo[]>('services');
                const service = services.find((s) => s.did === room.offeredBy!.did);
                if (!service) return toast(`${offered} runs on another of your devices: end it there`, 'error');
                const others = service.spaces.filter((s) => s.id !== project.id);
                const asked = await ask(
                  `End "${room.name}"? Everyone in it is disconnected, and ${service.name} leaves p/${project.name}${others.length ? ` (it keeps running in ${others.map((s) => s.name).join(', ')})` : ''}.`,
                  'End room',
                );
                if (asked) await attempt(() => api('setService', { name: service.name, spaces: others.map((s) => s.id) }).then(bump), 'Room ended');
              }}
            >
              End room
            </AsyncButton>
          ) : room.mine ? (
            <AsyncButton onClick={async () => (await ask(`End "${room.name}"? Everyone in it is disconnected.`, 'End room')) && attempt(() => api('endRoom', room.id).then(bump), 'Room ended')}>End room</AsyncButton>
          ) : (
            room.joined && <AsyncButton onClick={() => attempt(() => api('leaveRoom', room.id).then(bump))}>Leave</AsyncButton>
          )}
        </div>
        {!room.mine && !room.joined && room.mayJoin && <p className="small muted">Joining connects you directly to {offered ? `${offered}, on the node it runs on` : `${room.host.name ?? 'the host'}'s computer`}.</p>}
        {room.joined && <RoomChat room={room} />}
      </div>
    </article>
  );
}

type Release = { tag: string; name: string; published?: string; files: number; prerelease: boolean };

/** Maintainers: release one of the repository's GitHub releases as an artifact (Weave reads weave.app.json at that tag and fingerprints the files). */
function ReleasePicker({ project, app, onClose }: { project: SpaceInfo; app: AppManifest; onClose(): void }) {
  const { data, error } = useApi(() => api<{ repo: string; releases: Release[]; releaseWorkflow?: boolean }>('appReleases', project.id), [project.id]);
  const [busy, setBusy] = useState<string>();
  const use = async (tag: string) => {
    setBusy(tag);
    const done = await attempt(() => api<AppManifest>('releaseApp', { project: project.id, tag }).then(() => (bump(), true)), `${app.name} ${tag} is released: anyone in ${project.name} can start it`);
    setBusy(undefined);
    if (done !== undefined) onClose();
  };
  return (
    <Modal title={`Release from GitHub · ${app.name}`} onClose={onClose}>
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
            Releases of <b>{data.repo}</b>. Weave reads <code>weave.app.json</code> at the tag you pick and fingerprints each file once; then everyone in {project.name} can start it as a service.
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
                    <button className="default" disabled={!!busy || r.files === 0} title={r.files === 0 ? "No files to run: GitHub's source archives don't count" : undefined} onClick={() => use(r.tag)}>
                      {busy === r.tag ? 'Fingerprinting…' : 'Release this'}
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

function PublishApp({ project }: { project: SpaceInfo }) {
  const [text, setText] = useState('');
  return (
    <fieldset>
      <legend>Describe the project's artifact</legend>
      <p className="small">
        Paste its <code>weave.app.json</code>: what it's called, its web page's port, how it starts and the settings it asks for. Then release it from a GitHub release. (Or:{' '}
        <code>weave app publish -p "{project.name}"</code> in its folder.)
      </p>
      <textarea className="wide code" rows={8} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder={'{\n  "app": "my-app",\n  "name": "My App",\n  "services": [{ "id": "web", "port": 3000 }]\n}'} />
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
            }, 'Published: now release it')
          }
        >
          Publish
        </AsyncButton>
      </div>
    </fieldset>
  );
}

/** Maintainers: the project's artifacts (its releases), and releasing the next one. */
function ProjectArtifacts({ project, app, artifacts }: { project: SpaceInfo; app: AppManifest | null | undefined; artifacts: ArtifactInfo[] }) {
  const [picking, setPicking] = useState(false);
  const [describing, setDescribing] = useState(false);
  if (app === undefined) return null;
  if (app === null)
    return describing ? (
      <PublishApp project={project} />
    ) : (
      <p className="small muted">
        p/{project.name} has no artifact of its own; rooms here can run other projects' artifacts.{' '}
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setDescribing(true);
          }}
        >
          Describe one…
        </a>
      </p>
    );
  return (
    <fieldset>
      <legend>{project.name}'s artifacts</legend>
      {artifacts.length ? (
        <p className="small">
          {artifacts
            .slice(0, 5)
            .map((a) => `${a.name} ${a.tag} (${ago(a.time)})`)
            .join(' · ')}
        </p>
      ) : (
        <p className="small">Nothing released yet: release {app.name} from one of its repository's GitHub releases, and everyone in {project.name} can start it.</p>
      )}
      <div className="buttons">
        <button onClick={() => setPicking(true)}>Release from GitHub…</button>
      </div>
      {picking && <ReleasePicker project={project} app={app} onClose={() => setPicking(false)} />}
    </fieldset>
  );
}

/** Artifacts of every project you're in, this one's first. */
function useArtifacts(project: SpaceInfo): ArtifactInfo[] | undefined {
  const { data } = useApi(async () => {
    const projects = await api<SpaceInfo[]>('spaces', 'project');
    const ordered = [project, ...projects.filter((p) => p.id !== project.id)];
    const lists = await Promise.all(ordered.map((p) => api<ArtifactInfo[]>('artifacts', p.id).catch(() => [] as ArtifactInfo[])));
    return lists.flat();
  }, [project.id]);
  return data;
}

/** One setting typed in the start dialog. */
function SettingInput({ setting, value, onChange }: { setting: ArtifactInfo['settings'][number]; value: string; onChange(value: string): void }) {
  return (
    <div className="app-setting">
      <label htmlFor={`setting-${setting.name}`}>
        {setting.label}
        {setting.optional ? <span className="muted"> (optional)</span> : null}
        {setting.space ? <span className="muted"> · for this project only</span> : null}
      </label>
      <input id={`setting-${setting.name}`} className="wide" type={setting.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={value} placeholder={setting.name} onChange={(e) => onChange(e.target.value)} />
      {setting.hint && <div className="small muted">{setting.hint}</div>}
    </div>
  );
}

/**
 * Starting an artifact as a room service: pick a release (this project's or one from another project you're in),
 * see what runs, fill in its settings, approve. It runs here as your service; its web page is the room. If you
 * already run that artifact, it's added to this project instead.
 */
function StartDialog({ project, onClose }: { project: SpaceInfo; onClose(): void }) {
  const artifacts = useArtifacts(project);
  const { data: services } = useApi(() => api<ServiceInfo[]>('services'), []);
  const [picked, setPicked] = useState<string>();
  const [name, setName] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const chosen = artifacts?.find((a) => a.id === picked) ?? artifacts?.find((a) => a.runs);
  useEffect(() => {
    if (chosen) setName(chosen.app);
    setValues({});
  }, [chosen?.id]);
  if (!artifacts) return null;
  // The same artifact, already running as one of your services on this computer.
  const running = chosen && services?.find((s) => !s.node && s.artifact?.project.id === chosen.project.id && s.artifact.app === chosen.app);
  const missing = chosen?.settings.filter((s) => !s.optional && !values[s.name]?.trim()) ?? [];
  const start = async () => {
    if (!chosen) return;
    const once = Object.fromEntries((chosen.settings ?? []).filter((s) => !s.space && values[s.name]?.trim()).map((s) => [s.name, values[s.name].trim()]));
    const here = Object.fromEntries((chosen.settings ?? []).filter((s) => s.space && values[s.name]?.trim()).map((s) => [s.name, values[s.name].trim()]));
    setBusy(true);
    const done = await attempt(async () => {
      const service = await api<ServiceInfo>('addService', { name, artifact: { project: chosen.project.id, tag: chosen.tag }, spaces: [project.id], approve: true, settings: once });
      if (Object.keys(here).length) await api('setService', { name: service.name, spaceSettings: { [project.id]: here } });
      bump();
      return true;
    }, `${chosen.name} is starting: its room opens here once it answers`);
    setBusy(false);
    if (done) onClose();
  };
  const addHere = async () => {
    if (!running) return;
    const done = await attempt(() => api('setService', { name: running.name, spaces: [...running.spaces.map((s) => s.id), project.id] }).then(() => (bump(), true)), `${running.name} is in ${project.name} now`);
    if (done) onClose();
  };
  return (
    <Modal title={`Start here · p/${project.name}`} onClose={onClose} wide>
      {artifacts.length === 0 ? (
        <p>No project you're in has released anything to start yet. A project's maintainers release its artifacts here in Live.</p>
      ) : (
        <div className="form">
          <fieldset>
            <legend>What to start</legend>
            {artifacts.map((a) => (
              <div className="field-row" key={a.id}>
                <input id={`artifact-${a.id}`} type="radio" disabled={!a.runs} checked={chosen?.id === a.id} onChange={() => setPicked(a.id)} />
                <label htmlFor={`artifact-${a.id}`}>
                  <span>
                    <b>{a.name}</b> {a.tag}{' '}
                    <span className="muted small">
                      · p/{a.project.name} · released {ago(a.time)} by {a.released.name ?? shortDid(a.released.did)}
                      {!a.runs && ' · nothing for this computer'}
                      {a.runs && !a.room && ' · no web page (no room)'}
                    </span>
                  </span>
                </label>
              </div>
            ))}
          </fieldset>
          {chosen && running ? (
            <>
              <p>
                You already run <b>{running.name}</b> ({chosen.name} {running.artifact?.tag}) in {running.spaces.map((s) => s.name).join(', ') || 'no space yet'}. Add it to p/{project.name}: one service, the same key,
                a room here too.
              </p>
              <p className="small muted">It can then read what's addressed to it here, as it does in its other spaces, and so carry things between them: add it only where you'd trust it with that.</p>
              <div className="buttons">
                <button onClick={onClose}>Cancel</button>
                <AsyncButton className="default" onClick={addHere}>
                  Add it here
                </AsyncButton>
              </div>
            </>
          ) : chosen ? (
            <>
              <div className="field-row-stacked">
                <label htmlFor="service-name">Its name</label>
                <input id="service-name" maxLength={40} value={name} onChange={(e) => setName(e.target.value.toLowerCase())} />
                <span className="small muted">What it signs shows as "you · {name || chosen.app}".</span>
              </div>
              {chosen.settings.map((s) => (
                <SettingInput key={s.name} setting={s} value={values[s.name] ?? ''} onChange={(v) => setValues((x) => ({ ...x, [s.name]: v }))} />
              ))}
              <div className="approve-launch">
                <Icon name="warning" size={32} />
                <div>
                  <p>
                    {chosen.runs === 'container' ? `Weave will run ${chosen.name} in a container, sealed off from your files:` : `Weave will fetch ${chosen.name} ${chosen.tag}, check it against the fingerprints p/${chosen.project.name} published, and run it on this computer, as you:`}
                  </p>
                  {chosen.command && <pre className="launch-command">{chosen.command.join(' ')}</pre>}
                  <p className="small">
                    It runs under a key of its own and sees only what's addressed to it in p/{project.name}.{chosen.room ? ' Its web page is the room: everyone in the project can join it.' : ''} Only run it if you trust the people who maintain p/
                    {chosen.project.name}. A newer release waits until you approve it.
                  </p>
                </div>
              </div>
              <div className="buttons">
                <button onClick={onClose}>Cancel</button>
                <button className="default" disabled={!name || missing.length > 0 || busy} title={missing.length ? `Fill in ${missing.map((m) => m.label).join(', ')} first` : undefined} onClick={() => void start()}>
                  {busy ? 'Starting…' : 'Run it here'}
                </button>
              </div>
            </>
          ) : (
            <p className="small">None of these has a release for this computer.</p>
          )}
        </div>
      )}
    </Modal>
  );
}

/** Your services in this project that have no open room here yet: fetching, waiting for a setting, or failed. */
function ServicesStarting({ project, rooms }: { project: SpaceInfo; rooms: RoomInfo[] }) {
  const { data: services } = useApi(() => api<ServiceInfo[]>('services'), []);
  const here = (services ?? []).filter((s) => !s.node && s.artifact && s.enabled && s.contract.room && s.spaces.some((x) => x.id === project.id) && !rooms.some((r) => r.open && r.offeredBy?.did === s.did));
  const fetching = here.some((s) => s.artifact?.progress);
  // While a release is fetched, look every second.
  useEffect(() => {
    if (!fetching) return;
    const timer = setInterval(bump, 1000);
    return () => clearInterval(timer);
  }, [fetching]);
  return (
    <>
      {here.map((s) => {
        const a = s.artifact!;
        return (
          <fieldset key={s.did}>
            <legend>
              {s.name} · {a.name} {a.tag}
            </legend>
            <p className="small">
              {a.progress ? (
                <>
                  {a.progress.state === 'downloading' ? `fetching ${a.tag}…` : 'unpacking…'}
                  {a.progress.total ? <progress max={a.progress.total} value={a.progress.done} /> : null}
                </>
              ) : a.error ? (
                <span className="error-text">{a.error}</span>
              ) : s.running ? (
                'running, its room opens in a moment'
              ) : (
                'starting…'
              )}
            </p>
            <div className="buttons">
              <AsyncButton
                onClick={() => attempt(() => api('setService', { name: s.name, spaces: s.spaces.filter((x) => x.id !== project.id).map((x) => x.id) }).then(bump), `${s.name} left p/${project.name}`)}
              >
                Remove from p/{project.name}
              </AsyncButton>
              {a.error && <AsyncButton onClick={() => attempt(() => api('setService', { name: s.name }).then(bump))}>Try again</AsyncButton>}
            </div>
          </fieldset>
        );
      })}
    </>
  );
}

export function RoomsView({ project, members }: { project: SpaceInfo; members: MemberInfo[]; meDid: string }) {
  const { data: rooms } = useApi(() => api<RoomInfo[]>('rooms', project.id), [project.id]);
  const { data: app } = useApi(() => api<AppManifest | null>('projectApp', project.id), [project.id]);
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: shows } = useApi(() => api<ShowInfo[]>('shows', project.id), [project.id]);
  const { data: artifacts } = useApi(() => api<ArtifactInfo[]>('artifacts', project.id), [project.id]);
  const [starting, setStarting] = useState(false);
  return (
    <Page
      title={<><Icon name="zap" /> Live · p/{project.name}</>}
      actions={
        <button onClick={() => setStarting(true)}>
          <Icon name="plus" /> Start here…
        </button>
      }
    >
      <p className="small">
        A room is a service's web page: started by someone in the project, from an artifact (this project's, or another's), on their computer. Players reach it through an encrypted tunnel. Who's in a room and what's said there is never stored.
      </p>
      {(rooms ?? []).map((room) => (
        <RoomCard key={room.id} room={room} shows={shows ?? []} project={project} />
      ))}
      <ServicesStarting project={project} rooms={rooms ?? []} />
      {rooms?.length === 0 && <p className="empty">No open rooms. Start one here.</p>}
      {info?.maintainer && <ProjectArtifacts project={project} app={app} artifacts={artifacts ?? []} />}
      <ShowsSection rooms={rooms ?? []} shows={shows ?? []} members={members} />
      {starting && <StartDialog project={project} onClose={() => setStarting(false)} />}
    </Page>
  );
}
