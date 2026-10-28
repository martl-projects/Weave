import { existsSync, readdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import { extname, join as joinPath, resolve as resolvePath, sep } from 'node:path';
import { boardsOf, KIND_BOARD_LENS, KIND_MSG, KIND_POST_DELETE, KIND_POST_EDIT, KIND_UPVOTE, postsOf, type AppManifest, type BoardLens, type Did, type Json } from '@weave/core';
import { tagFolder } from './appinstall.ts';
import type { BoardViewInfo, FeedItem } from './backend.ts';
import type { ServicesHost } from './node.ts';
import { pullImage } from './registry.ts';
import { prepareWasm, TYPES } from './runtime.ts';
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

/** A lens ready to use on this node: where it runs, and its renderer's folder. */
interface Ready {
  key: string;
  site?: string;
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
    if (asset) await h.releases.fetch(dir, { project: r.origin.project, id: r.origin.release, tag: r.tag, manifest: r.manifest }, asset, {});
    else if (image) {
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
  /** Lenses being made ready (fetched, transpiled, started), by release. */
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
    const key = `lens:${lens.origin.release}`;
    const before = this.#ready.get(lens.origin.release);
    if (before && this.h.runtime.running(key)) return before;
    const ready = (async (): Promise<Ready> => {
      const dir = joinPath(this.h.home.dir, 'lenses', lens.origin.release.slice(0, 40));
      const client = lens.manifest.client!;
      const root = await releaseFolder(this.h, dir, lens);
      if (!existsSync(joinPath(root, client.component))) throw new Error(`${lens.name} ${lens.tag} has no ${client.component}`);
      const entry = await prepareWasm(joinPath(root, client.component), joinPath(dir, 'wasm'));
      this.h.runtime.startWasm(
        key,
        {
          dir: joinPath(dir, 'wasm'),
          entry,
          data: joinPath(dir, 'data'),
          log: joinPath(dir, 'lens.log'),
          name: lens.name,
          host: () => {
            throw new Error('a client service calls nothing: it only folds and acts');
          },
        },
        // Stopped (it crashed, or hung): started again when it's next asked for.
        () => {},
      );
      return { key, ...(client.site ? { site: joinPath(root, client.site) } : {}) };
    })();
    this.#ready.set(lens.origin.release, ready);
    ready.catch(() => this.#ready.delete(lens.origin.release));
    return ready;
  }

  /** A file of a lens's view (its site): of a lens pinned to a board here, made ready if it isn't yet. */
  async lensFile(input: { release: string; path: string }): Promise<{ type: string; data: string }> {
    const lens = this.#pinned(input.release);
    if (!lens) throw new Error('no board here is shown by that client service');
    const site = (await this.#prepare(lens)).site;
    if (!site) throw new Error(`${lens.name} has no view of its own`);
    const root = resolvePath(site);
    let file = resolvePath(root, `.${('/' + input.path).replace(/\\/g, '/')}`);
    if (file !== root && !file.startsWith(root + sep)) throw new Error(`not in ${lens.name}'s view`);
    if (existsSync(file) && statSync(file).isDirectory()) file = joinPath(file, 'index.html');
    if (!existsSync(file) || !statSync(file).isFile()) throw new Error(`not in ${lens.name}'s view`);
    if (statSync(file).size > LENS_FILE_MAX) throw new Error(`${input.path} is larger than a view's file may be (${LENS_FILE_MAX / 1_000_000} MB)`);
    return { type: TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', data: readFileSync(file).toString('base64') };
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
    let proposed: unknown;
    try {
      proposed = JSON.parse(String(result));
    } catch {
      throw new Error(`${lens.name} proposed something that isn't JSON`);
    }
    if (!Array.isArray(proposed)) throw new Error(`${lens.name} proposed something that isn't a list of events`);
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
