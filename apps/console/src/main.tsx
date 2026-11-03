import { StrictMode, useContext, useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { AuditLine, AuditSinkInput, AuditStreamInfo, CompanyAction, CompanyAgentInfo, CompanyDeviceInfo, CompanyInfo, MemberInfo, ScimInfo, SpaceInfo } from '@weave/node/client';
import { api, Avatar, Badge, CopyText, Empty, Faces, Header, Icon, Logo, Open, Problem, RoleContext, Run, useLoad, when, type IconName, type Role } from './ui.tsx';
import { t } from './texts.ts';

/*
 * The admin console for a company's Weave (stage 12): served by the company's
 * node, for the admins of the company. Everything here goes through the
 * company's node, which records who did it (packages/node/src/console.ts).
 */

type Me = { subject: string; email?: string; name?: string; role?: Role };
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
  const role = useContext(RoleContext);
  const members = useLoad(() => api<MemberInfo[]>('/members'));
  // The helpdesk sees who's who and sets people up; the rest isn't theirs.
  const scim = useLoad(() => (role === 'helpdesk' ? Promise.resolve(undefined) : api<ScimInfo>('/scim')));
  const streams = useLoad(() => (role === 'helpdesk' ? Promise.resolve(undefined) : api<AuditStreamInfo[]>('/streams')));
  const [link, setLink] = useState<string>();
  const [email, setEmail] = useState('');
  const [invited, setInvited] = useState<string>();
  const vouched = (members.data ?? []).filter((m) => m.attested && Date.parse(m.attested.until) > Date.now()).length;
  const troubled = streams.data?.some((s) => s.problem);
  const p = company.policy;
  const kept = company.retention.minDays && company.retention.maxDays ? t('con.kept.between', { min: company.retention.minDays, max: company.retention.maxDays }) : company.retention.minDays ? t('con.kept.at.least', { days: company.retention.minDays }) : company.retention.maxDays ? t('con.kept.at.most', { days: company.retention.maxDays }) : t('con.kept.no.minimum');
  const rules: Array<[IconName, string, boolean]> = [
    ['briefcases', t(p.outside ? 'con.rule.outside.allowed' : 'con.rule.company.only'), !p.outside],
    ['send', t(`con.rule.directs.${p.directs}`), p.directs !== 'all'],
    ['lock', t(p.public ? 'con.rule.public.allowed' : 'con.rule.no.public'), !p.public],
    ['users', t(p.chats ? 'con.rule.company.chats' : 'con.rule.direct.chats'), p.chats],
    ['link', t(p.links ? 'con.rule.links.allowed' : 'con.rule.no.links'), !p.links],
    ['clock', kept, !!(company.retention.minDays || company.retention.maxDays)],
  ];
  return (
    <>
      <Header icon="home" title={company.name} lead={t('con.overview.lead')} />
      <div className="cards">
        <Stat icon="people" tone="navy" label={t('con.stat.vouched')} value={members.data ? vouched : '…'} sub={members.data ? t('con.stat.in.company.group', { n: members.data.length }) : ''} />
        <Stat icon="projects" tone="teal" label={t('con.page.spaces')} value={company.spaces.length + 1} sub={t('con.stat.mapped', { n: company.maps.length })} />
        {role !== 'helpdesk' && (
          <>
            <Stat icon="directory" tone="gold" label={t('con.stat.directory')} value={scim.data ? t(scim.data.on ? 'con.on' : 'con.off') : '…'} sub={scim.data?.on ? t('con.stat.users.groups', { users: scim.data.users.length, groups: scim.data.groups.length }) : t('con.stat.groups.from.tokens')} />
            <Stat icon="tools" tone="red" label={t('con.stat.streams')} value={streams.data?.length ?? '…'} sub={t(!streams.data?.length ? 'con.stat.none.yet' : troubled ? 'con.stat.stream.problem' : 'con.stat.all.delivering')} alert={troubled} />
          </>
        )}
      </div>
      <div className="grid-2">
        <section className="panel">
          <div className="panel-head">
            <h2>{t('con.policy.in.effect')}</h2>
            {role === 'admin' && (
              <button className="btn small ghost" onClick={() => go('policy')}>
                {t('con.change')}
              </button>
            )}
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
            <h2>{t('con.new.colleague')}</h2>
          </div>
          <p className="muted">{t('con.new.colleague.about')}</p>
          <div className="row">
            <input className="grow" type="email" placeholder={t('con.email.placeholder')} value={email} onChange={(e) => setEmail(e.target.value)} />
            <Run
              kind="primary"
              icon="new"
              need="helpdesk"
              disabled={!email.includes('@')}
              run={async () => {
                const sent = await api<{ to: string }>('/invite', { method: 'POST', body: { email: email.trim() } });
                setInvited(sent.to);
                setEmail('');
              }}
            >
              {t('con.invite.by.email')}
            </Run>
          </div>
          {invited && <p className="muted">{t('con.invitation.sent', { to: invited })}</p>}
          <p className="muted">{t('con.enroll.link.about')}</p>
          <Run icon="new" need="helpdesk" run={async () => setLink((await api<{ link: string }>('/enroll-link', { method: 'POST', body: { days: 30 } })).link)}>
            {t('con.new.enroll.link')}
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
        <h2>{t('con.requests.title')}</h2>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('con.col.when')}</th>
              <th>{t('con.col.who')}</th>
              <th>{t('con.col.asked.for')}</th>
              <th>{t('con.col.outcome')}</th>
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
                <td>{r.error ? <Badge tone="bad">{r.error}</Badge> : r.done ? <Badge tone="good">{t('con.done')}</Badge> : <Badge tone="warn">{t('con.waiting')}</Badge>}</td>
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
  const devices = useLoad(() => api<CompanyDeviceInfo[]>('/devices'));
  const deviceOf = (did: string) => devices.data?.find((d) => d.did === did);
  const [answer, setAnswer] = useState<{ name: string; answer: string }>();
  const [filter, setFilter] = useState('');
  const now = Date.now();
  const shown = (members.data ?? []).filter((m) => !filter || `${m.name} ${m.attested?.email ?? ''} ${m.attested?.groups.join(' ') ?? ''}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <Header icon="people" title={t('con.page.people')} lead={t('con.people.lead')}>
        <input className="search" placeholder={t('con.people.search')} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </Header>
      <Problem error={members.error} />
      {answer && (
        <div className="notice">
          <Icon name="info" size={20} /> {t('con.recovery.answer', { name: answer.name })}
          <CopyText text={answer.answer} />
        </div>
      )}
      <section className="panel flush table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('con.col.person')}</th>
              <th>{t('con.col.groups')}</th>
              <th>{t('con.col.vouched')}</th>
              <th>{t('con.col.computer')}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!members.data && (
              <tr>
                <td colSpan={5} className="muted">
                  {t('con.loading')}
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
                        <div className="muted small">{isCompany ? t('con.the.company') : (m.attested?.email ?? t(m.company ? 'con.company.account' : 'con.own.account'))}</div>
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
                  <td className="nowrap">{isCompany ? '' : !m.attested ? <Badge tone="muted">{t('con.not.signed.in')}</Badge> : live ? <Badge tone="good">{t('con.until', { when: when(m.attested.until) })}</Badge> : <Badge tone="warn">{t('con.lapsed')}</Badge>}</td>
                  <td className="muted small">
                    <DeviceStatus device={isCompany ? undefined : deviceOf(m.did)} />
                  </td>
                  <td>
                    {m.company && (
                      <div className="row end">
                        <Run
                          small
                          kind="ghost"
                          icon="key"
                          title={t('con.recovery.title')}
                          need="helpdesk"
                          run={async () => {
                            const request = window.prompt(t('con.recovery.prompt', { name: m.name }));
                            if (request) setAnswer({ name: m.name ?? t('con.them'), answer: (await api<{ answer: string }>('/recovery', { method: 'POST', body: { person: m.did, request } })).answer });
                          }}
                        />
                        <Run small kind="ghost" icon="lock" title={t('con.freeze.title')} confirm={t('con.freeze.ask', { name: m.name })} run={async () => (await act({ action: 'freeze', person: m.did }), members.reload())} />
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {members.data && !shown.length && <Empty icon="people">{t('con.nobody.matches', { filter })}</Empty>}
      </section>
    </>
  );
}

/** A person's company computer (stage 15): its certificate and until when, or why their sign-in wasn't vouched for. */
function DeviceStatus({ device }: { device?: CompanyDeviceInfo }) {
  if (!device) return null;
  const soon = device.device?.validTo && Date.parse(device.device.validTo) < Date.now() + 14 * 86_400_000;
  return (
    <div className="device-status">
      {device.device && (
        <span className="device" title={t('con.serial', { serial: device.device.serial })}>
          <Icon name="monitor" />
          {device.device.subject.replace(/^CN=/, '')}
        </span>
      )}
      {device.device?.validTo && <div className={soon ? 'warn-text' : ''}>{t('con.certificate.until', { date: device.device.validTo.slice(0, 10) })}</div>}
      {device.problem ? (
        <Badge tone="bad">{t('con.refused', { problem: device.problem })}</Badge>
      ) : device.required && !device.device ? (
        <Badge tone="warn">{t('con.no.company.computer')}</Badge>
      ) : !device.required && !device.device ? (
        <span>{t('con.any.computer')}</span>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ agents

/** The agents of the company's people (stage 15): in the company's projects and groups an agent acts only once approved. */
function Agents() {
  const agents = useLoad(() => api<CompanyAgentInfo[]>('/agents'));
  const [filter, setFilter] = useState('');
  const shown = (agents.data ?? []).filter((a) => !filter || `${a.personName ?? ''} ${a.name}`.toLowerCase().includes(filter.toLowerCase()));
  return (
    <>
      <Header icon="robot" title={t('con.page.agents')} lead={t('con.agents.lead')}>
        <input className="search" placeholder={t('con.agents.search')} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </Header>
      <Problem error={agents.error} />
      <section className="panel flush table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('con.col.agent')}</th>
              <th>{t('con.col.approved.in')}</th>
            </tr>
          </thead>
          <tbody>
            {!agents.data && (
              <tr>
                <td colSpan={2} className="muted">
                  {t('con.loading')}
                </td>
              </tr>
            )}
            {shown.map((a) => (
              <tr key={a.did}>
                <td>
                  <div className="who">
                    <span className="avatar agent-avatar">
                      <Icon name="robot" />
                    </span>
                    <div>
                      <div className="name">{a.name}</div>
                      <div className="muted small">{t('con.agent.for', { person: a.personName ?? a.person.slice(8, 20) })}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <div className="row wrap">
                    {a.spaces.map((s) => (
                      <span key={s.id} className={`chip toggle ${s.approved ? 'on' : ''}`}>
                        {s.approved ? <Icon name="check" size={12} /> : null}
                        {s.name}
                        <Run
                          small
                          kind="ghost"
                          title={t(s.approved ? 'con.agent.stop' : 'con.agent.let', { agent: a.name, space: s.name })}
                          run={async () => (await api('/agent', { method: 'POST', body: { space: s.id, agent: a.did, on: !s.approved } }), agents.reload())}
                        >
                          {t(s.approved ? 'con.revoke' : 'con.approve')}
                        </Run>
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {agents.data && !shown.length && <Empty icon="robot">{filter ? t('con.nobody.matches', { filter }) : t('con.no.agents')}</Empty>}
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
      <Header icon="projects" title={t('con.page.spaces')} lead={t('con.spaces.lead')} />
      <Problem error={spaces.error} />
      <section className="panel flush table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('con.col.space')}</th>
              <th>{t('con.col.members')}</th>
              <th>{t('con.col.keys')}</th>
              <th>{t('con.col.kept')}</th>
              <th>{t('con.col.hold')}</th>
            </tr>
          </thead>
          <tbody>
            {!spaces.data && (
              <tr>
                <td colSpan={5} className="muted">
                  {t('con.loading')}
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
                      <div className="muted small">{s.id === company.group.id ? t('con.company.group.everyone') : t(`word.${s.kind === 'direct' ? 'chat' : s.kind}`)}</div>
                    </div>
                  </div>
                </td>
                <td>
                  <Faces people={s.members} />
                </td>
                <td>{s.managed?.problem ? <Badge tone="bad">{s.managed.problem}</Badge> : <span title={t('con.under.key.service')}>
                      <Badge tone="good">{t('con.key.epoch', { epoch: s.epoch })}</Badge>
                    </span>}</td>
                <td>
                  <Retention company={company} space={s} reload={reload} />
                </td>
                <td>
                  {s.hold ? (
                    <Badge tone="warn">{t('con.until', { when: s.hold.until.slice(0, 10) })}</Badge>
                  ) : (
                    <Run
                      small
                      kind="ghost"
                      icon="lock"
                      title={t('con.hold.title')}
                      run={async () => {
                        const until = window.prompt(t('con.hold.prompt', { space: s.name }));
                        if (until) await act({ action: 'hold', space: s.id, until, reason: window.prompt(t('con.hold.reason')) ?? '' });
                        spaces.reload();
                      }}
                    >
                      {t('con.hold')}
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
            <h2>{t('con.new.space')}</h2>
          </div>
          <div className="row">
            <select value={kind} onChange={(e) => setKind(e.target.value as 'project' | 'group')}>
              <option value="project">{t('word.project.cap')}</option>
              <option value="group">{t('con.group.cap')}</option>
            </select>
            <input className="grow" placeholder={t('field.name')} value={name} onChange={(e) => setName(e.target.value)} />
            <Run kind="primary" icon="plus" disabled={!name.trim()} run={async () => (await act({ action: 'space', kind, name: name.trim() }), setName(''), reload())}>
              {t('new.create')}
            </Run>
          </div>
        </section>
        <section className="panel">
          <div className="panel-head">
            <h2>{t('con.add.mapping')}</h2>
          </div>
          <div className="row">
            <input className="grow" placeholder={t('con.signin.group.placeholder')} value={map.group} onChange={(e) => setMap({ ...map, group: e.target.value })} />
            <select value={map.space} onChange={(e) => setMap({ ...map, space: e.target.value })}>
              <option value="">{t('con.space.pick')}</option>
              {company.spaces.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select value={map.role} onChange={(e) => setMap({ ...map, role: e.target.value as 'member' | 'maintainer' })}>
              <option value="member">{t('con.as.members')}</option>
              <option value="maintainer">{t('con.as.maintainers')}</option>
            </select>
            <Run kind="primary" icon="plus" disabled={!map.group.trim() || !map.space} run={async () => (await act({ action: 'map', group: map.group.trim(), space: map.space, role: map.role }), setMap({ group: '', space: '', role: 'member' }), reload())}>
              {t('button.add')}
            </Run>
          </div>
        </section>
      </div>
      <section className="panel flush">
        <div className="panel-head padded">
          <h2>{t('con.mappings.title')}</h2>
        </div>
        {company.maps.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>{t('con.col.signin.group')}</th>
                  <th>{t('con.col.space')}</th>
                  <th>{t('con.col.as')}</th>
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
                    <td>{t(m.role === 'maintainer' ? 'con.maintainers' : 'con.members')}</td>
                    <td className="end">
                      <Run small kind="ghost" icon="trash" title={t('con.mapping.remove.title')} confirm={t('con.mapping.remove.ask', { group: m.group, space: m.spaceName })} run={async () => (await act({ action: 'map', group: m.group, space: m.space, on: false }), reload())} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty icon="link">{t('con.no.mappings')}</Empty>
        )}
      </section>
    </>
  );
}

/** How long a project or group keeps things: its own retention (stage 15), or the company's. */
function Retention({ company, space, reload }: { company: CompanyInfo; space: SpaceRow; reload(): void }) {
  const own = company.spaceRetention?.[space.id];
  const r = own ?? company.retention;
  const text = r.minDays && r.maxDays ? t('con.retention.between', { min: r.minDays, max: r.maxDays }) : r.minDays ? t('con.retention.at.least', { days: r.minDays }) : r.maxDays ? t('con.retention.at.most', { days: r.maxDays }) : t('con.retention.no.limits');
  return (
    <div className="row">
      <span className={`nowrap ${own ? '' : 'muted'}`} title={t(own ? 'con.retention.own' : 'con.retention.companys')}>
        {text}
      </span>
      <Run
        small
        kind="ghost"
        icon="clock"
        title={t('con.retention.for', { space: space.name })}
        run={async () => {
          const answer = window.prompt(t('con.retention.prompt', { space: space.name, min: company.retention.minDays ?? '-', max: company.retention.maxDays ?? '-' }), own ? `${own.minDays ?? ''} / ${own.maxDays ?? ''}` : '');
          if (answer === null) return;
          const [min, max] = answer.split('/').map((v) => (v.trim() ? Number(v.trim()) : null));
          await act({ action: 'settings', retention: { space: space.id, minDays: min ?? null, maxDays: max ?? null } });
          reload();
        }}
      />
    </div>
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
  const [auditors, setAuditors] = useState(company.auditors ?? '');
  const [helpdesk, setHelpdesk] = useState(company.helpdesk ?? '');
  const [ca, setCa] = useState('');
  const days = (v: string) => (v.trim() ? Number(v) : null);
  return (
    <>
      <Header icon="policy" title={t('con.page.policy')} lead={t('con.policy.lead')}>
        <Run
          kind="primary"
          icon="check"
          run={async () => {
            await act({ action: 'settings', ...p, admins, auditors: auditors.trim() || null, helpdesk: helpdesk.trim() || null, retention: { minDays: days(min), maxDays: days(max) }, ...(ca.trim() ? { deviceCA: ca.trim() } : {}) });
            setCa('');
            reload();
          }}
        >
          {t('con.save.policy')}
        </Run>
      </Header>
      <section className="panel">
        <div className="panel-head">
          <h2>
            <Icon name="users" /> {t('con.company.accounts')}
          </h2>
        </div>
        <div className="form">
          <label>{t('con.policy.outside')}</label>
          <Toggle value={p.outside} onChange={(outside) => setP({ ...p, outside })} on={t('con.allowed')} off={t('con.not.allowed')} />
          <label>{t('con.policy.directs')}</label>
          <div className="segmented">
            {(['all', 'company', 'off'] as const).map((d) => (
              <button key={d} className={p.directs === d ? 'on' : ''} onClick={() => setP({ ...p, directs: d })}>
                {t(`con.directs.${d}`)}
              </button>
            ))}
          </div>
          <label>{t('con.policy.chats')}</label>
          <Toggle value={p.chats} onChange={(chats) => setP({ ...p, chats })} on={t('con.chats.company')} off={t('con.chats.direct')} />
          <label>{t('con.policy.public')}</label>
          <Toggle value={p.public} onChange={(pub) => setP({ ...p, public: pub })} on={t('con.allowed')} off={t('con.not.allowed')} />
          <label>{t('con.policy.links')}</label>
          <Toggle value={p.links} onChange={(links) => setP({ ...p, links })} on={t('con.allowed')} off={t('con.not.allowed')} />
          <label>{t('con.policy.admins')}</label>
          <input value={admins} onChange={(e) => setAdmins(e.target.value)} />
          <label>{t('con.policy.auditors')}</label>
          <input placeholder={t('con.policy.auditors.placeholder')} value={auditors} onChange={(e) => setAuditors(e.target.value)} />
          <label>{t('con.policy.helpdesk')}</label>
          <input placeholder={t('con.policy.helpdesk.placeholder')} value={helpdesk} onChange={(e) => setHelpdesk(e.target.value)} />
        </div>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>
            <Icon name="clock" /> {t('con.retention')}
          </h2>
        </div>
        <div className="form">
          <label>{t('con.keep.at.least')}</label>
          <div className="unit">
            <input type="number" min={1} placeholder={t('con.no.minimum')} value={min} onChange={(e) => setMin(e.target.value)} />
            <span>{t('con.days')}</span>
          </div>
          <label>{t('con.keep.at.most')}</label>
          <div className="unit">
            <input type="number" min={1} placeholder={t('con.no.maximum')} value={max} onChange={(e) => setMax(e.target.value)} />
            <span>{t('con.days')}</span>
          </div>
        </div>
        <p className="muted small">{t('con.retention.about')}</p>
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>
            <Icon name="monitor" /> {t('con.company.computers')}
          </h2>
        </div>
        <p className="muted small">{t('con.company.computers.about')}</p>
        <textarea placeholder={t('con.ca.placeholder')} value={ca} onChange={(e) => setCa(e.target.value)} />
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
      <Header icon="directory" title={t('con.page.directory')} lead={t('con.directory.lead')}>
        {scim.data?.on ? (
          <>
            <Run icon="key" confirm={t('con.scim.new.token.ask')} run={async () => (setToken((await api<ScimInfo>('/scim', { method: 'POST', body: { on: true } })).token), scim.reload())}>
              {t('con.scim.new.token')}
            </Run>
            <Run kind="danger" confirm={t('con.scim.off.ask')} run={async () => (await api('/scim', { method: 'POST', body: { on: false } }), scim.reload())}>
              {t('con.turn.off')}
            </Run>
          </>
        ) : (
          <Run kind="primary" icon="plug" run={async () => (setToken((await api<ScimInfo>('/scim', { method: 'POST', body: { on: true } })).token), scim.reload())}>
            {t('con.scim.turn.on')}
          </Run>
        )}
      </Header>
      <Problem error={scim.error} />
      <div className="status-line">{scim.data && (scim.data.on ? <Badge tone="good">{t('con.scim.is.on', { port: scim.data.port })}</Badge> : <Badge tone="muted">{t('con.scim.is.off')}</Badge>)}</div>
      {token && (
        <div className="notice">
          <Icon name="info" size={20} /> {t('con.scim.token.note')}
          <CopyText text={token} />
        </div>
      )}
      <section className="panel flush table-wrap">
        {scim.data?.users.length ? (
          <table>
            <thead>
              <tr>
                <th>{t('con.col.user')}</th>
                <th>{t('con.col.status')}</th>
                <th>{t('con.col.groups')}</th>
                <th>{t('con.col.in.weave')}</th>
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
                  <td>{u.active ? <Badge tone="good">{t('con.active')}</Badge> : <Badge tone="bad">{t('con.deactivated')}</Badge>}</td>
                  <td>
                    {u.groups.map((g) => (
                      <span key={g} className="chip">
                        {g}
                      </span>
                    ))}
                  </td>
                  <td>{u.name ?? <span className="muted">{t('con.not.yet')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty icon="directory">{t(scim.data?.on ? 'con.scim.nobody.yet' : 'con.scim.turn.on.first')}</Empty>
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
  const [person, setPerson] = useState('');
  const [since, setSince] = useState(new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10));
  const [until, setUntil] = useState('');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const wait = setTimeout(() => setQ(typed), 300);
    return () => clearTimeout(wait);
  }, [typed]);
  const members = useLoad(() => api<MemberInfo[]>('/members'));
  const query = new URLSearchParams({ ...(space ? { space } : {}), ...(person ? { person } : {}), ...(since ? { since } : {}), ...(until ? { until } : {}), ...(q.trim() ? { q: q.trim() } : {}) });
  const audit = useLoad(() => api<{ lines: Line[]; names: Record<string, string> }>(`/audit?${query}`), [query.toString()]);
  const names = audit.data?.names ?? {};
  const named = (v: unknown) => (typeof v === 'string' ? (names[v] ?? (v.startsWith('did:key:') ? `${v.slice(8, 16)}…` : v)) : String(v));
  const spaces = [company.group, ...company.spaces];
  const kindOf = (id: string) => (id === company.group.id ? 'group' : company.spaces.find((s) => s.id === id)?.kind);
  const summary = (l: Line) => {
    const d = (l.detail ?? {}) as Record<string, unknown>;
    if (l.kind === 'weave.org.console') return t('con.audit.console.line', { who: `${d.email ?? d.subject}${d.role ? ` (${d.role})` : ''}`, action: `${d.action}${d.space ? ` (${named(d.space)})` : ''}${d.person ? ` (${named(d.person)})` : ''}${d.agent ? ` (${named(d.agent)})` : ''}` });
    return Object.entries(d)
      .filter(([, v]) => typeof v !== 'object' || v === null)
      .map(([k, v]) => `${k}: ${named(v)}`)
      .join(' · ')
      .slice(0, 160);
  };
  return (
    <>
      <Header icon="audit" title={t('con.page.audit')} lead={t('con.audit.lead')}>
        <select value={space} onChange={(e) => setSpace(e.target.value)}>
          <option value="">{t('con.audit.all.spaces')}</option>
          {spaces.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        {space && (
          <a className="btn" href={`/api/export?space=${space}`}>
            <Icon name="export" />
            <span>{t('con.audit.export')}</span>
          </a>
        )}
      </Header>
      <div className="filters">
        <select value={person} onChange={(e) => setPerson(e.target.value)} aria-label={t('con.col.person')}>
          <option value="">{t('con.audit.everyone')}</option>
          {(members.data ?? [])
            .filter((m) => m.did !== company.did)
            .map((m) => (
              <option key={m.did} value={m.did}>
                {m.name ?? m.did.slice(8, 20)}
                {m.attested?.email ? ` (${m.attested.email})` : ''}
              </option>
            ))}
        </select>
        <label>
          {t('con.audit.from')} <input type="date" value={since} onChange={(e) => setSince(e.target.value)} />
        </label>
        <label>
          {t('con.audit.to')} <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
        </label>
        <div className="search-box">
          <Icon name="search" />
          <input className="search" placeholder={t('con.audit.search')} value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
        <span className="muted small">{audit.data ? t('con.audit.lines', { n: audit.data.lines.length }) : ''}</span>
      </div>
      <Problem error={audit.error} />
      <section className="panel flush table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('con.col.when')}</th>
              <th>{t('con.col.where')}</th>
              <th>{t('con.col.what')}</th>
              <th>{t('con.col.who')}</th>
              <th>{t('con.col.detail')}</th>
            </tr>
          </thead>
          <tbody>
            {!audit.data && (
              <tr>
                <td colSpan={5} className="muted">
                  {t('con.loading')}
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
      <Header icon="tools" title={t('con.page.tools')} lead={t('con.tools.lead')} />
      <Problem error={streams.error} />
      <section className="panel flush table-wrap">
        {streams.data?.length ? (
          <table>
            <thead>
              <tr>
                <th>{t('con.col.destination')}</th>
                <th>{t('con.col.sent')}</th>
                <th>{t('con.col.last')}</th>
                <th>{t('con.col.status')}</th>
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
                  <td>{s.problem ? <Badge tone="bad">{s.problem}</Badge> : <Badge tone="good">{t('con.delivering')}</Badge>}</td>
                  <td className="end">
                    <Run small kind="ghost" icon="trash" title={t('con.stream.remove.title')} confirm={t('con.stream.remove.ask')} run={async () => (await api('/streams', { method: 'DELETE', body: { id: s.id } }), streams.reload())} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty icon="tools">{t(streams.data ? 'con.no.destinations' : 'con.loading')}</Empty>
        )}
      </section>
      <section className="panel">
        <div className="panel-head">
          <h2>{t('con.add.destination')}</h2>
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
              {field('url', t('con.sink.url'))}
              {field('token', t('con.sink.bearer.optional'), 'password')}
            </>
          )}
          {kind === 'splunk' && (
            <>
              {field('url', t('con.sink.hec.url'))}
              {field('token', t('con.sink.hec.token'), 'password')}
            </>
          )}
          {kind === 'syslog' && (
            <>
              {field('host', t('con.sink.host'))}
              {field('port', t('con.sink.port'), 'number')}
            </>
          )}
          {kind === 'sentinel' && (
            <>
              {field('endpoint', t('con.sink.endpoint'))}
              {field('rule', t('con.sink.rule'))}
              {field('stream', t('con.sink.stream'))}
              {field('tenant', t('con.sink.tenant'))}
              {field('clientId', t('con.sink.client.id'))}
              {field('secret', t('con.sink.secret'), 'password')}
            </>
          )}
        </div>
        <div className="form-actions">
          <Run kind="primary" icon="send" run={async () => (await api('/streams', { method: 'POST', body: input() }), setF({}), streams.reload())}>
            {t('con.add.and.send')}
          </Run>
        </div>
      </section>
    </>
  );
}

// ------------------------------------------------------------------ the app

/** The pages, by id (the hash), each with its name (con.page.<id>). */
const PAGES = ['overview', 'people', 'agents', 'spaces', 'policy', 'directory', 'audit', 'tools'] as const;
type Page = (typeof PAGES)[number];
const PAGE_ICONS: Record<Page, IconName> = { overview: 'home', people: 'people', agents: 'robot', spaces: 'projects', policy: 'policy', directory: 'directory', audit: 'audit', tools: 'tools' };
/** The pages a role sees (stage 15): the helpdesk only who's who; auditors everything, read-only. */
const pagesFor = (role: Role): readonly Page[] => (role === 'helpdesk' ? ['overview', 'people'] : PAGES);

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

/** Settings pages for an auditor: shown as they are, nothing to change. */
function ReadOnly({ children }: { children: ReactNode }) {
  const role = useContext(RoleContext);
  return (
    <fieldset className="read-only" disabled={role === 'auditor'}>
      {children}
    </fieldset>
  );
}

function SignIn() {
  return (
    <div className="signin">
      <div className="signin-card">
        <Logo size={72} />
        <h1>{t('con.title')}</h1>
        <p className="muted">{t('con.signin.lead')}</p>
        <a className="btn primary big" href="/login">
          <Icon name="login" />
          <span>{t('con.signin.button')}</span>
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
    const name = decodeURIComponent(location.hash.slice(1));
    return (PAGES as readonly string[]).includes(name) ? (name as Page) : 'overview';
  };
  const [page, setPage] = useState<Page>(fromHash);
  useEffect(() => {
    location.hash = page;
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
          <span className="muted">{me.error ?? company.error ?? t('con.loading')}</span>
        </div>
      </div>
    );
  if (!company.data) return <div className="signin">{t('con.no.company')}</div>;
  const c = company.data;
  const who = me.data.name ?? me.data.email ?? me.data.subject;
  const role = me.data.role ?? 'admin';
  const pages = pagesFor(role);
  const shown: Page = pages.includes(page) ? page : 'overview';
  return (
    <RoleContext.Provider value={role}>
      <div className="shell">
        <nav>
          <div className="brand">
            <Logo size={30} />
            <div>
              <div className="wordmark">Weave</div>
              <div className="sub">{t('con.admin')}</div>
            </div>
          </div>
          <div className="company">
            <span className="company-name">{c.name}</span>
          </div>
          <div className="links">
            {pages.map((p) => (
              <button key={p} className={p === shown ? 'on' : ''} onClick={() => setPage(p)}>
                <Icon name={PAGE_ICONS[p]} />
                <span>{t(`con.page.${p}`)}</span>
              </button>
            ))}
          </div>
          <div className="me">
            <Avatar name={who} id={me.data.subject} />
            <div className="me-text">
              <div className="name">{who}</div>
              {role !== 'admin' && <div className="role">{t(`con.role.${role}`)}</div>}
              <a href="/logout">
                <Icon name="logout" size={12} /> {t('con.sign.out')}
              </a>
            </div>
            <button className="btn small ghost theme" title={t('con.theme', { theme: t(`con.theme.${theme}`) })} onClick={() => setTheme(theme === 'system' ? 'dark' : theme === 'dark' ? 'light' : 'system')}>
              <Icon name={theme === 'light' ? 'sun' : theme === 'dark' ? 'moon' : 'monitor'} />
            </button>
          </div>
        </nav>
        <main>
          {shown === 'overview' && <Overview company={c} go={setPage} />}
          {shown === 'people' && <People company={c} />}
          {shown === 'agents' && <Agents />}
          {shown === 'spaces' && <Spaces company={c} reload={company.reload} />}
          {shown === 'policy' && (
            <ReadOnly>
              <Policy key={JSON.stringify(c.policy) + JSON.stringify(c.retention) + c.auditors + c.helpdesk} company={c} reload={company.reload} />
            </ReadOnly>
          )}
          {shown === 'directory' && (
            <ReadOnly>
              <Directory />
            </ReadOnly>
          )}
          {shown === 'audit' && <Audit company={c} />}
          {shown === 'tools' && (
            <ReadOnly>
              <Streams />
            </ReadOnly>
          )}
        </main>
      </div>
    </RoleContext.Provider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
