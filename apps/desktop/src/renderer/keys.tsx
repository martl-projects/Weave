import { useState, type FormEvent } from 'react';
import type { IdentityInfo, KeyInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bridge, bump, shortDid, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Modal, WeaveMark } from './ui.tsx';
import { PhonesBox } from './phones.tsx';
import { LinkedAccountsBox } from './github.tsx';
import { AgentAppsBox } from './agents.tsx';
import { Page } from './views.tsx';

/*
 * Identity and keys. The 24 recovery words are the identity: every root key
 * and encryption key comes from them, and Weave never stores them. This
 * computer signs with its own device key; the words are needed only to add
 * or revoke devices and to rotate keys.
 */

function Words({ words }: { words: string }) {
  const list = words.split(' ');
  return (
    <ol className="words sunken">
      {list.map((w, i) => (
        <li key={i}>
          <span className="n">{i + 1}.</span> {w}
        </li>
      ))}
    </ol>
  );
}

/** First start: a name, then the words to write down; or restore from words you already have. */
export function Onboarding({ onDone }: { onDone(): void }) {
  const [mode, setMode] = useState<'create' | 'restore'>('create');
  const [name, setName] = useState('');
  const [words, setWords] = useState<string>();
  const [wrote, setWrote] = useState(false);
  const [restoring, setRestoring] = useState('');
  const [busy, setBusy] = useState(false);

  const window = (title: string, body: React.ReactNode) => (
    <div className="desktop">
      <div className="window welcome">
        <div className="title-bar">
          <div className="title-bar-text">{title}</div>
        </div>
        <div className="window-body">{body}</div>
      </div>
    </div>
  );

  if (words)
    return window(
      'Your recovery words',
      <>
        <p>
          Write these 24 words down <b>on paper</b>, in order. They are shown only now.
        </p>
        <Words words={words} />
        <p className="small">
          They are your identity: with them you set up another computer, replace a stolen key and rotate your keys. Weave never stores them. Keep them away from this
          computer, from chats and from AI agents: whoever has them is you.
        </p>
        <div className="field-row">
          <input id="wrote" type="checkbox" checked={wrote} onChange={(e) => setWrote(e.target.checked)} />
          <label htmlFor="wrote">I wrote them down and put them somewhere safe</label>
        </div>
        <div className="buttons">
          <button className="default" disabled={!wrote} onClick={() => (setWords(undefined), onDone())}>
            Continue
          </button>
        </div>
      </>,
    );

  if (mode === 'restore')
    return window(
      'Restore Weave on this computer',
      <form
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          setBusy(true);
          const ok = await attempt(() => bridge.restore(restoring).then(() => true), 'This computer is now one of your devices');
          setBusy(false);
          if (ok) onDone();
        }}
      >
        <p className="small">Type your 24 recovery words. Keep another of your devices, or a friend who follows you, online: this computer fetches your identity from them.</p>
        <textarea className="wide" rows={4} required autoFocus spellCheck={false} value={restoring} onChange={(e) => setRestoring(e.target.value)} />
        <div className="buttons">
          <button type="button" onClick={() => setMode('create')}>
            Back
          </button>
          <button className="default" disabled={busy}>
            {busy ? 'Looking for your identity…' : 'Restore'}
          </button>
        </div>
      </form>,
    );

  return window(
    'Welcome to Weave',
    <form
      onSubmit={async (e: FormEvent) => {
        e.preventDefault();
        setBusy(true);
        const created = await attempt(() => bridge.init(name).then((recovery) => ({ recovery })));
        setBusy(false);
        if (!created) return; // failed; the toast says why
        if (created.recovery) setWords(created.recovery);
        else onDone();
      }}
    >
      <div className="welcome-head">
        <WeaveMark size={48} />
        <p>Your hub, your keys, your friends. Your identity is created on this computer and never leaves it.</p>
      </div>
      <div className="field-row-stacked">
        <label htmlFor="welcome-name">What should people call you?</label>
        <input id="welcome-name" required maxLength={40} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="buttons">
        <button type="button" onClick={() => setMode('restore')}>
          I already use Weave…
        </button>
        <button className="default" disabled={busy}>
          Create my hub
        </button>
      </div>
    </form>,
  );
}

/** Asks for the recovery words (and, for revoking, since when the key can't be trusted). */
function WordsDialog({ title, intro, since, encryption, onSubmit, onClose }: { title: string; intro: React.ReactNode; since?: boolean; encryption?: boolean; onSubmit(input: { words: string; since?: string; encryption?: boolean }): Promise<unknown>; onClose(): void }) {
  const [words, setWords] = useState('');
  const [when, setWhen] = useState('');
  const [newEncryption, setNewEncryption] = useState(false);
  return (
    <Modal title={title} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const done = await onSubmit({ words, ...(since && when ? { since: new Date(when).toISOString() } : {}), ...(encryption ? { encryption: newEncryption } : {}) });
          if (done !== undefined) onClose();
        }}
      >
        <p className="small">{intro}</p>
        {since && (
          <div className="field-row-stacked">
            <label htmlFor="since">Last time you trusted it (empty: from now on)</label>
            <input id="since" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
        )}
        <div className="field-row-stacked">
          <label htmlFor="words">Your 24 recovery words</label>
          <textarea id="words" className="wide" rows={3} required spellCheck={false} value={words} onChange={(e) => setWords(e.target.value)} />
        </div>
        {encryption && (
          <div className="field-row">
            <input id="new-enc" type="checkbox" checked={newEncryption} onChange={(e) => setNewEncryption(e.target.checked)} />
            <label htmlFor="new-enc">Also replace my encryption key (if it may have leaked)</label>
          </div>
        )}
        <p className="small">The words go to your own node only, are used once and are not stored.</p>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default">{title}</button>
        </div>
      </form>
    </Modal>
  );
}

export function KeysView() {
  const { data: info } = useApi(() => api<IdentityInfo>('identityInfo'), []);
  const { data: keys } = useApi(() => api<KeyInfo[]>('keys'), []);
  const [dialog, setDialog] = useState<{ kind: 'revoke'; key: KeyInfo } | { kind: 'rotate' }>();
  if (!info || !keys) return <Page title="Keys & devices">{null}</Page>;
  return (
    <Page title={<><Icon name="lock" /> Keys &amp; devices</>}>
      {info.forks.length > 0 && (
        <div className="notice alarm">
          <Icon name="lock" /> A key of yours was seen signing in two places at once: it may be stolen, or your Weave folder was copied to another computer. Revoke it from the time you
          last trusted it.
        </div>
      )}
      <fieldset>
        <legend>Your identity</legend>
        <p className="small">
          <code>{info.did}</code>
        </p>
        {info.recoverable ? (
          <p className="small">
            Protected by your recovery words. Your root key was rotated {info.rotations} time{info.rotations === 1 ? '' : 's'}; your words already cover the next one.
          </p>
        ) : (
          <p className="small">This identity was made before recovery words existed: it can't rotate keys or add devices. Creating a new identity gives you both.</p>
        )}
        {info.recoverable && (
          <div className="buttons">
            <button onClick={() => setDialog({ kind: 'rotate' })}>Rotate keys…</button>
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend>Devices and agents</legend>
        <table className="keys-table">
          <tbody>
            {keys.map((k) => (
              <tr key={k.did} className={k.revokedAfter !== undefined ? 'revoked' : ''}>
                <td>
                  <Icon name={k.role === 'device' ? 'user' : 'gear'} />
                </td>
                <td>
                  <b>{k.name ?? shortDid(k.did)}</b> <span className="small">{k.role}</span>
                  {k.current && <span className="tag friend">this device</span>}
                  {k.forked && <span className="tag rejected">seen in two places</span>}
                  {k.revokedAfter !== undefined && <span className="tag">revoked</span>}
                  <div className="small muted">
                    {k.events} event{k.events === 1 ? '' : 's'}
                    {k.lastTime ? ` · last ${ago(k.lastTime)}` : ''}
                  </div>
                </td>
                <td>
                  {k.revokedAfter === undefined &&
                    (k.role === 'agent' ? (
                      <AsyncButton onClick={async () => (await ask(`Revoke the agent ${k.name}? It can't sign anything from now on.`, 'Revoke')) && attempt(() => api('revokeKey', { key: k.did }).then(bump), `${k.name} is revoked`)}>
                        Revoke
                      </AsyncButton>
                    ) : (
                      <button onClick={() => setDialog({ kind: 'revoke', key: k })}>{k.current ? 'Replace…' : 'Revoke…'}</button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small">Each computer signs with its own key. To use Weave on another computer, choose “I already use Weave” there and type your words; don't copy your Weave folder.</p>
      </fieldset>
      <PhonesBox />
      <AgentAppsBox />
      <LinkedAccountsBox />
      {dialog?.kind === 'revoke' && (
        <WordsDialog
          title={dialog.key.current ? 'Replace this device key' : 'Revoke device'}
          intro={
            dialog.key.current
              ? 'This computer gets a fresh key; anything signed with the old one after the time you choose becomes void.'
              : `Everything ${dialog.key.name ?? 'this device'} signed after the time you choose becomes void, on every node.`
          }
          since
          onSubmit={(input) => attempt(() => api('revokeKey', { key: dialog.key.did, ...input }).then(bump), 'Revoked')}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog?.kind === 'rotate' && (
        <WordsDialog
          title="Rotate keys"
          intro="Your root key moves on to the next one your words hold; the old one stops counting. Do this if you think your root key leaked, or now and then."
          encryption
          onSubmit={(input) => attempt(() => api('rotateRoot', input).then(bump), 'Keys rotated')}
          onClose={() => setDialog(undefined)}
        />
      )}
    </Page>
  );
}
