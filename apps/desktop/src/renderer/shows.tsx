import { useState, type FormEvent } from 'react';
import type { SafeProposalInfo, ShowInfo, SpaceInfo, TicketInfo, WalletInfo } from '@weave/node/client';
import { formatUnits, isTxHash, parseUnits, TEST_USDC, TREASURY_CHAIN } from '@weave/core/chain';
import { api, bump, shortDid, useApi } from './lib.ts';
import { PayFromWallet } from './pay.tsx';
import { copy } from './posts.tsx';
import { ask, attempt, AsyncButton } from './ui.tsx';

/*
 * Ticketed shows (a live stream with an entry price): tickets are paid into the
 * show's own Safe, which its hosts' wallets own; after the show they pay out by
 * its split, or back if it's called off. Paying out is a Safe transaction the
 * hosts sign together, here, each in their own wallet.
 */

const when = (show: ShowInfo) => `${new Date(show.starts).toLocaleString()} – ${new Date(show.ends).toLocaleTimeString()}`;
const usdc = (amount: number | string, decimals: number = TEST_USDC.decimals) => `${formatUnits(amount, decimals)} USDC`;

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

function BuyTicket({ show }: { show: ShowInfo }) {
  const [paying, setPaying] = useState(false);
  const { data: wallet } = useApi(() => api<WalletInfo | undefined>('wallet'), []);
  if (!wallet) return <p className="small">Link your wallet (Keys & devices → Wallet) to buy a ticket from it.</p>;
  if (!paying) return <button className="default" onClick={() => setPaying(true)}>Get a ticket ({usdc(show.price.amount, show.price.decimals)})…</button>;
  return <PayFromWallet show={show.id} payee={show.host.name ?? 'the host'} onDone={() => setPaying(false)} />;
}

function HostTools({ show }: { show: ShowInfo }) {
  const { data: tickets } = useApi(() => api<TicketInfo[]>('tickets', show.id), [show.id]);
  const over = Date.parse(show.ends) < Date.now();
  return (
    <>
      {tickets && tickets.length > 0 && (
        <p className="small">
          Tickets: {tickets.filter((t) => t.ok).map((t) => t.holder.name ?? shortDid(t.holder.did)).join(', ') || 'none yet'}
          {tickets.some((t) => !t.ok) && <> · not let in: {tickets.filter((t) => !t.ok).map((t) => `${t.holder.name ?? shortDid(t.holder.did)} (${t.reason})`).join('; ')}</>}
        </p>
      )}
      <div className="buttons">
        {!show.cancelled && (
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

function ShowCard({ show }: { show: ShowInfo }) {
  const status = show.cancelled ? 'called off' : show.open ? 'on now' : when(show);
  return (
    <div className="sunken" style={{ padding: 8, margin: '6px 0' }}>
      <div className="field-row">
        <b className="grow">{show.name}</b>
        <span className="tag">{usdc(show.price.amount, show.price.decimals)}</span>
        <span className="small">{status}</span>
      </div>
      <div className="small">
        by {show.host.name ?? shortDid(show.host.did)}
        {show.capacity ? ` · ${show.sold ?? '?'}/${show.capacity} tickets` : show.sold !== undefined ? ` · ${show.sold} tickets` : ''} · after it:{' '}
        {show.split.map((p) => `${p.share / 100}% ${p.name ?? p.to.slice(0, 10)}${p.address ? '' : ' (no address yet)'}`).join(', ')}
      </div>
      <div className="small">
        Safe <code>{show.safe.address}</code> ({show.safe.threshold} of {show.hosts.length} hosts sign)
      </div>
      {show.ticket ? <p className="small">You have a ticket.</p> : !show.mine && !show.cancelled && <BuyTicket show={show} />}
      {show.mine && <HostTools show={show} />}
      {show.hosts.length > 0 && <SafeProposals safe={show.safe.address} />}
    </div>
  );
}

function NewShow({ project, onDone }: { project: SpaceInfo; onDone(): void }) {
  const [name, setName] = useState('');
  const [starts, setStarts] = useState('');
  const [ends, setEnds] = useState('');
  const [price, setPrice] = useState('3');
  const [capacity, setCapacity] = useState('');
  const [split, setSplit] = useState('project=10000');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amount = parseUnits(price, TEST_USDC.decimals);
    if (!amount) return;
    const parts = split
      .split(',')
      .map((part) => part.split('='))
      .filter(([to, share]) => to?.trim() && share)
      .map(([to, share]) => ({ to: to.trim(), share: Number(share) }));
    const made = await attempt(
      () => api('createShow', { name, project: project.id, starts: new Date(starts).toISOString(), ends: new Date(ends).toISOString(), price: amount, ...(capacity ? { capacity: Number(capacity) } : {}), split: parts }).then(bump),
      `${name} is set up: tickets go into its Safe`,
    );
    if (made !== undefined) onDone();
  };
  return (
    <form className="form" onSubmit={submit}>
      <div className="field-row">
        <input className="grow" required placeholder="Name, e.g. Finale live" value={name} onChange={(e) => setName(e.target.value)} aria-label="Show name" />
      </div>
      <div className="field-row">
        <label htmlFor="show-starts">From</label>
        <input id="show-starts" type="datetime-local" required value={starts} onChange={(e) => setStarts(e.target.value)} />
        <label htmlFor="show-ends">to</label>
        <input id="show-ends" type="datetime-local" required value={ends} onChange={(e) => setEnds(e.target.value)} />
      </div>
      <div className="field-row">
        <label htmlFor="show-price">Ticket (USDC)</label>
        <input id="show-price" inputMode="decimal" size={5} value={price} onChange={(e) => setPrice(e.target.value)} />
        <label htmlFor="show-capacity">Seats</label>
        <input id="show-capacity" inputMode="numeric" size={4} placeholder="any" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
      </div>
      <div className="field-row-stacked">
        <label htmlFor="show-split">Split after the show (basis points, 10000 = 100%): people, project, or addresses</label>
        <input id="show-split" spellCheck={false} value={split} onChange={(e) => setSplit(e.target.value)} placeholder="Lena=6000, project=4000" />
      </div>
      <p className="small">The money stays in the show's own Safe until it's over: then the hosts pay it out by the split, or back to everyone if it's called off. Test network: no real money.</p>
      <div className="buttons">
        <button type="button" onClick={onDone}>
          Cancel
        </button>
        <button className="default">Set up show</button>
      </div>
    </form>
  );
}

/** In a project's Live: its ticketed shows, to get a ticket for, or (hosts) to set up, call off and pay out. */
export function ShowsSection({ project, maintainer }: { project: SpaceInfo; maintainer: boolean }) {
  const { data: shows } = useApi(() => api<ShowInfo[]>('shows', project.id), [project.id]);
  const [adding, setAdding] = useState(false);
  if (!shows) return null;
  return (
    <section>
      <h3>Shows</h3>
      {shows.length === 0 && !adding && <p className="small">One-off events with tickets, like a live stream. Tickets are paid into the show's own Safe until it's over; its room lets ticket holders in while it's on.</p>}
      {shows.map((s) => (
        <ShowCard key={s.id} show={s} />
      ))}
      {maintainer && (adding ? <NewShow project={project} onDone={() => setAdding(false)} /> : <button onClick={() => setAdding(true)}>New show…</button>)}
    </section>
  );
}
