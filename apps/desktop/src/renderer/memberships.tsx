import { useEffect, useState, type FormEvent } from 'react';
import type { GumroadInfo, MemberInfo, MembershipRequestInfo, TierInfo, WalletInfo } from '@weave/node/client';
import { formatUnits, isHexAddress, isTxHash, parseUnits, TEST_USDC, TREASURY_CHAIN } from '@weave/core/chain';
import { PayFromWallet } from './pay.tsx';
import { Icon } from './icons.tsx';
import { ago, api, bump, shortDid, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Avatar, Modal, toast } from './ui.tsx';
import { WalletNeeded } from './wallet.tsx';
import { t, T, useTexts } from './texts.tsx';

/*
 * Memberships, Patreon-style: creators offer tiers on their hub, supporters
 * ask to join (saying how they paid), creators grant months from their Inbox.
 * Tiers sold through Gumroad let supporters in by their license key instead,
 * tiers paid on chain (test USDC) by the transaction that paid them.
 * A tier is a group, so members get its chat and the projects it's invited into.
 */

export const money = (cents: number, currency: string) => (cents === 0 ? t('tier.free') : t('tier.per.month', { price: { amount: cents / 100, currency } }));

/** Your tier's members, as their faces (a few, then how many more). */
function TierFaces({ tier }: { tier: string }) {
  const { data: members } = useApi(() => api<MemberInfo[]>('members', tier).catch(() => [] as MemberInfo[]), [tier]);
  const shown = (members ?? []).slice(0, 8);
  if (!shown.length) return null;
  return (
    <span className="tier-faces">
      {shown.map((m) => (
        <span key={m.did} title={m.name ?? shortDid(m.did)}>
          <Avatar did={m.did} size={22} />
        </span>
      ))}
      {(members?.length ?? 0) > shown.length && <span className="small muted">+{members!.length - shown.length}</span>}
    </span>
  );
}

function TierCard({ tier, onJoin, onEdit }: { tier: TierInfo; onJoin?(): void; onEdit?(): void }) {
  const { t } = useTexts();
  let status;
  if (tier.mine)
    status = (
      <>
        <span className="small">
          {t('tier.members', { n: tier.members })}
          {tier.open ? '' : t('tier.closed')}
        </span>
        {!!tier.members && <TierFaces tier={tier.id} />}
        {onEdit && <button onClick={onEdit}>{t('tier.edit')}</button>}
      </>
    );
  else if (tier.membership?.active) status = <span className="tag friend">{t('tier.member.until', { until: tier.membership.until })}</span>;
  else if (tier.requested) status = <span className="tag">{t('tier.asked')}</span>;
  else if (tier.open) status = <button className="default" onClick={onJoin}>{t(tier.membership ? 'tier.renew' : 'tier.join')}</button>;
  else status = <span className="small">{t('tier.not.taking')}</span>;
  return (
    <article className="tier sunken">
      <Avatar did={tier.creator.did} size={40} />
      <div className="grow">
        <b>{tier.name}</b> <span className="price">{money(tier.price, tier.currency)}</span>
        {tier.gumroad && <span className="tag">{t('tier.via.gumroad')}</span>}
        {tier.onchain && (
          <span className="tag" title={t('tier.onchain.title', { to: tier.onchain.to, chain: TREASURY_CHAIN.name })}>
            {t('tier.onchain', { amount: `${formatUnits(tier.onchain.amount, tier.onchain.decimals)} ${tier.onchain.symbol}` })}
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
  const { t } = useTexts();
  const [license, setLicense] = useState('');
  const [note, setNote] = useState('');
  return (
    <form
      className="form"
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        const sent = await attempt(() => api('requestMembership', { tier: tier.id, creator: tier.creator.did, note, license }).then(bump), t('join.gumroad.sent', { creator }));
        if (sent !== undefined) onClose();
      }}
    >
      <ol className="steps">
        <li>
          <T
            name="join.gumroad.buy"
            values={{
              tier: <b>{tier.name}</b>,
              price: money(tier.price, tier.currency),
              link: (
                <a href={tier.gumroad!.url} target="_blank" rel="noopener noreferrer">
                  {tier.gumroad!.variant ? t('join.gumroad.open.variant', { variant: tier.gumroad!.variant }) : t('join.gumroad.open')}
                </a>
              ),
            }}
          />
        </li>
        <li>
          <label htmlFor="join-license">{t('join.gumroad.paste')}</label>
          <input id="join-license" className="wide" required autoFocus spellCheck={false} placeholder={t('join.license.placeholder')} value={license} onChange={(e) => setLicense(e.target.value.trim())} />
        </li>
      </ol>
      <input className="wide" placeholder={t('join.note')} value={note} onChange={(e) => setNote(e.target.value)} />
      <p className="small">{t('join.gumroad.only', { creator })}</p>
      <div className="buttons">
        <button type="button" onClick={onClose}>
          {t('button.cancel')}
        </button>
        <button className="default" disabled={!license}>
          {t('join.send.key')}
        </button>
      </div>
    </form>
  );
}

/** Joining a tier paid on chain: send the token from your linked wallet, then paste the transaction's hash. */
function OnchainJoin({ tier, creator, onClose }: { tier: TierInfo; creator: string; onClose(): void }) {
  const { t } = useTexts();
  // null: no wallet linked; undefined: still asking.
  const { data: wallet } = useApi(() => api<WalletInfo | undefined>('wallet').then((w) => w ?? null), []);
  if (wallet === undefined) return null;
  if (!wallet) return <WalletNeeded why={t('join.onchain.wallet', { symbol: tier.onchain!.symbol, creator })} />;
  return <PayFromWallet tier={tier.id} creator={tier.creator.did} payee={creator} onDone={onClose} />;
}

function JoinDialog({ tier, onClose }: { tier: TierInfo; onClose(): void }) {
  const { t } = useTexts();
  const [note, setNote] = useState('');
  const [way, setWay] = useState<'gumroad' | 'onchain'>(tier.gumroad ? 'gumroad' : 'onchain');
  const creator = tier.creator.name ?? shortDid(tier.creator.did);
  if (tier.onchain || tier.gumroad)
    return (
      <Modal title={t('join.title', { tier: tier.name })} onClose={onClose}>
        {tier.onchain && tier.gumroad && (
          <div className="field-row" role="radiogroup" aria-label={t('join.how')}>
            <span className="small">{t('join.pay.with')}</span>
            <input id="way-gumroad" type="radio" checked={way === 'gumroad'} onChange={() => setWay('gumroad')} />
            <label htmlFor="way-gumroad">{t('join.gumroad.option', { price: money(tier.price, tier.currency) })}</label>
            <input id="way-onchain" type="radio" checked={way === 'onchain'} onChange={() => setWay('onchain')} />
            <label htmlFor="way-onchain">{t('join.usdc.option', { amount: `${formatUnits(tier.onchain.amount, tier.onchain.decimals)} ${tier.onchain.symbol}` })}</label>
          </div>
        )}
        {tier.onchain && (way === 'onchain' || !tier.gumroad) ? <OnchainJoin tier={tier} creator={creator} onClose={onClose} /> : <GumroadJoin tier={tier} creator={creator} onClose={onClose} />}
      </Modal>
    );
  return (
    <Modal title={t('join.title', { tier: tier.name })} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          if (await attempt(() => api('requestMembership', { tier: tier.id, creator: tier.creator.did, note }).then(bump), t('join.asked', { creator }))) onClose();
        }}
      >
        <p className="small">
          {tier.price > 0 ? <T name="join.costs" values={{ tier: tier.name, price: <b>{money(tier.price, tier.currency)}</b>, creator }} /> : t('join.free', { tier: tier.name, creator })} {t('join.only.note', { creator })}
        </p>
        <textarea className="wide" rows={3} autoFocus placeholder={t(tier.price > 0 ? 'join.placeholder.paid' : 'join.placeholder.free')} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="buttons">
          <button type="button" onClick={onClose}>
            {t('button.cancel')}
          </button>
          <button className="default">{t('join.ask')}</button>
        </div>
      </form>
    </Modal>
  );
}

function TierDialog({ tier, onClose }: { tier?: TierInfo; onClose(): void }) {
  const { t } = useTexts();
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
    if (making && !(cents > 0)) return toast(t('tier.gumroad.needs.price'), 'error');
    if (onChain && (!usdcAmount || !isHexAddress(to))) return toast(t(usdcAmount ? 'tier.onchain.where' : 'tier.onchain.price'), 'error');
    setBusy(true);
    const saved = await attempt(() => (tier ? api<TierInfo>('setTier', { tier: tier.id, ...input() }) : api<TierInfo>('createTier', input())), making ? undefined : tier ? t('tier.saved') : t('tier.on.hub', { name }));
    if (saved && making) {
      const sold = await attempt(() => api<{ published: boolean; warning?: string }>('sellTierOnGumroad', { tier: saved.id, ...(viaToken ? { token } : {}) }));
      if (!sold) toast(t('tier.gumroad.not.yet', { name }), 'error');
      else toast(sold.published ? t('tier.gumroad.on.sale', { name }) : t('tier.gumroad.unpublished', { name, warning: sold.warning }), sold.published ? 'ok' : 'error');
    }
    setBusy(false);
    if (saved) {
      bump();
      onClose();
    }
  };
  return (
    <Modal title={tier ? t('tier.edit.title', { name: tier.name }) : t('tier.new.title')} onClose={onClose}>
      <form className="form" onSubmit={save}>
        <div className="field-row-stacked">
          <label htmlFor="tier-name">{t('field.name')}</label>
          <input id="tier-name" required maxLength={40} placeholder={t('tier.name.placeholder')} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field-row">
          <label htmlFor="tier-price">{t('tier.price')}</label>
          <input id="tier-price" inputMode="decimal" size={6} value={price} onChange={(e) => setPrice(e.target.value)} />
          <select aria-label={t('tier.currency')} value={currency} onChange={(e) => setCurrency(e.target.value)}>
            {['EUR', 'USD', 'GBP', 'CHF'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <span className="small">{t('tier.zero.free')}</span>
        </div>
        <div className="field-row-stacked">
          <label htmlFor="tier-text">{t('tier.what')}</label>
          <textarea id="tier-text" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="field-row-stacked">
          <label htmlFor="tier-benefits">{t('tier.benefits')}</label>
          <textarea id="tier-benefits" rows={3} placeholder={t('tier.benefits.placeholder')} value={benefits} onChange={(e) => setBenefits(e.target.value)} />
        </div>
        <div className="field-row">
          <input id="tier-open" type="checkbox" checked={open} onChange={(e) => setOpen(e.target.checked)} />
          <label htmlFor="tier-open">{t('tier.taking')}</label>
        </div>
        <div className="field-row">
          <input id="tier-auto" type="checkbox" checked={auto && !onGumroad} disabled={onGumroad} onChange={(e) => setAuto(e.target.checked)} />
          <label htmlFor="tier-auto">{t('tier.auto')}</label>
        </div>
        <fieldset>
          <legend>{t('tier.ways')}</legend>
          <p className="small">{t('tier.ways.about')}</p>
          <div className="field-row">
            <input id="tier-gumroad" type="checkbox" checked={onGumroad} onChange={(e) => setOnGumroad(e.target.checked)} />{' '}
            <label htmlFor="tier-gumroad">
              <T name="tier.gumroad.option" />
            </label>
          </div>
          {onGumroad && (
            <>
              <div className="field-row">
                <input id="gumroad-make" type="radio" checked={makeIt} onChange={() => setMakeIt(true)} />
                <label htmlFor="gumroad-make">{t(tier?.gumroad ? 'gumroad.make.new' : 'gumroad.make')}</label>
              </div>
              <div className="field-row">
                <input id="gumroad-link" type="radio" checked={!makeIt} onChange={() => setMakeIt(false)} />
                <label htmlFor="gumroad-link">{t(tier?.gumroad ? 'gumroad.keep.linked' : 'gumroad.link.mine')}</label>
              </div>
            </>
          )}
          {making ? (
            <>
              {viaToken ? (
                <>
                  <div className="field-row-stacked">
                    <label htmlFor="gumroad-token">{t('gumroad.token')}</label>
                    <input id="gumroad-token" required type="password" autoComplete="off" spellCheck={false} value={token} onChange={(e) => setToken(e.target.value.trim())} />
                  </div>
                  <p className="small">
                    <T name="gumroad.token.howto" />
                    {connection?.available && (
                      <>
                        {' '}
                        <button type="button" className="link" onClick={() => setUseToken(false)}>
                          {t('gumroad.connect.instead')}
                        </button>
                      </>
                    )}
                  </p>
                </>
              ) : connection?.account ? (
                <p className="small">
                  <T name="gumroad.connected" values={{ account: <b>{connection.account}</b> }} />{' '}
                  <button type="button" className="link" onClick={() => setUseToken(true)}>
                    {t('gumroad.token.instead')}
                  </button>
                </p>
              ) : (
                <div className="field-row">
                  <button type="button" onClick={() => void connect()}>
                    {t(waiting ? 'gumroad.waiting' : 'gumroad.connect')}
                  </button>
                  <span className="small grow">{waiting ? t('gumroad.allow') : connection?.error}</span>
                  <button type="button" className="link" onClick={() => setUseToken(true)}>
                    {t('gumroad.use.token')}
                  </button>
                </div>
              )}
              <p className="small">{t('gumroad.makes')}</p>
            </>
          ) : onGumroad ? (
            <>
              <div className="field-row-stacked">
                <label htmlFor="gumroad-url">{t('gumroad.product.page')}</label>
                <input id="gumroad-url" required type="url" placeholder="https://you.gumroad.com/l/supporters" value={url} onChange={(e) => setUrl(e.target.value)} />
              </div>
              <div className="field-row-stacked">
                <label htmlFor="gumroad-product">{t('gumroad.product.id')}</label>
                <input id="gumroad-product" required spellCheck={false} placeholder={t('gumroad.product.placeholder')} value={product} onChange={(e) => setProduct(e.target.value.trim())} />
              </div>
              <div className="field-row-stacked">
                <label htmlFor="gumroad-variant">{t('gumroad.variant')}</label>
                <input id="gumroad-variant" placeholder={t('gumroad.variant.placeholder')} value={variant} onChange={(e) => setVariant(e.target.value)} />
              </div>
              <p className="small">
                <T name="gumroad.linked.howto" />
              </p>
            </>
          ) : null}
          <div className="field-row">
            <input id="tier-onchain" type="checkbox" checked={onChain} onChange={(e) => setOnChain(e.target.checked)} />{' '}
            <label htmlFor="tier-onchain">
              <T name="tier.usdc.option" />
            </label>
          </div>
          {onChain ? (
            <>
              <div className="field-row">
                <label htmlFor="tier-usdc">{t('tier.usdc.per.month')}</label>
                <input id="tier-usdc" inputMode="decimal" size={6} value={usdc} onChange={(e) => setUsdc(e.target.value)} />
              </div>
              <div className="field-row-stacked">
                <label htmlFor="tier-payto">{t('tier.paid.to')}</label>
                <input id="tier-payto" spellCheck={false} placeholder={wallet ? t('tier.your.wallet', { address: wallet.address }) : t('tier.payto.placeholder')} value={payTo} onChange={(e) => setPayTo(e.target.value.trim())} />
              </div>
              <p className="small">
                <T name="tier.onchain.about" values={{ chain: TREASURY_CHAIN.name }} />
              </p>
            </>
          ) : null}
        </fieldset>
        <p className="small">{t('tier.is.group')}</p>
        <div className="buttons">
          {tier && (
            <AsyncButton
              onClick={async () => {
                if (!(await ask(t('tier.remove.ask', { name: tier.name }), t('tier.take.off')))) return;
                if (await attempt(() => api('setTier', { tier: tier.id, hidden: true }).then(bump), t('tier.removed'))) onClose();
              }}
            >
              {t('button.remove')}
            </AsyncButton>
          )}
          <span className="grow" />
          <button type="button" onClick={onClose}>
            {t('button.cancel')}
          </button>
          <button className="default" disabled={busy || !ready}>
            {t(busy && making ? 'tier.making' : tier ? 'button.save' : 'tier.offer')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** "Support X" on someone's hub; on your own, your tiers to manage. */
export function SupportBox({ did, name, me }: { did: string; name: string; me: boolean }) {
  const { t } = useTexts();
  const { data: tiers } = useApi(() => api<TierInfo[]>('tiers', did), [did]);
  const [joining, setJoining] = useState<TierInfo>();
  const [editing, setEditing] = useState<TierInfo | 'new'>();
  if (!tiers || (!me && tiers.length === 0)) return null;
  return (
    <section className="space-box">
      <h3>{me ? t('tiers.mine') : t('tiers.support', { name })}</h3>
      {tiers.map((tier) => (
        <TierCard key={tier.id} tier={tier} onJoin={() => setJoining(tier)} onEdit={() => setEditing(tier)} />
      ))}
      {me && (
        <div className="buttons">
          {tiers.length === 0 && <span className="small grow">{t('tiers.offer.about')}</span>}
          <button onClick={() => setEditing('new')}>
            <Icon name="plus" /> {t('tiers.new')}
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
  const { t } = useTexts();
  const [months, setMonths] = useState('1');
  const name = request.name ?? shortDid(request.did);
  return (
    <div className="admission window">
      <div className="window-body">
        <Avatar did={request.did} size={32} />
        <div className="grow">
          <T name="request.wants.join" values={{ name: <b>{name}</b>, tier: <b>{request.tier.name}</b> }} /> <span className="small muted">· {ago(request.time)}</span>
          {request.note && <div className="note">“{request.note}”</div>}
          {request.license && (
            <div className="small">
              {t('request.gumroad.license')} <code>{request.license.key.slice(0, 8)}…</code>:{' '}
              {request.license.ok === undefined ? t('request.checking.gumroad') : request.license.ok ? t('request.valid') : t('request.not.auto', { reason: request.license.reason })}
              {request.license.email && t('request.bought.as', { email: request.license.email })}
            </div>
          )}
          {request.payment && (
            <div className="small">
              {t('request.paid.onchain')} <code>{request.payment.tx.slice(0, 10)}…</code>:{' '}
              {request.payment.ok === undefined ? t('request.reading.chain') : request.payment.ok ? t('request.valid.months', { n: request.payment.months }) : t('request.not.auto', { reason: request.payment.reason })}
            </div>
          )}
        </div>
        <AsyncButton onClick={() => attempt(() => api('declineMembership', { tier: request.tier.id, who: request.did }).then(bump))}>{t('request.decline')}</AsyncButton>
        <select aria-label={t('request.how.long')} value={months} onChange={(e) => setMonths(e.target.value)}>
          {['1', '3', '12'].map((m) => (
            <option key={m} value={m}>
              {t('request.months', { n: Number(m) })}
            </option>
          ))}
        </select>
        <AsyncButton className="default" onClick={() => attempt(() => api('grantMembership', { tier: request.tier.id, who: request.did, months: Number(months) }).then(bump), t('request.let.in.done', { name, tier: request.tier.name }))}>
          {t('request.let.in')}
        </AsyncButton>
      </div>
    </div>
  );
}

/** Tiers you support, for the Memberships page. */
export function MySupport() {
  const { t } = useTexts();
  const { data } = useApi(() => api<TierInfo[]>('memberships'), []);
  if (!data?.length) return <p className="small">{t('tiers.support.none')}</p>;
  return (
    <>
      {data.map((tier) => (
        <TierCard key={tier.id} tier={tier} />
      ))}
    </>
  );
}
