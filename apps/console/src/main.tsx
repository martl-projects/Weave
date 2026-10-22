import { StrictMode, useCallback, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { AuditLine, AuditSinkInput, AuditStreamInfo, CompanyAction, CompanyInfo, MemberInfo, ScimInfo, SpaceInfo } from '@weave/node/client';

/*
 * The admin console for a company's Weave (stage 12): served by the company's
 * node, for the admins of the company. Everything here goes through the
 * company's node, which records who did it (packages/node/src/console.ts).
 */

type Me = { subject: string; email?: string; name?: string };
type SpaceRow = SpaceInfo & { members: Array<{ did: string; name?: string; maintainer: boolean }> };
type Line = AuditLine & { space: { id: string; name: string } };

class Unauthorized extends Error {}

async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? 'GET',
    headers: init?.body !== undefined || init?.method ? { 'content-type': 'application/json', 'x-weave-console': '1' } : {},
    ...(init?.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
  });
  if (res.status === 401) throw new Unauthorized();
  const body = (await res.json()) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? `${res.status}`);
  return body;
}

const act = (action: CompanyAction) => api<CompanyInfo>('/action', { method: 'POST', body: action });

const when = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');

/** Load something, with a way to load it again. */
function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []): { data?: T; error?: string; reload(): void } {
  const [data, setData] = useState<T>();
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    load()
      .then((d) => live && (setData(d), setError(undefined)))
      .catch((e: Error) => live && setError(e instanceof Unauthorized ? 'signed out' : e.message));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, ...deps]);
  return { data, error, reload: useCallback(() => setTick((t) => t + 1), []) };
}

/** A button that runs something, shows it's busy and reports what went wrong. */
function Run({ children, run, kind, confirm: ask, disabled }: { children: ReactNode; run: () => Promise<unknown>; kind?: 'primary' | 'danger'; confirm?: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className={`btn ${kind ?? ''}`}
      disabled={busy || disabled}
      onClick={async () => {
        if (ask && !window.confirm(ask)) return;
        setBusy(true);
        try {
          await run();
        } catch (e) {
          window.alert((e as Error).message);
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? '…' : children}
    </button>
  );
}

function Problem({ error }: { error?: string }) {
  return error ? <div className="notice error">{error}</div> : null;
}

// ------------------------------------------------------------------ pages

function Overview({ company, reload }: { company: CompanyInfo; reload(): void }) {
  const members = useLoad(() => api<MemberInfo[]>('/members'));
  const scim = useLoad(() => api<ScimInfo>('/scim'));
  const streams = useLoad(() => api<AuditStreamInfo[]>('/streams'));
  const [link, setLink] = useState<string>();
  const vouched = (members.data ?? []).filter((m) => m.attested && Date.parse(m.attested.until) > Date.now()).length;
  const p = company.policy;
  return (
    <>
      <h1>{company.name}</h1>
      <p className="lead">Your company's Weave: its people, spaces, policy and audit.</p>
      <div className="cards">
        <div className="card">
          <div className="k">People vouched for</div>
          <div className="v">{members.data ? vouched : '…'}</div>
          <div className="s">{members.data ? `${members.data.length} in the company group` : ''}</div>
        </div>
        <div className="card">
          <div className="k">Company spaces</div>
          <div className="v">{company.spaces.length + 1}</div>
          <div className="s">{company.maps.length} mapped from sign-in groups</div>
        </div>
        <div className="card">
          <div className="k">Directory (SCIM)</div>
          <div className={`v ${scim.data?.on ? 'good' : 'muted'}`}>{scim.data ? (scim.data.on ? 'On' : 'Off') : '…'}</div>
          <div className="s">{scim.data?.on ? `${scim.data.users.length} users, ${scim.data.groups.length} groups` : 'groups from sign-in tokens'}</div>
        </div>
        <div className="card">
          <div className="k">Audit streams</div>
          <div className="v">{streams.data?.length ?? '…'}</div>
          <div className={`s ${streams.data?.some((s) => s.problem) ? 'bad' : ''}`}>{streams.data?.some((s) => s.problem) ? 'a destination has a problem' : 'all delivering'}</div>
        </div>
      </div>
      <div className="panel">
        <h2>Policy in effect</h2>
        <div className="row">
          <span className="chip">{p.outside ? 'Outside spaces allowed' : "Company spaces only"}</span>
          <span className="chip">Direct chats: {{ all: 'anyone', company: 'colleagues', off: 'none' }[p.directs]}</span>
          <span className="chip">{p.public ? 'Public posting allowed' : 'No public posting'}</span>
          <span className="chip">{p.chats ? 'Colleagues chat in company chats' : 'Direct chats between colleagues'}</span>
          <span className="chip">{p.links ? 'Linking accounts allowed' : 'No linking'}</span>
          <span className="chip">Retention: {company.retention.minDays ? `≥ ${company.retention.minDays} d` : 'no minimum'}, {company.retention.maxDays ? `≤ ${company.retention.maxDays} d` : 'no maximum'}</span>
        </div>
      </div>
      <div className="panel">
        <h2>Set up a new colleague</h2>
        <p className="muted">An enrollment link sets up a company account with their company sign-in (weave enroll), or goes into your device management's settings.</p>
        <div className="row">
          <Run kind="primary" run={async () => setLink((await api<{ link: string }>('/enroll-link', { method: 'POST', body: { days: 30 } })).link)}>
            New enrollment link
          </Run>
        </div>
        {link && <p className="mono">{link}</p>}
      </div>
      <Requests company={company} reload={reload} />
    </>
  );
}

function Requests({ company }: { company: CompanyInfo; reload(): void }) {
  if (!company.requests.length) return null;
  return (
    <div className="panel">
      <h2>Requests from admins in Weave</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Who</th>
              <th>Asked for</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {[...company.requests].reverse().map((r) => (
              <tr key={r.id}>
                <td>{when(r.time)}</td>
                <td>{r.byName ?? r.by.slice(0, 16)}</td>
                <td>{r.action}</td>
                <td className={r.error ? 'bad' : r.done ? 'good' : 'warn'}>{r.error ?? (r.done ? 'done' : 'waiting')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function People({ company }: { company: CompanyInfo }) {
  const members = useLoad(() => api<MemberInfo[]>('/members'));
  const [answer, setAnswer] = useState<{ name: string; answer: string }>();
  const now = Date.now();
  return (
    <>
      <h1>People</h1>
      <p className="lead">Everyone in the company group, and what the company vouches for.</p>
      <Problem error={members.error} />
      {answer && (
        <div className="notice">
          Recovery answer for {answer.name}'s new computer (only that computer opens it: <span className="mono">weave recover &lt;answer&gt;</span>):
          <div className="mono">{answer.answer}</div>
        </div>
      )}
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Sign-in</th>
              <th>Groups</th>
              <th>Vouched until</th>
              <th>Computer</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!members.data && (
              <tr>
                <td colSpan={6} className="muted">
                  Loading…
                </td>
              </tr>
            )}
            {(members.data ?? []).map((m) => {
              const live = m.attested && Date.parse(m.attested.until) > now;
              return (
                <tr key={m.did}>
                  <td>
                    <div>{m.name ?? m.did.slice(0, 20)}</div>
                    <div className="muted">{m.did === company.did ? 'the company' : m.company ? 'company account' : 'own account'}</div>
                  </td>
                  <td>{m.attested?.email ?? m.attested?.subject ?? <span className="muted">{m.did === company.did ? '' : 'not signed in'}</span>}</td>
                  <td>{m.attested?.groups.map((g) => <span key={g} className="chip">{g}</span>)}</td>
                  <td className={live || m.did === company.did ? '' : 'warn'}>{m.attested ? (live ? when(m.attested.until) : 'lapsed') : m.did === company.did ? '' : '—'}</td>
                  <td className="muted">{m.attested?.device?.subject ?? '—'}</td>
                  <td>
                    <div className="row">
                      {m.company && (
                        <Run
                          run={async () => {
                            const request = window.prompt(`The recovery request from ${m.name}'s new computer (weave recover-request there):`);
                            if (request) setAnswer({ name: m.name ?? 'them', answer: (await api<{ answer: string }>('/recovery', { method: 'POST', body: { person: m.did, request } })).answer });
                          }}
                        >
                          New computer
                        </Run>
                      )}
                      {m.company && (
                        <Run kind="danger" confirm={`Freeze ${m.name}'s company account? Nothing it signs from now on counts anywhere. Its history stays.`} run={async () => (await act({ action: 'freeze', person: m.did }), members.reload())}>
                          Freeze
                        </Run>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Spaces({ company, reload }: { company: CompanyInfo; reload(): void }) {
  const spaces = useLoad(() => api<SpaceRow[]>('/spaces'), [company]);
  const [kind, setKind] = useState<'project' | 'group'>('project');
  const [name, setName] = useState('');
  const [map, setMap] = useState({ group: '', space: '', role: 'member' as 'member' | 'maintainer' });
  return (
    <>
      <h1>Spaces</h1>
      <p className="lead">The company's own projects and groups. Sign-in groups decide who is in them.</p>
      <Problem error={spaces.error} />
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Space</th>
              <th>Members</th>
              <th>Keys</th>
              <th>Hold</th>
            </tr>
          </thead>
          <tbody>
            {(spaces.data ?? []).map((s) => (
              <tr key={s.id}>
                <td>
                  <div>{s.name}</div>
                  <div className="muted">{s.id === company.group.id ? 'company group' : s.kind}</div>
                </td>
                <td>{s.members.map((m) => <span key={m.did} className="chip">{m.name ?? m.did.slice(8, 16)}{m.maintainer ? ' ★' : ''}</span>)}</td>
                <td className={s.managed?.problem ? 'bad' : 'muted'}>{s.managed?.problem ?? `epoch ${s.epoch}`}</td>
                <td>
                  {s.hold ? (
                    <span className="warn">until {s.hold.until.slice(0, 10)}</span>
                  ) : (
                    <Run
                      run={async () => {
                        const until = window.prompt(`Legal hold on ${s.name} until (YYYY-MM-DD):`);
                        if (until) await act({ action: 'hold', space: s.id, until, reason: window.prompt('Reason (for the audit):') ?? '' });
                        spaces.reload();
                      }}
                    >
                      Hold
                    </Run>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>New company space</h2>
        <div className="row">
          <select value={kind} onChange={(e) => setKind(e.target.value as 'project' | 'group')}>
            <option value="project">Project</option>
            <option value="group">Group</option>
          </select>
          <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Run kind="primary" disabled={!name.trim()} run={async () => (await act({ action: 'space', kind, name: name.trim() }), setName(''), reload())}>
            Create
          </Run>
        </div>
      </div>
      <div className="panel">
        <h2>Sign-in groups → spaces</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Sign-in group</th>
                <th>Space</th>
                <th>As</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {company.maps.map((m) => (
                <tr key={`${m.group} ${m.space}`}>
                  <td>
                    <span className="chip">{m.group}</span>
                  </td>
                  <td>{m.spaceName}</td>
                  <td>{m.role === 'maintainer' ? 'maintainers' : 'members'}</td>
                  <td>
                    <Run kind="danger" run={async () => (await act({ action: 'map', group: m.group, space: m.space, on: false }), reload())}>
                      Remove
                    </Run>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <input placeholder="Sign-in group, e.g. engineering" value={map.group} onChange={(e) => setMap({ ...map, group: e.target.value })} />
          <select value={map.space} onChange={(e) => setMap({ ...map, space: e.target.value })}>
            <option value="">Space…</option>
            {company.spaces.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select value={map.role} onChange={(e) => setMap({ ...map, role: e.target.value as 'member' | 'maintainer' })}>
            <option value="member">as members</option>
            <option value="maintainer">as maintainers</option>
          </select>
          <Run kind="primary" disabled={!map.group.trim() || !map.space} run={async () => (await act({ action: 'map', group: map.group.trim(), space: map.space, role: map.role }), setMap({ group: '', space: '', role: 'member' }), reload())}>
            Add
          </Run>
        </div>
      </div>
    </>
  );
}

function Policy({ company, reload }: { company: CompanyInfo; reload(): void }) {
  const [p, setP] = useState(company.policy);
  const [min, setMin] = useState(String(company.retention.minDays ?? ''));
  const [max, setMax] = useState(String(company.retention.maxDays ?? ''));
  const [admins, setAdmins] = useState(company.admins ?? '');
  const [ca, setCa] = useState('');
  const days = (v: string) => (v.trim() ? Number(v) : null);
  return (
    <>
      <h1>Policy</h1>
      <p className="lead">What company accounts may do, and how long company spaces keep things. The policy is published, so every Weave app holds company accounts to it.</p>
      <div className="panel">
        <h2>Company accounts</h2>
        <div className="form">
          <label>Spaces outside the company</label>
          <select value={String(p.outside)} onChange={(e) => setP({ ...p, outside: e.target.value === 'true' })}>
            <option value="true">Allowed</option>
            <option value="false">Not allowed</option>
          </select>
          <label>Direct chats</label>
          <select value={p.directs} onChange={(e) => setP({ ...p, directs: e.target.value as 'all' | 'company' | 'off' })}>
            <option value="all">With anyone</option>
            <option value="company">Only with colleagues</option>
            <option value="off">None</option>
          </select>
          <label>Chats between colleagues</label>
          <select value={String(p.chats)} onChange={(e) => setP({ ...p, chats: e.target.value === 'true' })}>
            <option value="false">Direct chats</option>
            <option value="true">Company chats (kept and audited by the company)</option>
          </select>
          <label>Public posting</label>
          <select value={String(p.public)} onChange={(e) => setP({ ...p, public: e.target.value === 'true' })}>
            <option value="true">Allowed</option>
            <option value="false">Not allowed</option>
          </select>
          <label>Linking private accounts</label>
          <select value={String(p.links)} onChange={(e) => setP({ ...p, links: e.target.value === 'true' })}>
            <option value="true">Allowed</option>
            <option value="false">Not allowed</option>
          </select>
          <label>Admins (sign-in group)</label>
          <input value={admins} onChange={(e) => setAdmins(e.target.value)} />
        </div>
      </div>
      <div className="panel">
        <h2>Retention in company spaces</h2>
        <div className="form">
          <label>Keep at least (days)</label>
          <input type="number" min={1} placeholder="no minimum" value={min} onChange={(e) => setMin(e.target.value)} />
          <label>Keep at most (days)</label>
          <input type="number" min={1} placeholder="no maximum" value={max} onChange={(e) => setMax(e.target.value)} />
        </div>
        <p className="muted">The maximum removes chat and posts older than it; pinned posts, issues, proposals, releases and each space's page stay. A legal hold stops it.</p>
      </div>
      <div className="panel">
        <h2>Company computers</h2>
        <p className="muted">{company.policy && ca ? '' : 'Only sign-ins from computers with a certificate from this authority are vouched for. Leave empty to keep the current setting.'}</p>
        <textarea placeholder="-----BEGIN CERTIFICATE----- (your device certificate authority)" value={ca} onChange={(e) => setCa(e.target.value)} />
      </div>
      <Run
        kind="primary"
        run={async () => {
          await act({ action: 'settings', ...p, admins, retention: { minDays: days(min), maxDays: days(max) }, ...(ca.trim() ? { deviceCA: ca.trim() } : {}) });
          setCa('');
          reload();
        }}
      >
        Save policy
      </Run>
    </>
  );
}

function Directory() {
  const scim = useLoad(() => api<ScimInfo>('/scim'));
  const [token, setToken] = useState<string>();
  return (
    <>
      <h1>Directory</h1>
      <p className="lead">Your user management (Entra ID, Okta, Google) provisions people and groups here over SCIM. Deactivating someone there takes them out of every company space at once.</p>
      <Problem error={scim.error} />
      <div className="panel">
        <div className="row">
          <span className={scim.data?.on ? 'good' : 'muted'}>{scim.data?.on ? `SCIM is on (port ${scim.data.port})` : 'SCIM is off'}</span>
          {scim.data?.on ? (
            <Run kind="danger" confirm="Turn SCIM off? Groups come from sign-in tokens again." run={async () => (await api('/scim', { method: 'POST', body: { on: false } }), scim.reload())}>
              Turn off
            </Run>
          ) : (
            <Run kind="primary" run={async () => (setToken((await api<ScimInfo>('/scim', { method: 'POST', body: { on: true } })).token), scim.reload())}>
              Turn on
            </Run>
          )}
          {scim.data?.on && (
            <Run confirm="Make a new token? The old one stops working." run={async () => (setToken((await api<ScimInfo>('/scim', { method: 'POST', body: { on: true } })).token), scim.reload())}>
              New token
            </Run>
          )}
        </div>
        {token && (
          <div className="notice">
            Bearer token for your user management's provisioning settings (shown once):
            <div className="mono">{token}</div>
          </div>
        )}
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>User</th>
              <th>Status</th>
              <th>Groups</th>
              <th>In Weave</th>
            </tr>
          </thead>
          <tbody>
            {(scim.data?.users ?? []).map((u) => (
              <tr key={u.userName}>
                <td>
                  <div>{u.displayName ?? u.userName}</div>
                  <div className="muted">{u.userName}</div>
                </td>
                <td className={u.active ? 'good' : 'bad'}>{u.active ? 'active' : 'deactivated'}</td>
                <td>{u.groups.map((g) => <span key={g} className="chip">{g}</span>)}</td>
                <td>{u.name ?? <span className="muted">not yet</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Audit({ company }: { company: CompanyInfo }) {
  const [space, setSpace] = useState('');
  const audit = useLoad(() => api<{ lines: Line[]; names: Record<string, string> }>(`/audit${space ? `?space=${space}` : ''}`), [space]);
  const names = audit.data?.names ?? {};
  const named = (v: unknown) => (typeof v === 'string' ? (names[v] ?? (v.startsWith('did:key:') ? `${v.slice(8, 16)}…` : v)) : String(v));
  const spaces = [company.group, ...company.spaces];
  const summary = (l: Line) => {
    const d = (l.detail ?? {}) as Record<string, unknown>;
    if (l.kind === 'weave.org.console') return `${d.email ?? d.subject} in the console: ${d.action}${d.space ? ` (${named(d.space)})` : ''}${d.person ? ` (${named(d.person)})` : ''}`;
    return Object.entries(d)
      .filter(([, v]) => typeof v !== 'object' || v === null)
      .map(([k, v]) => `${k}: ${named(v)}`)
      .join(' · ')
      .slice(0, 160);
  };
  return (
    <>
      <h1>Audit</h1>
      <p className="lead">Who changed what in the company's spaces over the last 30 days. No content, no secrets.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <select value={space} onChange={(e) => setSpace(e.target.value)}>
          <option value="">All company spaces</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {space && (
          <a className="btn" href={`/api/export?space=${space}`}>
            Export everything in it (legal search)
          </a>
        )}
      </div>
      <Problem error={audit.error} />
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Space</th>
              <th>What</th>
              <th>Who</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {!audit.data && (
              <tr>
                <td colSpan={5} className="muted">
                  Loading…
                </td>
              </tr>
            )}
            {(audit.data?.lines ?? []).slice(0, 500).map((l) => (
              <tr key={`${l.space.id} ${l.id ?? l.time + l.kind}`}>
                <td style={{ whiteSpace: 'nowrap' }}>{when(l.time)}</td>
                <td>{l.space.name}</td>
                <td>
                  <span className="chip">{l.kind.replace(/^weave\./, '')}</span>
                </td>
                <td>
                  {l.byName ?? l.by.slice(8, 20)}
                  {l.agent ? <span className="muted"> · {l.agent}</span> : null}
                </td>
                <td className="muted detail">{summary(l)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Streams() {
  const streams = useLoad(() => api<AuditStreamInfo[]>('/streams'));
  const [kind, setKind] = useState<AuditSinkInput['kind']>('splunk');
  const [f, setF] = useState<Record<string, string>>({});
  const field = (name: string, label: string, type = 'text') => (
    <>
      <label>{label}</label>
      <input type={type} value={f[name] ?? ''} onChange={(e) => setF({ ...f, [name]: e.target.value })} />
    </>
  );
  const input = (): AuditSinkInput => {
    if (kind === 'webhook') return { kind, url: f.url, ...(f.token ? { token: f.token } : {}) };
    if (kind === 'splunk') return { kind, url: f.url, token: f.token };
    if (kind === 'syslog') return { kind, host: f.host, port: Number(f.port) };
    return { kind, endpoint: f.endpoint, rule: f.rule, stream: f.stream, tenant: f.tenant, clientId: f.clientId, secret: f.secret };
  };
  return (
    <>
      <h1>Security tools</h1>
      <p className="lead">The company's node sends every audit line, as it happens, to your security tools. What can't be delivered is sent later.</p>
      <Problem error={streams.error} />
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Destination</th>
              <th>Sent</th>
              <th>Last</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(streams.data ?? []).map((s) => (
              <tr key={s.id}>
                <td>
                  <div>{{ webhook: 'Webhook', splunk: 'Splunk', syslog: 'Syslog', sentinel: 'Microsoft Sentinel' }[s.kind]}</div>
                  <div className="muted mono">{s.target}</div>
                </td>
                <td>{s.sent}</td>
                <td>{when(s.lastSent)}</td>
                <td className={s.problem ? 'bad' : 'good'}>{s.problem ?? 'delivering'}</td>
                <td>
                  <Run kind="danger" confirm="Stop sending the audit there?" run={async () => (await api('/streams', { method: 'DELETE', body: { id: s.id } }), streams.reload())}>
                    Remove
                  </Run>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h2>Add a destination</h2>
        <div className="form">
          <label>Kind</label>
          <select value={kind} onChange={(e) => (setKind(e.target.value as AuditSinkInput['kind']), setF({}))}>
            <option value="splunk">Splunk (HTTP Event Collector)</option>
            <option value="sentinel">Microsoft Sentinel (Logs Ingestion API)</option>
            <option value="syslog">Syslog (RFC 5424 over TCP)</option>
            <option value="webhook">Webhook (JSON)</option>
          </select>
          {kind === 'webhook' && (
            <>
              {field('url', 'URL')}
              {field('token', 'Bearer token (optional)', 'password')}
            </>
          )}
          {kind === 'splunk' && (
            <>
              {field('url', 'Collector URL')}
              {field('token', 'HEC token', 'password')}
            </>
          )}
          {kind === 'syslog' && (
            <>
              {field('host', 'Host')}
              {field('port', 'Port', 'number')}
            </>
          )}
          {kind === 'sentinel' && (
            <>
              {field('endpoint', 'Data collection endpoint')}
              {field('rule', 'Data collection rule (immutable id)')}
              {field('stream', 'Stream, e.g. Custom-WeaveAudit_CL')}
              {field('tenant', 'Tenant')}
              {field('clientId', 'App (client) id')}
              {field('secret', 'Client secret', 'password')}
            </>
          )}
        </div>
        <div style={{ marginTop: 14 }}>
          <Run kind="primary" run={async () => (await api('/streams', { method: 'POST', body: input() }), setF({}), streams.reload())}>
            Add and send
          </Run>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ the app

const PAGES = ['Overview', 'People', 'Spaces', 'Policy', 'Directory', 'Audit', 'Security tools'] as const;
type Page = (typeof PAGES)[number];

function App() {
  const me = useLoad(() => api<Me>('/me'));
  const company = useLoad(() => api<CompanyInfo | null>('/company'));
  const fromHash = (): Page => {
    const name = decodeURIComponent(location.hash.slice(1)).replace(/-/g, ' ');
    return (PAGES as readonly string[]).includes(name) ? (name as Page) : 'Overview';
  };
  const [page, setPage] = useState<Page>(fromHash);
  useEffect(() => {
    location.hash = page.replace(/ /g, '-');
  }, [page]);
  useEffect(() => {
    const follow = () => setPage(fromHash());
    window.addEventListener('hashchange', follow);
    return () => window.removeEventListener('hashchange', follow);
  }, []);
  if (me.error === 'signed out')
    return (
      <div className="signin">
        <div className="panel">
          <h1>Weave Admin</h1>
          <p className="lead">For your company's admins.</p>
          <a className="btn primary" href="/login">
            Sign in with your company
          </a>
        </div>
      </div>
    );
  if (!me.data || company.data === undefined) return <div className="signin muted">{me.error ?? company.error ?? 'Loading…'}</div>;
  if (!company.data) return <div className="signin">This node doesn't run a company yet (weave company create).</div>;
  const c = company.data;
  return (
    <div className="shell">
      <nav>
        <div className="brand">{c.name}</div>
        <div className="sub">Weave Admin</div>
        {PAGES.map((p) => (
          <button key={p} className={p === page ? 'on' : ''} onClick={() => setPage(p)}>
            {p}
          </button>
        ))}
        <div className="who">
          {me.data.name ?? me.data.email ?? me.data.subject}
          <br />
          <a href="/logout">Sign out</a>
        </div>
      </nav>
      <main>
        {page === 'Overview' && <Overview company={c} reload={company.reload} />}
        {page === 'People' && <People company={c} />}
        {page === 'Spaces' && <Spaces company={c} reload={company.reload} />}
        {page === 'Policy' && <Policy key={JSON.stringify(c.policy) + JSON.stringify(c.retention)} company={c} reload={company.reload} />}
        {page === 'Directory' && <Directory />}
        {page === 'Audit' && <Audit company={c} />}
        {page === 'Security tools' && <Streams />}
      </main>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
