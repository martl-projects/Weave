import { useEffect, useState, type FormEvent } from 'react';
import type { AppManifest, ArtifactInfo, HostedWebsiteInfo, MemberInfo, ProjectInfo, WebsiteChatMessage, WebsiteInfo, ServiceInfo, ServiceProfileInfo, SpaceInfo, ShowInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bridge, bump, clock, shortDid, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Avatar, Modal, toast } from './ui.tsx';
import { ShowsSection, useShowForm } from './shows.tsx';
import { usePayments } from './treasury.tsx';
import { Page } from './views.tsx';
import { contractText, OriginText, ServiceCard } from './services.tsx';

/*
 * A project's services, and the websites the website service serves: someone in the project opens a website, answered by a
 * handler on their computer (a project's release, a program, or something already running); players use it
 * through an encrypted tunnel. The ▶ button opens it in its own window; nobody sees an address. Who is in a room
 * and what they say there is never stored.
 */

const play = (room: WebsiteInfo) => {
  if (!room.url) return;
  // On a phone the address is the computer's own: the phone app reaches it through the computer.
  if (bridge.phone) return void bridge.phone.openRoom(room.id, room.url).catch((error: Error) => toast(error.message, 'error'));
  void bridge.openApp(room.url, room.name);
};

function WebsiteChat({ room }: { room: WebsiteInfo }) {
  const { data: messages } = useApi(() => api<WebsiteChatMessage[]>('websiteChat', room.id), [room.id]);
  const [text, setText] = useState('');
  return (
    <div className="room-chat">
      <div className="room-messages sunken">
        {(messages ?? []).map((m) => (
          <div key={m.id} className="room-message">
            <time>{clock(m.time)}</time> <b>{m.mine ? 'You' : (m.by.name ?? shortDid(m.by.did))}</b> {m.text}
          </div>
        ))}
        {messages?.length === 0 && <div className="small muted">Chat next to the website: not stored, gone when it closes.</div>}
      </div>
      <form
        className="room-say"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const message = text.trim();
          if (!message) return;
          setText('');
          if ((await attempt(() => api('sayOnWebsite', { room: room.id, text: message }).then(() => true))) === undefined) setText(message);
          bump();
        }}
      >
        <input value={text} placeholder="Say something…" onChange={(e) => setText(e.target.value)} disabled={!room.connected} aria-label="Website chat" />
        <button disabled={!room.connected}>Send</button>
      </form>
    </div>
  );
}

function WebsiteCard({ room, shows }: { room: WebsiteInfo; shows: ShowInfo[] }) {
  const show = room.show ? shows.find((s) => s.id === room.show) : undefined;
  const who = [...(room.show ? [`ticket holders of ${show?.name ?? 'a show'}`] : []), ...(room.groups ?? []).map((g) => `members of ${g.name ?? 'a tier'}`)];
  const label = room.service?.label ?? (room.mine ? 'Open' : 'Play');
  // "Race, offered by martl · website".
  const offered = `${room.host.name ?? shortDid(room.host.did)} · ${room.offeredBy?.name ?? 'a service'}`;
  let main;
  if (room.mine)
    main = room.service?.ready ? (
      <button className="default play" onClick={() => play(room)}>
        ▶ {label}
      </button>
    ) : (
      <span className="waiting">
        <button disabled>Waiting for what answers it…</button> <button onClick={bump}>Check again</button>
      </span>
    );
  else if (!room.joined)
    main = room.mayJoin ? (
      <AsyncButton className="default" onClick={() => attempt(() => api('visitWebsite', room.id).then(bump))}>
        Visit
      </AsyncButton>
    ) : (
      <span className="small muted">{who.length ? `For ${who.join(' or ')}${show && !show.open ? ', while the show is on' : ''}.` : "You're not invited to this website."}</span>
    );
  else
    main = room.url ? (
      <button className="default play" onClick={() => play(room)}>
        ▶ {label}
      </button>
    ) : (
      <button disabled>
        {room.connected ? `Waiting for ${offered}…` : `Connecting to ${offered}…`}
      </button>
    );
  return (
    <article className="room window">
      <div className="title-bar">
        <div className="title-bar-text">{room.name}</div>
      </div>
      <div className="window-body">
        <div className="room-head">
          <span className="live-dot" /> Offered by {offered}
          {room.mine ? ', running here' : ''}
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
          {room.mine ? (
            <AsyncButton onClick={async () => (await ask(`Close "${room.name}"? Everyone on it is disconnected, and what answers it stops.`, 'Close website')) && attempt(() => api('closeWebsite', room.id).then(bump), 'Website closed')}>Close website</AsyncButton>
          ) : (
            room.joined && <AsyncButton onClick={() => attempt(() => api('leaveWebsite', room.id).then(bump))}>Leave</AsyncButton>
          )}
        </div>
        {!room.mine && !room.joined && room.mayJoin && <p className="small muted">Visiting connects you directly to {offered}, on the device it runs on.</p>}
        {room.joined && <WebsiteChat room={room} />}
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
        p/{project.name} has no artifact of its own; websites here can run other projects' artifacts.{' '}
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

      </label>
      <input id={`setting-${setting.name}`} className="wide" type={setting.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={value} placeholder={setting.name} onChange={(e) => onChange(e.target.value)} />
      {setting.hint && <div className="small muted">{setting.hint}</div>}
    </div>
  );
}

/**
 * Opening a website of your website service for a program you run yourself: its name and the port it listens on.
 * The website service starts nothing; services with a web page show up on their own.
 */
function OpenWebsiteDialog({ project, service, away, members, meDid, groups, shows, onClose }: { project: SpaceInfo; service: string; away?: string; members: MemberInfo[]; meDid: string; groups: ProjectInfo['groups']; shows: ShowInfo[]; onClose(): void }) {
  // Who may visit: every participant, picked people, a show's ticket holders (a show of yours, or a new one), tier members.
  const [who, setWho] = useState<'everyone' | 'people' | 'tickets' | 'tiers'>('everyone');
  const [people, setPeople] = useState<string[]>([]);
  const myShows = shows.filter((s) => s.mine && !s.cancelled && Date.parse(s.ends) > Date.now());
  const [show, setShow] = useState(myShows[0]?.id ?? 'new');
  const [tiers, setTiers] = useState<string[]>([]);
  const payments = usePayments(project);
  const newShow = useShowForm(project);
  const [name, setName] = useState('');
  const [port, setPort] = useState('');
  const [busy, setBusy] = useState(false);
  const ready = !!name.trim() && !!Number(port) && !(who === 'people' && !people.length) && !(who === 'tiers' && !tiers.length);
  const open = async () => {
    setBusy(true);
    // A new show is set up first; if the website then fails, it's picked, not set up twice.
    const made = who === 'tickets' && show === 'new' ? await newShow.create(name.trim()) : show;
    if (made === undefined) return setBusy(false);
    if (made !== show) {
      setShow(made);
      // Selling tickets turns the project's payments on: its treasury and split show in Settings.
      if (!payments.on) payments.turn(true);
    }
    const access = who === 'people' ? { invite: people } : who === 'tickets' ? { show: made, ...(tiers.length ? { groups: tiers } : {}) } : who === 'tiers' ? { groups: tiers } : {};
    const room = await attempt(() => api<WebsiteInfo>('openWebsite', { service, project: project.id, name: name.trim(), port: Number(port), ...access }), away ? `"${name.trim()}" goes to ${away}: it opens once the node has it` : `"${name.trim()}" is open: visitors reach port ${port}`);
    setBusy(false);
    if (room) {
      bump();
      onClose();
    }
  };
  return (
    <Modal title={`Open a website · p/${project.name}`} onClose={onClose} wide>
      <div className="form">
        <div className="field-row-stacked">
          <label htmlFor="room-name">Name</label>
          <input id="room-name" autoFocus maxLength={60} placeholder="Saturday race" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-row-stacked">
          <label htmlFor="room-port">Port of a program running {away ? `on ${away}` : 'on this computer'}</label>
          <input id="room-port" inputMode="numeric" placeholder="3000" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} />
          <p className="small muted">
            Weave starts nothing: the website's visitors reach that port, and nothing else on {away ?? 'your computer'}. An app a project released runs as a service instead (Add a service): it shows up here
            by itself.
          </p>
        </div>
        <fieldset>
          <legend>Who may visit</legend>
          {(
            [
              ['everyone', `Everyone in p/${project.name}`],
              ['people', 'Only…'],
              ['tickets', 'Ticket holders of a show'],
              ...(groups.length ? [['tiers', 'Members of tiers']] : []),
            ] as Array<[typeof who, string]>
          ).map(([value, label]) => (
            <div key={value}>
              <div className="field-row">
                <input id={`who-${value}`} type="radio" checked={who === value} onChange={() => setWho(value)} />
                <label htmlFor={`who-${value}`}>{label}</label>
              </div>
              {who === 'people' &&
                value === 'people' &&
                members
                  .filter((m) => m.did !== meDid)
                  .map((m) => (
                    <div className="field-row indent" key={m.did}>
                      <input id={`who-${m.did}`} type="checkbox" checked={people.includes(m.did)} onChange={(e) => setPeople((p) => (e.target.checked ? [...p, m.did] : p.filter((x) => x !== m.did)))} />
                      <label htmlFor={`who-${m.did}`}>{m.name ?? shortDid(m.did)}</label>
                    </div>
                  ))}
              {who === 'tickets' && value === 'tickets' && (
                <>
                  <div className="field-row indent">
                    <label htmlFor="who-show">Show</label>
                    <select id="who-show" value={show} onChange={(e) => setShow(e.target.value)}>
                      {myShows.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                      <option value="new">A new show…</option>
                    </select>
                  </div>
                  {show === 'new' && <div className="indent">{newShow.fields}</div>}
                </>
              )}
              {((who === 'tickets' && value === 'tickets') || (who === 'tiers' && value === 'tiers')) &&
                groups.map((g) => (
                  <div className="field-row indent" key={g.id}>
                    <input id={`who-tier-${g.id}`} type="checkbox" checked={tiers.includes(g.id)} onChange={(e) => setTiers((t) => (e.target.checked ? [...t, g.id] : t.filter((x) => x !== g.id)))} />
                    <label htmlFor={`who-tier-${g.id}`}>
                      {who === 'tickets' ? 'also ' : ''}members of {g.name}
                    </label>
                  </div>
                ))}
            </div>
          ))}
        </fieldset>
        <div className="buttons">
          <button onClick={onClose}>Cancel</button>
          <button className="default" disabled={!ready || busy} onClick={() => void open()}>
            {busy ? 'Opening…' : 'Open website'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** How a website of your website service is doing, where it isn't answering yet. */
function HostedStatus({ hosted }: { hosted?: HostedWebsiteInfo }) {
  useEffect(() => {
    if (!hosted?.progress) return;
    const timer = setInterval(bump, 1000);
    return () => clearInterval(timer);
  }, [!!hosted?.progress]);
  if (!hosted || (!hosted.progress && !hosted.error)) return null;
  return (
    <p className="small">
      {hosted.progress ? (
        <>
          {hosted.progress.state === 'downloading' ? 'Fetching its release…' : 'Unpacking…'} {hosted.progress.total ? <progress max={hosted.progress.total} value={hosted.progress.done} /> : null}
        </>
      ) : (
        <span className="error-text">{hosted.error}</span>
      )}
    </p>
  );
}

/** What a service is there for, in a project. */
const purpose = (s: ServiceProfileInfo): string => (s.builtin === 'website' ? "A way to join in with the project's participants" : s.builtin === 'github' ? "Hands the project's release files to its participants" : s.description || `A service: it ${contractText(s.contract)}`);

/** One service in the project: what it's for, and what it offers here (a website service: its websites). */
function ServiceSection({ project, service, rooms, shows, mine, meDid, members, groups }: { project: SpaceInfo; service: ServiceProfileInfo; rooms: WebsiteInfo[]; shows: ShowInfo[]; mine?: ServiceInfo; meDid: string; members: MemberInfo[]; groups: ProjectInfo['groups'] }) {
  const [opening, setOpening] = useState(false);
  const [asking, setAsking] = useState(false);
  const own = service.person.did === meDid;
  const by = service.person.name ?? shortDid(service.person.did);
  const its = rooms.filter((r) => r.offeredBy?.did === service.did);
  return (
    <fieldset className="project-service">
      <legend>
        <Icon name={service.builtin === 'website' ? 'zap' : 'gear'} /> {service.name} <span className="muted small">· {by}</span>
      </legend>
      <p className="small">{purpose(service)}</p>
      <OriginText origin={service.origin} />
      {its.map((room) => (
        <div key={room.id}>
          <WebsiteCard room={room} shows={shows} />
          <HostedStatus hosted={mine?.websites?.find((r) => r.id === room.id)} />
        </div>
      ))}
      {service.builtin === 'website' && !its.length && <p className="small muted">No open websites{own ? '' : ` from ${by}`}.</p>}
      <div className="buttons">
        {service.builtin === 'website' && own && mine && <button onClick={() => setOpening(true)}>Open a website…</button>}
        {service.builtin === 'website' && own && !mine && <span className="small muted">It runs on another of your devices: open websites there.</span>}
        {service.builtin !== 'website' && service.contract.reads !== 'nothing' && <button onClick={() => setAsking(true)}>Ask {service.name}…</button>}
        {own && mine && (
          <AsyncButton
            onClick={async () =>
              (await ask(`Take ${service.name} out of p/${project.name}?${its.length ? ' Its websites here close.' : ''}`, 'Take it out')) &&
              attempt(() => api('setService', { name: mine.name, spaces: mine.spaces.filter((s) => s.id !== project.id).map((s) => s.id) }).then(bump), `${service.name} left p/${project.name}`)
            }
          >
            Take out of p/{project.name}
          </AsyncButton>
        )}
      </div>
      {opening && mine && <OpenWebsiteDialog project={project} service={mine.name} away={mine.node?.name} members={members} meDid={meDid} groups={groups} shows={shows} onClose={() => setOpening(false)} />}
      {asking && <ServiceCard space={project} service={service} onClose={() => setAsking(false)} />}
    </fieldset>
  );
}

/**
 * Installing a project's release as a service in this project: what it runs is shown and approved here, once per
 * release. One with a web page serves it as a website here (by the website service); one with a contract does what it says.
 */
function InstallRelease({ project, onDone }: { project: SpaceInfo; onDone(): void }) {
  const artifacts = useArtifacts(project);
  const [picked, setPicked] = useState<string>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const usable = (artifacts ?? []).filter((a) => a.runs && (a.website || a.applet));
  const chosen = usable.find((a) => a.id === picked);
  useEffect(() => setValues({}), [chosen?.id]);
  const missing = chosen?.settings.filter((s) => !s.optional && !values[s.name]?.trim()) ?? [];
  if (!artifacts) return <p className="small">Looking for releases…</p>;
  if (!usable.length) return <p className="small muted">No project you're in has released anything that runs on this computer yet.</p>;
  const install = async () => {
    setBusy(true);
    const settings = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
    await attempt(
      () => api<ServiceInfo>('addService', { artifact: { project: chosen!.project.id, tag: chosen!.tag }, spaces: [project.id], settings, approve: true }).then(() => (bump(), onDone())),
      `${chosen!.name} runs as a service in p/${project.name}${chosen!.website ? ': its website opens once it runs' : ''}`,
    );
    setBusy(false);
  };
  return (
    <fieldset>
      <legend>Install a project's release</legend>
      {usable.map((a) => (
        <div className="field-row" key={a.id}>
          <input id={`artifact-${a.id}`} type="radio" checked={chosen?.id === a.id} onChange={() => setPicked(a.id)} />
          <label htmlFor={`artifact-${a.id}`}>
            <span>
              <b>{a.name}</b> {a.tag}{' '}
              <span className="muted small">
                · p/{a.project.name} · {a.packaged ? 'a Weave service' : a.website ? 'a website' : 'a service'} · released {ago(a.time)} by {a.released.name ?? shortDid(a.released.did)}
              </span>
            </span>
          </label>
        </div>
      ))}
      {chosen && (
        <>
          {chosen.settings.map((s) => <SettingInput key={s.name} setting={s} value={values[s.name] ?? ''} onChange={(v) => setValues((x) => ({ ...x, [s.name]: v }))} />)}
          <div className="approve-launch">
            <Icon name="warning" size={32} />
            <div>
              <p>
                {chosen.packaged
                  ? `Weave will run ${chosen.name} ${chosen.tag} in its sandbox: a container that can't change its own files or reach yours, with limits on memory and CPU, and a folder of its own for what it keeps:`
                  : chosen.runs === 'container'
                  ? `Weave will run ${chosen.name} ${chosen.tag} in a container, sealed off from your files:`
                  : `Weave will fetch ${chosen.name} ${chosen.tag}, check it against the fingerprints p/${chosen.project.name} published, and run it on this computer, as you:`}
              </p>
              <pre className="launch-command">{(chosen.command ?? []).join(' ')}</pre>
              <p className="small">
                Only run it if you trust the people who maintain p/{chosen.project.name}. It gets a key of its own that {chosen.applet ? contractText(chosen.applet) : 'signs nothing but its profile'}. Weave asks again for another release.
              </p>
            </div>
          </div>
          <div className="buttons">
            <button className="default" disabled={missing.length > 0 || busy} title={missing.length ? `Fill in ${missing.map((m) => m.label).join(', ')} first` : undefined} onClick={() => void install()}>
              {busy ? 'Installing…' : 'Run it as a service'}
            </button>
          </div>
        </>
      )}
    </fieldset>
  );
}

/** Adding a service to the project: the website service Weave ships (yours, or a new one), another of your services, or a project's release. */
function AddProjectService({ project, services, onClose }: { project: SpaceInfo; services: ServiceInfo[]; onClose(): void }) {
  const away = services.filter((s) => !s.node && !s.spaces.some((x) => x.id === project.id));
  const rooms = services.filter((s) => s.builtin === 'website');
  const add = (s: ServiceInfo) => attempt(() => api('setService', { name: s.name, spaces: [...s.spaces.map((x) => x.id), project.id] }).then(() => (bump(), onClose())), `${s.name} is in p/${project.name}`);
  return (
    <Modal title={`Add a service · p/${project.name}`} onClose={onClose}>
      <div className="form">
        {!rooms.length && (
          <div className="install-box">
            <span className="grow">
              <b>Websites</b>
              <br />
              <span className="small">A way to join in with the project's participants: services with a web page show up here as websites, and so can programs of yours.</span>
            </span>
            <AsyncButton className="default" onClick={() => attempt(() => api('addService', { builtin: 'website', spaces: [project.id] }).then(() => (bump(), onClose())), `Websites are on in p/${project.name}`)}>
              Add
            </AsyncButton>
          </div>
        )}
        {!services.some((s) => s.builtin === 'github') && (
          <div className="install-box">
            <span className="grow">
              <b>Releases from GitHub</b>
              <br />
              <span className="small">Hands the project's release files to its participants, with your GitHub sign-in: they can install releases of a private repository without access to it. Each file is checked against what its maintainer released.</span>
            </span>
            <AsyncButton onClick={() => attempt(() => api('addService', { builtin: 'github', spaces: [project.id] }).then(() => (bump(), onClose())), `p/${project.name} gets its releases through you`)}>Add</AsyncButton>
          </div>
        )}
        {away.map((s) => (
          <div className="install-box" key={s.name}>
            <span className="grow">
              <b>{s.name}</b>
              <br />
              <span className="small">{s.builtin === 'website' ? "A way to join in with the project's participants" : s.description || `It ${contractText(s.contract)}`}</span>
            </span>
            <AsyncButton onClick={() => add(s)}>Add</AsyncButton>
          </div>
        ))}
        {rooms.length > 0 && !away.length && <p className="small">Your services are all in p/{project.name} already.</p>}
        <InstallRelease project={project} onDone={onClose} />
        <p className="small muted">
          A service you add reads what's addressed to it here, as in its other spaces, and so could carry things between them: add it only where you'd trust it with that. Your own code becomes a service in{' '}
          <a href="#/keys">Keys &amp; devices → Services</a>.
        </p>
      </div>
      <div className="buttons">
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

/** A project's services: each with what it's for and what it offers here. Websites are what the website service serves. */
export function ProjectServicesView({ project, members, meDid }: { project: SpaceInfo; members: MemberInfo[]; meDid: string }) {
  const { data: rooms } = useApi(() => api<WebsiteInfo[]>('websites', project.id), [project.id]);
  const { data: profiles } = useApi(() => api<ServiceProfileInfo[]>('servicesIn', project.id).catch(() => [] as ServiceProfileInfo[]), [project.id]);
  const { data: services } = useApi(() => api<ServiceInfo[]>('services').catch(() => [] as ServiceInfo[]), []);
  const { data: app } = useApi(() => api<AppManifest | null>('projectApp', project.id), [project.id]);
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: shows } = useApi(() => api<ShowInfo[]>('shows', project.id), [project.id]);
  const { data: artifacts } = useApi(() => api<ArtifactInfo[]>('artifacts', project.id), [project.id]);
  const [adding, setAdding] = useState(false);

  // Room services first, then the rest.
  const list = [...(profiles ?? [])].sort((a, b) => Number(b.builtin === 'website') - Number(a.builtin === 'website'));
  return (
    <Page
      title={<><Icon name="zap" /> Services · p/{project.name}</>}
      actions={
        <button onClick={() => setAdding(true)}>
          <Icon name="plus" /> Add a service…
        </button>
      }
    >
      {profiles && !list.length && <p className="empty">No services in p/{project.name} yet. Add websites, and everyone here can join in.</p>}
      {list.map((s) => (
        <ServiceSection key={s.did} project={project} service={s} rooms={rooms ?? []} shows={shows ?? []} mine={(services ?? []).find((x) => x.did === s.did)} meDid={meDid} members={members} groups={info?.groups ?? []} />
      ))}
      {info?.maintainer && <ProjectArtifacts project={project} app={app} artifacts={artifacts ?? []} />}
      <ShowsSection rooms={rooms ?? []} shows={shows ?? []} members={members} />
      {adding && <AddProjectService project={project} services={services ?? []} onClose={() => setAdding(false)} />}
    </Page>
  );
}
