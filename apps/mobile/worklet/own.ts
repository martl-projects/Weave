import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { errorToWire } from '@weave/core';
import { keepReconciling, loadConfig, PHONE_METHODS, resolveHome, saveConfig, WeaveNode } from '@weave/node';
import { webMethods } from '../../web/src/methods.ts';
import { serviceSaid, useShipped } from './host/runtime.ts';
import { serveLensRequest, type LensFile } from './lens-http.ts';
import type { Listener, Pipe } from './phone.ts';

/*
 * The phone app's worker with a node of its own: the whole WeaveNode runs here, on Bare, with its home in the app's
 * private storage and its own connections to peers (build-node.ts packs it). Nothing goes through a computer. The
 * app's screen talks to it as it talks to the worker that uses a computer's node (phone.ts), one JSON message per line:
 *
 *   screen → worker  {id, op: 'state'}                    → {hasIdentity, name?, connected}
 *                    {id, op: 'init', name}               → the new person's recovery words
 *                    {id, op: 'restore', words}           this person, from their words and their other devices
 *                    {id, op: 'call', method, args}       → the node's answer
 *                    {id, op: 'lensBase', release}        → where a board's client service's view is served here
 *                    {op: 'wake'}                         the app is in front again
 *                    {op: 'service', key, …}              what a component running on the screen said
 *   worker → screen  {id, result} | {id, error, name?, values?}
 *                    {event}                              the node's live events
 *                    {service} | {serviceCall} | {serviceStop}   a WebAssembly component to run there (host/runtime.ts)
 *
 * The native side sends {op: 'start', dir} first: where the home is (`bootstrap` with it: a test network's DHT).
 * What a screen may call is what a page may in Weave Web (methods.ts).
 */

/** Weave's own services that are in the app, as build.ts listed them (shipped-web.json). */
declare const WEAVE_PHONE_SHIPPED: string;

/**
 * Where the node finds what Weave ships: the list, and for each service a small file that stands in for its component,
 * which is in the app's screen (the node checks a shipped component's digest by reading its file, as in Weave Web).
 */
function shippedIn(dir: string): string | undefined {
  const services = JSON.parse(WEAVE_PHONE_SHIPPED) as Record<string, { component: string }>;
  if (!Object.keys(services).length) return undefined;
  const folder = join(dir, 'shipped');
  mkdirSync(folder, { recursive: true });
  writeFileSync(join(folder, 'shipped.json'), WEAVE_PHONE_SHIPPED);
  for (const [name, { component }] of Object.entries(services)) writeFileSync(join(folder, component), `web:${name}`);
  useShipped(Object.keys(services));
  return folder;
}

export interface OwnDeps {
  send(message: unknown): void;
  /** Listen on 127.0.0.1, on this port if it's free (else any). */
  listen(port: number, onConnection: (socket: Pipe) => void): Promise<Listener>;
}

export class Own {
  #deps: OwnDeps;
  #dir?: string;
  #bootstrap?: Array<{ host: string; port: number }>;
  #shipped?: string;
  #node?: WeaveNode;
  #stopReconciling?: () => void;
  #watching?: AbortController;
  #allowed = webMethods(PHONE_METHODS);
  /** Where boards' client services' views are served on this phone, and the screen's connections to it. */
  #lenses?: Promise<Listener>;
  #open = new Set<Pipe>();

  constructor(deps: OwnDeps) {
    this.#deps = deps;
  }

  async handle(message: { id?: number; op?: string; [key: string]: unknown }): Promise<void> {
    const { id, op } = message;
    try {
      const result = await this.#do(op, message);
      if (id !== undefined) this.#deps.send({ id, result: result ?? null });
    } catch (error) {
      if (id !== undefined) this.#deps.send({ id, ...errorToWire(error) });
    }
  }

  async close(): Promise<void> {
    void this.#lenses?.then((l) => l.close(), () => {});
    this.#lenses = undefined;
    for (const socket of this.#open) socket.destroy();
    this.#watching?.abort();
    this.#stopReconciling?.();
    await this.#node?.close();
    this.#node = undefined;
  }

  /** The home's node is this worker's from now on: its events go to the screen, its duties are kept, and it looks for peers. */
  #adopt(node: WeaveNode): void {
    this.#node = node;
    if (this.#shipped) node.wasmSetup.shippedDir = this.#shipped;
    if (this.#bootstrap?.length) {
      node.config = { ...loadConfig(resolveHome(this.#dir!)), bootstrap: this.#bootstrap };
      saveConfig(resolveHome(this.#dir!), node.config);
    }
    this.#watching = new AbortController();
    void node.watch((item) => this.#deps.send({ event: item }), this.#watching.signal);
    this.#stopReconciling = keepReconciling(node);
    // Without a network the screens work on what the phone has; it looks again when the app comes to the front.
    void node.goOnline().catch((error: Error) => console.error(`weave: not online: ${error.message}`));
  }

  async #do(op: unknown, message: Record<string, unknown>): Promise<unknown> {
    if (op === 'start') {
      this.#dir = join(String(message.dir), 'home');
      this.#bootstrap = message.bootstrap as Array<{ host: string; port: number }> | undefined;
      mkdirSync(this.#dir, { recursive: true });
      this.#shipped = shippedIn(String(message.dir));
      if (existsSync(resolveHome(this.#dir).identity)) this.#adopt(WeaveNode.open(this.#dir, { keepEvents: true }));
      return;
    }
    const dir = this.#dir;
    if (!dir) throw new Error('the worker has not started');
    switch (op) {
      case 'state': {
        const name = this.#node ? (await this.#node.whoami()).name : undefined;
        return { hasIdentity: !!this.#node, ...(name ? { name } : {}), connected: !!this.#node };
      }
      case 'init': {
        if (this.#node) throw new Error('this phone has an account already');
        const made = WeaveNode.create(String(message.name ?? ''), dir);
        this.#adopt(made.node);
        return made.words;
      }
      case 'restore': {
        if (this.#node) throw new Error('this phone has an account already');
        const bootstrap = this.#bootstrap;
        const shipped = this.#shipped;
        const beforeOnline = (node: WeaveNode) => {
          if (shipped) node.wasmSetup.shippedDir = shipped;
          if (bootstrap?.length) node.config = { ...node.config, bootstrap };
        };
        this.#adopt(await WeaveNode.restore(String(message.words ?? ''), dir, { online: true, beforeOnline }));
        return;
      }
      case 'call': {
        const method = String(message.method);
        if (!this.#allowed.has(method)) throw new Error(`${method} isn't on a phone`);
        if (!this.#node) throw new Error('this phone has no account yet');
        // A phone has no agent apps whose settings Weave could add itself to: none are offered.
        if (method === 'harnesses') return { offered: true, harnesses: [] };
        const call = (this.#node as unknown as Record<string, (...args: unknown[]) => unknown>)[method];
        return call.apply(this.#node, (message.args as unknown[]) ?? []);
      }
      case 'lensBase': {
        const release = String(message.release ?? '');
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(release)) throw new Error('which client service?');
        this.#lenses ??= this.#deps.listen(0, (local) => serveLensRequest(local, this.#open, (r, path) => this.#file(r, path)));
        this.#lenses.catch(() => (this.#lenses = undefined));
        return `http://127.0.0.1:${(await this.#lenses).port}/lens/${release}/`;
      }
      case 'service': {
        serviceSaid(message);
        return;
      }
      case 'wake': {
        void this.#node?.goOnline().catch(() => {});
        return;
      }
      default:
        throw new Error(`unknown request: ${String(op)}`);
    }
  }

  async #file(release: string, path: string): Promise<LensFile> {
    if (!this.#node) throw new Error('this phone has no account yet');
    return this.#node.lensFile({ release, path });
  }
}
