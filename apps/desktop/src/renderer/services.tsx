import { useEffect, useRef, useState } from 'react';
import type { FetcherInfo, KeyInfo, ServiceActionInfo, ServicePanelInfo, ServiceListInfo, ServiceInfo, ServiceOriginInfo, ServiceProfileInfo, ServiceRequestInfo, ServiceSettingsInfo, SpaceInfo } from '@weave/node/client';
import { fieldName, type ActionWho, type ServiceContract, type TextPackage } from '@weave/core';
import { bridge } from './bridge.ts';
import { Icon } from './icons.tsx';
import { AccountProofDialog } from './accounts.tsx';
import { ago, api, bump, onItem, shortDid, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Modal } from './ui.tsx';
import { ServiceList } from './lists.tsx';
import { t, T, useTexts } from './texts.tsx';
import { useServiceTexts } from './servicetexts.ts';
import { AddServiceWizard } from './addwizard.tsx';

/*
 * Services: code you run under a key of its own, with exactly the rights its contract declares. In Keys & devices
 * you add them (on this computer or an always-on node), set them up and stop them; in a space, members see the
 * services there, read what they do, and ask them.
 */

/** A contract in plain words. */
export function contractText(c: ServiceContract): string {
  const reads = c.reads === 'nothing' ? t('contract.reads.nothing') : c.reads === 'addressed' ? t('contract.reads.addressed') : c.reads === 'space' ? t('contract.reads.space') : t('contract.reads.kinds', { kinds: c.reads.kinds.join(', ') });
  const answers = c.reads === 'nothing' ? '' : t('contract.and.answers');
  const writes = c.writes.length ? t('contract.writes', { kinds: c.writes.join(', '), answers }) : c.reads === 'nothing' ? t('contract.writes.nothing') : t('contract.writes.answers');
  return `${reads}; ${writes}${c.website ? t('contract.serves.websites') : ''}${c.offers?.length ? t('contract.offers', { what: c.offers.join(', ') }) : ''}${c.net?.length ? t('contract.talks.to', { hosts: c.net.join(', ') }) : ''}${c.uses ? t('contract.uses', { platforms: Object.keys(c.uses).join(', ') }) : ''} ${t('contract.version', { version: c.version })}`;
}

/** Where a service comes from, and whether this computer could check it. */
export function OriginText({ origin }: { origin: ServiceOriginInfo }) {
  const { t } = useTexts();
  if (origin.kind === 'weave') return <div className="small muted">{t('origin.part.of.weave')}</div>;
  if (origin.kind === 'unreleased') return null;
  if (origin.kind === 'shipped') return origin.checked === 'verified' ? <div className="small muted">{t('origin.made.by.weave')}</div> : <div className="small muted">{t('origin.outdated.title')}</div>;
  const where = origin.project.name ? `p/${origin.project.name}` : t('origin.project.unknown');
  if (origin.checked === 'verified') return <div className="small muted">{t('origin.from.verified', { where, tag: origin.tag })}</div>;
  if (origin.checked === 'unmatched') return <div className="small error-text">{t('origin.claims', { where })}</div>;
  return <div className="small muted">{t('origin.from', { where, tag: origin.tag })}</div>;
}

/**
 * Where a service comes from, in a word, in its card's title: Weave's own (checked), a project's release (which), or
 * someone's own code. So nothing passes for Weave's own, or for another project's, by its name.
 */
export function OriginBadge({ origin }: { origin: ServiceOriginInfo }) {
  const { t } = useTexts();
  if (origin.kind === 'weave' || (origin.kind === 'shipped' && origin.checked === 'verified'))
    return (
      <span className="tag origin-weave" title={t('origin.weave.title')}>
        {t('origin.weave')}
      </span>
    );
  if (origin.kind === 'shipped')
    return (
      <span className="tag" title={t('origin.outdated.title')}>
        {t('origin.outdated')}
      </span>
    );
  if (origin.kind === 'unreleased')
    return (
      <span className="tag" title={t('origin.own.code.title')}>
        {t('origin.own.code')}
      </span>
    );
  if (origin.checked === 'unmatched')
    return (
      <span className="tag origin-warn" title={t('origin.not.what.claims.title')}>
        {t('origin.not.what.claims')}
      </span>
    );
  return (
    <span className="tag" title={t('origin.release.title', { project: origin.project.name ? `p/${origin.project.name}` : t('origin.project.unknown'), tag: origin.tag })}>
      {origin.project.name ? `p/${origin.project.name}` : t('origin.other.project')}
    </span>
  );
}

/** The spaces a service may be in: groups, projects and communities, not direct chats. */
function useServiceSpaces(): SpaceInfo[] {
  const { data } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  return (data ?? []).filter((s) => s.kind !== 'direct');
}

function SpacePicker({ value, onChange }: { value: string[]; onChange(ids: string[]): void }) {
  const { t } = useTexts();
  const spaces = useServiceSpaces();
  if (!spaces.length) return <p className="small muted">{t('svc.no.spaces')}</p>;
  return (
    <div className="sunken service-spaces">
      {spaces.map((s) => (
        <div className="field-row" key={s.id}>
          <input type="checkbox" id={`svc-space-${s.id}`} checked={value.includes(s.id)} onChange={(e) => onChange(e.target.checked ? [...value, s.id] : value.filter((id) => id !== s.id))} />
          <label htmlFor={`svc-space-${s.id}`}>
            {s.name} <span className="small muted">{t(`word.${s.kind}`)}</span>
          </label>
        </div>
      ))}
    </div>
  );
}

/** Split a command line into its parts, keeping quoted ones together. */
const commandParts = (text: string) => [...text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);

/** A service's settings: its spaces, how it starts, and secret settings (written here, never shown again). */
function ServiceSettingsDialog({ service, onClose }: { service: ServiceInfo; onClose(): void }) {
  const { t } = useTexts();
  const [spaces, setSpaces] = useState(service.spaces.map((s) => s.id));
  const [description, setDescription] = useState(service.description);
  const [command, setCommand] = useState(service.command?.map((p) => (/\s/.test(p) ? `"${p}"` : p)).join(' ') ?? '');
  const [settings, setSettings] = useState<Record<string, string | null>>({});
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const names = [...new Set([...service.settings, ...Object.keys(settings)])].filter((n) => settings[n] !== null).sort();
  const save = async () => {
    const done = await attempt(
      () => api('setService', { name: service.name, spaces, description, command: command.trim() ? commandParts(command) : null, ...(Object.keys(settings).length ? { settings } : {}) }).then(() => (bump(), true)),
      t(service.node ? 'svc.is.set.node' : 'svc.is.set', { name: service.name, node: service.node?.name }),
    );
    if (done !== undefined) onClose();
  };
  return (
    <Modal title={t('svc.settings.title', { name: service.name })} onClose={onClose} wide>
      <div className="field-row-stacked">
        <label htmlFor="svc-set-description">{t('svc.what.it.does')}</label>
        <input id="svc-set-description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="field-row-stacked">
        <label>{t('svc.in.spaces')}</label>
        <SpacePicker value={spaces} onChange={setSpaces} />
      </div>
      {!service.builtin && !service.artifact && (
        <div className="field-row-stacked">
          <label htmlFor="svc-set-command">{t('svc.how.start')}</label>
          <input id="svc-set-command" value={command} onChange={(e) => setCommand(e.target.value)} spellCheck={false} />
        </div>
      )}
      <fieldset>
        <legend>{t('svc.settings')}</legend>
        <p className="small">{t('svc.settings.about', { where: service.node ? service.node.name : t('svc.this.computer') })}</p>
        {names.map((n) => (
          <div className="field-row" key={n}>
            <code className="grow">{n}</code>
            <span className="small muted">{t(settings[n] !== undefined ? 'svc.changed' : 'svc.set')}</span>
            <button onClick={() => setSettings({ ...settings, [n]: null })}>{t('button.remove')}</button>
          </div>
        ))}
        <div className="field-row">
          <input value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder={t('svc.setting.name.placeholder')} spellCheck={false} />
          <input className="grow" type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('svc.value')} />
          <button disabled={!key || !value} onClick={() => (setSettings({ ...settings, [key]: value }), setKey(''), setValue(''))}>
            {t('svc.set.button')}
          </button>
        </div>
      </fieldset>
      <div className="buttons">
        <button onClick={onClose}>{t('button.cancel')}</button>
        <AsyncButton className="default" onClick={save}>
          {t('button.save')}
        </AsyncButton>
      </div>
    </Modal>
  );
}

/** In Keys & devices: the services you run, here and on your always-on nodes. */
/** A service that is only a website (it shows its page and acts on nothing): it lives in Live, not among services. */
export const onlyAWebsite = (c: ServiceContract): boolean => c.reads === 'nothing' && !c.writes.length && !!c.website && c.websites !== 'host';

/**
 * Your fetchers: client apps that fetch what a project's provider grants you (its contract names which), on this
 * node. Yours, not a project's: each fetches only for the projects you allow, with your own settings.
 */
export function FetchersBox() {
  const { t } = useTexts();
  const { data: fetchers } = useApi(() => api<FetcherInfo[]>('fetchers'), []);
  const [editing, setEditing] = useState<FetcherInfo>();
  if (!fetchers?.length) return null;
  return (
    <fieldset>
      <legend>{t('fetchers.legend')}</legend>
      <p className="small">{t('fetchers.about')}</p>
      {fetchers.map((f) => (
        <div className="service-row" key={f.name}>
          <Icon name="download" />
          <div className="grow">
            <b>{f.title}</b>{' '}
            <span className="small muted">{!f.added ? t('keyvault.not.added') : f.projects === 'all' ? t('fetcher.all.projects') : f.projects.length ? t('fetcher.for', { projects: f.projects.map((p) => `p/${p.name}`).join(', ') }) : t('fetcher.no.project')}</span>
            {f.about && <div className="small">{f.about}</div>}
            {f.net.length > 0 && <div className="small muted">{t('fetcher.reaches', { hosts: f.net.join(', ') })}</div>}
            {f.problem && <div className="small error-text">{f.problem}</div>}
          </div>
          <div className="service-actions">
            <button onClick={() => setEditing(f)}>{t(f.added ? 'service.settings' : 'fetcher.add')}</button>
            {f.added && (
              <AsyncButton onClick={async () => (await ask(t('fetcher.remove.ask', { name: f.title }), t('button.remove'))) && attempt(() => api('removeFetcher', f.name).then(bump), t('keyvault.removed', { name: f.title }))}>
                {t('button.remove')}
              </AsyncButton>
            )}
          </div>
        </div>
      ))}
      {editing && <FetcherDialog fetcher={editing} onClose={() => setEditing(undefined)} />}
    </fieldset>
  );
}

/** Which projects a fetcher fetches for, and your settings for it (a secret only as set, never shown). */
function FetcherDialog({ fetcher, onClose }: { fetcher: FetcherInfo; onClose(): void }) {
  const { t } = useTexts();
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const projects = (spaces ?? []).filter((s) => s.kind === 'project');
  const [all, setAll] = useState(fetcher.projects === 'all');
  const [picked, setPicked] = useState<string[]>(fetcher.projects === 'all' ? [] : fetcher.projects.map((p) => p.id));
  const [values, setValues] = useState<Record<string, string>>({});
  const settings = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()));
  return (
    <Modal title={t(fetcher.added ? 'fetcher.settings.title' : 'fetcher.add.title', { name: fetcher.title })} onClose={onClose}>
      <p className="small">{t('fetcher.only.these')}</p>
      <div className="field-row">
        <input type="checkbox" id="fetcher-all" checked={all} onChange={(e) => setAll(e.target.checked)} />
        <label htmlFor="fetcher-all">{t('fetcher.all.mine')}</label>
      </div>
      {!all &&
        projects.map((p) => (
          <div className="field-row" key={p.id}>
            <input type="checkbox" id={`fetcher-${p.id}`} checked={picked.includes(p.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
            <label htmlFor={`fetcher-${p.id}`}>p/{p.name}</label>
          </div>
        ))}
      {fetcher.settings.map((s) => (
        <div className="field-row" key={s.name}>
          <label htmlFor={`fetcher-setting-${s.name}`}>{s.label ?? s.name}</label>
          <input
            id={`fetcher-setting-${s.name}`}
            className="grow"
            type={s.secret ? 'password' : 'text'}
            placeholder={fetcher.filled.includes(s.name) ? t('fetcher.set.replace') : s.optional ? t('fetcher.optional') : ''}
            value={values[s.name] ?? ''}
            onChange={(e) => setValues({ ...values, [s.name]: e.target.value })}
          />
        </div>
      ))}
      {fetcher.settings.some((s) => s.hint) && <p className="small muted">{fetcher.settings.map((s) => s.hint).filter(Boolean).join(' · ')}</p>}
      <p className="small muted">{t('fetcher.sealed')}</p>
      <div className="buttons">
        <AsyncButton
          className="default"
          onClick={() =>
            attempt(async () => {
              const to = all ? 'all' : picked;
              if (!fetcher.added) {
                if (!all && !picked.length) throw new Error(t('fetcher.pick.projects'));
                await api('addFetcher', { shipped: fetcher.name, projects: to });
              }
              await api('setFetcher', { name: fetcher.name, projects: to, ...(Object.keys(settings).length ? { settings } : {}) });
              bump();
              onClose();
            }, t(fetcher.added ? 'fetcher.is.set' : 'keyvault.added', { name: fetcher.title }))
          }
        >
          {t(fetcher.added ? 'button.save' : 'button.add')}
        </AsyncButton>
        <button onClick={onClose}>{t('button.cancel')}</button>
      </div>
    </Modal>
  );
}

/** A service Weave ships whose new version asks for more: it keeps what you approved until your yes. */
export function ShippedUpdate({ service: s }: { service: ServiceInfo }) {
  const { t } = useTexts();
  return (
    <div className="small">
      <span className="error-text">{t('svc.update.needs.yes')}</span> {t('svc.update.ships', { contract: contractText(s.update!) })}{' '}
      <AsyncButton onClick={async () => (await ask(t('svc.update.ask', { name: s.name, contract: contractText(s.update!) }), t('svc.yes.update'))) && attempt(() => api('setService', { name: s.name, approve: true }).then(bump), t('svc.new.rights', { name: s.name }))}>
        {t('service.update')}
      </AsyncButton>
    </div>
  );
}

export function ServicesBox({ keys }: { keys: KeyInfo[] }) {
  const { t } = useTexts();
  const { data: services } = useApi(() => api<ServiceInfo[]>('services'), []);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ServiceInfo>();
  const state = (s: ServiceInfo) => {
    if (s.builtin === 'website') return t('svc.website.service', { state: s.enabled ? t('svc.websites.open', { n: s.websites?.length ?? 0 }) : t('svc.stopped') });
    if (s.node) return t('svc.on.node.short', { node: s.node.name });
    if (!s.enabled) return t('svc.stopped');
    return t(s.running ? 'svc.running.here' : s.command ? 'svc.starting' : 'svc.no.command');
  };
  return (
    <fieldset>
      <legend>{t('nav.services')}</legend>
      {(services ?? []).map((s) => (
        <div className="service-row" key={s.name}>
          <Icon name="gear" />
          <div className="grow">
            <b>{s.name}</b>{' '}
            <span className="small muted">
              {state(s)} · {t('svc.in', { spaces: s.spaces.length ? s.spaces.map((x) => x.name).join(', ') : t('svc.no.spaces.yet') })}
            </span>
            {s.description && <div className="small">{s.description}</div>}
            <div className="small muted">{contractText(s.contract)}</div>
            {s.artifact && (
              <div className="small">
                {t('svc.runs.release', { name: s.artifact.name, tag: s.artifact.tag, project: s.artifact.project.name ?? s.artifact.project.id })}
                {s.artifact.progress ? t('svc.fetching') : ''}
                {s.artifact.deliveredBy ? t('svc.delivered.by', { by: s.artifact.deliveredBy }) : ''}
                {s.artifact.error ? <span className="error-text"> · {s.artifact.error}</span> : null}
                {s.artifact.replaced && !s.artifact.latest && (
                  <>
                    {' '}
                    · <span className="error-text">{t('svc.released.again', { tag: s.artifact.tag })}</span> {t('svc.runs.added.release')}{' '}
                    <AsyncButton
                      onClick={async () =>
                        (await ask(t('svc.take.again.ask', { name: s.artifact!.name, tag: s.artifact!.tag, project: s.artifact!.project.name ?? t('svc.its.project') }), t('svc.take.it'))) &&
                        attempt(() => api('setService', { name: s.name, artifact: { tag: s.artifact!.tag }, approve: true }).then(bump), t('svc.takes.again', { name: s.name, tag: s.artifact!.tag }))
                      }
                    >
                      {t('svc.take.it.button')}
                    </AsyncButton>
                  </>
                )}
                {s.artifact.latest && (
                  <>
                    {' '}
                    · {t('svc.is.out', { tag: s.artifact.latest })}{' '}
                    <AsyncButton
                      onClick={async () =>
                        (await ask(t('svc.take.latest.ask', { name: s.artifact!.name, tag: s.artifact!.latest, service: s.name, project: s.artifact!.project.name ?? t('svc.its.project') }), t('svc.take.it'))) &&
                        attempt(() => api('setService', { name: s.name, artifact: { tag: s.artifact!.latest }, approve: true }).then(bump), t('svc.takes', { name: s.name, tag: s.artifact!.latest }))
                      }
                    >
                      {t('service.update')}
                    </AsyncButton>
                  </>
                )}
              </div>
            )}
            {s.update && <ShippedUpdate service={s} />}
          </div>
          <div className="service-actions">
            {!s.builtin && <button onClick={() => setEditing(s)}>{t('service.settings')}</button>}
            <AsyncButton onClick={() => attempt(() => api('setService', { name: s.name, enabled: !s.enabled }).then(bump), t(s.enabled ? 'svc.stopped.done' : 'svc.started.done', { name: s.name }))}>{t(s.enabled ? 'svc.stop' : 'svc.start')}</AsyncButton>
            <AsyncButton onClick={async () => (await ask(t('svc.remove.ask', { name: s.name, where: s.node ? s.node.name : t('svc.this.computer') }), t('button.remove'))) && attempt(() => api('removeService', s.name).then(bump), t('keyvault.removed', { name: s.name }))}>
              {t('button.remove')}
            </AsyncButton>
          </div>
        </div>
      ))}
      <p className="small">{t('svc.about')}</p>
      <div className="buttons">
        <button onClick={() => setAdding(true)}>{t('svc.add.a.service')}</button>
      </div>
      {adding && <AddServiceWizard onClose={() => setAdding(false)} />}
      {editing && <ServiceSettingsDialog service={editing} onClose={() => setEditing(undefined)} />}
    </fieldset>
  );
}

/** A service in a space: what it is, what it may do, asking it, and what it answered. */
export function ServiceCard({ space, service, onClose }: { space: SpaceInfo; service: ServiceProfileInfo; onClose(): void }) {
  const { t } = useTexts();
  const { ts } = useServiceTexts(service.texts);
  const { data: requests, reload } = useApi(() => api<ServiceRequestInfo[]>('serviceRequests', { space: space.id, service: service.did }), [space.id, service.did]);
  const [text, setText] = useState('');
  const by = service.person.name ?? shortDid(service.person.did);
  return (
    <Modal title={`${by} · ${service.name}`} onClose={onClose} wide>
      {service.description && <p>{ts('about', service.description)}</p>}
      <p className="small muted">{t('svc.card.about', { by, contract: contractText(service.contract), name: service.name })}</p>
      <div className="field-row">
        <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder={t('svc.ask.placeholder', { name: service.name })} />
        <AsyncButton
          className="default"
          onClick={async () => {
            const done = await attempt(() => api('askService', { space: space.id, service: service.did, text }));
            if (done !== undefined) {
              setText('');
              reload();
            }
          }}
        >
          {t('svc.ask')}
        </AsyncButton>
      </div>
      <div className="service-requests">
        {(requests ?? [])
          .slice(-20)
          .reverse()
          .map((r) => (
            <div className="service-request" key={r.id}>
              <div className="small">
                <b>{r.from.name ?? shortDid(r.from.did)}</b> <span className="muted">{ago(r.time)}</span>: {r.private ? <span className="muted">{t('svc.asked.private')}</span> : r.text}
              </div>
              {r.results.length ? (
                r.results.map((x) => (
                  <div className={`small service-answer${x.error ? ' error-text' : ''}${x.private ? ' muted' : ''}`} key={x.id}>
                    {x.private ? t('svc.answered.private', { who: r.from.name ?? t('svc.them') }) : x.error ? t('svc.couldnt', { error: x.error }) : x.text || JSON.stringify(x.data)}
                  </div>
                ))
              ) : (
                <div className="small muted service-answer">{t('svc.no.answer')}</div>
              )}
            </div>
          ))}
        {requests && !requests.length && <p className="small muted">{t('svc.nobody.asked')}</p>}
      </div>
    </Modal>
  );
}

/** In a space's member list: its services, under the people. */
export function SpaceServices({ space }: { space: SpaceInfo }) {
  const { t } = useTexts();
  const { data: services } = useApi(() => api<ServiceProfileInfo[]>('servicesIn', space.id).catch(() => []), [space.id]);
  const [open, setOpen] = useState<ServiceProfileInfo>();
  if (!services?.length) return null;
  return (
    <>
      <h4>{t('svc.services.n', { n: services.length })}</h4>
      {services.map((s) => (
        <button className="member service-member" key={s.did} onClick={() => setOpen(s)} title={s.description || t('svc.a.service.runs', { name: s.name, who: s.person.name ?? t('word.someone.lc') })}>
          <Icon name="gear" />
          <span className="member-name">
            {s.name} <span className="small muted">· {s.person.name ?? shortDid(s.person.did)}</span>
          </span>
        </button>
      ))}
      {open && <ServiceCard space={space} service={open} onClose={() => setOpen(undefined)} />}
    </>
  );
}

/**
 * A service's settings kept in a space by its maintainers: each it asks for, set (by whom, when) or not. A plain one
 * shows its value; a secret is set blind (sealed for the service, nobody reads it back); a sign-in goes through the
 * provider's own page, and the node that runs the service keeps it current.
 */
/** Ask a service with one of its actions, and wait for its answer (from the node that runs it; half a minute at most). */
export async function askAndWait(space: string, service: { did: string; name: string }, action: string, input?: unknown, label?: string): Promise<{ text?: string; data?: unknown }> {
  const asked = await api<ServiceRequestInfo>('askService', { space, service: service.did, text: label ?? action, action, ...(input !== undefined && input !== null ? { data: input } : {}) });
  // Two minutes at most: it answers one thing at a time, and may be starting again (a setting changed). Often at
  // first, then calmer.
  for (let i = 0, until = Date.now() + 120_000; Date.now() < until; i++) {
    const answer = (await api<ServiceRequestInfo[]>('serviceRequests', { space, service: service.did })).find((r) => r.id === asked.id)?.results[0];
    if (answer) {
      if (answer.error) throw new Error(answer.error);
      return { text: answer.text, ...(answer.data !== undefined ? { data: answer.data } : {}) };
    }
    await new Promise((resolve) => setTimeout(resolve, i < 10 ? 500 : 1500));
  }
  throw new Error(t('svc.no.answer.in.time', { name: service.name }));
}

/** A setting picked from what the service lists (its action answers [{value, label?, note?}]): one, or several. */
function ChooseSetting({ space, service, action, many, value, onSave }: { space: string; service: { did: string; name: string }; action: string; many: boolean; value: string; onSave(value: string): Promise<unknown> }) {
  const { t } = useTexts();
  const [choices, setChoices] = useState<Array<{ value: string; label?: string; note?: string }>>();
  const [picked, setPicked] = useState<string[]>(value ? value.split('\n').filter(Boolean) : []);
  const [find, setFind] = useState('');
  const [problem, setProblem] = useState<string>();
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    setProblem(undefined);
    try {
      const got = (await askAndWait(space, service, action)).data;
      setChoices(Array.isArray(got) ? got.filter((c): c is { value: string } => typeof c?.value === 'string') : []);
    } catch (error) {
      setProblem((error as Error).message);
    } finally {
      setLoading(false);
    }
  };
  if (!choices)
    return (
      <div className="field-row">
        <button disabled={loading} onClick={load}>
          {t(loading ? 'choose.asking' : value ? 'split.change' : 'button.choose')}
        </button>
        {problem && <span className="small problem">{problem}</span>}
      </div>
    );
  type Choice = { value: string; label?: string; note?: string };
  const shown = [...choices, ...picked.filter((p) => !choices.some((c) => c.value === p)).map((p): Choice => ({ value: p, note: t('choose.not.listed') }))].filter((c) => !find.trim() || `${c.value} ${c.label ?? ''}`.toLowerCase().includes(find.trim().toLowerCase()));
  const toggle = (v: string) => setPicked((p) => (many ? (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]) : [v]));
  return (
    <div className="choose-setting">
      <input className="wide" value={find} onChange={(e) => setFind(e.target.value)} placeholder={t('hand.find')} autoFocus />
      <div className="choose-list sunken">
        {shown.map((c) => (
          <div className="field-row" key={c.value}>
            <input type={many ? 'checkbox' : 'radio'} id={`choose-${c.value}`} checked={picked.includes(c.value)} onChange={() => toggle(c.value)} />
            <label htmlFor={`choose-${c.value}`}>
              {c.label ?? c.value}
              {c.note && <span className="small muted"> · {c.note}</span>}
            </label>
          </div>
        ))}
        {!shown.length && <div className="small muted">{t(find ? 'choose.nothing.called' : 'choose.lists.nothing')}</div>}
      </div>
      <div className="field-row">
        <button onClick={() => setChoices(undefined)}>{t('button.cancel')}</button>
        <AsyncButton className="default" disabled={!picked.length} onClick={() => onSave(picked.join('\n')).then(() => setChoices(undefined))}>
          {many ? t('choose.use.these', { n: picked.length }) : t('choose.use.it')}
        </AsyncButton>
      </div>
    </div>
  );
}

/** A service's settings changed here: its pages show what's current (detail: its key). */
export const SERVICE_CHANGED = 'weave-service-changed';
const serviceChanged = (did: string) => dispatchEvent(new CustomEvent(SERVICE_CHANGED, { detail: did }));

export function KeptSettingsDialog({ space, service, onClose }: { space: { id: string; name: string }; service: { did: string; name: string; texts?: TextPackage[] }; onClose(): void }) {
  const { t } = useTexts();
  const { ts } = useServiceTexts(service.texts);
  const label = (a: { name: string; label: string } | undefined, name: string) => (a ? ts(`settings.${fieldName(a.name)}.label`, a.label) : name);
  const { data, reload } = useApi(() => api<ServiceSettingsInfo>('serviceSettings', { space: space.id, service: service.did }), [space.id, service.did]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState({ name: '', value: '', secret: true });
  const [signing, setSigning] = useState<{ code: string; url: string }>();
  if (!data) return null;
  const save = (name: string, value: string | null, secret?: boolean) =>
    attempt(() => api('setServiceSetting', { space: space.id, service: service.did, name, value, ...(secret ? { secret: true } : {}) }).then(() => (setValues((v) => ({ ...v, [name]: '' })), reload(), bump(), serviceChanged(service.did))), t(value === null ? 'kept.removed' : 'kept.set', { name }));
  const names = [...data.asks.map((a) => a.name), ...data.settings.map((x) => x.name).filter((n) => !data.asks.some((a) => a.name === n))];
  return (
    <Modal title={t('kept.title', { service: service.name, space: space.name })} onClose={onClose} wide>
      <p className="small muted">
        {t('kept.about', { space: space.name, service: service.name })}
        {data.yours?.length ? (data.runsHere ? t('kept.yours.here') : t('kept.yours.runner', { runner: data.service.person.name ?? t('kept.its.runner') })) : ''}
      </p>
      {signing && (
        <div className="notice">
          <T
            name="kept.enter.code"
            values={{
              site: (
                <a href={signing.url} target="_blank" rel="noopener noreferrer">
                  {new URL(signing.url).hostname}
                </a>
              ),
              code: <b className="user-code">{signing.code}</b>,
            }}
          />
        </div>
      )}
      {data.missing.length > 0 && <p className="note">{t('kept.needs', { what: data.missing.map((n) => label(data.asks.find((a) => a.name === n), n)).join(', ') })}</p>}
      {data.mayChange && <WhoCan space={space} service={service} />}
      {names.map((name) => {
        const asked = data.asks.find((a) => a.name === name);
        // Yours (whoever runs it): kept with it on their computer, for every project it's in; only they change it.
        const yours = asked?.yours ? (data.yours?.find((y) => y.name === name) ?? { name }) : undefined;
        const set = yours ? (yours.set ? { oauth: asked?.oauth ? (true as const) : undefined, secret: !asked?.choose, value: 'value' in yours ? yours.value : undefined } : undefined) : data.settings.find((x) => x.name === name);
        // An app of yours registered with the provider: what it is, and installing it.
        const app = yours && 'app' in yours ? yours.app : undefined;
        const appName = app ? String(app.slug ?? app.id ?? t('kept.your.app')) : undefined;
        const secret = asked?.secret ?? set?.secret ?? false;
        const mayChange = yours ? data.runsHere : data.mayChange;
        const runner = data.service.person.name ?? shortDid(data.service.person.did);
        return (
          <fieldset key={name} className="service-setting">
            <legend>
              {label(asked, name)}{' '}
              <span className="muted small">
                {name}
                {asked?.optional ? t('kept.optional') : ''}
              </span>
            </legend>
            {asked?.hint && <p className="small muted">{ts(`settings.${fieldName(asked.name)}.hint`, asked.hint)}</p>}
            <p className="small">
              {yours && !data.runsHere ? (
                t('kept.runners', { runner })
              ) : app && typeof app.html_url === 'string' ? (
                <>
                  {t('kept.made')}{' '}
                  <a href={app.html_url} target="_blank" rel="noopener noreferrer">
                    {appName}
                  </a>
                </>
              ) : set ? (
                set.oauth ? (
                  t('kept.signed.in')
                ) : secret ? (
                  t('kept.set.secret')
                ) : asked?.choose ? (
                  (set.value ?? '').split('\n').filter(Boolean).join(', ')
                ) : (
                  <code>{set.value}</code>
                )
              ) : (
                t(asked?.oauth ? 'kept.not.signed.in' : asked?.register ? 'kept.not.made' : asked?.choose ? 'kept.none.chosen' : 'kept.not.set')
              )}
              {yours && data.runsHere && <span className="muted"> {t('kept.yours.every.project')}</span>}
              {set && 'by' in set && (
                <span className="muted">
                  {' '}
                  · {set.by.name ?? shortDid(set.by.did)}, {ago(set.time)}
                </span>
              )}
            </p>
            {mayChange && asked?.choose && <ChooseSetting space={space.id} service={service} action={asked.choose.action} many={!!asked.choose.many} value={set?.value ?? ''} onSave={(value) => save(name, value)} />}
            {mayChange && !asked?.choose && (
              <div className="field-row">
                {app && yours && 'next' in yours && yours.next && (
                  <button className="default" onClick={() => window.open(yours.next, '_blank', 'noopener')}>
                    {t('kept.install.repos')}
                  </button>
                )}
                {asked?.oauth || asked?.register ? (
                  <AsyncButton
                    className="default"
                    onClick={() =>
                      attempt(async () => {
                        const { id, url, code } = await api<{ id: string; url: string; code?: string }>('startServiceSignIn', { space: space.id, service: service.did, name });
                        // A sign-in with a code: the code to enter there, shown here (and copied) until it's done.
                        if (code) {
                          void navigator.clipboard?.writeText(code).catch(() => {});
                          setSigning({ code, url });
                        }
                        window.open(url, '_blank', 'noopener');
                        try {
                          await api('finishServiceSignIn', { id });
                        } finally {
                          setSigning(undefined);
                          reload();
                          serviceChanged(service.did);
                        }
                      }, asked.register ? t('kept.app.is.made', { app: label(asked, name) }) : t('kept.service.signed.in', { service: service.name }))
                    }
                  >
                    {asked.register
                      ? t(set ? 'kept.make.another.on' : 'kept.make.on', { app: lowerFirst(label(asked, name)), site: new URL(asked.register.page).hostname })
                      : set
                        ? t('kept.sign.in.again')
                        : t('kept.sign.in.with', { site: new URL(asked.oauth!.authorize ?? asked.oauth!.device ?? asked.oauth!.token).hostname.replace(/^(www|api|accounts)\./, '') })}
                  </AsyncButton>
                ) : (
                  <>
                    <input className="grow" type={secret ? 'password' : 'text'} value={values[name] ?? (secret ? '' : (set?.value ?? ''))} placeholder={secret ? t(set ? 'kept.new.value' : 'kept.its.value') : ''} onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))} />
                    <AsyncButton className="default" disabled={!(values[name] ?? '').trim()} onClick={() => save(name, values[name].trim(), secret)}>
                      {t(set ? 'kept.change' : 'svc.set.button')}
                    </AsyncButton>
                  </>
                )}
                {set && <AsyncButton onClick={() => save(name, null)}>{t('button.remove')}</AsyncButton>}
              </div>
            )}
          </fieldset>
        );
      })}
      {data.mayChange && !data.asks.length && (
        <fieldset className="service-setting">
          <legend>{t('kept.another.setting')}</legend>
          <div className="field-row">
            <input placeholder={t('kept.name.placeholder')} value={extra.name} onChange={(e) => setExtra({ ...extra, name: e.target.value.toUpperCase() })} />
            <input className="grow" type={extra.secret ? 'password' : 'text'} placeholder={t('svc.value')} value={extra.value} onChange={(e) => setExtra({ ...extra, value: e.target.value })} />
            <input id="extra-secret" type="checkbox" checked={extra.secret} onChange={(e) => setExtra({ ...extra, secret: e.target.checked })} />
            <label htmlFor="extra-secret" className="small">
              {t('kept.secret')}
            </label>
            <AsyncButton disabled={!extra.name || !extra.value} onClick={() => save(extra.name, extra.value, extra.secret).then(() => setExtra({ name: '', value: '', secret: true }))}>
              {t('svc.set.button')}
            </AsyncButton>
          </div>
        </fieldset>
      )}
      {!data.mayChange && <p className="small muted">{t('kept.only.maintainers', { space: space.name })}</p>}
      <div className="buttons">
        <button onClick={onClose}>{t('button.close')}</button>
      </div>
    </Modal>
  );
}

/** A group of people, as a section's title. */
export const whoLabel = (who: ActionWho, space: string, groups: Array<{ id: string; name: string }>): string =>
  who === 'members' ? t('who.everyone.in', { space }) : who === 'maintainers' ? t('who.maintainers') : who === 'owner' ? t('who.owner') : 'board' in who ? t('who.readers.of', { board: who.board }) : t('who.members.of', { group: groups.find((g) => g.id === who.group)?.name ?? t('who.a.group') });

export const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

/** Broadest first: everyone, then a board's readers or a group, then maintainers, then the owner. */
const breadth = (who: ActionWho): number => (who === 'members' ? 0 : who === 'maintainers' ? 2 : who === 'owner' ? 3 : 1);

/** Where a project may move an action: as narrow as its contract says, or narrower (never wider). */
function narrower(declared: ActionWho, boards: string[], groups: Array<{ id: string }>): ActionWho[] {
  const all: ActionWho[] = ['members', ...boards.map((board) => ({ board })), ...groups.map((g) => ({ group: g.id })), 'maintainers', 'owner'];
  if (typeof declared === 'object') return [declared];
  return all.filter((w) => breadth(w) >= breadth(declared) && (declared === 'members' || typeof w === 'string'));
}

/** Something done with a service besides its contract's actions: asking it, getting access, running it, its settings. */
export interface ScopedAction {
  key: string;
  label: string;
  /** Whose: a group of people here, or 'runner': only whoever runs the service. */
  who: ActionWho | 'runner';
  mine: boolean;
  run(): void;
  /** Its contract's actions this stands in for. */
  replaces?: string[];
  /** Only where the service has no page of its own shown (asking it in words: its page is how one talks to it). */
  withoutPage?: true;
}

/**
 * Everything one can do with a service, by who may: a section per group (everyone, a board's readers, a group's
 * members, maintainers, the owner, and whoever runs it). Yours are buttons; the others say whose they are. Who may use
 * which is changed in its settings (maintainers).
 */
export function ActionScopes({ space, service, groups, extras, covered }: { space: { id: string; name: string }; service: { did: string; name: string; contract: ServiceContract; texts?: TextPackage[] }; groups: Array<{ id: string; name: string }>; extras: ScopedAction[]; covered?: string[] }) {
  const { t } = useTexts();
  const { ts } = useServiceTexts(service.texts);
  const { data: actions } = useApi(() => (service.contract.actions?.length ? api<ServiceActionInfo[]>('serviceActions', { space: space.id, service: service.did }) : Promise.resolve([] as ServiceActionInfo[])).catch(() => [] as ServiceActionInfo[]), [space.id, service.did]);
  const { data: panels } = useApi(() => api<ServicePanelInfo[]>('servicePanels', { space: space.id, service: service.did }).catch(() => [] as ServicePanelInfo[]), [space.id, service.did]);
  const { data: lists } = useApi(() => api<ServiceListInfo[]>('serviceLists', { space: space.id, service: service.did }).catch(() => [] as ServiceListInfo[]), [space.id, service.did]);
  const [using, setUsing] = useState<ServiceActionInfo>();
  // Its lists stand in for the actions they use: their buttons are on them.
  const listed = (lists ?? []).flatMap((l) => [l.list, ...(l.add?.action ? [l.add.action] : []), ...(l.remove ? [l.remove.action] : []), ...(l.use?.action ? [l.use.action] : []), ...(l.covers ?? [])]);
  // An option of the app's own can stand in for one of its actions (a picker for publishing a release, say), and so can
  // one of its own pages, where it's shown.
  // And Weave's own view of what it does (a website service's running websites, say): `covered`.
  const replaced = new Set([...extras.flatMap((e) => e.replaces ?? []), ...(panels ?? []).filter((p) => p.mine).flatMap((p) => p.covers ?? []), ...(covered ?? []), ...listed]);
  // Its own pages: in their section, only for who may see them.
  const shown = (panels ?? []).filter((p) => p.mine);
  const all: ScopedAction[] = [...(actions ?? []).filter((a) => !replaced.has(a.name)).map((a): ScopedAction => ({ key: `action:${a.name}`, label: `${ts(`actions.${a.name}.label`, a.label)}…`, who: a.who, mine: a.mine, run: () => setUsing(a) })), ...extras.filter((e) => !(e.withoutPage && (shown.length || lists?.length)))];
  if (!all.length && !shown.length && !lists?.length) return null;
  const rank = (w: ActionWho | 'runner') => (w === 'runner' ? 4 : breadth(w));
  const sections = [...new Map([...all.map((a) => a.who), ...shown.map((p) => p.who)].map((w) => [JSON.stringify(w), w])).values()].sort((a, b) => rank(a) - rank(b));
  const title = (w: ActionWho | 'runner') => (w === 'runner' ? t('who.only.you.run') : whoLabel(w, space.name, groups));
  const options = sections.filter((who) => all.some((a) => JSON.stringify(a.who) === JSON.stringify(who)));
  return (
    <div className="action-scopes">
      {/* Its lists first (the same for every service), then its own pages (each shown only to who may see it), then what one can do with it, by who may. */}
      {(lists ?? []).map((l) => (
        <ServiceList key={l.name} space={space} service={service} list={l} actions={actions ?? []} />
      ))}
      {shown.map((p) => (
        <div className="service-panel-box" key={p.name}>
          {p.who !== 'members' && <div className="small muted">{t('who.see.this', { who: title(p.who) })}</div>}
          <ServicePanel space={space} service={service} panel={{ ...p, title: ts(`panels.${p.name}.title`, p.title) }} actions={actions ?? []} />
        </div>
      ))}
      {options.map((who) => (
        <div className="action-scope" key={JSON.stringify(who)}>
          <div className="action-scope-title small">{title(who)}</div>
          <div className="action-row">
            {all
              .filter((a) => JSON.stringify(a.who) === JSON.stringify(who))
              .map((a) => (
                <button key={a.key} disabled={!a.mine} title={a.mine ? undefined : t('who.only', { who: lowerFirst(title(a.who)) })} onClick={a.run}>
                  {a.label}
                </button>
              ))}
          </div>
        </div>
      ))}
      {using && <ActionDialog space={space} service={service} action={using} onClose={() => setUsing(undefined)} />}
    </div>
  );
}

/** Who may use each of a service's actions here (in its settings): maintainers make one narrower than its contract, never wider. */
function WhoCan({ space, service }: { space: { id: string; name: string }; service: { did: string; texts?: TextPackage[] } }) {
  const { t } = useTexts();
  const { ts } = useServiceTexts(service.texts);
  const { data: actions, reload } = useApi(() => api<ServiceActionInfo[]>('serviceActions', { space: space.id, service: service.did }).catch(() => [] as ServiceActionInfo[]), [space.id, service.did]);
  const { data: info } = useApi(() => api<{ groups: Array<{ id: string; name: string }> }>('project', space.id).catch(() => ({ groups: [] })), [space.id]);
  const { data: boards } = useApi(() => api<Array<{ name: string }>>('boards', space.id).catch(() => []), [space.id]);
  if (!actions?.length) return null;
  const groups = info?.groups ?? [];
  const move = (a: ServiceActionInfo, to: string) => attempt(() => api('setServicePolicy', { space: space.id, service: service.did, action: a.name, who: to === JSON.stringify(a.declared) ? null : JSON.parse(to) }).then(reload));
  return (
    <fieldset className="service-setting">
      <legend>{t('who.can')}</legend>
      {actions.map((a) => {
        const options = narrower(a.declared, (boards ?? []).map((b) => b.name), groups);
        return (
          <div className="field-row" key={a.name}>
            <span className="grow">
              {ts(`actions.${a.name}.label`, a.label)}
              {JSON.stringify(a.who) !== JSON.stringify(a.declared) && <span className="small muted"> {t('who.its.contract', { who: lowerFirst(whoLabel(a.declared, space.name, groups)) })}</span>}
            </span>
            {options.length > 1 ? (
              <select value={JSON.stringify(a.who)} onChange={(e) => void move(a, e.target.value)}>
                {options.map((w) => (
                  <option key={JSON.stringify(w)} value={JSON.stringify(w)}>
                    {whoLabel(w, space.name, groups)}
                  </option>
                ))}
              </select>
            ) : (
              <span className="small">{whoLabel(a.who, space.name, groups)}</span>
            )}
          </div>
        );
      })}
      <p className="small muted">{t('who.narrower')}</p>
    </fieldset>
  );
}

export function ActionDialog({ space, service, action, onClose }: { space: { id: string; name: string }; service: { did: string; name: string; texts?: TextPackage[] }; action: ServiceActionInfo; onClose(): void }) {
  const { t } = useTexts();
  const { ts } = useServiceTexts(service.texts);
  const label = ts(`actions.${action.name}.label`, action.label);
  const [values, setValues] = useState<Record<string, string>>({});
  const [asked, setAsked] = useState<string>();
  const { data: answer } = useApi(
    () => (asked ? api<ServiceRequestInfo[]>('serviceRequests', { space: space.id, service: service.did }).then((all) => all.find((r) => r.id === asked)?.results[0]) : Promise.resolve(undefined)),
    [asked],
  );
  const missing = (action.input ?? []).some((f) => !f.optional && !values[f.name]?.trim());
  return (
    <Modal title={`${label} · ${service.name}`} onClose={onClose}>
      {!asked ? (
        <>
          {(action.input ?? []).map((f) => (
            <div className="app-setting" key={f.name}>
              <label htmlFor={`action-${f.name}`}>
                {ts(`actions.${action.name}.input.${fieldName(f.name)}.label`, f.label)}
                {f.optional ? <span className="muted"> {t('setting.optional')}</span> : null}
              </label>
              <input id={`action-${f.name}`} className="wide" type={f.secret ? 'password' : 'text'} value={values[f.name] ?? ''} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))} />
            </div>
          ))}
          <div className="buttons">
            <AsyncButton
              className="default"
              disabled={missing}
              onClick={() =>
                attempt(async () => {
                  const data = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()));
                  const r = await api<ServiceRequestInfo>('askService', { space: space.id, service: service.did, text: action.label, action: action.name, ...(Object.keys(data).length ? { data } : {}) });
                  setAsked(r.id);
                })
              }
            >
              {label}
            </AsyncButton>
          </div>
        </>
      ) : answer ? (
        <p className={answer.error ? 'error-text' : ''}>{answer.error ?? (answer.text || t('action.done'))}</p>
      ) : (
        <p className="small muted">{t('action.asked', { name: service.name })}</p>
      )}
      <div className="buttons">
        <button onClick={onClose}>{t('button.close')}</button>
      </div>
    </Modal>
  );
}

/**
 * The app's look around a service's page, for the page to follow (dark or light, the skin's colours): its text, a
 * quieter text, links, lines, buttons, font, and whether it's dark.
 */
function themeAround(frame: HTMLElement | null): Record<string, string> | undefined {
  const box = frame?.closest('fieldset');
  if (!box) return undefined;
  const css = getComputedStyle(box);
  const button = box.querySelector('button');
  const b = button ? getComputedStyle(button) : undefined;
  const muted = box.querySelector('.muted');
  const link = box.querySelector('a');
  return {
    scheme: getComputedStyle(document.documentElement).colorScheme.includes('dark') ? 'dark' : 'light',
    text: css.color,
    muted: muted ? getComputedStyle(muted).color : css.color,
    link: link ? getComputedStyle(link).color : css.color,
    line: css.borderTopColor,
    font: css.fontFamily,
    ...(b ? { buttonBg: b.backgroundColor, buttonText: b.color, buttonBorder: b.borderTopColor, buttonRadius: b.borderTopLeftRadius } : {}),
  };
}

/**
 * A service's own page in its card: its panel, sandboxed with no network (like a board's view). It learns where it is
 * and which actions you may use, uses them by asking (the node that runs the service checks who may, as for buttons),
 * and gets the service's answer back; it may say how tall it is.
 *
 *   to it:    {weave: 'view', panel, space, me, actions, boards, theme} (again when something changed; theme: the app's look)   {weave: 'acted', id, text?, data?, error?}
 *   from it:  {weave: 'act', id, name, input}               {weave: 'height', px}   {weave: 'visit', website} (to Live)
 */
function ServicePanel({ space, service, panel, actions }: { space: { id: string; name: string }; service: { did: string; name: string }; panel: ServicePanelInfo; actions: ServiceActionInfo[] }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(160);
  const [proving, setProving] = useState<string>();
  const { data: base } = useApi(async () => bridge.lensBase(panel.key), [panel.key]);
  const { data: boards } = useApi(() => api<Array<{ name: string }>>('boards', space.id).catch(() => []), [space.id]);
  const latest = useRef(actions);
  latest.current = actions;
  const boardNames = useRef<string[]>([]);
  boardNames.current = (boards ?? []).map((b) => b.name);
  const send = (message: unknown) => frame.current?.contentWindow?.postMessage(message, '*');
  const sendView = () =>
    send({ weave: 'view', panel: { name: panel.name, title: panel.title }, space, service: { name: service.name }, actions: latest.current.map((a) => ({ name: a.name, label: a.label, mine: a.mine, ...(a.input ? { input: a.input } : {}) })), boards: boardNames.current, theme: themeAround(frame.current) });
  // Again whenever something changed here (a website opened, a setting changed): it shows what's current. Not for
  // requests to services and their answers: a page that asks its service on each view would ask on and on.
  useEffect(sendView, [actions, boards]);
  useEffect(() => {
    let soon: ReturnType<typeof setTimeout> | undefined;
    const again = () => (clearTimeout(soon), (soon = setTimeout(sendView, 300)));
    const off = onItem((item) => {
      if (item.kind === 'weave.service.request' || item.kind === 'weave.service.result') return;
      again();
    });
    // Its settings changed here (a sign-in of yours is no event anywhere): a moment later, once it started again.
    const changed = (event: Event) => (event as CustomEvent<string>).detail === service.did && setTimeout(again, 1500);
    addEventListener(SERVICE_CHANGED, changed);
    return () => (off(), clearTimeout(soon), removeEventListener(SERVICE_CHANGED, changed));
  }, [service.did]);
  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const m = event.data as { weave?: string; id?: unknown; name?: unknown; input?: unknown; px?: unknown };
      if (m?.weave === 'height' && typeof m.px === 'number') setHeight(Math.max(40, Math.min(1200, Math.round(m.px))));
      // A running website it shows: its window is in the project's Live.
      if (m?.weave === 'visit') location.hash = `#/p/${space.id}/live`;
      // Proving an account elsewhere here (its services give access by it): Weave asks for it, never the page.
      if (m?.weave === 'account' && typeof (m as { platform?: unknown }).platform === 'string') setProving(String((m as { platform: string }).platform));
      if (m?.weave === 'act' && typeof m.name === 'string') {
        const action = latest.current.find((a) => a.name === m.name);
        void (async () => {
          try {
            send({ weave: 'acted', id: m.id, ...(await askAndWait(space.id, service, String(m.name), m.input, action?.label)) });
          } catch (error) {
            send({ weave: 'acted', id: m.id, error: (error as Error).message });
          }
        })();
      }
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [space.id, service.did]);
  if (!base) return null;
  return (
    <>
      <iframe ref={frame} className="service-panel" title={panel.title} src={`${base}${panel.page}`} sandbox="allow-scripts" referrerPolicy="no-referrer" style={{ height }} onLoad={sendView} />
      {proving && <AccountProofDialog space={{ id: space.id, name: space.name } as SpaceInfo} platform={proving} onClose={() => setProving(undefined)} />}
    </>
  );
}
