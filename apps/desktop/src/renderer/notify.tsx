import { useState } from 'react';
import type { BoardInfo, ChatInfo, MemberInfo, Notice, NoticeCategory, PostInfo, SpaceInfo, SpaceRef } from '@weave/node/client';
import { api, bridge, bump, navigate, onItem, shortDid, useApi } from './lib.ts';
import { postHref, spaceHref } from './posts.tsx';
import { Modal } from './ui.tsx';

/*
 * System notifications for live events the node marked as a notice (see
 * Notice in @weave/node). Which kinds show is a setting of this app on this
 * computer. Nothing shows for the chat or post you're looking at, and a burst
 * (catching up after being offline) becomes one summary.
 *
 * Notices also count: a number next to the chat, project or board in Places
 * until you open it, so you see who wrote after a notification went by.
 * Rules say, for a person, a place or a board, whether it counts and notifies.
 */

export const NOTICE_CATEGORIES: Record<NoticeCategory, { label: string; hint: string }> = {
  messages: { label: 'Messages to you', hint: 'Direct messages, @mentions, replies to you and chat in your posts' },
  requests: { label: 'Requests for you', hint: 'Co-author requests, people asking to join or for a tier' },
  activity: { label: 'New posts', hint: 'In communities you follow, and in the boards you follow in your projects' },
};

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

let pending: Notice[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

/** Show what came in over the last moment: one notification, or a summary of several. */
function flush(): void {
  const notices = pending;
  pending = [];
  if (!notices.length) return;
  void bridge.attention();
  if (notices.length === 1) return show(notices[0].title, notices[0].text, notices[0].open);
  const requests = notices.every((n) => n.category === 'requests');
  show(`${notices.length} new in Weave`, notices.slice(0, 3).map((n) => n.title).join('\n') + (notices.length > 3 ? '\n…' : ''), requests ? { inbox: true } : {});
}

let started = false;

/** Start listening for notices; once per app. */
export function startNotifications(): void {
  if (started || typeof Notification === 'undefined') return;
  started = true;
  // What you open stops counting; so does what was open while the window was in the background.
  const clear = () => clearSeen(route());
  window.addEventListener('hashchange', clear);
  window.addEventListener('focus', clear);
  if (Notification.permission === 'default') void Notification.requestPermission();
  onItem((item) => {
    const notice = item.notice;
    if (!notice) return;
    const rule = ruleFor(notice);
    if ((rule ? rule.count : notice.category === 'messages') && !looking(notice.open)) count(notice);
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

const RULES_KEY = 'weave.notify.rules';

export function loadRules(): NoticeRule[] {
  try {
    const rules = JSON.parse(localStorage.getItem(RULES_KEY) ?? '[]');
    return Array.isArray(rules) ? rules : [];
  } catch {
    return [];
  }
}

function saveRules(rules: NoticeRule[]): void {
  try {
    localStorage.setItem(RULES_KEY, JSON.stringify(rules));
  } catch {}
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

// ---------------------------------------------------------------- counts next to names in Places

interface Counted {
  space: string;
  board?: string;
  channel?: string;
  post?: string;
  time: string;
}

const COUNTS_KEY = 'weave.counts';

function readCounted(): Counted[] {
  try {
    const list = JSON.parse(localStorage.getItem(COUNTS_KEY) ?? '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function writeCounted(list: Counted[]): void {
  try {
    localStorage.setItem(COUNTS_KEY, JSON.stringify(list.slice(-500)));
  } catch {}
  bump();
}

function count(notice: Notice): void {
  const { space, channel, post } = notice.open;
  if (!space) return;
  writeCounted([...readCounted(), { space: space.id, ...(notice.board ? { board: notice.board } : {}), ...(channel ? { channel } : {}), ...(post ? { post } : {}), time: new Date().toISOString() }]);
}

/** How many notices wait in a space, or in one board or channel of it. */
export function countIn(space: string, where: { board?: string; channel?: string } = {}): number {
  return readCounted().filter((c) => c.space === space && (!where.board || c.board === where.board) && (!where.channel || (!c.post && (c.channel ?? 'general') === where.channel))).length;
}

const route = () => decodeURIComponent(location.hash).replace(/^#\/?/, '').split('/').filter(Boolean);

/** Forget the counts for what this route shows: a chat, a channel, a board or a post. */
function clearSeen([kind, id, view, arg, post]: string[]): void {
  if (!id || !['d', 'p', 'r', 'g'].includes(kind)) return;
  const shown = (c: Counted): boolean => {
    if (c.space !== id) return false;
    if (kind === 'd') return true;
    if (!view) return !c.post && (c.channel ?? 'general') === 'general';
    if (view === 'c') return !c.post && (c.channel ?? 'general') === arg;
    if (view === 'b') return post ? c.post === post : c.board === arg;
    if (view === 'post') return c.post === arg;
    return false;
  };
  const list = readCounted();
  const rest = list.filter((c) => !shown(c));
  if (rest.length !== list.length) writeCounted(rest);
}

const DOES = { both: 'Count and notify', count: 'Count only', notify: 'Notify only', none: 'Nothing' } as const;
type Does = keyof typeof DOES;
const doesOf = (r: NoticeRule): Does => (r.count ? (r.notify ? 'both' : 'count') : r.notify ? 'notify' : 'none');

/** One rule: from whom, where, and what it does. */
function RuleRow({ rule, spaces, people, onChange, onRemove }: { rule: NoticeRule; spaces: SpaceInfo[]; people: Map<string, string>; onChange(rule: NoticeRule): void; onRemove(): void }) {
  const space = spaces.find((s) => s.id === rule.space);
  const { data: boards } = useApi(() => (space && (space.kind === 'project' || space.kind === 'community') ? api<BoardInfo[]>('boards', space.id) : Promise.resolve([])), [space?.id]);
  const { data: members } = useApi(() => (space ? api<MemberInfo[]>('members', space.id) : Promise.resolve([])), [space?.id]);
  const who = new Map(people);
  for (const m of members ?? []) if (!who.has(m.did)) who.set(m.did, m.name ?? shortDid(m.did));
  if (rule.who && !who.has(rule.who)) who.set(rule.who, shortDid(rule.who));
  return (
    <div className="field-row notice-rule">
      <select aria-label="From" value={rule.who ?? ''} onChange={(e) => onChange({ ...rule, who: e.target.value || undefined })}>
        <option value="">Anyone</option>
        {[...who].map(([did, name]) => (
          <option key={did} value={did}>
            {name}
          </option>
        ))}
      </select>
      <select aria-label="In" value={rule.space ?? ''} onChange={(e) => onChange({ ...rule, space: e.target.value || undefined, board: undefined })}>
        <option value="">Anywhere</option>
        {spaces.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select aria-label="Board" value={rule.board ?? ''} disabled={!boards?.length} onChange={(e) => onChange({ ...rule, board: e.target.value || undefined })}>
        <option value="">Any board</option>
        {(boards ?? []).map((b) => (
          <option key={b.name} value={b.name}>
            {b.title}
          </option>
        ))}
      </select>
      <select aria-label="Does" value={doesOf(rule)} onChange={(e) => onChange({ ...rule, count: ['both', 'count'].includes(e.target.value), notify: ['both', 'notify'].includes(e.target.value) })}>
        {(Object.keys(DOES) as Does[]).map((k) => (
          <option key={k} value={k}>
            {DOES[k]}
          </option>
        ))}
      </select>
      <button type="button" title="Remove this rule" onClick={onRemove}>
        ✕
      </button>
    </div>
  );
}

/** Rules for who and where: counts next to names, notifications, or neither. */
function NoticeRules() {
  const [rules, setRules] = useState(loadRules);
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const { data: chats } = useApi(() => api<ChatInfo[]>('chats'), []);
  const people = new Map((chats ?? []).map((c) => [c.peer.did, c.peer.name ?? shortDid(c.peer.did)]));
  const change = (next: NoticeRule[]) => {
    setRules(next);
    saveRules(next);
  };
  return (
    <>
      <p>
        Rules <span className="small muted">· the most specific one wins: a person over a place, a board over its project</span>
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
        <span className="small grow">Without a rule, messages to you count (a number next to the chat or place, until you open it) and the kinds above notify.</span>
        <button type="button" onClick={() => change([...rules, { count: true, notify: true }])}>
          Add rule
        </button>
      </div>
    </>
  );
}

/** View → Notifications…: which kinds of notices show on this computer. */
export function NotificationSettings({ onClose }: { onClose(): void }) {
  const [settings, setSettings] = useState(loadSettings);
  const allowed = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  const toggle = (category: NoticeCategory) => {
    const next = { ...settings, [category]: !settings[category] };
    setSettings(next);
    saveSettings(next);
  };
  return (
    <Modal title="Notifications" onClose={onClose}>
      <p>Show a notification on this computer for:</p>
      {(Object.keys(NOTICE_CATEGORIES) as NoticeCategory[]).map((category) => (
        <div className="field-row notify-row" key={category}>
          <input type="checkbox" id={`notify-${category}`} checked={settings[category]} onChange={() => toggle(category)} />
          <label htmlFor={`notify-${category}`}>
            {NOTICE_CATEGORIES[category].label}
            <span className="small muted"> · {NOTICE_CATEGORIES[category].hint}</span>
          </label>
        </div>
      ))}
      <NoticeRules />
      <p className="small">
        Nothing shows for the chat or post you're looking at. Closing the window keeps Weave running in the tray, so notifications keep coming; quit from the tray icon.
      </p>
      {allowed === 'denied' && <p className="small">Notifications are blocked for Weave in your system or browser settings.</p>}
      {allowed === 'unsupported' && <p className="small">This browser can't show notifications.</p>}
      <div className="buttons">
        {allowed === 'granted' && (
          <button type="button" onClick={() => show('Weave notifications work', 'This is how messages, requests and project activity will show.', {})}>
            Test
          </button>
        )}
        <button className="default" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
