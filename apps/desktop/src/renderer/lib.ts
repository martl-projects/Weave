import DOMPurify from "dompurify";
import { marked } from "marked";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { FeedItem, Theme } from "@weave/node/client";
import { api, bridge } from "./bridge.ts";

export { api, bridge, type AppState } from "./bridge.ts";

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

const itemListeners = new Set<(item: FeedItem) => void>();

/** Every live event as it arrives (notifications look at them); views refresh through useApi instead. */
export function onItem(listener: (item: FeedItem) => void): () => void {
  itemListeners.add(listener);
  return () => itemListeners.delete(listener);
}

bridge.onEvent((item) => {
  if (item) for (const listener of itemListeners) listener(item);
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
export function useAction<T>(
  action: () => Promise<T>,
  deps: unknown[],
): Omit<Loaded<T>, "reload"> {
  const key = JSON.stringify(deps);
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>(
    { key },
  );
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
export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[],
): Loaded<T> {
  const t = useTick();
  const key = JSON.stringify(deps);
  const [state, setState] = useState<{ key: string; data?: T; error?: string }>(
    { key },
  );
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    let alive = true;
    fetcher().then(
      (data) => alive && setState({ key, data }),
      (error: Error) =>
        alive && setState((s) => ({ ...s, key, error: error.message })),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, nonce, key]);
  const current = state.key === key ? state : { key };
  return {
    data: current.data,
    error: current.error,
    reload: () => setNonce((n) => n + 1),
  };
}

// ---------------------------------------------------------------- routing

export const navigate = (hash: string) => {
  location.hash = hash;
};

/** The hash as path segments. Decoded first: Electron's loadFile encodes the slashes in a hash. */
export function useRoute(): string[] {
  const read = () =>
    decodeURIComponent(location.hash)
      .replace(/^#\/?/, "")
      .split("/")
      .filter(Boolean);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const onChange = () => setRoute(read());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

// ---------------------------------------------------------------- unread state (per viewer, in this browser only)

const SEEN_KEY = "weave.seen";

function readSeen(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export function markSeen(key: string, time: string): void {
  const seen = readSeen();
  if ((seen[key] ?? "") >= time) return;
  seen[key] = time;
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  } catch {}
  bump();
}

export const isUnread = (key: string, latest?: string): boolean =>
  !!latest && latest > (readSeen()[key] ?? "");

// ---------------------------------------------------------------- formatting

/** Markdown reduced to plain text, for one-line previews. */
export const plain = (text: string) =>
  text
    .replace(/```[\s\S]*?```/g, "[code]")
    .replace(/weave:post:[A-Za-z0-9_-]+/g, "[post]")
    .replace(/[*_`~>#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

export const shortDid = (did: string) => `${did.slice(8, 14)}…${did.slice(-4)}`;

export function hue(seed: string): number {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

export function ago(time: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(time)) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(time).toLocaleDateString();
}

export const clock = (time: string) =>
  new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function dayLabel(time: string): string {
  const d = new Date(time);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString([], {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export const isActive = (lastActive?: string) =>
  !!lastActive && Date.now() - Date.parse(lastActive) < 5 * 60_000;

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
  // Only images from Weave itself (encrypted blobs from peers): a remote image would tell its server who read the post.
  if (node.tagName === "IMG") {
    const src = node.getAttribute("src") ?? "";
    if (!src.startsWith("wblob:")) return void node.remove();
    node.setAttribute("data-wblob", src);
    node.removeAttribute("src");
    node.setAttribute("loading", "lazy");
  }
});

/** DOMPurify's default allowed URLs, plus wblob: references and Weave links. */
const ALLOWED_URI =
  /^(?:(?:(?:f|ht)tps?|mailto|wblob|weave):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i;

/** A post link (weave:post:…) and the id it names. */
export const POST_LINK = /weave:post:([A-Za-z0-9_-]+)/;

/** A company's enrollment link that was clicked (stage 14): the first start's company screen picks it up. */
export let openedEnrollLink: string | undefined;
export function enrollLinkOpened(link: string): void {
  openedEnrollLink = link;
  window.dispatchEvent(new CustomEvent("weave-enroll-link", { detail: link }));
}
export const postLink = (id: string) => `weave:post:${id}`;

/** A link to a project, group or community (weave:project:…), and where it opens in the app. */
export const SPACE_LINK = /^weave:(project|group|community):([A-Za-z0-9_-]+)$/;
export const spaceRoute = (kind: string, id: string) =>
  `#/${({ project: "p", group: "g", community: "r" } as Record<string, string>)[kind]}/${id}`;

/** What renderMarkdown picks out of plain text: @mentions and post links. */
const INLINE = /@[\w-]+|weave:post:[A-Za-z0-9_-]+/;

/**
 * Markdown (bold, italics, code, links, lists, images) rendered safely: messages
 * come from other people, so the HTML is sanitized, @mentions become chips and
 * post links become links.
 * `rich` (project pages) also keeps inline styles; the page container keeps
 * them from reaching outside it.
 */
export function renderMarkdown(text: string, rich = false): string {
  const html = DOMPurify.sanitize(
    marked.parse(text, { async: false, breaks: !rich, gfm: true }) as string,
    {
      FORBID_TAGS: [
        "style",
        "iframe",
        "form",
        "input",
        "video",
        "audio",
        "object",
        "embed",
      ],
      ...(rich ? {} : { FORBID_ATTR: ["style"] }),
      ALLOWED_URI_REGEXP: ALLOWED_URI,
    },
  );
  const template = document.createElement("template");
  template.innerHTML = html;
  const walker = document.createTreeWalker(
    template.content,
    NodeFilter.SHOW_TEXT,
  );
  const texts: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    if (!node.parentElement?.closest("code, pre, a") && INLINE.test(node.data))
      texts.push(node);
  }
  for (const node of texts) {
    const fragment = document.createDocumentFragment();
    let last = 0;
    for (const match of node.data.matchAll(new RegExp(INLINE, "g"))) {
      fragment.append(node.data.slice(last, match.index));
      const post = POST_LINK.exec(match[0]);
      const chip = document.createElement(post ? "a" : "span");
      if (post) chip.setAttribute("href", postLink(post[1]));
      else chip.className = "mention";
      chip.textContent = match[0];
      fragment.append(chip);
      last = match.index! + match[0].length;
    }
    fragment.append(node.data.slice(last));
    node.replaceWith(fragment);
  }
  embedLonePostLinks(template.content);
  return template.innerHTML;
}

/**
 * A post link alone on its line becomes an embed: a placeholder that
 * loadEmbeds fills in with a card of the post. A link inside a sentence
 * stays a link.
 */
function embedLonePostLinks(root: DocumentFragment): void {
  const lone = (nodes: Node[]) => {
    const meaningful = nodes.filter(
      (n) => !(n.nodeType === Node.TEXT_NODE && !n.textContent?.trim()),
    );
    const only = meaningful.length === 1 ? meaningful[0] : undefined;
    const href =
      only instanceof HTMLAnchorElement
        ? (only.getAttribute("href") ?? "")
        : "";
    return POST_LINK.exec(href)?.[0] === href
      ? POST_LINK.exec(href)![1]
      : undefined;
  };
  const embed = (id: string) => {
    const box = document.createElement("div");
    box.className = "post-embed";
    box.dataset.post = id;
    const link = document.createElement("a");
    link.setAttribute("href", postLink(id));
    link.textContent = postLink(id);
    box.append(link);
    return box;
  };
  for (const p of [...root.querySelectorAll("p")]) {
    if (p.closest("blockquote, li, td")) continue;
    // Lines of the paragraph, split at line breaks (chat keeps them).
    const lines: Node[][] = [[]];
    for (const child of [...p.childNodes])
      child.nodeName === "BR" ? lines.push([]) : lines.at(-1)!.push(child);
    if (!lines.some((line) => lone(line))) continue;
    const out: Node[] = [];
    let text: HTMLParagraphElement | undefined;
    for (const line of lines) {
      const id = lone(line);
      if (id) {
        out.push(embed(id));
        text = undefined;
      } else if (
        line.some(
          (n) => n.textContent?.trim() || n.nodeType === Node.ELEMENT_NODE,
        )
      ) {
        if (text) text.append(document.createElement("br"));
        else out.push((text = document.createElement("p")));
        text.append(...line);
      }
    }
    p.replaceWith(...out);
  }
}

// ---------------------------------------------------------------- images

const blobUrls = new Map<string, Promise<string>>();

/** A local object URL for a wblob: image, fetched once (from disk or peers) and cached. */
export function blobUrl(ref: string): Promise<string> {
  let url = blobUrls.get(ref);
  if (!url) {
    url = api<{ data: string; type: string }>("blob", ref).then(
      ({ data, type }) =>
        URL.createObjectURL(
          new Blob([Uint8Array.from(atob(data), (c) => c.charCodeAt(0))], {
            type,
          }),
        ),
    );
    url.catch(() => blobUrls.delete(ref));
    blobUrls.set(ref, url);
  }
  return url;
}

export function useBlobUrl(ref?: string): string | undefined {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    setUrl(undefined);
    if (!ref) return;
    let alive = true;
    blobUrl(ref).then(
      (u) => alive && setUrl(u),
      () => {},
    );
    return () => {
      alive = false;
    };
  }, [ref]);
  return url;
}

/** Fill in the images renderMarkdown left as data-wblob placeholders. */
export function loadBlobImages(root: HTMLElement): void {
  for (const img of root.querySelectorAll<HTMLImageElement>(
    "img[data-wblob]:not([src])",
  )) {
    blobUrl(img.dataset.wblob!).then(
      (url) => (img.src = url),
      () => img.classList.add("blob-missing"),
    );
  }
}

/**
 * Upload an image: shrunk to at most `maxSide` pixels and re-encoded (which also
 * drops metadata such as GPS positions), then stored encrypted. Returns its wblob: reference.
 */
export async function uploadImage(file: Blob, maxSide = 1600): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("that is not an image");
  let blob: Blob = file;
  if (file.type !== "image/gif") {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas
      .getContext("2d")!
      .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("couldn't read that image"))),
        "image/webp",
        0.86,
      ),
    );
  }
  if (blob.size > 2 * 1024 * 1024) throw new Error("images are at most 2 MB");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return api<string>("putBlob", { data: btoa(binary), type: blob.type });
}

// ---------------------------------------------------------------- themes

const FONT_STACKS: Record<Theme["font"], string> = {
  sans: "'Inter', 'Segoe UI', system-ui, sans-serif",
  serif: "'Iowan Old Style', Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
  rounded: "'Nunito', 'Segoe UI Rounded', 'Segoe UI', system-ui, sans-serif",
};

/** Theme values as CSS custom properties (values are sanitized by the node). */
export const themeVars = (t: Theme): Record<string, string> => ({
  "--accent": t.accent,
  "--bg": t.background,
  "--surface": t.surface,
  "--text": t.text,
  "--font": FONT_STACKS[t.font],
});

export function applyAppTheme(theme?: Theme): void {
  if (!theme) return;
  const root = document.documentElement;
  for (const [key, value] of Object.entries(themeVars(theme)))
    root.style.setProperty(key, value);
  root.dataset.pattern = theme.pattern;
}

/*
 * The app's own skin (its window chrome) is a local preference, unlike a
 * person's public hub theme: it changes how Weave looks to you, not to others.
 */
export const SKINS = {
  win95: "Windows 95",
  cozy: "Cozy",
  arcade: "Arcade",
  clean: "Clean",
} as const;
export type Skin = keyof typeof SKINS;
const SKIN_KEY = "weave.skin";

export function loadSkin(): Skin {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(SKIN_KEY);
  } catch {}
  return saved && saved in SKINS ? (saved as Skin) : "win95";
}

export function applySkin(skin: Skin): void {
  document.documentElement.dataset.skin = skin;
  try {
    localStorage.setItem(SKIN_KEY, skin);
  } catch {}
}

/** Remembers whether the user is scrolled to the bottom of an element, to keep chat pinned there. */
export function useStickToBottom(
  element: HTMLElement | null,
): React.MutableRefObject<boolean> {
  const stuck = useRef(true);
  useEffect(() => {
    if (!element) return;
    const onScroll = () => {
      stuck.current =
        element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    };
    element.addEventListener("scroll", onScroll);
    return () => element.removeEventListener("scroll", onScroll);
  }, [element]);
  return stuck;
}
