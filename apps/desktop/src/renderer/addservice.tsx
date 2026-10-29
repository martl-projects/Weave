import { useState } from 'react';
import type { ArtifactInfo, CatalogEntryInfo, ServiceInfo, ShippedServiceInfo, SpaceInfo } from '@weave/node/client';
import type { AppSetting, ServiceContract } from '@weave/core';
import { InstallFromCatalog } from './catalog.tsx';
import { Icon, type IconName } from './icons.tsx';
import { api, bump, useApi } from './lib.ts';
import { contractText, KeptSettingsDialog } from './services.tsx';
import { attempt, AsyncButton, Modal } from './ui.tsx';
import { InstallRelease, SettingInput, useArtifacts } from './websites.tsx';

/*
 * Adding a service to a project: one catalog of everything that can come here, each with its icon and who it's by.
 * Weave's own (what it ships and runs itself), what your spaces' catalogs list, what projects you're in released for
 * this computer, and your own services elsewhere. Picking one shows what it does and asks for its settings.
 */

/** An icon for a service, by what it is: its kind, or its name. */
export function serviceIcon(s: { name: string; builtin?: string; contract?: ServiceContract }): IconName {
  const name = s.name.toLowerCase();
  if (s.builtin === 'website' || s.contract?.website || s.contract?.websites === 'host') return 'globe';
  if (s.builtin === 'github' || name.includes('github')) return 'github';
  if (/s3|storage|bucket|backup/.test(name)) return 'database';
  if (/file|drive|docs/.test(name)) return 'folder';
  if (s.contract?.offers?.length) return 'download';
  return 'plug';
}

interface Entry {
  key: string;
  icon: IconName;
  title: string;
  by: string;
  about: string;
  /** A mark of where it's from: ships with Weave, verified. */
  badge?: string;
  open(): void;
}

type Picked =
  | { kind: 'shipped'; shipped: ShippedServiceInfo }
  | { kind: 'builtin'; builtin: 'website' }
  | { kind: 'release'; artifact: ArtifactInfo }
  | { kind: 'mine'; service: ServiceInfo };

const BUILTINS = {
  website: { title: 'Websites', about: "A way to join in with the project's participants: services with a web page show up as websites here, and so can programs of yours." },
} as const;

export function ServiceCatalog({ project, services, maintainer, onClose }: { project: SpaceInfo; services: ServiceInfo[]; maintainer: boolean; onClose(): void }) {
  const { data: shipped } = useApi(() => api<ShippedServiceInfo[]>('shippedServices').catch(() => [] as ShippedServiceInfo[]), []);
  const { data: listed } = useApi(async () => {
    const spaces = await api<SpaceInfo[]>('spaces');
    const lists = await Promise.all(spaces.filter((s) => s.kind !== 'direct').map((s) => api<CatalogEntryInfo[]>('catalog', s.id).then((l) => l.map((e) => ({ e, s }))).catch(() => [])));
    return lists.flat();
  }, []);
  const artifacts = useArtifacts(project);
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<Picked>();
  const [fromCatalog, setFromCatalog] = useState<{ space: SpaceInfo; entry: CatalogEntryInfo }>();
  const here = (s: ServiceInfo) => s.spaces.some((x) => x.id === project.id);

  const entries: Entry[] = [
    ...(shipped ?? [])
      .filter((x) => !services.some((s) => s.shipped === x.name) && !(x.contract.websites === 'host' && services.some((s) => s.builtin === 'website' && s.spaces.some((sp) => sp.id === project.id))))
      .map((x): Entry => ({ key: `shipped:${x.name}`, icon: serviceIcon({ name: x.name, contract: x.contract }), title: x.title, by: 'Weave', about: x.about ?? `It ${contractText(x.contract)}`, badge: 'ships with Weave', open: () => setPicked({ kind: 'shipped', shipped: x }) })),
    ...(['website'] as const)
      // Websites ship with Weave now: the built-in one only where this Weave ships none.
      .filter((b) => !services.some((s) => s.builtin === b) && !(b === 'website' && (shipped ?? []).some((x) => x.contract.websites === 'host')))
      .map((b): Entry => ({ key: `builtin:${b}`, icon: serviceIcon({ name: b, builtin: b }), title: BUILTINS[b].title, by: 'Weave', about: BUILTINS[b].about, badge: 'built into Weave', open: () => setPicked({ kind: 'builtin', builtin: b }) })),
    ...(listed ?? [])
      .filter(({ e }) => !e.installed)
      .map(({ e, s }): Entry => ({ key: `catalog:${s.id}:${e.app}`, icon: serviceIcon({ name: e.app }), title: e.name, by: e.origin.project.name ? `p/${e.origin.project.name}` : (e.by.name ?? 'a project'), about: e.summary || `Listed in ${s.name}`, badge: `in ${s.name}'s catalog`, open: () => setFromCatalog({ space: s, entry: e }) })),
    ...(artifacts ?? [])
      .filter((a) => a.runs && (a.website || a.applet))
      .map((a): Entry => ({ key: `release:${a.id}`, icon: serviceIcon({ name: a.name, contract: a.applet }), title: `${a.name} ${a.tag}`, by: `p/${a.project.name}`, about: a.applet ? `It ${contractText(a.applet)}` : 'A website', badge: 'a release', open: () => setPicked({ kind: 'release', artifact: a }) })),
    ...services
      .filter((s) => !s.node && !here(s) && s.builtin !== 'github')
      .map((s): Entry => ({ key: `mine:${s.name}`, icon: serviceIcon(s), title: s.name, by: 'you', about: s.description || `It ${contractText(s.contract)}`, badge: 'yours, elsewhere', open: () => setPicked({ kind: 'mine', service: s }) })),
  ];
  const shown = entries.filter((e) => !query.trim() || `${e.title} ${e.by} ${e.about}`.toLowerCase().includes(query.trim().toLowerCase()));
  const loading = !shipped || !listed || !artifacts;

  if (fromCatalog) return <InstallFromCatalog space={fromCatalog.space} entry={fromCatalog.entry} onClose={onClose} />;
  return (
    <Modal title={`Add a service · p/${project.name}`} onClose={onClose} wide>
      {!picked ? (
        <>
          <div className="field-row">
            <Icon name="search" />
            <input className="grow" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Find a service…" autoFocus />
          </div>
          <div className="service-catalog">
            {shown.map((e) => (
              <button key={e.key} className="service-tile" onClick={e.open}>
                <Icon name={e.icon} size={32} />
                <span className="service-tile-text">
                  <b>{e.title}</b>
                  <span className="small muted">by {e.by}</span>
                  <span className="small service-tile-about">{e.about}</span>
                  {e.badge && <span className="small service-tile-badge">{e.badge}</span>}
                </span>
              </button>
            ))}
          </div>
          {loading && <p className="small muted">Looking for services…</p>}
          {!loading && !shown.length && <p className="small muted">{query ? 'Nothing matches.' : `Everything there is runs in p/${project.name} already.`}</p>}
          <p className="small muted">
            A service you add reads what's addressed to it here, as in its other spaces, and so could carry things between them: add it only where you'd trust it with that. Your own code becomes a service in{' '}
            <a href="#/keys">Keys &amp; devices → Services</a>.
          </p>
        </>
      ) : (
        <ServiceDetails project={project} picked={picked} maintainer={maintainer} onBack={() => setPicked(undefined)} onDone={onClose} />
      )}
      <div className="buttons">
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

/** One picked from the catalog: what it is, does and asks for, and adding it. */
function ServiceDetails({ project, picked, maintainer, onBack, onDone }: { project: SpaceInfo; picked: Picked; maintainer: boolean; onBack(): void; onDone(): void }) {
  const added = (what: string) => () => (bump(), onDone(), what);
  // Added, with a sign-in or a pick still to make (its repository, say): its settings right away.
  const [setUp, setSetUp] = useState<ServiceInfo>();
  if (setUp) return <KeptSettingsDialog space={{ id: project.id, name: `p/${project.name}` }} service={{ did: setUp.did, name: setUp.name }} onClose={() => (bump(), onDone())} />;
  const head = (icon: IconName, title: string, by: string, about: string) => (
    <div className="service-details-head">
      <Icon name={icon} size={32} />
      <span>
        <b>{title}</b> <span className="small muted">by {by}</span>
        <div className="small">{about}</div>
      </span>
    </div>
  );
  return (
    <div className="service-details">
      <button onClick={onBack}>← All services</button>
      {picked.kind === 'shipped' && (
        <>
          {head(serviceIcon({ name: picked.shipped.name, contract: picked.shipped.contract }), picked.shipped.title, 'Weave', picked.shipped.about ?? '')}
          <SettingsForm
            project={project}
            maintainer={maintainer}
            contract={picked.shipped.contract}
            note="Weave runs it only as exactly the component it ships."
            settings={picked.shipped.settings}
            add={(settings, keep) =>
              attempt(
                () =>
                  api<ServiceInfo>('addService', { shipped: picked.shipped.name, spaces: [project.id], settings, ...(keep ? { settingsIn: project.id } : {}) }).then((service) => {
                    if (keep && picked.shipped.settings.some((s) => (s.oauth || s.choose) && !settings[s.name])) setSetUp(service);
                    else added('')();
                  }),
                `${picked.shipped.title} runs in p/${project.name}`,
              )
            }
          />
        </>
      )}
      {picked.kind === 'builtin' && (
        <>
          {head(serviceIcon({ name: picked.builtin, builtin: picked.builtin }), BUILTINS[picked.builtin].title, 'Weave', BUILTINS[picked.builtin].about)}
          <p className="small muted">Built into Weave: your node runs it itself.</p>
          <div className="buttons">
            <AsyncButton className="default" onClick={() => attempt(() => api('addService', { builtin: picked.builtin, spaces: [project.id] }).then(added('')), `${BUILTINS[picked.builtin].title} is on in p/${project.name}`)}>
              Add to p/{project.name}
            </AsyncButton>
          </div>
        </>
      )}
      {picked.kind === 'release' && (
        <>
          {head(serviceIcon({ name: picked.artifact.name, contract: picked.artifact.applet }), `${picked.artifact.name} ${picked.artifact.tag}`, `p/${picked.artifact.project.name}`, picked.artifact.applet ? `It ${contractText(picked.artifact.applet)}` : 'A website')}
          <InstallRelease project={project} maintainer={maintainer} only={picked.artifact.id} onDone={onDone} />
        </>
      )}
      {picked.kind === 'mine' && (
        <>
          {head(serviceIcon(picked.service), picked.service.name, 'you', picked.service.description || `It ${contractText(picked.service.contract)}`)}
          <div className="buttons">
            <AsyncButton
              className="default"
              onClick={() => attempt(() => api('setService', { name: picked.service.name, spaces: [...picked.service.spaces.map((x) => x.id), project.id] }).then(added('')), `${picked.service.name} is in p/${project.name}`)}
            >
              Add to p/{project.name}
            </AsyncButton>
          </div>
        </>
      )}
    </div>
  );
}

/** What it may do, the settings it asks for, and whether they're kept in the project (for its maintainers). */
function SettingsForm({ project, maintainer, contract, note, settings, add }: { project: SpaceInfo; maintainer: boolean; contract: ServiceContract; note: string; settings: AppSetting[]; add(settings: Record<string, string>, keep: boolean): Promise<unknown> }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [keep, setKeep] = useState(maintainer);
  const missing = settings.filter((s) => !s.optional && !s.oauth && !s.choose && !values[s.name]?.trim());
  return (
    <>
      <p className="small muted">
        It {contractText(contract)}. {note}
      </p>
      {settings.map((s) => (
        <SettingInput key={s.name} setting={s} value={values[s.name] ?? ''} onChange={(v) => setValues((x) => ({ ...x, [s.name]: v }))} />
      ))}
      {maintainer && settings.length > 0 && (
        <div className="field-row small">
          <input id="keep-settings" type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          <label htmlFor="keep-settings">Keep its settings in p/{project.name}, for its maintainers to change (a secret sealed for the service alone)</label>
        </div>
      )}
      <div className="buttons">
        <AsyncButton className="default" disabled={missing.length > 0} onClick={() => add(Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])), keep && maintainer)}>
          Add to p/{project.name}
        </AsyncButton>
      </div>
    </>
  );
}
