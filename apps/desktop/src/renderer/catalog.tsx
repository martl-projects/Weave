import { useEffect, useState } from 'react';
import type { ArtifactInfo, CatalogEntryInfo, ServiceInfo, SpaceInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bump, shortDid, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Modal } from './ui.tsx';
import { Page } from './views.tsx';
import { contractText } from './services.tsx';
import { useTexts } from './texts.tsx';

/*
 * A space's catalog: the Weave services its maintainers list there. Installing one reads what it is from its image
 * (the catalog only points at it), shows what it would run and may do, and asks for your yes and its settings.
 */

const prefix = (s: SpaceInfo) => (s.kind === 'project' ? 'p/' : s.kind === 'community' ? 'r/' : '');

export function CatalogView({ space, maintainer }: { space: SpaceInfo; maintainer: boolean }) {
  const { t } = useTexts();
  const { data: entries } = useApi(() => api<CatalogEntryInfo[]>('catalog', space.id), [space.id]);
  const [installing, setInstalling] = useState<CatalogEntryInfo>();
  const [listing, setListing] = useState(false);
  return (
    <Page
      title={
        <>
          <Icon name="bookmark" /> {t('catalog.title', { space: `${prefix(space)}${space.name}` })}
        </>
      }
      actions={
        maintainer ? (
          <button onClick={() => setListing(true)}>
            <Icon name="plus" /> {t('catalog.list.release')}
          </button>
        ) : undefined
      }
    >
      {entries && !entries.length && <p className="empty">{t(maintainer ? 'catalog.empty.maintainer' : 'catalog.empty')}</p>}
      {(entries ?? []).map((e) => (
        <div className="install-box" key={e.app}>
          <span className="grow">
            <b>{e.name}</b> {e.image.tag}
            <span className="muted small"> {t('catalog.listed.by', { name: e.by.name ?? shortDid(e.by.did), time: e.time })}</span>
            {e.summary && <div className="small">{e.summary}</div>}
            <div className="small muted">{t('catalog.from', { project: e.origin.project.name ? `p/${e.origin.project.name}` : t('origin.project.unknown'), tag: e.origin.tag, image: `${e.image.ref}@${e.image.digest.slice(7, 19)}` })}</div>
          </span>
          {e.installed ? (
            <span className="small muted">{t('catalog.runs.as', { name: e.installed })}</span>
          ) : (
            <button className="default" onClick={() => setInstalling(e)}>
              {t('catalog.install')}
            </button>
          )}
          {maintainer && (
            <AsyncButton onClick={async () => (await ask(t('catalog.take.off.ask', { name: e.name }), t('tier.take.off'))) && attempt(() => api('unlistFromCatalog', { catalog: space.id, app: e.app }).then(bump), t('catalog.off', { name: e.name }))}>
              {t('catalog.take.off')}
            </AsyncButton>
          )}
        </div>
      ))}
      {installing && <InstallFromCatalog space={space} entry={installing} onClose={() => setInstalling(undefined)} />}
      {listing && <ListInCatalog space={space} onClose={() => setListing(false)} />}
    </Page>
  );
}

/** Installing a catalog entry: what its image says it runs and may do, its settings, and where it goes. */
export function InstallFromCatalog({ space, entry, onClose }: { space: SpaceInfo; entry: CatalogEntryInfo; onClose(): void }) {
  const { t } = useTexts();
  const [artifact, setArtifact] = useState<ArtifactInfo>();
  const [problem, setProblem] = useState<string>();
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const [where, setWhere] = useState<string[]>(space.kind === 'project' ? [space.id] : []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<ArtifactInfo>('catalogArtifact', { catalog: space.id, app: entry.app }).then(setArtifact, (e: Error) => setProblem(e.message));
  }, [space.id, entry.app]);
  const missing = artifact?.settings.filter((s) => !s.optional && !s.oauth && !values[s.name]?.trim()) ?? [];
  const install = async () => {
    setBusy(true);
    const settings = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
    const done = await attempt(() => api<ServiceInfo>('addService', { from: { catalog: space.id, app: entry.app }, spaces: where, settings, approve: true }), t(artifact?.website ? 'catalog.installed.website' : 'catalog.installed', { name: entry.name }));
    setBusy(false);
    if (done) {
      bump();
      onClose();
    }
  };
  return (
    <Modal title={t('catalog.install.title', { name: entry.name })} onClose={onClose} wide>
      <div className="form">
        {problem && <p className="error-text">{problem}</p>}
        {!artifact && !problem && <p className="small">{t('catalog.reading.image')}</p>}
        {artifact && (
          <>
            <p className="small">{t('catalog.it.does', { contract: artifact.applet ? contractText(artifact.applet) : t('catalog.reads.nothing'), website: artifact.website ? t('catalog.serves.website') : '' })}</p>
            <fieldset>
              <legend>{t('catalog.where.works')}</legend>
              {(spaces ?? [])
                .filter((s) => !s.closed)
                .map((s) => (
                  <div className="field-row" key={s.id}>
                    <input id={`where-${s.id}`} type="checkbox" checked={where.includes(s.id)} onChange={(e) => setWhere((w) => (e.target.checked ? [...w, s.id] : w.filter((x) => x !== s.id)))} />
                    <label htmlFor={`where-${s.id}`}>
                      {prefix(s)}
                      {s.name}
                    </label>
                  </div>
                ))}
            </fieldset>
            {artifact.settings.map((s) => (
              <div className="app-setting" key={s.name}>
                <label htmlFor={`setting-${s.name}`}>
                  {s.label}
                  {s.optional ? <span className="muted"> {t('setting.optional')}</span> : null}
                </label>
                <input id={`setting-${s.name}`} className="wide" type={s.secret ? 'password' : 'text'} autoComplete="off" spellCheck={false} value={values[s.name] ?? ''} placeholder={s.name} onChange={(e) => setValues((x) => ({ ...x, [s.name]: e.target.value }))} />
                {s.hint && <div className="small muted">{s.hint}</div>}
              </div>
            ))}
            <div className="approve-launch">
              <Icon name="warning" size={32} />
              <div>
                {artifact.runs ? (
                  <>
                    <p>{t('catalog.will.run', { name: entry.name, tag: entry.image.tag })}</p>
                    <pre className="launch-command">{(artifact.command ?? []).join(' ')}</pre>
                  </>
                ) : (
                  <p>{t('catalog.docker.off')}</p>
                )}
                <p className="small">{t('catalog.trust', { lister: entry.by.name ?? t('catalog.a.maintainer'), whom: entry.origin.project.name ? t('catalog.people.of', { project: entry.origin.project.name }) : t('catalog.whoever.released') })}</p>
              </div>
            </div>
          </>
        )}
        <div className="buttons">
          <button onClick={onClose}>{t('button.cancel')}</button>
          <button className="default" disabled={!artifact?.runs || missing.length > 0 || busy} title={missing.length ? t('catalog.fill.in', { fields: missing.map((m) => m.label) }) : undefined} onClick={() => void install()}>
            {t(busy ? 'catalog.installing' : 'catalog.run.as.service')}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Listing a Weave service (maintainers): a release of a project you're in, with a line about it. */
function ListInCatalog({ space, onClose }: { space: SpaceInfo; onClose(): void }) {
  const { t } = useTexts();
  const { data: releases } = useApi(async () => {
    const projects = await api<SpaceInfo[]>('spaces', 'project');
    const lists = await Promise.all(projects.map((p) => api<ArtifactInfo[]>('artifacts', p.id).catch(() => [] as ArtifactInfo[])));
    return lists.flat().filter((a) => a.packaged);
  }, []);
  const [picked, setPicked] = useState<string>();
  const [summary, setSummary] = useState('');
  const chosen = releases?.find((a) => a.id === picked);
  return (
    <Modal title={t('catalog.list.title', { space: `${prefix(space)}${space.name}` })} onClose={onClose}>
      <div className="form">
        {!releases ? (
          <p className="small">{t('catalog.looking.releases')}</p>
        ) : !releases.length ? (
          <p className="small muted">{t('catalog.no.releases')}</p>
        ) : (
          releases.map((a) => (
            <div className="field-row" key={a.id}>
              <input id={`list-${a.id}`} type="radio" checked={picked === a.id} onChange={() => setPicked(a.id)} />
              <label htmlFor={`list-${a.id}`}>
                <span>
                  <b>{a.name}</b> {a.tag} <span className="muted small">· p/{a.project.name}</span>
                </span>
              </label>
            </div>
          ))
        )}
        <input className="wide" maxLength={500} placeholder={t('catalog.good.for')} value={summary} onChange={(e) => setSummary(e.target.value)} />
        <div className="buttons">
          <button onClick={onClose}>{t('button.cancel')}</button>
          <AsyncButton
            className="default"
            disabled={!chosen}
            onClick={async () => {
              if (!chosen) return;
              const done = await attempt(() => api('listInCatalog', { catalog: space.id, artifact: { project: chosen.project.id, tag: chosen.tag }, summary }), t('catalog.listed', { name: chosen.name }));
              if (done !== undefined) {
                bump();
                onClose();
              }
            }}
          >
            {t('catalog.list.it')}
          </AsyncButton>
        </div>
      </div>
    </Modal>
  );
}
