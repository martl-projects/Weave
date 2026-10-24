import { useState, type FormEvent } from 'react';
import type { MembershipRequestInfo, TierInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bump, shortDid, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Avatar, Modal, Sprite, toast } from './ui.tsx';

/*
 * Memberships, Patreon-style: creators offer tiers on their hub, supporters
 * ask to join (saying how they paid), creators grant months from their Inbox.
 * Tiers sold through Gumroad let supporters in by their license key instead.
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

function JoinDialog({ tier, onClose }: { tier: TierInfo; onClose(): void }) {
  const [note, setNote] = useState('');
  const creator = tier.creator.name ?? shortDid(tier.creator.did);
  if (tier.gumroad)
    return (
      <Modal title={`Join ${tier.name}`} onClose={onClose}>
        <GumroadJoin tier={tier} creator={creator} onClose={onClose} />
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
  // Make the product on Gumroad (with the creator's access token, used once) instead of linking one made by hand.
  const [makeIt, setMakeIt] = useState(!tier?.gumroad);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const making = onGumroad && makeIt;
  // A new Gumroad link, null to stop selling there, or nothing to leave it as it is (or until the made product links it).
  const gumroad = making ? undefined : onGumroad ? { product, url, ...(variant.trim() ? { variant } : {}) } : tier?.gumroad ? null : undefined;
  const cents = Math.round(Number(price.replace(',', '.')) * 100);
  const input = () => ({ name, price: cents, currency, description, benefits: benefits.split('\n'), open, auto: onGumroad ? false : auto, gumroad });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (making && !(cents > 0)) return toast('A tier sold on Gumroad needs a price', 'error');
    setBusy(true);
    const saved = await attempt(() => (tier ? api<TierInfo>('setTier', { tier: tier.id, ...input() }) : api<TierInfo>('createTier', input())), making ? undefined : tier ? 'Tier saved' : `${name} is on your hub`);
    if (saved && making) {
      const sold = await attempt(() => api<{ published: boolean; warning?: string }>('sellTierOnGumroad', { tier: saved.id, token }));
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
          <legend>
            <input id="tier-gumroad" type="checkbox" checked={onGumroad} onChange={(e) => setOnGumroad(e.target.checked)} /> <label htmlFor="tier-gumroad">Sell it through Gumroad</label>
          </legend>
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
              <div className="field-row-stacked">
                <label htmlFor="gumroad-token">Gumroad access token</label>
                <input id="gumroad-token" required type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value.trim())} />
              </div>
              <p className="small">
                In Gumroad: <b>Settings → Advanced → Applications</b>, create an application (any name and redirect URI), then <b>Generate access token</b>. Weave uses it once to make a monthly membership at this price, with license keys, and publish it; it doesn't keep it. Supporters buy there and send you the key from their receipt; your Weave lets them in and renews each month while they pay. Keep Weave running so it can.
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
          ) : (
            <p className="small">Supporters pay you through Gumroad, and Weave lets them in automatically. Gumroad is the seller: it handles payments, taxes and refunds.</p>
          )}
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
          <button className="default" disabled={busy}>
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
