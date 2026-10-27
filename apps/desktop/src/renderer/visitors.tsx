import { useState } from 'react';
import type { SpaceInfo } from '@weave/node/client';
import type { VisitorRule } from '@weave/core';
import { api, bump } from './lib.ts';
import { attempt, AsyncButton } from './ui.tsx';

/*
 * What people's agents and services may do in a space: whose count (everyone's, approved ones, none) and which
 * kinds they may write. Those who manage the space set it; it decides what counts for everyone reading, over the
 * whole history (nothing is deleted: a looser rule shows it again). Their own agents and services aren't held to it.
 */

const WHO: Array<[VisitorRule['who'], string]> = [
  ['everyone', "Everyone's"],
  ['approved', 'Approved ones only'],
  ['nobody', 'None'],
];

export function VisitorsSettings({ space, canSet }: { space: SpaceInfo; canSet: boolean }) {
  const v = space.visitors;
  const [approving, setApproving] = useState('');
  if (!v) return null;
  const set = (change: { agents?: VisitorRule; services?: VisitorRule }) => attempt(() => api('setVisitors', { space: space.id, ...change }).then(bump), 'Saved');
  const approve = (agent: string, on: boolean) => attempt(() => api('approveAgent', { space: space.id, agent, on }).then(bump), on ? `${agent} is approved here` : `${agent} is no longer approved here`);
  return (
    <fieldset>
      <legend>Agents and services</legend>
      <p className="small">What people's agents and services may do here. What they write against it counts for nobody (and shows again if you loosen it).{space.managed ? ' In a company space, only approved ones count.' : ' Your own, and those of whoever manages this space with you, act as you let them.'}</p>
      <RuleRow label="Agents" rule={v.agents} canSet={canSet && !space.managed} onSave={(agents) => set({ agents })} />
      <RuleRow label="Services" rule={v.services} canSet={canSet && !space.managed} onSave={(services) => set({ services })} />
      {(v.agents.who === 'approved' || v.services.who === 'approved' || v.approved.length > 0) && (
        <>
          <p className="small">
            <b>Approved:</b> {v.approved.length ? '' : 'none yet'}
          </p>
          {v.approved.map((name) => (
            <div className="field-row" key={name}>
              <span className="grow small">{name}</span>
              {canSet && <AsyncButton onClick={() => approve(name, false)}>Remove</AsyncButton>}
            </div>
          ))}
          {canSet && (
            <div className="field-row">
              <input className="grow" placeholder="person/agent or person/service, like Lena/claude" value={approving} onChange={(e) => setApproving(e.target.value)} aria-label="Agent or service to approve" />
              <AsyncButton disabled={!approving.includes('/')} onClick={() => approve(approving.trim(), true).then(() => setApproving(''))}>
                Approve
              </AsyncButton>
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}

/** One rule: whose count, and the kinds they may write (all their person allows, when empty). */
function RuleRow({ label, rule, canSet, onSave }: { label: string; rule: VisitorRule; canSet: boolean; onSave(rule: VisitorRule): Promise<unknown> }) {
  const [kinds, setKinds] = useState((rule.kinds ?? []).join(', '));
  const listed = kinds.split(',').map((k) => k.trim()).filter(Boolean);
  const changed = listed.join(',') !== (rule.kinds ?? []).join(',');
  const save = (who: VisitorRule['who']) => onSave({ who, ...(listed.length ? { kinds: listed } : {}) });
  return (
    <div className="field-row">
      <label className="small" htmlFor={`who-${label}`} style={{ minWidth: '5em' }}>
        {label}
      </label>
      <select id={`who-${label}`} disabled={!canSet} value={rule.who} onChange={(e) => void save(e.target.value as VisitorRule['who'])}>
        {WHO.map(([value, text]) => (
          <option key={value} value={value}>
            {text}
          </option>
        ))}
      </select>
      {rule.who !== 'nobody' && (
        <>
          <input className="grow" disabled={!canSet} placeholder="may write: all their person allows" value={kinds} onChange={(e) => setKinds(e.target.value)} aria-label={`Kinds ${label.toLowerCase()} may write`} title="Kinds they may write, comma separated, like weave.msg, weave.reply (empty: all their person allows)" />
          {canSet && changed && <AsyncButton onClick={() => save(rule.who)}>Save</AsyncButton>}
        </>
      )}
    </div>
  );
}
