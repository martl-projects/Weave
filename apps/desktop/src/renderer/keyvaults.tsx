import { useEffect, useState } from 'react';
import type { KeyvaultInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bump, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Modal } from './ui.tsx';
import { ItemList } from './lists.tsx';

type VaultApp = KeyvaultInfo['apps'][number];

const rightsText = (rights: Record<string, string>) => Object.entries(rights).map(([k, r]) => `${k.replace(/_/g, ' ')}: ${r}`).join(', ');
const appName = (a: VaultApp) => String(a.info.slug ?? a.info.id ?? a.key);

/**
 * In Keys & devices: your keyvaults. Each holds your access to a platform: your apps there (GitHub Apps, any number:
 * one for your repositories, one for an organization's). Each app hands projects what it reaches, in its own settings;
 * your services get only short-lived access derived from the app that handed a project what they ask for, cut to what
 * their contracts declare. Only you hand anything to a project.
 */
export function KeyvaultsBox() {
  const { data: vaults } = useApi(() => api<KeyvaultInfo[]>('keyvaults'), []);
  const [opened, setOpened] = useState<{ vault: string; app: string }>();
  const [making, setMaking] = useState<KeyvaultInfo>();
  if (!vaults?.length) return null;
  const open = opened && vaults.find((v) => v.name === opened.vault);
  const openApp = open?.apps.find((a) => a.key === opened!.app);
  return (
    <fieldset>
      <legend>Keyvaults</legend>
      <p className="small">
        Your access to other platforms, kept here. Your services hold none of it: they get short-lived access derived from it, only with the rights their contracts declare, and only for what you hand each
        project. Nobody else hands anything of yours to a project.
      </p>
      {vaults.map((v) => {
        const appSetting = v.settings.find((s) => s.register);
        const what = v.resources ?? 'resources';
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
                  <AsyncButton onClick={async () => (await ask(`Remove ${v.title}? Your services lose the access they get through it, and what your apps handed projects is forgotten. Your apps stay on ${v.platform} until you delete them there.`, 'Remove')) && attempt(() => api('removeKeyvault', v.name).then(bump), `${v.title} is removed`)}>
                    Remove
                  </AsyncButton>
                )}
              </div>
            </div>
            {v.added && (
              <div className="keyvault-body">
                {/* Its apps, as a list like every service's: each with its settings (what it hands which project). */}
                <ItemList
                  title="Your apps"
                  empty={appSetting?.hint ?? 'None yet.'}
                  {...(appSetting
                    ? {
                        add: {
                          label: `Make ${v.apps.length ? 'another app' : appSetting.label.charAt(0).toLowerCase() + appSetting.label.slice(1)} on ${new URL(appSetting.register!.page).hostname}`,
                          // For whom: your account, or (where the platform has them) an organization of yours.
                          run: () =>
                            appSetting.register!.pageFor
                              ? setMaking(v)
                              : void attempt(async () => {
                                  const { id, url } = await api<{ id: string; url: string }>('startKeyvaultApp', { name: v.name, setting: appSetting.name });
                                  window.open(url, '_blank', 'noopener');
                                  await api('finishKeyvaultApp', { id });
                                  bump();
                                }, `${appSetting.label} is made: install it on your ${what}`),
                        },
                      }
                    : {})}
                  rows={v.apps.map((a) => ({
                    key: a.key,
                    icon: 'lock' as const,
                    title: (
                      <a href={String(a.info.html_url ?? '')} target="_blank" rel="noopener noreferrer">
                        {appName(a)}
                      </a>
                    ),
                    search: `${appName(a)} ${a.handed.map((h) => `${h.project.name} ${h.resources.join(' ')}`).join(' ')}`,
                    detail: [a.info['owner.login'] ? `${String(a.info['owner.login'])}'s` : '', a.handed.length ? `hands ${a.handed.map((h) => `p/${h.project.name}`).join(', ')}` : 'hands no project anything yet'].filter(Boolean).join(' · '),
                    ...(a.next ? { main: <button onClick={() => window.open(a.next, '_blank', 'noopener')}>Install on more {what}…</button> } : {}),
                    tools: [{ icon: 'gear' as const, label: 'Its settings: what it hands which project', run: () => setOpened({ vault: v.name, app: a.key }) }],
                    remove: {
                      label: 'Forget this app',
                      run: () =>
                        void (async () =>
                          (await ask(`Forget ${appName(a)}? Your services lose what they get through it, and what it handed projects is forgotten. It stays on ${v.platform} until you delete it there.`, 'Forget it')) &&
                          attempt(() => api('removeKeyvaultApp', { name: v.name, app: a.key }).then(bump), `${appName(a)} is forgotten`))(),
                    },
                  }))}
                />
                {v.users.length > 0 && (
                  <p className="small">
                    <b>Used by</b> {v.users.map((u) => `${u.service} (${rightsText(u.rights)})`).join(' · ')}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
      {open && openApp && <AppSettingsDialog vault={open} app={openApp} onClose={() => setOpened(undefined)} />}
      {making && <NewAppDialog vault={making} onClose={() => setMaking(undefined)} />}
    </fieldset>
  );
}

/**
 * Making an app: for your own account, or for an organization of yours. An app reaches only what belongs to the
 * account it's made for, so an organization's resources need one made for it; made later too, beside yours.
 */
function NewAppDialog({ vault, onClose }: { vault: KeyvaultInfo; onClose(): void }) {
  const setting = vault.settings.find((s) => s.register)!;
  const what = vault.resources ?? 'resources';
  const owners = [...new Set(vault.apps.map((a) => String(a.info['owner.login'] ?? '')).filter(Boolean))];
  const [org, setOrg] = useState(false);
  const [owner, setOwner] = useState('');
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    await attempt(async () => {
      const { id, url } = await api<{ id: string; url: string }>('startKeyvaultApp', { name: vault.name, setting: setting.name, ...(org ? { owner: owner.trim() } : {}) });
      window.open(url, '_blank', 'noopener');
      await api('finishKeyvaultApp', { id });
      bump();
      onClose();
    }, `${setting.label} is made${org ? ` for ${owner.trim()}` : ''}: install it on ${org ? 'its' : 'your'} ${what}`);
    setBusy(false);
  };
  return (
    <Modal title={`Make ${vault.apps.length ? 'another app' : setting.label.charAt(0).toLowerCase() + setting.label.slice(1)} on ${vault.platform}`} onClose={onClose}>
      <p className="small">An app reaches only the {what} of the account it's made for. {owners.length ? `Yours so far: ${owners.join(', ')}.` : ''}</p>
      <div className="field-row">
        <input id="app-for-me" type="radio" checked={!org} onChange={() => setOrg(false)} />
        <label htmlFor="app-for-me">For my own account</label>
      </div>
      <div className="field-row">
        <input id="app-for-org" type="radio" checked={org} onChange={() => setOrg(true)} />
        <label htmlFor="app-for-org">For an organization I manage</label>
      </div>
      {org && (
        <div className="field-row indent">
          <input autoFocus className="grow" placeholder="its name, as in its address" value={owner} onChange={(e) => setOwner(e.target.value.trim())} />
        </div>
      )}
      <p className="small muted">{vault.platform} opens: you name nothing there, it's made as you confirm. Then install it on the {what} you want to hand to projects.</p>
      <div className="buttons">
        <button className="default" disabled={busy || (org && !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner))} onClick={() => void make()}>
          {busy ? 'Waiting for it…' : 'Make it'}
        </button>
        <button onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

/** One app's settings: what it hands which project (only you say), and what it handed out. */
function AppSettingsDialog({ vault, app, onClose }: { vault: KeyvaultInfo; app: VaultApp; onClose(): void }) {
  const [handing, setHanding] = useState<{ project: { id: string; name: string }; resources: string[] }>();
  const what = vault.resources ?? 'resources';
  // The projects it matters for: where your services that use the keyvault run, and where it handed something.
  const projects = [...new Map([...vault.users.flatMap((u) => u.projects), ...app.handed.map((h) => h.project)].map((p) => [p.id, p])).values()];
  const log = vault.log.filter((l) => !l.app || l.app === app.key);
  return (
    <Modal title={`${appName(app)}: settings`} onClose={onClose} wide>
      <p className="small">
        What {appName(app)} hands each project: your services there get access to these, with the rights their contracts declare, and to nothing else of yours.
      </p>
      <ItemList
        title="Handed to projects"
        empty={`None yet: add a service that uses it to a project (GitHub access, GitHub releases), then hand that project its ${what} here.`}
        rows={projects.map((p) => {
          const resources = app.handed.find((h) => h.project.id === p.id)?.resources ?? [];
          return {
            key: p.id,
            icon: 'folder' as const,
            title: `p/${p.name}`,
            search: `${p.name} ${resources.join(' ')}`,
            detail: resources.length ? resources.join(', ') : `no ${what}`,
            main: <button onClick={() => setHanding({ project: p, resources })}>Change…</button>,
          };
        })}
      />
      {log.length > 0 && (
        <details className="small">
          <summary>What it handed out</summary>
          {log.slice(0, 20).map((l, i) => (
            <div key={i} className="muted">
              {ago(l.time)} · {l.service} · p/{l.project.name} · {l.resources.join(', ')} · {rightsText(l.rights)}
            </div>
          ))}
        </details>
      )}
      <div className="buttons">
        <button onClick={onClose}>Close</button>
      </div>
      {handing && <HandDialog vault={vault} app={app.key} project={handing.project} onClose={() => setHanding(undefined)} />}
    </Modal>
  );
}

/** Which of what one of your apps reaches (your repositories) a project gets: yours alone to say. Several apps: you pick which, unless it's given. */
export function HandDialog({ vault, app, project, onClose }: { vault: KeyvaultInfo; app?: string; project: { id: string; name: string }; onClose(): void }) {
  const [appKey, setAppKey] = useState(app ?? vault.apps[0]?.key);
  const chosen = vault.apps.find((a) => a.key === appKey);
  const handed = chosen?.handed.find((h) => h.project.id === project.id)?.resources ?? [];
  // Asked once per app (it asks GitHub, which takes a moment): not again on every event, which would never let it finish.
  const [reachable, setReachable] = useState<Array<{ value: string; note?: string }>>();
  const [error, setError] = useState<string>();
  const [picked, setPicked] = useState(handed);
  useEffect(() => {
    let alive = true;
    setReachable(undefined);
    setError(undefined);
    setPicked(handed);
    if (appKey)
      api<Array<{ value: string; note?: string }>>('keyvaultReachable', { name: vault.name, app: appKey }).then(
        (got) => alive && setReachable(got),
        (e: Error) => alive && setError(e.message),
      );
    return () => void (alive = false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vault.name, appKey]);
  const [filter, setFilter] = useState('');
  const what = vault.resources ?? 'resources';
  const all = [...new Map([...handed.map((value): { value: string; note?: string } => ({ value })), ...(reachable ?? [])].map((r) => [r.value, r])).values()];
  const shown = all.filter((r) => !filter.trim() || r.value.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <Modal title={`${chosen ? appName(chosen) : vault.title}: ${what} for p/${project.name}`} onClose={onClose}>
      {!app && vault.apps.length > 1 && (
        <div className="field-row">
          <label htmlFor="hand-app">From</label>
          <select id="hand-app" value={appKey} onChange={(e) => setAppKey(e.target.value)}>
            {vault.apps.map((a) => (
              <option key={a.key} value={a.key}>
                {appName(a)}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="small">
        Your services in p/{project.name} get access to these, with the rights their contracts declare, and to nothing else of yours. Taken back, a service may still reach one for a day,
        only to undo what it did with it (take back access it gave).
      </p>
      {error ? <p className="small error-text">{String(error)}</p> : null}
      {reachable && <p className="small muted">An organization's {what} aren't here unless this app was made for it: Keys & devices, {vault.title}, make another app for that organization.</p>}
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
        <AsyncButton className="default" disabled={!appKey} onClick={() => attempt(() => api('handKeyvault', { name: vault.name, app: appKey, project: project.id, resources: picked }).then(() => (bump(), onClose())), `p/${project.name} gets ${picked.length} of your ${what}`)}>
          Hand {picked.length ? `these ${picked.length}` : 'none'}
        </AsyncButton>
        <button onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}
