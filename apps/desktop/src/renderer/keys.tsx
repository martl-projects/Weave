import { useEffect, useRef, useState, type FormEvent } from 'react';
import { AgentAvatar } from './avatar.tsx';
import { AgentAvatarEditor } from './avatar-editor.tsx';
import type { BackupInfo, IdentityInfo, KeeperFriend, KeepersInfo, KeyInfo, Profile, ReachInfo, SignInStatus, Status } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { ago, api, bridge, bump, openedEnrollLink, shortDid, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Modal, WeaveMark, Info, toast } from './ui.tsx';
import { PhonesBox } from './phones.tsx';
import { LinkedBrowsers } from './browsers.tsx';
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
  const { t } = useTexts();
  const list = words.split(' ');
  return (
    <>
      <ol className="words sunken">
        {list.map((w, i) => (
          <li key={i}>
            <span className="n">{i + 1}.</span> {w}
          </li>
        ))}
      </ol>
      {/* All 24 at once, numbered one per line: a restore takes them back as they are. */}
      <div className="buttons">
        <button id="copy-words" type="button" onClick={() => void navigator.clipboard.writeText(list.map((w, i) => `${i + 1}. ${w}`).join('\n')).then(() => toast(t('onboard.words.copied')))}>
          <Icon name="copy" /> {t('onboard.words.copy')}
        </button>
      </div>
    </>
  );
}

/** First start: a name, then the words to write down; or restore from words you already have; or a company account. */
export function Onboarding({ onDone }: { onDone(): void }) {
  const { t } = useTexts();
  // Weave Web first asks how: most who come back have a passkey already (synced by their phone or browser).
  const [mode, setMode] = useState<'start' | 'create' | 'restore' | 'company' | 'paste'>(bridge.web ? 'start' : 'create');
  const [pasted, setPasted] = useState('');
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
  // A backup file to restore from, with the words: then nobody else has to be online.
  const [backupFile, setBackupFile] = useState('');
  const [busy, setBusy] = useState(false);
  // Weave Web opened with an onboarding link: who invites to what.
  const invited = bridge.web?.onboarding?.();

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
        {bridge.web && !bridge.web.passkey() && (
          <p className="notice alarm">
            <Icon name="lock" /> {t('web.no.passkey')}
          </p>
        )}
        <p className="small">{t(bridge.web ? 'onboard.words.why.web' : 'onboard.words.why')}</p>
        <p className="small">{t(bridge.web ? 'onboard.words.backup.web' : 'onboard.words.backup')}</p>
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
          const ok = await attempt(() => bridge.restore(restoring, backupFile.trim() || undefined).then(() => true), t(backupFile.trim() ? 'onboard.restore.done.backup' : 'onboard.restore.done'));
          setBusy(false);
          if (ok) onDone();
        }}
      >
        {bridge.web && <p className="notice">{t('web.link.hint')}</p>}
        <p className="small">{t(bridge.web ? 'web.restore.intro' : 'onboard.restore.intro')}</p>
        <textarea id="restore-words" className="wide" rows={4} required autoFocus spellCheck={false} value={restoring} onChange={(e) => setRestoring(e.target.value)} />
        {/* An account from a computer comes with an invitation, as a new one does; a browser's account needs none. */}
        {bridge.web?.needsInvite() && (
          <div className="field-row-stacked">
            <label htmlFor="restore-invite">{t('web.restore.invite')}</label>
            <input id="restore-invite" spellCheck={false} onChange={(e) => bridge.web!.invite(e.target.value)} />
          </div>
        )}
        {bridge.web && busy && <p className="small muted">{t('web.restore.waiting')}</p>}
        {/* With a backup file, the words and the file are enough: everything it holds comes back, with nobody else online. */}
        {!bridge.web && <div className="field-row-stacked">
          <label htmlFor="restore-backup">{t('onboard.restore.backup')}</label>
          <div className="field-row">
            <input id="restore-backup" className="grow" spellCheck={false} placeholder={t('onboard.restore.backup.placeholder')} value={backupFile} onChange={(e) => setBackupFile(e.target.value)} />
            {bridge.pickFile && (
              <button type="button" onClick={async () => setBackupFile((await bridge.pickFile!(t('onboard.restore.backup.pick'))) ?? backupFile)}>
                {t('onboard.restore.backup.choose')}
              </button>
            )}
          </div>
          <p className="small muted">{t('onboard.restore.backup.why')}</p>
        </div>}
        <div className="buttons">
          <button type="button" onClick={() => setMode(bridge.web ? 'start' : 'create')}>
            {t('button.back')}
          </button>
          <button className="default" disabled={busy}>
            {t(busy ? 'onboard.restore.looking' : 'onboard.restore')}
          </button>
        </div>
      </form>,
    );

  // Weave Web: a link from the person's computer, pasted (the home-screen app on an iPhone, which no scanned code reaches).
  if (mode === 'paste' && !bridge.web?.linking())
    return window(
      t('web.paste.title'),
      <form
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          // Taken, the link screen comes next (linking()).
          if (await attempt(async () => (bridge.web!.pasteLink(pasted), true))) setMode('start');
        }}
      >
        <p>{t('web.paste.intro')}</p>
        <textarea id="paste-link" className="wide" rows={3} required autoFocus spellCheck={false} value={pasted} onChange={(e) => setPasted(e.target.value)} />
        <div className="buttons">
          <button type="button" onClick={() => setMode('start')}>
            {t('button.back')}
          </button>
          <button className="default" disabled={!pasted.trim()}>
            {t('button.continue')}
          </button>
        </div>
      </form>,
    );

  // Weave Web, opened with a link from one of the person's computers: this browser becomes theirs, no words asked.
  if (bridge.web?.linking())
    return window(
      t('web.link.title'),
      <form
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          setBusy(true);
          const ok = await attempt(() => bridge.web!.link().then(() => true));
          setBusy(false);
          if (ok) onDone();
        }}
      >
        <div className="welcome-head">
          <WeaveMark size={48} />
          <p>{t('web.link.intro')}</p>
        </div>
        {bridge.web.needsInvite() && (
          <div className="field-row-stacked">
            <label htmlFor="welcome-invite">{t('web.invite.label')}</label>
            <input id="welcome-invite" required spellCheck={false} onChange={(e) => bridge.web!.invite(e.target.value)} />
            <p className="small muted">{t('web.invite.why')}</p>
          </div>
        )}
        <div className="buttons">
          <button id="link-browser" className="default" disabled={busy}>
            {t(busy ? 'web.link.busy' : 'web.link.button')}
          </button>
        </div>
      </form>,
    );

  // Weave Web, first time in this browser: sign in with a passkey, make an account, or the words.
  if (mode === 'start') {
    const fromGame = !!invited && 'title' in invited;
    const passkey = async () => {
      setBusy(true);
      const ok = await attempt(() => bridge.web!.arrive().then(() => true));
      setBusy(false);
      if (ok) onDone();
    };
    return window(
      t('onboard.welcome'),
      <>
        <div className="welcome-head">
          <WeaveMark size={48} />
          {fromGame ? (
            <p>
              <b>{t('playlink.web.invited', { by: invited.by, title: invited.title })}</b>
              <br />
              {t('web.first.intro.game')}
            </p>
          ) : (
            <p>{t('web.first.intro')}</p>
          )}
        </div>
        {invited && 'welcome' in invited && invited.welcome && <p className="small">“{invited.welcome}”</p>}
        {invited && 'problem' in invited && <p className="notice">{t('playlink.web.problem', { problem: invited.problem })}</p>}
        <div className="first-ways">
          <button id="first-passkey" className={fromGame ? '' : 'default'} disabled={busy} onClick={() => void passkey()}>
            <Icon name="lock" /> {t('web.first.passkey')}
          </button>
          <p className="small muted">{t('web.first.passkey.why')}</p>
          <button id="first-create" className={fromGame ? 'default' : ''} disabled={busy} onClick={() => setMode('create')}>
            {t(fromGame ? 'playlink.web.create' : 'web.first.create')}
          </button>
          <button id="first-words" disabled={busy} onClick={() => setMode('restore')}>
            {t('web.first.words')}
          </button>
          <button id="first-link" disabled={busy} onClick={() => setMode('paste')}>
            {t('web.first.link')}
          </button>
        </div>
        <p className="notice">{t('web.link.hint')}</p>
      </>,
    );
  }

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
        {invited && 'title' in invited ? (
          <p>
            <b>{t('playlink.web.invited', { by: invited.by, title: invited.title })}</b>
            <br />
            {t('playlink.web.invited.how')}
          </p>
        ) : (
          <p>{t(bridge.web ? 'onboard.intro.web' : 'onboard.intro')}</p>
        )}
      </div>
      {invited && 'welcome' in invited && invited.welcome && <p className="small">“{invited.welcome}”</p>}
      {invited && 'problem' in invited && <p className="notice">{t('playlink.web.problem', { problem: invited.problem })}</p>}
      <div className="field-row-stacked">
        <label htmlFor="welcome-name">{t('onboard.name')}</label>
        <input id="welcome-name" required maxLength={40} autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      {bridge.web?.needsInvite() && (
        <div className="field-row-stacked">
          <label htmlFor="welcome-invite">{t('web.invite.label')}</label>
          <input id="welcome-invite" required spellCheck={false} onChange={(e) => bridge.web!.invite(e.target.value)} />
          <p className="small muted">{t('web.invite.why')}</p>
        </div>
      )}
      <div className="buttons">
        {!bridge.web && (
          <button type="button" onClick={() => setMode('company')}>
            {t('onboard.company.button')}
          </button>
        )}
        <button type="button" onClick={() => setMode(bridge.web ? 'start' : 'restore')}>
          {t(bridge.web ? 'button.back' : 'onboard.restore.button')}
        </button>
        <button className="default" disabled={busy}>
          {t(invited && 'title' in invited ? 'playlink.web.create' : 'onboard.create')}
        </button>
      </div>
    </form>,
  );
}

/** Weave Web: what opens this account, and leaving this browser. */
function WebAccountBox() {
  const { t } = useTexts();
  const { data: ways, reload } = useApi(() => bridge.web!.ways(), []);
  return (
    <fieldset>
      <legend>{t('web.ways.legend')}</legend>
      <p className="small">{t('web.ways.why')}</p>
      <table className="keys-table">
        <tbody>
          {(ways ?? []).map((way) => (
            <tr key={way}>
              <td>
                <Icon name="lock" />
              </td>
              <td>
                <b>{way === 'words' ? t('web.ways.words') : t('web.ways.passkey', { id: way.slice(0, 8) })}</b>
              </td>
              <td>
                {way !== 'words' && (
                  <AsyncButton onClick={async () => (await ask(t('web.ways.remove.ask'), t('web.ways.remove'))) && attempt(() => bridge.web!.removeWay(way).then(reload))}>
                    {t('web.ways.remove')}
                  </AsyncButton>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="buttons">
        <AsyncButton onClick={() => attempt(() => bridge.web!.addPasskey().then(reload), t('web.ways.added'))}>{t('web.ways.add')}</AsyncButton>
        <AsyncButton onClick={async () => void ((await ask(t('web.forget.ask'), t('web.forget.button'))) && (await attempt(() => bridge.web!.forget())))}>{t('web.forget.button')}</AsyncButton>
      </div>
    </fieldset>
  );
}

/** Weave Web: this browser's account, not opened yet. A passkey is asked right away by a click; the words always work. */
/** Weave Web: the account is open in another tab. This one can take it over. */
export function Elsewhere() {
  const { t } = useTexts();
  const [busy, setBusy] = useState(false);
  return (
    <div className="desktop">
      <div className="window welcome">
        <div className="title-bar">
          <div className="title-bar-text">{t('web.tab.title')}</div>
        </div>
        <div className="window-body">
          <div className="welcome-head">
            <WeaveMark size={48} />
            <p>{t('web.tab.intro')}</p>
          </div>
          <div className="buttons">
            <button id="take-over" className="default" disabled={busy} onClick={() => (setBusy(true), void bridge.web!.takeOver())}>
              {t('web.tab.take')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Unlock({ onDone }: { onDone: () => void }) {
  const { t } = useTexts();
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  // Words that don't open what's here: most likely another account's (one from a computer, say), and this browser
  // holds a different one. Then the way is to empty this browser first.
  const [other, setOther] = useState(false);
  const open = async (given?: string) => {
    setBusy(true);
    let wrong = false;
    const ok = await attempt(() =>
      bridge.web!.unlock(given).then(
        () => true,
        (error: Error) => {
          wrong = !!given && /doesn't open|isn't a way/.test(error.message);
          if (wrong) return false;
          throw error;
        },
      ),
    );
    setBusy(false);
    setOther(wrong);
    if (ok) onDone();
  };
  // With a passkey, asked for at once (back from a game, a new start): a browser that wants a tap first says no
  // quietly, and the button is there.
  const asked = useRef(false);
  // A link from a computer is waiting: the account here isn't the one wanted, so no passkey is asked for it.
  const linkWaiting = bridge.web!.linkWaiting();
  useEffect(() => {
    if (asked.current || !bridge.web!.passkey() || linkWaiting) return;
    asked.current = true;
    setBusy(true);
    bridge.web!.unlock().then(onDone, () => setBusy(false));
  }, []);
  return (
    <div className="desktop">
      <div className="window welcome">
        <div className="title-bar">
          <div className="title-bar-text">{t('web.unlock.title')}</div>
        </div>
        <div className="window-body">
          <div className="welcome-head">
            <WeaveMark size={48} />
            <p>{t('web.unlock.intro')}</p>
          </div>
          {linkWaiting && (
            <div className="notice">
              <p>{t('web.unlock.link')}</p>
              <div className="buttons">
                {/* The link stays in this tab (sessionStorage) across the reload, and the link screen comes next. */}
                <button id="empty-and-link" className="default" onClick={async () => void ((await ask(t('web.unlock.empty.ask'), t('web.unlock.empty'))) && (await attempt(() => bridge.web!.forget())))}>
                  {t('web.unlock.link.button')}
                </button>
              </div>
            </div>
          )}
          {bridge.web!.passkey() && (
            <div className="buttons">
              <button className={linkWaiting ? '' : 'default'} disabled={busy} onClick={() => void open()}>
                {t('web.unlock.passkey')}
              </button>
            </div>
          )}
          <form
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              void open(words);
            }}
          >
            <div className="field-row-stacked">
              <label htmlFor="unlock-words">{t('web.unlock.words')}</label>
              <textarea id="unlock-words" className="wide" rows={3} spellCheck={false} value={words} onChange={(e) => setWords(e.target.value)} />
            </div>
            {other && (
              <div className="notice">
                <p>{t('web.unlock.other')}</p>
                <div className="buttons">
                  <button id="empty-browser" type="button" onClick={async () => void ((await ask(t('web.unlock.empty.ask'), t('web.unlock.empty'))) && (await attempt(() => bridge.web!.forget())))}>
                    {t('web.unlock.empty')}
                  </button>
                </div>
              </div>
            )}
            <div className="buttons">
              <button disabled={busy || !words.trim()}>{t('web.unlock.open')}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
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
/** Who reaches this computer: people you know (the default), or anyone who finds it. */
function WhoReaches() {
  const { t } = useTexts();
  const { data: reach } = useApi(() => api<ReachInfo>('reach'), []);
  if (!reach) return null;
  const set = (anyone: boolean) => void attempt(() => api('setReach', { anyone }).then(bump), t('reach.saved'));
  return (
    <fieldset>
      <legend>{t('reach.legend')}</legend>
      <div className="field-row">
        <input id="reach-known" type="radio" name="reach" checked={!reach.anyone} onChange={() => set(false)} />
        <label htmlFor="reach-known">
          <b>{t('reach.known')}</b> <span className="small muted" style={{ marginLeft: '0.4em' }}>{t('reach.known.about')}</span>
        </label>
      </div>
      <div className="field-row">
        <input id="reach-anyone" type="radio" name="reach" checked={reach.anyone} onChange={() => set(true)} />
        <label htmlFor="reach-anyone">
          <b>{t('reach.anyone')}</b> <span className="small muted" style={{ marginLeft: '0.4em' }}>{t('reach.anyone.about')}</span>
        </label>
      </div>
    </fieldset>
  );
}

/** Your front door, while you have an always-on node: what it is, and its link to give anyone. */
function FrontDoor() {
  const { t } = useTexts();
  return (
    <div className="field-row">
      <Icon name="community" />
      <span className="grow">
        <b>{t('door.title')}</b> <span className="small">{t('door.on')}</span>{' '}
        <Info>
          <p>{t('door.info.what')}</p>
          <ul>
            <li>{t('door.info.who')}</li>
            <li>{t('door.info.see')}</li>
            <li>{t('door.info.not')}</li>
            <li>{t('door.info.off')}</li>
          </ul>
        </Info>
      </span>
      <AsyncButton onClick={async () => { const link = await attempt(() => api<string>('contactLink', { door: true })); if (link) await navigator.clipboard.writeText(link).then(() => toast(t('door.copied'))); }}>{t('door.copy')}</AsyncButton>
    </div>
  );
}

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
      {nodes.some((n) => n.revokedAfter === undefined) && <FrontDoor />}
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

/**
 * Your own backup: one file with everything this computer holds of your Weave, sealed with a key from your recovery
 * words. Nobody else can bring your data back, so this says when you last saved one, and saves the next.
 */
function BackupBox({ last }: { last?: string }) {
  const { t } = useTexts();
  const [saved, setSaved] = useState<BackupInfo>();
  const save = async () => {
    const folder = await bridge.pickFolder(t('backup.pick.folder'));
    if (!folder) return;
    const done = await attempt(() => api<BackupInfo>('saveBackup', { to: folder }));
    if (done) {
      setSaved(done);
      bump();
    }
  };
  return (
    <fieldset>
      <legend>{t('backup.legend')}</legend>
      <p className="small">{t('backup.about')}</p>
      <p className="small">
        {saved ? t('backup.saved', { file: saved.file, mb: (saved.bytes / 1048576).toFixed(1) }) : last ? t('backup.last', { time: ago(last) }) : <b>{t('backup.never')}</b>}
      </p>
      <div className="buttons">
        <AsyncButton className="default" onClick={save}>
          {t('backup.save')}
        </AsyncButton>
      </div>
      <p className="small muted">{t('backup.where')}</p>
    </fieldset>
  );
}

/**
 * The copies from before. Until 6.11.2026 friends kept sealed copies of each other's small spaces (keepers); now you
 * save your own backup, and nothing new is kept with anyone. This box is there only while such copies exist: friends
 * who still hold one of yours (you can let them go), and what you still hold for friends (you can let go of it).
 */
function CopiesBox({ keeping, backedUp }: { keeping: KeepersInfo; backedUp: boolean }) {
  const { t } = useTexts();
  const nameOf = (f: KeeperFriend) => f.who.name ?? shortDid(f.who.did);
  const mb = (bytes: number) => (bytes / 1048576).toFixed(1);
  // A computer on a Weave with keepers (a phone paired with one) lists nobody.
  const all = keeping.friends ?? [];
  const mayHold = (f: KeeperFriend) => (f.holds ? f.holds.items > 0 : !!f.before);
  const theirs = all.filter((f) => f.lettingGo || mayHold(f));
  const asked = theirs.filter((f) => !f.lettingGo);
  const holding = all.filter((f) => f.kept);
  const forUnknown = keeping.forUnknown ?? 0;
  if (!theirs.length && !keeping.forOthers) return null;
  // A phone shows where things stand; what goes is decided at the computer.
  const fixed = !!bridge.phone;
  const noBackup = backedUp ? '' : ` ${t('copies.no.backup')}`;
  const letGo = async (f?: KeeperFriend) =>
    (await ask(t('copies.let.go.ask', { names: (f ? [f] : asked).map(nameOf) }) + noBackup, t(f ? 'copies.let.go.one' : 'copies.let.go'))) && attempt(() => api('letCopiesGo', f ? { who: f.who.did } : {}).then(bump), t('copies.let.go.done'));
  const drop = async (f?: KeeperFriend) =>
    (await ask(f ? t('copies.drop.ask', { name: nameOf(f) }) : t('copies.drop.all.ask'), t('copies.drop'))) && attempt(() => api('dropKept', f ? { who: f.who.did } : {}).then(bump), t('copies.dropped'));
  return (
    <fieldset>
      <legend>{t('copies.legend')}</legend>
      <p className="small">{t('copies.about')}</p>
      {theirs.length > 0 && (
        <>
          <p className="small">{t('copies.yours', { count: theirs.length })}</p>
          <ul className="small copies-list">
            {theirs.map((f) => (
              <li key={f.who.did}>
                {nameOf(f)} <span className="muted">{f.lettingGo ? t('copies.letting.go') : f.holds ? t('copies.holds', { time: ago(f.holds.at) }) : t('copies.may.hold')}</span>{' '}
                {!fixed && !f.lettingGo && (
                  <AsyncButton className="link" onClick={() => letGo(f)}>
                    {t('copies.let.go.one')}
                  </AsyncButton>
                )}
              </li>
            ))}
          </ul>
          {!fixed && asked.length > 1 && (
            <div className="buttons">
              <AsyncButton onClick={() => letGo()}>{t('copies.let.go')}</AsyncButton>
            </div>
          )}
        </>
      )}
      {keeping.forOthers > 0 && (
        <>
          <p className="small">{t('copies.you.hold', { mb: mb(keeping.forOthers) })}</p>
          <ul className="small copies-list">
            {holding.map((f) => (
              <li key={f.who.did}>
                {t('copies.held.for', { name: nameOf(f), mb: mb(f.kept!.bytes), time: ago(f.kept!.asked) })}{' '}
                {!fixed && (
                  <AsyncButton className="link" onClick={() => drop(f)}>
                    {t('copies.drop')}
                  </AsyncButton>
                )}
              </li>
            ))}
            {forUnknown > 0 && <li>{t('copies.held.unknown', { mb: mb(forUnknown) })}</li>}
          </ul>
          <p className="small muted">{keeping.graceDays ? t('copies.grace', { months: Math.round(keeping.graceDays / 30.4) }) : ''}</p>
          {!fixed && (holding.length > 1 || forUnknown > 0) && (
            <div className="buttons">
              <AsyncButton onClick={() => drop()}>{t('copies.drop.all')}</AsyncButton>
            </div>
          )}
        </>
      )}
    </fieldset>
  );
}

export function KeysView() {
  const { t } = useTexts();
  const { data: info } = useApi(() => api<IdentityInfo>('identityInfo'), []);
  const { data: keys } = useApi(() => api<KeyInfo[]>('keys'), []);
  const { data: status } = useApi(() => api<Status>('status'), []);
  const web = !!bridge.web;
  const { data: keeping } = useApi(() => (web ? Promise.resolve(undefined) : api<KeepersInfo>('keepers')), []);
  // A company account has no recovery words: its company holds them.
  const { data: signIn } = useApi(() => api<SignInStatus>('signInStatus'), []);
  const company = signIn?.company ? (signIn.name ?? t('company.yours')) : undefined;
  const [dialog, setDialog] = useState<{ kind: 'revoke'; key: KeyInfo } | { kind: 'rotate' } | { kind: 'permissions'; key: KeyInfo & { name: string; permissions: string[] } } | { kind: 'avatar'; agent: string }>();
  const { data: me } = useApi(() => api<Profile>('profile'), []);
  if (!info || !keys) return <Page title={t('nav.keys')}>{null}</Page>;
  const keystoreWhy = status?.keystoreWarning ? /\((.*)\)$/.exec(status.keystoreWarning)?.[1] : undefined;
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
      {status && !web && (
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
      {!web && !company && info.recoverable && <BackupBox last={status?.lastBackup} />}
      {!web && keeping && <CopiesBox keeping={keeping} backedUp={!!status?.lastBackup} />}
      {!web && <WalletBox />}
      {web && <WebAccountBox />}
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
      {!bridge.phone && !web && <PhonesBox />}
      <WhoReaches />
      {/* What needs a computer that stays on, or its programs: not in a browser. */}
      {!web && (
        <>
          <LinkedBrowsers keys={keys} />
          <AlwaysOnNodes keys={keys} />
          <ServicesBox keys={keys} />
          <KeyvaultsBox />
          <FetchersBox />
          <AgentAppsBox />
        </>
      )}
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
