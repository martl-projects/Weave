import { useEffect, useState, type FormEvent } from 'react';
import type { AppManifest, AppReleases, ArtifactLine, ArtifactInfo, BoardInfo, HintServiceInfo, HostedWebsiteInfo, KeyvaultInfo, MemberInfo, ProjectInfo, WebsiteChatMessage, WebsiteInfo, ServiceInfo, ShippedServiceInfo, ServiceProfileInfo, SpaceInfo, ShowInfo } from '@weave/node/client';
import { fieldName, type ActionWho, type TextPackage } from '@weave/core';
import { Icon, type IconName } from './icons.tsx';
import { ago, api, bridge, bump, clock, navigate, shortDid, useApi } from './lib.ts';
import { spaceHref } from './posts.tsx';
import { ItemList } from './lists.tsx';
import { ask, attempt, AsyncButton, Avatar, Modal, toast } from './ui.tsx';
import { ShowsSection, useShowForm } from './shows.tsx';
import { usePayments } from './treasury.tsx';
import { Page } from './views.tsx';
import { ActionScopes, askAndWait, contractText, OriginBadge, lowerFirst, onlyAWebsite, OriginText, ServiceCard, KeptSettingsDialog, ShippedUpdate, whoLabel, type ScopedAction } from './services.tsx';
import { serviceIcon, ServiceCatalog } from './addservice.tsx';
import { HandDialog, platformName } from './keyvaults.tsx';
import { t, useTexts } from './texts.tsx';
import { useServiceTexts } from './servicetexts.ts';

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
  const { t } = useTexts();
  const { data: messages } = useApi(() => api<WebsiteChatMessage[]>('websiteChat', room.id), [room.id]);
  const [text, setText] = useState('');
  return (
    <div className="room-chat">
      <div className="room-messages sunken">
        {(messages ?? []).map((m) => (
          <div key={m.id} className="room-message">
            <time>{clock(m.time)}</time> <b>{m.mine ? t('word.you') : (m.by.name ?? shortDid(m.by.did))}</b> {m.text}
          </div>
        ))}
        {messages?.length === 0 && <div className="small muted">{t('web.chat.about')}</div>}
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
        <input value={text} placeholder={t('web.say.something')} onChange={(e) => setText(e.target.value)} disabled={!room.connected} aria-label={t('web.chat')} />
        <button disabled={!room.connected}>{t('button.send')}</button>
      </form>
    </div>
  );
}

/** Who a website is for, by its show's tickets and its tiers: "ticket holders of X", "members of Y". */
const whoFor = (room: WebsiteInfo, shows: ShowInfo[]): string[] => {
  const show = room.show ? shows.find((s) => s.id === room.show) : undefined;
  return [...(room.show ? [t('web.ticket.holders.of', { show: show?.name ?? t('web.a.show') })] : []), ...(room.groups ?? []).map((g) => t('web.members.of', { tier: g.name ?? t('web.a.tier') }))];
};

function WebsiteCard({ room, shows }: { room: WebsiteInfo; shows: ShowInfo[] }) {
  const { t } = useTexts();
  const show = room.show ? shows.find((s) => s.id === room.show) : undefined;
  const who = whoFor(room, shows);
  const label = room.service?.label ?? t(room.mine ? 'web.open' : 'web.play');
  // "Race, offered by martl · website".
  const offered = `${room.host.name ?? shortDid(room.host.did)} · ${room.offeredBy?.name ?? t('web.a.service')}`;
  let main;
  if (room.mine)
    main = room.service?.ready ? (
      <button className="default play" onClick={() => play(room)}>
        ▶ {label}
      </button>
    ) : (
      <span className="waiting">
        <button disabled>{t('web.waiting.answers')}</button> <button onClick={bump}>{t('web.check.again')}</button>
      </span>
    );
  else if (!room.joined)
    main = room.mayJoin ? (
      <AsyncButton className="default" onClick={() => attempt(() => api('visitWebsite', room.id).then(bump))}>
        {t('web.visit')}
      </AsyncButton>
    ) : (
      <span className="small muted">{who.length ? t(show && !show.open ? 'web.for.while.on' : 'web.for', { who }) : t('web.not.invited')}</span>
    );
  else
    main = room.url ? (
      <button className="default play" onClick={() => play(room)}>
        ▶ {label}
      </button>
    ) : (
      <button disabled>{t(room.connected ? 'web.waiting.for' : 'web.connecting.to', { offered })}</button>
    );
  return (
    <article className="room window">
      <div className="title-bar">
        <div className="title-bar-text">{room.name}</div>
      </div>
      <div className="window-body">
        <div className="room-head">
          <span className="live-dot" /> {t(room.mine ? 'web.offered.by.here' : 'web.offered.by', { offered })}
          {room.from && (
            <span className="small muted">
              {' '}
              · {t('web.runs', { name: room.from.name ?? t('web.a.release'), tag: room.from.tag })}
              {room.from.project.name && room.from.project.id !== room.project.id ? ` ${t('web.from.project', { project: room.from.project.name })}` : ''}
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
            <AsyncButton onClick={async () => (await ask(t('web.close.ask', { name: room.name }), t('web.close'))) && attempt(() => api('closeWebsite', room.id).then(bump), t('web.closed'))}>{t('web.close')}</AsyncButton>
          ) : (
            room.joined && <AsyncButton onClick={() => attempt(() => api('leaveWebsite', room.id).then(bump))}>{t('web.leave')}</AsyncButton>
          )}
        </div>
        {!room.mine && !room.joined && room.mayJoin && <p className="small muted">{t('web.visiting.connects', { offered })}</p>}
        {/* Yours, running a release's program with your rights: the consent you gave, and taking it back (which closes it). */}
        {room.mine && room.program && (
          <p className="small">
            <Icon name="warning" /> {t('web.program.runs', { file: room.program.file })}{' '}
            <AsyncButton onClick={async () => (await ask(t('web.program.withdraw.ask', { name: room.name }), t('web.program.withdraw'))) && attempt(() => api('withdrawProgramConsent', room.program!.consent).then(bump), t('web.program.withdrawn', { name: room.name }))}>
              {t('web.program.withdraw')}
            </AsyncButton>
          </p>
        )}
        {room.joined && <WebsiteChat room={room} />}
      </div>
    </article>
  );
}

/** What a marks or hints service sees, in words: "your messages, posts and contacts". */
const READ_KINDS = ['weave.msg', 'weave.post', 'weave.contact', 'weave.seen', 'weave.reply', 'weave.react', 'weave.issue'];
function readWords(kinds: string[]): string {
  const words = [...new Set(kinds.map((k) => (READ_KINDS.includes(k) ? t(`reads.${k}`) : k)))];
  return t('reads.your', { words });
}

/** Taking in a marks or hints service: what it does (its own words, or the standard ones), and what it can't. */
function takeInText(a: ArtifactInfo, standard: string): string {
  return t(a.reads?.length ? 'takein.ask.sees' : 'takein.ask', { name: a.name, tag: a.tag, project: a.project.name, about: a.about ?? standard, sees: a.reads?.length ? readWords(a.reads) : '' });
}

/**
 * Maintainers: publish a release of one of the project's artifacts (any number of them, each from its own source), or
 * of a new one from a new source. First which, then its releases as the project's provider sees them, in its words
 * (Weave reads the artifact's description at the tag picked and fingerprints its files).
 */
function ReleasePicker({ project, onClose }: { project: SpaceInfo; onClose(): void }) {
  const { t } = useTexts();
  const { data: lines } = useApi(() => api<ArtifactLine[]>('artifactLines', project.id), [project.id]);
  const [chosen, setChosen] = useState<{ artifact?: string; source?: string; name: string }>();
  // Only one artifact with a source: straight to its releases.
  const only = lines?.filter((l) => l.source);
  const which = chosen ?? (only?.length === 1 && lines!.length === 1 ? { artifact: only[0].id, name: only[0].name } : undefined);
  const taken = (lines ?? []).flatMap((l) => (l.source ? [l.source.ref.toLowerCase()] : []));
  const pick = (source: string) => setChosen({ source, name: source });
  return (
    <Modal title={`${t('rel.publish.title', { project: project.name })}${which ? ` · ${which.name}` : ''}`} onClose={onClose} wide>
      {!which && lines?.length === 0 ? (
        <NewSource project={project} taken={taken} first onPick={pick} />
      ) : !which ? (
        <>
          <ItemList
            title={t('rel.which.artifact')}
            empty={t('rel.none.yet')}
            {...(lines ? { rows: lines.map((l) => ({
              key: l.id,
              icon: l.kind === 'website' ? ('globe' as const) : l.kind === 'file' ? ('folder' as const) : ('plug' as const),
              title: l.name,
              ...(l.tag ? { badge: l.tag } : {}),
              search: `${l.name} ${l.id} ${l.source?.ref ?? ''}`,
              detail: [t(`kind.${l.kind}`), l.source ? t('rel.from.source', { source: l.source.ref }) : l.image ? t('rel.container.image', { image: l.image }) : t('rel.no.source')].join(' · '),
              ...(l.source ? { main: <button className="default" onClick={() => setChosen({ artifact: l.id, name: l.name })}>{t('rel.its.releases')}</button> } : {}),
            })) } : {})}
          />
          <NewSource project={project} taken={taken} onPick={pick} />
        </>
      ) : (
        <Releases project={project} which={which} onDone={onClose} />
      )}
      <div className="buttons">
        {chosen && <button onClick={() => setChosen(undefined)}>{t('rel.another.artifact')}</button>}
        <button onClick={onClose}>{t('button.close')}</button>
      </div>
    </Modal>
  );
}

/**
 * A new artifact's source: the repositories handed to the project from your GitHub keyvault, or any owner/name.
 * Handing it more is the keyvault's own dialog.
 */
function NewSource({ project, taken, first, onPick }: { project: SpaceInfo; taken: string[]; first?: boolean; onPick(source: string): void }) {
  const { t } = useTexts();
  const { data: vaults } = useApi(() => api<KeyvaultInfo[]>('keyvaults').catch(() => []), []);
  const vault = vaults?.find((k) => k.added && k.platform === 'github');
  const [source, setSource] = useState('');
  const [handing, setHanding] = useState(false);
  const repos = [...new Set(vault?.apps.flatMap((a) => a.handed.find((h) => h.project.id === project.id)?.resources ?? []) ?? [])].filter((r) => !taken.includes(r.toLowerCase())).sort();
  return (
    <>
      {vault && (
        <ItemList
          title={t(first ? 'rel.where.releases' : 'rel.or.new.source')}
          add={{ label: t('rel.hand.more', { project: project.name }), run: () => setHanding(true) }}
          empty={t('rel.no.repos', { project: project.name, vault: vault.title })}
          rows={repos.map((r) => ({
            key: r,
            icon: 'folder' as const,
            title: r,
            search: r,
            detail: t('rel.handed.to', { project: project.name }),
            main: (
              <button className="default" onClick={() => onPick(r)}>
                {t('rel.its.releases')}
              </button>
            ),
          }))}
        />
      )}
      <fieldset>
        <legend>{t(vault ? 'rel.another.repo' : first ? 'rel.where.releases' : 'rel.or.new.source')}</legend>
        <div className="field-row">
          <input className="grow" placeholder={t('rel.owner.name')} value={source} onChange={(e) => setSource(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && source.trim() && onPick(source.trim())} />
          <button className="default" disabled={!source.trim()} onClick={() => onPick(source.trim())}>
            {t('rel.its.releases')}
          </button>
        </div>
        {!vault && <p className="small muted">{t('rel.private.needs.keyvault', { project: project.name })}</p>}
      </fieldset>
      {handing && vault && <HandDialog vault={vault} project={project} onClose={() => setHanding(false)} />}
    </>
  );
}

/** One artifact's releases (or a new source's), as the project's provider sees them: publishing one. */
function Releases({ project, which, onDone }: { project: SpaceInfo; which: { artifact?: string; source?: string; name: string }; onDone(): void }) {
  const { t } = useTexts();
  const ask = { project: project.id, ...(which.artifact ? { artifact: which.artifact } : {}), ...(which.source ? { source: which.source } : {}) };
  const { data, error } = useApi(() => api<AppReleases>('artifactReleases', ask), [project.id, which.artifact, which.source]);
  const [busy, setBusy] = useState<string>();
  const use = async (tag: string) => {
    setBusy(tag);
    const done = await attempt(() => api<AppManifest>('releaseArtifact', { ...ask, tag }).then((m) => (bump(), m)), t('rel.is.released', { name: which.name, tag, project: project.name }));
    setBusy(undefined);
    if (done !== undefined) onDone();
  };
  return (
    <>
      {data && (
        <p className="small">
          {t('rel.releases.of')} <b>{data.where ?? data.repo}</b>. {t('rel.reads.manifest')}
        </p>
      )}
      {data && <p className="small muted">{t('rel.programs.note')}</p>}
      <ItemList
        title=""
        error={error}
        empty={data ? `${t('rel.no.releases', { where: data.where ?? data.repo })} ${data.empty ?? ''}` : t('rel.asking')}
        {...(data ? { rows: data.releases.map((r) => ({
          key: r.tag,
          icon: 'store' as const,
          title: r.name,
          ...(r.name !== r.tag ? { badge: r.tag } : r.prerelease ? { badge: t('rel.pre.release') } : {}),
          search: `${r.name} ${r.tag}`,
          detail: [r.published ? ago(r.published) : '', t('rel.files', { n: r.files }), r.problem ?? ''].filter(Boolean).join(' · '),
          main: (
            <button className="default" disabled={!!busy || !!r.problem || r.files === 0} onClick={() => use(r.tag)}>
              {t(busy === r.tag ? 'rel.fingerprinting' : 'rel.publish')}
            </button>
          ),
        })) } : {})}
      />
    </>
  );
}

function PublishApp({ project }: { project: SpaceInfo }) {
  const { t } = useTexts();
  const [text, setText] = useState('');
  return (
    <fieldset>
      <legend>{t('rel.describe.artifact')}</legend>
      <p className="small">
        {t('rel.paste.manifest')} <code>weave.app.json</code>: {t('rel.manifest.has')} <code>weave app publish -p "{project.name}"</code> {t('rel.in.its.folder')}
      </p>
      <textarea className="wide code" rows={8} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('rel.manifest.example')} />
      <div className="buttons">
        <AsyncButton
          className="default"
          onClick={() =>
            attempt(async () => {
              let manifest: unknown;
              try {
                manifest = JSON.parse(text);
              } catch {
                throw new Error(t('rel.not.json'));
              }
              await api('publishApp', { project: project.id, manifest });
              bump();
            }, t('rel.published.now.release'))
          }
        >
          {t('rel.publish')}
        </AsyncButton>
      </div>
    </fieldset>
  );
}

/** Maintainers: the project's artifacts (its releases), and releasing the next one. */
/** What an artifact is, in a word. */
const artifactKind = (a: ArtifactInfo): string => (a.kind === 'service' && a.website ? t('kind.website.service') : t(`kind.${a.kind}`));
const artifactIcon = (a: ArtifactInfo): IconName => (a.kind === 'file' ? 'folder' : a.kind === 'board-view' ? 'bulletList' : a.website ? 'globe' : a.kind === 'fetcher' ? 'download' : a.kind === 'keyvault' ? 'lock' : a.packaged ? 'store' : 'plug');
const sizeText = (bytes: number): string => (bytes < 1024 ? t('size.b', { n: bytes }) : bytes < 1048576 ? t('size.kb', { n: Math.round(bytes / 1024) }) : t('size.mb', { n: Math.round(bytes / 104857.6) / 10 }));

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
  const { t } = useTexts();
  const [adding, setAdding] = useState<ArtifactInfo>();
  const [access, setAccess] = useState<ArtifactInfo>();
  const [launching, setLaunching] = useState<ArtifactInfo>();
  // Yours to get; maintainers see them all, and set who may get each.
  const shown = artifacts.filter((a) => a.mine || maintainer);
  // A hint service Weave ships (pinned to its project's release): yours already, nothing to take in.
  const { data: hintServices } = useApi(() => (artifacts.some((a) => a.kind === 'hints') ? api<HintServiceInfo[]>('hintServices', { off: true }) : Promise.resolve([])).catch(() => []), [artifacts.length]);
  const weaveShips = (a: ArtifactInfo) => a.kind === 'hints' && !!hintServices?.some((s) => s.shipped && s.service === a.app);
  return (
    <>
      <ItemList
        title={title}
        {...(add ? { add } : {})}
        empty={t('art.nothing.yet')}
        rows={shown.map((a) => ({
          key: a.id,
          icon: artifactIcon(a),
          title: a.name,
          badge: a.tag,
          search: `${a.name} ${a.tag} ${artifactKind(a)}`,
          detail: [`${artifactKind(a)}${a.file?.size ? ` · ${sizeText(a.file.size)}` : ''}${a.who !== 'members' ? ` · ${t('who.only', { who: lowerFirst(whoLabel(a.who, `p/${a.project.name}`, [])) })}` : ''}`, via?.(a)].filter(Boolean).join(' · '),
          main: (
            <>
              {a.mine && a.kind === 'file' && <GetFileButton artifact={a} />}
              {a.mine && a.kind === 'website' && (
                <button disabled={!a.runs} title={a.runs === 'program' ? t('art.runs.as.program') : a.runs ? undefined : t(a.source?.provider === 'oci' || a.packaged ? 'art.needs.docker' : 'art.nothing.runs')} onClick={() => setLaunching(a)}>
                  {t('art.launch')}
                </button>
              )}
              {a.mine && a.kind === 'marks' && (
                <AsyncButton
                  onClick={async () =>
                    (await ask(takeInText(a, t('takein.marks.standard', { name: a.name })), t('service.take.it.in'))) &&
                    attempt(() => api('addMarks', { project: a.project.id, app: a.app, tag: a.tag, approve: true }), t('takein.marks.done', { name: a.name }))
                  }
                >
                  {t('art.take.in')}
                </AsyncButton>
              )}
              {a.mine && weaveShips(a) && <span className="small muted">{t('service.weave.ships')}</span>}
              {a.mine && a.kind === 'hints' && !weaveShips(a) && (
                <AsyncButton
                  onClick={async () =>
                    (await ask(takeInText(a, t('takein.hints.standard', { name: a.name })), t('service.take.it.in'))) &&
                    attempt(() => api('addHints', { project: a.project.id, app: a.app, tag: a.tag, approve: true }), t('takein.hints.done', { name: a.name }))
                  }
                >
                  {t('art.take.in')}
                </AsyncButton>
              )}
              {a.mine && a.kind !== 'file' && a.kind !== 'fetcher' && a.kind !== 'keyvault' && a.kind !== 'marks' && a.kind !== 'hints' && a.kind !== 'website' && <button onClick={() => setAdding(a)}>{t('art.add.to')}</button>}
              {/* Yours, beside Weave's own: approved once, pinned to what was released. */}
              {a.mine && (a.kind === 'fetcher' || a.kind === 'keyvault') && (
                <AsyncButton
                  onClick={async () =>
                    (await ask(t(a.kind === 'keyvault' ? 'art.add.keyvault.ask' : 'art.add.fetcher.ask', { name: a.name, tag: a.tag, project: a.project.name }), t('art.add.it'))) &&
                    attempt(() => api('addClientApp', { project: a.project.id, artifact: a.id, approve: true }).then(bump), t('art.yours.now', { name: a.name }))
                  }
                >
                  {t('art.add.to.keys')}
                </AsyncButton>
              )}
            </>
          ),
          ...(maintainer
            ? {
                tools: [{ icon: 'gear' as const, label: t('art.who.may.get'), run: () => setAccess(a) }],
                // Withdrawn: no longer listed, launched or handed out; who got it keeps what they have.
                remove: {
                  label: t('art.withdraw.this'),
                  run: () =>
                    void (async () =>
                      (await ask(t('art.withdraw.ask', { name: a.name, tag: a.tag, project: a.project.name }), t('art.withdraw'))) &&
                      attempt(() => api('withdrawArtifact', { project: a.project.id, artifact: a.id }).then(bump), t('art.withdrawn', { name: a.name, tag: a.tag })))(),
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
function LaunchDialog({ artifact, into, askedBy, onClose }: { artifact: ArtifactInfo; into?: string; askedBy?: string; onClose(): void }) {
  const { t } = useTexts();
  const { data: services } = useApi(() => api<ServiceInfo[]>('services'), []);
  // Where you host websites, here.
  const hosts = (services ?? []).filter((s) => (s.builtin === 'website' || s.contract.websites === 'host') && s.enabled && !s.node);
  const projects = [...new Map(hosts.flatMap((s) => s.spaces).filter((x) => x.kind === 'project').map((x) => [x.id, x])).values()];
  // An agent's request names the project to launch it in: picked already, still the person's to change.
  const [where, setWhere] = useState<string | undefined>(into);
  const [announce, setAnnounce] = useState(true);
  const project = projects.find((p) => p.id === (where ?? (projects.length === 1 ? projects[0].id : undefined)));
  const runs = artifact.command?.join(' ') ?? artifact.name;
  const [values, setValues] = useState<Record<string, string>>({});
  // A program: the warning comes first, and only its "Run this version" launches (with the consent it stands for).
  const [warning, setWarning] = useState(false);
  const launch = (consent: boolean) =>
    attempt(async () => {
      await api('launchWebsite', { project: project!.id, artifact: { project: artifact.project.id, id: artifact.id }, approve: true, ...(consent ? { consent: true } : {}), announce, settings: givenSettings(values) });
      bump();
      onClose();
      // Its Services: under Running websites it shows starting, then in Live once it serves its page.
      location.hash = `#/p/${project!.id}/services`;
    }, t('launch.launching', { name: artifact.name, project: project?.name }));
  if (warning) return <ProgramWarning artifact={artifact} onRun={() => launch(true)} onCancel={() => setWarning(false)} />;
  return (
    <Modal title={t('launch.title', { name: artifact.name, tag: artifact.tag })} onClose={onClose}>
      {/* Opened by one of the person's agents (weave_open_in_app website): why it's here, and that the click is theirs. */}
      {askedBy && <p className="notice">{t('launch.asked.by', { agent: askedBy, name: artifact.name })}</p>}
      {services && !projects.length ? (
        <p className="small">{t('launch.host.nowhere')}</p>
      ) : (
        <>
          <div className="field-row">
            <label htmlFor="launch-in">{t('launch.in')}</label>
            <select id="launch-in" className="grow" value={project?.id ?? ''} onChange={(e) => setWhere(e.target.value || undefined)}>
              <option value="">{t('launch.pick.project')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  p/{p.name}
                </option>
              ))}
            </select>
          </div>
          <p className="small">
            {t('launch.weave.runs')} <code>{runs}</code> {t('launch.from.release', { name: artifact.name, tag: artifact.tag, project: artifact.project.name, how: t(runsWords(artifact)) })}{' '}
            {t(project ? 'launch.makes.website.in' : 'launch.makes.website', { project: project?.name })}
          </p>
          <p className="small muted">{t('launch.trust', { project: artifact.project.name })}</p>
          <LaunchSettings artifact={artifact} values={values} onChange={setValues} />
          <div className="field-row">
            <input type="checkbox" id="launch-announce" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
            <label htmlFor="launch-announce">{t('launch.announce')}</label>
          </div>
        </>
      )}
      <div className="buttons">
        {artifact.runs === 'program' ? (
          <button className="default" disabled={!project || !settingsReady(artifact, values)} onClick={() => setWarning(true)}>
            {t('launch.button.ellipsis')}
          </button>
        ) : (
          <AsyncButton className="default" disabled={!project || !settingsReady(artifact, values)} onClick={() => launch(false)}>
            {t('launch.button')}
          </AsyncButton>
        )}
        <button onClick={onClose}>{t('button.cancel')}</button>
      </div>
    </Modal>
  );
}

/** How a release would run here, in words: in Weave, in a container, or as a program with your rights. */
const runsWords = (a: ArtifactInfo): string => (a.runs === 'wasm' ? 'launch.as.wasm' : a.runs === 'program' ? 'launch.as.program' : 'launch.in.container');

/**
 * The warning before a release's program runs: it runs on this computer with your rights, and Weave can't contain it;
 * who published it, the file and its SHA-256, where the release is. Cancel is the default. "Run this version" is your
 * consent to exactly this release and file (a new version asks again), kept until you withdraw it on the website.
 * Only this dialog gives it: no agent or service can.
 */
function ProgramWarning({ artifact, onRun, onCancel }: { artifact: ArtifactInfo; onRun(): Promise<unknown>; onCancel(): void }) {
  const { t } = useTexts();
  const program = artifact.program!;
  const by = artifact.released;
  const publisher = `${by.name ?? shortDid(by.did)}${by.agent ? ` · ${by.agent}` : ''} · p/${artifact.project.name}`;
  return (
    <Modal title={t('program.warning.title', { name: artifact.name, tag: artifact.tag })} onClose={onCancel}>
      <div className="notice alarm">
        <Icon name="warning" /> {t('program.warning.runs', { name: artifact.name })}
      </div>
      <p className="small">{t('program.warning.contain')}</p>
      <p className="small">
        <b>{t('program.published.by')}</b> {publisher} ·{' '}
        <a
          href={`#/p/${artifact.project.id}/services`}
          onClick={(e) => {
            e.preventDefault();
            onCancel();
            navigate(`#/p/${artifact.project.id}/services`);
          }}
        >
          {t('program.the.release', { tag: artifact.tag })}
        </a>
        <br />
        <b>{t('program.file')}</b> <code>{program.file}</code>
        {program.size ? ` · ${sizeText(program.size)}` : ''}
        <br />
        <b>{t('program.sha256')}</b> <code style={{ wordBreak: 'break-all' }}>{program.sha256}</code>
        <br />
        <b>{t('program.runs.command')}</b> <code>{program.command.join(' ')}</code>
      </p>
      <p className="small">{program.allowed ? t('program.allowed.before', { time: ago(program.allowed) }) : t('program.only.this.version')}</p>
      <p className="small muted">{t('program.never.alone')}</p>
      <div className="buttons">
        <button className="default" autoFocus onClick={onCancel}>
          {t('button.cancel')}
        </button>
        <AsyncButton onClick={onRun}>{t('program.run.this.version')}</AsyncButton>
      </div>
    </Modal>
  );
}

/** What a website asks for when it's launched (a key for the AI it talks to, say): kept for that website alone. */
function LaunchSettings({ artifact, values, onChange }: { artifact: ArtifactInfo; values: Record<string, string>; onChange(values: Record<string, string>): void }) {
  return (
    <>
      {artifact.settings.map((s) => (
        <SettingInput key={s.name} setting={s} value={values[s.name] ?? ''} onChange={(v) => onChange({ ...values, [s.name]: v })} texts={artifact.texts} />
      ))}
    </>
  );
}

const settingsReady = (artifact: ArtifactInfo, values: Record<string, string>) => artifact.settings.every((s) => s.optional || s.oauth || !!values[s.name]?.trim());
const givenSettings = (values: Record<string, string>) => Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));

/** Get a file artifact: its project's provider grants it, your fetcher gets it, Weave checks it; then show where it is. */
type FileJob = { progress?: { done: number; total?: number }; error?: string };

/** Get a file artifact (an installer: the one for this computer): how far it got while it comes, then where it is. */
function GetFileButton({ artifact }: { artifact: ArtifactInfo }) {
  const { t } = useTexts();
  const [got, setGot] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<FileJob>();
  useEffect(() => {
    if (!busy) return;
    const look = () => void api<FileJob | undefined>('artifactFileJob', { project: artifact.project.id, artifact: artifact.id }).then(setJob, () => {});
    look();
    const timer = setInterval(look, 700);
    return () => clearInterval(timer);
  }, [busy, artifact.project.id, artifact.id]);
  if (got && bridge.reveal) return <button onClick={() => void bridge.reveal!(got)}>{t('art.show.in.folder')}</button>;
  const progress = busy ? job?.progress : undefined;
  return (
    <>
      <AsyncButton
        onClick={() => {
          setBusy(true);
          return attempt(async () => {
            const { path } = await api<{ path: string; by: string }>('getArtifactFile', { project: artifact.project.id, artifact: artifact.id });
            setGot(path);
          }, t('art.is.here', { name: artifact.name })).finally(() => (setBusy(false), setJob(undefined)));
        }}
      >
        {t(busy ? 'art.getting' : 'art.get')}
      </AsyncButton>
      {progress && (
        <span className="small muted">
          {' '}
          {progress.total ? <progress max={progress.total} value={progress.done} /> : null} {progress.total ? `${Math.round((progress.done / progress.total) * 100)} %` : sizeText(progress.done)}
        </span>
      )}
    </>
  );
}

/** Who may get an artifact of the project (maintainers): everyone there, a board's readers, a group's members, maintainers, the owner. */
function ArtifactAccessDialog({ artifact, onClose }: { artifact: ArtifactInfo; onClose(): void }) {
  const { t } = useTexts();
  const project = artifact.project;
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: boards } = useApi(() => api<BoardInfo[]>('boards', project.id).catch(() => [] as BoardInfo[]), [project.id]);
  const groups = info?.groups ?? [];
  const options: ActionWho[] = ['members', ...(boards ?? []).map((b) => ({ board: b.name })), ...groups.map((g) => ({ group: g.id })), 'maintainers', 'owner'];
  const [who, setWho] = useState(JSON.stringify(artifact.who));
  return (
    <Modal title={t('art.access.title', { name: artifact.name, tag: artifact.tag })} onClose={onClose}>
      <div className="field-row">
        <label htmlFor="artifact-who">{t('art.who')}</label>
        <select id="artifact-who" className="grow" value={who} onChange={(e) => setWho(e.target.value)}>
          {options.map((w) => (
            <option key={JSON.stringify(w)} value={JSON.stringify(w)}>
              {whoLabel(w, `p/${project.name}`, groups)}
            </option>
          ))}
        </select>
      </div>
      <p className="small muted">{t(artifact.source?.provider === 'oci' ? 'art.access.image' : 'art.access.providers', { project: project.name })}</p>
      <div className="buttons">
        <AsyncButton
          className="default"
          onClick={() => attempt(() => api('setArtifactAccess', { project: project.id, artifact: artifact.id, who: who === '"members"' ? null : JSON.parse(who) }).then(() => (bump(), onClose())), t('art.access.set', { name: artifact.name }))}
        >
          {t('button.save')}
        </AsyncButton>
        <button onClick={onClose}>{t('button.cancel')}</button>
      </div>
    </Modal>
  );
}

/** Adding an artifact: to a project of yours as a service or website, or (a board view) to one of its boards. */
function AddArtifactDialog({ artifact, onClose }: { artifact: ArtifactInfo; onClose(): void }) {
  const { t } = useTexts();
  const { data: projects } = useApi(() => api<SpaceInfo[]>('spaces', 'project'), []);
  const [where, setWhere] = useState<string>();
  const project = (projects ?? []).find((p) => p.id === where);
  const { data: boards } = useApi(() => (artifact.lens && where ? api<BoardInfo[]>('boards', where) : Promise.resolve([] as BoardInfo[])), [where, artifact.lens]);
  const [board, setBoard] = useState<string>();
  const { data: info } = useApi(() => (where ? api<ProjectInfo>('project', where) : Promise.resolve(undefined)), [where]);
  return (
    <Modal title={t('art.add.title', { name: artifact.name })} onClose={onClose}>
      <div className="field-row">
        <label htmlFor="add-to-project">{t('word.project.cap')}</label>
        <select id="add-to-project" className="grow" value={where ?? ''} onChange={(e) => (setWhere(e.target.value || undefined), setBoard(undefined))}>
          <option value="">{t('art.pick.one')}</option>
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
            <label htmlFor="add-to-board">{t('word.board.cap')}</label>
            <select id="add-to-board" className="grow" value={board ?? ''} onChange={(e) => setBoard(e.target.value || undefined)}>
              <option value="">{t('art.pick.one')}</option>
              {(boards ?? []).map((b) => (
                <option key={b.name} value={b.name}>
                  {b.title}
                </option>
              ))}
            </select>
          </div>
          <p className="small muted">{t('art.board.through', { project: project.name })}</p>
          <div className="buttons">
            <AsyncButton
              className="default"
              disabled={!board}
              onClick={() => attempt(() => api('setBoardLens', { space: project.id, board, from: { project: artifact.project.id, tag: artifact.tag } }).then(() => (bump(), onClose())), t('art.shows.board', { name: artifact.name, board, project: project.name }))}
            >
              {t('art.add.to.board')}
            </AsyncButton>
          </div>
        </>
      )}
      {project && !artifact.lens && <InstallRelease project={project} maintainer={!!info?.maintainer} only={artifact.id} onDone={onClose} />}
      <div className="buttons">
        <button onClick={onClose}>{t('button.close')}</button>
      </div>
    </Modal>
  );
}

/** What a service provides here: its artifacts; maintainers publish more from where it reads them. */
function ServiceReleases({ project, artifacts, maintainer, publish }: { project: SpaceInfo; artifacts: ArtifactInfo[]; maintainer: boolean; publish?(): void }) {
  const { t } = useTexts();
  const [describing, setDescribing] = useState(false);
  return (
    <>
      <ArtifactList title={t('rel.released')} artifacts={artifacts} maintainer={maintainer} {...(publish ? { add: { label: t('rel.publish.a.release'), run: publish } } : {})} />
      {maintainer && !artifacts.length && !describing && (
        <p className="small muted">
          <a href="#" onClick={(e) => (e.preventDefault(), setDescribing(true))}>{t('rel.describe.link')}</a>
        </p>
      )}
      {describing && <PublishApp project={project} />}
    </>
  );
}

/** The kinds, in the order a project shows them; each has a heading (kinds.<kind>) and what it's for (kinds.<kind>.about). */
const KINDS: Array<ArtifactInfo['kind']> = ['website', 'service', 'board-view', 'file', 'fetcher', 'keyvault', 'marks', 'hints'];

/**
 * Everything a project offers, by kind: what each is, who hands it out (a provider here, or Weave pulling its image
 * itself), and what you can do with it. Maintainers see all of it, with who may get each, and publish more.
 */
export function ProjectAvailableView({ project }: { project: SpaceInfo }) {
  const { t } = useTexts();
  const { data: all } = useApi(() => api<ArtifactInfo[]>('artifacts', project.id), [project.id]);
  const { data: profiles } = useApi(() => api<ServiceProfileInfo[]>('servicesIn', project.id).catch(() => [] as ServiceProfileInfo[]), [project.id]);
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const [picking, setPicking] = useState(false);
  const maintainer = !!info?.maintainer;
  const shown = (all ?? []).filter((a) => a.mine || maintainer);
  // Who hands each out: a provider here, or Weave itself for an image.
  const via = (a: ArtifactInfo): string | undefined => {
    if (a.source?.provider === 'oci') return t('avail.weave.fetches.image');
    const provider = (profiles ?? []).find((s) => providesArtifact(s, a));
    if (provider) return t('avail.handed.out.by', { service: provider.name, person: provider.person.name ? ` (${provider.person.name})` : '' });
    return a.source ? t('avail.nothing.hands.out', { provider: a.source.provider }) : undefined;
  };
  return (
    <Page
      title={<><Icon name="store" /> {t('nav.available')} · p/{project.name}</>}
      actions={
        maintainer ? (
          <button onClick={() => setPicking(true)}>
            <Icon name="plus" /> {t('rel.publish.a.release.dots')}
          </button>
        ) : undefined
      }
    >
      {all && !shown.length && <p className="empty">{t(all.length ? 'avail.offers.nothing.you' : 'avail.offers.nothing', { project: project.name })}</p>}
      {KINDS.map((kind) => {
        const these = shown.filter((a) => a.kind === kind);
        if (!these.length) return null;
        return (
          <fieldset key={kind}>
            <legend>{t(`kinds.${kind}`)}</legend>
            <p className="small muted">{t(`kinds.${kind}.about`)}</p>
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
export function SettingInput({ setting, value, onChange, texts }: { setting: ArtifactInfo['settings'][number]; value: string; onChange(value: string): void; texts?: TextPackage[] }) {
  const { t } = useTexts();
  const { ts } = useServiceTexts(texts);
  const label = ts(`settings.${fieldName(setting.name)}.label`, setting.label);
  const hint = setting.hint ? ts(`settings.${fieldName(setting.name)}.hint`, setting.hint) : undefined;
  // A sign-in: nothing to type; its provider's page opens from its settings once it's installed.
  if (setting.oauth)
    return (
      <div className="app-setting">
        <label>{label}</label>
        <div className="small muted">{t('setting.sign.in.with', { site: new URL(setting.oauth.authorize ?? setting.oauth.device ?? setting.oauth.token).hostname })}</div>
      </div>
    );
  // An app of yours, made on the provider's page: right after it's added.
  if (setting.register)
    return (
      <div className="app-setting">
        <label>{label}</label>
        <div className="small muted">{t('setting.made.on', { site: new URL(setting.register.page).hostname })}</div>
      </div>
    );
  // Picked from what it lists (a repository its sign-in reaches): once it runs, right after it's added.
  if (setting.choose)
    return (
      <div className="app-setting">
        <label>{label}</label>
        <div className="small muted">{t(setting.choose.many ? 'setting.pick.them' : 'setting.pick.it', { from: hint ?? t('setting.picked.from.list') })}</div>
      </div>
    );
  return (
    <div className="app-setting">
      <label htmlFor={`setting-${setting.name}`}>
        {label}
        {setting.optional ? <span className="muted"> {t('setting.optional')}</span> : null}

      </label>
      <input id={`setting-${setting.name}`} className="wide" type={setting.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={value} placeholder={setting.name} onChange={(e) => onChange(e.target.value)} />
      {hint && <div className="small muted">{hint}</div>}
    </div>
  );
}

/**
 * Opening a website of your website service for a program you run yourself: its name and the port it listens on.
 * The website service starts nothing; services with a web page show up on their own.
 */
function OpenWebsiteDialog({ project, service, away, members, meDid, groups, shows, onClose }: { project: SpaceInfo; service: string; away?: string; members: MemberInfo[]; meDid: string; groups: ProjectInfo['groups']; shows: ShowInfo[]; onClose(): void }) {
  const { t } = useTexts();
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
  // What it shows: a website released in one of your projects (launched here), or a program of yours on a port.
  const released = useArtifacts(project);
  const launchable = away ? [] : (released ?? []).filter((a) => a.kind === 'website' && a.mine && a.runs);
  const [what, setWhat] = useState<string>();
  const picked = what === 'port' ? undefined : launchable.find((a) => a.id === what) ?? (what ? undefined : launchable[0]);
  // Until it's known what there is to launch, nothing below: the form for a port of yours would flash, then go.
  const looking = !released && !away && what !== 'port';
  const [values, setValues] = useState<Record<string, string>>({});
  const visitorsReady = !(who === 'people' && !people.length) && !(who === 'tiers' && !tiers.length);
  const ready = !looking && visitorsReady && (picked ? settingsReady(picked, values) : !!name.trim() && !!Number(port));
  // Who may visit, for opening it. A new show is set up first; if the website then fails, it's picked, not set up twice.
  const visitors = async (title: string) => {
    const made = who === 'tickets' && show === 'new' ? await newShow.create(title) : show;
    if (made === undefined) return undefined;
    if (made !== show) {
      setShow(made);
      // Selling tickets turns the project's payments on: its treasury and split show in Settings.
      if (!payments.on) payments.turn(true);
    }
    return who === 'people' ? { invite: people } : who === 'tickets' ? { show: made, ...(tiers.length ? { groups: tiers } : {}) } : who === 'tiers' ? { groups: tiers } : {};
  };
  // A program: its warning first; only "Run this version" there launches, with the consent it stands for.
  const [warning, setWarning] = useState(false);
  const launch = async (consent: boolean) => {
    setBusy(true);
    const access = await visitors(picked!.name);
    // Its show didn't come about: back to the form, where the price is.
    if (!access) {
      setWarning(false);
      return setBusy(false);
    }
    const done = await attempt(() => api('launchWebsite', { project: project.id, artifact: { project: picked!.project.id, id: picked!.id }, approve: true, ...(consent ? { consent: true } : {}), ...access, announce, settings: givenSettings(values) }), t('launch.launching', { name: picked!.name, project: project.name }));
    setBusy(false);
    // It shows under Running websites, starting (its release on the way), then in Live once it serves its page.
    if (done !== undefined) {
      bump();
      onClose();
    }
  };
  const open = async () => {
    if (picked) return picked.runs === 'program' ? setWarning(true) : launch(false);
    setBusy(true);
    const access = await visitors(name.trim());
    if (!access) return setBusy(false);
    const room = await attempt(() => api<WebsiteInfo>('openWebsite', { service, project: project.id, name: name.trim(), port: Number(port), ...access, announce }), t(away ? 'open.goes.to.node' : 'open.is.open', { name: name.trim(), node: away, port }));
    setBusy(false);
    if (room) {
      bump();
      onClose();
    }
  };
  if (warning && picked) return <ProgramWarning artifact={picked} onRun={() => launch(true)} onCancel={() => setWarning(false)} />;
  return (
    <Modal title={t('open.title', { project: project.name })} onClose={onClose} wide>
      <div className="form">
        <fieldset>
          <legend>{t('open.what.shows')}</legend>
          {!released && !away && <p className="small muted">{t('open.looking')}</p>}
          {launchable.map((a) => (
            <div className="field-row" key={a.id}>
              <input id={`what-${a.id}`} type="radio" checked={picked?.id === a.id} onChange={() => setWhat(a.id)} />
              <label htmlFor={`what-${a.id}`}>
                <span>
                  <b>{a.name}</b> {a.tag} <span className="muted small">· {t('open.released.in', { project: a.project.name })} · {t(a.runs === 'wasm' ? 'open.runs.in.weave' : a.runs === 'program' ? 'open.runs.as.program' : 'open.runs.in.container')}</span>
                </span>
              </label>
            </div>
          ))}
          <div className="field-row">
            <input id="what-port" type="radio" checked={!picked && !looking} onChange={() => setWhat('port')} />
            <label htmlFor="what-port">{t(away ? 'open.program.on.node' : 'open.program.here', { node: away })}</label>
          </div>
        </fieldset>
        {looking ? null : picked ? (
          <>
            <p className="small">{t('open.weave.runs', { name: picked.name, tag: picked.tag, from: picked.project.name, how: t(runsWords(picked)) })}</p>
            <p className="small muted">{t('launch.trust', { project: picked.project.name })}</p>
            <LaunchSettings artifact={picked} values={values} onChange={setValues} />
          </>
        ) : (
          <>
            <div className="field-row-stacked">
              <label htmlFor="room-name">{t('field.name')}</label>
              <input id="room-name" autoFocus maxLength={60} placeholder={t('open.name.placeholder')} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field-row-stacked">
              <label htmlFor="room-port">{t(away ? 'open.port.on.node' : 'open.port.here', { node: away })}</label>
              <input id="room-port" inputMode="numeric" placeholder="3000" value={port} onChange={(e) => setPort(e.target.value.replace(/\D/g, ''))} />
              <p className="small muted">{t('open.starts.nothing', { where: away ?? t('open.your.computer') })}</p>
            </div>
          </>
        )}
        {!looking && (
          <fieldset>
            <legend>{t('open.who.may.visit')}</legend>
            {(
              [
                ['everyone', t('who.everyone.in', { space: `p/${project.name}` })],
                ['people', t('open.only')],
                ['tickets', t('open.ticket.holders')],
                ...(groups.length ? [['tiers', t('open.members.of.tiers')]] : []),
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
                      <label htmlFor="who-show">{t('word.show.cap')}</label>
                      <select id="who-show" value={show} onChange={(e) => setShow(e.target.value)}>
                        {myShows.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                        <option value="new">{t('open.a.new.show')}</option>
                      </select>
                    </div>
                    {show === 'new' && <div className="indent">{newShow.fields}</div>}
                  </>
                )}
                {((who === 'tickets' && value === 'tickets') || (who === 'tiers' && value === 'tiers')) &&
                  groups.map((g) => (
                    <div className="field-row indent" key={g.id}>
                      <input id={`who-tier-${g.id}`} type="checkbox" checked={tiers.includes(g.id)} onChange={(e) => setTiers((t) => (e.target.checked ? [...t, g.id] : t.filter((x) => x !== g.id)))} />
                      <label htmlFor={`who-tier-${g.id}`}>{t(who === 'tickets' ? 'open.also.members.of' : 'web.members.of', { tier: g.name })}</label>
                    </div>
                  ))}
              </div>
            ))}
          </fieldset>
        )}
        <div className="field-row">
          <input type="checkbox" id="open-announce" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />
          <label htmlFor="open-announce">{t('launch.announce')}</label>
        </div>
        <div className="buttons">
          <button onClick={onClose}>{t('button.cancel')}</button>
          <button className="default" disabled={!ready || busy} onClick={() => void open()}>
            {t(busy ? (picked ? 'open.launching' : 'open.opening') : picked ? (picked.runs === 'program' ? 'launch.button.ellipsis' : 'launch.button') : 'open.button')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** How a website of your website service is doing, where it isn't answering yet. */
function HostedStatus({ hosted }: { hosted?: HostedWebsiteInfo }) {
  const { t } = useTexts();
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
          {t(hosted.progress.state === 'downloading' ? 'hosted.fetching' : 'hosted.unpacking')} {hosted.progress.total ? <progress max={hosted.progress.total} value={hosted.progress.done} /> : null}
        </>
      ) : (
        <span className="error-text">{hosted.error}</span>
      )}
    </p>
  );
}

/**
 * Your service that reaches a platform through your keyvault (its contract uses it), where that gives it nothing in this
 * project: no keyvault, no app in it, or nothing handed to the project. It then sees only what's public there, and says
 * only "not found", so this says why, with the step that's missing.
 */
function KeyvaultNote({ project, service }: { project: SpaceInfo; service: ServiceInfo }) {
  const { t } = useTexts();
  const platforms = Object.keys(service.contract.uses ?? service.update?.uses ?? {});
  const { data: vaults } = useApi(() => (platforms.length ? api<KeyvaultInfo[]>('keyvaults') : Promise.resolve([] as KeyvaultInfo[])), [platforms.join(' ')]);
  const [handing, setHanding] = useState<KeyvaultInfo>();
  if (!vaults) return null;
  const notes = platforms.flatMap((key) => {
    // Named as the keyvault names it (GitHub), added or not.
    const known = vaults.find((k) => k.platform.toLowerCase() === key.toLowerCase());
    const platform = known ? platformName(known) : key;
    const v = vaults.find((k) => k.platform.toLowerCase() === key.toLowerCase() && k.added);
    const what = v?.resources ?? t('kvnote.resources');
    if (!v)
      return [{ platform, text: t('kvnote.no.keyvault', { platform }), button: <button onClick={() => navigate('#/keys')}>{t('kvnote.keys')}</button> }];
    if (!v.apps.length) return [{ platform, text: t('kvnote.no.app', { vault: v.title, service: service.name, platform }), button: <button onClick={() => navigate('#/keys')}>{t('kvnote.keys')}</button> }];
    if (v.apps.some((a) => a.handed.some((h) => h.project.id === project.id && h.resources.length))) return [];
    return [{ platform, text: t('kvnote.hands.none', { vault: v.title, project: project.name, what, service: service.name, platform }), button: <button onClick={() => setHanding(v)}>{t('kvnote.hand', { what })}</button> }];
  });
  if (!notes.length) return null;
  return (
    <>
      {notes.map((n) => (
        <div className="small" key={n.platform}>
          <span className="error-text">{t('kvnote.no.access', { platform: n.platform })}</span> {n.text} {n.button}
        </div>
      ))}
      {handing && <HandDialog vault={handing} project={{ id: project.id, name: project.name }} onClose={() => (setHanding(undefined), bump())} />}
    </>
  );
}

/** What a service is there for, in a project. */
/** A service that hosts its projects' websites: Weave's built-in one, or one whose contract says so (the shipped Websites). */
const hostsSites = (s: ServiceProfileInfo): boolean => s.builtin === 'website' || s.contract.websites === 'host';

const purpose = (s: ServiceProfileInfo, ts: (path: string, literal: string) => string): string => (s.builtin === 'website' ? t('psvc.website.purpose') : ts('about', s.description));

/** One service in the project: what it's for, and what it offers here (a website service: its websites). */
function ServiceSection({ project, service, rooms, shows, mine, meDid, members, groups, maintainer, artifacts, boards }: { project: SpaceInfo; service: ServiceProfileInfo; rooms: WebsiteInfo[]; shows: ShowInfo[]; mine?: ServiceInfo; meDid: string; members: MemberInfo[]; groups: ProjectInfo['groups']; maintainer: boolean; artifacts: ArtifactInfo[]; boards: string[] }) {
  const { t } = useTexts();
  const { ts } = useServiceTexts(service.texts);
  const [opening, setOpening] = useState(false);
  const [asking, setAsking] = useState(false);
  const [setting, setSetting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const own = service.person.did === meDid;
  const by = service.person.name ?? shortDid(service.person.did);
  const its = rooms.filter((r) => r.offeredBy?.did === service.did);
  const extras: ScopedAction[] = [
    // Asking it in words: only a service one talks to (no actions, list or page of its own: those are how one uses it).
    ...(!hostsSites(service) && service.contract.reads !== 'nothing' && !service.contract.actions?.length && !service.contract.offers?.length ? [{ key: 'ask', label: t('psvc.ask', { name: service.name }), who: 'members' as const, mine: true, run: () => setAsking(true), withoutPage: true as const }] : []),
  ];
  return (
    <fieldset className="project-service">
      <legend className="service-title">
        <Icon name={serviceIcon(service)} /> {service.name} <span className="muted small">· {by}</span> <OriginBadge origin={service.origin} />
        {/* The same for every service: its settings (maintainers), and taking it out of the project (whoever runs it). */}
        {maintainer && service.builtin !== 'website' && (
          <button className="icon-button" title={t('nav.settings')} onClick={() => setSetting(true)}>
            <Icon name="gear" />
          </button>
        )}
        {own && mine && (
          <button
            className="icon-button"
            title={t('psvc.take.out.of', { project: project.name })}
            onClick={() =>
              void (async () =>
                (await ask(t(its.length ? 'psvc.take.out.ask.websites' : 'psvc.take.out.ask', { name: service.name, project: project.name }), t('psvc.take.it.out'))) &&
                attempt(() => api('setService', { name: mine.name, spaces: mine.spaces.filter((s) => s.id !== project.id).map((s) => s.id) }).then(bump), t('psvc.left', { name: service.name, project: project.name })))()
            }
          >
            <Icon name="trash" />
          </button>
        )}
      </legend>
      {purpose(service, ts) && <p className="small">{purpose(service, ts)}</p>}
      <OriginText origin={service.origin} />
      {own && mine?.update && <ShippedUpdate service={mine} />}
      {own && mine && <KeyvaultNote project={project} service={mine} />}
      {/* What it hosts: running website artifacts, listed by Weave (they run in Live). */}
      {hostsSites(service) && <RunningWebsites project={project} service={service} rooms={its} launching={(mine?.launching ?? []).filter((l) => l.project.id === project.id)} shows={shows} maintainer={maintainer} {...(own && mine ? { open: () => setOpening(true) } : {})} />}
      {!!service.contract.offers?.includes('artifact.fetch') && <ServiceReleases project={project} artifacts={artifacts.filter((a) => a.project.id === project.id && providesArtifact(service, a))} maintainer={maintainer} {...(maintainer && publishesReleases(service) ? { publish: () => setPublishing(true) } : {})} />}
      {hostsSites(service) && own && !mine && <p className="small muted">{t('psvc.runs.elsewhere')}</p>}
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
function RunningWebsites({ project, service, rooms, launching, shows, maintainer, open }: { project: SpaceInfo; service: ServiceProfileInfo; rooms: WebsiteInfo[]; launching: NonNullable<ServiceInfo['launching']>; shows: ShowInfo[]; maintainer: boolean; open?(): void }) {
  const { t } = useTexts();
  // Launched, not serving yet: starting (its release on the way), or why it can't. Stopping it ends the launch.
  useEffect(() => {
    if (!launching.some((l) => !l.error)) return;
    const timer = setInterval(bump, 1000);
    return () => clearInterval(timer);
  }, [launching.length, launching.some((l) => !l.error)]);
  const starting = launching.map((l) => ({
    key: l.id,
    title: l.name,
    badge: l.tag,
    detail: [
      l.error ?? (l.progress ? t('run.starting.progress', { state: l.progress.state, percent: l.progress.total ? `${Math.round((l.progress.done / l.progress.total) * 100)}%` : '' }).trim() : t('run.starting')),
      // Launched before its tag was released again: it starts what it was launched from; the new one is a new launch.
      ...(l.replaced ? [t('run.released.again', { tag: l.tag })] : []),
    ].join(' · '),
    remove: { label: t('run.stop.it'), run: () => void attempt(() => api('removeService', l.id).then(bump), t('run.is.stopped', { name: l.name })) },
  }));
  const visitors = (room: WebsiteInfo) => {
    const who = whoFor(room, shows);
    return who.length ? t('run.for.list', { who }) : t(room.open ? 'run.for.everyone' : 'run.for.invited');
  };
  const close = (room: WebsiteInfo) =>
    void (async () =>
      (await ask(t('web.close.ask', { name: room.name }), t('web.close'))) &&
      attempt(() => (room.mine ? api('closeWebsite', room.id) : askAndWait(project.id, service, 'close', { id: room.id }, t('run.close.name', { name: room.name }))).then(bump), t('web.closed')))();
  return (
    <ItemList
      title={t('run.title')}
      {...(open ? { add: { label: t('open.button'), run: open } } : {})}
      empty={t('run.none.yet')}
      rows={[...starting, ...rooms.map((room) => ({
        key: room.id,
        title: room.name,
        detail: [room.from ? `${room.from.name ?? t('web.a.release')} ${room.from.tag}${room.from.project.name && room.from.project.id !== project.id ? ` ${t('web.from.project', { project: room.from.project.name })}` : ''}` : '', visitors(room), t('run.opened.by', { by: room.host.name ?? shortDid(room.host.did) })].filter(Boolean).join(' · '),
        main: <button onClick={() => navigate(`#/p/${project.id}/live`)}>{t('web.visit')}</button>,
        ...(room.mine || maintainer ? { remove: { label: t('web.close'), run: () => close(room) } } : {}),
      }))]}
    />
  );
}

/**
 * Installing a project's release as a service in this project: what it runs is shown and approved here, once per
 * release. One with a web page serves it as a website here (by the website service); one with a contract does what it says.
 */
export function InstallRelease({ project, maintainer, only, onDone }: { project: SpaceInfo; maintainer: boolean; only?: string; onDone(): void }) {
  const { t } = useTexts();
  const artifacts = useArtifacts(project);
  const [picked, setPicked] = useState<string | undefined>(only);
  const [values, setValues] = useState<Record<string, string>>({});
  // Its settings kept in the project, for its maintainers to change (rather than only on this computer).
  const [keep, setKeep] = useState(maintainer);
  const [busy, setBusy] = useState(false);
  const usable = (artifacts ?? []).filter((a) => a.runs && a.kind === 'service');
  const chosen = usable.find((a) => a.id === picked);
  useEffect(() => setValues({}), [chosen?.id]);
  const missing = chosen?.settings.filter((s) => !s.optional && !s.oauth && !values[s.name]?.trim()) ?? [];
  if (!artifacts) return <p className="small">{t('catalog.looking.releases')}</p>;
  if (!usable.length) return <p className="small muted">{t('install.nothing.runs')}</p>;
  const install = async () => {
    setBusy(true);
    const settings = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
    await attempt(
      () => api<ServiceInfo>('addService', { artifact: { project: chosen!.project.id, tag: chosen!.tag }, spaces: [project.id], settings, approve: true, ...(keep && maintainer ? { settingsIn: project.id } : {}) }).then(() => (bump(), onDone())),
      t(chosen!.website ? 'install.runs.as.service.website' : 'install.runs.as.service', { name: chosen!.name, project: project.name }),
    );
    setBusy(false);
  };
  return (
    <fieldset>
      {!only && <legend>{t('install.title')}</legend>}
      {!only && usable.map((a) => (
        <div className="field-row" key={a.id}>
          <input id={`artifact-${a.id}`} type="radio" checked={chosen?.id === a.id} onChange={() => setPicked(a.id)} />
          <label htmlFor={`artifact-${a.id}`}>
            <span>
              <b>{a.name}</b> {a.tag}{' '}
              <span className="muted small">
                · p/{a.project.name} · {t(a.packaged ? 'install.a.weave.service' : a.website ? 'install.a.website' : 'install.a.service')} · {t('install.released.by', { time: a.time, by: a.released.name ?? shortDid(a.released.did) })}
              </span>
            </span>
          </label>
        </div>
      ))}
      {chosen && (
        <>
          {chosen.settings.map((s) => <SettingInput key={s.name} setting={s} value={values[s.name] ?? ''} onChange={(v) => setValues((x) => ({ ...x, [s.name]: v }))} texts={chosen.texts} />)}
          {maintainer && chosen.settings.length > 0 && (
            <div className="field-row small">
              <input id={`keep-${project.id}`} type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              <label htmlFor={`keep-${project.id}`}>{t('install.keep.settings', { project: project.name })}</label>
            </div>
          )}
          <div className="approve-launch">
            <Icon name="warning" size={32} />
            <div>
              <p>{t(chosen.packaged ? 'install.will.run.sandbox' : chosen.runs === 'container' ? 'install.will.run.container' : 'install.will.run.wasm', { name: chosen.name, tag: chosen.tag, project: chosen.project.name })}</p>
              <pre className="launch-command">{(chosen.command ?? []).join(' ')}</pre>
              <p className="small">{t('install.trust', { project: chosen.project.name, signs: chosen.applet ? contractText(chosen.applet) : t('install.signs.nothing') })}</p>
            </div>
          </div>
          <div className="buttons">
            <button className="default" disabled={missing.length > 0 || busy} title={missing.length ? t('catalog.fill.in', { fields: missing.map((m) => m.label) }) : undefined} onClick={() => void install()}>
              {t(busy ? 'catalog.installing' : 'catalog.run.as.service')}
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
  const { t } = useTexts();
  const { data: rooms } = useApi(() => api<WebsiteInfo[]>('websites', project.id), [project.id]);
  const { data: services } = useApi(() => api<ServiceInfo[]>('services').catch(() => [] as ServiceInfo[]), []);
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: shows } = useApi(() => api<ShowInfo[]>('shows', project.id), [project.id]);
  const [opening, setOpening] = useState(false);
  // Yours that host websites here: you open websites for programs of yours through it.
  const host = (services ?? []).find((s) => (s.builtin === 'website' || s.contract.websites === 'host') && !s.node && s.spaces.some((x) => x.id === project.id));
  return (
    <Page
      title={<><Icon name="globe" /> {t('nav.live')} · p/{project.name}</>}
      actions={
        host ? (
          <button onClick={() => setOpening(true)}>
            <Icon name="plus" /> {t('open.button.dots')}
          </button>
        ) : undefined
      }
    >
      {rooms && !rooms.length && <p className="empty">{t('live.nothing.running', { project: project.name })}</p>}
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
/** What an agent asked to open here (weave_open_in_app service): a project's services, one of them or something to pick in the catalog. Taken by the view once it shows. */
let wanted: { project: string; service?: string; askedBy?: string } | undefined;
const wantedListeners = new Set<() => void>();

export function openServices(request: { project: string; service?: string; askedBy?: string }): void {
  wanted = request;
  for (const listener of wantedListeners) listener();
}

/** A launch an agent asked for (weave_open_in_app website): a release, and the project to launch it in. Taken by that project's services view once it shows. */
let wantedLaunch: { project: string; release: { project: string; id: string }; askedBy?: string } | undefined;

export function openLaunch(request: { project: string; release: { project: string; id: string }; askedBy?: string }): void {
  wantedLaunch = request;
  for (const listener of wantedListeners) listener();
}

export function ProjectServicesView({ project, members, meDid, focus }: { project: SpaceInfo; members: MemberInfo[]; meDid: string; focus?: string }) {
  const { t } = useTexts();
  const { data: rooms } = useApi(() => api<WebsiteInfo[]>('websites', project.id), [project.id]);
  const { data: profiles } = useApi(() => api<ServiceProfileInfo[]>('servicesIn', project.id).catch(() => [] as ServiceProfileInfo[]), [project.id]);
  const { data: services } = useApi(() => api<ServiceInfo[]>('services').catch(() => [] as ServiceInfo[]), []);
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: shows } = useApi(() => api<ShowInfo[]>('shows', project.id), [project.id]);
  const { data: artifacts } = useApi(() => api<ArtifactInfo[]>('artifacts', project.id), [project.id]);
  const [adding, setAdding] = useState<{ pick?: string; askedBy?: string } | false>(false);
  const { data: boards } = useApi(() => api<BoardInfo[]>('boards', project.id).catch(() => [] as BoardInfo[]), [project.id]);
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    const listener = () => setAsked((n) => n + 1);
    wantedListeners.add(listener);
    return () => void wantedListeners.delete(listener);
  }, []);
  // An agent's request: one of the project's services alone, or the catalog with something picked; the rest is the person's to click.
  useEffect(() => {
    if (!wanted || wanted.project !== project.id || !profiles) return;
    const request = wanted;
    wanted = undefined;
    const name = request.service?.toLowerCase();
    const running = name && profiles.find((s) => s.did === request.service || s.name.toLowerCase() === name);
    if (running) return navigate(`${spaceHref(project)}/services/${running.did}`);
    setAdding({ ...(request.service ? { pick: request.service } : {}), ...(request.askedBy ? { askedBy: request.askedBy } : {}) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profiles, asked, project.id]);
  // An agent's request to launch a release here: its Launch dialog, filled in; launching it is the person's click.
  const [launching, setLaunching] = useState<{ artifact: ArtifactInfo; askedBy?: string }>();
  useEffect(() => {
    if (!wantedLaunch || wantedLaunch.project !== project.id) return;
    const request = wantedLaunch;
    wantedLaunch = undefined;
    void api<ArtifactInfo[]>('artifacts', request.release.project).then(
      (released) => {
        const artifact = released.find((a) => a.id === request.release.id);
        if (artifact) setLaunching({ artifact, ...(request.askedBy ? { askedBy: request.askedBy } : {}) });
        else toast(t('launch.asked.gone'), 'error');
      },
      (error: Error) => toast(error.message, 'error'),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asked, project.id]);

  // Room services first, then the rest.
  // Websites that are only that run in Live.
  const all = [...(profiles ?? [])].filter((s) => !onlyAWebsite(s.contract)).sort((a, b) => Number(hostsSites(b)) - Number(hostsSites(a)));
  // One picked in the sidebar: that one alone.
  const list = focus ? all.filter((s) => s.did === focus) : all;
  return (
    <Page
      title={list.length === 1 && focus ? <><Icon name={serviceIcon(list[0])} /> {list[0].name} · p/{project.name}</> : <><Icon name="zap" /> {t('nav.services')} · p/{project.name}</>}
      actions={
        <button onClick={() => setAdding({})}>
          <Icon name="plus" /> {t('svc.add.a.service')}
        </button>
      }
    >
      {profiles && !list.length && <p className="empty">{t('psvc.none.yet', { project: project.name })}</p>}
      {list.map((s) => (
        <ServiceSection key={s.did} project={project} service={s} rooms={rooms ?? []} shows={shows ?? []} mine={(services ?? []).find((x) => x.did === s.did)} meDid={meDid} members={members} groups={info?.groups ?? []} maintainer={!!info?.maintainer} artifacts={artifacts ?? []} boards={(boards ?? []).map((b) => b.name)} />
      ))}
      {!focus && (artifacts ?? []).some((a) => a.project.id === project.id) && (
        <p className="small">
          <a href={`#/p/${project.id}/available`}>{t('psvc.everything.offers', { project: project.name })}</a>
        </p>
      )}
      {adding && <ServiceCatalog project={project} services={services ?? []} maintainer={!!info?.maintainer} {...(adding.pick ? { pick: adding.pick } : {})} {...(adding.askedBy ? { askedBy: adding.askedBy } : {})} onClose={() => setAdding(false)} />}
      {launching && <LaunchDialog artifact={launching.artifact} into={project.id} {...(launching.askedBy ? { askedBy: launching.askedBy } : {})} onClose={() => setLaunching(undefined)} />}
    </Page>
  );
}
