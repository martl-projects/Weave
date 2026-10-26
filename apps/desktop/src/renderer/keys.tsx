import { useEffect, useState, type FormEvent } from 'react';
import type { IdentityInfo, KeepersInfo, KeyInfo, SignInStatus, Status } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bridge, bump, openedEnrollLink, shortDid, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Modal, WeaveMark } from './ui.tsx';
import { PhonesBox } from './phones.tsx';
import { LinkedAccountsBox } from './github.tsx';
import { AgentAppsBox } from './agents.tsx';
import { WalletBox } from './wallet.tsx';
import { Page } from './views.tsx';
import { ServicesBox } from './services.tsx';

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

/** First start: a name, then the words to write down; or restore from words you already have; or a company account. */
export function Onboarding({ onDone }: { onDone(): void }) {
  const [mode, setMode] = useState<'create' | 'restore' | 'company'>('create');
  // A company's device management may name its enrollment link, or allow only company accounts here.
  const [managed, setManaged] = useState<{ enrollLink?: string; companyOnly?: boolean }>({});
  const [link, setLink] = useState('');
  const [enrolled, setEnrolled] = useState<{ name?: string; company?: { name?: string } }>();
  useEffect(() => {
    void bridge.state().then((s) => {
      setManaged({ enrollLink: s.enrollLink, companyOnly: s.companyOnly });
      if (s.enrollLink) setLink(s.enrollLink);
      if (s.enrollLink || s.companyOnly) setMode('company');
    });
    // An enrollment link clicked in the company's invitation opens this screen with it filled in.
    const opened = (value?: string) => {
      if (!value) return;
      setLink((current) => current || value);
      setMode('company');
    };
    opened(openedEnrollLink);
    const listener = (e: Event) => opened((e as CustomEvent<string>).detail);
    globalThis.addEventListener('weave-enroll-link', listener);
    return () => globalThis.removeEventListener('weave-enroll-link', listener);
  }, []);
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

  if (enrolled)
    return window(
      'Your company account is ready',
      <>
        <div className="welcome-head">
          <WeaveMark size={48} />
          <p>
            Welcome, <b>{enrolled.name}</b>. Your account belongs to <b>{enrolled.company?.name ?? 'your company'}</b>: it keeps it safe and can set it up on a new computer, so there are no words
            to write down.
          </p>
        </div>
        <p className="small">You stay signed in with your company account; Weave renews it by itself. Your company's projects and groups appear as soon as the company has let you in.</p>
        <div className="buttons">
          <button className="default" onClick={() => (setEnrolled(undefined), onDone())}>
            Open Weave
          </button>
        </div>
      </>,
    );

  if (mode === 'company')
    return window(
      'Set up your company account',
      <form
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          setBusy(true);
          const who = await attempt(() => bridge.enroll(link.trim()));
          setBusy(false);
          if (who) setEnrolled(who);
        }}
      >
        <div className="welcome-head">
          <WeaveMark size={48} />
          <p>Your company sets up your Weave account. You sign in with your company account in your browser; there are no recovery words to keep.</p>
        </div>
        {managed.enrollLink ? (
          <p className="small">Your company has set this computer up for its Weave already.</p>
        ) : (
          <div className="field-row-stacked">
            <label htmlFor="enroll-link">The enrollment link from your company</label>
            <textarea id="enroll-link" className="wide" rows={3} required autoFocus spellCheck={false} placeholder="weave:enroll:…" value={link} onChange={(e) => setLink(e.target.value)} />
          </div>
        )}
        <div className="buttons">
          {!managed.companyOnly && (
            <button type="button" onClick={() => setMode('create')}>
              Back
            </button>
          )}
          <button className="default" disabled={busy || !link.trim()}>
            {busy ? 'Waiting for the sign-in in your browser…' : 'Sign in with your company'}
          </button>
        </div>
      </form>,
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
        <button type="button" onClick={() => setMode('company')}>
          My company uses Weave…
        </button>
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

/** A company account (stage 13): whose it is, and whether it's signed in and vouched for. */
function CompanyAccountBox() {
  const { data: status } = useApi(() => api<SignInStatus>('signInStatus'), []);
  if (!status?.company) return null;
  const day = (iso?: string) => (iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
  return (
    <fieldset>
      <legend>Company account</legend>
      <p>
        This account belongs to <b>{status.name}</b>
        {status.account ? (
          <>
            {' '}
            and is signed in as <b>{status.account}</b>
          </>
        ) : null}
        . The company keeps it safe and can set it up on a new computer.
      </p>
      {status.problem ? (
        <p className="notice alarm">
          <Icon name="lock" /> {status.problem}
        </p>
      ) : (
        <p className="small">
          {status.renews ? 'Weave renews the sign-in by itself.' : 'Sign in again when it runs out.'}
          {status.vouchedUntil ? ` The company vouches for you until ${day(status.vouchedUntil)}.` : ' The company vouches for you once it has checked the sign-in.'}
        </p>
      )}
      <AsyncButton onClick={() => api('companySignIn').then(bump)} title="Opens your company's sign-in in the browser">
        Sign in again
      </AsyncButton>
    </fieldset>
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

/** The kinds most agents need, in plain words. Other kinds an agent already has are kept as they are. */
const AGENT_KINDS: { kind: string; label: string }[] = [
  { kind: 'weave.post', label: 'Post' },
  { kind: 'weave.reply', label: 'Reply' },
  { kind: 'weave.msg', label: 'Chat' },
  { kind: 'weave.react', label: 'React' },
  { kind: 'weave.issue.*', label: 'Open and work on issues' },
  { kind: 'weave.vote', label: 'Vote' },
  { kind: 'weave.post.coauthor', label: 'Confirm co-authorship' },
  { kind: 'weave.post.edit', label: 'Edit its posts' },
  { kind: 'weave.github.repo', label: 'Link GitHub repositories' },
  { kind: 'weave.github.account', label: 'Give spaces your GitHub account' },
  { kind: 'weave.app', label: 'Publish apps and releases' },
];

/** What an agent may sign: checkboxes for the common kinds, saved with updateAgent. */
function AgentPermissionsDialog({ agent, onClose }: { agent: KeyInfo & { name: string; permissions: string[] }; onClose(): void }) {
  const [chosen, setChosen] = useState(() => new Set(agent.permissions));
  const others = agent.permissions.filter((p) => !AGENT_KINDS.some((k) => k.kind === p));
  const toggle = (kind: string, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(kind);
      else next.delete(kind);
      return next;
    });
  return (
    <Modal title={`What ${agent.name} may do`} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const permissions = [...AGENT_KINDS.map((k) => k.kind).filter((k) => chosen.has(k)), ...others];
          const done = await attempt(() => api('updateAgent', { name: agent.name, permissions }).then(() => (bump(), true)), `Saved what ${agent.name} may do`);
          if (done) onClose();
        }}
      >
        <p className="small">Everything {agent.name} writes is signed with its own key and shows as “you · {agent.name}”. It can only sign what you tick here.</p>
        {AGENT_KINDS.map(({ kind, label }) => (
          <div className="field-row" key={kind}>
            <input id={`perm-${kind}`} type="checkbox" checked={chosen.has(kind)} onChange={(e) => toggle(kind, e.target.checked)} />
            <label htmlFor={`perm-${kind}`} title={kind}>
              {label}
            </label>
          </div>
        ))}
        {others.length > 0 && (
          <p className="small">
            It keeps these too: <code>{others.join(', ')}</code>
          </p>
        )}
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default">Save</button>
        </div>
      </form>
    </Modal>
  );
}

const KEYSTORE_NAME: Record<Status['keystore'], string> = {
  dpapi: 'Windows (DPAPI)',
  keychain: 'the macOS Keychain',
  'secret-service': 'your desktop’s Secret Service',
  file: 'nothing',
  kms: 'your company’s key service',
  tpm: 'this computer’s TPM chip',
  'secure-enclave': 'this Mac’s Secure Enclave',
  yubikey: 'your YubiKey',
};

type KeystoreOption = { keystore: Status['keystore']; name: string; ready: boolean; why?: string; current: boolean };

/**
 * Always-on nodes (stage 18): a server, NAS or cluster that keeps your spaces and hosts your rooms while your
 * computers are off. It shows a request (weave-server pair); this answers it, and the answer goes back to it.
 */
function AlwaysOnNodes({ keys }: { keys: KeyInfo[] }) {
  const nodes = keys.filter((k) => k.name?.startsWith('node:'));
  const [request, setRequest] = useState('');
  const [answer, setAnswer] = useState<{ answer: string; name: string }>();
  return (
    <fieldset>
      <legend>Always-on nodes</legend>
      {nodes.map((n) => (
        <div className="field-row" key={n.did}>
          <Icon name="community" />
          <span className="grow">
            <b>{n.name!.slice(5)}</b>{' '}
            <span className="small muted">
              {n.revokedAfter !== undefined ? 'revoked' : n.lastTime ? `last heard ${ago(n.lastTime)}` : 'not heard from yet'} · {n.events} events
            </span>
          </span>
          {n.revokedAfter === undefined && (
            <AsyncButton
              onClick={async () =>
                (await ask(`Revoke the always-on node ${n.name!.slice(5)}? It stops hosting your rooms, and what it signs from now on counts nowhere.`, 'Revoke')) &&
                attempt(() => api('revokeKey', { key: n.did }).then(bump), 'Revoked')
              }
            >
              Revoke
            </AsyncButton>
          )}
        </div>
      ))}
      <p className="small">
        A server, NAS or home cluster that keeps your spaces and hosts your rooms while your computers are off. It gets a key of its own that only hosts rooms (it can't post or change anything for
        you), and your spaces' keys, but not your direct chats. On it, run <code>weave-server pair</code> and paste its request here.
      </p>
      {answer ? (
        <div className="field-row-stacked">
          <p className="small">
            Linked <b>{answer.name}</b>. On the node, run <code>weave-server join</code> with this answer:
          </p>
          <textarea className="wide" rows={3} readOnly value={answer.answer} onFocus={(e) => e.currentTarget.select()} />
          <div className="buttons">
            <button onClick={() => void navigator.clipboard.writeText(answer.answer)}>Copy</button>
            <button onClick={() => setAnswer(undefined)}>Done</button>
          </div>
        </div>
      ) : (
        <div className="field-row">
          <input className="grow" placeholder="weave:node-request:…" value={request} onChange={(e) => setRequest(e.target.value)} spellCheck={false} />
          <AsyncButton
            onClick={async () => {
              const linked = await attempt(() => api<{ answer: string; name: string }>('linkNode', { request: request.trim() }));
              if (linked) {
                setAnswer(linked);
                setRequest('');
                bump();
              }
            }}
          >
            Link node
          </AsyncButton>
        </div>
      )}
    </fieldset>
  );
}

/** Where the key to your keys is kept, and moving it into hardware (stage 17). */
function KeystoreChoice({ current }: { current: Status['keystore'] }) {
  const { data: options } = useApi(() => api<KeystoreOption[]>('keystores'), []);
  const [to, setTo] = useState('');
  if (!options || current === 'kms') return null;
  const others = options.filter((o) => !o.current && o.ready);
  const missing = options.filter((o) => !o.ready);
  if (!others.length) return null;
  return (
    <div className="field-row">
      <label htmlFor="keystore">Keep it in</label>
      <select id="keystore" value={to} onChange={(e) => setTo(e.target.value)}>
        <option value="">{KEYSTORE_NAME[current]} (now)</option>
        {others.map((o) => (
          <option key={o.keystore} value={o.keystore}>
            {KEYSTORE_NAME[o.keystore]}
          </option>
        ))}
      </select>
      {to && (
        <AsyncButton
          onClick={async () => {
            const hardware = to === 'tpm' || to === 'secure-enclave' || to === 'yubikey';
            if (hardware && !(await ask(`Keep the key to your keys in ${KEYSTORE_NAME[to as Status['keystore']]}? Weave then opens only with it${to === 'yubikey' ? ' plugged in (touch it if it blinks)' : ''}. If it's lost or replaced, you set Weave up again from your recovery words, or your company does.`, 'Move it')))
              return;
            if (await attempt(() => api('moveHomeKey', { to }), `The key is now kept by ${KEYSTORE_NAME[to as Status['keystore']]}`)) {
              setTo('');
              bump();
            }
          }}
        >
          Move
        </AsyncButton>
      )}
      {missing.length > 0 && <span className="small muted"> Not here: {missing.map((o) => KEYSTORE_NAME[o.keystore]).join(', ')}.</span>}
    </div>
  );
}

export function KeysView() {
  const { data: info } = useApi(() => api<IdentityInfo>('identityInfo'), []);
  const { data: keys } = useApi(() => api<KeyInfo[]>('keys'), []);
  const { data: status } = useApi(() => api<Status>('status'), []);
  const { data: keeping } = useApi(() => api<KeepersInfo>('keepers'), []);
  // A company account has no recovery words: its company holds them.
  const { data: signIn } = useApi(() => api<SignInStatus>('signInStatus'), []);
  const company = signIn?.company ? (signIn.name ?? 'your company') : undefined;
  const [dialog, setDialog] = useState<{ kind: 'revoke'; key: KeyInfo } | { kind: 'rotate' } | { kind: 'permissions'; key: KeyInfo & { name: string; permissions: string[] } }>();
  if (!info || !keys) return <Page title="Keys & devices">{null}</Page>;
  return (
    <Page title={<><Icon name="lock" /> Keys &amp; devices</>}>
      {info.forks.length > 0 && (
        <div className="notice alarm">
          <Icon name="lock" /> A key of yours was seen signing in two places at once: it may be stolen, or your Weave folder was copied to another computer. Revoke it from the time you
          last trusted it.
        </div>
      )}
      <CompanyAccountBox />
      {status && (
        <fieldset>
          <legend>On this computer</legend>
          {status.keystoreWarning ? (
            <p className="notice alarm">
              <Icon name="lock" /> Your keys are not protected by the operating system here: anyone who copies your Weave folder can use them. Weave found no keystore it can use
              {/\((.*)\)$/.exec(status.keystoreWarning)?.[1] ? ` (${/\((.*)\)$/.exec(status.keystoreWarning)![1]})` : ' on this system'}.
            </p>
          ) : (
            <p className="small">
              Your keys are sealed, and the key to them is kept by {KEYSTORE_NAME[status.keystore]}: a copy of your Weave folder can't be opened on another computer or by another user.{' '}
              {company ? `To use Weave on another computer, ask ${company} to set it up.` : 'To use Weave on another computer, set it up from your recovery words.'}
            </p>
          )}
          <KeystoreChoice current={status.keystore} />
        </fieldset>
      )}
      {keeping && (
        <fieldset>
          <legend>Keepers</legend>
          <p className="small">
            Friends keep a sealed copy of your own space, your direct chats and your small groups, so that you can get them back with your recovery words even if every device is
            lost. They can't read it or tell what it is.
          </p>
          {keeping.spaces.map((s) => (
            <div className="field-row" key={s.space.id}>
              <span className="grow">{s.space.name}</span>
              <span className="small muted">{s.keepers.length ? `kept by ${s.keepers.map((k) => k.name ?? shortDid(k.did)).join(', ')}` : 'no keeper yet: you need friends (people you follow who follow you back)'}</span>
            </div>
          ))}
          <p className="small muted">
            You keep {(keeping.forOthers / 1048576).toFixed(1)} MB for friends (at most {Math.round(keeping.quota / 1048576)} MB).
          </p>
        </fieldset>
      )}
      <fieldset>
        <legend>Your identity</legend>
        <p className="small">
          <code>{info.did}</code>
        </p>
        {company ? (
          <p className="small">
            {company} holds this identity's recovery words. For a new computer, run <code>weave recover-request</code> there and give the request to one of {company}'s admins.
          </p>
        ) : info.recoverable ? (
          <p className="small">
            Protected by your recovery words. Your root key was rotated {info.rotations} time{info.rotations === 1 ? '' : 's'}; your words already cover the next one.
          </p>
        ) : (
          <p className="small">This identity was made before recovery words existed: it can't rotate keys or add devices. Creating a new identity gives you both.</p>
        )}
        {info.recoverable && !company && (
          <div className="buttons">
            <button onClick={() => setDialog({ kind: 'rotate' })}>Rotate keys…</button>
          </div>
        )}
      </fieldset>
      <WalletBox />
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
                      <>
                        {k.name && k.permissions && <button onClick={() => setDialog({ kind: 'permissions', key: { ...k, name: k.name!, permissions: k.permissions! } })}>Permissions…</button>}{' '}
                        <AsyncButton onClick={async () => (await ask(`Revoke the agent ${k.name}? It can't sign anything from now on.`, 'Revoke')) && attempt(() => api('revokeKey', { key: k.did }).then(bump), `${k.name} is revoked`)}>
                          Revoke
                        </AsyncButton>
                      </>
                    ) : company ? null : (
                      <button onClick={() => setDialog({ kind: 'revoke', key: k })}>{k.current ? 'Replace…' : 'Revoke…'}</button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small">
          Each computer signs with its own key.{' '}
          {company ? `For another computer, ask ${company}; don't copy your Weave folder.` : 'To use Weave on another computer, choose “I already use Weave” there and type your words; don\'t copy your Weave folder.'}
        </p>
      </fieldset>
      {/* Pairing more phones is for the computer itself; a phone may not. */}
      {!bridge.phone && <PhonesBox />}
      <AlwaysOnNodes keys={keys} />
      <ServicesBox keys={keys} />
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
      {dialog?.kind === 'permissions' && <AgentPermissionsDialog agent={dialog.key} onClose={() => setDialog(undefined)} />}
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
