import { useRef, useState } from 'react';
import type { KeyInfo, ServiceInfo, ServiceOriginInfo, ServiceProfileInfo, ServiceRequestInfo, ServiceSettingsInfo, SpaceInfo } from '@weave/node/client';
import type { ServiceContract } from '@weave/core';
import { Icon } from './icons.tsx';
import { ago, api, bump, shortDid, useApi } from './lib.ts';
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
      {service.builtin === 'github' && <GitHubAppSettings service={service.name} set={service.settings.includes('GITHUB_APP_KEY')} onChange={(change) => setSettings({ ...settings, ...change })} />}
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

/**
 * The GitHub service's own GitHub App: its ID and private key. With them it acts as that App where it's installed
 * (keeping linked repositories' access in step, handing out release files), and nobody has to sign in.
 */
function GitHubAppSettings({ service, set, onChange }: { service: string; set: boolean; onChange(change: Record<string, string>): void }) {
  const [org, setOrg] = useState('');
  const [id, setId] = useState('');
  const [key, setKey] = useState('');
  const [picked, setPicked] = useState<string>();
  const file = useRef<HTMLInputElement>(null);
  const ready = /^\d+$/.test(id.trim()) && /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(key);
  return (
    <fieldset>
      <legend>GitHub App</legend>
      <p className="small">
        {set ? 'It acts as your own GitHub App.' : 'Without one, it acts with the GitHub sign-in of the computer it runs on.'} With an App of your own, nobody has to sign in, and on an always-on node it keeps
        repositories in step while your computers are off.
      </p>
      <div className="field-row">
        <input value={org} onChange={(e) => setOrg(e.target.value.trim())} placeholder="Organization on GitHub, like acme" aria-label="GitHub organization" />
        <AsyncButton
          className="default"
          onClick={() =>
            attempt(async () => {
              const { url } = await api<{ url: string }>('githubAppSetup', { service, ...(org ? { org } : {}) });
              window.open(url, '_blank', 'noopener');
            }, 'Confirm the App on GitHub, then install it: Weave takes its ID and key by itself')
          }
        >
          {set ? 'Create a new App…' : 'Create my GitHub App…'}
        </AsyncButton>
      </div>
      <p className="small muted">Opens GitHub with the App filled in (Administration: read and write, Contents and Metadata: read, no webhooks). Without an organization, it's an App of your account.</p>
      <details>
        <summary className="small">Or give an App's ID and key by hand</summary>
        <div className="field-row">
          <input value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, ''))} placeholder="App ID, like 123456" inputMode="numeric" aria-label="GitHub App ID" />
          <button type="button" onClick={() => file.current?.click()}>
            {picked ?? 'Choose its .pem key…'}
          </button>
          <input
            ref={file}
            type="file"
            accept=".pem"
            hidden
            onChange={async (e) => {
              const chosen = e.target.files?.[0];
              if (!chosen) return;
              setKey(await chosen.text());
              setPicked(chosen.name);
            }}
          />
        </div>
        {!picked && <textarea className="wide code" rows={3} value={key} onChange={(e) => setKey(e.target.value)} placeholder="…or paste the private key (-----BEGIN RSA PRIVATE KEY-----…)" spellCheck={false} aria-label="GitHub App private key" />}
        <div className="buttons">
          <button disabled={!ready} onClick={() => (onChange({ GITHUB_APP_ID: id.trim(), GITHUB_APP_KEY: key }), setId(''), setKey(''), setPicked(undefined))}>
            Use this App
          </button>
        </div>
      </details>
    </fieldset>
  );
}

/** In Keys & devices: the services you run, here and on your always-on nodes. */
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
                <b>{r.from.name ?? shortDid(r.from.did)}</b> <span className="muted">{ago(r.time)}</span>: {r.text}
              </div>
              {r.results.length ? (
                r.results.map((x) => (
                  <div className={`small service-answer${x.error ? ' error-text' : ''}`} key={x.id}>
                    {x.error ? `couldn't: ${x.error}` : x.text || JSON.stringify(x.data)}
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
export function KeptSettingsDialog({ space, service, onClose }: { space: { id: string; name: string }; service: { did: string; name: string }; onClose(): void }) {
  const { data, reload } = useApi(() => api<ServiceSettingsInfo>('serviceSettings', { space: space.id, service: service.did }), [space.id, service.did]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [extra, setExtra] = useState({ name: '', value: '', secret: true });
  if (!data) return null;
  const save = (name: string, value: string | null, secret?: boolean) =>
    attempt(() => api('setServiceSetting', { space: space.id, service: service.did, name, value, ...(secret ? { secret: true } : {}) }).then(() => (setValues((v) => ({ ...v, [name]: '' })), reload(), bump())), value === null ? `${name} removed` : `${name} set`);
  const names = [...data.asks.map((a) => a.name), ...data.settings.map((x) => x.name).filter((n) => !data.asks.some((a) => a.name === n))];
  return (
    <Modal title={`${service.name}: settings in ${space.name}`} onClose={onClose} wide>
      <p className="small muted">
        Kept here by the maintainers of {space.name}, wherever {service.name} runs. A secret is sealed for {service.name} alone: nobody reads it back, you included. Changing one starts it again.
      </p>
      {data.missing.length > 0 && <p className="note">It needs {data.missing.join(', ')} to work.</p>}
      {names.map((name) => {
        const asked = data.asks.find((a) => a.name === name);
        const set = data.settings.find((x) => x.name === name);
        const secret = asked?.secret ?? set?.secret ?? false;
        return (
          <fieldset key={name} className="service-setting">
            <legend>
              {asked?.label ?? name} <span className="muted small">{name}{asked?.optional ? ' · optional' : ''}</span>
            </legend>
            {asked?.hint && <p className="small muted">{asked.hint}</p>}
            <p className="small">
              {set ? (set.oauth ? 'Signed in' : secret ? 'Set (secret)' : <code>{set.value}</code>) : asked?.oauth ? 'Not signed in' : 'Not set'}
              {set && <span className="muted"> · {set.by.name ?? shortDid(set.by.did)}, {ago(set.time)}</span>}
            </p>
            {data.mayChange && (
              <div className="field-row">
                {asked?.oauth ? (
                  <AsyncButton
                    className="default"
                    onClick={() =>
                      attempt(async () => {
                        const { id, url } = await api<{ id: string; url: string }>('startServiceSignIn', { space: space.id, service: service.did, name });
                        window.open(url, '_blank', 'noopener');
                        await api('finishServiceSignIn', { id });
                        reload();
                      }, `${service.name} is signed in`)
                    }
                  >
                    {set ? 'Sign in again…' : `Sign in with ${new URL(asked.oauth.authorize).hostname}…`}
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
