import type { Json } from './bytes.ts';
import type { Entry } from './collab.ts';
import type { Did } from './keys.ts';
import { TEXT_LIMITS } from './limits.ts';
import { parseManifest, WIDGET_HEIGHT, type AppManifest } from './rooms.ts';

/*
 * Group widgets (docs/group-widgets.md): a mini-app sent into a chat. The message that sends it is one instance;
 * the events of its own kinds that name it (`target`) are that instance's, and only those are folded for it.
 *
 *   weave.widget   {app: {project, release, tag}, manifest, title, channel, post, replyTo}
 *                  a chat message in a channel (default "general") or in a post's chat, as weave.msg is; `manifest`
 *                  is the release's as published, so members outside its project can fetch and check the same files.
 *                  weave.post.delete {target} takes it down, as a message (its author, or the space's maintainers).
 *   <its kinds>    {target: <the weave.widget's id>, ...}   what its actions proposed, signed by the member who acted
 *
 * Who writes them: the members of the chat (only members' events count in a space); the kinds are the release's
 * own ("widget.writes"), never Weave's.
 */
export const KIND_WIDGET = 'weave.widget';

/** The release a widget comes from: its project, its weave.app event, and its tag. */
export interface WidgetApp {
  project: string;
  release: string;
  tag: string;
}

/** One widget instance, as its message sends it. */
export interface Widget {
  id: string;
  author: Did;
  signer: Did;
  time: string;
  title: string;
  app: WidgetApp;
  /** The release's manifest as sent: its widget part, and where to get it (install.image or install.assets.wasm). */
  manifest: AppManifest;
  /** Its name and the height it asks for in a chat. */
  name: string;
  height: number;
}

const ID = /^[A-Za-z0-9_-]{1,100}$/;
const field = (body: Json, key: string): unknown => (body && typeof body === 'object' && !Array.isArray(body) ? body[key] : undefined);

/** The widget parts of a weave.widget body, or undefined when it isn't one (a widget release, with somewhere to get it). */
export function widgetPartsOf(body: Json): Omit<Widget, 'id' | 'author' | 'signer' | 'time'> | undefined {
  const app = field(body, 'app') as Record<string, unknown> | undefined;
  const project = typeof app?.project === 'string' ? app.project : '';
  const release = typeof app?.release === 'string' ? app.release : '';
  const tag = typeof app?.tag === 'string' ? app.tag.slice(0, 100) : '';
  if (!ID.test(project) || !ID.test(release) || !tag) return undefined;
  let manifest: AppManifest;
  try {
    manifest = parseManifest(field(body, 'manifest'));
  } catch {
    return undefined;
  }
  if (!manifest.widget || manifest.install?.tag !== tag || !(manifest.install.image || manifest.install.assets?.wasm)) return undefined;
  const said = field(body, 'title');
  const title = (typeof said === 'string' ? said.replace(/\s+/g, ' ').trim().slice(0, TEXT_LIMITS.title) : '') || manifest.name;
  return { title, app: { project, release, tag }, manifest, name: manifest.name, height: manifest.widget.size?.height ?? WIDGET_HEIGHT.default };
}

/** A widget instance from its message, or undefined when it isn't one. */
export function widgetOf(entry: Entry): Widget | undefined {
  if (entry.kind !== KIND_WIDGET) return undefined;
  const parts = widgetPartsOf(entry.body);
  return parts && { id: entry.id, author: entry.event.author, signer: entry.event.signer, time: entry.event.time, ...parts };
}

/** A kind a widget may propose: one of its own (never Weave's), listed in its manifest. */
export const widgetMayWrite = (manifest: AppManifest, kind: string): boolean => !kind.startsWith('weave.') && !!manifest.widget?.writes.includes(kind);

/**
 * An instance's own events, oldest first: of the kinds its release names, about it (`target`), and nothing else. What
 * another instance of the same release did is never in it.
 */
export function widgetEventsOf(entries: Entry[], widget: Pick<Widget, 'id' | 'manifest'>): Entry[] {
  return entries
    .filter((e) => widgetMayWrite(widget.manifest, e.kind) && field(e.body, 'target') === widget.id)
    .sort((a, b) => a.event.time.localeCompare(b.event.time) || a.id.localeCompare(b.id));
}
