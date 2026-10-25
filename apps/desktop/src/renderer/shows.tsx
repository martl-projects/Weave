import { useState, type FormEvent } from 'react';
import type { MemberInfo, RoomInfo, SafeProposalInfo, ShowInfo, SpaceInfo, TicketInfo, WalletInfo } from '@weave/node/client';
import { formatUnits, isHexAddress, parseUnits, TEST_USDC, TREASURY_CHAIN } from '@weave/core/chain';
import { Icon } from './icons.tsx';
import { api, bump, shortDid, useApi } from './lib.ts';
import { PayFromWallet } from './pay.tsx';
import { copy } from './posts.tsx';
import { WalletLink } from './wallet.tsx';
import { ask, attempt, AsyncButton, toast } from './ui.tsx';

/*
 * Ticketed shows (a live stream with an entry price): tickets are paid into the
 * show's own Safe, which its hosts' wallets own; after the show they pay out by
 * its split, or back if it's called off. Paying out is a Safe transaction the
 * hosts sign together, here, each in their own wallet. A show happens in a room
 * of the project's app that lets its ticket holders in while it's on.
 */

const when = (show: ShowInfo) =>
  `${new Date(show.starts).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} – ${new Date(show.ends).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
const usdc = (amount: number | string, decimals: number = TEST_USDC.decimals) => `${formatUnits(amount, decimals)} USDC`;
const person = (p: { did: string; name?: string }) => p.name ?? shortDid(p.did);
const pct = (bp: number) => `${(bp / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

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
  const [signature, setSignature] = useState('');
  return (
    <div className="sunken" style={{ padding: 8, margin: '6px 0' }}>
      <div className="field-row">
        <b className="grow">{p.title || 'A transaction'}</b>
        <span className="small">
          {p.signed.length} of {p.safe.threshold} signed{p.exec ? ' · ready' : ''}
        </span>
      </div>
      <div className="small">
        {p.signed.length > 0 && <>Signed: {p.signed.map((s) => s.person.name ?? shortDid(s.person.did)).join(', ')}. </>}
        {p.waiting.length > 0 && <>Waiting for: {p.waiting.map((x) => x.name ?? shortDid(x.did)).join(', ')}.</>}
      </div>
      {p.exec ? (
        <>
          <p className="small">Enough owners signed. Send this transaction from any wallet on {TREASURY_CHAIN.name} to run it; the Safe checks every signature itself.</p>
          <div className="field-row">
            <span className="grow small">
              to <code>{p.exec.to}</code>
            </span>
            <button onClick={() => copy(p.exec!.to, 'Address copied')}>Copy to</button>
            <button onClick={() => copy(p.exec!.data, 'Data copied')}>Copy data</button>
          </div>
        </>
      ) : p.mine && !p.signedByMe ? (
        <>
          <p className="small">
            Sign it in your wallet: the typed data (eth_signTypedData_v4), or the hash as a message. Weave never sees your key.
          </p>
          <div className="field-row">
            <code className="grow small" style={{ wordBreak: 'break-all' }}>
              {p.hash}
            </code>
            <button onClick={() => copy(p.hash, 'Hash copied')}>Copy hash</button>
            <button onClick={() => copy(JSON.stringify(p.typedData), 'Typed data copied')}>Copy typed data</button>
          </div>
          <div className="field-row">
            <input className="grow" spellCheck={false} placeholder="0x… your signature" value={signature} onChange={(e) => setSignature(e.target.value.trim())} aria-label="Signature" />
            <AsyncButton className="default" onClick={() => attempt(() => api('signSafeTx', { proposal: p.id, signature }).then(bump), 'Signed')}>
              Add signature
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
  if (show.cancelled) return { label: 'Called off', tag: 'rejected' };
  if (now > Date.parse(show.ends)) return { label: 'Over', tag: '' };
  if (now >= Date.parse(show.starts)) return { label: 'On now', tag: 'status-active' };
  if (show.open) return { label: 'Doors open', tag: 'status-active' };
  const days = Math.round((Date.parse(show.starts) - now) / 86_400_000);
  return { label: days < 1 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`, tag: '' };
}

function BuyTicket({ show }: { show: ShowInfo }) {
  const [paying, setPaying] = useState(false);
  const { data: wallet } = useApi(() => api<WalletInfo | undefined>('wallet'), []);
  if (!paying)
    return (
      <div className="buttons">
        <button className="default" onClick={() => setPaying(true)}>
          Get a ticket · {usdc(show.price.amount, show.price.decimals)}
        </button>
      </div>
    );
  if (!wallet) return <WalletLink intro={`Tickets are paid from your own wallet: link it first, so ${person(show.host)} knows the payment is yours.`} />;
  return <PayFromWallet show={show.id} payee={person(show.host)} onDone={() => setPaying(false)} />;
}

/** The host's side: who has a ticket, calling it off, paying out or back. */
function HostTools({ show }: { show: ShowInfo }) {
  const { data: tickets } = useApi(() => api<TicketInfo[]>('tickets', show.id), [show.id]);
  const over = Date.parse(show.ends) < Date.now();
  const sold = (tickets ?? []).filter((t) => t.ok);
  const refused = (tickets ?? []).filter((t) => !t.ok);
  return (
    <>
      {sold.length > 0 && <p className="small">Tickets: {sold.map((t) => person(t.holder)).join(', ')}</p>}
      {refused.length > 0 && <p className="small">Not let in: {refused.map((t) => `${person(t.holder)} (${t.reason})`).join('; ')}</p>}
      <div className="buttons">
        {!show.cancelled && !over && (
          <AsyncButton
            onClick={async () => {
              if (await ask(`Call ${show.name} off? Tickets stop letting people in; then pay everyone back.`, 'Call it off')) await attempt(() => api('cancelShow', show.id).then(bump), 'Called off');
            }}
          >
            Call off
          </AsyncButton>
        )}
        {show.cancelled ? (
          <AsyncButton className="default" onClick={() => attempt(() => api('settleShow', { show: show.id, action: 'refund' }).then(bump), 'Proposed: the hosts sign the refund below')}>
            Pay everyone back…
          </AsyncButton>
        ) : (
          over && (
            <AsyncButton className="default" onClick={() => attempt(() => api('settleShow', { show: show.id, action: 'payout' }).then(bump), 'Proposed: the hosts sign the payout below')}>
              Pay out by the split…
            </AsyncButton>
          )
        )}
      </div>
    </>
  );
}

function ShowCard({ show, rooms, onHost }: { show: ShowInfo; rooms: RoomInfo[]; onHost?(show: string): void }) {
  const { label, tag } = stage(show);
  const over = show.cancelled || Date.parse(show.ends) < Date.now();
  const room = rooms.find((r) => r.show === show.id);
  const missing = show.split.filter((p) => !p.address);
  const tickets = show.sold !== undefined ? `${show.sold}${show.capacity ? ` of ${show.capacity}` : ''} tickets` : show.capacity ? `${show.capacity} seats` : '';
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
            {when(show)} · by {person(show.host)}
            {tickets && ` · ${tickets}`}
          </span>
          {show.ticket && <span className="tag passed">✓ Your ticket</span>}
        </div>
        {!over && (
          <p className="small">
            {room ? (
              <>
                <Icon name="zap" /> In the room <b>{room.name}</b>
                {show.mine ? '.' : show.ticket ? (show.open ? ': join it below.' : ': it lets you in from an hour before the start.') : ': ticket holders get in from an hour before the start.'}
              </>
            ) : show.mine ? (
              <>No room yet. Open one for it when you're ready: its ticket holders get in from an hour before the start.</>
            ) : (
              <>Its room opens when {person(show.host)} starts it; with a ticket you get in from an hour before the start.</>
            )}
          </p>
        )}
        {!show.ticket && !show.mine && !over && <BuyTicket show={show} />}
        {show.mine && !room && !over && onHost && (
          <div className="buttons">
            <button className="default" onClick={() => onHost(show.id)}>
              <Icon name="plus" /> Open its room…
            </button>
          </div>
        )}
        <p className="small">
          After it: {show.split.map((p) => `${pct(p.share)} to ${p.name ?? `${p.to.slice(0, 8)}…`}`).join(', ')}
          {missing.length > 0 && <span className="muted"> · no wallet yet: {missing.map((p) => p.name ?? p.to).join(', ')}</span>}
        </p>
        {show.mine && <HostTools show={show} />}
        <details>
          <summary className="small">Where the money is</summary>
          <p className="small">
            In the show's own Safe <code>{show.safe.address}</code>, owned by {show.hosts.map(person).join(', ')} ({show.safe.threshold} of {show.hosts.length} sign). After the show it pays out by the split; called off, it pays everyone back. {TREASURY_CHAIN.name} is a test network: no real money.
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

function SplitRows({ project, members, parts, onChange }: { project: SpaceInfo; members: MemberInfo[]; parts: Part[]; onChange(parts: Part[]): void }) {
  const total = parts.reduce((sum, p) => sum + percent(p.percent), 0);
  const set = (i: number, part: Partial<Part>) => onChange(parts.map((p, j) => (i === j ? { ...p, ...part } : p)));
  return (
    <fieldset>
      <legend>After the show, the money goes to</legend>
      {parts.map((p, i) => (
        <div className="field-row" key={i}>
          <select value={p.to} onChange={(e) => set(i, { to: e.target.value })} aria-label="Who gets this part">
            <option value="project">p/{project.name}'s treasury</option>
            {members.map((m) => (
              <option key={m.did} value={m.did}>
                {m.name ?? shortDid(m.did)}
              </option>
            ))}
            <option value="address">An address…</option>
          </select>
          {p.to === 'address' ? <input type="text" className="grow" spellCheck={false} placeholder="0x…" value={p.address} onChange={(e) => set(i, { address: e.target.value.trim() })} aria-label="Address" /> : <span className="grow" />}
          <input type="text" inputMode="decimal" style={{ width: 56 }} value={p.percent} onChange={(e) => set(i, { percent: e.target.value })} aria-label="Percent" />%
          {parts.length > 1 && (
            <button type="button" className="small-btn" title="Remove" onClick={() => onChange(parts.filter((_, j) => j !== i))}>
              ✕
            </button>
          )}
        </div>
      ))}
      <div className="field-row">
        <button type="button" onClick={() => onChange([...parts, { to: members[0]?.did ?? 'address', address: '', percent: String(Math.max(0, 100 - total)) }])}>
          Add someone
        </button>
        <span className="grow small">{Math.abs(total - 100) < 0.001 ? 'People are paid to their linked wallet, the project to its treasury.' : `Adds up to ${total}%: it has to be 100%.`}</span>
      </div>
    </fieldset>
  );
}

/** For datetime-local inputs: a time in this computer's zone. */
const local = (time: number) => new Date(time - new Date(time).getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

/**
 * Setting up a show along with the room it happens in (the Host room dialog):
 * when, the ticket, the split. `create` sets it up and gives its id, or
 * nothing when something's missing (and says what).
 */
export function useShowForm(project: SpaceInfo, members: MemberInfo[]) {
  const [start] = useState(() => {
    const now = new Date();
    now.setSeconds(0, 0);
    return now.getTime();
  });
  const [starts, setStarts] = useState(local(start));
  const [ends, setEnds] = useState(local(start + 2 * 3600_000));
  const [price, setPrice] = useState('3');
  const [capacity, setCapacity] = useState('');
  const [parts, setParts] = useState<Part[]>([{ to: 'project', address: '', percent: '100' }]);
  // Moving the start moves the end with it, keeping how long the show is.
  const moveStart = (value: string) => {
    const length = Date.parse(ends) - Date.parse(starts);
    setStarts(value);
    if (value && length > 0) setEnds(local(Date.parse(value) + length));
  };
  const create = async (name: string): Promise<string | undefined> => {
    const amount = parseUnits(price.replace(',', '.'), TEST_USDC.decimals);
    if (!amount) return void toast('Give the ticket price in USDC, like 3 or 2.50', 'error');
    if (parts.some((p) => p.to === 'address' && !isHexAddress(p.address))) return void toast("That's not an address: 0x and 40 hex digits", 'error');
    const split = parts.map((p) => ({ to: p.to === 'address' ? p.address : p.to, share: Math.round(percent(p.percent) * 100) }));
    if (split.reduce((sum, p) => sum + p.share, 0) !== 10000) return void toast('The split has to add up to 100%', 'error');
    const show = await attempt(() =>
      api<ShowInfo>('createShow', { name: name.trim() || 'Show', project: project.id, starts: new Date(starts).toISOString(), ends: new Date(ends).toISOString(), price: amount, ...(capacity ? { capacity: Number(capacity) } : {}), split }),
    );
    return show?.id;
  };
  const fields = (
    <>
      <div className="field-row">
        <label htmlFor="show-starts">From</label>
        <input id="show-starts" type="datetime-local" required value={starts} onChange={(e) => moveStart(e.target.value)} />
        <label htmlFor="show-ends">to</label>
        <input id="show-ends" type="datetime-local" required value={ends} onChange={(e) => setEnds(e.target.value)} />
      </div>
      <div className="field-row">
        <label htmlFor="show-price">Ticket</label>
        <input id="show-price" type="text" inputMode="decimal" style={{ width: 64 }} value={price} onChange={(e) => setPrice(e.target.value)} /> USDC
        <label htmlFor="show-capacity">Seats</label>
        <input id="show-capacity" type="text" inputMode="numeric" style={{ width: 56 }} placeholder="any" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      </div>
      <SplitRows project={project} members={members} parts={parts} onChange={setParts} />
      <p className="small">Tickets are paid into the show's own Safe and stay there until it's over: then you pay them out by the split, or back to everyone if you call it off. Ticket holders get in from an hour before the start. Test network: no real money.</p>
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
export function ShowsSection({ rooms, shows, onHost }: { rooms: RoomInfo[]; shows: ShowInfo[]; onHost?(show: string): void }) {
  const [opened, setOpened] = useState<boolean>();
  if (!shows.length) return null;
  // Hosts keep shows that are over in sight (they still pay out); everyone else sees what's coming.
  const done = (s: ShowInfo) => s.cancelled || Date.parse(s.ends) < Date.now();
  const coming = shows.filter((s) => !done(s) || s.mine);
  const gone = shows.filter((s) => done(s) && !s.mine);
  const next = coming.find((s) => !done(s));
  const open = opened ?? coming.some((s) => s.open && (s.mine || s.ticket));
  const summary = next ? `${next.name} · ${stage(next).label.toLowerCase()}${coming.length > 1 ? ` · ${coming.length - 1} more` : ''}` : coming.length ? `${coming.length} to settle` : 'none coming';
  return (
    <section className="shows">
      <div className="field-row">
        <button className="link grow" style={{ textAlign: 'left' }} aria-expanded={open} onClick={() => setOpened(!open)}>
          {open ? '▾' : '▸'} 🎟 Shows <span className="small muted">{summary}</span>
        </button>
      </div>
      {open && (
        <>
          {coming.map((s) => (
            <ShowCard key={s.id} show={s} rooms={rooms} onHost={onHost} />
          ))}
          {gone.length > 0 && <p className="small muted">{gone.length} past show{gone.length === 1 ? '' : 's'}.</p>}
        </>
      )}
    </section>
  );
}
