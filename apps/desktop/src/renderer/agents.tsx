import { useState } from 'react';
import type { HarnessInfo, PermissionRequest } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bump, useApi } from './lib.ts';
import { attempt, AsyncButton, Modal } from './ui.tsx';

/*
 * Telling the agent apps on this computer (Claude Code, Codex…) about Weave:
 * each gets an MCP entry that runs this Weave as one of your agents, with its
 * own key. Offered once after you join; Keys & devices can do it any time.
 */

type Harnesses = { offered: boolean; harnesses: HarnessInfo[] };

const stateNote = (h: HarnessInfo) => (h.state === 'ours' ? 'connected' : h.state === 'other' ? 'has an older Weave entry, which this replaces' : '');

/** Asked once: which agent apps should know about Weave. */
export function AgentsOffer() {
  const { data } = useApi(() => api<Harnesses>('harnesses').catch(() => undefined), []);
  const [chosen, setChosen] = useState<string[]>();
  const [done, setDone] = useState<HarnessInfo[]>();
  const [closed, setClosed] = useState(false);
  const open = data?.harnesses.filter((h) => h.state !== 'ours') ?? [];
  if (closed || !data || (data.offered && !done) || (!open.length && !done)) return null;
  const picked = chosen ?? open.map((h) => h.id);

  if (done)
    return (
      <Modal title="Your agents know Weave" onClose={() => setClosed(true)}>
        <ul>
          {done.map((h) => (
            <li key={h.id}>
              <b>{h.name}</b> acts as your agent <b>{h.agent}</b>. {h.restart}
            </li>
          ))}
        </ul>
        <p className="small">Everything an agent does is signed with its own key and shows as “you · {done[0]?.agent}”. Change what each may do, or revoke it, in Keys &amp; devices.</p>
        <div className="buttons">
          <button className="default" onClick={() => setClosed(true)}>
            Done
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
    <Modal title="Bring your agents along?" onClose={notNow}>
      <p>
        These AI agent apps are on this computer. Weave can tell them about itself, so your agents can read and post in Weave, each with its own key, showing as
        “you · agent”.
      </p>
      {open.map((h) => (
        <div className="field-row" key={h.id}>
          <input id={`harness-${h.id}`} type="checkbox" checked={picked.includes(h.id)} onChange={(e) => setChosen(e.target.checked ? [...picked, h.id] : picked.filter((x) => x !== h.id))} />
          <label htmlFor={`harness-${h.id}`}>
            <span>
              Add Weave to <b>{h.name}</b> <span className="small muted">as your agent “{h.agent}”{stateNote(h) ? `; ${stateNote(h)}` : ''}</span>
            </span>
          </label>
        </div>
      ))}
      <p className="small">
        Weave adds one entry, “weave”, to each app's settings and keeps a backup of the file. New agents may post, reply, chat and react; you can change that later. Nothing
        else on your computer changes.
      </p>
      <div className="buttons">
        <button onClick={notNow}>Not now</button>
        <AsyncButton className="default" onClick={connect}>
          {picked.length ? 'Add Weave' : 'Skip'}
        </AsyncButton>
      </div>
    </Modal>
  );
}

/** In Keys & devices: agent apps on this computer, and whether they know Weave. */
export function AgentAppsBox() {
  const { data } = useApi(() => api<Harnesses>('harnesses').catch(() => undefined), []);
  if (!data) return null;
  const set = (h: HarnessInfo, on: boolean) => attempt(() => api('connectHarness', { harness: h.id, on }).then(bump), on ? `${h.name} knows Weave. ${h.restart}` : `Weave is out of ${h.name}`);
  return (
    <fieldset>
      <legend>Agent apps</legend>
      {data.harnesses.map((h) => (
        <div className="field-row" key={h.id}>
          <Icon name="user" />
          <span className="grow">
            <b>{h.name}</b>{' '}
            <span className="small muted">{h.state === 'ours' ? `knows Weave, as your agent “${h.agent}”` : h.state === 'other' ? 'has an older Weave entry' : "doesn't know Weave"}</span>
          </span>
          {h.state === 'ours' ? <AsyncButton onClick={() => set(h, false)}>Remove</AsyncButton> : <AsyncButton onClick={() => set(h, true)}>{h.state === 'other' ? 'Update' : 'Add Weave'}</AsyncButton>}
        </div>
      ))}
      {data.harnesses.length === 0 && <p className="small">No agent apps found (Claude Code, Claude Desktop, Codex, Cursor).</p>}
      <p className="small">Each app's agent signs with its own key; revoke it in the table above. Weave keeps a backup of each settings file it changes.</p>
    </fieldset>
  );
}

/** What each kind lets an agent do, in plain words. */
const KIND_WORDS: Record<string, string> = {
  'weave.post': 'post',
  'weave.reply': 'reply',
  'weave.msg': 'chat',
  'weave.react': 'react',
  'weave.issue.*': 'open and work on issues',
  'weave.vote': 'vote on proposals',
  'weave.post.coauthor': 'confirm co-authorships',
  'weave.post.edit': 'edit its posts',
  'weave.app': "publish projects' apps and point them at releases",
  'weave.project.page': "change your projects' pages",
  'weave.project.public': 'show projects on your public hub',
  'weave.space.create': 'start projects for you',
};
const kindWords = (kinds: string[]) => kinds.map((k) => KIND_WORDS[k] ?? k).join(', ');

/**
 * Over the whole app: an agent waiting for a permission. Later hides it
 * until Weave starts again; the request stays in the Inbox.
 */
export function AgentAsks() {
  const { data } = useApi(() => api<PermissionRequest[]>('permissionRequests').catch(() => []), []);
  const [later, setLater] = useState<string[]>([]);
  const r = data?.find((x) => !later.includes(x.id));
  if (!r) return null;
  const answer = (allow: boolean) => attempt(() => api('answerPermission', { id: r.id, allow }).then(bump), allow ? `${r.agent} may now ${kindWords(r.kinds)}` : 'Declined');
  return (
    <Modal title={`${r.agent} asks for a permission`} onClose={() => setLater([...later, r.id])}>
      <div className="approve-launch">
        <Icon name="user" size={32} />
        <div>
          <p>
            Your agent <b>{r.agent}</b> asks to <b>{kindWords(r.kinds)}</b>.
          </p>
          {r.reason && <p>“{r.reason}”</p>}
          <p className="small">
            {r.kinds.join(', ')}. Allowing lets it do this from now on, signed with its own key; take it back in Keys &amp; devices.
          </p>
        </div>
      </div>
      <div className="buttons">
        <button onClick={() => setLater([...later, r.id])}>Later</button>
        <AsyncButton onClick={() => answer(false)}>Decline</AsyncButton>
        <AsyncButton className="default" onClick={() => answer(true)}>
          Allow
        </AsyncButton>
      </div>
    </Modal>
  );
}

/** In the Inbox: one of your agents asks to do more. */
export function PermissionCard({ request: r }: { request: PermissionRequest }) {
  const answer = (allow: boolean) => attempt(() => api('answerPermission', { id: r.id, allow }).then(bump), allow ? `${r.agent} may now ${kindWords(r.kinds)}` : 'Declined');
  return (
    <div className="admission window">
      <div className="window-body">
        <Icon name="user" size={32} />
        <div className="grow">
          Your agent <b>{r.agent}</b> asks to <b>{kindWords(r.kinds)}</b>
          {r.reason && <>: “{r.reason}”</>}
          <div className="small muted">
            {r.kinds.join(', ')} · {ago(r.time)}. Allowing lets it do this from now on, signed with its own key; take it back in Keys &amp; devices.
          </div>
        </div>
        <AsyncButton onClick={() => answer(false)}>Decline</AsyncButton>
        <AsyncButton className="default" onClick={() => answer(true)}>
          Allow
        </AsyncButton>
      </div>
    </div>
  );
}
