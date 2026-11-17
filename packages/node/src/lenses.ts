import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { extname, join as joinPath, resolve as resolvePath, sep } from 'node:path';
import { boardsOf, KIND_BOARD_LENS, KIND_MSG, KIND_POST_DELETE, KIND_POST_EDIT, KIND_UPVOTE, postsOf, type AppManifest, type BoardLens, type Did, type Json } from '@weave/core';
import { tagFolder } from './appinstall.ts';
import type { BoardViewInfo, FeedItem } from './backend.ts';
import type { ServicesHost } from './node.ts';
import { pullImage } from './registry.ts';
import { safePath, untar } from './untar.ts';
import { gunzipSync } from 'node:zlib';
import { preparePureWasm, TYPES } from './runtime.ts';
import type { Services } from './services.ts';

/*
 * Client services: a board's lens, run by every member's own node. Its maintainers pin one to the board, suggested
 * or required (weave.board.lens); each node fetches it (its image, or its release file, checked), and runs its
 * component, which is pure: the board's events in, its state out (fold), and an action in, proposed events out (act).
 * It has no key: what it proposes, the member (or their agent) signs, if the contract lets the service propose that
 * kind and the member may write it in this board. Its renderer (its site) shows the state in a sandboxed frame.
 */

/**
 * Weave's own kinds a client service may propose (its contract still has to name them): posts, and what members do
 * with posts. Never anything about the space, its members, keys or boards: those stay the member's own doing.
 */
const LENS_WEAVE_KINDS = new Set(['weave.post', 'weave.post.edit', 'weave.upvote', 'weave.react', 'weave.msg', 'weave.reply', 'weave.issue.status', 'weave.issue.claim']);

/** The largest file of a lens's view this node hands out (they travel as JSON, to phones too). */
const LENS_FILE_MAX = 5_000_000;
/** A whole view at once (lensSite): at most this many files, and this much in all (as base64). */
const LENS_SITE_FILES = 200;
const LENS_SITE_MAX = 12_000_000;

/** A lens (or a group widget) ready to use on this node: where it runs, and its renderer's folder. */
export interface Ready {
  key: string;
  site?: string;
}

/** A pure component of a release (a lens's or a widget's): what to fetch, and where its parts are in it. */
export interface PureComponent {
  /** Where it runs (the runtime's key), and its own folder on this node. */
  key: string;
  dir: string;
  name: string;
  tag: string;
  origin: { project: string; release: string };
  manifest: AppManifest;
  part: { component: string; site?: string };
}

/**
 * Fetch a pure component's release (once), transpile its component, and run it with nothing to call: ready to fold
 * and act. `ready` keeps what is being made ready, by key, so it happens once.
 */
export function preparePure(h: ServicesHost, ready: Map<string, Promise<Ready>>, c: PureComponent): Promise<Ready> {
  const before = ready.get(c.key);
  if (before && h.runtime.running(c.key)) return before;
  const making = (async (): Promise<Ready> => {
    const root = await releaseFolder(h, c.dir, { origin: c.origin, tag: c.tag, manifest: c.manifest });
    if (!existsSync(joinPath(root, c.part.component))) throw new Error(`${c.name} ${c.tag} has no ${c.part.component}`);
    const entry = await preparePureWasm(joinPath(root, c.part.component), joinPath(c.dir, 'wasm'));
    h.runtime.startWasm(
      c.key,
      {
        dir: joinPath(c.dir, 'wasm'),
        entry,
        data: joinPath(c.dir, 'data'),
        log: joinPath(c.dir, 'lens.log'),
        name: c.name,
        host: () => {
          throw new Error('a client service calls nothing: it only folds and acts');
        },
      },
      // Stopped (it crashed, or hung): started again when it's next asked for.
      () => {},
    );
    return { key: c.key, ...(c.part.site ? { site: joinPath(root, c.part.site) } : {}) };
  })();
  ready.set(c.key, making);
  making.catch(() => ready.delete(c.key));
  return making;
}

/** A file of a pure component's site (its renderer's folder), for the app's sandboxed frame: nothing outside it. */
export function siteFile(site: string, name: string, path: string): { type: string; data: string } {
  const root = resolvePath(site);
  let file = resolvePath(root, `.${('/' + path).replace(/\\/g, '/')}`);
  if (file !== root && !file.startsWith(root + sep)) throw new Error(`not in ${name}'s view`);
  if (existsSync(file) && statSync(file).isDirectory()) file = joinPath(file, 'index.html');
  if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`not in ${name}'s view`);
  if (statSync(file).size > LENS_FILE_MAX) throw new Error(`${path} is larger than a view's file may be (${LENS_FILE_MAX / 1_000_000} MB)`);
  return { type: TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', data: readFileSync(file).toString('base64') };
}

/** What a component's act answered: a list of proposed events (unchecked), or why not. */
export function proposedEvents(name: string, result: unknown): unknown[] {
  let proposed: unknown;
  try {
    proposed = JSON.parse(String(result));
  } catch {
    throw new Error(`${name} proposed something that isn't JSON`);
  }
  if (!Array.isArray(proposed)) throw new Error(`${name} proposed something that isn't a list of events`);
  return proposed;
}

/** The largest release file of a pure component Weave fetches, and what it may unpack to. */
const PURE_MAX = 64 * 1024 * 1024;

/** A pure component's release file into `into`: a tar archive (gzipped or not) unpacked, files and folders only; anything else as it is. */
export function unpackPure(bytes: Uint8Array, file: string, into: string): void {
  let data = bytes;
  if (data[0] === 0x1f && data[1] === 0x8b) data = new Uint8Array(gunzipSync(data, { maxOutputLength: PURE_MAX * 4 }));
  const tar = data.length >= 512 && new TextDecoder().decode(data.subarray(257, 262)) === 'ustar';
  if (tar) untar(data, into, PURE_MAX * 4);
  else writeFileSync(joinPath(into, safePath(file.replace(/\.gz$/i, '')) ?? 'component.wasm'), data);
}

/**
 * A pure component's release, fetched into `dir` once (its release file through the project's provider or GitHub,
 * checked against its SHA-256; or its image, each layer checked against its digest): the folder it unpacked into.
 */
export async function releaseFolder(h: ServicesHost, dir: string, r: { origin: { project: string; release: string }; tag: string; manifest: AppManifest }): Promise<string> {
  const target = joinPath(dir, tagFolder(r.tag));
  if (!existsSync(target)) {
    const image = r.manifest.install?.image;
    const asset = r.manifest.install?.assets?.wasm;
    if (asset) {
      // Read here, without a tar program, as an image's layers are: so a page (apps/web) unpacks it the same way.
      const bytes = await h.releases.bytes({ project: r.origin.project, id: r.origin.release, tag: r.tag, manifest: r.manifest }, asset, PURE_MAX);
      const staging = `${target}.unpacking`;
      rmSync(staging, { recursive: true, force: true });
      mkdirSync(staging, { recursive: true });
      try {
        unpackPure(bytes, asset.file, staging);
        renameSync(staging, target);
      } finally {
        rmSync(staging, { recursive: true, force: true });
      }
    } else if (image) {
      const staging = `${target}.unpacking`;
      rmSync(staging, { recursive: true, force: true });
      try {
        await pullImage(image.ref, image.digest, staging, { fetch: h.registryFetch() });
        renameSync(staging, target);
      } finally {
        rmSync(staging, { recursive: true, force: true });
      }
    }
  }
  // Unpacked into its tag's folder (or the one folder in it).
  const inside = existsSync(target) ? readdirSync(target).filter((e) => !e.startsWith('.')) : [];
  return inside.length === 1 && statSync(joinPath(target, inside[0])).isDirectory() ? joinPath(target, inside[0]) : target;
}

export class Lenses {
  readonly h: ServicesHost;
  readonly #svc: () => Services;
  /** A group widget's site, by its release: set by the node (widgets.ts), only for what its person approved. */
  widgetSite?: (release: string) => Promise<{ site: string; name: string } | undefined>;
  /** Lenses being made ready (fetched, transpiled, started), by their runtime key. */
  #ready = new Map<string, Promise<Ready>>();
  /** The last state folded per board, by what it was folded from. */
  #folded = new Map<string, { from: string; state: Json }>();

  constructor(host: ServicesHost, services: () => Services) {
    this.h = host;
    this.#svc = services;
  }

  /** A board of a space, with its lens if it has one. */
  #board(spaceRef: string, name: string) {
    const space = this.h.space(spaceRef);
    if (space.kind !== 'project' && space.kind !== 'community') throw new Error(`${this.h.spaceName(space)} has no boards`);
    const board = boardsOf(space.kind, this.h.entries(space), this.h.state(space).maintainers).find((b) => b.name === name);
    if (!board) throw new Error(`${this.h.spaceName(space)} has no board "${name}"`);
    return { space, board };
  }

  /** The ids of a board's posts. */
  #posts(space: ReturnType<ServicesHost['space']>, board: string): Set<string> {
    return new Set(postsOf(space.kind, this.h.entries(space), this.h.state(space).maintainers).filter((p) => p.board === board).map((p) => p.id));
  }

  /**
   * Its maintainers pin a client service to a board: a release of a project they're in, or one a catalog lists,
   * suggested (each member chooses) or required (every member's node uses it). `off` takes it away.
   */
  async setBoardLens(input: { space: string; board: string; from?: { project: string; tag?: string } | { catalog: string; app: string }; mode?: 'suggest' | 'require'; off?: boolean; as?: string }): Promise<BoardViewInfo> {
    const { space, board } = this.#board(input.space, input.board);
    if (!this.h.state(space).maintainers.has(this.h.identity.author)) throw new Error(`only the maintainers of ${this.h.spaceName(space)} choose how its boards are shown`);
    if (input.off) {
      await this.h.publish({ kind: KIND_BOARD_LENS, body: { board: board.name, on: false }, space: space.id, as: input.as });
      return this.boardView({ space: space.id, board: board.name });
    }
    if (!input.from) throw new Error('which client service? a release of a project, or a catalog entry');
    const found = 'catalog' in input.from ? await this.#svc().fromCatalog(input.from) : this.#svc().artifact(input.from.project, input.from.tag);
    const manifest = found.artifact.manifest;
    if (!manifest.client) throw new Error(`${manifest.name} ${found.artifact.tag} isn't a client service: its manifest has no "client"`);
    if (!manifest.install?.image && !manifest.install?.assets?.wasm) throw new Error(`${manifest.name} ${found.artifact.tag} has nothing a node can fetch: release it as an image for wasi/wasm, or a release file for wasm`);
    const body = { board: board.name, origin: { project: found.project.id, release: found.artifact.id }, manifest: manifest as unknown as Json, mode: input.mode === 'require' ? 'require' : 'suggest' };
    await this.h.publish({ kind: KIND_BOARD_LENS, body, space: space.id, as: input.as });
    return this.boardView({ space: space.id, board: board.name });
  }

  /**
   * The board's items, as its lens folds them, oldest first: its posts, their edits, deletions and votes, their chats,
   * and the events of the lens's own kinds (its contract's) about them or the board.
   */
  #items(space: ReturnType<ServicesHost['space']>, board: string, lens: BoardLens): Array<Record<string, Json>> {
    const posts = this.#posts(space, board);
    const own = new Set(lens.manifest.client!.writes.filter((k) => !k.startsWith('weave.')));
    const field = (body: Json, key: string) => (body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, Json>)[key] : undefined);
    const about = (e: { kind: string; body: Json }) => {
      if (e.kind === KIND_POST_EDIT || e.kind === KIND_POST_DELETE || e.kind === KIND_UPVOTE) return posts.has(String(field(e.body, 'target')));
      if (e.kind === KIND_MSG) return posts.has(String(field(e.body, 'post')));
      if (own.has(e.kind)) return field(e.body, 'target') !== undefined ? posts.has(String(field(e.body, 'target'))) : field(e.body, 'board') === board;
      return false;
    };
    return this.h
      .entries(space)
      .filter((e) => posts.has(e.id) || about(e))
      .sort((a, b) => a.event.time.localeCompare(b.event.time) || a.id.localeCompare(b.id))
      .map((e) => {
        const name = this.h.actor(e.event.author, e.event.author).name;
        return { id: e.id, kind: e.kind, body: e.body, author: e.event.author, ...(name ? { authorName: name } : {}), time: e.event.time };
      });
  }

  /** Fetch a lens's package (once per release), transpile its component, and run it: ready to fold and act. */
  #prepare(lens: BoardLens): Promise<Ready> {
    const client = lens.manifest.client!;
    return preparePure(this.h, this.#ready, { key: `lens:${lens.origin.release}`, dir: joinPath(this.h.home.dir, 'lenses', lens.origin.release.slice(0, 40)), name: lens.name, tag: lens.tag, origin: lens.origin, manifest: lens.manifest, part: client });
  }

  /**
   * A file of a lens's view (its site): of a lens pinned to a board here, made ready if it isn't yet. A group widget's
   * view comes the same way ("widget-<release>"), only once you approved it (widgets.ts).
   */
  async lensFile(input: { release: string; path: string }): Promise<{ type: string; data: string }> {
    const { site, name } = await this.#site(input.release);
    return siteFile(site, name, input.path);
  }

  /**
   * All of a view's files at once (each as lensFile gives it), for a page that has nowhere to serve them from: Weave
   * Web hands them to the view's sandboxed frame, which builds its page from them (apps/web/src/lens-frame.html).
   */
  async lensSite(input: { release: string }): Promise<Array<{ path: string; type: string; data: string }>> {
    const { site, name } = await this.#site(input.release);
    const out: Array<{ path: string; type: string; data: string }> = [];
    let total = 0;
    const walk = (folder: string, prefix: string) => {
      for (const entry of readdirSync(folder).sort()) {
        if (entry.startsWith('.')) continue;
        const path = prefix ? `${prefix}/${entry}` : entry;
        if (statSync(joinPath(folder, entry)).isDirectory()) walk(joinPath(folder, entry), path);
        else {
          if (out.length >= LENS_SITE_FILES) throw new Error(`${name}'s view has more than ${LENS_SITE_FILES} files`);
          const file = siteFile(site, name, path);
          total += file.data.length;
          if (total > LENS_SITE_MAX) throw new Error(`${name}'s view is larger than a page takes in at once (${LENS_SITE_MAX / 1_000_000} MB)`);
          out.push({ path, ...file });
        }
      }
    };
    walk(resolvePath(site), '');
    return out;
  }

  /** Where a view's files are: a widget's you approved, a shipped service's panels, or a lens pinned to a board here. */
  async #site(release: string): Promise<{ site: string; name: string }> {
    if (release.startsWith('widget-')) {
      const widget = this.widgetSite ? await this.widgetSite(release.slice(7)) : undefined;
      if (!widget) throw new Error('no widget you approved here is that one');
      return widget;
    }
    // A shipped service's panels: the pages that ship with this Weave, by its name.
    const shipped = release.startsWith('shipped-') ? this.#svc().shippedPanelFolder(release.slice(8)) : undefined;
    const lens = shipped ? undefined : this.#pinned(release);
    if (!shipped && !lens) throw new Error('no board here is shown by that client service');
    const site = shipped ?? (await this.#prepare(lens!)).site;
    const name = shipped ? release.slice(8) : lens!.name;
    if (!site) throw new Error(`${name} has no view of its own`);
    return { site, name };
  }

  /** The lens a board here is pinned to, by its release. */
  #pinned(release: string): BoardLens | undefined {
    for (const space of this.h.spaces.values()) {
      if (space.kind !== 'project' && space.kind !== 'community') continue;
      const lens = boardsOf(space.kind, this.h.entries(space), this.h.state(space).maintainers).find((b) => b.lens?.origin.release === release)?.lens;
      if (lens) return lens;
    }
    return undefined;
  }

  /**
   * A board as its lens shows it: its state (folded from its items) and actions, and whether it has a renderer.
   * Without a lens, or with a suggested one this member didn't choose (`use`), just the board.
   */
  async boardView(input: { space: string; board: string; use?: boolean }): Promise<BoardViewInfo> {
    const { space, board } = this.#board(input.space, input.board);
    const lens = board.lens;
    const base: BoardViewInfo = { space: { id: space.id, kind: space.kind, name: this.h.spaceName(space) }, board: { name: board.name, title: board.title } };
    if (!lens) return base;
    const about = { name: lens.name, tag: lens.tag, mode: lens.mode, release: lens.origin.release, by: this.h.actor(lens.by, lens.by) };
    if (lens.mode === 'suggest' && !input.use) return { ...base, lens: about };
    let ready: Ready;
    try {
      ready = await this.#prepare(lens);
    } catch (error) {
      return { ...base, lens: { ...about, problem: (error as Error).message } };
    }
    const items = this.#items(space, board.name, lens);
    const from = `${lens.origin.release}:${items.length}:${items.at(-1)?.id ?? ''}`;
    const key = `${space.id}/${board.name}`;
    let state = this.#folded.get(key)?.from === from ? this.#folded.get(key)!.state : undefined;
    if (state === undefined) {
      try {
        state = JSON.parse(String(await this.h.runtime.callWasm(ready.key, 'fold', [JSON.stringify({ name: board.name, title: board.title }), JSON.stringify(items)]))) as Json;
      } catch (error) {
        return { ...base, lens: { ...about, problem: `its fold failed: ${(error as Error).message}` } };
      }
      this.#folded.set(key, { from, state });
    }
    const actions = state && typeof state === 'object' && !Array.isArray(state) && Array.isArray(state.actions) ? state.actions : [];
    return { ...base, lens: { ...about, ...(ready.site ? { site: true } : {}) }, state, actions };
  }

  /**
   * An action of the board's lens, by this member (or their agent `as`): the lens proposes events, each is checked
   * (its kind in the lens's contract, about this board) and published with the member's own rights.
   */
  async boardAction(input: { space: string; board: string; action: string; input?: Json; as?: string }): Promise<{ published: FeedItem[]; view: BoardViewInfo }> {
    const view = await this.boardView({ space: input.space, board: input.board, use: true });
    const { space, board } = this.#board(input.space, input.board);
    const lens = board.lens;
    if (!lens) throw new Error(`${board.title} has no client service: nothing to act with`);
    if (view.lens?.problem) throw new Error(view.lens.problem);
    const ready = await this.#prepare(lens);
    const me = this.h.identity.author as Did;
    const asked = [input.action, JSON.stringify(input.input ?? null), JSON.stringify(view.state ?? null), JSON.stringify({ did: me, name: this.h.actor(me, me).name ?? null })];
    const result = await this.h.runtime.callWasm(ready.key, 'act', asked).catch((error: Error) => {
      throw new Error(`${lens.name} won't: ${error.message}`);
    });
    const proposed = proposedEvents(lens.name, result);
    const posts = this.#posts(space, board.name);
    const writes = lens.manifest.client!.writes;
    // All checked before any is published: an action happens whole, or not at all.
    const events = proposed.slice(0, 20).map((p) => {
      const { kind, body } = (p ?? {}) as { kind?: unknown; body?: unknown };
      if (typeof kind !== 'string' || !writes.includes(kind)) throw new Error(`${lens.name} may not propose ${String(kind)} (its contract: ${writes.join(', ') || 'nothing'})`);
      if (kind.startsWith('weave.') && !LENS_WEAVE_KINDS.has(kind)) throw new Error(`a client service never proposes ${kind}: that's for members to do themselves`);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error(`${lens.name} proposed a ${kind} without a body`);
      const b = body as Record<string, Json>;
      // About this board only: a post in it, or something of a post in it; new posts land in it.
      const about = typeof b.post === 'string' ? b.post : typeof b.target === 'string' ? b.target : typeof b.issue === 'string' ? b.issue : undefined;
      if (about !== undefined && !posts.has(about)) throw new Error(`${lens.name} proposed a ${kind} about something not in ${board.title}`);
      if (about === undefined && kind !== 'weave.post' && kind.startsWith('weave.')) throw new Error(`${lens.name} proposed a ${kind} about nothing in ${board.title}`);
      return { kind, body: (about !== undefined ? b : { ...b, board: board.name }) as Json };
    });
    const published: FeedItem[] = [];
    for (const e of events) published.push(await this.h.publish({ kind: e.kind, body: e.body, space: space.id, as: input.as }));
    return { published, view: await this.boardView({ space: space.id, board: board.name, use: true }) };
  }
}
