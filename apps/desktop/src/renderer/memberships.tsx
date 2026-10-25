import { useEffect, useState, type FormEvent } from 'react';
import type { GumroadInfo, MembershipRequestInfo, TierInfo, WalletInfo } from '@weave/node/client';
import { formatUnits, isHexAddress, isTxHash, parseUnits, TEST_USDC, TREASURY_CHAIN } from '@weave/core/chain';
import { PayFromWallet } from './pay.tsx';
import { Icon } from './icons.tsx';
import { ago, api, bump, shortDid, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Avatar, Modal, Sprite, toast } from './ui.tsx';

/*
 * Memberships, Patreon-style: creators offer tiers on their hub, supporters
 * ask to join (saying how they paid), creators grant months from their Inbox.
 * Tiers sold through Gumroad let supporters in by their license key instead,
 * tiers paid on chain (test USDC) by the transaction that paid them.
 * A tier is a group, so members get its chat and the projects it's invited into.
 */

export const money = (cents: number, currency: string) =>
  cents === 0 ? 'Free' : `${new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(cents / 100)} / month`;

const until = (iso: string) => new Date(iso).toLocaleDateString();

function TierCard({ tier, onJoin, onEdit }: { tier: TierInfo; onJoin?(): void; onEdit?(): void }) {
  let status;
  if (tier.mine)
    status = (
      <>
        <span className="small">
          {tier.members} member{tier.members === 1 ? '' : 's'}
          {tier.open ? '' : ' · closed'}
        </span>
        {onEdit && <button onClick={onEdit}>Edit…</button>}
      </>
    );
  else if (tier.membership?.active) status = <span className="tag friend">member until {until(tier.membership.until)}</span>;
  else if (tier.requested) status = <span className="tag">asked to join</span>;
  else if (tier.open) status = <button className="default" onClick={onJoin}>{tier.membership ? 'Renew…' : 'Join…'}</button>;
  else status = <span className="small">not taking new members</span>;
  return (
    <article className="tier sunken">
      <Sprite seed={tier.id} size={40} />
      <div className="grow">
        <b>{tier.name}</b> <span className="price">{money(tier.price, tier.currency)}</span>
        {tier.gumroad && <span className="tag">via Gumroad</span>}
        {tier.onchain && (
          <span className="tag" title={`To ${tier.onchain.to} on ${TREASURY_CHAIN.name}, a test network`}>
            {formatUnits(tier.onchain.amount, tier.onchain.decimals)} {tier.onchain.symbol} on chain
          </span>
        )}
        {tier.description && <p className="small">{tier.description}</p>}
        {tier.benefits.length > 0 && (
          <ul className="benefits">
            {tier.benefits.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="tier-side">{status}</div>
    </article>
  );
}

/** Joining a tier sold through Gumroad: buy there, then paste the license key from the receipt. */
function GumroadJoin({ tier, creator, onClose }: { tier: TierInfo; creator: string; onClose(): void }) {
  const [license, setLicense] = useState('');
  const [note, setNote] = useState('');
  return (
    <form
      className="form"
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        const sent = await attempt(() => api('requestMembership', { tier: tier.id, note, license }).then(bump), `Sent: you're in as soon as ${creator}'s Weave has checked your key with Gumroad`);
        if (sent !== undefined) onClose();
      }}
    >
      <ol className="steps">
        <li>
          Buy <b>{tier.name}</b> ({money(tier.price, tier.currency)}) on Gumroad:{' '}
          <a href={tier.gumroad!.url} target="_blank" rel="noopener noreferrer">
            open {tier.gumroad!.variant ? `“${tier.gumroad!.variant}” ` : ''}on Gumroad
          </a>
          . Gumroad handles the payment; Weave never sees it.
        </li>
        <li>
          <label htmlFor="join-license">Paste the license key from your Gumroad receipt:</label>
          <input id="join-license" className="wide" required autoFocus spellCheck={false} placeholder="XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX" value={license} onChange={(e) => setLicense(e.target.value.trim())} />
        </li>
      </ol>
      <input className="wide" placeholder="A note for them (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="small">
        Only {creator} can read the key and your note. Their Weave checks the key with Gumroad and lets you in, and renews each month while you pay. It works for one person only.
      </p>
      <div className="buttons">
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button className="default" disabled={!license}>
          Send key
        </button>
      </div>
    </form>
  );
}

/** Joining a tier paid on chain: send the token from your linked wallet, then paste the transaction's hash. */
function OnchainJoin({ tier, creator, onClose }: { tier: TierInfo; creator: string; onClose(): void }) {
  // null: no wallet linked; undefined: still asking.
  const { data: wallet } = useApi(() => api<WalletInfo | undefined>('wallet').then((w) => w ?? null), []);
  if (wallet === undefined) return null;
  if (!wallet)
    return (
      <p className="small">
        Paying in {tier.onchain!.symbol} goes from your own wallet: link it first (a project's Settings → Treasury, or <code>weave wallet link</code>), so {creator} knows the payment is yours.
      </p>
    );
  return <PayFromWallet tier={tier.id} payee={creator} onDone={onClose} />;
}

function JoinDialog({ tier, onClose }: { tier: TierInfo; onClose(): void }) {
  const [note, setNote] = useState('');
  const [way, setWay] = useState<'gumroad' | 'onchain'>(tier.gumroad ? 'gumroad' : 'onchain');
  const creator = tier.creator.name ?? shortDid(tier.creator.did);
  if (tier.onchain || tier.gumroad)
    return (
      <Modal title={`Join ${tier.name}`} onClose={onClose}>
        {tier.onchain && tier.gumroad && (
          <div className="field-row" role="radiogroup" aria-label="How to pay">
            <span className="small">Pay with</span>
            <input id="way-gumroad" type="radio" checked={way === 'gumroad'} onChange={() => setWay('gumroad')} />
            <label htmlFor="way-gumroad">Gumroad ({money(tier.price, tier.currency)})</label>
            <input id="way-onchain" type="radio" checked={way === 'onchain'} onChange={() => setWay('onchain')} />
            <label htmlFor="way-onchain">
              USDC ({formatUnits(tier.onchain.amount, tier.onchain.decimals)} {tier.onchain.symbol} / month)
            </label>
          </div>
        )}
        {tier.onchain && (way === 'onchain' || !tier.gumroad) ? <OnchainJoin tier={tier} creator={creator} onClose={onClose} /> : <GumroadJoin tier={tier} creator={creator} onClose={onClose} />}
      </Modal>
    );
  return (
    <Modal title={`Join ${tier.name}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          if (await attempt(() => api('requestMembership', { tier: tier.id, note }).then(bump), `Asked ${creator}`)) onClose();
        }}
      >
        <p className="small">
          {tier.price > 0 ? (
            <>
              {tier.name} costs <b>{money(tier.price, tier.currency)}</b>. Weave doesn't handle money yet: pay {creator} the way you agree on, and tell them here.
            </>
          ) : (
            <>{tier.name} is free; {creator} decides who joins.</>
          )}{' '}
          Only {creator} can read your note.
        </p>
        <textarea className="wide" rows={3} autoFocus placeholder={tier.price > 0 ? 'e.g. Sent €5 via PayPal' : 'Say hi (optional)'} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default">Ask to join</button>
        </div>
      </form>
    </Modal>
  );
}

function TierDialog({ tier, onClose }: { tier?: TierInfo; onClose(): void }) {
  const [name, setName] = useState(tier?.name ?? '');
  const [price, setPrice] = useState(tier ? String(tier.price / 100) : '5');
  const [currency, setCurrency] = useState(tier?.currency ?? 'EUR');
  const [description, setDescription] = useState(tier?.description ?? '');
  const [benefits, setBenefits] = useState(tier?.benefits.join('\n') ?? '');
  const [open, setOpen] = useState(tier?.open ?? true);
  const [auto, setAuto] = useState(tier?.auto ?? false);
  const [onGumroad, setOnGumroad] = useState(!!tier?.gumroad);
  const [product, setProduct] = useState(tier?.gumroad?.product ?? '');
  const [url, setUrl] = useState(tier?.gumroad?.url ?? '');
  const [variant, setVariant] = useState(tier?.gumroad?.variant ?? '');
  // Make the product on Gumroad (through the Gumroad connection, or an access token used once) instead of linking one made by hand.
  const [makeIt, setMakeIt] = useState(!tier?.gumroad);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [onChain, setOnChain] = useState(!!tier?.onchain);
  const [usdc, setUsdc] = useState(tier?.onchain ? formatUnits(tier.onchain.amount, tier.onchain.decimals) : '5');
  const [payTo, setPayTo] = useState(tier?.onchain?.to ?? '');
  const { data: wallet } = useApi(() => api<WalletInfo | undefined>('wallet'), []);
  const making = onGumroad && makeIt;
  const [connection, setConnection] = useState<GumroadInfo>();
  const [useToken, setUseToken] = useState(false);
  const askConnection = () => api<GumroadInfo>('gumroad').then(setConnection, () => undefined);
  useEffect(() => {
    if (making && !connection) void askConnection();
  }, [making, connection]);
  // While Gumroad waits for the creator in the browser, ask how it went.
  const waiting = connection?.pending?.url;
  useEffect(() => {
    if (!waiting) return;
    const timer = setInterval(() => void askConnection(), 1500);
    return () => clearInterval(timer);
  }, [waiting]);
  const connect = async () => {
    const started = await attempt(() => api<GumroadInfo>('connectGumroad'));
    if (!started) return;
    setConnection(started);
    if (started.pending) window.open(started.pending.url, '_blank', 'noopener');
  };
  const viaToken = useToken || (!!connection && !connection.available && !connection.account);
  const ready = !making || (viaToken ? !!token : !!connection?.account);
  // A new Gumroad link, null to stop selling there, or nothing to leave it as it is (or until the made product links it).
  const gumroad = making ? undefined : onGumroad ? { product, url, ...(variant.trim() ? { variant } : {}) } : tier?.gumroad ? null : undefined;
  const cents = Math.round(Number(price.replace(',', '.')) * 100);
  const usdcAmount = parseUnits(usdc, TEST_USDC.decimals);
  const to = payTo.trim() || wallet?.address || '';
  const onchain = onChain ? { chain: TEST_USDC.chain, token: TEST_USDC.token, symbol: TEST_USDC.symbol, decimals: TEST_USDC.decimals, to, amount: usdcAmount ?? 0 } : tier?.onchain ? null : undefined;
  const input = () => ({ name, price: cents, currency, description, benefits: benefits.split('\n'), open, auto: onGumroad || onChain ? false : auto, gumroad, onchain });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (making && !(cents > 0)) return toast('A tier sold on Gumroad needs a price', 'error');
    if (onChain && (!usdcAmount || !isHexAddress(to))) return toast(usdcAmount ? 'Where do payments go? Link your wallet, or give an address' : 'Give the price in USDC, like 5 or 2.50', 'error');
    setBusy(true);
    const saved = await attempt(() => (tier ? api<TierInfo>('setTier', { tier: tier.id, ...input() }) : api<TierInfo>('createTier', input())), making ? undefined : tier ? 'Tier saved' : `${name} is on your hub`);
    if (saved && making) {
      const sold = await attempt(() => api<{ published: boolean; warning?: string }>('sellTierOnGumroad', { tier: saved.id, ...(viaToken ? { token } : {}) }));
      if (!sold) toast(`${name} is saved, but not on Gumroad yet: Edit it to try again`, 'error');
      else toast(sold.published ? `${name} is on sale on Gumroad` : `${name} is on Gumroad, not published yet: ${sold.warning}`, sold.published ? 'ok' : 'error');
    }
    setBusy(false);
    if (saved) {
      bump();
      onClose();
    }
  };
  return (
    <Modal title={tier ? `Edit ${tier.name}` : 'New tier'} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="field-row-stacked">
          <label htmlFor="tier-name">Name</label>
          <input id="tier-name" required maxLength={40} placeholder="Supporters" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-row">
          <label htmlFor="tier-price">Price per month</label>
          <input id="tier-price" inputMode="decimal" size={6} value={price} onChange={(e) => setPrice(e.target.value)} />
          <select aria-label="Currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {['EUR', 'USD', 'GBP', 'CHF'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <span className="small">0 = free</span>
        </div>
        <div className="field-row-stacked">
          <label htmlFor="tier-text">What is it?</label>
          <textarea id="tier-text" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field-row-stacked">
          <label htmlFor="tier-benefits">Benefits, one per line</label>
          <textarea id="tier-benefits" rows={3} placeholder={'Supporter lounge\nEarly builds of my projects'} value={benefits} onChange={(e) => setBenefits(e.target.value)} />
        </div>
        <div className="field-row">
          <input id="tier-open" type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
          <label htmlFor="tier-open">Taking new members</label>
        </div>
        <div className="field-row">
          <input id="tier-auto" type="checkbox" checked={auto && !onGumroad} disabled={onGumroad} onChange={(e) => setAuto(e.target.checked)} />
          <label htmlFor="tier-auto">Let people in automatically (for free tiers)</label>
        </div>
        <fieldset>
          <legend>Ways to pay</legend>
          <p className="small">Offer one or more; supporters pick theirs when they join. Nothing ticked: they pay you the way you agree on, and you let them in.</p>
          <div className="field-row">
            <input id="tier-gumroad" type="checkbox" checked={onGumroad} onChange={(e) => setOnGumroad(e.target.checked)} /> <label htmlFor="tier-gumroad"><b>Gumroad</b>: card, PayPal; Gumroad is the seller</label>
          </div>
          {onGumroad && (
            <>
              <div className="field-row">
                <input id="gumroad-make" type="radio" checked={makeIt} onChange={() => setMakeIt(true)} />
                <label htmlFor="gumroad-make">{tier?.gumroad ? 'Make a new product on Gumroad' : 'Make the product on Gumroad for me'}</label>
              </div>
              <div className="field-row">
                <input id="gumroad-link" type="radio" checked={!makeIt} onChange={() => setMakeIt(false)} />
                <label htmlFor="gumroad-link">{tier?.gumroad ? 'Keep the product it is linked to, or link another' : 'Link a product I made'}</label>
              </div>
            </>
          )}
          {making ? (
            <>
              {viaToken ? (
                <>
                  <div className="field-row-stacked">
                    <label htmlFor="gumroad-token">Gumroad access token</label>
                    <input id="gumroad-token" required type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value.trim())} />
                  </div>
                  <p className="small">
                    In Gumroad: <b>Settings → Advanced → Applications</b>, create an application (any name and redirect URI), then <b>Generate access token</b>. Weave uses it once and doesn't keep it.
                    {connection?.available && (
                      <>
                        {' '}
                        <button type="button" className="link" onClick={() => setUseToken(false)}>
                          Connect Gumroad instead
                        </button>
                      </>
                    )}
                  </p>
                </>
              ) : connection?.account ? (
                <p className="small">
                  Connected to Gumroad as <b>{connection.account}</b>.{' '}
                  <button type="button" className="link" onClick={() => setUseToken(true)}>
                    Use an access token instead
                  </button>
                </p>
              ) : (
                <div className="field-row">
                  <button type="button" onClick={() => void connect()}>
                    {waiting ? 'Waiting for Gumroad…' : 'Connect Gumroad…'}
                  </button>
                  <span className="small grow">{waiting ? 'Allow Weave in your browser, then come back.' : connection?.error}</span>
                  <button type="button" className="link" onClick={() => setUseToken(true)}>
                    Use an access token
                  </button>
                </div>
              )}
              <p className="small">
                Weave makes a monthly membership at this price on Gumroad, with license keys, and publishes it. Supporters buy there and send you the key from their receipt; your Weave lets them in and renews each month while they pay. Keep Weave running so it can.
              </p>
            </>
          ) : onGumroad ? (
            <>
              <div className="field-row-stacked">
                <label htmlFor="gumroad-url">Product page</label>
                <input id="gumroad-url" required type="url" placeholder="https://you.gumroad.com/l/supporters" value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
              <div className="field-row-stacked">
                <label htmlFor="gumroad-product">Product ID (Gumroad: the product's settings, or its page's “License key” section)</label>
                <input id="gumroad-product" required spellCheck={false} placeholder="sDonL7aMmKz8…" value={product} onChange={(e) => setProduct(e.target.value.trim())} />
              </div>
              <div className="field-row-stacked">
                <label htmlFor="gumroad-variant">Gumroad tier that gives this one (if the membership has several)</label>
                <input id="gumroad-variant" placeholder="e.g. Editors" value={variant} onChange={(e) => setVariant(e.target.value)} />
              </div>
              <p className="small">
                In Gumroad, make it a membership and turn on <b>Generate a unique license key per sale</b>. Supporters buy there and send you the key from their receipt; your Weave checks it with Gumroad, lets them in and renews each month while they pay. Keep Weave running so it can.
              </p>
            </>
          ) : null}
          <div className="field-row">
            <input id="tier-onchain" type="checkbox" checked={onChain} onChange={(e) => setOnChain(e.target.checked)} /> <label htmlFor="tier-onchain"><b>USDC</b>: from a wallet, straight to you or a project's split (test network)</label>
          </div>
          {onChain ? (
            <>
              <div className="field-row">
                <label htmlFor="tier-usdc">USDC per month</label>
                <input id="tier-usdc" inputMode="decimal" size={6} value={usdc} onChange={(e) => setUsdc(e.target.value)} />
              </div>
              <div className="field-row-stacked">
                <label htmlFor="tier-payto">Paid to</label>
                <input id="tier-payto" spellCheck={false} placeholder={wallet ? `your wallet ${wallet.address}` : '0x… (link your wallet, or give an address)'} value={payTo} onChange={(e) => setPayTo(e.target.value.trim())} />
              </div>
              <p className="small">
                Empty: your linked wallet. Or a project's split contract (CLI: weave treasury split), so payments are divided as the project's split says. Supporters pay from their linked wallet and send the transaction; your Weave reads it on {TREASURY_CHAIN.name} and lets them in. Keep Weave running so it can.
              </p>
            </>
          ) : null}
        </fieldset>
        <p className="small">
          A tier is a group: members get its chat and every project you invite it into (in the project's Settings). Memberships give access, never votes.
        </p>
        <div className="buttons">
          {tier && (
            <AsyncButton
              onClick={async () => {
                if (!(await ask(`Take ${tier.name} off your hub? Members keep it until their grants run out.`, 'Take it off'))) return;
                if (await attempt(() => api('setTier', { tier: tier.id, hidden: true }).then(bump), 'Tier removed')) onClose();
              }}
            >
              Remove
            </AsyncButton>
          )}
          <span className="grow" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default" disabled={busy || !ready}>
            {busy && making ? 'Making it on Gumroad…' : tier ? 'Save' : 'Offer tier'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** "Support X" on someone's hub; on your own, your tiers to manage. */
export function SupportBox({ did, name, me }: { did: string; name: string; me: boolean }) {
  const { data: tiers } = useApi(() => api<TierInfo[]>('tiers', did), [did]);
  const [joining, setJoining] = useState<TierInfo>();
  const [editing, setEditing] = useState<TierInfo | 'new'>();
  if (!tiers || (!me && tiers.length === 0)) return null;
  return (
    <section className="space-box">
      <h3>{me ? 'My tiers' : `Support ${name}`}</h3>
      {tiers.map((t) => (
        <TierCard key={t.id} tier={t} onJoin={() => setJoining(t)} onEdit={() => setEditing(t)} />
      ))}
      {me && (
        <div className="buttons">
          {tiers.length === 0 && <span className="small grow">Offer memberships, Patreon-style: supporters get a lounge and the projects you open to them.</span>}
          <button onClick={() => setEditing('new')}>
            <Icon name="plus" /> New tier…
          </button>
        </div>
      )}
      {joining && <JoinDialog tier={joining} onClose={() => setJoining(undefined)} />}
      {editing && <TierDialog tier={editing === 'new' ? undefined : editing} onClose={() => setEditing(undefined)} />}
    </section>
  );
}

/** In the Inbox: someone asking to join one of your tiers. */
export function MembershipRequestCard({ request }: { request: MembershipRequestInfo }) {
  const [months, setMonths] = useState('1');
  const name = request.name ?? shortDid(request.did);
  return (
    <div className="admission window">
      <div className="window-body">
        <Avatar did={request.did} size={32} />
        <div className="grow">
          <b>{name}</b> wants to join <b>{request.tier.name}</b> <span className="small muted">· {ago(request.time)}</span>
          {request.note && <div className="note">“{request.note}”</div>}
          {request.license && (
            <div className="small">
              Gumroad license <code>{request.license.key.slice(0, 8)}…</code>:{' '}
              {request.license.ok === undefined ? 'checking with Gumroad…' : request.license.ok ? 'valid' : `not let in automatically: ${request.license.reason}`}
              {request.license.email && ` (bought as ${request.license.email})`}
            </div>
          )}
          {request.payment && (
            <div className="small">
              Paid on chain <code>{request.payment.tx.slice(0, 10)}…</code>:{' '}
              {request.payment.ok === undefined ? 'reading it on chain…' : request.payment.ok ? `valid, ${request.payment.months} month${request.payment.months === 1 ? '' : 's'}` : `not let in automatically: ${request.payment.reason}`}
            </div>
          )}
        </div>
        <AsyncButton onClick={() => attempt(() => api('declineMembership', { tier: request.tier.id, who: request.did }).then(bump))}>Decline</AsyncButton>
        <select aria-label="How long" value={months} onChange={(e) => setMonths(e.target.value)}>
          <option value="1">1 month</option>
          <option value="3">3 months</option>
          <option value="12">12 months</option>
        </select>
        <AsyncButton className="default" onClick={() => attempt(() => api('grantMembership', { tier: request.tier.id, who: request.did, months: Number(months) }).then(bump), `${name} is in ${request.tier.name}`)}>
          Let in
        </AsyncButton>
      </div>
    </div>
  );
}

/** Tiers you support, for the Memberships page. */
export function MySupport() {
  const { data } = useApi(() => api<TierInfo[]>('memberships'), []);
  if (!data?.length) return <p className="small">You don't support anyone yet. Creators offer tiers on their hub.</p>;
  return (
    <>
      {data.map((t) => (
        <TierCard key={t.id} tier={t} />
      ))}
    </>
  );
}
