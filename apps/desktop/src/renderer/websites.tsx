import { useEffect, useState, type FormEvent } from 'react';
import type { AppManifest, AppReleases, ArtifactLine, ArtifactInfo, BoardInfo, HostedWebsiteInfo, MemberInfo, ProjectInfo, WebsiteChatMessage, WebsiteInfo, ServiceInfo, ShippedServiceInfo, ServiceProfileInfo, SpaceInfo, ShowInfo } from '@weave/node/client';
import type { ActionWho } from '@weave/core';
import { Icon, type IconName } from './icons.tsx';
import { ago, api, bridge, bump, clock, navigate, shortDid, useApi } from './lib.ts';
import { ItemList } from './lists.tsx';
import { ask, attempt, AsyncButton, Avatar, Modal, toast } from './ui.tsx';
import { ShowsSection, useShowForm } from './shows.tsx';
import { usePayments } from './treasury.tsx';
import { Page } from './views.tsx';
import { ActionScopes, askAndWait, contractText, OriginBadge, lowerFirst, onlyAWebsite, OriginText, ServiceCard, KeptSettingsDialog, ShippedUpdate, whoLabel, type ScopedAction } from './services.tsx';
import { serviceIcon, ServiceCatalog } from './addservice.tsx';

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
          {room.from && (
            <span className="small muted">
              {' '}
              · runs {room.from.name ?? 'a release'} {room.from.tag}
              {room.from.project.name && room.from.project.id !== room.project.id ? ` from p/${room.from.project.name}` : ''}
            </span>
          )}
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

/**
 * Maintainers: publish a release of one of the project's artifacts (any number of them, each from its own source), or
 * of a new one from a new source. First which, then its releases as the project's provider sees them, in its words
 * (Weave reads the artifact's description at the tag picked and fingerprints its files).
 */
function ReleasePicker({ project, onClose }: { project: SpaceInfo; onClose(): void }) {
  const { data: lines } = useApi(() => api<ArtifactLine[]>('artifactLines', project.id), [project.id]);
  const [chosen, setChosen] = useState<{ artifact?: string; source?: string; name: string }>();
  const [source, setSource] = useState('');
  // Only one artifact with a source: straight to its releases.
  const only = lines?.filter((l) => l.source);
  const which = chosen ?? (only?.length === 1 && lines!.length === 1 ? { artifact: only[0].id, name: only[0].name } : undefined);
  return (
    <Modal title={`Publish a release · p/${project.name}${which ? ` · ${which.name}` : ''}`} onClose={onClose} wide>
      {!which ? (
        <>
          <ItemList
            title="Which artifact?"
            empty="None yet: start one from its source below."
            {...(lines ? { rows: lines.map((l) => ({
              key: l.id,
              icon: l.kind === 'website' ? ('globe' as const) : l.kind === 'file' ? ('folder' as const) : ('plug' as const),
              title: l.name,
              ...(l.tag ? { badge: l.tag } : {}),
              search: `${l.name} ${l.id} ${l.source?.ref ?? ''}`,
              detail: [KIND_WORDS[l.kind], l.source ? `from ${l.source.ref}` : l.image ? `a container image, ${l.image}: its next version with weave service release` : 'no source yet'].join(' · '),
              ...(l.source ? { main: <button className="default" onClick={() => setChosen({ artifact: l.id, name: l.name })}>Its releases…</button> } : {}),
            })) } : {})}
          />
          <fieldset>
            <legend>Or a new one, from its source</legend>
            <div className="field-row">
              <input className="grow" placeholder="Where its releases are: a repository's owner/name, say" value={source} onChange={(e) => setSource(e.target.value)} />
              <button className="default" disabled={!source.trim()} onClick={() => setChosen({ source: source.trim(), name: source.trim() })}>
                Its releases…
              </button>
            </div>
          </fieldset>
        </>
      ) : (
        <Releases project={project} which={which} onDone={onClose} />
      )}
      <div className="buttons">
        {chosen && <button onClick={() => setChosen(undefined)}>← Another artifact</button>}
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

/** One artifact's releases (or a new source's), as the project's provider sees them: publishing one. */
function Releases({ project, which, onDone }: { project: SpaceInfo; which: { artifact?: string; source?: string; name: string }; onDone(): void }) {
  const ask = { project: project.id, ...(which.artifact ? { artifact: which.artifact } : {}), ...(which.source ? { source: which.source } : {}) };
  const { data, error } = useApi(() => api<AppReleases>('artifactReleases', ask), [project.id, which.artifact, which.source]);
  const [busy, setBusy] = useState<string>();
  const use = async (tag: string) => {
    setBusy(tag);
    const done = await attempt(() => api<AppManifest>('releaseArtifact', { ...ask, tag }).then((m) => (bump(), m)), `${which.name} ${tag} is released: everyone in ${project.name} can get it`);
    setBusy(undefined);
    if (done !== undefined) onDone();
  };
  return (
    <>
      {data && (
        <p className="small">
          Releases of <b>{data.where ?? data.repo}</b>. Weave reads its <code>weave.app.json</code> at the one you pick and fingerprints each file once.
        </p>
      )}
      <ItemList
        title=""
        error={error}
        empty={data ? `${data.where ?? data.repo} has no releases yet. ${data.empty ?? ''}` : 'Asking for releases…'}
        {...(data ? { rows: data.releases.map((r) => ({
          key: r.tag,
          icon: 'store' as const,
          title: r.name,
          ...(r.name !== r.tag ? { badge: r.tag } : r.prerelease ? { badge: 'pre-release' } : {}),
          search: `${r.name} ${r.tag}`,
          detail: [r.published ? ago(r.published) : '', `${r.files} file${r.files === 1 ? '' : 's'}`, r.problem ?? ''].filter(Boolean).join(' · '),
          main: (
            <button className="default" disabled={!!busy || !!r.problem || r.files === 0} onClick={() => use(r.tag)}>
              {busy === r.tag ? 'Fingerprinting…' : 'Publish'}
            </button>
          ),
        })) } : {})}
      />
    </>
  );
}

function PublishApp({ project }: { project: SpaceInfo }) {
  const [text, setText] = useState('');
  return (
    <fieldset>
      <legend>Describe the project's artifact</legend>
      <p className="small">
        Paste its <code>weave.app.json</code>: what it's called, its web page's port, how it starts and the settings it asks for. Then publish a release of it. (Or:{' '}
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
/** What an artifact is, in a word. */
const KIND_WORDS: Record<ArtifactInfo['kind'], string> = { service: 'Service', website: 'Website', 'board-view': 'Board view', fetcher: 'Fetcher', keyvault: 'Keyvault', marks: 'Mark service', hints: 'Hint service', file: 'File' };
const artifactKind = (a: ArtifactInfo): string => (a.kind === 'service' && a.website ? 'Website and service' : KIND_WORDS[a.kind]);
const artifactIcon = (a: ArtifactInfo): IconName => (a.kind === 'file' ? 'folder' : a.kind === 'board-view' ? 'bulletList' : a.website ? 'globe' : a.kind === 'fetcher' ? 'download' : a.kind === 'keyvault' ? 'lock' : a.packaged ? 'store' : 'plug');
const sizeText = (bytes: number): string => (bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`);

/** A service that publishes a project's releases and hands them out (a provider: GitHub releases, or anyone's for another source). */
export const publishesReleases = (s: ServiceProfileInfo): boolean => !!s.contract.offers?.includes('artifact.fetch') && !!s.contract.actions?.some((a) => a.name === 'publish');

/**
 * Whether a service hands out an artifact: it offers artifact.fetch for where the artifact's files are (any source, if
 * its contract names none). An image Weave pulls itself needs none.
 */
export const providesArtifact = (s: ServiceProfileInfo, a: ArtifactInfo): boolean =>
  !!s.contract.offers?.includes('artifact.fetch') && !!a.source && a.source.provider !== 'oci' && (!s.contract.sources || s.contract.sources.includes(a.source.provider));

/** What's available: each artifact with what it is, and adding it to a project of yours (or a board, for a board view). */
function ArtifactList({ title, artifacts, maintainer, via, add }: { title: string; artifacts: ArtifactInfo[]; maintainer: boolean; via?: (a: ArtifactInfo) => string | undefined; add?: { label: string; run(): void } }) {
  const [adding, setAdding] = useState<ArtifactInfo>();
  const [access, setAccess] = useState<ArtifactInfo>();
  const [launching, setLaunching] = useState<ArtifactInfo>();
  // Yours to get; maintainers see them all, and set who may get each.
  const shown = artifacts.filter((a) => a.mine || maintainer);
  return (
    <>
      <ItemList
        title={title}
        {...(add ? { add } : {})}
        empty="Nothing yet."
        rows={shown.map((a) => ({
          key: a.id,
          icon: artifactIcon(a),
          title: a.name,
          badge: a.tag,
          search: `${a.name} ${a.tag} ${artifactKind(a)}`,
          detail: [`${artifactKind(a)}${a.file?.size ? ` · ${sizeText(a.file.size)}` : ''}${a.who !== 'members' ? ` · only ${lowerFirst(whoLabel(a.who, `p/${a.project.name}`, []))}` : ''}`, via?.(a)].filter(Boolean).join(' · '),
          main: (
            <>
              {a.mine && a.kind === 'file' && <GetFileButton artifact={a} />}
              {a.mine && a.kind === 'website' && (
                <button disabled={!a.runs} title={a.runs ? undefined : a.source?.provider === 'oci' || a.packaged ? 'It runs in a container: start Docker on this computer first' : 'It has nothing Weave runs here: no container image, no WebAssembly'} onClick={() => setLaunching(a)}>
                  Launch…
                </button>
              )}
              {a.mine && a.kind === 'marks' && (
                <AsyncButton
                  onClick={async () =>
                    (await ask(`Take in ${a.name} ${a.tag}, released in p/${a.project.name}? Weave runs exactly this release over what your Weave holds, with no key and no network, and shows what it says next to names everywhere you look.`, 'Take it in')) &&
                    attempt(() => api('addMarks', { project: a.project.id, app: a.app, tag: a.tag, approve: true }), `${a.name} is yours: View → Marks…`)
                  }
                >
                  Take in…
                </AsyncButton>
              )}
              {a.mine && a.kind === 'hints' && (
                <AsyncButton
                  onClick={async () =>
                    (await ask(`Take in ${a.name} ${a.tag}, released in p/${a.project.name}? Weave runs exactly this release over what your Weave holds, what's sealed to you too, with no key and no network, and shows its counts in your Places.`, 'Take it in')) &&
                    attempt(() => api('addHints', { project: a.project.id, app: a.app, tag: a.tag, approve: true }), `${a.name} is yours: View → Notifications…`)
                  }
                >
                  Take in…
                </AsyncButton>
              )}
              {a.mine && a.kind !== 'file' && a.kind !== 'fetcher' && a.kind !== 'keyvault' && a.kind !== 'marks' && a.kind !== 'hints' && a.kind !== 'website' && <button onClick={() => setAdding(a)}>Add to…</button>}
              {/* Yours, beside Weave's own: approved once, pinned to what was released. */}
              {a.mine && (a.kind === 'fetcher' || a.kind === 'keyvault') && (
                <AsyncButton
                  onClick={async () =>
                    (await ask(`Add ${a.name} ${a.tag}, released in p/${a.project.name}, as your ${a.kind}? Weave runs exactly this release, sandboxed, beside its own${a.kind === 'keyvault' ? ': it would hold the access you give it' : ''}.`, 'Add it')) &&
                    attempt(() => api('addClientApp', { project: a.project.id, artifact: a.id, approve: true }).then(bump), `${a.name} is yours now: in Keys & devices`)
                  }
                >
                  Add to Keys &amp; devices…
                </AsyncButton>
              )}
            </>
          ),
          ...(maintainer
            ? {
                tools: [{ icon: 'gear' as const, label: 'Who may get it', run: () => setAccess(a) }],
                // Withdrawn: no longer listed, launched or handed out; who got it keeps what they have.
                remove: {
                  label: 'Withdraw this release',
                  run: () =>
                    void (async () =>
                      (await ask(`Withdraw ${a.name} ${a.tag}? It's no longer listed, launched or handed out in p/${a.project.name}. Who got it already keeps what they have; releasing ${a.tag} again brings it back.`, 'Withdraw')) &&
                      attempt(() => api('withdrawArtifact', { project: a.project.id, artifact: a.id }).then(bump), `${a.name} ${a.tag} is withdrawn`))(),
                },
              }
            : {}),
        }))}
      />
      {adding && <AddArtifactDialog artifact={adding} onClose={() => setAdding(undefined)} />}
      {launching && <LaunchDialog artifact={launching} onClose={() => setLaunching(undefined)} />}
      {access && <ArtifactAccessDialog artifact={access} onClose={() => setAccess(undefined)} />}
    </>
  );
}

/**
 * Launch a website artifact: a running website in a project where you host websites. It's code from others, run on
 * this computer: you approve it here, and it's there until its website is closed.
 */
function LaunchDialog({ artifact, onClose }: { artifact: ArtifactInfo; onClose(): void }) {
  const { data: services } = useApi(() => api<ServiceInfo[]>('services'), []);
  // Where you host websites, here.
  const hosts = (services ?? []).filter((s) => (s.builtin === 'website' || s.contract.websites === 'host') && s.enabled && !s.node);
  const projects = [...new Map(hosts.flatMap((s) => s.spaces).filter((x) => x.kind === 'project').map((x) => [x.id, x])).values()];
  const [where, setWhere] = useState<string>();
  const [announce, setAnnounce] = useState(true);
  const project = projects.find((p) => p.id === (where ?? (projects.length === 1 ? projects[0].id : undefined)));
  const runs = artifact.command?.join(' ') ?? artifact.name;
  return (
    <Modal title={`Launch ${artifact.name} ${artifact.tag}`} onClose={onClose}>
      {services && !projects.length ? (
        <p className="small">You host no websites anywhere yet: add the Websites service to a project first (its Services, Add a service).</p>
      ) : (
        <>
          <div className="field-row">
            <label htmlFor="launch-in">In</label>
            <select id="launch-in" className="grow" value={project?.id ?? ''} onChange={(e) => setWhere(e.target.value || undefined)}>
              <option value="">Pick a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  p/{p.name}
                </option>
              ))}
            </select>
          </div>
          <p className="small">
            Weave runs <code>{runs}</code> from {artifact.name} {artifact.tag}, released in p/{artifact.project.name}, {artifact.runs === 'wasm' ? 'in Weave, as WebAssembly' : 'in a container, sealed off from your files'}. It only shows its page: it reads nothing and
            writes nothing in the project. Your Websites service makes it a running website{project ? ` everyone in p/${project.name} can visit` : ''}, in Live, until you close it.
          </p>
          <p className="small muted">It's other people's code: only launch it if you trust p/{artifact.project.name}.</p>
          <div className="field-row">
            <input type="checkbox" id="launch-announce" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
            <label htmlFor="launch-announce">Announce it in the project's chat: people find it there, and come and join</label>
          </div>
        </>
      )}
      <div className="buttons">
        <AsyncButton
          className="default"
          disabled={!project}
          onClick={() =>
            attempt(async () => {
              await api('launchWebsite', { project: project!.id, artifact: { project: artifact.project.id, id: artifact.id }, approve: true, announce });
              bump();
              onClose();
              location.hash = `#/p/${project!.id}/live`;
            }, `${artifact.name} is launching in p/${project?.name}`)
          }
        >
          Launch
        </AsyncButton>
        <button onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

/** Get a file artifact: its project's provider grants it, your fetcher gets it, Weave checks it; then show where it is. */
function GetFileButton({ artifact }: { artifact: ArtifactInfo }) {
  const [got, setGot] = useState<string>();
  if (got && bridge.reveal) return <button onClick={() => void bridge.reveal!(got)}>Show in folder</button>;
  return (
    <AsyncButton
      onClick={() =>
        attempt(async () => {
          const { path } = await api<{ path: string; by: string }>('getArtifactFile', { project: artifact.project.id, artifact: artifact.id });
          setGot(path);
        }, `${artifact.name} is here, checked`)
      }
    >
      Get
    </AsyncButton>
  );
}

/** Who may get an artifact of the project (maintainers): everyone there, a board's readers, a group's members, maintainers, the owner. */
function ArtifactAccessDialog({ artifact, onClose }: { artifact: ArtifactInfo; onClose(): void }) {
  const project = artifact.project;
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: boards } = useApi(() => api<BoardInfo[]>('boards', project.id).catch(() => [] as BoardInfo[]), [project.id]);
  const groups = info?.groups ?? [];
  const options: ActionWho[] = ['members', ...(boards ?? []).map((b) => ({ board: b.name })), ...groups.map((g) => ({ group: g.id })), 'maintainers', 'owner'];
  const [who, setWho] = useState(JSON.stringify(artifact.who));
  return (
    <Modal title={`${artifact.name} ${artifact.tag}: who may get it`} onClose={onClose}>
      <div className="field-row">
        <label htmlFor="artifact-who">Who</label>
        <select id="artifact-who" className="grow" value={who} onChange={(e) => setWho(e.target.value)}>
          {options.map((w) => (
            <option key={JSON.stringify(w)} value={JSON.stringify(w)}>
              {whoLabel(w, `p/${project.name}`, groups)}
            </option>
          ))}
        </select>
      </div>
      <p className="small muted">
        {artifact.source?.provider === 'oci'
          ? `Only they see it here. Its image comes from its registry, though: whoever can reach it there still can.`
          : `Its providers' nodes hand it only to them: nobody else gets its files through p/${project.name}, nor sees it here.`}
      </p>
      <div className="buttons">
        <AsyncButton
          className="default"
          onClick={() => attempt(() => api('setArtifactAccess', { project: project.id, artifact: artifact.id, who: who === '"members"' ? null : JSON.parse(who) }).then(() => (bump(), onClose())), `Who may get ${artifact.name} is set`)}
        >
          Save
        </AsyncButton>
        <button onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

/** Adding an artifact: to a project of yours as a service or website, or (a board view) to one of its boards. */
function AddArtifactDialog({ artifact, onClose }: { artifact: ArtifactInfo; onClose(): void }) {
  const { data: projects } = useApi(() => api<SpaceInfo[]>('spaces', 'project'), []);
  const [where, setWhere] = useState<string>();
  const project = (projects ?? []).find((p) => p.id === where);
  const { data: boards } = useApi(() => (artifact.lens && where ? api<BoardInfo[]>('boards', where) : Promise.resolve([] as BoardInfo[])), [where, artifact.lens]);
  const [board, setBoard] = useState<string>();
  const { data: info } = useApi(() => (where ? api<ProjectInfo>('project', where) : Promise.resolve(undefined)), [where]);
  return (
    <Modal title={`Add ${artifact.name} to…`} onClose={onClose}>
      <div className="field-row">
        <label htmlFor="add-to-project">Project</label>
        <select id="add-to-project" className="grow" value={where ?? ''} onChange={(e) => (setWhere(e.target.value || undefined), setBoard(undefined))}>
          <option value="">Pick one…</option>
          {(projects ?? []).filter((p) => !p.closed).map((p) => (
            <option key={p.id} value={p.id}>
              p/{p.name}
            </option>
          ))}
        </select>
      </div>
      {project && artifact.lens && (
        <>
          <div className="field-row">
            <label htmlFor="add-to-board">Board</label>
            <select id="add-to-board" className="grow" value={board ?? ''} onChange={(e) => setBoard(e.target.value || undefined)}>
              <option value="">Pick one…</option>
              {(boards ?? []).map((b) => (
                <option key={b.name} value={b.name}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>
          <p className="small muted">Everyone in p/{project.name} can see this board through it.</p>
          <div className="buttons">
            <AsyncButton
              className="default"
              disabled={!board}
              onClick={() => attempt(() => api('setBoardLens', { space: project.id, board, from: { project: artifact.project.id, tag: artifact.tag } }).then(() => (bump(), onClose())), `${artifact.name} shows ${board} in p/${project.name}`)}
            >
              Add to the board
            </AsyncButton>
          </div>
        </>
      )}
      {project && !artifact.lens && <InstallRelease project={project} maintainer={!!info?.maintainer} only={artifact.id} onDone={onClose} />}
      <div className="buttons">
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

/** What a service provides here: its artifacts; maintainers publish more from where it reads them. */
function ServiceReleases({ project, artifacts, maintainer, publish }: { project: SpaceInfo; artifacts: ArtifactInfo[]; maintainer: boolean; publish?(): void }) {
  const [describing, setDescribing] = useState(false);
  return (
    <>
      <ArtifactList title="Released" artifacts={artifacts} maintainer={maintainer} {...(publish ? { add: { label: 'Publish a release', run: publish } } : {})} />
      {maintainer && !artifacts.length && !describing && (
        <p className="small muted">
          <a href="#" onClick={(e) => (e.preventDefault(), setDescribing(true))}>Describe an artifact of this project…</a>
        </p>
      )}
      {describing && <PublishApp project={project} />}
    </>
  );
}

/** The kinds, in the order a project shows them, with their headings. */
const KIND_GROUPS: Array<{ kind: ArtifactInfo['kind']; title: string; about: string }> = [
  { kind: 'website', title: 'Websites', about: 'Launch one, and it runs as a website everyone in a project of yours can visit.' },
  { kind: 'service', title: 'Services', about: 'Add one to a project: it acts there with exactly its contract.' },
  { kind: 'board-view', title: 'Board views', about: 'Show a board their way.' },
  { kind: 'file', title: 'Files', about: 'Get one: it comes checked against what was released.' },
  { kind: 'fetcher', title: 'Fetchers', about: 'Client apps that fetch artifacts for you.' },
  { kind: 'keyvault', title: 'Keyvaults', about: 'Client apps that hold your access to a platform: your services get only what they derive from it.' },
  { kind: 'marks', title: 'Mark services', about: 'Take one in: what it says shows next to names, everywhere you look.' },
  { kind: 'hints', title: 'Hint services', about: 'Take one in: its counts show next to places in your Places.' },
];

/**
 * Everything a project offers, by kind: what each is, who hands it out (a provider here, or Weave pulling its image
 * itself), and what you can do with it. Maintainers see all of it, with who may get each, and publish more.
 */
export function ProjectAvailableView({ project }: { project: SpaceInfo }) {
  const { data: all } = useApi(() => api<ArtifactInfo[]>('artifacts', project.id), [project.id]);
  const { data: profiles } = useApi(() => api<ServiceProfileInfo[]>('servicesIn', project.id).catch(() => [] as ServiceProfileInfo[]), [project.id]);
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const [picking, setPicking] = useState(false);
  const maintainer = !!info?.maintainer;
  const shown = (all ?? []).filter((a) => a.mine || maintainer);
  // Who hands each out: a provider here, or Weave itself for an image.
  const via = (a: ArtifactInfo): string | undefined => {
    if (a.source?.provider === 'oci') return 'Weave fetches its image itself';
    const provider = (profiles ?? []).find((s) => providesArtifact(s, a));
    if (provider) return `Handed out by ${provider.name}${provider.person.name ? ` (${provider.person.name})` : ''}`;
    return a.source ? `Nothing here hands out what's on ${a.source.provider} yet` : undefined;
  };
  return (
    <Page
      title={<><Icon name="store" /> Available · p/{project.name}</>}
      actions={
        maintainer ? (
          <button onClick={() => setPicking(true)}>
            <Icon name="plus" /> Publish a release…
          </button>
        ) : undefined
      }
    >
      {all && !shown.length && <p className="empty">p/{project.name} offers nothing{all.length ? ' you may get' : ''} yet.</p>}
      {KIND_GROUPS.map((g) => {
        const these = shown.filter((a) => a.kind === g.kind);
        if (!these.length) return null;
        return (
          <fieldset key={g.kind}>
            <legend>{g.title}</legend>
            <p className="small muted">{g.about}</p>
            <ArtifactList title="" artifacts={these} maintainer={maintainer} via={via} />
          </fieldset>
        );
      })}
      {picking && <ReleasePicker project={project} onClose={() => setPicking(false)} />}
    </Page>
  );
}

/** Artifacts of every project you're in, this one's first. */
export function useArtifacts(project: SpaceInfo): ArtifactInfo[] | undefined {
  const { data } = useApi(async () => {
    const projects = await api<SpaceInfo[]>('spaces', 'project');
    const ordered = [project, ...projects.filter((p) => p.id !== project.id)];
    const lists = await Promise.all(ordered.map((p) => api<ArtifactInfo[]>('artifacts', p.id).catch(() => [] as ArtifactInfo[])));
    return lists.flat();
  }, [project.id]);
  return data;
}

/** One setting typed in the start dialog. */
export function SettingInput({ setting, value, onChange }: { setting: ArtifactInfo['settings'][number]; value: string; onChange(value: string): void }) {
  // A sign-in: nothing to type; its provider's page opens from its settings once it's installed.
  if (setting.oauth)
    return (
      <div className="app-setting">
        <label>{setting.label}</label>
        <div className="small muted">A sign-in with {new URL(setting.oauth.authorize ?? setting.oauth.device ?? setting.oauth.token).hostname}: once it's added, sign it in from its Settings (one click).</div>
      </div>
    );
  // An app of yours, made on the provider's page: right after it's added.
  if (setting.register)
    return (
      <div className="app-setting">
        <label>{setting.label}</label>
        <div className="small muted">Yours, made on {new URL(setting.register.page).hostname} with one click right after adding it.</div>
      </div>
    );
  // Picked from what it lists (a repository its sign-in reaches): once it runs, right after it's added.
  if (setting.choose)
    return (
      <div className="app-setting">
        <label>{setting.label}</label>
        <div className="small muted">{setting.hint ?? 'Picked from a list it makes'}: you pick {setting.choose.many ? 'them' : 'it'} right after adding it.</div>
      </div>
    );
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
  const [announce, setAnnounce] = useState(true);
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
    const room = await attempt(() => api<WebsiteInfo>('openWebsite', { service, project: project.id, name: name.trim(), port: Number(port), ...access, announce }), away ? `"${name.trim()}" goes to ${away}: it opens once the node has it` : `"${name.trim()}" is open: visitors reach port ${port}`);
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
        <div className="field-row">
          <input type="checkbox" id="open-announce" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
          <label htmlFor="open-announce">Announce it in the project's chat: people find it there, and come and join</label>
        </div>
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
  if (!hosted || (!hosted.progress && !hosted.error && !hosted.note)) return null;
  if (!hosted.progress && !hosted.error) return <p className="small muted">{hosted.note}</p>;
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
/** A service that hosts its projects' websites: Weave's built-in one, or one whose contract says so (the shipped Websites). */
const hostsSites = (s: ServiceProfileInfo): boolean => s.builtin === 'website' || s.contract.websites === 'host';

const purpose = (s: ServiceProfileInfo): string => (s.builtin === 'website' ? "A way to join in with the project's participants" : s.description);

/** One service in the project: what it's for, and what it offers here (a website service: its websites). */
function ServiceSection({ project, service, rooms, shows, mine, meDid, members, groups, maintainer, artifacts, boards }: { project: SpaceInfo; service: ServiceProfileInfo; rooms: WebsiteInfo[]; shows: ShowInfo[]; mine?: ServiceInfo; meDid: string; members: MemberInfo[]; groups: ProjectInfo['groups']; maintainer: boolean; artifacts: ArtifactInfo[]; boards: string[] }) {
  const [opening, setOpening] = useState(false);
  const [asking, setAsking] = useState(false);
  const [setting, setSetting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const own = service.person.did === meDid;
  const by = service.person.name ?? shortDid(service.person.did);
  const its = rooms.filter((r) => r.offeredBy?.did === service.did);
  const extras: ScopedAction[] = [
    // Asking it in words: only a service one talks to (no actions, list or page of its own: those are how one uses it).
    ...(!hostsSites(service) && service.contract.reads !== 'nothing' && !service.contract.actions?.length && !service.contract.offers?.length ? [{ key: 'ask', label: `Ask ${service.name}…`, who: 'members' as const, mine: true, run: () => setAsking(true), withoutPage: true as const }] : []),
  ];
  return (
    <fieldset className="project-service">
      <legend className="service-title">
        <Icon name={serviceIcon(service)} /> {service.name} <span className="muted small">· {by}</span> <OriginBadge origin={service.origin} />
        {/* The same for every service: its settings (maintainers), and taking it out of the project (whoever runs it). */}
        {maintainer && service.builtin !== 'website' && (
          <button className="icon-button" title="Settings" onClick={() => setSetting(true)}>
            <Icon name="gear" />
          </button>
        )}
        {own && mine && (
          <button
            className="icon-button"
            title={`Take out of p/${project.name}`}
            onClick={() =>
              void (async () =>
                (await ask(`Take ${service.name} out of p/${project.name}?${its.length ? ' Its websites here close.' : ''}`, 'Take it out')) &&
                attempt(() => api('setService', { name: mine.name, spaces: mine.spaces.filter((s) => s.id !== project.id).map((s) => s.id) }).then(bump), `${service.name} left p/${project.name}`))()
            }
          >
            <Icon name="trash" />
          </button>
        )}
      </legend>
      {purpose(service) && <p className="small">{purpose(service)}</p>}
      <OriginText origin={service.origin} />
      {own && mine?.update && <ShippedUpdate service={mine} />}
      {/* What it hosts: running website artifacts, listed by Weave (they run in Live). */}
      {hostsSites(service) && <RunningWebsites project={project} service={service} rooms={its} shows={shows} maintainer={maintainer} {...(own && mine ? { open: () => setOpening(true) } : {})} />}
      {!!service.contract.offers?.includes('artifact.fetch') && <ServiceReleases project={project} artifacts={artifacts.filter((a) => a.project.id === project.id && providesArtifact(service, a))} maintainer={maintainer} {...(maintainer && publishesReleases(service) ? { publish: () => setPublishing(true) } : {})} />}
      {hostsSites(service) && own && !mine && <p className="small muted">It runs on another of your devices: open websites there.</p>}
      <ActionScopes space={{ id: project.id, name: `p/${project.name}` }} service={service} groups={groups} extras={extras} covered={hostsSites(service) ? ['list', 'close'] : publishesReleases(service) ? ['publish', 'releases'] : undefined} />
      {opening && mine && <OpenWebsiteDialog project={project} service={mine.name} away={mine.node?.name} members={members} meDid={meDid} groups={groups} shows={shows} onClose={() => setOpening(false)} />}
      {asking && <ServiceCard space={project} service={service} onClose={() => setAsking(false)} />}
      {setting && <KeptSettingsDialog space={{ id: project.id, name: `p/${project.name}` }} service={service} onClose={() => setSetting(false)} />}
      {publishing && <ReleasePicker project={project} onClose={() => setPublishing(false)} />}
    </fieldset>
  );
}

/**
 * A website service's running websites, as Weave knows them: each a website artifact running (or a page of a service),
 * who may visit, who opened it; your own you close, and maintainers close any (asking the service that hosts it).
 */
function RunningWebsites({ project, service, rooms, shows, maintainer, open }: { project: SpaceInfo; service: ServiceProfileInfo; rooms: WebsiteInfo[]; shows: ShowInfo[]; maintainer: boolean; open?(): void }) {
  const visitors = (room: WebsiteInfo) => {
    const show = room.show ? shows.find((s) => s.id === room.show) : undefined;
    const who = [...(room.show ? [`ticket holders of ${show?.name ?? 'a show'}`] : []), ...(room.groups ?? []).map((g) => `members of ${g.name ?? 'a tier'}`)];
    return who.length ? who.join(' or ') : room.open ? 'everyone here' : 'people invited';
  };
  const close = (room: WebsiteInfo) =>
    void (async () =>
      (await ask(`Close "${room.name}"? Everyone on it is disconnected, and what answers it stops.`, 'Close website')) &&
      attempt(() => (room.mine ? api('closeWebsite', room.id) : askAndWait(project.id, service, 'close', { id: room.id }, `Close ${room.name}`)).then(bump), 'Website closed'))();
  return (
    <ItemList
      title="Running websites"
      {...(open ? { add: { label: 'Open a website', run: open } } : {})}
      empty="No running websites yet."
      rows={rooms.map((room) => ({
        key: room.id,
        title: room.name,
        detail: [room.from ? `${room.from.name ?? 'a release'} ${room.from.tag}${room.from.project.name && room.from.project.id !== project.id ? ` from p/${room.from.project.name}` : ''}` : '', `for ${visitors(room)}`, `opened by ${room.host.name ?? shortDid(room.host.did)}`].filter(Boolean).join(' · '),
        main: <button onClick={() => navigate(`#/p/${project.id}/live`)}>Visit</button>,
        ...(room.mine || maintainer ? { remove: { label: 'Close website', run: () => close(room) } } : {}),
      }))}
    />
  );
}

/**
 * Installing a project's release as a service in this project: what it runs is shown and approved here, once per
 * release. One with a web page serves it as a website here (by the website service); one with a contract does what it says.
 */
export function InstallRelease({ project, maintainer, only, onDone }: { project: SpaceInfo; maintainer: boolean; only?: string; onDone(): void }) {
  const artifacts = useArtifacts(project);
  const [picked, setPicked] = useState<string | undefined>(only);
  const [values, setValues] = useState<Record<string, string>>({});
  // Its settings kept in the project, for its maintainers to change (rather than only on this computer).
  const [keep, setKeep] = useState(maintainer);
  const [busy, setBusy] = useState(false);
  const usable = (artifacts ?? []).filter((a) => a.runs && (a.website || a.applet));
  const chosen = usable.find((a) => a.id === picked);
  useEffect(() => setValues({}), [chosen?.id]);
  const missing = chosen?.settings.filter((s) => !s.optional && !s.oauth && !values[s.name]?.trim()) ?? [];
  if (!artifacts) return <p className="small">Looking for releases…</p>;
  if (!usable.length) return <p className="small muted">No project you're in has released anything that runs on this computer yet.</p>;
  const install = async () => {
    setBusy(true);
    const settings = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
    await attempt(
      () => api<ServiceInfo>('addService', { artifact: { project: chosen!.project.id, tag: chosen!.tag }, spaces: [project.id], settings, approve: true, ...(keep && maintainer ? { settingsIn: project.id } : {}) }).then(() => (bump(), onDone())),
      `${chosen!.name} runs as a service in p/${project.name}${chosen!.website ? ': its website opens once it runs' : ''}`,
    );
    setBusy(false);
  };
  return (
    <fieldset>
      {!only && <legend>Install a project's release</legend>}
      {!only && usable.map((a) => (
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
          {maintainer && chosen.settings.length > 0 && (
            <div className="field-row small">
              <input id={`keep-${project.id}`} type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              <label htmlFor={`keep-${project.id}`}>Keep its settings in p/{project.name}, for its maintainers to change (a secret sealed for the service alone)</label>
            </div>
          )}
          <div className="approve-launch">
            <Icon name="warning" size={32} />
            <div>
              <p>
                {chosen.packaged
                  ? `Weave will run ${chosen.name} ${chosen.tag} in its sandbox: a container that can't change its own files or reach yours, with limits on memory and CPU, and a folder of its own for what it keeps:`
                  : chosen.runs === 'container'
                  ? `Weave will run ${chosen.name} ${chosen.tag} in a container, sealed off from your files:`
                  : `Weave will fetch ${chosen.name} ${chosen.tag}, check it against the fingerprints p/${chosen.project.name} published, and run it in Weave, as WebAssembly, with only what its contract allows:`}
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

/**
 * What runs live in a project: its running websites, as windows to visit or play (Weave holds the connections), and
 * the shows whose tickets let people in. Opening one for a program of yours is here too, if you host websites here.
 */
export function ProjectLiveView({ project, members, meDid }: { project: SpaceInfo; members: MemberInfo[]; meDid: string }) {
  const { data: rooms } = useApi(() => api<WebsiteInfo[]>('websites', project.id), [project.id]);
  const { data: services } = useApi(() => api<ServiceInfo[]>('services').catch(() => [] as ServiceInfo[]), []);
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: shows } = useApi(() => api<ShowInfo[]>('shows', project.id), [project.id]);
  const [opening, setOpening] = useState(false);
  // Yours that host websites here: you open websites for programs of yours through it.
  const host = (services ?? []).find((s) => (s.builtin === 'website' || s.contract.websites === 'host') && !s.node && s.spaces.some((x) => x.id === project.id));
  return (
    <Page
      title={<><Icon name="globe" /> Live · p/{project.name}</>}
      actions={
        host ? (
          <button onClick={() => setOpening(true)}>
            <Icon name="plus" /> Open a website…
          </button>
        ) : undefined
      }
    >
      {rooms && !rooms.length && <p className="empty">Nothing running in p/{project.name} right now.</p>}
      {(rooms ?? []).map((room) => (
        <div key={room.id}>
          <WebsiteCard room={room} shows={shows ?? []} />
          <HostedStatus hosted={(services ?? []).flatMap((s) => s.websites ?? []).find((r) => r.id === room.id)} />
        </div>
      ))}
      <ShowsSection rooms={rooms ?? []} shows={shows ?? []} members={members} />
      {opening && host && <OpenWebsiteDialog project={project} service={host.name} away={host.node?.name} members={members} meDid={meDid} groups={info?.groups ?? []} shows={shows ?? []} onClose={() => setOpening(false)} />}
    </Page>
  );
}

/** A project's services: each with what it's for and what it offers here. Websites are what the website service serves. */
export function ProjectServicesView({ project, members, meDid, focus }: { project: SpaceInfo; members: MemberInfo[]; meDid: string; focus?: string }) {
  const { data: rooms } = useApi(() => api<WebsiteInfo[]>('websites', project.id), [project.id]);
  const { data: profiles } = useApi(() => api<ServiceProfileInfo[]>('servicesIn', project.id).catch(() => [] as ServiceProfileInfo[]), [project.id]);
  const { data: services } = useApi(() => api<ServiceInfo[]>('services').catch(() => [] as ServiceInfo[]), []);
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: shows } = useApi(() => api<ShowInfo[]>('shows', project.id), [project.id]);
  const { data: artifacts } = useApi(() => api<ArtifactInfo[]>('artifacts', project.id), [project.id]);
  const [adding, setAdding] = useState(false);
  const { data: boards } = useApi(() => api<BoardInfo[]>('boards', project.id).catch(() => [] as BoardInfo[]), [project.id]);

  // Room services first, then the rest.
  // Websites that are only that run in Live.
  const all = [...(profiles ?? [])].filter((s) => !onlyAWebsite(s.contract)).sort((a, b) => Number(hostsSites(b)) - Number(hostsSites(a)));
  // One picked in the sidebar: that one alone.
  const list = focus ? all.filter((s) => s.did === focus) : all;
  return (
    <Page
      title={list.length === 1 && focus ? <><Icon name={serviceIcon(list[0])} /> {list[0].name} · p/{project.name}</> : <><Icon name="zap" /> Services · p/{project.name}</>}
      actions={
        <button onClick={() => setAdding(true)}>
          <Icon name="plus" /> Add a service…
        </button>
      }
    >
      {profiles && !list.length && <p className="empty">No services in p/{project.name} yet. Add websites, and everyone here can join in.</p>}
      {list.map((s) => (
        <ServiceSection key={s.did} project={project} service={s} rooms={rooms ?? []} shows={shows ?? []} mine={(services ?? []).find((x) => x.did === s.did)} meDid={meDid} members={members} groups={info?.groups ?? []} maintainer={!!info?.maintainer} artifacts={artifacts ?? []} boards={(boards ?? []).map((b) => b.name)} />
      ))}
      {!focus && (artifacts ?? []).some((a) => a.project.id === project.id) && (
        <p className="small">
          <a href={`#/p/${project.id}/available`}>Everything p/{project.name} offers, by kind → Available</a>
        </p>
      )}
      {adding && <ServiceCatalog project={project} services={services ?? []} maintainer={!!info?.maintainer} onClose={() => setAdding(false)} />}
    </Page>
  );
}
