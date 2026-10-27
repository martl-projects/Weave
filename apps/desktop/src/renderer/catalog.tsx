import { useEffect, useState } from 'react';
import type { ArtifactInfo, CatalogEntryInfo, ServiceInfo, SpaceInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bump, shortDid, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Modal } from './ui.tsx';
import { Page } from './views.tsx';
import { contractText } from './services.tsx';

/*
 * A space's catalog: the Weave services its maintainers list there. Installing one reads what it is from its image
 * (the catalog only points at it), shows what it would run and may do, and asks for your yes and its settings.
 */

const prefix = (s: SpaceInfo) => (s.kind === 'project' ? 'p/' : s.kind === 'community' ? 'r/' : '');

export function CatalogView({ space, maintainer }: { space: SpaceInfo; maintainer: boolean }) {
  const { data: entries } = useApi(() => api<CatalogEntryInfo[]>('catalog', space.id), [space.id]);
  const [installing, setInstalling] = useState<CatalogEntryInfo>();
  const [listing, setListing] = useState(false);
  return (
    <Page
      title={<><Icon name="bookmark" /> Catalog · {prefix(space)}{space.name}</>}
      actions={maintainer ? <button onClick={() => setListing(true)}><Icon name="plus" /> List a release…</button> : undefined}
    >
      {entries && !entries.length && <p className="empty">{maintainer ? 'Nothing listed yet: list a Weave service a project of yours released, and everyone here can install it.' : 'Nothing listed here yet.'}</p>}
      {(entries ?? []).map((e) => (
        <div className="install-box" key={e.app}>
          <span className="grow">
            <b>{e.name}</b> {e.image.tag}
            <span className="muted small"> · listed by {e.by.name ?? shortDid(e.by.did)} {ago(e.time)}</span>
            {e.summary && <div className="small">{e.summary}</div>}
            <div className="small muted">
              From {e.origin.project.name ? `p/${e.origin.project.name}` : "a project you aren't in"}, release {e.origin.tag} · {e.image.ref}@{e.image.digest.slice(7, 19)}
            </div>
          </span>
          {e.installed ? <span className="small muted">Runs here as {e.installed}</span> : <button className="default" onClick={() => setInstalling(e)}>Install…</button>}
          {maintainer && (
            <AsyncButton onClick={async () => (await ask(`Take ${e.name} off the catalog? Those who installed it keep it.`, 'Take it off')) && attempt(() => api('unlistFromCatalog', { catalog: space.id, app: e.app }).then(bump), `${e.name} is off the catalog`)}>
              Take off
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
function InstallFromCatalog({ space, entry, onClose }: { space: SpaceInfo; entry: CatalogEntryInfo; onClose(): void }) {
  const [artifact, setArtifact] = useState<ArtifactInfo>();
  const [problem, setProblem] = useState<string>();
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const [where, setWhere] = useState<string[]>(space.kind === 'project' ? [space.id] : []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<ArtifactInfo>('catalogArtifact', { catalog: space.id, app: entry.app }).then(setArtifact, (e: Error) => setProblem(e.message));
  }, [space.id, entry.app]);
  const missing = artifact?.settings.filter((s) => !s.optional && !values[s.name]?.trim()) ?? [];
  const install = async () => {
    setBusy(true);
    const settings = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()).map(([k, v]) => [k, v.trim()]));
    const done = await attempt(() => api<ServiceInfo>('addService', { from: { catalog: space.id, app: entry.app }, spaces: where, settings, approve: true }), `${entry.name} runs here now${artifact?.website ? ': its website opens in its projects' : ''}`);
    setBusy(false);
    if (done) {
      bump();
      onClose();
    }
  };
  return (
    <Modal title={`Install ${entry.name}`} onClose={onClose} wide>
      <div className="form">
        {problem && <p className="error-text">{problem}</p>}
        {!artifact && !problem && <p className="small">Reading what it is from its image…</p>}
        {artifact && (
          <>
            <p className="small">
              It {artifact.applet ? contractText(artifact.applet) : 'reads and writes nothing'}
              {artifact.website ? ', and serves a website in the projects you add it to' : ''}. It gets a key of its own with exactly those rights.
            </p>
            <fieldset>
              <legend>Where it works</legend>
              {(spaces ?? []).filter((s) => !s.closed).map((s) => (
                <div className="field-row" key={s.id}>
                  <input id={`where-${s.id}`} type="checkbox" checked={where.includes(s.id)} onChange={(e) => setWhere((w) => (e.target.checked ? [...w, s.id] : w.filter((x) => x !== s.id)))} />
                  <label htmlFor={`where-${s.id}`}>{prefix(s)}{s.name}</label>
                </div>
              ))}
            </fieldset>
            {artifact.settings.map((s) => (
              <div className="app-setting" key={s.name}>
                <label htmlFor={`setting-${s.name}`}>
                  {s.label}
                  {s.optional ? <span className="muted"> (optional)</span> : null}
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
                    <p>Weave will run {entry.name} {entry.image.tag} in its sandbox: a container that can't change its own files or reach yours, with limits on memory and CPU, and a folder of its own for what it keeps:</p>
                    <pre className="launch-command">{(artifact.command ?? []).join(' ')}</pre>
                  </>
                ) : (
                  <p>It runs in a container, and Docker isn't running on this computer: start Docker first.</p>
                )}
                <p className="small">
                  What it is comes from its image, pinned by its digest; {entry.by.name ?? 'a maintainer'} only listed it. Only install it if you trust {entry.origin.project.name ? `the people of p/${entry.origin.project.name}` : 'whoever released it'}. Weave asks again for another release.
                </p>
              </div>
            </div>
          </>
        )}
        <div className="buttons">
          <button onClick={onClose}>Cancel</button>
          <button className="default" disabled={!artifact?.runs || missing.length > 0 || busy} title={missing.length ? `Fill in ${missing.map((m) => m.label).join(', ')} first` : undefined} onClick={() => void install()}>
            {busy ? 'Installing…' : 'Run it as a service'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/** Listing a Weave service (maintainers): a release of a project you're in, with a line about it. */
function ListInCatalog({ space, onClose }: { space: SpaceInfo; onClose(): void }) {
  const { data: releases } = useApi(async () => {
    const projects = await api<SpaceInfo[]>('spaces', 'project');
    const lists = await Promise.all(projects.map((p) => api<ArtifactInfo[]>('artifacts', p.id).catch(() => [] as ArtifactInfo[])));
    return lists.flat().filter((a) => a.packaged);
  }, []);
  const [picked, setPicked] = useState<string>();
  const [summary, setSummary] = useState('');
  const chosen = releases?.find((a) => a.id === picked);
  return (
    <Modal title={`List a release · ${prefix(space)}${space.name}`} onClose={onClose}>
      <div className="form">
        {!releases ? (
          <p className="small">Looking for releases…</p>
        ) : !releases.length ? (
          <p className="small muted">No project you're in has released a Weave service yet (weave service release).</p>
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
        <input className="wide" maxLength={500} placeholder="What it's good for (optional)" value={summary} onChange={(e) => setSummary(e.target.value)} />
        <div className="buttons">
          <button onClick={onClose}>Cancel</button>
          <AsyncButton
            className="default"
            disabled={!chosen}
            onClick={async () => {
              if (!chosen) return;
              const done = await attempt(() => api('listInCatalog', { catalog: space.id, artifact: { project: chosen.project.id, tag: chosen.tag }, summary }), `${chosen.name} is listed`);
              if (done !== undefined) {
                bump();
                onClose();
              }
            }}
          >
            List it
          </AsyncButton>
        </div>
      </div>
    </Modal>
  );
}
