import { useState, type FormEvent } from 'react';
import type { MembershipRequestInfo, TierInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bump, shortDid, useApi } from './lib.ts';
import { attempt, AsyncButton, Avatar, Modal, Sprite } from './ui.tsx';

/*
 * Memberships, Patreon-style: creators offer tiers on their hub, supporters
 * ask to join (saying how they paid), creators grant months from their Inbox.
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

function JoinDialog({ tier, onClose }: { tier: TierInfo; onClose(): void }) {
  const [note, setNote] = useState('');
  const creator = tier.creator.name ?? shortDid(tier.creator.did);
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
  const input = () => ({ name, price: Math.round(Number(price.replace(',', '.')) * 100), currency, description, benefits: benefits.split('\n'), open });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const done = await attempt(() => (tier ? api('setTier', { tier: tier.id, ...input() }) : api('createTier', input())), tier ? 'Tier saved' : `${name} is on your hub`);
    if (done) {
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
        <p className="small">
          A tier is a group: members get its chat and every project you invite it into (in the project's Settings). Memberships give access, never votes.
        </p>
        <div className="buttons">
          {tier && (
            <AsyncButton
              onClick={async () => {
                if (!confirm(`Take ${tier.name} off your hub? Members keep it until their grants run out.`)) return;
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
          <button className="default">{tier ? 'Save' : 'Offer tier'}</button>
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
