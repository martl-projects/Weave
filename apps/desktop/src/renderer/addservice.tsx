import { useState } from 'react';
import type { ArtifactInfo, CatalogEntryInfo, ServiceInfo, ServiceOriginInfo, ShippedServiceInfo, SpaceInfo } from '@weave/node/client';
import type { AppSetting, ServiceContract } from '@weave/core';
import { InstallFromCatalog } from './catalog.tsx';
import { Icon, isIconName, type IconName } from './icons.tsx';
import { SetupPackDialog } from './packs.tsx';
import type { Pack } from '@weave/core';
import { api, bump, useApi } from './lib.ts';
import { contractText, KeptSettingsDialog } from './services.tsx';
import { attempt, AsyncButton, Modal } from './ui.tsx';
import { InstallRelease, SettingInput, useArtifacts } from './websites.tsx';
import { useTexts } from './texts.tsx';

/*
 * Adding a service to a project: one catalog of everything that can come here, each with its icon and who it's by.
 * Weave's own (what it ships and runs itself), what your spaces' catalogs list, what projects you're in released for
 * this computer, and your own services elsewhere. Picking one shows what it does and asks for its settings.
 */

/**
 * An icon for a service, by what it is: its kind, the platform it uses or hands out from (where Weave has its icon), or
 * its name. A platform's icon only for one Weave ships (as checked): anyone else's could look like it otherwise.
 */
export function serviceIcon(s: { name: string; builtin?: string; shipped?: string; origin?: ServiceOriginInfo; contract?: ServiceContract }): IconName {
  const name = s.name.toLowerCase();
  if (s.builtin === 'website' || s.contract?.website || s.contract?.websites === 'host') return 'globe';
  const weaves = !!s.builtin || !!s.shipped || (s.origin?.kind === 'shipped' && s.origin.checked === 'verified');
  const platform = weaves ? [...Object.keys(s.contract?.uses ?? {}), ...(s.contract?.sources ?? [])].find(isIconName) : undefined;
  if (platform) return platform;
  if (/s3|storage|bucket|backup/.test(name)) return 'database';
  if (/file|drive|docs/.test(name)) return 'folder';
  if (s.contract?.offers?.length) return 'download';
  return 'plug';
}

interface Entry {
  key: string;
  icon: IconName;
  heading: string;
  by: string;
  about: string;
  /** A mark of where it's from: ships with Weave, verified. */
  badge?: string;
  /** Where it comes from: each source its own card, never mixed with another's. */
  source: Source;
  open(): void;
}

/** A catalog of services, by where they come from: Weave, a project's releases, a space's catalog, or yours elsewhere. */
interface Source {
  key: string;
  heading: string;
  /** Why (and how far) to trust what's in it. */
  note: string;
  rank: number;
}

type Picked =
  | { kind: 'shipped'; shipped: ShippedServiceInfo }
  | { kind: 'builtin'; builtin: 'website' }
  | { kind: 'release'; artifact: ArtifactInfo }
  | { kind: 'mine'; service: ServiceInfo };

export function ServiceCatalog({ project, services, maintainer, onClose }: { project: SpaceInfo; services: ServiceInfo[]; maintainer: boolean; onClose(): void }) {
  const { t } = useTexts();
  const { data: shipped } = useApi(() => api<ShippedServiceInfo[]>('shippedServices').catch(() => [] as ShippedServiceInfo[]), []);
  const { data: packs } = useApi(() => api<Pack[]>('setupPacks').catch(() => [] as Pack[]), []);
  const [packing, setPacking] = useState<Pack>();
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

  const FROM_WEAVE: Source = { key: 'weave', heading: t('addservice.from.weave'), note: t('addservice.from.weave.note'), rank: 0 };
  const YOURS: Source = { key: 'mine', heading: t('addservice.yours'), note: t('addservice.yours.note'), rank: 3 };
  const fromProject = (p: { id: string; name: string }, here: string): Source => ({ key: `project:${p.id}`, heading: t('addservice.from.project', { project: p.name }), note: t('addservice.from.project.note', { project: p.name }), rank: p.id === here ? 1 : 1.5 });
  const inCatalog = (s: SpaceInfo): Source => ({ key: `catalog:${s.id}`, heading: t('addservice.in.catalog', { space: s.name }), note: t('addservice.in.catalog.note', { space: s.name }), rank: 2 });
  const websites = { heading: t('addservice.websites'), about: t('addservice.websites.about') };

  const entries: Entry[] = [
    // Setup packs first: several parts set up in a few clicks (GitHub: its keyvault, app and services).
    ...(packs ?? []).map((p): Entry => ({ key: `pack:${p.name}`, icon: 'zap', heading: p.title, by: 'Weave', about: p.about ?? t('addservice.steps', { n: p.steps.length }), badge: t('addservice.setup.steps', { n: p.steps.length }), source: FROM_WEAVE, open: () => setPacking(p) })),
    ...(shipped ?? [])
      .filter((x) => !services.some((s) => s.shipped === x.name && here(s)) && !(x.contract.websites === 'host' && services.some((s) => s.builtin === 'website' && here(s))))
      .map((x): Entry => {
        // One you run elsewhere already: it's still Weave's, and adding it here takes that one in.
        const mine = services.find((s) => s.shipped === x.name && !s.node);
        return { key: `shipped:${x.name}`, icon: serviceIcon({ name: x.name, shipped: x.name, contract: x.contract }), heading: x.title, by: 'Weave', about: x.about ?? t('service.it.does', { contract: contractText(x.contract) }), badge: t(mine ? 'addservice.weave.yours.elsewhere' : 'origin.weave'), source: FROM_WEAVE, open: () => setPicked(mine ? { kind: 'mine', service: mine } : { kind: 'shipped', shipped: x }) };
      }),
    ...(['website'] as const)
      // Websites ship with Weave now: the built-in one only where this Weave ships none.
      .filter((b) => !services.some((s) => s.builtin === b) && !(b === 'website' && (shipped ?? []).some((x) => x.contract.websites === 'host')))
      .map((b): Entry => ({ key: `builtin:${b}`, icon: serviceIcon({ name: b, builtin: b }), heading: websites.heading, by: 'Weave', about: websites.about, badge: t('origin.weave'), source: FROM_WEAVE, open: () => setPicked({ kind: 'builtin', builtin: b }) })),
    ...(listed ?? [])
      .filter(({ e }) => !e.installed)
      .map(({ e, s }): Entry => ({ key: `catalog:${s.id}:${e.app}`, icon: serviceIcon({ name: e.app }), heading: e.name, by: e.origin.project.name ? `p/${e.origin.project.name}` : (e.by.name ?? t('addservice.a.project')), about: e.summary || t('addservice.listed.in', { space: s.name }), source: inCatalog(s), open: () => setFromCatalog({ space: s, entry: e }) })),
    ...(artifacts ?? [])
      // Websites aren't services to add: the Websites service launches them, each until it's closed.
      .filter((a) => a.runs && a.kind === 'service')
      .map((a): Entry => ({ key: `release:${a.id}`, icon: serviceIcon({ name: a.name, contract: a.applet }), heading: `${a.name} ${a.tag}`, by: `p/${a.project.name}`, about: a.applet ? t('service.it.does', { contract: contractText(a.applet) }) : t('addservice.a.website'), source: fromProject(a.project, project.id), open: () => setPicked({ kind: 'release', artifact: a }) })),
    ...services
      // What Weave ships stays under From Weave, also where you run it already.
      .filter((s) => !s.node && !here(s) && s.builtin !== 'github' && !s.shipped)
      .map((s): Entry => ({ key: `mine:${s.name}`, icon: serviceIcon(s), heading: s.name, by: t('actor.you'), about: s.description || t('service.it.does', { contract: contractText(s.contract) }), source: YOURS, open: () => setPicked({ kind: 'mine', service: s }) })),
  ];
  const shown = entries.filter((e) => !query.trim() || `${e.heading} ${e.by} ${e.about}`.toLowerCase().includes(query.trim().toLowerCase()));
  // Each source its own card: what Weave ships never beside what a project released, nor one project's beside another's.
  const sources = [...new Map(shown.map((e) => [e.source.key, e.source])).values()].sort((a, b) => a.rank - b.rank || a.heading.localeCompare(b.heading));
  const loading = !shipped || !listed || !artifacts;

  if (fromCatalog) return <InstallFromCatalog space={fromCatalog.space} entry={fromCatalog.entry} onClose={onClose} />;
  if (packing) return <SetupPackDialog project={project} pack={packing} onClose={onClose} />;
  return (
    <Modal title={t('addservice.title', { project: project.name })} onClose={onClose} wide>
      {!picked ? (
        <>
          <div className="field-row">
            <Icon name="search" />
            <input className="grow" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('addservice.find')} autoFocus />
          </div>
          {sources.map((src) => (
            <fieldset key={src.key} className="catalog-source">
              <legend>{src.heading}</legend>
              <p className="small muted">{src.note}</p>
              <div className="service-catalog">
                {shown
                  .filter((e) => e.source.key === src.key)
                  .map((e) => (
                    <button key={e.key} className="service-tile" onClick={e.open}>
                      <Icon name={e.icon} size={32} />
                      <span className="service-tile-text">
                        <b>{e.heading}</b>
                        <span className="small muted">{t('addservice.by', { by: e.by })}</span>
                        <span className="small service-tile-about">{e.about}</span>
                        {e.badge && <span className="small service-tile-badge">{e.badge}</span>}
                      </span>
                    </button>
                  ))}
              </div>
            </fieldset>
          ))}
          {loading && <p className="small muted">{t('addservice.looking')}</p>}
          {!loading && !shown.length && <p className="small muted">{query ? t('addservice.nothing.matches') : t('addservice.all.run', { project: project.name })}</p>}
          <p className="small muted">
            {t('addservice.trust.note')} <a href="#/keys">{t('addservice.keys.services')}</a>.
          </p>
        </>
      ) : (
        <ServiceDetails project={project} picked={picked} maintainer={maintainer} websites={websites} onBack={() => setPicked(undefined)} onDone={onClose} />
      )}
      <div className="buttons">
        <button onClick={onClose}>{t('button.close')}</button>
      </div>
    </Modal>
  );
}

/** One picked from the catalog: what it is, does and asks for, and adding it. */
function ServiceDetails({ project, picked, maintainer, websites, onBack, onDone }: { project: SpaceInfo; picked: Picked; maintainer: boolean; websites: { heading: string; about: string }; onBack(): void; onDone(): void }) {
  const { t } = useTexts();
  const added = (what: string) => () => (bump(), onDone(), what);
  // Added, with a sign-in or a pick still to make (its repository, say): its settings right away.
  const [setUp, setSetUp] = useState<ServiceInfo>();
  if (setUp) return <KeptSettingsDialog space={{ id: project.id, name: `p/${project.name}` }} service={{ did: setUp.did, name: setUp.name }} onClose={() => (bump(), onDone())} />;
  const head = (icon: IconName, heading: string, by: string, about: string) => (
    <div className="service-details-head">
      <Icon name={icon} size={32} />
      <span>
        <b>{heading}</b> <span className="small muted">{t('addservice.by', { by })}</span>
        <div className="small">{about}</div>
      </span>
    </div>
  );
  return (
    <div className="service-details">
      <button onClick={onBack}>{t('addservice.all.services')}</button>
      {picked.kind === 'shipped' && (
        <>
          {head(serviceIcon({ name: picked.shipped.name, shipped: picked.shipped.name, contract: picked.shipped.contract }), picked.shipped.title, 'Weave', picked.shipped.about ?? '')}
          <SettingsForm
            project={project}
            maintainer={maintainer}
            contract={picked.shipped.contract}
            note={t('addservice.shipped.note')}
            settings={picked.shipped.settings}
            add={(settings, keep) =>
              attempt(
                () =>
                  api<ServiceInfo>('addService', { shipped: picked.shipped.name, spaces: [project.id], settings, ...(keep ? { settingsIn: project.id } : {}) }).then((service) => {
                    if (keep && picked.shipped.settings.some((s) => (s.oauth || s.choose || s.register) && !settings[s.name])) setSetUp(service);
                    else added('')();
                  }),
                t('addservice.runs.in', { name: picked.shipped.title, project: project.name }),
              )
            }
          />
        </>
      )}
      {picked.kind === 'builtin' && (
        <>
          {head(serviceIcon({ name: picked.builtin, builtin: picked.builtin }), websites.heading, 'Weave', websites.about)}
          <p className="small muted">{t('addservice.builtin.note')}</p>
          <div className="buttons">
            <AsyncButton className="default" onClick={() => attempt(() => api('addService', { builtin: picked.builtin, spaces: [project.id] }).then(added('')), t('addservice.is.on.in', { name: websites.heading, project: project.name }))}>
              {t('addservice.add.to', { project: project.name })}
            </AsyncButton>
          </div>
        </>
      )}
      {picked.kind === 'release' && (
        <>
          {head(serviceIcon({ name: picked.artifact.name, contract: picked.artifact.applet }), `${picked.artifact.name} ${picked.artifact.tag}`, `p/${picked.artifact.project.name}`, picked.artifact.applet ? t('service.it.does', { contract: contractText(picked.artifact.applet) }) : t('addservice.a.website'))}
          <InstallRelease project={project} maintainer={maintainer} only={picked.artifact.id} onDone={onDone} />
        </>
      )}
      {picked.kind === 'mine' && (
        <>
          {head(serviceIcon(picked.service), picked.service.name, t('actor.you'), picked.service.description || t('service.it.does', { contract: contractText(picked.service.contract) }))}
          <div className="buttons">
            <AsyncButton className="default" onClick={() => attempt(() => api('setService', { name: picked.service.name, spaces: [...picked.service.spaces.map((x) => x.id), project.id] }).then(added('')), t('addservice.is.in', { name: picked.service.name, project: project.name }))}>
              {t('addservice.add.to', { project: project.name })}
            </AsyncButton>
          </div>
        </>
      )}
    </div>
  );
}

/** What it may do, the settings it asks for, and whether they're kept in the project (for its maintainers). */
function SettingsForm({ project, maintainer, contract, note, settings, add }: { project: SpaceInfo; maintainer: boolean; contract: ServiceContract; note: string; settings: AppSetting[]; add(settings: Record<string, string>, keep: boolean): Promise<unknown> }) {
  const { t } = useTexts();
  const [values, setValues] = useState<Record<string, string>>({});
  const [keep, setKeep] = useState(maintainer);
  const missing = settings.filter((s) => !s.optional && !s.oauth && !s.choose && !s.register && !values[s.name]?.trim());
  return (
    <>
      <p className="small muted">
        {t('service.it.does', { contract: contractText(contract) })} {note}
      </p>
      {settings.map((s) => (
        <SettingInput key={s.name} setting={s} value={values[s.name] ?? ''} onChange={(v) => setValues((x) => ({ ...x, [s.name]: v }))} />
      ))}
      {maintainer && settings.length > 0 && (
        <div className="field-row small">
          <input id="keep-settings" type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          <label htmlFor="keep-settings">{t('addservice.keep.settings', { project: project.name })}</label>
        </div>
      )}
      <div className="buttons">
        <AsyncButton className="default" disabled={missing.length > 0} onClick={() => add(Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()])), keep && maintainer)}>
          {t('addservice.add.to', { project: project.name })}
        </AsyncButton>
      </div>
    </>
  );
}
