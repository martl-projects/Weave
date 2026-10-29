import { useEffect, useRef, useState } from 'react';
import type { FetcherInfo, KeyInfo, ServiceActionInfo, ServicePanelInfo, ServiceInfo, ServiceOriginInfo, ServiceProfileInfo, ServiceRequestInfo, ServiceSettingsInfo, SpaceInfo } from '@weave/node/client';
import type { ActionWho, ServiceContract } from '@weave/core';
import { bridge } from './bridge.ts';
import { Icon } from './icons.tsx';
import { AccountProofDialog } from './accounts.tsx';
import { ago, api, bump, onItem, shortDid, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Modal } from './ui.tsx';

/*
 * Services: code you run under a key of its own, with exactly the rights its contract declares. In Keys & devices
 * you add them (on this computer or an always-on node), set them up and stop them; in a space, members see the
 * services there, read what they do, and ask them.
 */

/** A contract in plain words. */
export function contractText(c: ServiceContract): string {
  const reads = c.reads === 'nothing' ? 'reads nothing and takes no requests' : c.reads === 'addressed' ? 'reads only what is asked of it' : c.reads === 'space' ? 'reads everything in its spaces' : `reads what is asked of it, and ${c.reads.kinds.join(', ')}`;
  const answers = c.reads === 'nothing' ? '' : ' and its answers';
  const writes = c.writes.length ? `writes ${c.writes.join(', ')}${answers}` : c.reads === 'nothing' ? 'writes nothing' : 'writes only its answers';
  return `${reads}; ${writes}${c.website ? '; serves websites' : ''}${c.offers?.length ? `; offers ${c.offers.join(', ')}` : ''}${c.net?.length ? `; talks to ${c.net.join(', ')} over HTTPS` : ''} (contract ${c.version})`;
}

/** Where a service comes from, and whether this computer could check it. */
export function OriginText({ origin }: { origin: ServiceOriginInfo }) {
  if (origin.kind === 'weave') return <div className="small muted">Part of Weave</div>;
  if (origin.kind === 'unreleased') return null;
  if (origin.kind === 'shipped') return origin.checked === 'verified' ? <div className="small muted">✓ Made by Weave</div> : <div className="small muted">Made by another version of Weave</div>;
  const where = origin.project.name ? `p/${origin.project.name}` : "a project you aren't in";
  if (origin.checked === 'verified') return <div className="small muted">✓ From {where}, version {origin.tag}</div>;
  if (origin.checked === 'unmatched') return <div className="small error-text">Claims to be from {where}, but isn't: don't trust it</div>;
  return <div className="small muted">From {where}, version {origin.tag}</div>;
}

/** Every kind name, comma or space separated. */
const kinds = (text: string) => text.split(/[\s,]+/).map((k) => k.trim()).filter(Boolean);

/** The spaces a service may be in: groups, projects and communities, not direct chats. */
function useServiceSpaces(): SpaceInfo[] {
  const { data } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  return (data ?? []).filter((s) => s.kind !== 'direct');
}

function SpacePicker({ value, onChange }: { value: string[]; onChange(ids: string[]): void }) {
  const spaces = useServiceSpaces();
  if (!spaces.length) return <p className="small muted">You're in no group, project or community yet.</p>;
  return (
    <div className="sunken service-spaces">
      {spaces.map((s) => (
        <div className="field-row" key={s.id}>
          <input type="checkbox" id={`svc-space-${s.id}`} checked={value.includes(s.id)} onChange={(e) => onChange(e.target.checked ? [...value, s.id] : value.filter((id) => id !== s.id))} />
          <label htmlFor={`svc-space-${s.id}`}>
            {s.name} <span className="small muted">{s.kind}</span>
          </label>
        </div>
      ))}
    </div>
  );
}

/** Split a command line into its parts, keeping quoted ones together. */
const commandParts = (text: string) => [...text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)].map((m) => m[1] ?? m[2] ?? m[3]);

function AddServiceDialog({ nodes, onClose }: { nodes: KeyInfo[]; onClose(): void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [reads, setReads] = useState<'nothing' | 'addressed' | 'kinds' | 'space'>('addressed');
  const [readKinds, setReadKinds] = useState('');
  const [writes, setWrites] = useState('');
  const [website, setWebsite] = useState(false);
  const [spaces, setSpaces] = useState<string[]>([]);
  const [where, setWhere] = useState('');
  const [command, setCommand] = useState('');
  const contract: ServiceContract = { reads: reads === 'kinds' ? { kinds: kinds(readKinds) } : reads, writes: kinds(writes), ...(website ? { website: true } : {}), version: '1.0' };
  const add = async () => {
    const done = await attempt(
      () => api('addService', { name: name.trim(), description, contract, spaces, ...(command.trim() ? { command: commandParts(command) } : {}), ...(where ? { node: where } : {}) }).then(() => (bump(), true)),
      `${name} is set up${where ? `: its key went to ${where}` : ''}`,
    );
    if (done !== undefined) onClose();
  };
  return (
    <Modal title="Add a service" onClose={onClose} wide>
      <p className="small">
        A service is code you run under a key of its own. It signs as you · {name || 'its name'}, and only what its contract says: nothing else, never as you. It reads only in the
        spaces you add it to.
      </p>
      <div className="field-row-stacked">
        <label htmlFor="svc-name">Name</label>
        <input id="svc-name" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="files" spellCheck={false} />
      </div>
      <div className="field-row-stacked">
        <label htmlFor="svc-description">What it does</label>
        <input id="svc-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Your NAS's folders, for the family" />
      </div>
      <fieldset>
        <legend>What it reads</legend>
        <div className="field-row">
          <input type="radio" id="svc-reads-nothing" checked={reads === 'nothing'} onChange={() => setReads('nothing')} />
          <label htmlFor="svc-reads-nothing">Nothing: it takes no requests (a website, say)</label>
        </div>
        <div className="field-row">
          <input type="radio" id="svc-reads-addressed" checked={reads === 'addressed'} onChange={() => setReads('addressed')} />
          <label htmlFor="svc-reads-addressed">Only what members ask it (the safest)</label>
        </div>
        <div className="field-row">
          <input type="radio" id="svc-reads-kinds" checked={reads === 'kinds'} onChange={() => setReads('kinds')} />
          <label htmlFor="svc-reads-kinds">That, and some kinds:</label>
          <input className="grow" value={readKinds} onChange={(e) => (setReadKinds(e.target.value), setReads('kinds'))} placeholder="weave.post, weave.github.account" spellCheck={false} />
        </div>
        <div className="field-row">
          <input type="radio" id="svc-reads-space" checked={reads === 'space'} onChange={() => setReads('space')} />
          <label htmlFor="svc-reads-space">Everything in its spaces</label>
        </div>
      </fieldset>
      <div className="field-row-stacked">
        <label htmlFor="svc-writes">What it may write, besides its answers</label>
        <input id="svc-writes" value={writes} onChange={(e) => setWrites(e.target.value)} placeholder="nothing (or kinds like weave.msg)" spellCheck={false} />
      </div>
      <div className="field-row">
        <input type="checkbox" id="svc-website" checked={website} onChange={(e) => setWebsite(e.target.checked)} />
        <label htmlFor="svc-website">It serves a website (a page members open)</label>
      </div>
      <div className="field-row-stacked">
        <label>In these spaces</label>
        <SpacePicker value={spaces} onChange={setSpaces} />
      </div>
      <div className="field-row-stacked">
        <label htmlFor="svc-where">Where it runs</label>
        <select id="svc-where" value={where} onChange={(e) => setWhere(e.target.value)}>
          <option value="">On this computer</option>
          {nodes.map((n) => (
            <option key={n.did} value={n.name!.slice(5)}>
              On the always-on node {n.name!.slice(5)}
            </option>
          ))}
        </select>
        {where && <span className="small muted">Its key is made here and sent to {where}, sealed so only that node opens it. It isn't kept on this computer.</span>}
      </div>
      <div className="field-row-stacked">
        <label htmlFor="svc-command">How to start it</label>
        <input id="svc-command" value={command} onChange={(e) => setCommand(e.target.value)} placeholder="node files-service.js" spellCheck={false} />
        <span className="small muted">It gets its service API and token (WEAVE_SERVICE_API, WEAVE_SERVICE_TOKEN), Weave’s app API for who is who (WEAVE_API, WEAVE_TOKEN), and its settings, as environment variables. Leave it empty if something else uses its token.</span>
      </div>
      <p className="small">
        <b>Its contract:</b> {contractText(contract)}.
      </p>
      <div className="buttons">
        <button onClick={onClose}>Cancel</button>
        <AsyncButton className="default" onClick={add}>
          Add service
        </AsyncButton>
      </div>
    </Modal>
  );
}

/** A service's settings: its spaces, how it starts, and secret settings (written here, never shown again). */
function ServiceSettingsDialog({ service, onClose }: { service: ServiceInfo; onClose(): void }) {
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
      `${service.name} is set${service.node ? ` (${service.node.name} takes it over)` : ''}`,
    );
    if (done !== undefined) onClose();
  };
  return (
    <Modal title={`${service.name}: settings`} onClose={onClose} wide>
      <div className="field-row-stacked">
        <label htmlFor="svc-set-description">What it does</label>
        <input id="svc-set-description" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="field-row-stacked">
        <label>In these spaces</label>
        <SpacePicker value={spaces} onChange={setSpaces} />
      </div>
      {!service.builtin && !service.artifact && (
        <div className="field-row-stacked">
          <label htmlFor="svc-set-command">How to start it</label>
          <input id="svc-set-command" value={command} onChange={(e) => setCommand(e.target.value)} spellCheck={false} />
        </div>
      )}
      <fieldset>
        <legend>Settings</legend>
        <p className="small">
          Passed to it as environment variables. Values stay on {service.node ? `${service.node.name}` : 'this computer'}, sealed; they're never shown again, only replaced or removed.
        </p>
        {names.map((n) => (
          <div className="field-row" key={n}>
            <code className="grow">{n}</code>
            <span className="small muted">{settings[n] !== undefined ? 'changed' : 'set'}</span>
            <button onClick={() => setSettings({ ...settings, [n]: null })}>Remove</button>
          </div>
        ))}
        <div className="field-row">
          <input value={key} onChange={(e) => setKey(e.target.value.toUpperCase())} placeholder="NAS_FOLDER" spellCheck={false} />
          <input className="grow" type="password" value={value} onChange={(e) => setValue(e.target.value)} placeholder="value" />
          <button disabled={!key || !value} onClick={() => (setSettings({ ...settings, [key]: value }), setKey(''), setValue(''))}>
            Set
          </button>
        </div>
      </fieldset>
      <div className="buttons">
        <button onClick={onClose}>Cancel</button>
        <AsyncButton className="default" onClick={save}>
          Save
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
  const { data: fetchers } = useApi(() => api<FetcherInfo[]>('fetchers'), []);
  const [editing, setEditing] = useState<FetcherInfo>();
  if (!fetchers?.length) return null;
  return (
    <fieldset>
      <legend>Fetchers</legend>
      <p className="small">
        A project's provider can hand out its artifacts through a fetcher: it grants you access, and your fetcher gets the files with it, here. Each file is checked against
        what the project released. A fetcher only works for the projects you allow.
      </p>
      {fetchers.map((f) => (
        <div className="service-row" key={f.name}>
          <Icon name="download" />
          <div className="grow">
            <b>{f.title}</b>{' '}
            <span className="small muted">
              {!f.added ? 'not added' : f.projects === 'all' ? 'for all your projects' : f.projects.length ? `for ${f.projects.map((p) => `p/${p.name}`).join(', ')}` : 'for no project'}
            </span>
            {f.about && <div className="small">{f.about}</div>}
            {f.net.length > 0 && <div className="small muted">Reaches {f.net.join(', ')} only.</div>}
            {f.problem && <div className="small error-text">{f.problem}</div>}
          </div>
          <div className="service-actions">
            <button onClick={() => setEditing(f)}>{f.added ? 'Settings…' : 'Add…'}</button>
            {f.added && (
              <AsyncButton onClick={async () => (await ask(`Remove ${f.title}? It fetches for no project any more, and your settings for it are gone.`, 'Remove')) && attempt(() => api('removeFetcher', f.name).then(bump), `${f.title} is removed`)}>
                Remove
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
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const projects = (spaces ?? []).filter((s) => s.kind === 'project');
  const [all, setAll] = useState(fetcher.projects === 'all');
  const [picked, setPicked] = useState<string[]>(fetcher.projects === 'all' ? [] : fetcher.projects.map((p) => p.id));
  const [values, setValues] = useState<Record<string, string>>({});
  const settings = Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim()));
  return (
    <Modal title={`${fetcher.title}: ${fetcher.added ? 'settings' : 'add it'}`} onClose={onClose}>
      <p className="small">It fetches for these projects only. Their providers' grants never reach it anywhere else.</p>
      <div className="field-row">
        <input type="checkbox" id="fetcher-all" checked={all} onChange={(e) => setAll(e.target.checked)} />
        <label htmlFor="fetcher-all">All my projects</label>
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
            placeholder={fetcher.filled.includes(s.name) ? 'set (type to replace)' : s.optional ? 'optional' : ''}
            value={values[s.name] ?? ''}
            onChange={(e) => setValues({ ...values, [s.name]: e.target.value })}
          />
        </div>
      ))}
      {fetcher.settings.some((s) => s.hint) && <p className="small muted">{fetcher.settings.map((s) => s.hint).filter(Boolean).join(' · ')}</p>}
      <p className="small muted">Your settings stay sealed on this computer: never in a project.</p>
      <div className="buttons">
        <AsyncButton
          className="default"
          onClick={() =>
            attempt(async () => {
              const to = all ? 'all' : picked;
              if (!fetcher.added) {
                if (!all && !picked.length) throw new Error('pick the projects it fetches for');
                await api('addFetcher', { shipped: fetcher.name, projects: to });
              }
              await api('setFetcher', { name: fetcher.name, projects: to, ...(Object.keys(settings).length ? { settings } : {}) });
              bump();
              onClose();
            }, fetcher.added ? `${fetcher.title} is set` : `${fetcher.title} is added`)
          }
        >
          {fetcher.added ? 'Save' : 'Add'}
        </AsyncButton>
        <button onClick={onClose}>Cancel</button>
      </div>
    </Modal>
  );
}

export function ServicesBox({ keys }: { keys: KeyInfo[] }) {
  const { data: services } = useApi(() => api<ServiceInfo[]>('services'), []);
  const nodes = keys.filter((k) => k.name?.startsWith('node:') && k.revokedAfter === undefined);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ServiceInfo>();
  return (
    <fieldset>
      <legend>Services</legend>
      {(services ?? []).map((s) => (
        <div className="service-row" key={s.name}>
          <Icon name="gear" />
          <div className="grow">
            <b>{s.name}</b>{' '}
            <span className="small muted">
              {s.builtin === 'website' ? `Weave's website service · ${s.enabled ? `${s.websites?.length ?? 0} website${s.websites?.length === 1 ? '' : 's'} open here` : 'stopped'}` : s.node ? `on ${s.node.name}` : s.enabled ? (s.running ? 'running here' : s.command ? 'starting' : 'here, no command') : 'stopped'} · in{' '}
              {s.spaces.length ? s.spaces.map((x) => x.name).join(', ') : 'no spaces yet'}
            </span>
            {s.description && <div className="small">{s.description}</div>}
            <div className="small muted">{contractText(s.contract)}</div>
            {s.artifact && (
              <div className="small">
                Runs {s.artifact.name} {s.artifact.tag}, from p/{s.artifact.project.name ?? s.artifact.project.id}
                {s.artifact.progress ? ' · fetching…' : ''}
                {s.artifact.deliveredBy ? ` · delivered by ${s.artifact.deliveredBy}, checked` : ''}
                {s.artifact.error ? <span className="error-text"> · {s.artifact.error}</span> : null}
                {s.artifact.latest && (
                  <>
                    {' '}
                    · {s.artifact.latest} is out{' '}
                    <AsyncButton
                      onClick={async () =>
                        (await ask(`Run ${s.artifact!.name} ${s.artifact!.latest} as ${s.name}? It's other code: only take it if you trust p/${s.artifact!.project.name ?? 'its project'}.`, 'Take it')) &&
                        attempt(() => api('setService', { name: s.name, artifact: { tag: s.artifact!.latest }, approve: true }).then(bump), `${s.name} takes ${s.artifact!.latest}`)
                      }
                    >
                      Update…
                    </AsyncButton>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="service-actions">
            {!s.builtin && <button onClick={() => setEditing(s)}>Settings…</button>}
            <AsyncButton onClick={() => attempt(() => api('setService', { name: s.name, enabled: !s.enabled }).then(bump), s.enabled ? `${s.name} stopped` : `${s.name} started`)}>{s.enabled ? 'Stop' : 'Start'}</AsyncButton>
            <AsyncButton
              onClick={async () =>
                (await ask(`Remove ${s.name}? Its key is revoked: nothing it signs counts any more, and ${s.node ? s.node.name : 'this computer'} stops running it.`, 'Remove')) &&
                attempt(() => api('removeService', s.name).then(bump), `${s.name} is removed`)
              }
            >
              Remove
            </AsyncButton>
          </div>
        </div>
      ))}
      <p className="small">
        Code you run under a key of its own: a file browser for your NAS, a bot that answers in a group, an integration. It signs as you · its name, only what its contract allows, and
        reads only in the spaces you add it to. Run it here, or on an always-on node so it's there while your computers are off.
      </p>
      <div className="buttons">
        <button onClick={() => setAdding(true)}>Add a service…</button>
      </div>
      {adding && <AddServiceDialog nodes={nodes} onClose={() => setAdding(false)} />}
      {editing && <ServiceSettingsDialog service={editing} onClose={() => setEditing(undefined)} />}
    </fieldset>
  );
}

/** A service in a space: what it is, what it may do, asking it, and what it answered. */
export function ServiceCard({ space, service, onClose }: { space: SpaceInfo; service: ServiceProfileInfo; onClose(): void }) {
  const { data: requests, reload } = useApi(() => api<ServiceRequestInfo[]>('serviceRequests', { space: space.id, service: service.did }), [space.id, service.did]);
  const [text, setText] = useState('');
  const by = service.person.name ?? shortDid(service.person.did);
  return (
    <Modal title={`${by} · ${service.name}`} onClose={onClose} wide>
      {service.description && <p>{service.description}</p>}
      <p className="small muted">
        A service {by} runs, under a key of its own: it {contractText(service.contract)}. What it writes shows as {by} · {service.name}.
      </p>
      <div className="field-row">
        <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Ask ${service.name}…`} />
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
          Ask
        </AsyncButton>
      </div>
      <div className="service-requests">
        {(requests ?? [])
          .slice(-20)
          .reverse()
          .map((r) => (
            <div className="service-request" key={r.id}>
              <div className="small">
                <b>{r.from.name ?? shortDid(r.from.did)}</b> <span className="muted">{ago(r.time)}</span>: {r.private ? <span className="muted">asked something, for it alone</span> : r.text}
              </div>
              {r.results.length ? (
                r.results.map((x) => (
                  <div className={`small service-answer${x.error ? ' error-text' : ''}${x.private ? ' muted' : ''}`} key={x.id}>
                    {x.private ? `answered, for ${r.from.name ?? 'them'} only` : x.error ? `couldn't: ${x.error}` : x.text || JSON.stringify(x.data)}
                  </div>
                ))
              ) : (
                <div className="small muted service-answer">no answer yet{service.contract.reads === 'addressed' ? '' : ''}</div>
              )}
            </div>
          ))}
        {requests && !requests.length && <p className="small muted">Nobody asked it anything here yet.</p>}
      </div>
    </Modal>
  );
}

/** In a space's member list: its services, under the people. */
export function SpaceServices({ space }: { space: SpaceInfo }) {
  const { data: services } = useApi(() => api<ServiceProfileInfo[]>('servicesIn', space.id).catch(() => []), [space.id]);
  const [open, setOpen] = useState<ServiceProfileInfo>();
  if (!services?.length) return null;
  return (
    <>
      <h4>Services — {services.length}</h4>
      {services.map((s) => (
        <button className="member service-member" key={s.did} onClick={() => setOpen(s)} title={s.description || `${s.name}, a service ${s.person.name ?? 'someone'} runs`}>
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
  throw new Error(`${service.name} didn't answer in time`);
}

/** A setting picked from what the service lists (its action answers [{value, label?, note?}]): one, or several. */
function ChooseSetting({ space, service, action, many, value, onSave }: { space: string; service: { did: string; name: string }; action: string; many: boolean; value: string; onSave(value: string): Promise<unknown> }) {
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
          {loading ? 'Asking it…' : value ? 'Change…' : 'Choose…'}
        </button>
        {problem && <span className="small problem">{problem}</span>}
      </div>
    );
  type Choice = { value: string; label?: string; note?: string };
  const shown = [...choices, ...picked.filter((p) => !choices.some((c) => c.value === p)).map((p): Choice => ({ value: p, note: "it doesn't list it now" }))].filter((c) => !find.trim() || `${c.value} ${c.label ?? ''}`.toLowerCase().includes(find.trim().toLowerCase()));
  const toggle = (v: string) => setPicked((p) => (many ? (p.includes(v) ? p.filter((x) => x !== v) : [...p, v]) : [v]));
  return (
    <div className="choose-setting">
      <input className="wide" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find…" autoFocus />
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
        {!shown.length && <div className="small muted">{find ? 'Nothing is called that.' : 'It lists nothing.'}</div>}
      </div>
      <div className="field-row">
        <button onClick={() => setChoices(undefined)}>Cancel</button>
        <AsyncButton className="default" disabled={!picked.length} onClick={() => onSave(picked.join('\n')).then(() => setChoices(undefined))}>
          {many ? `Use these ${picked.length}` : 'Use it'}
        </AsyncButton>
      </div>
    </div>
  );
}

/** A service's settings changed here: its pages show what's current (detail: its key). */
const SERVICE_CHANGED = 'weave-service-changed';
const serviceChanged = (did: string) => dispatchEvent(new CustomEvent(SERVICE_CHANGED, { detail: did }));

export function KeptSettingsDialog({ space, service, onClose }: { space: { id: string; name: string }; service: { did: string; name: string }; onClose(): void }) {
  const { data, reload } = useApi(() => api<ServiceSettingsInfo>('serviceSettings', { space: space.id, service: service.did }), [space.id, service.did]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState({ name: '', value: '', secret: true });
  const [signing, setSigning] = useState<{ code: string; url: string }>();
  if (!data) return null;
  const save = (name: string, value: string | null, secret?: boolean) =>
    attempt(() => api('setServiceSetting', { space: space.id, service: service.did, name, value, ...(secret ? { secret: true } : {}) }).then(() => (setValues((v) => ({ ...v, [name]: '' })), reload(), bump(), serviceChanged(service.did))), value === null ? `${name} removed` : `${name} set`);
  const names = [...data.asks.map((a) => a.name), ...data.settings.map((x) => x.name).filter((n) => !data.asks.some((a) => a.name === n))];
  return (
    <Modal title={`${service.name}: settings in ${space.name}`} onClose={onClose} wide>
      <p className="small muted">
        Kept here by the maintainers of {space.name}, wherever {service.name} runs. A secret is sealed for {service.name} alone: nobody reads it back, you included. Changing one starts it again.
        {data.yours?.length ? (data.runsHere ? ' Those marked yours stay with it on this computer, for every project you run it in.' : ` Its sign-in is ${data.service.person.name ?? 'its runner'}'s, who runs it: kept on their computer, for every project they run it in.`) : ''}
      </p>
      {signing && (
        <div className="notice">
          Enter this code on{' '}
          <a href={signing.url} target="_blank" rel="noopener noreferrer">
            {new URL(signing.url).hostname}
          </a>{' '}
          (it's copied): <b className="user-code">{signing.code}</b>. Only ever enter a code Weave shows you, here.
        </div>
      )}
      {data.missing.length > 0 && <p className="note">It needs {data.missing.map((n) => data.asks.find((a) => a.name === n)?.label ?? n).join(', ')} to work.</p>}
      {data.mayChange && <WhoCan space={space} service={service} />}
      {names.map((name) => {
        const asked = data.asks.find((a) => a.name === name);
        // Yours (whoever runs it): kept with it on their computer, for every project it's in; only they change it.
        const yours = asked?.yours ? (data.yours?.find((y) => y.name === name) ?? { name }) : undefined;
        const set = yours ? (yours.set ? { oauth: asked?.oauth ? (true as const) : undefined, secret: !asked?.choose, value: 'value' in yours ? yours.value : undefined } : undefined) : data.settings.find((x) => x.name === name);
        // An app of yours registered with the provider: what it is, and installing it.
        const app = yours && 'app' in yours ? yours.app : undefined;
        const appName = app ? String(app.slug ?? app.id ?? 'your app') : undefined;
        const secret = asked?.secret ?? set?.secret ?? false;
        const mayChange = yours ? data.runsHere : data.mayChange;
        const runner = data.service.person.name ?? shortDid(data.service.person.did);
        return (
          <fieldset key={name} className="service-setting">
            <legend>
              {asked?.label ?? name} <span className="muted small">{name}{asked?.optional ? ' · optional' : ''}</span>
            </legend>
            {asked?.hint && <p className="small muted">{asked.hint}</p>}
            <p className="small">
              {yours && !data.runsHere
                ? `${runner}'s, who runs it: kept with it on their computer, for every project they run it in`
                : app && typeof app.html_url === 'string'
                  ? <>Made: <a href={app.html_url} target="_blank" rel="noopener noreferrer">{appName}</a></>
                  : set
                    ? set.oauth ? 'Signed in' : secret ? 'Set (secret)' : asked?.choose ? (set.value ?? '').split('\n').filter(Boolean).join(', ') : <code>{set.value}</code>
                    : asked?.oauth ? 'Not signed in' : asked?.register ? 'Not made yet' : asked?.choose ? 'None chosen yet' : 'Not set'}
              {yours && data.runsHere && <span className="muted"> · yours, for every project you run it in</span>}
              {set && 'by' in set && <span className="muted"> · {set.by.name ?? shortDid(set.by.did)}, {ago(set.time)}</span>}
            </p>
            {mayChange && asked?.choose && (
              <ChooseSetting space={space.id} service={service} action={asked.choose.action} many={!!asked.choose.many} value={set?.value ?? ''} onSave={(value) => save(name, value)} />
            )}
            {mayChange && !asked?.choose && (
              <div className="field-row">
                {app && yours && 'next' in yours && yours.next && (
                  <button className="default" onClick={() => window.open(yours.next, '_blank', 'noopener')}>
                    Install it on repositories…
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
                      }, asked.register ? `${asked.label} is made` : `${service.name} is signed in`)
                    }
                  >
                    {asked.register
                      ? `${set ? 'Make another' : `Make ${lowerFirst(asked.label)}`} on ${new URL(asked.register.page).hostname}…`
                      : set ? 'Sign in again…' : `Sign in with ${new URL(asked.oauth!.authorize ?? asked.oauth!.device ?? asked.oauth!.token).hostname.replace(/^(www|api|accounts)\./, '')}…`}
                  </AsyncButton>
                ) : (
                  <>
                    <input className="grow" type={secret ? 'password' : 'text'} value={values[name] ?? (secret ? '' : (set?.value ?? ''))} placeholder={secret ? (set ? 'A new value…' : 'Its value…') : ''} onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))} />
                    <AsyncButton className="default" disabled={!(values[name] ?? '').trim()} onClick={() => save(name, values[name].trim(), secret)}>
                      {set ? 'Change' : 'Set'}
                    </AsyncButton>
                  </>
                )}
                {set && <AsyncButton onClick={() => save(name, null)}>Remove</AsyncButton>}
              </div>
            )}
          </fieldset>
        );
      })}
      {data.mayChange && !data.asks.length && (
        <fieldset className="service-setting">
          <legend>Another setting</legend>
          <div className="field-row">
            <input placeholder="NAME" value={extra.name} onChange={(e) => setExtra({ ...extra, name: e.target.value.toUpperCase() })} />
            <input className="grow" type={extra.secret ? 'password' : 'text'} placeholder="value" value={extra.value} onChange={(e) => setExtra({ ...extra, value: e.target.value })} />
            <input id="extra-secret" type="checkbox" checked={extra.secret} onChange={(e) => setExtra({ ...extra, secret: e.target.checked })} />
            <label htmlFor="extra-secret" className="small">secret</label>
            <AsyncButton disabled={!extra.name || !extra.value} onClick={() => save(extra.name, extra.value, extra.secret).then(() => setExtra({ name: '', value: '', secret: true }))}>
              Set
            </AsyncButton>
          </div>
        </fieldset>
      )}
      {!data.mayChange && <p className="small muted">Only the maintainers of {space.name} change them.</p>}
      <div className="buttons">
        <button onClick={onClose}>Close</button>
      </div>
    </Modal>
  );
}

/** A group of people, as a section's title. */
export const whoLabel = (who: ActionWho, space: string, groups: Array<{ id: string; name: string }>): string =>
  who === 'members' ? `Everyone in ${space}` : who === 'maintainers' ? 'Maintainers' : who === 'owner' ? 'The owner' : 'board' in who ? `Readers of ${who.board}` : `Members of ${groups.find((g) => g.id === who.group)?.name ?? 'a group'}`;

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
export function ActionScopes({ space, service, groups, extras, covered }: { space: { id: string; name: string }; service: { did: string; name: string; contract: ServiceContract }; groups: Array<{ id: string; name: string }>; extras: ScopedAction[]; covered?: string[] }) {
  const { data: actions } = useApi(() => (service.contract.actions?.length ? api<ServiceActionInfo[]>('serviceActions', { space: space.id, service: service.did }) : Promise.resolve([] as ServiceActionInfo[])).catch(() => [] as ServiceActionInfo[]), [space.id, service.did]);
  const { data: panels } = useApi(() => api<ServicePanelInfo[]>('servicePanels', { space: space.id, service: service.did }).catch(() => [] as ServicePanelInfo[]), [space.id, service.did]);
  const [using, setUsing] = useState<ServiceActionInfo>();
  // An option of the app's own can stand in for one of its actions (a picker for publishing a release, say), and so can
  // one of its own pages, where it's shown.
  // And Weave's own view of what it does (a website service's running websites, say): `covered`.
  const replaced = new Set([...extras.flatMap((e) => e.replaces ?? []), ...(panels ?? []).filter((p) => p.mine).flatMap((p) => p.covers ?? []), ...(covered ?? [])]);
  // Its own pages: in their section, only for who may see them.
  const shown = (panels ?? []).filter((p) => p.mine);
  const all: ScopedAction[] = [...(actions ?? []).filter((a) => !replaced.has(a.name)).map((a): ScopedAction => ({ key: `action:${a.name}`, label: `${a.label}…`, who: a.who, mine: a.mine, run: () => setUsing(a) })), ...extras.filter((e) => !(e.withoutPage && shown.length))];
  if (!all.length && !shown.length) return null;
  const rank = (w: ActionWho | 'runner') => (w === 'runner' ? 4 : breadth(w));
  const sections = [...new Map([...all.map((a) => a.who), ...shown.map((p) => p.who)].map((w) => [JSON.stringify(w), w])).values()].sort((a, b) => rank(a) - rank(b));
  const title = (w: ActionWho | 'runner') => (w === 'runner' ? 'Only you (you run it)' : whoLabel(w, space.name, groups));
  const options = sections.filter((who) => all.some((a) => JSON.stringify(a.who) === JSON.stringify(who)));
  return (
    <div className="action-scopes">
      {/* Its own pages first (each shown only to who may see it), then what one can do with it, by who may. */}
      {shown.map((p) => (
        <div className="service-panel-box" key={p.name}>
          {p.who !== 'members' && <div className="small muted">{title(p.who)} see this</div>}
          <ServicePanel space={space} service={service} panel={p} actions={actions ?? []} />
        </div>
      ))}
      {options.map((who) => (
        <div className="action-scope" key={JSON.stringify(who)}>
          <div className="action-scope-title small">{title(who)}</div>
          <div className="action-row">
            {all
              .filter((a) => JSON.stringify(a.who) === JSON.stringify(who))
              .map((a) => (
                <button key={a.key} disabled={!a.mine} title={a.mine ? undefined : `Only ${lowerFirst(title(a.who))}`} onClick={a.run}>
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
function WhoCan({ space, service }: { space: { id: string; name: string }; service: { did: string } }) {
  const { data: actions, reload } = useApi(() => api<ServiceActionInfo[]>('serviceActions', { space: space.id, service: service.did }).catch(() => [] as ServiceActionInfo[]), [space.id, service.did]);
  const { data: info } = useApi(() => api<{ groups: Array<{ id: string; name: string }> }>('project', space.id).catch(() => ({ groups: [] })), [space.id]);
  const { data: boards } = useApi(() => api<Array<{ name: string }>>('boards', space.id).catch(() => []), [space.id]);
  if (!actions?.length) return null;
  const groups = info?.groups ?? [];
  const move = (a: ServiceActionInfo, to: string) => attempt(() => api('setServicePolicy', { space: space.id, service: service.did, action: a.name, who: to === JSON.stringify(a.declared) ? null : JSON.parse(to) }).then(reload));
  return (
    <fieldset className="service-setting">
      <legend>Who can</legend>
      {actions.map((a) => {
        const options = narrower(a.declared, (boards ?? []).map((b) => b.name), groups);
        return (
          <div className="field-row" key={a.name}>
            <span className="grow">
              {a.label}
              {JSON.stringify(a.who) !== JSON.stringify(a.declared) && <span className="small muted"> · its contract: {lowerFirst(whoLabel(a.declared, space.name, groups))}</span>}
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
      <p className="small muted">A project can make who may narrower than the service's contract, never wider.</p>
    </fieldset>
  );
}

function ActionDialog({ space, service, action, onClose }: { space: { id: string; name: string }; service: { did: string; name: string }; action: ServiceActionInfo; onClose(): void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [asked, setAsked] = useState<string>();
  const { data: answer } = useApi(
    () => (asked ? api<ServiceRequestInfo[]>('serviceRequests', { space: space.id, service: service.did }).then((all) => all.find((r) => r.id === asked)?.results[0]) : Promise.resolve(undefined)),
    [asked],
  );
  const missing = (action.input ?? []).some((f) => !f.optional && !values[f.name]?.trim());
  return (
    <Modal title={`${action.label} · ${service.name}`} onClose={onClose}>
      {!asked ? (
        <>
          {(action.input ?? []).map((f) => (
            <div className="app-setting" key={f.name}>
              <label htmlFor={`action-${f.name}`}>
                {f.label}
                {f.optional ? <span className="muted"> (optional)</span> : null}
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
              {action.label}
            </AsyncButton>
          </div>
        </>
      ) : answer ? (
        <p className={answer.error ? 'error-text' : ''}>{answer.error ?? (answer.text || 'Done.')}</p>
      ) : (
        <p className="small muted">Asked {service.name}: its answer shows here once it comes.</p>
      )}
      <div className="buttons">
        <button onClick={onClose}>Close</button>
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
