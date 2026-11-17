import { join as joinPath } from 'node:path';
import { artifactsOf, canonicalJson, channelName, DEFAULT_CHANNEL, deletedMessages, KIND_WIDGET, KIND_MSG, KIND_REPLY, releaseById, widgetEventsOf, widgetMayWrite, widgetOf, type AppManifest, type Did, type Entry, type Json, type Widget } from '@weave/core';
import { launchFingerprint } from './applaunch.ts';
import type { FeedItem, WidgetReleaseInfo, WidgetViewInfo } from './backend.ts';
import { readJson, writeJson } from './home.ts';
import { preparePure, proposedEvents, type Ready } from './lenses.ts';
import type { ServicesHost } from './node.ts';
import type { Services } from './services.ts';

/*
 * Group widgets (docs/group-widgets.md): a mini-app anyone in a chat sends into it. The message (weave.widget) is one
 * instance; every member's own node runs the release's component for it, as a board's lens runs: pure, no key, no
 * network, no clock. fold sees that instance's events only (its own kinds, `target`: the message), act proposes
 * events of its own kinds about that instance, which the member signs with their own rights.
 *
 * Anyone in a group can send one, so nothing runs before its person approved the release once, by its fingerprint
 * (the release and its manifest as sent, which names every file by its SHA-256): kept on their node, never shared.
 *
 *   widgets.json   {approved: [{fingerprint, release, project, tag, app, name, at}]}
 */

/** How many events of one instance are folded at most, and how big its state may be. */
export const WIDGET_EVENTS_MAX = 5000;
export const WIDGET_STATE_MAX = 1_000_000;
/** How many events one action may propose. */
const WIDGET_PROPOSALS_MAX = 20;

interface StoredApproval {
  fingerprint: string;
  release: string;
  project: string;
  tag: string;
  app: string;
  name: string;
  at: string;
}

/**
 * What a member approves: this release (its weave.app event) with exactly this manifest, which names its files by
 * their SHA-256 (or its image by its digest). Another version, or other files under the same tag, asks again.
 */
export const widgetFingerprint = (w: { app: { release: string }; manifest: AppManifest }): string => launchFingerprint(['widget', canonicalJson(w.manifest as unknown as Json)], w.app.release);

const field = (body: Json, key: string): unknown => (body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, Json>)[key] : undefined);

export class Widgets {
  readonly h: ServicesHost;
  readonly #svc: () => Services;
  /** Widgets being made ready (fetched, transpiled, started), by runtime key. */
  #ready = new Map<string, Promise<Ready>>();
  /** The last state folded per instance, by what it was folded from. */
  #folded = new Map<string, { from: string; state: Json }>();

  constructor(host: ServicesHost, services: () => Services) {
    this.h = host;
    this.#svc = services;
  }

  // ---------------------------------------------------------------- approvals, kept on this node

  get #file(): string {
    return joinPath(this.h.home.dir, 'widgets.json');
  }

  #approvals(): StoredApproval[] {
    return readJson<{ approved?: StoredApproval[] }>(this.#file)?.approved ?? [];
  }

  #approved(fingerprint: string): boolean {
    return this.#approvals().some((a) => a.fingerprint === fingerprint);
  }

  #setApproved(w: Pick<Widget, 'app' | 'manifest' | 'name'>, on: boolean): void {
    const fingerprint = widgetFingerprint(w);
    const others = this.#approvals().filter((a) => a.fingerprint !== fingerprint);
    const mine: StoredApproval[] = on ? [{ fingerprint, release: w.app.release, project: w.app.project, tag: w.app.tag, app: w.manifest.app, name: w.name, at: new Date(this.h.clock()).toISOString() }] : [];
    writeJson(this.#file, { approved: [...others, ...mine] });
  }

  // ---------------------------------------------------------------- instances

  /** A widget message here, with its space and its entry: visible to you, and not taken down. */
  #instance(ref: string): { widget: Widget; space: ReturnType<ServicesHost['space']>; entries: Entry[]; entry: Entry } {
    const found = this.h.find(ref, [KIND_WIDGET]);
    const space = found.space && this.h.spaces.get(found.space.id);
    if (!space) throw new Error('a widget lives in a chat of a space');
    const entries = this.h.entries(space);
    const entry = entries.find((e) => e.id === found.id);
    if (!entry) throw new Error(`nothing found with id ${ref}`);
    if (deletedMessages(entries, this.h.state(space).maintainers).has(entry.id)) throw new Error('that widget was taken down');
    const widget = widgetOf(entry);
    if (!widget) throw new Error("that message's widget can't be read: its release has nothing a node can fetch");
    return { widget, space, entries, entry };
  }

  /**
   * Does the release as sent match the release its project published? Only someone in that project can tell
   * (`checked`); if it doesn't match, it never runs, approved or not.
   */
  #checkRelease(widget: Widget): { checked: boolean; projectName?: string; problem?: string } {
    const project = this.h.spaces.get(widget.app.project);
    if (!project || project.kind !== 'project') return { checked: false };
    const projectName = this.h.spaceName(project);
    const found = releaseById(this.h.entries(project), this.h.state(project).maintainers, widget.app.release);
    if (!found) return { checked: false, projectName, problem: `${projectName} has no such release (any more)` };
    if (canonicalJson(found.artifact.manifest as unknown as Json) !== canonicalJson(widget.manifest as unknown as Json)) return { checked: false, projectName, problem: `it isn't what ${projectName} released as ${widget.app.tag}` };
    return { checked: true, projectName };
  }

  #prepare(widget: Widget): Promise<Ready> {
    const release = widget.app.release;
    return preparePure(this.h, this.#ready, {
      key: `widget:${release}`,
      dir: joinPath(this.h.home.dir, 'widgets', release.slice(0, 40)),
      name: widget.name,
      tag: widget.app.tag,
      origin: { project: widget.app.project, release },
      manifest: widget.manifest,
      part: widget.manifest.widget!,
    });
  }

  /** A widget's site, for the app's sandboxed frame: only of a release you approved, as some widget here sends it. */
  async site(release: string): Promise<{ site: string; name: string } | undefined> {
    const fingerprints = new Set(this.#approvals().filter((a) => a.release === release).map((a) => a.fingerprint));
    if (!fingerprints.size) return undefined;
    for (const space of this.h.spaces.values()) {
      for (const e of this.h.entries(space)) {
        const widget = e.kind === KIND_WIDGET ? widgetOf(e) : undefined;
        if (!widget || widget.app.release !== release || !fingerprints.has(widgetFingerprint(widget))) continue;
        if (this.#checkRelease(widget).problem) continue;
        const ready = await this.#prepare(widget);
        return ready.site ? { site: ready.site, name: widget.name } : undefined;
      }
    }
    return undefined;
  }

  /** The instance's items as fold sees them, oldest first: its message, then its own events. */
  #items(widget: Widget, entries: Entry[]): Array<Record<string, Json>> {
    const item = (e: { id: string; kind: string; body: Json; author: Did; time: string }) => {
      const name = this.h.actor(e.author, e.author).name;
      return { id: e.id, kind: e.kind, body: e.body, author: e.author, ...(name ? { authorName: name } : {}), time: e.time };
    };
    const own = widgetEventsOf(entries, widget).slice(0, WIDGET_EVENTS_MAX);
    return [
      item({ id: widget.id, kind: KIND_WIDGET, body: { title: widget.title, app: { ...widget.app } }, author: widget.author, time: widget.time }),
      ...own.map((e) => item({ id: e.id, kind: e.kind, body: e.body, author: e.event.author, time: e.event.time })),
    ];
  }

  /**
   * An instance as its widget shows it: who sent it and from which release, whether you approved that release, and
   * once you did, its state (folded from its message and its own events) and actions. Unapproved, nothing is fetched
   * and nothing runs.
   */
  async widgetView(input: { message: string }): Promise<WidgetViewInfo> {
    const { widget, space, entries, entry } = this.#instance(input.message);
    const check = this.#checkRelease(widget);
    const fingerprint = widgetFingerprint(widget);
    const approved = this.#approved(fingerprint);
    const post = field(entry.body, 'post');
    const base: WidgetViewInfo = {
      id: widget.id,
      space: { id: space.id, kind: space.kind, name: this.h.spaceName(space) },
      ...(typeof post === 'string' ? { post } : { channel: channelName(field(entry.body, 'channel')) ?? DEFAULT_CHANNEL }),
      title: widget.title,
      by: this.h.actor(widget.author, widget.signer),
      time: widget.time,
      app: { project: widget.app.project, release: widget.app.release, tag: widget.app.tag, app: widget.manifest.app, name: widget.name, ...(widget.manifest.about ? { about: widget.manifest.about } : {}), ...(check.projectName ? { projectName: check.projectName } : {}) },
      checked: check.checked,
      fingerprint,
      approved,
      height: widget.height,
      view: `widget-${widget.app.release}`,
      ...(check.problem ? { problem: check.problem } : {}),
    };
    if (!approved || check.problem) return base;
    let ready: Ready;
    try {
      ready = await this.#prepare(widget);
    } catch (error) {
      return { ...base, problem: (error as Error).message };
    }
    const items = this.#items(widget, entries);
    const from = `${widget.app.release}:${items.length}:${items.at(-1)?.id ?? ''}`;
    let state = this.#folded.get(widget.id)?.from === from ? this.#folded.get(widget.id)!.state : undefined;
    if (state === undefined) {
      const about = { widget: widget.id, title: widget.title, space: base.space.name, by: { did: widget.author, name: base.by.name ?? null }, time: widget.time };
      let folded: string;
      try {
        folded = String(await this.h.runtime.callWasm(ready.key, 'fold', [JSON.stringify(about), JSON.stringify(items)]));
      } catch (error) {
        return { ...base, problem: `its fold failed: ${(error as Error).message}` };
      }
      if (folded.length > WIDGET_STATE_MAX) return { ...base, problem: `its state is larger than a widget's may be (${WIDGET_STATE_MAX / 1_000_000} MB)` };
      try {
        state = JSON.parse(folded) as Json;
      } catch {
        return { ...base, problem: "its fold answered something that isn't JSON" };
      }
      this.#folded.set(widget.id, { from, state });
    }
    const actions = state && typeof state === 'object' && !Array.isArray(state) && Array.isArray(state.actions) ? state.actions : [];
    return { ...base, ...(ready.site ? { site: true } : {}), state, actions };
  }

  /**
   * An action of an instance, by this member (or their agent `as`): the widget proposes events, each checked (one of
   * its own kinds, never Weave's; about this instance only) and published in its chat's space with the member's rights.
   */
  async widgetAction(input: { message: string; action: string; input?: Json; as?: string }): Promise<{ published: FeedItem[]; view: WidgetViewInfo }> {
    const view = await this.widgetView({ message: input.message });
    if (!view.approved) throw new Error(`approve ${view.app.name} ${view.app.tag} first: it doesn't run here until you do`);
    if (view.problem) throw new Error(view.problem);
    const { widget, space } = this.#instance(input.message);
    const ready = await this.#prepare(widget);
    const me = this.h.identity.author as Did;
    const asked = [input.action, JSON.stringify(input.input ?? null), JSON.stringify(view.state ?? null), JSON.stringify({ did: me, name: this.h.actor(me, me).name ?? null })];
    const result = await this.h.runtime.callWasm(ready.key, 'act', asked).catch((error: Error) => {
      throw new Error(`${widget.name} won't: ${error.message}`);
    });
    const proposed = proposedEvents(widget.name, result);
    if (proposed.length > WIDGET_PROPOSALS_MAX) throw new Error(`${widget.name} proposed more than ${WIDGET_PROPOSALS_MAX} events at once`);
    const writes = widget.manifest.widget!.writes;
    // All checked before any is published: an action happens whole, or not at all.
    const events = proposed.map((p) => {
      const { kind, body } = (p ?? {}) as { kind?: unknown; body?: unknown };
      if (typeof kind === 'string' && kind.startsWith('weave.')) throw new Error(`a widget never proposes ${kind}: only kinds of its own, about its instance`);
      if (typeof kind !== 'string' || !widgetMayWrite(widget.manifest, kind)) throw new Error(`${widget.name} may not propose ${String(kind)} (its kinds: ${writes.join(', ') || 'none'})`);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(`${widget.name} proposed a ${kind} without a body`);
      const b = body as Record<string, Json>;
      if (b.target !== undefined && b.target !== widget.id) throw new Error(`${widget.name} proposed a ${kind} about something other than this widget`);
      return { kind, body: { ...b, target: widget.id } as Json };
    });
    const published: FeedItem[] = [];
    for (const e of events) published.push(await this.h.publish({ kind: e.kind, body: e.body, space: space.id, as: input.as }));
    return { published, view: await this.widgetView({ message: widget.id }) };
  }

  /** Approve (or, `off`, no longer approve) the release a widget message sends: by its fingerprint, on this node only. */
  async approveWidget(input: { message: string; off?: boolean }): Promise<WidgetViewInfo> {
    const { widget } = this.#instance(input.message);
    const check = this.#checkRelease(widget);
    if (!input.off && check.problem) throw new Error(`${widget.name} ${widget.app.tag} won't run: ${check.problem}`);
    this.#setApproved(widget, !input.off);
    return this.widgetView({ message: widget.id });
  }

  // ---------------------------------------------------------------- sending one

  /** The widget releases of the projects you're in, newest first: what you can send into a chat. */
  async widgetReleases(): Promise<WidgetReleaseInfo[]> {
    const approved = new Set(this.#approvals().map((a) => a.fingerprint));
    const out: WidgetReleaseInfo[] = [];
    for (const project of this.h.spaces.values()) {
      if (project.kind !== 'project') continue;
      const all = artifactsOf(this.h.entries(project), this.h.state(project).maintainers);
      // One per app: its latest release.
      const seen = new Set<string>();
      for (const a of all) {
        if (!a.manifest.widget || !(a.manifest.install?.image || a.manifest.install?.assets?.wasm) || seen.has(a.manifest.app)) continue;
        seen.add(a.manifest.app);
        const app = { project: project.id, release: a.id, tag: a.tag };
        out.push({ project: { id: project.id, name: this.h.spaceName(project) }, release: a.id, tag: a.tag, app: a.manifest.app, name: a.manifest.name, ...(a.manifest.about ? { about: a.manifest.about } : {}), time: a.time, approved: approved.has(widgetFingerprint({ app, manifest: a.manifest })) });
      }
    }
    return out.sort((a, b) => b.time.localeCompare(a.time));
  }

  /**
   * Send a widget into a chat (a channel of a space, or a post's chat): a release of a project you're in, by its tag
   * (or its latest). Sending it is your approval of that release, so it runs for you at once (not when an agent sends).
   */
  async sendWidget(input: { space?: string; channel?: string; post?: string; project: string; tag?: string; title?: string; replyTo?: string; as?: string }): Promise<WidgetViewInfo> {
    const { project, artifact } = this.#svc().artifact(input.project, input.tag);
    const manifest = artifact.manifest;
    if (!manifest.widget) throw new Error(`${manifest.name} ${artifact.tag} isn't a widget: its manifest has no "widget"`);
    if (!manifest.install?.image && !manifest.install?.assets?.wasm) throw new Error(`${manifest.name} ${artifact.tag} has nothing a node can fetch: release it as an image for wasi/wasm, or a release file for wasm`);
    const chat = input.post ? await this.h.chatOf(input.post) : undefined;
    const space = chat?.space ?? this.h.space(input.space ?? '');
    if (space.kind === 'direct') throw new Error('widgets go into the chats of groups, tiers, projects and communities');
    const title = (input.title ?? '').replace(/\s+/g, ' ').trim();
    const body: Record<string, Json> = { app: { project: project.id, release: artifact.id, tag: artifact.tag }, manifest: manifest as unknown as Json, title: title || manifest.name };
    if (chat?.post) body.post = chat.post;
    else {
      const channel = input.channel ? channelName(input.channel) : undefined;
      if (input.channel && !channel) throw new Error('channel names use letters, digits and dashes');
      if (channel && channel !== DEFAULT_CHANNEL) body.channel = channel;
    }
    if (input.replyTo) body.replyTo = this.h.find(input.replyTo, [KIND_MSG, KIND_REPLY, KIND_WIDGET]).id;
    const sent = await this.h.publish({ kind: KIND_WIDGET, body, space: space.id, as: input.as });
    if (!input.as) this.#setApproved({ app: { project: project.id, release: artifact.id, tag: artifact.tag }, manifest, name: manifest.name }, true);
    return this.widgetView({ message: sent.id });
  }
}
