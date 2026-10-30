import { useEffect, useState } from 'react';
import type { KeyvaultInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bump, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Modal } from './ui.tsx';
import { ItemList } from './lists.tsx';

/**
 * In Keys & devices: your keyvaults. Each holds your access to a platform (your GitHub App); your services get only
 * short-lived access derived from it, cut to what their contracts declare and to what you handed each project here.
 * Only you hand anything to a project.
 */
export function KeyvaultsBox() {
  const { data: vaults } = useApi(() => api<KeyvaultInfo[]>('keyvaults'), []);
  const [handing, setHanding] = useState<{ vault: KeyvaultInfo; project: { id: string; name: string }; resources: string[] }>();
  if (!vaults?.length) return null;
  return (
    <fieldset>
      <legend>Keyvaults</legend>
      <p className="small">
        Your access to other platforms, kept here. Your services hold none of it: they get short-lived access derived from it, only with the rights their contracts declare, and only for what you hand each
        project. Nobody else hands anything of yours to a project.
      </p>
      {vaults.map((v) => {
        const app = v.apps[0];
        const appSetting = v.settings.find((s) => s.register);
        const what = v.resources ?? 'resources';
        // The projects it matters for: where your services that use it run, and where you handed something.
        const projects = [...new Map([...v.users.flatMap((u) => u.projects), ...v.handed.map((h) => h.project)].map((p) => [p.id, p])).values()];
        return (
          <div className="keyvault" key={v.name}>
            <div className="service-row">
              <Icon name="lock" />
              <div className="grow">
                <b>{v.title}</b> {!v.added && <span className="small muted">not added</span>}
                {v.about && <div className="small">{v.about}</div>}
                {v.problem && <div className="small error-text">{v.problem}</div>}
              </div>
              <div className="service-actions">
                {!v.added ? (
                  <AsyncButton className="default" onClick={() => attempt(() => api('addKeyvault', { shipped: v.name }).then(bump), `${v.title} is added`)}>
                    Add
                  </AsyncButton>
                ) : (
                  <AsyncButton onClick={async () => (await ask(`Remove ${v.title}? Your services lose the access they get through it, and what you handed projects is forgotten. Your app stays on ${v.platform} until you delete it there.`, 'Remove')) && attempt(() => api('removeKeyvault', v.name).then(bump), `${v.title} is removed`)}>
                    Remove
                  </AsyncButton>
                )}
              </div>
            </div>
            {v.added && (
              <div className="keyvault-body">
                {/* Its app, and what it hands to projects: lists like every service's. */}
                <ItemList
                  title="Your app"
                  empty={appSetting?.hint ?? 'None yet.'}
                  {...(!app && appSetting
                    ? {
                        add: {
                          label: `Make ${appSetting.label.charAt(0).toLowerCase() + appSetting.label.slice(1)} on ${new URL(appSetting.register!.page).hostname}`,
                          run: () =>
                            void attempt(async () => {
                              const { id, url } = await api<{ id: string; url: string }>('startKeyvaultApp', { name: v.name, setting: appSetting.name });
                              window.open(url, '_blank', 'noopener');
                              await api('finishKeyvaultApp', { id });
                              bump();
                            }, `${appSetting.label} is made: install it on your ${what}`),
                        },
                      }
                    : {})}
                  rows={v.apps.map((a) => ({
                    key: a.setting,
                    icon: 'lock' as const,
                    title: (
                      <a href={String(a.info.html_url ?? '')} target="_blank" rel="noopener noreferrer">
                        {String(a.info.slug ?? a.info.id)}
                      </a>
                    ),
                    search: String(a.info.slug ?? ''),
                    detail: `${a.info['owner.login'] ? `${String(a.info['owner.login'])}'s · ` : ''}its key stays sealed on this computer`,
                    ...(a.next ? { main: <button onClick={() => window.open(a.next, '_blank', 'noopener')}>Install on more {what}…</button> } : {}),
                  }))}
                />
                <ItemList
                  title="Handed to projects"
                  empty={`None yet: add a service that uses it to a project (GitHub access, GitHub releases), then hand that project its ${what} here.`}
                  rows={projects.map((p) => {
                    const resources = v.handed.find((h) => h.project.id === p.id)?.resources ?? [];
                    return {
                      key: p.id,
                      icon: 'folder' as const,
                      title: `p/${p.name}`,
                      search: `${p.name} ${resources.join(' ')}`,
                      detail: resources.length ? resources.join(', ') : `no ${what}`,
                      main: (
                        <button disabled={!app} onClick={() => setHanding({ vault: v, project: p, resources })}>
                          Change…
                        </button>
                      ),
                    };
                  })}
                />
                {v.users.length > 0 && (
                  <p className="small">
                    <b>Used by</b> {v.users.map((u) => `${u.service} (${Object.entries(u.rights).map(([k, r]) => `${k.replace(/_/g, ' ')}: ${r}`).join(', ')})`).join(' · ')}
                  </p>
                )}
                {v.log.length > 0 && (
                  <details className="small">
                    <summary>What it handed out</summary>
                    {v.log.slice(0, 20).map((l, i) => (
                      <div key={i} className="muted">
                        {ago(l.time)} · {l.service} · p/{l.project.name} · {l.resources.join(', ')} · {Object.entries(l.rights).map(([k, r]) => `${k.replace(/_/g, ' ')}: ${r}`).join(', ')}
                      </div>
                    ))}
                  </details>
                )}
              </div>
            )}
          </div>
        );
      })}
      {handing && <HandDialog {...handing} onClose={() => setHanding(undefined)} />}
    </fieldset>
  );
}

/** Which of what your access reaches (your repositories) a project gets: yours alone to say. */
export function HandDialog({ vault, project, resources, onClose }: { vault: KeyvaultInfo; project: { id: string; name: string }; resources: string[]; onClose(): void }) {
  // Asked once (it asks GitHub, which takes a moment): not again on every event, which would never let it finish.
  const [reachable, setReachable] = useState<Array<{ value: string; note?: string }>>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let alive = true;
    api<Array<{ value: string; note?: string }>>('keyvaultReachable', { name: vault.name }).then(
      (got) => alive && setReachable(got),
      (e: Error) => alive && setError(e.message),
    );
    return () => void (alive = false);
  }, [vault.name]);
  const [picked, setPicked] = useState(resources);
  const [filter, setFilter] = useState('');
  const what = vault.resources ?? 'resources';
  const all = [...new Map([...resources.map((value): { value: string; note?: string } => ({ value })), ...(reachable ?? [])].map((r) => [r.value, r])).values()];
  const shown = all.filter((r) => !filter.trim() || r.value.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <Modal title={`${vault.title}: ${what} for p/${project.name}`} onClose={onClose}>
      <p className="small">
        Your services in p/{project.name} get access to these, with the rights their contracts declare, and to nothing else of yours. Taken back, a service may still reach one for a day,
        only to undo what it did with it (take back access it gave).
      </p>
      {error ? <p className="small error-text">{String(error)}</p> : null}
      {!reachable && !error && <p className="small muted">Asking {vault.platform}…</p>}
      {all.length > 8 && <input className="grow" placeholder="Find…" value={filter} onChange={(e) => setFilter(e.target.value)} />}
      <div className="choose-list">
        {shown.map((r) => (
          <div className="field-row" key={r.value}>
            <input type="checkbox" id={`hand-${r.value}`} checked={picked.includes(r.value)} onChange={(e) => setPicked(e.target.checked ? [...picked, r.value] : picked.filter((x) => x !== r.value))} />
            <label htmlFor={`hand-${r.value}`}>
              {r.value} {r.note && <span className="small muted">{r.note}</span>}
            </label>
          </div>
        ))}
      </div>
      <div className="buttons">
        <AsyncButton className="default" onClick={() => attempt(() => api('handKeyvault', { name: vault.name, project: project.id, resources: picked }).then(() => (bump(), onClose())), `p/${project.name} gets ${picked.length} of your ${what}`)}>
          Hand {picked.length ? `these ${picked.length}` : 'none'}
        </AsyncButton>
        <button onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
