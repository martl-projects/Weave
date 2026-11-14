import { useEffect, useState, useSyncExternalStore } from 'react';
import type { BoardInfo, ChatInfo, HintServiceInfo, HintsAnswer, MemberInfo, Notice, NoticeCategory, PostInfo, SpaceInfo, SpaceRef } from '@weave/node/client';
import { api, bridge, navigate, onItem, shortDid, useApi } from './lib.ts';
import { postHref, spaceHref } from './posts.tsx';
import { ask, AsyncButton, attempt, Modal, ServiceOrigin, toast } from './ui.tsx';
import { has, t, useTexts } from './texts.tsx';

/*
 * System notifications for live events the node marked as a notice (see
 * Notice in @weave/node). Which kinds show is a setting of this app on this
 * computer. Nothing shows for the chat or post you're looking at, and a burst
 * (catching up after being offline) becomes one summary.
 *
 * Notices also count: a number next to the chat, project or board in Places
 * until you open it, so you see who wrote after a notification went by. The
 * numbers are hints (docs/v2-stage20.md): Unread, a hint service Weave ships,
 * counts on the node, and what you opened is sealed to you, so every device of
 * yours counts alike. Rules say, for a person, a place or a board, whether it
 * counts and notifies: Unread's settings, kept the same way.
 */

/** The kinds of notices, in the settings' order; their texts are notice.cat.<kind> and notice.cat.<kind>.hint. */
export const NOTICE_CATEGORIES: NoticeCategory[] = ['messages', 'requests', 'activity'];

type Settings = Record<NoticeCategory, boolean>;
const KEY = 'weave.notify';
const DEFAULTS: Settings = { messages: true, requests: true, activity: true };

export function loadSettings(): Settings {
  try {
    return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {}
}

/** Where a channel lives in the app; a project's general channel is its front page. */
function channelHref(space: SpaceRef, channel = 'general'): string {
  if (space.kind === 'direct') return `#/d/${space.id}`;
  if (space.kind === 'project' && channel === 'general') return spaceHref(space);
  return `${spaceHref(space)}/c/${channel}`;
}

async function hrefOf(open: Notice['open']): Promise<string> {
  if (open.inbox) return '#/inbox';
  if (open.hub) return `#/space/${encodeURIComponent(open.hub)}`;
  if (open.post) return postHref(await api<PostInfo>('post', open.post));
  return open.space ? channelHref(open.space, open.channel) : '#/';
}

/** You're looking right at it: the window has focus and shows that chat or post. */
function looking(open: Notice['open']): boolean {
  if (!document.hasFocus()) return false;
  const here = location.hash;
  if (open.post) return here.endsWith(`/${open.post}`);
  if (open.inbox) return here === '#/inbox';
  if (open.hub) return here === `#/space/${encodeURIComponent(open.hub)}`;
  return !!open.space && here === channelHref(open.space, open.channel);
}

function show(title: string, text: string, open: Notice['open']): void {
  const notification = new Notification(title, { body: text, silent: false });
  notification.onclick = () => {
    notification.close();
    void bridge.show();
    void hrefOf(open).then(navigate, () => navigate('#/'));
  };
}

/** A notice's two lines in the reader's language: by its name when the package has it (and `<name>.text` for the second), else the node's English. */
export function noticeLines(notice: Notice): { title: string; text: string } {
  const name = notice.name;
  return {
    title: name && has(name) ? t(name, notice.values) : notice.title,
    text: name && has(`${name}.text`) ? t(`${name}.text`, notice.values).trim() : notice.text,
  };
}

let pending: Notice[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

/** Show what came in over the last moment: one notification, or a summary of several. */
function flush(): void {
  const notices = pending;
  pending = [];
  if (!notices.length) return;
  void bridge.attention();
  if (notices.length === 1) {
    const { title, text } = noticeLines(notices[0]);
    return show(title, text, notices[0].open);
  }
  const requests = notices.every((n) => n.category === 'requests');
  show(t('notify.summary', { n: notices.length }), notices.slice(0, 3).map((n) => noticeLines(n).title).join('\n') + (notices.length > 3 ? '\n…' : ''), requests ? { inbox: true } : {});
}

let started = false;

/** Start listening for notices; once per app. */
export function startNotifications(): void {
  // Weave Web: a push that came while Weave was open and seen (the service worker hands it here): said in the app.
  if (!started && bridge.web) window.addEventListener('weave-push', (event) => {
    const notice = (event as CustomEvent<{ title?: string; text?: string }>).detail;
    if (notice?.title) toast(notice.text ? `${notice.title}: ${notice.text}` : notice.title);
  });
  if (started || typeof Notification === 'undefined') return;
  started = true;
  // What you open stops counting; so does what was open while the window was in the background.
  window.addEventListener('hashchange', () => clear());
  window.addEventListener('focus', () => clear());
  if (Notification.permission === 'default') void Notification.requestPermission();
  void loadRulesFromNode();
  onItem((item) => {
    if (item.kind === 'weave.hints') void loadRulesFromNode();
    const notice = item.notice;
    if (!notice) return;
    const rule = ruleFor(notice);
    // Counted on the node: what you're looking at is seen at once.
    if (looking(notice.open)) clear(true);
    if (!(rule ? rule.notify : loadSettings()[notice.category]) || Notification.permission !== 'granted' || looking(notice.open)) return;
    // An agent's request shows as a popup in the app (see agents.tsx): a notification only when Weave is in the background.
    if (notice.type === 'permission' && document.hasFocus()) return;
    pending.push(notice);
    clearTimeout(timer);
    timer = setTimeout(flush, 1200);
  });
}

// ---------------------------------------------------------------- rules: who and where counts and notifies

export interface NoticeRule {
  /** From this person (a did); anyone when missing. */
  who?: string;
  /** In this space (an id); anywhere when missing. */
  space?: string;
  /** In this board of the space; any when missing. */
  board?: string;
  /** A number next to the place in Places. */
  count: boolean;
  /** A notification on this computer. */
  notify: boolean;
}

/** The hint service Weave ships that counts notices: its settings are the rules. */
const UNREAD = 'weave-unread';
/** Where rules were kept before they were Unread's (this computer only): moved over once. */
const OLD_RULES_KEY = 'weave.notify.rules';

let rules: NoticeRule[] = [];
let unread: HintServiceInfo | undefined;

/** The rules as Unread keeps them (sealed to you); ones this computer kept before move over once. */
async function loadRulesFromNode(): Promise<void> {
  const services = await api<HintServiceInfo[]>('hintServices').catch(() => undefined);
  if (!services) return;
  unread = services.find((s) => s.service === UNREAD);
  const kept = (unread?.settings as { rules?: unknown } | undefined)?.rules;
  rules = Array.isArray(kept) ? (kept as NoticeRule[]) : [];
  let old: unknown = [];
  try {
    old = JSON.parse(localStorage.getItem(OLD_RULES_KEY) ?? '[]');
  } catch {}
  if (unread && !rules.length && Array.isArray(old) && old.length) await saveRules(old as NoticeRule[]);
  try {
    localStorage.removeItem(OLD_RULES_KEY);
  } catch {}
}

export function loadRules(): NoticeRule[] {
  return rules;
}

async function saveRules(next: NoticeRule[]): Promise<void> {
  rules = next;
  const settings = (unread?.settings && typeof unread.settings === 'object' && !Array.isArray(unread.settings) ? unread.settings : {}) as Record<string, unknown>;
  unread = await api<HintServiceInfo>('setHints', { service: UNREAD, settings: { ...settings, rules: next } });
}

/** The rule for a notice: the most specific one that matches (a person over a place, a board over its space); a later one wins a tie. */
export function ruleFor(notice: Notice, rules = loadRules()): NoticeRule | undefined {
  let best: NoticeRule | undefined;
  let score = -1;
  for (const rule of rules) {
    if ((rule.who && rule.who !== notice.from) || (rule.space && rule.space !== notice.open.space?.id) || (rule.board && rule.board !== notice.board)) continue;
    const s = (rule.who ? 4 : 0) + (rule.space ? 2 : 0) + (rule.board ? 1 : 0);
    if (s >= score) [best, score] = [rule, s];
  }
  return best;
}

// ---------------------------------------------------------------- hints: next to places in Places, on messages

type HintSubject = HintsAnswer['subject'];
type HintSlot = 'place' | 'message';

const hintKey = (s: HintSubject): string =>
  'space' in s ? `space:${s.space}` : 'board' in s ? `board:${s.board.space}/${s.board.name}` : 'channel' in s ? `channel:${s.channel.space}/${s.channel.name}` : `message:${s.message.space}/${s.message.id}`;

/** What your hint services say about one place or message, together: counts add up, the first tint wins, signs side by side. */
export interface Shown {
  count: number;
  tone?: string;
  signs: Array<{ sign: string; tooltip?: string }>;
  /** Why it's tinted. */
  tooltip?: string;
}
const NOTHING: Shown = { count: 0, signs: [] };

function together(hints: HintsAnswer['hints']): Shown {
  const tint = hints.find((h) => h.kind === 'tint');
  const signs = hints.filter((h) => h.kind === 'sign' && h.sign).map((h) => ({ sign: h.sign!, ...(h.tooltip ? { tooltip: h.tooltip } : {}) }));
  return {
    count: hints.reduce((sum, h) => sum + (h.count ?? 0), 0),
    ...(tint ? { tone: tint.tone, ...(tint.tooltip ? { tooltip: tint.tooltip } : {}) } : {}),
    signs: signs.filter((x, i) => signs.findIndex((y) => y.sign === x.sign) === i).slice(0, 3),
  };
}

/** Something to show: a number, a tint or a sign. */
export const showsAnything = (s: Shown): boolean => !!s.count || !!s.tone || s.signs.length > 0;

/*
 * Asked again only when the node says what the hint services say may have changed (weave.hints: a notice came in,
 * you opened something, the services or their rules changed); each render's asks go in one batch.
 */
let version = 0;
const versionListeners = new Set<() => void>();
onItem((item) => {
  if (item.kind !== 'weave.hints') return;
  version++;
  for (const listener of versionListeners) listener();
});
const useHintsVersion = () =>
  useSyncExternalStore(
    (listener) => {
      versionListeners.add(listener);
      return () => versionListeners.delete(listener);
    },
    () => version,
  );

/** The latest per place or message, as last answered (the keys say which: space:, board:, channel:, message:). */
const shown = new Map<string, Shown>();
const answeredAt = new Map<string, number>();
type Batch = { subjects: Map<string, HintSubject>; done: Array<() => void> };
const batches = new Map<HintSlot, Batch>();

function askHints(slot: HintSlot, tick: number, subjects: HintSubject[]): Promise<void> {
  if (subjects.every((s) => answeredAt.get(hintKey(s)) === tick)) return Promise.resolve();
  return new Promise((resolve) => {
    let b = batches.get(slot);
    if (!b) {
      const fresh: Batch = (b = { subjects: new Map(), done: [] });
      batches.set(slot, fresh);
      queueMicrotask(() => {
        batches.delete(slot);
        api<HintsAnswer[]>('hints', { slot, subjects: [...fresh.subjects.values()] })
          .then((answers) => {
            for (const a of answers) {
              shown.set(hintKey(a.subject), together(a.hints));
              answeredAt.set(hintKey(a.subject), tick);
            }
          })
          .catch(() => {})
          .finally(() => fresh.done.forEach((done) => done()));
      });
    }
    for (const s of subjects) b.subjects.set(hintKey(s), s);
    b.done.push(() => resolve());
  });
}

/** What your hint services say about these places or messages (Unread: notices waiting there), in the same order. */
export function useHints(slot: HintSlot, subjects: HintSubject[]): Shown[] {
  const tick = useHintsVersion();
  const keys = subjects.map(hintKey);
  const [, rerender] = useState(0);
  useEffect(() => {
    let alive = true;
    void askHints(slot, tick, subjects).then(() => alive && rerender((n) => n + 1));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, tick, keys.join('|')]);
  return keys.map((k) => shown.get(k) ?? NOTHING);
}

const SIGN_CHARS: Record<string, string> = { heart: '\u2665', star: '\u2605', flag: '\u2691', bell: '\u{1F514}' };

/** The signs your hint services give a place or a message, drawn in the app's look. */
export function HintSigns({ signs }: { signs: Shown['signs'] }) {
  if (!signs.length) return null;
  return (
    <span className="hint-signs">
      {signs.map((s) => (
        <span key={s.sign} className={`hint-sign sign-${s.sign}`} title={s.tooltip}>
          {SIGN_CHARS[s.sign] ?? ''}
        </span>
      ))}
    </span>
  );
}

const route = () => decodeURIComponent(location.hash).replace(/^#\/?/, '').split('/').filter(Boolean);

/**
 * You opened what this route shows: a chat, a channel, a board or a post. Said to the node only when something waits
 * there (or, force, a notice for it just came in: its count may not be here yet).
 */
function clearSeen([kind, id, view, arg, post]: string[], force = false): void {
  if (!id || !['d', 'p', 'r', 'g'].includes(kind)) return;
  if (!force && !showsAnything(shown.get(`space:${id}`) ?? NOTHING)) return;
  const seen =
    kind === 'd'
      ? { view: 'all' }
      : !view
        ? { view: 'channel', name: 'general' }
        : view === 'c'
          ? { view: 'channel', name: arg ?? 'general' }
          : view === 'b'
            ? post
              ? { view: 'post', name: post }
              : { view: 'board', name: arg }
            : view === 'post'
              ? { view: 'post', name: arg }
              : undefined;
  if (seen) void api('seen', { space: id, ...seen }).catch(() => {});
}

const clear = (force = false) => clearSeen(route(), force);

/** What a rule does, in the picker's order; the texts are rule.does.<key>. */
const DOES = ['both', 'count', 'notify', 'none'] as const;
type Does = (typeof DOES)[number];
const doesOf = (r: NoticeRule): Does => (r.count ? (r.notify ? 'both' : 'count') : r.notify ? 'notify' : 'none');

/** One rule: from whom, where, and what it does. */
function RuleRow({ rule, spaces, people, onChange, onRemove }: { rule: NoticeRule; spaces: SpaceInfo[]; people: Map<string, string>; onChange(rule: NoticeRule): void; onRemove(): void }) {
  const space = spaces.find((s) => s.id === rule.space);
  const { data: boards } = useApi(() => (space && (space.kind === 'project' || space.kind === 'community') ? api<BoardInfo[]>('boards', space.id) : Promise.resolve([])), [space?.id]);
  const { data: members } = useApi(() => (space ? api<MemberInfo[]>('members', space.id) : Promise.resolve([])), [space?.id]);
  const { t } = useTexts();
  const who = new Map(people);
  for (const m of members ?? []) if (!who.has(m.did)) who.set(m.did, m.name ?? shortDid(m.did));
  if (rule.who && !who.has(rule.who)) who.set(rule.who, shortDid(rule.who));
  return (
    <div className="field-row notice-rule">
      <select aria-label={t('rule.from')} value={rule.who ?? ''} onChange={(e) => onChange({ ...rule, who: e.target.value || undefined })}>
        <option value="">{t('rule.anyone')}</option>
        {[...who].map(([did, name]) => (
          <option key={did} value={did}>
            {name}
          </option>
        ))}
      </select>
      <select aria-label={t('rule.in')} value={rule.space ?? ''} onChange={(e) => onChange({ ...rule, space: e.target.value || undefined, board: undefined })}>
        <option value="">{t('rule.anywhere')}</option>
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select aria-label={t('word.board')} value={rule.board ?? ''} disabled={!boards?.length} onChange={(e) => onChange({ ...rule, board: e.target.value || undefined })}>
        <option value="">{t('rule.any.board')}</option>
        {(boards ?? []).map((b) => (
          <option key={b.name} value={b.name}>
            {b.title}
          </option>
        ))}
      </select>
      <select aria-label={t('rule.does')} value={doesOf(rule)} onChange={(e) => onChange({ ...rule, count: ['both', 'count'].includes(e.target.value), notify: ['both', 'notify'].includes(e.target.value) })}>
        {DOES.map((k) => (
          <option key={k} value={k}>
            {t(`rule.does.${k}`)}
          </option>
        ))}
      </select>
      <button type="button" title={t('rule.remove')} onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}

/** Rules for who and where: counts next to names, notifications, or neither. */
function NoticeRules() {
  const [rules, setRules] = useState(loadRules);
  useEffect(() => void loadRulesFromNode().then(() => setRules(loadRules())), []);
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const { data: chats } = useApi(() => api<ChatInfo[]>('chats'), []);
  const people = new Map((chats ?? []).map((c) => [c.peer.did, c.peer.name ?? shortDid(c.peer.did)]));
  const { t } = useTexts();
  const change = (next: NoticeRule[]) => {
    setRules(next);
    void saveRules(next).catch(() => setRules(loadRules()));
  };
  return (
    <>
      <p>
        {t('rules.title')} <span className="small muted">{t('rules.hint')}</span>
      </p>
      {rules.map((rule, i) => (
        <RuleRow
          key={i}
          rule={rule}
          spaces={(spaces ?? []).filter((s) => !s.closed)}
          people={people}
          onChange={(r) => change(rules.map((x, j) => (j === i ? r : x)))}
          onRemove={() => change(rules.filter((_, j) => j !== i))}
        />
      ))}
      <div className="field-row">
        <span className="small grow">{t('rules.default')}</span>
        <button type="button" onClick={() => change([...rules, { count: true, notify: true }])}>
          {t('rules.add')}
        </button>
      </div>
    </>
  );
}

/** Where a hint service comes from, in its title: Weave's own (checked by its digest), or a project's release. */
function HintOrigin({ service: s }: { service: HintServiceInfo }) {
  return <ServiceOrigin shipped={s.shipped} project={s.project?.name} tag={s.tag} />;
}

/** A hint service's settings as JSON (Unread's are the rules above): sealed to you, so every device of yours shows alike. */
function HintSettings({ service, onSaved }: { service: HintServiceInfo; onSaved(): void }) {
  const { t } = useTexts();
  const [text, setText] = useState(() => JSON.stringify(service.settings ?? {}, null, 2));
  const [problem, setProblem] = useState('');
  const save = async () => {
    let settings: unknown;
    try {
      settings = JSON.parse(text);
    } catch {
      return setProblem(t('hints.not.json'));
    }
    setProblem('');
    await attempt(() => api('setHints', { service: service.service, settings }), t('hints.saved', { name: service.name })).then(onSaved);
  };
  return (
    <div className="hint-settings">
      <textarea rows={8} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} />
      {problem && <div className="small error">{problem}</div>}
      <AsyncButton onClick={save}>{t('button.save')}</AsyncButton>
    </div>
  );
}

/** The hint services whose counts, tints and signs show in Places and chats: Weave's own, and any a project released that you took in. */
function HintServices() {
  const [editing, setEditing] = useState('');
  const mine = useApi(() => api<HintServiceInfo[]>('hintServices', { off: true }), []);
  const spaces = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const [project, setProject] = useState('');
  const { t } = useTexts();
  const projects = (spaces.data ?? []).filter((s) => s.kind === 'project');
  // Your yes to exactly that release, as for a keyvault or fetcher: a newer one asks again.
  const yes = (what: string) => ask(t('hints.take.in', { what }), t('service.take.it.in'));
  const add = async () => {
    if (!(await yes(t('hints.newest', { project: projects.find((p) => p.id === project)?.name ?? t('project.the') })))) return;
    await attempt(() => api('addHints', { project, approve: true }), t('service.taken.in')).then(() => (setProject(''), mine.reload()));
  };
  const update = async (s: HintServiceInfo) => {
    if (!s.project || !s.newer || !(await yes(t('service.released.in', { name: s.name, tag: s.newer, project: s.project.name ?? s.project.id })))) return;
    await attempt(() => api('addHints', { project: s.project!.id, app: s.service, tag: s.newer, approve: true }), t('service.yours.now', { name: s.name, tag: s.newer })).then(mine.reload);
  };
  return (
    <fieldset>
      <legend>{t('hints.legend')}</legend>
      <p className="small muted">{t('hints.about')}</p>
      {mine.error && <p className="error">{mine.error}</p>}
      {(mine.data ?? []).map((s) => (
        <div className="marks-row" key={s.service}>
          <div>
            <b>{s.name}</b> <HintOrigin service={s} /> <span className="small muted">{s.shipped ? t(s.off ? 'service.weave.ships.off' : 'service.weave.ships') : s.tag}</span>
            {s.problem && <div className="small error">{t('hints.counts.nothing', { problem: s.problem })}</div>}
            {s.newer && (
              <div className="small">
                {t('service.newer.out', { tag: s.newer })} <AsyncButton onClick={() => update(s)}>{t('service.update')}</AsyncButton>
              </div>
            )}
          </div>
          {s.off ? (
            <AsyncButton onClick={() => attempt(() => api('addHints', { shipped: s.service }), t('service.is.back', { name: s.name })).then(mine.reload)}>{t('service.turn.on')}</AsyncButton>
          ) : (
            <span>
              {s.service !== UNREAD && <button onClick={() => setEditing(editing === s.service ? '' : s.service)}>{t('service.settings')}</button>}{' '}
              <AsyncButton onClick={() => attempt(() => api('removeHints', { service: s.service }), t('service.removed', { name: s.name })).then(mine.reload)}>{t(s.shipped ? 'service.turn.off' : 'button.remove')}</AsyncButton>
            </span>
          )}
          {editing === s.service && !s.off && <HintSettings service={s} onSaved={() => (setEditing(''), mine.reload())} />}
        </div>
      ))}
      <div className="marks-row">
        <select value={project} onChange={(e) => setProject(e.target.value)}>
          <option value="">{t('hints.take.from')}</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <AsyncButton onClick={add} disabled={!project}>
          {t('button.add')}
        </AsyncButton>
      </div>
    </fieldset>
  );
}

/**
 * Weave Web: pushes to this device while Weave is closed (docs/web-push.md). Whoever writes to you seals them to this
 * device's push key; your storage node only passes them on.
 */
function WebPushBox() {
  const { t } = useTexts();
  const { data: state, reload } = useApi(() => bridge.web!.push.state(), []);
  return (
    <fieldset>
      <legend>{t('push.legend')}</legend>
      <p className="small">{state ? t(`push.state.${state}`) : '…'}</p>
      <p className="small muted">{t('push.why')}</p>
      <div className="buttons">
        {state === 'off' && (
          <AsyncButton className="push-on" onClick={() => attempt(() => bridge.web!.push.enable().then(reload), t('push.on.done'))}>
            {t('push.on')}
          </AsyncButton>
        )}
        {state === 'on' && (
          <>
            <AsyncButton className="push-test" onClick={() => attempt(() => bridge.web!.push.test({ title: t('push.test.title'), text: t('push.test.text') }), t('push.test.sent'))}>
              {t('push.test')}
            </AsyncButton>
            <AsyncButton onClick={() => attempt(() => bridge.web!.push.disable().then(reload))}>{t('push.off')}</AsyncButton>
          </>
        )}
      </div>
    </fieldset>
  );
}

/** View → Notifications…: which kinds of notices show on this computer. */
export function NotificationSettings({ onClose }: { onClose(): void }) {
  const { t } = useTexts();
  const [settings, setSettings] = useState(loadSettings);
  const allowed = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  const toggle = (category: NoticeCategory) => {
    const next = { ...settings, [category]: !settings[category] };
    setSettings(next);
    saveSettings(next);
  };
  return (
    <Modal title={t('notify.title')} onClose={onClose}>
      {bridge.web && <WebPushBox />}
      <p>{t('notify.show.for')}</p>
      {NOTICE_CATEGORIES.map((category) => (
        <div className="field-row notify-row" key={category}>
          <input type="checkbox" id={`notify-${category}`} checked={settings[category]} onChange={() => toggle(category)} />
          <label htmlFor={`notify-${category}`}>
            {t(`notice.cat.${category}`)}
            <span className="small muted"> · {t(`notice.cat.${category}.hint`)}</span>
          </label>
        </div>
      ))}
      <NoticeRules />
      <HintServices />
      <p className="small">{t('notify.nothing.looking')}</p>
      {allowed === 'denied' && <p className="small">{t('notify.blocked')}</p>}
      {allowed === 'unsupported' && <p className="small">{t('notify.unsupported')}</p>}
      <div className="buttons">
        {allowed === 'granted' && (
          <button type="button" onClick={() => show(t('notify.test.title'), t('notify.test.text'), {})}>
            {t('notify.test')}
          </button>
        )}
        <button className="default" onClick={onClose}>
          {t('button.done')}
        </button>
      </div>
    </Modal>
  );
}
