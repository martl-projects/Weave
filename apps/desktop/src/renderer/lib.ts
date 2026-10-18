import DOMPurify from 'dompurify';
import { marked } from 'marked';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Theme } from '@weave/node/client';
import { bridge } from './bridge.ts';

export { api, bridge, type AppState } from './bridge.ts';

// ---------------------------------------------------------------- live updates

/*
 * Every event the daemon accepts bumps a counter (debounced); views that fetch
 * through useApi refetch when it changes. React keeps what people are typing,
 * so live updates never wipe a half-written message.
 */
let tick = 0;
const listeners = new Set<() => void>();
let pending: ReturnType<typeof setTimeout> | undefined;

export function bump(): void {
  tick++;
  for (const listener of listeners) listener();
}

bridge.onEvent(() => {
  clearTimeout(pending);
  pending = setTimeout(bump, 120);
});

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useTick = () => useSyncExternalStore(subscribe, () => tick);

export interface Loaded<T> {
  data?: T;
  error?: string;
  reload(): void;
}

/**
 * Run an action against the node once (and again only when `deps` change), never
 * on live events. For calls that write, like creating an invite: refetching them
 * on every event would write again, which is an event, which refetches…
 */
export function useAction<T>(action: () => Promise<T>, deps: unknown[]): Omit<Loaded<T>, 'reload'> {
  const key = JSON.stringify(deps);
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key });
  useEffect(() => {
    let alive = true;
    action().then(
      (data) => alive && setState({ key, data }),
      (error: Error) => alive && setState({ key, error: error.message }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return state.key === key ? { data: state.data, error: state.error } : {};
}

/** Fetch something from the node; refetches on live events and when `deps` change (clearing stale data). Only for reads: see useAction. */
export function useApi<T>(fetcher: () => Promise<T>, deps: unknown[]): Loaded<T> {
  const t = useTick();
  const key = JSON.stringify(deps);
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>({ key });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    fetcher().then(
      (data) => alive && setState({ key, data }),
      (error: Error) => alive && setState((s) => ({ ...s, key, error: error.message })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, nonce, key]);
  const current = state.key === key ? state : { key };
  return { data: current.data, error: current.error, reload: () => setNonce((n) => n + 1) };
}

// ---------------------------------------------------------------- routing

export const navigate = (hash: string) => {
  location.hash = hash;
};

/** The hash as path segments. Decoded first: Electron's loadFile encodes the slashes in a hash. */
export function useRoute(): string[] {
  const read = () => decodeURIComponent(location.hash).replace(/^#\/?/, '').split('/').filter(Boolean);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

// ---------------------------------------------------------------- unread state (per viewer, in this browser only)

const SEEN_KEY = 'weave.seen';

function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function markSeen(key: string, time: string): void {
  const seen = readSeen();
  if ((seen[key] ?? '') >= time) return;
  seen[key] = time;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {}
  bump();
}

export const isUnread = (key: string, latest?: string): boolean => !!latest && latest > (readSeen()[key] ?? '');

// ---------------------------------------------------------------- formatting

/** Markdown reduced to plain text, for one-line previews. */
export const plain = (text: string) => text.replace(/```[\s\S]*?```/g, '[code]').replace(/[*_`~>#]+/g, '').replace(/\s+/g, ' ').trim();

export const shortDid = (did: string) => `${did.slice(8, 14)}…${did.slice(-4)}`;

export function hue(seed: string): number {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function ago(time: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(time)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(time).toLocaleDateString();
}

export const clock = (time: string) => new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function dayLabel(time: string): string {
  const d = new Date(time);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });
}

export const isActive = (lastActive?: string) => !!lastActive && Date.now() - Date.parse(lastActive) < 5 * 60_000;

DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * Markdown (bold, italics, code, links, lists) rendered safely: messages come
 * from other people, so the HTML is sanitized, and @mentions become chips.
 */
export function renderMarkdown(text: string): string {
  const html = DOMPurify.sanitize(marked.parse(text, { async: false, breaks: true, gfm: true }) as string, {
    FORBID_TAGS: ['img', 'style', 'iframe', 'form', 'input'],
  });
  const template = document.createElement('template');
  template.innerHTML = html;
  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.parentElement?.closest('code, pre, a') && /@[\w-]+/.test(node.data)) texts.push(node);
  }
  for (const node of texts) {
    const fragment = document.createDocumentFragment();
    let last = 0;
    for (const match of node.data.matchAll(/@[\w-]+/g)) {
      fragment.append(node.data.slice(last, match.index));
      const chip = document.createElement('span');
      chip.className = 'mention';
      chip.textContent = match[0];
      fragment.append(chip);
      last = match.index! + match[0].length;
    }
    fragment.append(node.data.slice(last));
    node.replaceWith(fragment);
  }
  return template.innerHTML;
}

// ---------------------------------------------------------------- themes

const FONT_STACKS: Record<Theme['font'], string> = {
  sans: "'Inter', 'Segoe UI', system-ui, sans-serif",
  serif: "'Iowan Old Style', Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
  rounded: "'Nunito', 'Segoe UI Rounded', 'Segoe UI', system-ui, sans-serif",
};

/** Theme values as CSS custom properties (values are sanitized by the node). */
export const themeVars = (t: Theme): Record<string, string> => ({
  '--accent': t.accent,
  '--bg': t.background,
  '--surface': t.surface,
  '--text': t.text,
  '--font': FONT_STACKS[t.font],
});

export function applyAppTheme(theme?: Theme): void {
  if (!theme) return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(themeVars(theme))) root.style.setProperty(key, value);
  root.dataset.pattern = theme.pattern;
}

/** Remembers whether the user is scrolled to the bottom of an element, to keep chat pinned there. */
export function useStickToBottom(element: HTMLElement | null): React.MutableRefObject<boolean> {
  const stuck = useRef(true);
  useEffect(() => {
    if (!element) return;
    const onScroll = () => {
      stuck.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    };
    element.addEventListener('scroll', onScroll);
    return () => element.removeEventListener('scroll', onScroll);
  }, [element]);
  return stuck;
}
