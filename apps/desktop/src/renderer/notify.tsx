import { useState } from 'react';
import type { Notice, NoticeCategory, PostInfo, SpaceRef } from '@weave/node/client';
import { api, bridge, navigate, onItem } from './lib.ts';
import { postHref, spaceHref } from './posts.tsx';
import { Modal } from './ui.tsx';

/*
 * System notifications for live events the node marked as a notice (see
 * Notice in @weave/node). Which kinds show is a setting of this app on this
 * computer. Nothing shows for the chat or post you're looking at, and a burst
 * (catching up after being offline) becomes one summary.
 */

export const NOTICE_CATEGORIES: Record<NoticeCategory, { label: string; hint: string }> = {
  messages: { label: 'Messages to you', hint: 'Direct messages, @mentions, replies to you and chat in your posts' },
  requests: { label: 'Requests for you', hint: 'Co-author requests, people asking to join or for a tier' },
  activity: { label: 'Project activity', hint: 'New posts, issues and proposals in your projects' },
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
  if (open.post) return postHref(await api<PostInfo>('post', open.post));
  return open.space ? channelHref(open.space, open.channel) : '#/';
}

/** You're looking right at it: the window has focus and shows that chat or post. */
function looking(open: Notice['open']): boolean {
  if (!document.hasFocus()) return false;
  const here = location.hash;
  if (open.post) return here.endsWith(`/${open.post}`);
  if (open.inbox) return here === '#/inbox';
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
  if (Notification.permission === 'default') void Notification.requestPermission();
  onItem((item) => {
    const notice = item.notice;
    if (!notice || !loadSettings()[notice.category] || Notification.permission !== 'granted' || looking(notice.open)) return;
    // An agent's request shows as a popup in the app (see agents.tsx): a notification only when Weave is in the background.
    if (notice.type === 'permission' && document.hasFocus()) return;
    pending.push(notice);
    clearTimeout(timer);
    timer = setTimeout(flush, 1200);
  });
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
