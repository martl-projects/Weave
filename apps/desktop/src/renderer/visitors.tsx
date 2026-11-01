import { useState } from 'react';
import type { SpaceInfo } from '@weave/node/client';
import type { VisitorRule } from '@weave/core';
import { api, bump } from './lib.ts';
import { attempt, AsyncButton } from './ui.tsx';
import { useTexts } from './texts.tsx';

/*
 * What people's agents and services may do in a space: whose count (everyone's, approved ones, none) and which
 * kinds they may write. Those who manage the space set it; it decides what counts for everyone reading, over the
 * whole history (nothing is deleted: a looser rule shows it again). Their own agents and services aren't held to it.
 */

/** Whose count, in the picker's order; their texts are visitors.who.<value>. */
const WHO: VisitorRule['who'][] = ['everyone', 'approved', 'nobody'];

export function VisitorsSettings({ space, canSet }: { space: SpaceInfo; canSet: boolean }) {
  const { t } = useTexts();
  const v = space.visitors;
  const [approving, setApproving] = useState('');
  if (!v) return null;
  const set = (change: { agents?: VisitorRule; services?: VisitorRule }) => attempt(() => api('setVisitors', { space: space.id, ...change }).then(bump), t('post.saved'));
  const approve = (agent: string, on: boolean) => attempt(() => api('approveAgent', { space: space.id, agent, on }).then(bump), t(on ? 'visitors.approved' : 'visitors.unapproved', { agent }));
  return (
    <fieldset>
      <legend>{t('visitors.legend')}</legend>
      <p className="small">
        {t('visitors.about')}
        {t(space.managed ? 'visitors.managed.note' : 'visitors.own.note')}
      </p>
      <RuleRow id="agents" label={t('visitors.agents')} rule={v.agents} canSet={canSet && !space.managed} onSave={(agents) => set({ agents })} />
      <RuleRow id="services" label={t('visitors.services')} rule={v.services} canSet={canSet && !space.managed} onSave={(services) => set({ services })} />
      {(v.agents.who === 'approved' || v.services.who === 'approved' || v.approved.length > 0) && (
        <>
          <p className="small">
            <b>{t('visitors.approved.list')}</b> {v.approved.length ? '' : t('visitors.none.yet')}
          </p>
          {v.approved.map((name) => (
            <div className="field-row" key={name}>
              <span className="grow small">{name}</span>
              {canSet && <AsyncButton onClick={() => approve(name, false)}>{t('button.remove')}</AsyncButton>}
            </div>
          ))}
          {canSet && (
            <div className="field-row">
              <input className="grow" placeholder={t('visitors.approve.placeholder')} value={approving} onChange={(e) => setApproving(e.target.value)} aria-label={t('visitors.approve.label')} />
              <AsyncButton disabled={!approving.includes('/')} onClick={() => approve(approving.trim(), true).then(() => setApproving(''))}>
                {t('visitors.approve')}
              </AsyncButton>
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}

/** One rule: whose count, and the kinds they may write (all their person allows, when empty). */
function RuleRow({ id, label, rule, canSet, onSave }: { id: string; label: string; rule: VisitorRule; canSet: boolean; onSave(rule: VisitorRule): Promise<unknown> }) {
  const { t } = useTexts();
  const [kinds, setKinds] = useState((rule.kinds ?? []).join(', '));
  const listed = kinds.split(',').map((k) => k.trim()).filter(Boolean);
  const changed = listed.join(',') !== (rule.kinds ?? []).join(',');
  const save = (who: VisitorRule['who']) => onSave({ who, ...(listed.length ? { kinds: listed } : {}) });
  return (
    <div className="field-row">
      <label className="small" htmlFor={`who-${id}`} style={{ minWidth: '5em' }}>
        {label}
      </label>
      <select id={`who-${id}`} disabled={!canSet} value={rule.who} onChange={(e) => void save(e.target.value as VisitorRule['who'])}>
        {WHO.map((value) => (
          <option key={value} value={value}>
            {t(`visitors.who.${value}`)}
          </option>
        ))}
      </select>
      {rule.who !== 'nobody' && (
        <>
          <input className="grow" disabled={!canSet} placeholder={t('visitors.kinds.placeholder')} value={kinds} onChange={(e) => setKinds(e.target.value)} aria-label={t('visitors.kinds.label', { who: label.toLowerCase() })} title={t('visitors.kinds.title')} />
          {canSet && changed && <AsyncButton onClick={() => save(rule.who)}>{t('button.save')}</AsyncButton>}
        </>
      )}
    </div>
  );
}
