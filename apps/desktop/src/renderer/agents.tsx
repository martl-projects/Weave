import { useState, type ReactNode } from 'react';
import type { HarnessInfo, PermissionRequest } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bump, useApi } from './lib.ts';
import { attempt, AsyncButton, Modal } from './ui.tsx';
import { t, T, useTexts } from './texts.tsx';

/*
 * Telling the agent apps on this computer (Claude Code, Codex…) about Weave:
 * each gets an MCP entry that runs this Weave as one of your agents, with its
 * own key. Offered once after you join; Keys & devices can do it any time.
 */

type Harnesses = { offered: boolean; harnesses: HarnessInfo[] };

const stateNote = (h: HarnessInfo) => (h.state === 'ours' ? t('harness.connected') : h.state === 'other' ? t('harness.older.replaces') : '');

/** Asked once: which agent apps should know about Weave. */
export function AgentsOffer() {
  const { t } = useTexts();
  const { data } = useApi(() => api<Harnesses>('harnesses').catch(() => undefined), []);
  const [chosen, setChosen] = useState<string[]>();
  const [done, setDone] = useState<HarnessInfo[]>();
  const [closed, setClosed] = useState(false);
  const open = data?.harnesses.filter((h) => h.state !== 'ours') ?? [];
  const repaired = data?.harnesses.filter((h) => h.repaired) ?? [];
  const seen = () => {
    void api('dismissHarnesses');
    setClosed(true);
  };
  if (!closed && repaired.length && !done)
    return (
      <Modal title={t('harness.repaired.title')} onClose={seen}>
        <ul>
          {repaired.map((h) => (
            <li key={h.id}>
              <T name="harness.repaired" values={{ name: <b>{h.name}</b> }} /> {h.restart}
            </li>
          ))}
        </ul>
        <div className="buttons">
          <button className="default" onClick={seen}>
            {t('button.ok')}
          </button>
        </div>
      </Modal>
    );
  if (closed || !data || (data.offered && !done) || (!open.length && !done)) return null;
  const picked = chosen ?? open.map((h) => h.id);

  if (done)
    return (
      <Modal title={t('harness.done.title')} onClose={() => setClosed(true)}>
        <ul>
          {done.map((h) => (
            <li key={h.id}>
              <T name="harness.acts.as" values={{ name: <b>{h.name}</b>, agent: <b>{h.agent}</b> }} /> {h.restart}
            </li>
          ))}
        </ul>
        <p className="small">{t('harness.done.note', { agent: done[0]?.agent })}</p>
        <div className="buttons">
          <button className="default" onClick={() => setClosed(true)}>
            {t('button.done')}
          </button>
        </div>
      </Modal>
    );

  const connect = async () => {
    const results: HarnessInfo[] = [];
    for (const id of picked) {
      const r = await attempt(() => api<Harnesses>('connectHarness', { harness: id, on: true }));
      const h = r?.harnesses.find((x) => x.id === id);
      if (h) results.push(h);
    }
    bump();
    if (results.length) setDone(results);
    else setClosed(true);
  };
  const notNow = () => {
    void api('dismissHarnesses');
    setClosed(true);
  };
  return (
    <Modal title={t('harness.offer.title')} onClose={notNow}>
      <p>{t('harness.offer.intro')}</p>
      {open.map((h) => (
        <div className="field-row" key={h.id}>
          <input id={`harness-${h.id}`} type="checkbox" checked={picked.includes(h.id)} onChange={(e) => setChosen(e.target.checked ? [...picked, h.id] : picked.filter((x) => x !== h.id))} />
          <label htmlFor={`harness-${h.id}`}>
            <span>
              <T name="harness.add.to" values={{ name: <b>{h.name}</b> }} /> <span className="small muted">{t('harness.as.agent', { agent: h.agent, note: stateNote(h) ? `; ${stateNote(h)}` : '' })}</span>
            </span>
          </label>
        </div>
      ))}
      <p className="small">{t('harness.offer.note')}</p>
      <div className="buttons">
        <button onClick={notNow}>{t('button.not.now')}</button>
        <AsyncButton className="default" onClick={connect}>
          {t(picked.length ? 'harness.add.weave' : 'button.skip')}
        </AsyncButton>
      </div>
    </Modal>
  );
}

/** In Keys & devices: agent apps on this computer, and whether they know Weave. */
export function AgentAppsBox() {
  const { t } = useTexts();
  const { data } = useApi(() => api<Harnesses>('harnesses').catch(() => undefined), []);
  if (!data) return null;
  const set = (h: HarnessInfo, on: boolean) => attempt(() => api('connectHarness', { harness: h.id, on }).then(bump), on ? `${t('harness.knows', { name: h.name })} ${h.restart}` : t('harness.removed', { name: h.name }));
  return (
    <fieldset>
      <legend>{t('harness.legend')}</legend>
      {data.harnesses.map((h) => (
        <div className="field-row" key={h.id}>
          <Icon name="user" />
          <span className="grow">
            <b>{h.name}</b>{' '}
            <span className="small muted">{h.state === 'ours' ? t('harness.knows.as', { agent: h.agent }) : h.state === 'other' ? t('harness.older') : t('harness.unknown')}</span>
          </span>
          {h.state === 'ours' ? <AsyncButton onClick={() => set(h, false)}>{t('button.remove')}</AsyncButton> : <AsyncButton onClick={() => set(h, true)}>{t(h.state === 'other' ? 'button.update' : 'harness.add.weave')}</AsyncButton>}
        </div>
      ))}
      {data.harnesses.length === 0 && <p className="small">{t('harness.none')}</p>}
      <p className="small">{t('harness.about')}</p>
    </fieldset>
  );
}

/** What each kind lets an agent do, in plain words (agent.kind.<kind>). */
const KINDS = ['weave.post', 'weave.reply', 'weave.msg', 'weave.react', 'weave.issue.*', 'weave.vote', 'weave.post.coauthor', 'weave.post.edit', 'weave.app', 'weave.project.page', 'weave.project.public', 'weave.space.create'];
const kindWord = (k: string) => (KINDS.includes(k) ? t(`agent.kind.${k.replace(/\.\*$/, '').replace(/\./g, '-')}`) : k);
const kindWords = (kinds: string[]) => kinds.map(kindWord).join(', ');

/** What a request asks, in words: kinds to sign, or repositories for a project. */
function asked(r: PermissionRequest): { title: string; what: ReactNode; detail: string; done: string } {
  if (r.hand) {
    const many = r.hand.resources.length > 1;
    return {
      title: t(many ? 'ask.repos.title' : 'ask.repo.title', { agent: r.agent }),
      what: <T name={many ? 'ask.repos.what' : 'ask.repo.what'} values={{ project: <b>{r.hand.project.name}</b>, resources: <b>{r.hand.resources.join(', ')}</b>, app: r.hand.title }} />,
      detail: t(many ? 'ask.repos.detail' : 'ask.repo.detail'),
      done: t('ask.repo.done', { project: r.hand.project.name, resources: r.hand.resources.join(', ') }),
    };
  }
  return {
    title: t('ask.permission.title', { agent: r.agent }),
    what: <T name="ask.permission.what" values={{ what: <b>{kindWords(r.kinds)}</b> }} />,
    detail: t('ask.permission.detail', { kinds: r.kinds.join(', ') }),
    done: t('ask.permission.done', { agent: r.agent, what: kindWords(r.kinds) }),
  };
}

/**
 * Over the whole app: an agent waiting for a permission. Later hides it
 * until Weave starts again; the request stays in the Inbox.
 */
export function AgentAsks() {
  const { t } = useTexts();
  const { data } = useApi(() => api<PermissionRequest[]>('permissionRequests').catch(() => []), []);
  const [later, setLater] = useState<string[]>([]);
  const r = data?.find((x) => !later.includes(x.id));
  if (!r) return null;
  const a = asked(r);
  const answer = (allow: boolean) => attempt(() => api('answerPermission', { id: r.id, allow }).then(bump), allow ? a.done : t('ask.declined'));
  return (
    <Modal title={a.title} onClose={() => setLater([...later, r.id])}>
      <div className="approve-launch">
        <Icon name="user" size={32} />
        <div>
          <p>
            <T name="ask.your.agent.asks" values={{ agent: <b>{r.agent}</b>, what: a.what }} />
          </p>
          {r.reason && <p>“{r.reason}”</p>}
          <p className="small">{a.detail}</p>
        </div>
      </div>
      <div className="buttons">
        <button onClick={() => setLater([...later, r.id])}>{t('update.later')}</button>
        <AsyncButton onClick={() => answer(false)}>{t('request.decline')}</AsyncButton>
        <AsyncButton className="default" onClick={() => answer(true)}>
          {t('ask.allow')}
        </AsyncButton>
      </div>
    </Modal>
  );
}

/** In the Inbox: one of your agents asks to do more. */
export function PermissionCard({ request: r }: { request: PermissionRequest }) {
  const { t } = useTexts();
  const a = asked(r);
  const answer = (allow: boolean) => attempt(() => api('answerPermission', { id: r.id, allow }).then(bump), allow ? a.done : t('ask.declined'));
  return (
    <div className="admission window">
      <div className="window-body">
        <Icon name="user" size={32} />
        <div className="grow">
          <T name="ask.your.agent.asks.inbox" values={{ agent: <b>{r.agent}</b>, what: a.what }} />
          {r.reason && <>: “{r.reason}”</>}
          <div className="small muted">
            {ago(r.time)} · {a.detail}
          </div>
        </div>
        <AsyncButton onClick={() => answer(false)}>{t('request.decline')}</AsyncButton>
        <AsyncButton className="default" onClick={() => answer(true)}>
          {t('ask.allow')}
        </AsyncButton>
      </div>
    </div>
  );
}
