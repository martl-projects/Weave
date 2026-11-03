import { useEffect, useState } from 'react';
import type { ForgottenAppInfo, KeyvaultInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bump, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Modal } from './ui.tsx';
import { ItemList } from './lists.tsx';
import { T, t, useTexts } from './texts.tsx';

type VaultApp = KeyvaultInfo['apps'][number];

const rightsText = (rights: Record<string, string>) => Object.entries(rights).map(([k, r]) => `${k.replace(/_/g, ' ')}: ${r}`).join(', ');
const appName = (a: VaultApp) => String(a.info.slug ?? a.info.id ?? a.key);
/** The platform as people know it (GitHub): from the keyvault's title, its platform's key otherwise. */
export const platformName = (v: Pick<KeyvaultInfo, 'title' | 'platform'>) => v.title.replace(/\s*keyvault$/i, '') || v.platform;

/**
 * The account a repository's address names, as its Code button copies it (git@github.com:owner/repo.git,
 * https://github.com/owner/repo, or any page of it), or owner/repo, or an account's name as it is: whom an app is made for.
 */
export function ownerOf(text: string): { owner: string; repo?: string } | undefined {
  const path = text
    .trim()
    .replace(/^(?:[a-z+]+:\/\/)?(?:[^@/\s]+@)?[^/:\s]+\.[a-z]{2,}(?::\d+)?[:/]/i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  const [owner, repo] = path.split('/');
  if (!owner || !/^[A-Za-z0-9][A-Za-z0-9-]{0,38}$/.test(owner) || (repo !== undefined && !/^[\w.-]{1,100}$/.test(repo))) return undefined;
  return { owner, ...(repo ? { repo } : {}) };
}

/**
 * In Keys & devices: your keyvaults. Each holds your access to a platform: your apps there (GitHub Apps, any number:
 * one for your repositories, one for an organization's). Each app hands projects what it reaches, in its own settings;
 * your services get only short-lived access derived from the app that handed a project what they ask for, cut to what
 * their contracts declare. Only you hand anything to a project.
 */
/** What an agent asked to open here (weave_open_in_app keyvault): the keyvault, and a project to hand a repository to. Taken by the box once it shows. */
let wanted: { name: string; project?: { id: string; name: string } } | undefined;
const wantedListeners = new Set<() => void>();

export function openKeyvault(request: { name: string; project?: { id: string; name: string } }): void {
  wanted = request;
  for (const listener of wantedListeners) listener();
}

/** Make the person's app for a keyvault, on the platform's page (GitHub's manifest flow), and take it in once it's made. */
const makeApp = (v: KeyvaultInfo, setting: string, what: string, label: string) =>
  attempt(async () => {
    const { id, url } = await api<{ id: string; url: string }>('startKeyvaultApp', { name: v.name, setting });
    window.open(url, '_blank', 'noopener');
    await api('finishKeyvaultApp', { id });
    bump();
  }, t('keyvault.app.made.install', { app: label, what }));

export function KeyvaultsBox() {
  const { t } = useTexts();
  const { data: vaults } = useApi(() => api<KeyvaultInfo[]>('keyvaults'), []);
  const [opened, setOpened] = useState<{ vault: string; app: string }>();
  const [making, setMaking] = useState<KeyvaultInfo>();
  const [handing, setHanding] = useState<{ vault: KeyvaultInfo; project: { id: string; name: string } }>();
  const [forgotten, setForgotten] = useState<{ platform: string; apps: ForgottenAppInfo[] }>();
  const [asked, setAsked] = useState(0);
  useEffect(() => {
    const listener = () => setAsked((n) => n + 1);
    wantedListeners.add(listener);
    return () => void wantedListeners.delete(listener);
  }, []);
  // An agent's request: the keyvault's dialog, as far as the person got (added? an app yet?), the rest is theirs to click.
  useEffect(() => {
    const v = wanted && vaults?.find((x) => x.name === wanted!.name);
    if (!wanted || !vaults || !v) return;
    const request = wanted;
    wanted = undefined;
    if (!v.added) return;
    const appSetting = v.settings.find((s) => s.register);
    if (!v.apps.length) {
      if (!appSetting) return;
      if (appSetting.register!.pageFor) setMaking(v);
      else void makeApp(v, appSetting.name, v.resources ?? t('pack.resources'), appSetting.label);
    } else if (request.project) setHanding({ vault: v, project: request.project });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaults, asked]);
  if (!vaults?.length) return null;
  const open = opened && vaults.find((v) => v.name === opened.vault);
  const openApp = open?.apps.find((a) => a.key === opened!.app);
  return (
    <fieldset>
      <legend>{t('keyvaults.legend')}</legend>
      <p className="small">{t('keyvaults.about')}</p>
      {vaults.map((v) => {
        const appSetting = v.settings.find((s) => s.register);
        const what = v.resources ?? t('pack.resources');
        return (
          <div className="keyvault" key={v.name}>
            <div className="service-row">
              <Icon name="lock" />
              <div className="grow">
                <b>{v.title}</b> {!v.added && <span className="small muted">{t('keyvault.not.added')}</span>}
                {v.about && <div className="small">{v.about}</div>}
                {v.problem && <div className="small error-text">{v.problem}</div>}
              </div>
              <div className="service-actions">
                {!v.added ? (
                  <AsyncButton className="default" onClick={() => attempt(() => api('addKeyvault', { shipped: v.name }).then(bump), t('keyvault.added', { name: v.title }))}>
                    {t('button.add')}
                  </AsyncButton>
                ) : (
                  <AsyncButton
                    onClick={async () =>
                      (await ask(t('keyvault.remove.ask', { name: v.title, platform: platformName(v) }), t('button.remove'))) &&
                      attempt(() => api<{ forgotten: ForgottenAppInfo[] }>('removeKeyvault', v.name).then((r) => (bump(), r.forgotten.length && setForgotten({ platform: platformName(v), apps: r.forgotten }))), t('keyvault.removed', { name: v.title }))
                    }
                  >
                    {t('button.remove')}
                  </AsyncButton>
                )}
              </div>
            </div>
            {v.added && (
              <div className="keyvault-body">
                {/* Its apps, as a list like every service's: each with its settings (what it hands which project). */}
                <ItemList
                  title={t('keyvault.your.apps')}
                  empty={appSetting?.hint ?? t('marks.none')}
                  {...(appSetting
                    ? {
                        add: {
                          label: t(v.apps.length ? 'keyvault.make.another' : 'keyvault.make.app', { app: appSetting.label.charAt(0).toLowerCase() + appSetting.label.slice(1), site: new URL(appSetting.register!.page).hostname }),
                          // For whom: your account, or (where the platform has them) an organization of yours.
                          run: () => (appSetting.register!.pageFor ? setMaking(v) : void makeApp(v, appSetting.name, what, appSetting.label)),
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
                    detail: [a.info['owner.login'] ? t('keyvault.app.owner', { owner: String(a.info['owner.login']) }) : '', a.handed.length ? t('keyvault.app.hands', { projects: a.handed.map((h) => `p/${h.project.name}`).join(', ') }) : t('keyvault.app.hands.none')].filter(Boolean).join(' · '),
                    ...(a.next ? { main: <button onClick={() => window.open(a.next, '_blank', 'noopener')}>{t('keyvault.install.more', { what })}</button> } : {}),
                    tools: [{ icon: 'gear' as const, label: t('keyvault.app.settings'), run: () => setOpened({ vault: v.name, app: a.key }) }],
                    remove: {
                      label: t('keyvault.forget.app'),
                      run: () =>
                        void (async () =>
                          (await ask(t('keyvault.forget.ask', { app: appName(a), platform: platformName(v) }), t('keyvault.forget.it'))) &&
                          attempt(() => api<{ forgotten: ForgottenAppInfo }>('removeKeyvaultApp', { name: v.name, app: a.key }).then((r) => (bump(), setForgotten({ platform: platformName(v), apps: [r.forgotten] }))), t('keyvault.forgotten', { app: appName(a) })))(),
                    },
                  }))}
                />
                {v.users.length > 0 && (
                  <p className="small">
                    <b>{t('keyvault.used.by')}</b> {v.users.map((u) => `${u.service} (${rightsText(u.rights)})`).join(' · ')}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
      {open && openApp && <AppSettingsDialog vault={open} app={openApp} onClose={() => setOpened(undefined)} />}
      {making && <NewAppDialog vault={making} onClose={() => setMaking(undefined)} />}
      {handing && <HandDialog vault={handing.vault} project={handing.project} onClose={() => (setHanding(undefined), bump())} />}
      {forgotten && <ForgottenDialog {...forgotten} onClose={() => setForgotten(undefined)} />}
    </fieldset>
  );
}

/** Apps let go of: their access ended (uninstalled), and the page where each is deleted, which only its person can do. */
function ForgottenDialog({ platform, apps, onClose }: { platform: string; apps: ForgottenAppInfo[]; onClose(): void }) {
  const { t } = useTexts();
  return (
    <Modal title={t('keyvault.delete.too', { n: apps.length, platform })} onClose={onClose}>
      <p className="small">{t('keyvault.forgotten.about', { n: apps.length, platform })}</p>
      {apps.map((a) => (
        <div className="field-row" key={a.app}>
          <span className="grow">
            <b>{a.app}</b> {a.problem && <span className="small error-text">{t('keyvault.still.installed', { problem: a.problem })}</span>}
          </span>
          {a.page && <button onClick={() => window.open(a.page, '_blank', 'noopener')}>{t('keyvault.delete.on', { platform })}</button>}
        </div>
      ))}
      <div className="buttons">
        <button className="default" onClick={onClose}>
          {t('button.done')}
        </button>
      </div>
    </Modal>
  );
}

/**
 * Making an app: for your own account, or for an organization of yours. An app reaches only what belongs to the
 * account it's made for, so an organization's resources need one made for it; made later too, beside yours.
 */
function NewAppDialog({ vault, address, onClose }: { vault: KeyvaultInfo; address?: string; onClose(): void }) {
  const { t } = useTexts();
  const setting = vault.settings.find((s) => s.register)!;
  const what = vault.resources ?? t('pack.resources');
  // Whom for: your account, the organizations it shows you're in, or one you name (a membership you keep private).
  const { data: whom } = useApi(() => api<{ login?: string; owners: Array<{ value: string; note?: string }> }>('keyvaultOwners', { name: vault.name }).catch(() => ({ owners: [] as Array<{ value: string; note?: string }> }) as { login?: string; owners: Array<{ value: string; note?: string }> }), [vault.name]);
  const mine = vault.apps.some((a) => whom?.login && String(a.info['owner.login'] ?? '').toLowerCase() === whom.login.toLowerCase());
  const [pick, setPick] = useState<string | undefined>(address ? 'other' : undefined);
  const [typed, setTyped] = useState(address ?? '');
  const chosen = pick ?? (mine ? whom?.owners[0]?.value ?? 'other' : 'me');
  const named = chosen === 'other' ? ownerOf(typed) : undefined;
  const owner = chosen === 'me' ? undefined : chosen === 'other' ? named?.owner : chosen;
  const [busy, setBusy] = useState(false);
  const make = async () => {
    setBusy(true);
    await attempt(async () => {
      const { id, url } = await api<{ id: string; url: string }>('startKeyvaultApp', { name: vault.name, setting: setting.name, ...(owner ? { owner } : {}) });
      window.open(url, '_blank', 'noopener');
      await api('finishKeyvaultApp', { id });
      bump();
      onClose();
    }, t('keyvault.app.made.for', { app: setting.label, owner: owner ? t('keyvault.for.owner', { owner }) : '', where: named?.repo ? `${named.owner}/${named.repo}` : owner ? t('keyvault.its.what', { what }) : t('keyvault.your.what', { what }) }));
    setBusy(false);
  };
  const option = (value: string, label: string, note?: string) => (
    <div className="field-row" key={value}>
      <input id={`app-for-${value}`} type="radio" checked={chosen === value} onChange={() => setPick(value)} />
      <label htmlFor={`app-for-${value}`}>
        {label} {note && <span className="small muted">{note}</span>}
      </label>
    </div>
  );
  return (
    <Modal title={t(vault.apps.length ? 'keyvault.make.another' : 'keyvault.make.app', { app: setting.label.charAt(0).toLowerCase() + setting.label.slice(1), site: platformName(vault) })} onClose={onClose}>
      <p className="small">{t('keyvault.app.reaches', { what })}</p>
      {!whom && <p className="small muted">{t('keyvault.asking.orgs', { platform: platformName(vault) })}</p>}
      {option('me', whom?.login ? t('keyvault.your.account', { login: whom.login }) : t('keyvault.my.account'), mine ? t('keyvault.has.one') : undefined)}
      {(whom?.owners ?? []).map((o) => option(o.value, o.value, o.note ?? t('keyvault.organization')))}
      {option('other', t('keyvault.another.org'))}
      {chosen === 'other' && (
        <div className="field-row indent">
          <input autoFocus className="grow" placeholder="git@github.com:organization/repository.git" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      )}
      {chosen === 'other' && (
        <div className="small muted indent">
          {typed.trim() && !named ? (
            <span className="error-text">{t('keyvault.no.address')}</span>
          ) : named ? (
            <T name="keyvault.for.named" values={{ owner: <b>{named.owner}</b>, repo: named.repo ? t('keyvault.to.hand', { owner: named.owner, repo: named.repo, what }) : '' }} />
          ) : (
            <>{t('keyvault.only.shown.orgs', { what })}</>
          )}
          <details>
            <summary>{t('keyvault.where.address')}</summary>
            <T name="keyvault.where.address.howto" values={{ platform: platformName(vault), what }} />
          </details>
        </div>
      )}
      <p className="small muted">{t('keyvault.opens.makes', { platform: platformName(vault), what })}</p>
      <div className="buttons">
        <button className="default" disabled={busy || (chosen === 'other' && !named)} onClick={() => void make()}>
          {t(busy ? 'keyvault.waiting' : 'keyvault.make.it')}
        </button>
        <button onClick={onClose}>{t('button.cancel')}</button>
      </div>
    </Modal>
  );
}

/** One app's settings: what it hands which project (only you say), and what it handed out. */
function AppSettingsDialog({ vault, app, onClose }: { vault: KeyvaultInfo; app: VaultApp; onClose(): void }) {
  const { t } = useTexts();
  const [handing, setHanding] = useState<{ project: { id: string; name: string }; resources: string[] }>();
  const what = vault.resources ?? t('pack.resources');
  // The projects it matters for: where your services that use the keyvault run, and where it handed something.
  const projects = [...new Map([...vault.users.flatMap((u) => u.projects), ...app.handed.map((h) => h.project)].map((p) => [p.id, p])).values()];
  const log = vault.log.filter((l) => !l.app || l.app === app.key);
  return (
    <Modal title={t('keyvault.app.settings.title', { app: appName(app) })} onClose={onClose} wide>
      <p className="small">{t('keyvault.app.hands.about', { app: appName(app) })}</p>
      <ItemList
        title={t('keyvault.handed.to')}
        empty={t('keyvault.handed.none', { what })}
        rows={projects.map((p) => {
          const resources = app.handed.find((h) => h.project.id === p.id)?.resources ?? [];
          return {
            key: p.id,
            icon: 'folder' as const,
            title: `p/${p.name}`,
            search: `${p.name} ${resources.join(' ')}`,
            detail: resources.length ? resources.join(', ') : t('keyvault.no.what', { what }),
            main: <button onClick={() => setHanding({ project: p, resources })}>{t('split.change')}</button>,
          };
        })}
      />
      {log.length > 0 && (
        <details className="small">
          <summary>{t('keyvault.handed.out')}</summary>
          {log.slice(0, 20).map((l, i) => (
            <div key={i} className="muted">
              {ago(l.time)} · {l.service} · p/{l.project.name} · {l.resources.join(', ')} · {rightsText(l.rights)}
            </div>
          ))}
        </details>
      )}
      <div className="buttons">
        <button onClick={onClose}>{t('button.close')}</button>
      </div>
      {handing && <HandDialog vault={vault} app={app.key} project={handing.project} onClose={() => setHanding(undefined)} />}
    </Modal>
  );
}

/** Which of what one of your apps reaches (your repositories) a project gets: yours alone to say. Several apps: you pick which, unless it's given. */
export function HandDialog({ vault, app, project, onClose }: { vault: KeyvaultInfo; app?: string; project: { id: string; name: string }; onClose(): void }) {
  const { t } = useTexts();
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
  const what = vault.resources ?? t('pack.resources');
  // One pasted by its address: picked when this app reaches it; another account's needs an app made for that account.
  const [address, setAddress] = useState('');
  const [making, setMaking] = useState(false);
  const pasted = address.trim() ? ownerOf(address) : undefined;
  const appOwner = String(chosen?.info['owner.login'] ?? '');
  const elsewhere = pasted && appOwner && pasted.owner.toLowerCase() !== appOwner.toLowerCase() ? pasted.owner : undefined;
  const found = pasted?.repo && !elsewhere ? (reachable ?? []).find((r) => r.value.toLowerCase() === `${pasted.owner}/${pasted.repo}`.toLowerCase()) : undefined;
  const paste = (text: string) => {
    setAddress(text);
    const got = ownerOf(text);
    const hit = got?.repo && (reachable ?? []).find((r) => r.value.toLowerCase() === `${got.owner}/${got.repo}`.toLowerCase());
    if (hit && !picked.includes(hit.value)) setPicked([...picked, hit.value]);
  };
  const all = [...new Map([...handed.map((value): { value: string; note?: string } => ({ value })), ...(reachable ?? [])].map((r) => [r.value, r])).values()];
  const shown = all.filter((r) => !filter.trim() || r.value.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <Modal title={t('hand.title', { app: chosen ? appName(chosen) : vault.title, what, project: project.name })} onClose={onClose}>
      {!app && vault.apps.length > 1 && (
        <div className="field-row">
          <label htmlFor="hand-app">{t('rule.from')}</label>
          <select id="hand-app" value={appKey} onChange={(e) => setAppKey(e.target.value)}>
            {vault.apps.map((a) => (
              <option key={a.key} value={a.key}>
                {appName(a)}
              </option>
            ))}
          </select>
        </div>
      )}
      <p className="small">{t('hand.about', { project: project.name })}</p>
      {error ? <p className="small error-text">{String(error)}</p> : null}
      <div className="field-row">
        <input className="grow" placeholder={t('hand.paste.address')} value={address} onChange={(e) => paste(e.target.value)} />
      </div>
      {address.trim() && (
        <p className="small">
          {!pasted ? (
            <span className="error-text">{t('hand.no.address', { what })}</span>
          ) : elsewhere ? (
            <>
              <span className="error-text">{t('hand.app.is.owners', { app: appName(chosen!), owner: appOwner, what, elsewhere })}</span> {t('hand.need.app.for', { elsewhere })}{' '}
              <button onClick={() => setMaking(true)}>{t('hand.make.app.for', { elsewhere })}</button>
            </>
          ) : found ? (
            <>{t('hand.picked', { value: found.value })}</>
          ) : reachable ? (
            <span className="error-text">
              {t('hand.doesnt.reach', { app: appName(chosen!), target: pasted.repo ? `${pasted.owner}/${pasted.repo}` : t('hand.owners.what', { owner: pasted.owner, what }), platform: platformName(vault) })}
              {chosen?.next ? (
                <>
                  {' '}
                  <button onClick={() => window.open(chosen.next, '_blank', 'noopener')}>{t('hand.install.it')}</button>
                </>
              ) : null}
            </span>
          ) : null}
        </p>
      )}
      {reachable && !address.trim() && <p className="small muted">{t('hand.only.reaches', { what })}</p>}
      {!reachable && !error && <p className="small muted">{t('hand.asking', { platform: platformName(vault) })}</p>}
      {all.length > 8 && <input className="grow" placeholder={t('hand.find')} value={filter} onChange={(e) => setFilter(e.target.value)} />}
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
        <AsyncButton className="default" disabled={!appKey} onClick={() => attempt(() => api('handKeyvault', { name: vault.name, app: appKey, project: project.id, resources: picked }).then(() => (bump(), onClose())), t('hand.done', { project: project.name, n: picked.length, what }))}>
          {picked.length ? t('hand.these', { n: picked.length }) : t('hand.none')}
        </AsyncButton>
        <button onClick={onClose}>{t('button.cancel')}</button>
      </div>
      {making && <NewAppDialog vault={vault} address={address} onClose={() => (setMaking(false), onClose())} />}
    </Modal>
  );
}
