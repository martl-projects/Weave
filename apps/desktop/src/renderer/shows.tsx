import { useState, type FormEvent } from 'react';
import type { MemberInfo, WebsiteInfo, SafeProposalInfo, ShowInfo, SpaceInfo, TicketInfo, WalletInfo } from '@weave/node/client';
import { formatUnits, isHexAddress, parseUnits, TEST_USDC, TREASURY_CHAIN } from '@weave/core/chain';
import { Icon } from './icons.tsx';
import { api, bump, shortDid, useApi } from './lib.ts';
import { PayFromWallet } from './pay.tsx';
import { copy } from './posts.tsx';
import { WalletNeeded } from './wallet.tsx';
import { ask, attempt, AsyncButton, toast } from './ui.tsx';
import { currentTexts, t, T, useTexts } from './texts.tsx';

/*
 * Ticketed shows (a live stream with an entry price): tickets are paid into the
 * show's own Safe, which its hosts' wallets own; after the show they pay out by
 * its split, or back if it's called off. Paying out is a Safe transaction the
 * hosts sign together, here, each in their own wallet. A show happens in a room
 * of the project's app that lets its ticket holders in while it's on.
 */

const when = (show: ShowInfo) =>
  `${new Date(show.starts).toLocaleString(currentTexts().locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} – ${new Date(show.ends).toLocaleTimeString(currentTexts().locale, { hour: '2-digit', minute: '2-digit' })}`;
const usdc = (amount: number | string, decimals: number = TEST_USDC.decimals) => `${formatUnits(amount, decimals)} USDC`;
const person = (p: { did: string; name?: string }) => p.name ?? shortDid(p.did);
const pct = (bp: number) => `${(bp / 100).toLocaleString(currentTexts().locale, { maximumFractionDigits: 2 })}%`;

/** Transactions waiting for a Safe's owners: sign here (your wallet signs the hash), send once enough signed. */
export function SafeProposals({ safe }: { safe: string }) {
  const { data: proposals } = useApi(() => api<SafeProposalInfo[]>('safeProposals', safe).catch(() => []), [safe]);
  if (!proposals?.length) return null;
  return (
    <>
      {proposals.map((p) => (
        <SafeProposalCard key={p.id} proposal={p} />
      ))}
    </>
  );
}

function SafeProposalCard({ proposal: p }: { proposal: SafeProposalInfo }) {
  const { t } = useTexts();
  const [signature, setSignature] = useState('');
  return (
    <div className="sunken" style={{ padding: 8, margin: '6px 0' }}>
      <div className="field-row">
        <b className="grow">{p.title || t('safe.a.transaction')}</b>
        <span className="small">
          {t('safe.signed.of', { n: p.signed.length, threshold: p.safe.threshold })}
          {p.exec ? t('safe.ready') : ''}
        </span>
      </div>
      <div className="small">
        {p.signed.length > 0 && <>{t('safe.signed.by', { names: p.signed.map((s) => s.person.name ?? shortDid(s.person.did)).join(', ') })} </>}
        {p.waiting.length > 0 && <>{t('safe.waiting.for', { names: p.waiting.map((x) => x.name ?? shortDid(x.did)).join(', ') })}</>}
      </div>
      {p.exec ? (
        <>
          <p className="small">{t('safe.enough.signed', { chain: TREASURY_CHAIN.name })}</p>
          <div className="field-row">
            <span className="grow small">
              <T name="safe.to" values={{ to: <code>{p.exec.to}</code> }} />
            </span>
            <button onClick={() => copy(p.exec!.to, t('address.copied'))}>{t('safe.copy.to')}</button>
            <button onClick={() => copy(p.exec!.data, t('safe.data.copied'))}>{t('safe.copy.data')}</button>
          </div>
        </>
      ) : p.mine && !p.signedByMe ? (
        <>
          <p className="small">{t('safe.sign.in.wallet')}</p>
          <div className="field-row">
            <code className="grow small" style={{ wordBreak: 'break-all' }}>
              {p.hash}
            </code>
            <button onClick={() => copy(p.hash, t('safe.hash.copied'))}>{t('safe.copy.hash')}</button>
            <button onClick={() => copy(JSON.stringify(p.typedData), t('safe.typed.copied'))}>{t('safe.copy.typed')}</button>
          </div>
          <div className="field-row">
            <input className="grow" spellCheck={false} placeholder={t('safe.signature.placeholder')} value={signature} onChange={(e) => setSignature(e.target.value.trim())} aria-label={t('wallet.signature')} />
            <AsyncButton className="default" onClick={() => attempt(() => api('signSafeTx', { proposal: p.id, signature }).then(bump), t('safe.signed'))}>
              {t('safe.add.signature')}
            </AsyncButton>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** Where a show stands, by this computer's clock. */
function stage(show: ShowInfo): { label: string; tag: string } {
  const now = Date.now();
  if (show.cancelled) return { label: t('show.called.off'), tag: 'rejected' };
  if (now > Date.parse(show.ends)) return { label: t('show.over'), tag: '' };
  if (now >= Date.parse(show.starts)) return { label: t('show.on.now'), tag: 'status-active' };
  if (show.open) return { label: t('show.doors.open'), tag: 'status-active' };
  const days = Math.round((Date.parse(show.starts) - now) / 86_400_000);
  return { label: days < 1 ? t('day.today') : days === 1 ? t('day.tomorrow') : t('show.in.days', { n: days }), tag: '' };
}

function BuyTicket({ show }: { show: ShowInfo }) {
  const { t } = useTexts();
  const [paying, setPaying] = useState(false);
  const { data: wallet } = useApi(() => api<WalletInfo | undefined>('wallet'), []);
  if (!paying)
    return (
      <div className="buttons">
        <button className="default" onClick={() => setPaying(true)}>
          {t('show.get.ticket', { price: usdc(show.price.amount, show.price.decimals) })}
        </button>
      </div>
    );
  if (!wallet) return <WalletNeeded why={t('show.ticket.wallet', { host: person(show.host) })} />;
  return <PayFromWallet show={show.id} creator={show.host.did} payee={person(show.host)} onDone={() => setPaying(false)} />;
}

/** The split as rows to edit: the project's treasury, people, addresses. */
const rowsOf = (split: ShowInfo['split']): Part[] =>
  split.map((p) => ({ to: p.to.startsWith('project:') ? 'project' : p.to.startsWith('0x') ? 'address' : p.to, address: p.to.startsWith('0x') ? p.to : '', percent: String(p.share / 100) }));

/** After the show, its host decides who gets what, and the hosts sign that payout. */
function PayOut({ show, members, onDone }: { show: ShowInfo; members: MemberInfo[]; onDone(): void }) {
  const { t } = useTexts();
  const [parts, setParts] = useState(() => rowsOf(show.split));
  const pay = async () => {
    if (parts.some((p) => p.to === 'address' && !isHexAddress(p.address))) return toast(t('show.not.an.address'), 'error');
    const split = parts.map((p) => ({ to: p.to === 'address' ? p.address : p.to, share: Math.round(percent(p.percent) * 100) }));
    if (split.reduce((sum, p) => sum + p.share, 0) !== 10000) return toast(t('show.must.be.100'), 'error');
    if ((await attempt(() => api('settleShow', { show: show.id, action: 'payout', split }).then(bump), t('show.payout.proposed'))) !== undefined) onDone();
  };
  return (
    <div className="sunken" style={{ padding: 8, margin: '6px 0' }}>
      <SplitRows projectName={show.project?.name} members={members} parts={parts} onChange={setParts} />
      <div className="buttons">
        <button onClick={onDone}>{t('button.cancel')}</button>
        <AsyncButton className="default" onClick={pay}>
          {t('show.pay.out')}
        </AsyncButton>
      </div>
    </div>
  );
}

/** The host's side: who has a ticket, calling it off, paying out or back. */
function HostTools({ show, members }: { show: ShowInfo; members: MemberInfo[] }) {
  const { t } = useTexts();
  const { data: tickets } = useApi(() => api<TicketInfo[]>('tickets', show.id), [show.id]);
  const [paying, setPaying] = useState(false);
  const over = Date.parse(show.ends) < Date.now();
  const sold = (tickets ?? []).filter((ticket) => ticket.ok);
  const refused = (tickets ?? []).filter((ticket) => !ticket.ok);
  return (
    <>
      {sold.length > 0 && <p className="small">{t('show.tickets', { names: sold.map((ticket) => person(ticket.holder)).join(', ') })}</p>}
      {refused.length > 0 && <p className="small">{t('show.not.let.in', { list: refused.map((ticket) => `${person(ticket.holder)} (${ticket.reason})`).join('; ') })}</p>}
      <div className="buttons">
        {!show.cancelled && !over && (
          <AsyncButton
            onClick={async () => {
              if (await ask(t('show.call.off.ask', { name: show.name }), t('show.call.it.off'))) await attempt(() => api('cancelShow', show.id).then(bump), t('show.called.off'));
            }}
          >
            {t('show.call.off')}
          </AsyncButton>
        )}
        {show.cancelled ? (
          <AsyncButton className="default" onClick={() => attempt(() => api('settleShow', { show: show.id, action: 'refund' }).then(bump), t('show.refund.proposed'))}>
            {t('show.pay.back')}
          </AsyncButton>
        ) : (
          over &&
          !paying && (
            <button className="default" onClick={() => setPaying(true)}>
              {t('show.pay.out.button')}
            </button>
          )
        )}
      </div>
      {paying && <PayOut show={show} members={members} onDone={() => setPaying(false)} />}
    </>
  );
}

function ShowCard({ show, rooms, members, onHost }: { show: ShowInfo; rooms: WebsiteInfo[]; members: MemberInfo[]; onHost?(show: string): void }) {
  const { t } = useTexts();
  const { label, tag } = stage(show);
  const over = show.cancelled || Date.parse(show.ends) < Date.now();
  const room = rooms.find((r) => r.show === show.id);
  const tickets = show.sold !== undefined ? (show.capacity ? t('show.sold.of', { sold: show.sold, capacity: show.capacity }) : t('show.sold', { sold: show.sold })) : show.capacity ? t('show.seats', { n: show.capacity }) : '';
  return (
    <article className="room window">
      <div className="title-bar">
        <div className="title-bar-text">
          {show.name} · {usdc(show.price.amount, show.price.decimals)}
        </div>
      </div>
      <div className="window-body">
        <div className="field-row">
          <span className={`tag ${tag}`}>{label}</span>
          <span className="grow small">
            {when(show)} · {t('show.by', { host: person(show.host) })}
            {tickets && ` · ${tickets}`}
          </span>
          {show.ticket && <span className="tag passed">{t('show.your.ticket')}</span>}
        </div>
        {!over && (
          <p className="small">
            {room ? (
              <>
                <Icon name="zap" /> <T name="show.on.website" values={{ name: <b>{room.name}</b> }} />
                {show.mine ? '.' : show.ticket ? t(show.open ? 'show.join.below' : 'show.lets.you.in') : t('show.ticket.holders.in')}
              </>
            ) : show.mine ? (
              <>{t('show.no.website')}</>
            ) : (
              <>{t('show.room.opens', { host: person(show.host) })}</>
            )}
          </p>
        )}
        {!show.ticket && !show.mine && !over && <BuyTicket show={show} />}
        {show.mine && !room && !over && onHost && (
          <div className="buttons">
            <button className="default" onClick={() => onHost(show.id)}>
              <Icon name="plus" /> {t('show.open.room')}
            </button>
          </div>
        )}
        {show.mine && <HostTools show={show} members={members} />}
        <details>
          <summary className="small">{t('show.where.money')}</summary>
          <p className="small">
            <T
              name="show.money.about"
              values={{
                safe: <code>{show.safe.address}</code>,
                owners: show.hosts.map(person).join(', '),
                threshold: show.safe.threshold,
                n: show.hosts.length,
                host: person(show.host),
                split: show.split.map((p) => `${pct(p.share)} ${p.name ?? `${p.to.slice(0, 8)}…`}`).join(', '),
                chain: TREASURY_CHAIN.name,
              }}
            />
          </p>
        </details>
        {show.hosts.length > 0 && <SafeProposals safe={show.safe.address} />}
      </div>
    </article>
  );
}

/** A part of the split as typed: the project, a person or an address, and a percentage. */
type Part = { to: string; address: string; percent: string };

const percent = (text: string) => Number(text.replace(',', '.')) || 0;

function SplitRows({ projectName, members, parts, onChange }: { projectName?: string; members: MemberInfo[]; parts: Part[]; onChange(parts: Part[]): void }) {
  const { t } = useTexts();
  const total = parts.reduce((sum, p) => sum + percent(p.percent), 0);
  const set = (i: number, part: Partial<Part>) => onChange(parts.map((p, j) => (i === j ? { ...p, ...part } : p)));
  return (
    <fieldset>
      <legend>{t('show.who.gets')}</legend>
      {parts.map((p, i) => (
        <div className="field-row" key={i}>
          <select value={p.to} onChange={(e) => set(i, { to: e.target.value })} aria-label={t('show.who.gets.part')}>
            {projectName && <option value="project">{t('show.project.treasury', { project: projectName })}</option>}
            {members.map((m) => (
              <option key={m.did} value={m.did}>
                {m.name ?? shortDid(m.did)}
              </option>
            ))}
            <option value="address">{t('show.an.address')}</option>
          </select>
          {p.to === 'address' ? <input type="text" className="grow" spellCheck={false} placeholder="0x…" value={p.address} onChange={(e) => set(i, { address: e.target.value.trim() })} aria-label={t('show.address')} /> : <span className="grow" />}
          <input type="text" inputMode="decimal" style={{ width: 56 }} value={p.percent} onChange={(e) => set(i, { percent: e.target.value })} aria-label={t('show.percent')} />%
          {parts.length > 1 && (
            <button type="button" className="small-btn" title={t('button.remove')} onClick={() => onChange(parts.filter((_, j) => j !== i))}>
              ✕
            </button>
          )}
        </div>
      ))}
      <div className="field-row">
        <button type="button" onClick={() => onChange([...parts, { to: members[0]?.did ?? 'address', address: '', percent: String(Math.max(0, 100 - total)) }])}>
          {t('show.add.someone')}
        </button>
        <span className="grow small">{Math.abs(total - 100) < 0.001 ? t('show.paid.to.wallet') : t('show.adds.up', { total })}</span>
      </div>
    </fieldset>
  );
}

/** For datetime-local inputs: a time in this computer's zone. */
const local = (time: number) => new Date(time - new Date(time).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/**
 * Setting up a show along with the room it happens in (the Host room dialog):
 * when and the ticket. Who gets the money is decided after the show, paying
 * out. `create` sets it up and gives its id, or nothing when something's
 * missing (and says what).
 */
export function useShowForm(project: SpaceInfo) {
  const { t } = useTexts();
  const [start] = useState(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    return now.getTime();
  });
  const [starts, setStarts] = useState(local(start));
  const [ends, setEnds] = useState(local(start + 2 * 3600_000));
  const [price, setPrice] = useState('3');
  const [capacity, setCapacity] = useState('');
  // Moving the start moves the end with it, keeping how long the show is.
  const moveStart = (value: string) => {
    const length = Date.parse(ends) - Date.parse(starts);
    setStarts(value);
    if (value && length > 0) setEnds(local(Date.parse(value) + length));
  };
  const create = async (name: string): Promise<string | undefined> => {
    const amount = parseUnits(price.replace(',', '.'), TEST_USDC.decimals);
    if (!amount) return void toast(t('show.give.price'), 'error');
    const show = await attempt(() =>
      api<ShowInfo>('createShow', { name: name.trim() || t('word.show.cap'), project: project.id, starts: new Date(starts).toISOString(), ends: new Date(ends).toISOString(), price: amount, ...(capacity ? { capacity: Number(capacity) } : {}) }),
    );
    return show?.id;
  };
  const fields = (
    <>
      <div className="field-row">
        <input id="show-starts" type="datetime-local" required value={starts} onChange={(e) => moveStart(e.target.value)} aria-label={t('show.starts')} />
        <span>{t('show.to')}</span>
        <input id="show-ends" type="datetime-local" required value={ends} onChange={(e) => setEnds(e.target.value)} aria-label={t('show.ends')} />
      </div>
      <div className="field-row">
        <input id="show-price" type="text" inputMode="decimal" style={{ width: 56 }} value={price} onChange={(e) => setPrice(e.target.value)} aria-label={t('show.ticket.price')} />
        <label htmlFor="show-price">{t('show.usdc.a.ticket')}</label>
        <input id="show-capacity" type="text" inputMode="numeric" style={{ width: 48 }} placeholder={t('show.any')} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
        <label htmlFor="show-capacity">{t('show.seats.label')}</label>
      </div>
      <p className="small muted">{t('show.money.waits')}</p>
    </>
  );
  return { fields, create };
}

/**
 * In a project's Live, under its rooms: one folded line for its ticketed
 * shows, opened to get a ticket or (hosts) to open its room, call it off and
 * pay out. It opens by itself only while a show of yours is on. Shows are set
 * up with their room, in Host room.
 */
export function ShowsSection({ rooms, shows, members, onHost }: { rooms: WebsiteInfo[]; shows: ShowInfo[]; members: MemberInfo[]; onHost?(show: string): void }) {
  const { t } = useTexts();
  const [opened, setOpened] = useState<boolean>();
  if (!shows.length) return null;
  // Hosts keep shows that are over in sight (they still pay out); everyone else sees what's coming.
  const done = (s: ShowInfo) => s.cancelled || Date.parse(s.ends) < Date.now();
  const coming = shows.filter((s) => !done(s) || s.mine);
  const gone = shows.filter((s) => done(s) && !s.mine);
  const next = coming.find((s) => !done(s));
  const open = opened ?? coming.some((s) => s.open && (s.mine || s.ticket));
  const summary = next ? `${next.name} · ${stage(next).label.toLowerCase()}${coming.length > 1 ? t('show.more', { n: coming.length - 1 }) : ''}` : coming.length ? t('show.to.settle', { n: coming.length }) : t('show.none.coming');
  return (
    <section className="shows">
      <div className="field-row">
        <button className="link grow" style={{ textAlign: 'left' }} aria-expanded={open} onClick={() => setOpened(!open)}>
          {open ? '▾' : '▸'} {t('shows.title')} <span className="small muted">{summary}</span>
        </button>
      </div>
      {open && (
        <>
          {coming.map((s) => (
            <ShowCard key={s.id} show={s} rooms={rooms} members={members} onHost={onHost} />
          ))}
          {gone.length > 0 && <p className="small muted">{t('shows.past', { n: gone.length })}</p>}
        </>
      )}
    </section>
  );
}
