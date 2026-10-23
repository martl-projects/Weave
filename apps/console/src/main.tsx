import { StrictMode, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { AuditLine, AuditSinkInput, AuditStreamInfo, CompanyAction, CompanyInfo, MemberInfo, ScimInfo, SpaceInfo } from '@weave/node/client';
import { api, Avatar, Badge, CopyText, Empty, Faces, Header, Icon, Logo, Open, Problem, Run, useLoad, when, type IconName } from './ui.tsx';

/*
 * The admin console for a company's Weave (stage 12): served by the company's
 * node, for the admins of the company. Everything here goes through the
 * company's node, which records who did it (packages/node/src/console.ts).
 */

type Me = { subject: string; email?: string; name?: string };
type SpaceRow = SpaceInfo & { members: Array<{ did: string; name?: string; maintainer: boolean }> };
type Line = AuditLine & { space: { id: string; name: string } };

const act = (action: CompanyAction) => api<CompanyInfo>('/action', { method: 'POST', body: action });

// ------------------------------------------------------------------ overview

function Stat({ icon, tone, label, value, sub, alert }: { icon: IconName; tone: string; label: string; value: ReactNode; sub: ReactNode; alert?: boolean }) {
  return (
    <div className="card stat">
      <div className={`stat-icon strand-${tone}`}>
        <Icon name={icon} size={32} />
      </div>
      <div>
        <div className="k">{label}</div>
        <div className="v">{value}</div>
        <div className={`s ${alert ? 'bad' : ''}`}>{sub}</div>
      </div>
    </div>
  );
}

function Overview({ company, go }: { company: CompanyInfo; go(page: Page): void }) {
  const members = useLoad(() => api<MemberInfo[]>('/members'));
  const scim = useLoad(() => api<ScimInfo>('/scim'));
  const streams = useLoad(() => api<AuditStreamInfo[]>('/streams'));
  const [link, setLink] = useState<string>();
  const [email, setEmail] = useState('');
  const [invited, setInvited] = useState<string>();
  const vouched = (members.data ?? []).filter((m) => m.attested && Date.parse(m.attested.until) > Date.now()).length;
  const troubled = streams.data?.some((s) => s.problem);
  const p = company.policy;
  const rules: Array<[IconName, string, boolean]> = [
    ['briefcases', p.outside ? 'Outside projects and groups allowed' : 'Company projects and groups only', !p.outside],
    ['send', `Direct chats: ${{ all: 'with anyone', company: 'colleagues only', off: 'none' }[p.directs]}`, p.directs !== 'all'],
    ['lock', p.public ? 'Public posting allowed' : 'No public posting', !p.public],
    ['users', p.chats ? 'Colleagues chat in company chats' : 'Colleagues chat directly', p.chats],
    ['link', p.links ? 'Linking private accounts allowed' : 'No linking', !p.links],
    ['clock', `Kept ${company.retention.minDays ? `at least ${company.retention.minDays} days` : 'without a minimum'}${company.retention.maxDays ? `, at most ${company.retention.maxDays} days` : ''}`, !!(company.retention.minDays || company.retention.maxDays)],
  ];
  return (
    <>
      <Header icon="home" title={company.name} lead="Your company's Weave: its people, projects and groups, policy and audit." />
      <div className="cards">
        <Stat icon="people" tone="navy" label="People vouched for" value={members.data ? vouched : '…'} sub={members.data ? `${members.data.length} in the company group` : ''} />
        <Stat icon="projects" tone="teal" label="Projects and groups" value={company.spaces.length + 1} sub={`${company.maps.length} mapped from sign-in groups`} />
        <Stat icon="directory" tone="gold" label="Directory (SCIM)" value={scim.data ? (scim.data.on ? 'On' : 'Off') : '…'} sub={scim.data?.on ? `${scim.data.users.length} users, ${scim.data.groups.length} groups` : 'groups from sign-in tokens'} />
        <Stat icon="tools" tone="red" label="Audit streams" value={streams.data?.length ?? '…'} sub={!streams.data?.length ? 'none yet' : troubled ? 'a destination has a problem' : 'all delivering'} alert={troubled} />
      </div>
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h2>Policy in effect</h2>
            <button className="btn small ghost" onClick={() => go('Policy')}>
              Change
            </button>
          </div>
          <ul className="rules">
            {rules.map(([icon, text, strict]) => (
              <li key={text} className={strict ? 'strict' : ''}>
                <Icon name={icon} />
                {text}
              </li>
            ))}
          </ul>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Set up a new colleague</h2>
          </div>
          <p className="muted">Send them an invitation: one click opens Weave with your company's link, and they sign in with their company account.</p>
          <div className="row">
            <input className="grow" type="email" placeholder="name@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <Run
              kind="primary"
              icon="new"
              disabled={!email.includes('@')}
              run={async () => {
                const sent = await api<{ to: string }>('/invite', { method: 'POST', body: { email: email.trim() } });
                setInvited(sent.to);
                setEmail('');
              }}
            >
              Invite by email
            </Run>
          </div>
          {invited && <p className="muted">Sent {invited} their invitation.</p>}
          <p className="muted">Or make an enrollment link to hand over yourself, or for your device management's settings.</p>
          <Run icon="new" run={async () => setLink((await api<{ link: string }>('/enroll-link', { method: 'POST', body: { days: 30 } })).link)}>
            New enrollment link
          </Run>
          {link && <CopyText text={link} />}
        </section>
      </div>
      <Requests company={company} />
    </>
  );
}

function Requests({ company }: { company: CompanyInfo }) {
  if (!company.requests.length) return null;
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Requests from admins in Weave</h2>
      </div>
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
                <td className="nowrap">{when(r.time)}</td>
                <td>
                  <div className="who">
                    <Avatar name={r.byName} id={r.by} />
                    {r.byName ?? r.by.slice(0, 16)}
                  </div>
                </td>
                <td>{r.action}</td>
                <td>{r.error ? <Badge tone="bad">{r.error}</Badge> : r.done ? <Badge tone="good">done</Badge> : <Badge tone="warn">waiting</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ people

function People({ company }: { company: CompanyInfo }) {
  const members = useLoad(() => api<MemberInfo[]>('/members'));
  const [answer, setAnswer] = useState<{ name: string; answer: string }>();
  const [filter, setFilter] = useState('');
  const now = Date.now();
  const shown = (members.data ?? []).filter((m) => !filter || `${m.name} ${m.attested?.email ?? ''} ${m.attested?.groups.join(' ') ?? ''}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <Header icon="people" title="People" lead="Everyone in the company group, and what the company vouches for.">
        <input className="search" placeholder="Search people or groups" value={filter} onChange={(e) => setFilter(e.target.value)} />
      </Header>
      <Problem error={members.error} />
      {answer && (
        <div className="notice">
          <Icon name="info" size={20} /> Recovery answer for {answer.name}'s new computer. Only that computer opens it (weave recover &lt;answer&gt; there):
          <CopyText text={answer.answer} />
        </div>
      )}
      <section className="panel flush table-wrap">
        <table>
          <thead>
            <tr>
              <th>Person</th>
              <th>Groups</th>
              <th>Vouched for</th>
              <th>Computer</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!members.data && (
              <tr>
                <td colSpan={5} className="muted">
                  Loading…
                </td>
              </tr>
            )}
            {shown.map((m) => {
              const isCompany = m.did === company.did;
              const live = m.attested && Date.parse(m.attested.until) > now;
              return (
                <tr key={m.did}>
                  <td>
                    <div className="who">
                      {isCompany ? (
                        <span className="avatar logo-avatar">
                          <Logo size={18} />
                        </span>
                      ) : (
                        <Avatar name={m.name} id={m.did} />
                      )}
                      <div>
                        <div className="name">{m.name ?? m.did.slice(0, 20)}</div>
                        <div className="muted small">{isCompany ? 'the company' : (m.attested?.email ?? (m.company ? 'company account' : 'own account'))}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    {m.attested?.groups.map((g) => (
                      <span key={g} className="chip">
                        {g}
                      </span>
                    ))}
                  </td>
                  <td className="nowrap">{isCompany ? '' : !m.attested ? <Badge tone="muted">not signed in</Badge> : live ? <Badge tone="good">until {when(m.attested.until)}</Badge> : <Badge tone="warn">lapsed</Badge>}</td>
                  <td className="muted small">
                    {m.attested?.device ? (
                      <span className="device">
                        <Icon name="monitor" />
                        {m.attested.device.subject.replace(/^CN=/, '')}
                      </span>
                    ) : (
                      ''
                    )}
                  </td>
                  <td>
                    {m.company && (
                      <div className="row end">
                        <Run
                          small
                          kind="ghost"
                          icon="key"
                          title="Set up a new computer (recovery)"
                          run={async () => {
                            const request = window.prompt(`The recovery request from ${m.name}'s new computer (weave recover-request there):`);
                            if (request) setAnswer({ name: m.name ?? 'them', answer: (await api<{ answer: string }>('/recovery', { method: 'POST', body: { person: m.did, request } })).answer });
                          }}
                        />
                        <Run small kind="ghost" icon="lock" title="Freeze this company account" confirm={`Freeze ${m.name}'s company account? Nothing it signs from now on counts anywhere. Its history stays.`} run={async () => (await act({ action: 'freeze', person: m.did }), members.reload())} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {members.data && !shown.length && <Empty icon="people">Nobody matches “{filter}”.</Empty>}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ projects and groups

function Spaces({ company, reload }: { company: CompanyInfo; reload(): void }) {
  const spaces = useLoad(() => api<SpaceRow[]>('/spaces'), [company]);
  const [kind, setKind] = useState<'project' | 'group'>('project');
  const [name, setName] = useState('');
  const [map, setMap] = useState({ group: '', space: '', role: 'member' as 'member' | 'maintainer' });
  const kindOf = (id: string) => (id === company.group.id ? 'group' : company.spaces.find((s) => s.id === id)?.kind);
  return (
    <>
      <Header icon="projects" title="Projects and groups" lead="The company's own projects and groups. Sign-in groups decide who is in them; click one to open it in Weave." />
      <Problem error={spaces.error} />
      <section className="panel flush table-wrap">
        <table>
          <thead>
            <tr>
              <th>Project or group</th>
              <th>Members</th>
              <th>Keys</th>
              <th>Legal hold</th>
            </tr>
          </thead>
          <tbody>
            {!spaces.data && (
              <tr>
                <td colSpan={4} className="muted">
                  Loading…
                </td>
              </tr>
            )}
            {(spaces.data ?? []).map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="who">
                    <span className={`space-icon ${s.kind}`}>
                      <Icon name={s.kind === 'project' ? 'projects' : 'people'} />
                    </span>
                    <div>
                      <div className="name">
                        <Open kind={s.kind} id={s.id}>
                          {s.name}
                        </Open>
                      </div>
                      <div className="muted small">{s.id === company.group.id ? 'company group: everyone' : s.kind}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <Faces people={s.members} />
                </td>
                <td>{s.managed?.problem ? <Badge tone="bad">{s.managed.problem}</Badge> : <span title="Under the company's key service">
                      <Badge tone="good">key {s.epoch}</Badge>
                    </span>}</td>
                <td>
                  {s.hold ? (
                    <Badge tone="warn">until {s.hold.until.slice(0, 10)}</Badge>
                  ) : (
                    <Run
                      small
                      kind="ghost"
                      icon="lock"
                      title="Put on legal hold"
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
      </section>
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h2>New project or group</h2>
          </div>
          <div className="row">
            <select value={kind} onChange={(e) => setKind(e.target.value as 'project' | 'group')}>
              <option value="project">Project</option>
              <option value="group">Group</option>
            </select>
            <input className="grow" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <Run kind="primary" icon="plus" disabled={!name.trim()} run={async () => (await act({ action: 'space', kind, name: name.trim() }), setName(''), reload())}>
              Create
            </Run>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>Add a mapping</h2>
          </div>
          <div className="row">
            <input className="grow" placeholder="Sign-in group, e.g. engineering" value={map.group} onChange={(e) => setMap({ ...map, group: e.target.value })} />
            <select value={map.space} onChange={(e) => setMap({ ...map, space: e.target.value })}>
              <option value="">Project or group…</option>
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
            <Run kind="primary" icon="plus" disabled={!map.group.trim() || !map.space} run={async () => (await act({ action: 'map', group: map.group.trim(), space: map.space, role: map.role }), setMap({ group: '', space: '', role: 'member' }), reload())}>
              Add
            </Run>
          </div>
        </section>
      </div>
      <section className="panel flush">
        <div className="panel-head padded">
          <h2>Sign-in groups → projects and groups</h2>
        </div>
        {company.maps.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sign-in group</th>
                  <th>Project or group</th>
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
                    <td>
                      <Open kind={kindOf(m.space)} id={m.space}>
                        {m.spaceName}
                      </Open>
                    </td>
                    <td>{m.role === 'maintainer' ? 'maintainers' : 'members'}</td>
                    <td className="end">
                      <Run small kind="ghost" icon="trash" title="Remove this mapping" confirm={`Stop mapping ${m.group} to ${m.spaceName}? People it brought in leave.`} run={async () => (await act({ action: 'map', group: m.group, space: m.space, on: false }), reload())} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="link">No mappings yet: add one above, and everyone in that sign-in group joins.</Empty>
        )}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ policy

function Toggle({ value, onChange, on, off }: { value: boolean; onChange(v: boolean): void; on: string; off: string }) {
  return (
    <div className="segmented">
      <button className={value ? 'on' : ''} onClick={() => onChange(true)}>
        {on}
      </button>
      <button className={!value ? 'on' : ''} onClick={() => onChange(false)}>
        {off}
      </button>
    </div>
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
      <Header icon="policy" title="Policy" lead="What company accounts may do, and how long the company's projects and groups keep things. The policy is published, so every Weave app holds company accounts to it.">
        <Run
          kind="primary"
          icon="check"
          run={async () => {
            await act({ action: 'settings', ...p, admins, retention: { minDays: days(min), maxDays: days(max) }, ...(ca.trim() ? { deviceCA: ca.trim() } : {}) });
            setCa('');
            reload();
          }}
        >
          Save policy
        </Run>
      </Header>
      <section className="panel">
        <div className="panel-head">
          <h2>
            <Icon name="users" /> Company accounts
          </h2>
        </div>
        <div className="form">
          <label>Projects and groups outside the company</label>
          <Toggle value={p.outside} onChange={(outside) => setP({ ...p, outside })} on="Allowed" off="Not allowed" />
          <label>Direct chats</label>
          <div className="segmented">
            {(['all', 'company', 'off'] as const).map((d) => (
              <button key={d} className={p.directs === d ? 'on' : ''} onClick={() => setP({ ...p, directs: d })}>
                {{ all: 'With anyone', company: 'Colleagues only', off: 'None' }[d]}
              </button>
            ))}
          </div>
          <label>Chats between colleagues</label>
          <Toggle value={p.chats} onChange={(chats) => setP({ ...p, chats })} on="Company chats" off="Direct chats" />
          <label>Public posting</label>
          <Toggle value={p.public} onChange={(pub) => setP({ ...p, public: pub })} on="Allowed" off="Not allowed" />
          <label>Linking private accounts</label>
          <Toggle value={p.links} onChange={(links) => setP({ ...p, links })} on="Allowed" off="Not allowed" />
          <label>Admins (sign-in group)</label>
          <input value={admins} onChange={(e) => setAdmins(e.target.value)} />
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>
            <Icon name="clock" /> Retention
          </h2>
        </div>
        <div className="form">
          <label>Keep at least</label>
          <div className="unit">
            <input type="number" min={1} placeholder="no minimum" value={min} onChange={(e) => setMin(e.target.value)} />
            <span>days</span>
          </div>
          <label>Keep at most</label>
          <div className="unit">
            <input type="number" min={1} placeholder="no maximum" value={max} onChange={(e) => setMax(e.target.value)} />
            <span>days</span>
          </div>
        </div>
        <p className="muted small">The maximum removes chat and posts older than it; pinned posts, issues, proposals, releases and each project's page stay. A legal hold stops it.</p>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>
            <Icon name="monitor" /> Company computers
          </h2>
        </div>
        <p className="muted small">Only sign-ins from computers with a certificate from this authority are vouched for. Leave it empty to keep the current setting.</p>
        <textarea placeholder="-----BEGIN CERTIFICATE----- (your device certificate authority)" value={ca} onChange={(e) => setCa(e.target.value)} />
      </section>
    </>
  );
}

// ------------------------------------------------------------------ directory

function Directory() {
  const scim = useLoad(() => api<ScimInfo>('/scim'));
  const [token, setToken] = useState<string>();
  return (
    <>
      <Header icon="directory" title="Directory" lead="Your user management (Entra ID, Okta, Google) provisions people and groups here over SCIM. Deactivating someone there takes them out of all the company's projects and groups at once.">
        {scim.data?.on ? (
          <>
            <Run icon="key" confirm="Make a new token? The old one stops working." run={async () => (setToken((await api<ScimInfo>('/scim', { method: 'POST', body: { on: true } })).token), scim.reload())}>
              New token
            </Run>
            <Run kind="danger" confirm="Turn SCIM off? Groups come from sign-in tokens again." run={async () => (await api('/scim', { method: 'POST', body: { on: false } }), scim.reload())}>
              Turn off
            </Run>
          </>
        ) : (
          <Run kind="primary" icon="plug" run={async () => (setToken((await api<ScimInfo>('/scim', { method: 'POST', body: { on: true } })).token), scim.reload())}>
            Turn on SCIM
          </Run>
        )}
      </Header>
      <Problem error={scim.error} />
      <div className="status-line">{scim.data && (scim.data.on ? <Badge tone="good">SCIM is on, port {scim.data.port}, endpoint /scim/v2</Badge> : <Badge tone="muted">SCIM is off: groups come from sign-in tokens</Badge>)}</div>
      {token && (
        <div className="notice">
          <Icon name="info" size={20} /> Bearer token for your user management's provisioning settings (shown once):
          <CopyText text={token} />
        </div>
      )}
      <section className="panel flush table-wrap">
        {scim.data?.users.length ? (
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
              {scim.data.users.map((u) => (
                <tr key={u.userName}>
                  <td>
                    <div className="who">
                      <Avatar name={u.displayName ?? u.userName} id={u.userName} />
                      <div>
                        <div className="name">{u.displayName ?? u.userName}</div>
                        <div className="muted small">{u.userName}</div>
                      </div>
                    </div>
                  </td>
                  <td>{u.active ? <Badge tone="good">active</Badge> : <Badge tone="bad">deactivated</Badge>}</td>
                  <td>
                    {u.groups.map((g) => (
                      <span key={g} className="chip">
                        {g}
                      </span>
                    ))}
                  </td>
                  <td>{u.name ?? <span className="muted">not yet</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty icon="directory">{scim.data?.on ? 'Nobody provisioned yet: start provisioning in your user management.' : 'Turn SCIM on, then point your user management at it.'}</Empty>
        )}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ audit

const KIND_ICONS: Array<[RegExp, IconName]> = [
  [/console/, 'grid'],
  [/attest|signin/, 'login'],
  [/escrow|freeze/, 'key'],
  [/rekey|kms|managed|shred/, 'lock'],
  [/hold/, 'clock'],
  [/admit|join|remove|leave|maintainer/, 'users'],
  [/settings|policy|map|start/, 'shield'],
  [/delete/, 'trash'],
];
const kindIcon = (kind: string): IconName => KIND_ICONS.find(([re]) => re.test(kind))?.[1] ?? 'clipboardNote';

function Audit({ company }: { company: CompanyInfo }) {
  const [space, setSpace] = useState('');
  const audit = useLoad(() => api<{ lines: Line[]; names: Record<string, string> }>(`/audit${space ? `?space=${space}` : ''}`), [space]);
  const names = audit.data?.names ?? {};
  const named = (v: unknown) => (typeof v === 'string' ? (names[v] ?? (v.startsWith('did:key:') ? `${v.slice(8, 16)}…` : v)) : String(v));
  const spaces = [company.group, ...company.spaces];
  const kindOf = (id: string) => (id === company.group.id ? 'group' : company.spaces.find((s) => s.id === id)?.kind);
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
      <Header icon="audit" title="Audit" lead="Who changed what in the company's projects and groups over the last 30 days. No content, no secrets.">
        <select value={space} onChange={(e) => setSpace(e.target.value)}>
          <option value="">All projects and groups</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {space && (
          <a className="btn" href={`/api/export?space=${space}`}>
            <Icon name="export" />
            <span>Export everything (legal search)</span>
          </a>
        )}
      </Header>
      <Problem error={audit.error} />
      <section className="panel flush table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Where</th>
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
                <td className="nowrap muted">{when(l.time)}</td>
                <td>
                  <Open kind={kindOf(l.space.id)} id={l.space.id}>
                    {l.space.name}
                  </Open>
                </td>
                <td>
                  <span className="event">
                    <Icon name={kindIcon(l.kind)} />
                    {l.kind.replace(/^weave\./, '')}
                  </span>
                </td>
                <td>
                  <div className="who">
                    <Avatar name={l.byName} id={l.by} />
                    <span>
                      {l.byName ?? l.by.slice(8, 20)}
                      {l.agent ? <span className="muted"> · {l.agent}</span> : null}
                    </span>
                  </div>
                </td>
                <td className="muted detail">{summary(l)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ security tools

const SINKS: Record<AuditSinkInput['kind'], { name: string; tone: string }> = {
  splunk: { name: 'Splunk', tone: 'gold' },
  sentinel: { name: 'Microsoft Sentinel', tone: 'navy' },
  syslog: { name: 'Syslog', tone: 'teal' },
  webhook: { name: 'Webhook', tone: 'red' },
};

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
      <Header icon="tools" title="Security tools" lead="The company's node sends every audit line, as it happens, to your security tools. What can't be delivered is sent later." />
      <Problem error={streams.error} />
      <section className="panel flush table-wrap">
        {streams.data?.length ? (
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
              {streams.data.map((s) => (
                <tr key={s.id}>
                  <td>
                    <div className="who">
                      <span className={`stat-icon small strand-${SINKS[s.kind].tone}`}>
                        <Icon name="send" />
                      </span>
                      <div>
                        <div className="name">{SINKS[s.kind].name}</div>
                        <div className="muted small mono">{s.target}</div>
                      </div>
                    </div>
                  </td>
                  <td>{s.sent}</td>
                  <td className="nowrap muted">{when(s.lastSent)}</td>
                  <td>{s.problem ? <Badge tone="bad">{s.problem}</Badge> : <Badge tone="good">delivering</Badge>}</td>
                  <td className="end">
                    <Run small kind="ghost" icon="trash" title="Remove this destination" confirm="Stop sending the audit there?" run={async () => (await api('/streams', { method: 'DELETE', body: { id: s.id } }), streams.reload())} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty icon="tools">{streams.data ? 'No destinations yet: add one below.' : 'Loading…'}</Empty>
        )}
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>Add a destination</h2>
        </div>
        <div className="sink-picker">
          {(Object.keys(SINKS) as Array<AuditSinkInput['kind']>).map((k) => (
            <button key={k} className={`sink ${kind === k ? 'on' : ''}`} onClick={() => (setKind(k), setF({}))}>
              <span className={`stat-icon small strand-${SINKS[k].tone}`}>
                <Icon name="send" />
              </span>
              {SINKS[k].name}
            </button>
          ))}
        </div>
        <div className="form">
          {kind === 'webhook' && (
            <>
              {field('url', 'URL')}
              {field('token', 'Bearer token (optional)', 'password')}
            </>
          )}
          {kind === 'splunk' && (
            <>
              {field('url', 'HTTP Event Collector URL')}
              {field('token', 'HEC token', 'password')}
            </>
          )}
          {kind === 'syslog' && (
            <>
              {field('host', 'Host')}
              {field('port', 'Port (TCP)', 'number')}
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
        <div className="form-actions">
          <Run kind="primary" icon="send" run={async () => (await api('/streams', { method: 'POST', body: input() }), setF({}), streams.reload())}>
            Add and send
          </Run>
        </div>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ the app

const PAGES = ['Overview', 'People', 'Projects and groups', 'Policy', 'Directory', 'Audit', 'Security tools'] as const;
type Page = (typeof PAGES)[number];
const PAGE_ICONS: Record<Page, IconName> = { Overview: 'home', People: 'people', 'Projects and groups': 'projects', Policy: 'policy', Directory: 'directory', Audit: 'audit', 'Security tools': 'tools' };

type Theme = 'light' | 'dark' | 'system';
function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('weave-console-theme') as Theme) || 'system';
    } catch {
      return 'system';
    }
  });
  useEffect(() => {
    if (theme === 'system') delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('weave-console-theme', theme);
    } catch {
      // A private window: the choice lasts until it's closed.
    }
  }, [theme]);
  return [theme, setTheme];
}

function SignIn() {
  return (
    <div className="signin">
      <div className="signin-card">
        <Logo size={72} />
        <h1>Weave Admin</h1>
        <p className="muted">For your company's admins. Sign in with your company account.</p>
        <a className="btn primary big" href="/login">
          <Icon name="login" />
          <span>Sign in with your company</span>
        </a>
      </div>
    </div>
  );
}

function App() {
  const me = useLoad(() => api<Me>('/me'));
  const company = useLoad(() => api<CompanyInfo | null>('/company'));
  const [theme, setTheme] = useTheme();
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
  if (me.error === 'signed out') return <SignIn />;
  if (!me.data || company.data === undefined)
    return (
      <div className="signin">
        <div className="loading">
          <Logo size={48} />
          <span className="muted">{me.error ?? company.error ?? 'Loading…'}</span>
        </div>
      </div>
    );
  if (!company.data) return <div className="signin">This node doesn't run a company yet (weave company create).</div>;
  const c = company.data;
  const who = me.data.name ?? me.data.email ?? me.data.subject;
  return (
    <div className="shell">
      <nav>
        <div className="brand">
          <Logo size={30} />
          <div>
            <div className="wordmark">Weave</div>
            <div className="sub">Admin</div>
          </div>
        </div>
        <div className="company">
          <span className="company-name">{c.name}</span>
        </div>
        <div className="links">
          {PAGES.map((p) => (
            <button key={p} className={p === page ? 'on' : ''} onClick={() => setPage(p)}>
              <Icon name={PAGE_ICONS[p]} />
              <span>{p}</span>
            </button>
          ))}
        </div>
        <div className="me">
          <Avatar name={who} id={me.data.subject} />
          <div className="me-text">
            <div className="name">{who}</div>
            <a href="/logout">
              <Icon name="logout" size={12} /> Sign out
            </a>
          </div>
          <button className="btn small ghost theme" title={`Theme: ${theme}`} onClick={() => setTheme(theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system')}>
            <Icon name={theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'monitor'} />
          </button>
        </div>
      </nav>
      <main>
        {page === 'Overview' && <Overview company={c} go={setPage} />}
        {page === 'People' && <People company={c} />}
        {page === 'Projects and groups' && <Spaces company={c} reload={company.reload} />}
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
