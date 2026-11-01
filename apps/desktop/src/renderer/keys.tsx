import { useEffect, useState, type FormEvent } from 'react';
import { AgentAvatar } from './avatar.tsx';
import { AgentAvatarEditor } from './avatar-editor.tsx';
import type { IdentityInfo, KeepersInfo, KeyInfo, Profile, SignInStatus, Status } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bridge, bump, openedEnrollLink, shortDid, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Modal, WeaveMark, Info } from './ui.tsx';
import { PhonesBox } from './phones.tsx';
import { LinkedAccountsBox } from './accounts.tsx';
import { KeyvaultsBox } from './keyvaults.tsx';
import { AgentAppsBox } from './agents.tsx';
import { WalletBox } from './wallet.tsx';
import { Page } from './views.tsx';
import { FetchersBox, ServicesBox } from './services.tsx';
import { T, useTexts } from './texts.tsx';

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
  const { t } = useTexts();
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
      t('onboard.words.title'),
      <>
        <p>
          <T name="onboard.words.write" />
        </p>
        <Words words={words} />
        <p className="small">{t('onboard.words.why')}</p>
        <div className="field-row">
          <input id="wrote" type="checkbox" checked={wrote} onChange={(e) => setWrote(e.target.checked)} />
          <label htmlFor="wrote">{t('onboard.words.wrote')}</label>
        </div>
        <div className="buttons">
          <button className="default" disabled={!wrote} onClick={() => (setWords(undefined), onDone())}>
            {t('button.continue')}
          </button>
        </div>
      </>,
    );

  if (enrolled)
    return window(
      t('onboard.company.ready'),
      <>
        <div className="welcome-head">
          <WeaveMark size={48} />
          <p>
            <T name="onboard.company.welcome" values={{ name: <b>{enrolled.name}</b>, company: <b>{enrolled.company?.name ?? t('company.yours')}</b> }} />
          </p>
        </div>
        <p className="small">{t('onboard.company.signed')}</p>
        <div className="buttons">
          <button className="default" onClick={() => (setEnrolled(undefined), onDone())}>
            {t('onboard.open')}
          </button>
        </div>
      </>,
    );

  if (mode === 'company')
    return window(
      t('onboard.company.title'),
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
          <p>{t('onboard.company.intro')}</p>
        </div>
        {managed.enrollLink ? (
          <p className="small">{t('onboard.company.managed')}</p>
        ) : (
          <div className="field-row-stacked">
            <label htmlFor="enroll-link">{t('onboard.company.link')}</label>
            <textarea id="enroll-link" className="wide" rows={3} required autoFocus spellCheck={false} placeholder="weave:enroll:…" value={link} onChange={(e) => setLink(e.target.value)} />
          </div>
        )}
        <div className="buttons">
          {!managed.companyOnly && (
            <button type="button" onClick={() => setMode('create')}>
              {t('button.back')}
            </button>
          )}
          <button className="default" disabled={busy || !link.trim()}>
            {t(busy ? 'onboard.company.waiting' : 'onboard.company.signin')}
          </button>
        </div>
      </form>,
    );

  if (mode === 'restore')
    return window(
      t('onboard.restore.title'),
      <form
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          setBusy(true);
          const ok = await attempt(() => bridge.restore(restoring).then(() => true), t('onboard.restore.done'));
          setBusy(false);
          if (ok) onDone();
        }}
      >
        <p className="small">{t('onboard.restore.intro')}</p>
        <textarea className="wide" rows={4} required autoFocus spellCheck={false} value={restoring} onChange={(e) => setRestoring(e.target.value)} />
        <div className="buttons">
          <button type="button" onClick={() => setMode('create')}>
            {t('button.back')}
          </button>
          <button className="default" disabled={busy}>
            {t(busy ? 'onboard.restore.looking' : 'onboard.restore')}
          </button>
        </div>
      </form>,
    );

  return window(
    t('onboard.welcome'),
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
        <p>{t('onboard.intro')}</p>
      </div>
      <div className="field-row-stacked">
        <label htmlFor="welcome-name">{t('onboard.name')}</label>
        <input id="welcome-name" required maxLength={40} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="buttons">
        <button type="button" onClick={() => setMode('company')}>
          {t('onboard.company.button')}
        </button>
        <button type="button" onClick={() => setMode('restore')}>
          {t('onboard.restore.button')}
        </button>
        <button className="default" disabled={busy}>
          {t('onboard.create')}
        </button>
      </div>
    </form>,
  );
}

/** A company account (stage 13): whose it is, and whether it's signed in and vouched for. */
function CompanyAccountBox() {
  const { t } = useTexts();
  const { data: status } = useApi(() => api<SignInStatus>('signInStatus'), []);
  if (!status?.company) return null;
  return (
    <fieldset>
      <legend>{t('company.account')}</legend>
      <p>
        {status.account ? (
          <T name="company.belongs.signed" values={{ name: <b>{status.name}</b>, account: <b>{status.account}</b> }} />
        ) : (
          <T name="company.belongs" values={{ name: <b>{status.name}</b> }} />
        )}
      </p>
      {status.problem ? (
        <p className="notice alarm">
          <Icon name="lock" /> {status.problem}
        </p>
      ) : (
        <p className="small">
          {t(status.renews ? 'company.renews' : 'company.signin.again.when')}
          {status.vouchedUntil ? t('company.vouches.until', { until: status.vouchedUntil }) : t('company.vouches.once')}
        </p>
      )}
      <AsyncButton onClick={() => api('companySignIn').then(bump)} title={t('company.signin.title')}>
        {t('company.signin.again')}
      </AsyncButton>
    </fieldset>
  );
}

/** Asks for the recovery words (and, for revoking, since when the key can't be trusted). */
function WordsDialog({ title, intro, since, encryption, onSubmit, onClose }: { title: string; intro: React.ReactNode; since?: boolean; encryption?: boolean; onSubmit(input: { words: string; since?: string; encryption?: boolean }): Promise<unknown>; onClose(): void }) {
  const { t } = useTexts();
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
            <label htmlFor="since">{t('keys.since')}</label>
            <input id="since" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </div>
        )}
        <div className="field-row-stacked">
          <label htmlFor="words">{t('keys.words')}</label>
          <textarea id="words" className="wide" rows={3} required spellCheck={false} value={words} onChange={(e) => setWords(e.target.value)} />
        </div>
        {encryption && (
          <div className="field-row">
            <input id="new-enc" type="checkbox" checked={newEncryption} onChange={(e) => setNewEncryption(e.target.checked)} />
            <label htmlFor="new-enc">{t('keys.replace.encryption')}</label>
          </div>
        )}
        <p className="small">{t('keys.words.once')}</p>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            {t('button.cancel')}
          </button>
          <button className="default">{title}</button>
        </div>
      </form>
    </Modal>
  );
}

/** The kinds most agents need, in plain words (agent.perm.<kind>). Other kinds an agent already has are kept as they are. */
const AGENT_KINDS = ['weave.post', 'weave.reply', 'weave.msg', 'weave.react', 'weave.issue.*', 'weave.vote', 'weave.post.coauthor', 'weave.post.edit', 'weave.app'] as const;
const PERM_NAMES: Record<(typeof AGENT_KINDS)[number], string> = {
  'weave.post': 'agent.perm.post',
  'weave.reply': 'agent.perm.reply',
  'weave.msg': 'agent.perm.msg',
  'weave.react': 'agent.perm.react',
  'weave.issue.*': 'agent.perm.issue',
  'weave.vote': 'agent.perm.vote',
  'weave.post.coauthor': 'agent.perm.coauthor',
  'weave.post.edit': 'agent.perm.edit',
  'weave.app': 'agent.perm.app',
};

/** What an agent may sign: checkboxes for the common kinds, saved with updateAgent. */
function AgentPermissionsDialog({ agent, onClose }: { agent: KeyInfo & { name: string; permissions: string[] }; onClose(): void }) {
  const { t } = useTexts();
  const [chosen, setChosen] = useState(() => new Set(agent.permissions));
  const others = agent.permissions.filter((p) => !(AGENT_KINDS as readonly string[]).includes(p));
  const toggle = (kind: string, on: boolean) =>
    setChosen((prev) => {
      const next = new Set(prev);
      if (on) next.add(kind);
      else next.delete(kind);
      return next;
    });
  return (
    <Modal title={t('agent.may.title', { name: agent.name })} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const permissions = [...AGENT_KINDS.filter((k) => chosen.has(k)), ...others];
          const done = await attempt(() => api('updateAgent', { name: agent.name, permissions }).then(() => (bump(), true)), t('agent.may.saved', { name: agent.name }));
          if (done) onClose();
        }}
      >
        <p className="small">{t('agent.may.intro', { name: agent.name })}</p>
        {AGENT_KINDS.map((kind) => (
          <div className="field-row" key={kind}>
            <input id={`perm-${kind}`} type="checkbox" checked={chosen.has(kind)} onChange={(e) => toggle(kind, e.target.checked)} />
            <label htmlFor={`perm-${kind}`} title={kind}>
              {t(PERM_NAMES[kind])}
            </label>
          </div>
        ))}
        {others.length > 0 && (
          <p className="small">
            {t('agent.may.others')} <code>{others.join(', ')}</code>
          </p>
        )}
        <div className="buttons">
          <button type="button" onClick={onClose}>
            {t('button.cancel')}
          </button>
          <button className="default">{t('button.save')}</button>
        </div>
      </form>
    </Modal>
  );
}

type KeystoreOption = { keystore: Status['keystore']; name: string; ready: boolean; why?: string; current: boolean };

/**
 * Always-on nodes (stage 18): a server, NAS or cluster that keeps your spaces and hosts your rooms while your
 * computers are off. It shows a request (weave-server pair); this answers it, and the answer goes back to it.
 */
function AlwaysOnNodes({ keys }: { keys: KeyInfo[] }) {
  const { t } = useTexts();
  const nodes = keys.filter((k) => k.name?.startsWith('node:'));
  const [request, setRequest] = useState('');
  const [answer, setAnswer] = useState<{ answer: string; name: string }>();
  return (
    <fieldset>
      <legend>{t('nodes.legend')}</legend>
      {nodes.map((n) => (
        <div className="field-row" key={n.did}>
          <Icon name="community" />
          <span className="grow">
            <b>{n.name!.slice(5)}</b>{' '}
            <span className="small muted">
              {n.revokedAfter !== undefined ? t('key.revoked') : n.lastTime ? t('node.last.heard', { time: n.lastTime }) : t('node.not.heard')} · {t('key.events', { n: n.events })}
            </span>
          </span>
          {n.revokedAfter === undefined && (
            <AsyncButton onClick={async () => (await ask(t('node.revoke.ask', { name: n.name!.slice(5) }), t('button.revoke'))) && attempt(() => api('revokeKey', { key: n.did }).then(bump), t('key.revoked.done'))}>
              {t('button.revoke')}
            </AsyncButton>
          )}
        </div>
      ))}
      <p className="small">
        {t('nodes.about')} <Info>{t('nodes.about.more')}</Info>
      </p>
      <ol className="small">
        <li>
          <T name="nodes.step.1" />
        </li>
        <li>{t('nodes.step.2')}</li>
        <li>
          <T name="nodes.step.3" />
        </li>
      </ol>
      {answer ? (
        <div className="field-row-stacked">
          <p className="small">
            <T name="node.linked" values={{ name: <b>{answer.name}</b> }} />
          </p>
          <textarea className="wide" rows={3} readOnly value={answer.answer} onFocus={(e) => e.currentTarget.select()} />
          <div className="buttons">
            <button onClick={() => void navigator.clipboard.writeText(answer.answer)}>{t('button.copy')}</button>
            <button onClick={() => setAnswer(undefined)}>{t('button.done')}</button>
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
            {t('node.link')}
          </AsyncButton>
        </div>
      )}
    </fieldset>
  );
}

/** Where the key to your keys is kept, and moving it into hardware (stage 17). */
function KeystoreChoice({ current }: { current: Status['keystore'] }) {
  const { t } = useTexts();
  const keystoreName = (k: Status['keystore']) => t(`keystore.${k}`);
  const { data: options } = useApi(() => api<KeystoreOption[]>('keystores'), []);
  const [to, setTo] = useState('');
  if (!options || current === 'kms') return null;
  const others = options.filter((o) => !o.current && o.ready);
  const missing = options.filter((o) => !o.ready);
  if (!others.length) return null;
  return (
    <div className="field-row">
      <label htmlFor="keystore">{t('keystore.keep.in')}</label>
      <select id="keystore" value={to} onChange={(e) => setTo(e.target.value)}>
        <option value="">{t('keystore.now', { name: keystoreName(current) })}</option>
        {others.map((o) => (
          <option key={o.keystore} value={o.keystore}>
            {keystoreName(o.keystore)}
          </option>
        ))}
      </select>
      {to && (
        <AsyncButton
          onClick={async () => {
            const hardware = to === 'tpm' || to === 'secure-enclave' || to === 'yubikey';
            if (hardware && !(await ask(t('keystore.move.ask', { name: keystoreName(to as Status['keystore']), yubikey: to === 'yubikey' ? t('keystore.move.yubikey') : '' }), t('keystore.move.it')))) return;
            if (await attempt(() => api('moveHomeKey', { to }), t('keystore.moved', { name: keystoreName(to as Status['keystore']) }))) {
              setTo('');
              bump();
            }
          }}
        >
          {t('keystore.move')}
        </AsyncButton>
      )}
      {missing.length > 0 && <span className="small muted"> {t('keystore.not.here', { names: missing.map((o) => keystoreName(o.keystore)) })}</span>}
    </div>
  );
}

export function KeysView() {
  const { t } = useTexts();
  const { data: info } = useApi(() => api<IdentityInfo>('identityInfo'), []);
  const { data: keys } = useApi(() => api<KeyInfo[]>('keys'), []);
  const { data: status } = useApi(() => api<Status>('status'), []);
  const { data: keeping } = useApi(() => api<KeepersInfo>('keepers'), []);
  // A company account has no recovery words: its company holds them.
  const { data: signIn } = useApi(() => api<SignInStatus>('signInStatus'), []);
  const company = signIn?.company ? (signIn.name ?? t('company.yours')) : undefined;
  const [dialog, setDialog] = useState<{ kind: 'revoke'; key: KeyInfo } | { kind: 'rotate' } | { kind: 'permissions'; key: KeyInfo & { name: string; permissions: string[] } } | { kind: 'avatar'; agent: string }>();
  const { data: me } = useApi(() => api<Profile>('profile'), []);
  if (!info || !keys) return <Page title={t('nav.keys')}>{null}</Page>;
  const keystoreWhy = status?.keystoreWarning ? /\((.*)\)$/.exec(status.keystoreWarning)?.[1] : undefined;
  // Who keeps anything of yours, each once.
  const keeperNames = keeping ? [...new Map(keeping.spaces.flatMap((s) => s.keepers).map((k) => [k.did, k.name ?? shortDid(k.did)])).values()] : [];
  return (
    <Page
      title={
        <>
          <Icon name="lock" /> {t('nav.keys')}
        </>
      }
    >
      {info.forks.length > 0 && (
        <div className="notice alarm">
          <Icon name="lock" /> {t('keys.forked')}
        </div>
      )}
      <CompanyAccountBox />
      <fieldset>
        <legend>{t('identity.legend')}</legend>
        <p className="small">
          <code>{info.did}</code> <span className="muted">{t('identity.public')}</span>
        </p>
        {company ? (
          <p className="small">
            <T name="identity.company.holds" values={{ company }} />
          </p>
        ) : info.recoverable ? (
          <>
            <p className="small">
              {t('identity.words')} <Info>{t('identity.words.info')}</Info>
            </p>
            <p className="small">
              {t('identity.rotations', { n: info.rotations })} <Info>{t('identity.rotation.info')}</Info>
            </p>
          </>
        ) : (
          <p className="small">{t('identity.old')}</p>
        )}
        {info.recoverable && !company && (
          <div className="buttons">
            <button onClick={() => setDialog({ kind: 'rotate' })}>{t('keys.rotate.button')}</button>
          </div>
        )}
      </fieldset>
      {status && (
        <fieldset>
          <legend>{t('keys.computer')}</legend>
          {status.keystoreWarning ? (
            <p className="notice alarm">
              <Icon name="lock" /> {t('keys.unprotected.long', { where: keystoreWhy ? ` (${keystoreWhy})` : t('keys.unprotected.system') })}
            </p>
          ) : (
            <p className="small">
              {t('keys.sealed.short', { name: t(`keystore.${status.keystore}`) })}{' '}
              <Info>
                {t('keys.sealed', { name: t(`keystore.${status.keystore}`) })} {company ? t('keys.other.computer.company', { company }) : t('keys.other.computer.words')}
              </Info>
            </p>
          )}
          <KeystoreChoice current={status.keystore} />
        </fieldset>
      )}
      {keeping && (
        <fieldset>
          <legend>{t('keepers.legend')}</legend>
          <p className="small">
            {keeperNames.length ? t('keepers.names', { names: keeperNames }) : t('keepers.none')}{' '}
            <Info>
              {t('keepers.about')}
              <ul>
                {keeping.spaces.map((s) => (
                  <li key={s.space.id}>
                    {s.space.name}: {s.keepers.length ? t('keepers.kept.by', { names: s.keepers.map((k) => k.name ?? shortDid(k.did)) }) : t('keepers.none.short')}
                  </li>
                ))}
              </ul>
            </Info>
          </p>
          <p className="small muted">{t('keepers.you.keep', { mb: (keeping.forOthers / 1048576).toFixed(1), max: Math.round(keeping.quota / 1048576) })}</p>
        </fieldset>
      )}
      <WalletBox />
      <fieldset>
        <legend>{t('devices.legend')}</legend>
        <table className="keys-table">
          <tbody>
            {keys.map((k) => (
              <tr key={k.did} className={k.revokedAfter !== undefined ? 'revoked' : ''}>
                <td>
                  {k.role === 'agent' && k.name && me ? <AgentAvatar person={me.did} agent={k.name} size={28} /> : <Icon name={k.role === 'device' ? 'user' : 'gear'} />}
                </td>
                <td>
                  <b>{k.name ?? shortDid(k.did)}</b> <span className="small">{t(`key.role.${k.role}`)}</span>
                  {k.current && <span className="tag friend">{t('key.this.device')}</span>}
                  {k.forked && <span className="tag rejected">{t('key.forked')}</span>}
                  {k.revokedAfter !== undefined && <span className="tag">{t('key.revoked')}</span>}
                  <div className="small muted">
                    {t('key.events', { n: k.events })}
                    {k.lastTime ? t('key.last', { time: k.lastTime }) : ''}
                  </div>
                </td>
                <td>
                  {k.revokedAfter === undefined &&
                    (k.role === 'agent' ? (
                      <>
                        {k.name && k.permissions && <button onClick={() => setDialog({ kind: 'permissions', key: { ...k, name: k.name!, permissions: k.permissions! } })}>{t('agent.permissions')}</button>}{' '}
                        {k.name && me && <button onClick={() => setDialog({ kind: 'avatar', agent: k.name! })}>{t('hub.avatar')}</button>}{' '}
                        <AsyncButton onClick={async () => (await ask(t('agent.revoke.ask', { name: k.name }), t('button.revoke'))) && attempt(() => api('revokeKey', { key: k.did }).then(bump), t('agent.revoked', { name: k.name }))}>
                          {t('button.revoke')}
                        </AsyncButton>
                      </>
                    ) : company ? null : (
                      <button onClick={() => setDialog({ kind: 'revoke', key: k })}>{t(k.current ? 'key.replace' : 'key.revoke')}</button>
                    ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small">
          {t('devices.each.signs')} {company ? t('devices.other.company', { company }) : t('devices.other.words')}
        </p>
      </fieldset>
      {/* Pairing more phones is for the computer itself; a phone may not. */}
      {!bridge.phone && <PhonesBox />}
      <AlwaysOnNodes keys={keys} />
      <ServicesBox keys={keys} />
      <KeyvaultsBox />
      <FetchersBox />
      <AgentAppsBox />
      <LinkedAccountsBox />
      {dialog?.kind === 'revoke' && (
        <WordsDialog
          title={t(dialog.key.current ? 'key.replace.title' : 'key.revoke.title')}
          intro={dialog.key.current ? t('key.replace.intro') : t('key.revoke.intro', { name: dialog.key.name ?? t('key.this.device.lc') })}
          since
          onSubmit={(input) => attempt(() => api('revokeKey', { key: dialog.key.did, ...input }).then(bump), t('key.revoked.done'))}
          onClose={() => setDialog(undefined)}
        />
      )}
      {dialog?.kind === 'permissions' && <AgentPermissionsDialog agent={dialog.key} onClose={() => setDialog(undefined)} />}
      {dialog?.kind === 'avatar' && me && <AgentAvatarEditor me={me} agent={dialog.agent} onClose={() => setDialog(undefined)} />}
      {dialog?.kind === 'rotate' && (
        <WordsDialog title={t('keys.rotate')} intro={t('keys.rotate.intro')} encryption onSubmit={(input) => attempt(() => api('rotateRoot', input).then(bump), t('keys.rotated'))} onClose={() => setDialog(undefined)} />
      )}
    </Page>
  );
}
