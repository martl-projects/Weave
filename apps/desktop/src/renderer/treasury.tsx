import { useState } from 'react';
import type { ShowInfo, SpaceInfo, TreasuryInfo, WalletInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { api, bump, shortDid, useApi, usePaymentsSwitch } from './lib.ts';
import { copy } from './posts.tsx';
import { SafeProposals } from './shows.tsx';
import { WalletNeeded } from './wallet.tsx';
import { attempt, AsyncButton, toast } from './ui.tsx';
import { currentTexts, t, useTexts } from './texts.tsx';

/*
 * A project's treasury: a Safe its maintainers' own wallets own, and how its
 * income is split. Weave holds no keys or money; it shows the address the Safe
 * will have and records the split the maintainers agreed on. Test network only.
 */

type Shares = TreasuryInfo['presets'][string];
/** The parts of a split, in order; their texts are split.part.<key>. */
const PARTS: Array<{ key: keyof Shares; color: string }> = [
  { key: 'makers', color: '#008080' },
  { key: 'treasury', color: '#000080' },
  { key: 'community', color: '#d4a000' },
  { key: 'foundation', color: '#c00000' },
];
const PRESETS = ['standard', 'community', 'solo', 'free'];
const presetLabel = (name: string) => (PRESETS.includes(name) ? t(`split.preset.${name}`) : name);
const pct = (bp: number) => `${(bp / 100).toLocaleString(currentTexts().locale, { maximumFractionDigits: 2 })}%`;

function SplitBar({ shares, community }: { shares: Shares; community?: string }) {
  const { t } = useTexts();
  const label = (p: (typeof PARTS)[number]) => (p.key === 'community' && community ? community : t(`split.part.${p.key}`));
  return (
    <div>
      <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border, #8884)' }}>
        {PARTS.filter((p) => shares[p.key] > 0).map((p) => (
          <div key={p.key} title={`${label(p)} ${pct(shares[p.key])}`} style={{ width: `${shares[p.key] / 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="small">
        {PARTS.filter((p) => shares[p.key] > 0).map((p) => (
          <span key={p.key} style={{ marginRight: 12 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, background: p.color, marginRight: 4 }} />
            {label(p)} {pct(shares[p.key])}
          </span>
        ))}
      </div>
    </div>
  );
}

function SplitEditor({ project, treasury, communities, onDone }: { project: SpaceInfo; treasury: TreasuryInfo; communities: SpaceInfo[]; onDone(): void }) {
  const { t } = useTexts();
  const start = treasury.pending ?? treasury.split;
  const [shares, setShares] = useState<Shares>(start?.shares ?? treasury.presets.standard);
  const [community, setCommunity] = useState(start?.community ?? '');
  // The community part goes to a community you name; with none named, it stays with the project's treasury.
  const named = communities.find((c) => c.id === community);
  const saved = named ? shares : { ...shares, treasury: shares.treasury + shares.community, community: 0 };
  const total = PARTS.reduce((sum, p) => sum + saved[p.key], 0);
  const preset = Object.entries(treasury.presets).find(([, s]) => PARTS.every((p) => s[p.key] === saved[p.key]))?.[0];
  const highlighted = Object.entries(treasury.presets).find(([, s]) => PARTS.every((p) => s[p.key] === shares[p.key]))?.[0];
  return (
    <>
      <div className="field-row">
        {Object.entries(treasury.presets).map(([name, s]) => (
          <button key={name} className={highlighted === name ? 'default' : ''} onClick={() => setShares(s)}>
            {presetLabel(name)}
          </button>
        ))}
      </div>
      {PARTS.map((p) => (
        <div className="field-row" key={p.key}>
          {p.key === 'community' ? (
            <span className="grow">
              {communities.length ? (
                <select value={community} onChange={(e) => setCommunity(e.target.value)} aria-label={t('split.community.gets')}>
                  <option value="">{t('split.community.name')}</option>
                  {communities.map((c) => (
                    <option key={c.id} value={c.id}>
                      r/{c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <label htmlFor="share-community">{t('split.a.community')}</label>
              )}
              <span className="small muted"> · {named ? t('split.to.community', { name: named.name }) : communities.length ? t('split.name.one') : t('split.in.none')}</span>
            </span>
          ) : (
            <label className="grow" htmlFor={`share-${p.key}`}>
              {t(`split.part.${p.key}`)}
              {p.key === 'foundation' && <span className="small"> {t('split.foundation.note')}</span>}
            </label>
          )}
          <input
            id={`share-${p.key}`}
            type="number"
            min={0}
            max={100}
            step={0.5}
            style={{ width: 80 }}
            disabled={p.key === 'community' && !named}
            value={saved[p.key] / 100}
            onChange={(e) => setShares({ ...saved, [p.key]: Math.round(Number(e.target.value) * 100) || 0 })}
          />
          %
        </div>
      ))}
      <SplitBar shares={saved} community={named && `r/${named.name}`} />
      <div className="field-row">
        <span className="grow small">{total === 10000 ? t(treasury.split ? 'split.change.counts' : 'split.first.counts') : t('split.adds.up', { total: pct(total) })}</span>
        <button onClick={onDone}>{t('button.cancel')}</button>
        <AsyncButton
          className="default"
          onClick={async () => {
            const done = await attempt(
              () => api('setSplit', { project: project.id, ...(preset ? { preset } : { shares: saved }), ...(named && saved.community ? { community: named.id } : {}) }).then(bump),
              t(treasury.split ? 'split.changed' : 'split.set'),
            );
            if (done !== undefined) onDone();
          }}
        >
          {t('split.save')}
        </AsyncButton>
      </div>
    </>
  );
}

/**
 * Whether a project's payments show (its treasury and split in Settings, new
 * shows in Live): once you turned them on here, or while the project uses them.
 */
export function usePayments(project: SpaceInfo) {
  const [turnedOn, turn] = usePaymentsSwitch(project.id);
  const { data: treasury } = useApi(() => api<TreasuryInfo>('treasury', project.id).catch(() => undefined), [project.id]);
  const { data: shows } = useApi(() => api<ShowInfo[]>('shows', project.id).catch(() => []), [project.id]);
  const inUse = !!(treasury?.split || treasury?.pending || shows?.length);
  return { on: turnedOn || inUse, inUse, turn };
}

/** In a project's settings: payments, off until someone turns them on; then its treasury. */
export function PaymentsSettings({ project, spaces }: { project: SpaceInfo; spaces: SpaceInfo[] }) {
  const { t } = useTexts();
  const payments = usePayments(project);
  if (!payments.on)
    return (
      <fieldset>
        <legend>{t('payments.legend')}</legend>
        <p className="small">{t('payments.off')}</p>
        <div className="buttons">
          <button onClick={() => payments.turn(true)}>{t('payments.turn.on')}</button>
        </div>
      </fieldset>
    );
  return <TreasurySettings project={project} spaces={spaces} onTurnOff={payments.inUse ? undefined : () => payments.turn(false)} />;
}

/** Its treasury's address, owners and split. */
function TreasurySettings({ project, spaces, onTurnOff }: { project: SpaceInfo; spaces: SpaceInfo[]; onTurnOff?(): void }) {
  const { t, locale } = useTexts();
  const { data: treasury } = useApi(() => api<TreasuryInfo>('treasury', project.id), [project.id]);
  const { data: wallet } = useApi(() => api<WalletInfo | undefined>('wallet'), []);
  const [editing, setEditing] = useState(false);
  if (!treasury) return null;
  const name = (p: { did: string; name?: string }) => p.name ?? shortDid(p.did);
  const communityName = (id?: string) => (id ? `r/${spaces.find((x) => x.id === id)?.name ?? t('split.a.community.lc')}` : undefined);
  return (
    <fieldset>
      <legend>{t('payments.legend')}</legend>
      <div className="field-row">
        <b className="grow">{t('treasury.legend')}</b>
        <span className="small muted">{t('treasury.test.network', { chain: treasury.chain.name })}</span>
      </div>
      {treasury.address ? (
        <div className="field-row">
          <Icon name="lock" />
          <code className="grow">{treasury.address}</code>
          <button onClick={() => copy(treasury.address!, t('address.copied'))}>{t('button.copy')}</button>
          <a href={`${treasury.chain.explorer}/address/${treasury.address}`} target="_blank" rel="noopener noreferrer">
            {t('treasury.explorer')}
          </a>
        </div>
      ) : (
        <p className="small">{t('treasury.no.address')}</p>
      )}
      <p className="small">
        {t('treasury.owned.by', { owners: treasury.owners.length ? treasury.owners.map((o) => name(o.person)).join(', ') : t('treasury.nobody.yet') })}
        {treasury.owners.length > 1 && t('treasury.threshold', { threshold: treasury.threshold, n: treasury.owners.length })}
        {treasury.missing.length > 0 && <span className="muted"> {t('treasury.no.wallet', { names: treasury.missing.map(name).join(', ') })}</span>}
        {t('treasury.no.keys')}
      </p>
      {treasury.maintainer && !wallet && <WalletNeeded why={t('treasury.wallet.why')} />}
      {treasury.address && <SafeProposals safe={treasury.address} />}
      {treasury.retired.map((r) => (
        <div key={r.address}>
          <div className="field-row small">
            <span className="grow">
              {t('treasury.retired')} <code>{r.address}</code> {t('treasury.retired.note')}
            </span>
            {treasury.maintainer && (
              <AsyncButton
                onClick={async () => {
                  const swept = await attempt(() => api<Array<{ balance: string }>>('sweepRetired', treasury.project.id));
                  if (!swept) return;
                  bump();
                  toast(t(swept.some((x) => x.balance !== '0') ? 'treasury.sweep.proposed' : 'treasury.sweep.nothing'));
                }}
              >
                {t('treasury.move.left')}
              </AsyncButton>
            )}
          </div>
          <SafeProposals safe={r.address} />
        </div>
      ))}
      <div className="field-row" style={{ marginTop: 10 }}>
        <b className="grow">{t('split.legend')}</b>
        {treasury.maintainer && !editing && <button onClick={() => setEditing(true)}>{t(treasury.split ? 'split.change' : 'split.set.one')}</button>}
      </div>
      {treasury.split ? <SplitBar shares={treasury.split.shares} community={communityName(treasury.split.community)} /> : !editing && <p className="small">{t('split.none')}</p>}
      {treasury.pending && (
        <>
          <p className="small">{t('split.from', { date: new Date(treasury.pending.from).toLocaleDateString(locale) })}</p>
          <SplitBar shares={treasury.pending.shares} community={communityName(treasury.pending.community)} />
        </>
      )}
      {editing && <SplitEditor key={JSON.stringify(treasury.pending ?? treasury.split ?? null)} project={project} treasury={treasury} communities={spaces.filter((s) => s.kind === 'community')} onDone={() => setEditing(false)} />}
      {onTurnOff && (
        <div className="buttons">
          <button className="link" onClick={onTurnOff}>
            {t('payments.turn.off')}
          </button>
        </div>
      )}
    </fieldset>
  );
}
