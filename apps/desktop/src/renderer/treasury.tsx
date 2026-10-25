import { useState } from 'react';
import type { ShowInfo, SpaceInfo, TreasuryInfo, WalletInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { api, bump, shortDid, useApi, usePaymentsSwitch } from './lib.ts';
import { copy } from './posts.tsx';
import { SafeProposals } from './shows.tsx';
import { WalletLink } from './wallet.tsx';
import { attempt, AsyncButton, toast } from './ui.tsx';

/*
 * A project's treasury: a Safe its maintainers' own wallets own, and how its
 * income is split. Weave holds no keys or money; it shows the address the Safe
 * will have and records the split the maintainers agreed on. Test network only.
 */

type Shares = TreasuryInfo['presets'][string];
const PARTS: Array<{ key: keyof Shares; label: string; color: string }> = [
  { key: 'makers', label: 'Makers', color: '#008080' },
  { key: 'treasury', label: 'Project treasury', color: '#000080' },
  { key: 'community', label: 'Community', color: '#d4a000' },
  { key: 'foundation', label: 'Weave Foundation', color: '#c00000' },
];
const PRESET_LABELS: Record<string, string> = { standard: 'Standard', community: 'Community first', solo: 'Solo', free: 'All free' };
const pct = (bp: number) => `${(bp / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

function SplitBar({ shares }: { shares: Shares }) {
  return (
    <div>
      <div style={{ display: 'flex', height: 14, borderRadius: 4, overflow: 'hidden', border: '1px solid var(--border, #8884)' }}>
        {PARTS.filter((p) => shares[p.key] > 0).map((p) => (
          <div key={p.key} title={`${p.label} ${pct(shares[p.key])}`} style={{ width: `${shares[p.key] / 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="small">
        {PARTS.map((p) => (
          <span key={p.key} style={{ marginRight: 12 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, background: p.color, marginRight: 4 }} />
            {p.label} {pct(shares[p.key])}
          </span>
        ))}
      </div>
    </div>
  );
}


function SplitEditor({ project, treasury, communities }: { project: SpaceInfo; treasury: TreasuryInfo; communities: SpaceInfo[] }) {
  const start = treasury.pending ?? treasury.split;
  const [shares, setShares] = useState<Shares>(start?.shares ?? treasury.presets.standard);
  const [community, setCommunity] = useState(start?.community ?? '');
  const total = PARTS.reduce((sum, p) => sum + shares[p.key], 0);
  const preset = Object.entries(treasury.presets).find(([, s]) => PARTS.every((p) => s[p.key] === shares[p.key]))?.[0];
  return (
    <>
      <div className="field-row">
        {Object.entries(treasury.presets).map(([name, s]) => (
          <button key={name} className={preset === name ? 'default' : ''} onClick={() => setShares(s)}>
            {PRESET_LABELS[name] ?? name}
          </button>
        ))}
      </div>
      {PARTS.map((p) => (
        <div className="field-row" key={p.key}>
          <label className="grow" htmlFor={`share-${p.key}`}>
            {p.label}
            {p.key === 'foundation' && <span className="small"> · funds interesting projects; a suggestion, 0 is fine</span>}
          </label>
          <input id={`share-${p.key}`} type="number" min={0} max={100} step={0.5} style={{ width: 80 }} value={shares[p.key] / 100} onChange={(e) => setShares({ ...shares, [p.key]: Math.round(Number(e.target.value) * 100) || 0 })} />%
        </div>
      ))}
      {shares.community > 0 && (
        <div className="field-row">
          <select value={community} onChange={(e) => setCommunity(e.target.value)} aria-label="Community that gets the community part">
            <option value="">No community yet: its part goes to the treasury</option>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                r/{c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <SplitBar shares={shares} />
      <div className="field-row">
        <span className="grow small">{total === 10000 ? (treasury.split ? 'A change counts after 7 days, so nobody is surprised by it.' : 'The first split counts right away.') : `Adds up to ${pct(total)}: it has to be 100%.`}</span>
        <AsyncButton
          className="default"
          onClick={() =>
            attempt(
              () => api('setSplit', { project: project.id, ...(preset ? { preset } : { shares }), ...(community && shares.community ? { community } : {}) }).then(bump),
              treasury.split ? 'Split changed: it counts in 7 days' : 'Split set',
            )
          }
        >
          Save split
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
  const payments = usePayments(project);
  if (!payments.on)
    return (
      <fieldset>
        <legend>Payments</legend>
        <p className="small">
          Off. Turned on, the project gets a treasury (a Safe its maintainers' wallets own), a split of what it earns, and ticketed shows in Live. On a test network: no real money yet.
        </p>
        <div className="buttons">
          <button onClick={() => payments.turn(true)}>Turn on payments</button>
        </div>
      </fieldset>
    );
  return <TreasurySettings project={project} spaces={spaces} onTurnOff={payments.inUse ? undefined : () => payments.turn(false)} />;
}

/** Its treasury's address, owners and split. */
function TreasurySettings({ project, spaces, onTurnOff }: { project: SpaceInfo; spaces: SpaceInfo[]; onTurnOff?(): void }) {
  const { data: treasury } = useApi(() => api<TreasuryInfo>('treasury', project.id), [project.id]);
  const { data: wallet } = useApi(() => api<WalletInfo | undefined>('wallet'), []);
  if (!treasury) return null;
  return (
    <fieldset>
      <legend>Payments · treasury</legend>
      <p className="small">
        The project's own wallet: a Safe its maintainers' wallets own ({treasury.threshold} of {Math.max(treasury.owners.length, 1)} must sign). Weave holds no keys or money. On {treasury.chain.name}, a test network: no real money yet.
      </p>
      {treasury.address ? (
        <div className="field-row">
          <Icon name="lock" />
          <code className="grow">{treasury.address}</code>
          <button onClick={() => copy(treasury.address!, 'Address copied')}>Copy</button>
          <a href={`${treasury.chain.explorer}/address/${treasury.address}`} target="_blank" rel="noopener noreferrer">
            Explorer
          </a>
        </div>
      ) : (
        <p className="small">No address yet: it's made from the maintainers' wallets, and none is linked.</p>
      )}
      {treasury.owners.map((o) => (
        <div className="field-row small" key={o.person.did}>
          <span className="grow">{o.person.name ?? shortDid(o.person.did)}</span>
          <code>{o.address}</code>
        </div>
      ))}
      {treasury.missing.map((p) => (
        <div className="field-row small" key={p.did}>
          <span className="grow">{p.name ?? shortDid(p.did)}</span>
          <span className="muted">no wallet linked: not an owner yet</span>
        </div>
      ))}
      {treasury.address && <SafeProposals safe={treasury.address} />}
      {treasury.retired.map((r) => (
        <div key={r.address}>
          <div className="field-row small">
            <span className="grow">
              Retired: <code>{r.address}</code> (a wallet changed). People paying it are told to pay the new address.
            </span>
            {treasury.maintainer && (
              <AsyncButton
                onClick={async () => {
                  const swept = await attempt(() => api<Array<{ balance: string }>>('sweepRetired', treasury.project.id));
                  if (!swept) return;
                  bump();
                  toast(swept.some((x) => x.balance !== '0') ? 'Proposed: its old owners sign the move below' : 'Nothing left there');
                }}
              >
                Move what's left…
              </AsyncButton>
            )}
          </div>
          <SafeProposals safe={r.address} />
        </div>
      ))}
      {treasury.maintainer && !wallet && <WalletLink intro="Link your wallet to own this treasury with the other maintainers (also in Keys & devices). Weave never sees its key." />}
      <h4>Split</h4>
      {treasury.split ? <SplitBar shares={treasury.split.shares} /> : <p className="small">No split yet.</p>}
      {treasury.pending && (
        <>
          <p className="small">From {new Date(treasury.pending.from).toLocaleDateString()}:</p>
          <SplitBar shares={treasury.pending.shares} />
        </>
      )}
      {treasury.maintainer && <SplitEditor key={JSON.stringify(treasury.pending ?? treasury.split ?? null)} project={project} treasury={treasury} communities={spaces.filter((s) => s.kind === 'community')} />}
      {onTurnOff && (
        <div className="buttons">
          <button onClick={onTurnOff}>Turn off payments</button>
        </div>
      )}
    </fieldset>
  );
}
