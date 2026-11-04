import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { lookup } from 'node:dns/promises';
import { createServer as createHttpServer, type IncomingMessage, type Server as HttpServer } from 'node:http';
import { BlockList, isIP } from 'node:net';
import { dirname, extname, isAbsolute, join, resolve as resolvePath, sep } from 'node:path';
import type { Duplex } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { MessageChannel, Worker } from 'node:worker_threads';
import { canonicalJson, netAllows, programPlatforms, releaseProgram, type AppImage, type AppManifest, type Json, type ReleaseProgram } from '@weave/core';
import { platformKey } from './appinstall.ts';
import { launchFingerprint } from './applaunch.ts';
import { listenNear } from './live.ts';
import { acceptWebSocket, type WebSocketConnection } from './websocket.ts';

/*
 * The runtime: what runs code on this node. It starts processes and containers under a key (a service, a
 * website's handler), keeps them going (started again, waiting longer each time, when they crash), and stops them,
 * a container through Docker. It knows how a release runs here (its build for this platform, or its image) and
 * what approving one means. It knows nothing of spaces, keys or contracts: whoever starts something decides what
 * it gets.
 *
 * A Weave service (an image carrying its manifest) runs in the standard sandbox only: a container that can't
 * write its own files or gain privileges, with limits on memory, CPU and processes, and one volume of its own for
 * what it keeps (/data). Without Docker it doesn't run here.
 *
 * A Weave service built as a WebAssembly component needs nothing installed: it runs inside Weave, in a worker thread
 * of its own (wasmworker.ts) with a memory limit, and gets only its /data folder and the host's functions, and
 * HTTPS to the hosts its contract names (none on this computer's networks). It
 * handles one event at a time; one that takes too long ends the worker (it starts again, the event is given up).
 */

/** The standard sandbox's limits for a Weave service. */
export const SANDBOX = { memory: '512m', cpus: '1', pids: '256', tmp: '64m' };

/** Something to run. */
export interface Run {
  /** Program and arguments. A program in `cwd` ("./band-ab") is found there: Windows wouldn't look by itself. */
  command: string[];
  cwd: string;
  /** What it gets on top of PATH and SYSTEMROOT: nothing else of the daemon's own environment. */
  env: Record<string, string>;
  /** Started through Docker under this name: cleared before and stopped through Docker too. */
  container?: string;
  /** Where its output goes. */
  log: string;
  /** How the log names it ("echo-bot", "the handler"). */
  name: string;
}

/** A WebAssembly component to run: a Weave service built for it, transpiled for this node (prepareWasm). */
export interface WasmRun {
  /** The transpiled component's folder and its entry file. */
  dir: string;
  entry: string;
  /** Its own folder: the only one it sees, as /data. */
  data: string;
  log: string;
  name: string;
  /** Answers its calls to the host (me, setting, publish, answer, load, save, log); a throw is the call's error. */
  host(name: string, args: unknown[]): unknown;
  /** It's ready: hand it what it missed. */
  ready?(): void;
  /** An event was handled, or given up (`error`): either way the next one comes. */
  handled?(item: string, error?: string): void;
  /**
   * A website it serves (a component of the website world): its files, and its players' connections, which Weave
   * holds for it. `who` says who a request comes from, as Weave vouches for them (or undefined: turned away);
   * `listening` where it listens, so it can be made reachable.
   */
  site?: { folder?: string; who(req: IncomingMessage): Record<string, unknown> | undefined; listening(port: number): void };
  /** Hosts it may reach over HTTPS (its contract's net); without, it reaches none. */
  net?: string[];
  /** How long one task may take, if not WASM_LIMITS.eventMs: a fetcher's download takes longer. */
  taskMs?: number;
}

/** Addresses a service's requests out never reach, whatever a host's name says: this computer and its networks. */
const NEARBY = new BlockList();
for (const [net, bits] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 3]] as const) NEARBY.addSubnet(net, bits, 'ipv4');
for (const [net, bits] of [['::', 127], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]] as const) NEARBY.addSubnet(net, bits, 'ipv6');
export const nearby = (address: string): boolean => {
  const v4 = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  return v4 ? NEARBY.check(v4, 'ipv4') : NEARBY.check(address, isIP(address) === 6 ? 'ipv6' : 'ipv4');
};

/** Whether a host is reachable from here without touching this computer's networks (a test's stand-in host is). */
export async function publicHost(host: string, testHosts: Record<string, number>): Promise<void> {
  if (testHosts[host]) return;
  const addresses = await lookup(host, { all: true });
  if (!addresses.length || addresses.some((a) => nearby(a.address))) throw new Error(`${host} is on this computer's networks`);
}

/** What a component handles, one at a time: an event, or what its website's players do. */
type WasmTask =
  | { type: 'event'; item: string }
  | { type: 'join'; player: string }
  | { type: 'message'; player: string; message: string }
  | { type: 'leave'; player: string }
  | { type: 'tick' }
  // A call of one of its functions, with its answer: a client service's fold or act.
  | { type: 'call'; fn: string; args: unknown[]; reply(value: unknown, error?: string): void };

/** A component running: its worker, what waits, what it's on, how to hand it the next, and its website. */
interface WasmEntry {
  worker: Worker;
  stopping: boolean;
  ready: boolean;
  queue: WasmTask[];
  busy?: { task: WasmTask; timer: ReturnType<typeof setTimeout>; expire(): void };
  next(): void;
  server?: HttpServer;
  players: Map<string, WebSocketConnection>;
  ticker?: ReturnType<typeof setInterval>;
}

/** What a file is, by its extension, for a website's files. */
/** Content types of the files a component's site serves. */
export const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.ico': 'image/x-icon', '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };

/** What a WebAssembly service gets: memory, and how long one event may take. */
export const WASM_LIMITS = { memoryMb: 256, eventMs: 10_000 };

/** Waits before starting something again that crashed: longer each time. */
const RESTART_WAITS = [1000, 5000, 30_000, 60_000];

/** The worker that runs a component: bundled next to the daemon, or this source file when run as it is. */
const WASM_WORKER = [new URL('./wasmworker.mjs', import.meta.url), new URL('./wasmworker.ts', import.meta.url)].find((u) => existsSync(fileURLToPath(u)));

/**
 * Make a component runnable here: transpiled once (by its hash) into `dir`, as JavaScript and core WebAssembly
 * modules this Node runs itself. The entry file to load.
 */
export async function prepareWasm(component: string, dir: string): Promise<string> {
  const bytes = readFileSync(component);
  const hash = createHash('sha256').update(bytes).digest('hex');
  const marker = join(dir, '.component');
  if (existsSync(marker) && readFileSync(marker, 'utf8') === hash) return 'component.js';
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const { transpileBytes } = await import('@bytecodealliance/jco-transpile');
  const { files } = await transpileBytes(bytes, { name: 'component', instantiation: { tag: 'async' }, emitTypescriptDeclarations: false });
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
  writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
  writeFileSync(marker, hash);
  return 'component.js';
}

export class Runtime {
  readonly #docker: () => string[];
  #procs = new Map<string, { child: ChildProcess; stopping: boolean; container?: string }>();
  #wasm = new Map<string, WasmEntry>();
  #restarts = new Map<string, { count: number; timer?: ReturnType<typeof setTimeout> }>();
  /** Whether Docker answers on this computer: asked at most every 30 seconds. */
  #dockerSeen?: { at: number; up: boolean };

  /** Tests only: hosts a service's requests go to over plain HTTP on this computer, by port. */
  readonly #testHosts: () => Record<string, number>;

  /** `docker`: how to call Docker (tests put a stand-in there). */
  constructor(docker: () => string[], testHosts: () => Record<string, number> = () => ({})) {
    this.#docker = docker;
    this.#testHosts = testHosts;
  }

  dockerUp(): boolean {
    if (this.#dockerSeen && Date.now() - this.#dockerSeen.at < 30_000) return this.#dockerSeen.up;
    const [program, ...first] = this.#docker();
    const probe = spawnSync(program, [...first, 'version', '--format', '{{.Server.Version}}'], { encoding: 'utf8', timeout: 8000, windowsHide: true });
    const up = probe.status === 0 && !!probe.stdout.trim();
    this.#dockerSeen = { at: Date.now(), up };
    return up;
  }

  /** The release's image, when it has one and Docker runs here. */
  containerOf(app: AppManifest | undefined): AppImage | undefined {
    const image = app?.install?.image;
    return image && app?.start?.image && this.dockerUp() ? image : undefined;
  }

  /**
   * How a release's container runs: by its digest, with only the services' ports (on 127.0.0.1; on Linux in the
   * host's network, so tunnel ports stay as they are), no extra privileges, nothing of the computer mounted, and its
   * settings and Weave's variables by name only (their values come from the environment, not the command line).
   */
  dockerRun(container: string, app: AppManifest, names: string[]): string[] {
    const image = app.install!.image!;
    const linux = process.platform === 'linux';
    const network = linux ? ['--network', 'host'] : app.services.flatMap((s) => ['-p', `127.0.0.1:${s.port}:${s.port}${s.protocol === 'tcp' ? '/tcp' : ''}`]);
    // A Weave service: read-only, limited, and what it keeps in a volume of its own.
    const sandbox = image.packaged
      ? ['--read-only', '--tmpfs', `/tmp:rw,size=${SANDBOX.tmp}`, '--memory', SANDBOX.memory, '--cpus', SANDBOX.cpus, '--pids-limit', SANDBOX.pids, '-v', `${container}:/data`, '-e', 'WEAVE_DATA=/data']
      : [];
    return [
      ...this.#docker(),
      'run',
      '--rm',
      '--name',
      container,
      '--cap-drop',
      'ALL',
      '--cap-add',
      'NET_BIND_SERVICE',
      '--security-opt',
      'no-new-privileges',
      ...(linux ? [] : ['--add-host', 'host.docker.internal:host-gateway']),
      ...sandbox,
      ...network,
      ...names.flatMap((n) => ['-e', n]),
      `${image.ref}@${image.digest}`,
    ];
  }

  /**
   * How a release runs here: in Weave (WebAssembly), as its container when Docker runs, or, with neither, as the
   * program it brings for this platform. The first two are sealed off from the computer and preferred; a program runs
   * with its person's rights, so it runs only once they accepted a warning for exactly that release and file (a
   * website service checks that: see Services.launchWebsite), and never for a service.
   */
  runs(app: AppManifest): 'container' | 'wasm' | 'program' | undefined {
    // A WebAssembly service runs in Weave itself, anywhere: from its image, or its release file for wasm.
    if (app.wasm && (app.install?.image || app.install?.assets?.wasm)) return 'wasm';
    if (this.containerOf(app)) return 'container';
    if (this.program(app)) return 'program';
    return undefined;
  }

  /** The program a release brings for this computer, if any: run only behind a warning. */
  program(app: AppManifest): ReleaseProgram | undefined {
    return releaseProgram(app, platformKey());
  }

  /** Why a release doesn't run here, in words. */
  whyNot(app: AppManifest): string {
    const name = [app.name, app.install?.tag].filter(Boolean).join(' ');
    if (app.install?.image?.packaged) return `${app.name} is a Weave service: it runs in a container, and Docker isn't running here`;
    const platforms = programPlatforms(app);
    if (app.install?.image) return `${name} runs in a container, and Docker isn't running here${platforms.length ? ` (its program is for ${platforms.join(', ')}, not this computer, ${platformKey()})` : ''}`;
    if (platforms.length) return `${name} brings a program for ${platforms.join(', ')}, none for this computer (${platformKey()}), and no container image or WebAssembly`;
    return `${name} has nothing Weave runs: no container image, no WebAssembly, no program for this computer`;
  }

  /** What running a release here runs: its container (by this name), its component in Weave, or its program. */
  command(container: string, app: AppManifest): string[] | undefined {
    const runs = this.runs(app);
    if (runs === 'container') return this.dockerRun(container, app, [...(app.env ?? []).map((e) => e.name), 'WEAVE_API', 'WEAVE_TOKEN', 'WEAVE_PROJECT', 'WEAVE_WEBSITE', 'WEAVE_SERVICE', 'WEAVE_SERVICE_API', 'WEAVE_SERVICE_TOKEN', 'PORT']);
    if (runs === 'wasm') return [`${app.wasm!.component} (WebAssembly, in Weave)`];
    if (runs === 'program') return this.program(app)!.command;
    return undefined;
  }

  /** What a release runs, in words for an approval: here, or wherever Docker runs. */
  runText(app: AppManifest): string {
    const here = this.command('weave', app);
    if (here) return this.runs(app) === 'program' ? `${here.join(' ')} (a program from ${this.program(app)!.asset.file}, on this computer with your rights)` : here.join(' ');
    if (app.wasm) return `${app.wasm.component} (WebAssembly, in Weave)`;
    return app.install?.image ? `the container ${app.install.image.ref}@${app.install.image.digest}` : 'nothing';
  }

  running(key: string): boolean {
    return this.#procs.has(key) || this.#wasm.has(key);
  }

  /** How many things run now. */
  get size(): number {
    return this.#procs.size + this.#wasm.size;
  }

  /** Crashed: start again, waiting longer each time. */
  #again(key: string, again: () => void): void {
    const restarts = this.#restarts.get(key) ?? { count: 0 };
    restarts.count++;
    restarts.timer = setTimeout(again, RESTART_WAITS[Math.min(restarts.count - 1, RESTART_WAITS.length - 1)]);
    restarts.timer.unref?.();
    this.#restarts.set(key, restarts);
  }

  /** Run a component under this key, in a worker of its own; when it crashes (or hangs), `again` after a wait. */
  /** Whether a service may send a request to this host: its contract names it, and it isn't on this computer's networks. */
  async #reach(run: WasmRun, host: string): Promise<void> {
    if (!netAllows(run.net, host)) throw new Error(`${host} isn't among the hosts its contract names`);
    if (this.#testHosts()[host]) return;
    const addresses = await lookup(host, { all: true });
    if (!addresses.length || addresses.some((a) => nearby(a.address))) throw new Error(`${host} is on this computer's networks`);
  }

  startWasm(key: string, run: WasmRun, again: () => void): void {
    if (this.running(key) || !WASM_WORKER) return;
    mkdirSync(dirname(run.log), { recursive: true });
    mkdirSync(run.data, { recursive: true });
    const log = createWriteStream(run.log, { flags: 'a' });
    const { port1, port2 } = new MessageChannel();
    const flag = new SharedArrayBuffer(4);
    const waiting = new Int32Array(flag);
    const worker = new Worker(WASM_WORKER, {
      workerData: { dir: run.dir, entry: run.entry, data: run.data, host: port2, flag, testHosts: this.#testHosts() },
      transferList: [port2],
      resourceLimits: { maxOldGenerationSizeMb: WASM_LIMITS.memoryMb },
      // Its own output only: nothing of the daemon's environment.
      env: {},
      stdout: true,
      stderr: true,
    });
    worker.stdout.pipe(log, { end: false });
    worker.stderr.pipe(log, { end: false });
    const entry: WasmEntry = { worker, stopping: false, ready: false, queue: [], next: () => {}, players: new Map() };
    this.#wasm.set(key, entry);
    // Its calls to the host: answered here (they may take a while), then it goes on. Weave's own time doesn't count
    // against its limit: the task's time starts again once a call is answered.
    port1.on('message', async ({ name, args }: { name: string; args: unknown[] }) => {
      if (entry.busy) clearTimeout(entry.busy.timer);
      let reply: { value?: unknown; error?: string };
      try {
        reply = { value: name === 'reach' ? await this.#reach(run, String(args[0])) : await run.host(name, args) };
      } catch (error) {
        reply = { error: (error as Error)?.message ?? String(error) };
      }
      port1.postMessage(reply);
      Atomics.store(waiting, 0, 1);
      Atomics.notify(waiting, 0);
      if (entry.busy) entry.busy.timer = setTimeout(entry.busy.expire, run.taskMs ?? WASM_LIMITS.eventMs);
    });
    const queue = (task: WasmTask) => {
      entry.queue.push(task);
      entry.next();
    };
    entry.next = () => {
      if (entry.busy || !entry.ready || entry.stopping) return;
      const task = entry.queue.shift();
      if (task === undefined) return;
      // Too long on one task: it's given up, and the worker ends (and starts again).
      const expire = () => {
        log.write(`weave: ${run.name} took longer than ${(run.taskMs ?? WASM_LIMITS.eventMs) / 1000}s on ${task.type === 'event' ? 'an event' : task.type === 'call' ? task.fn : `a player's ${task.type}`}: stopped\n`);
        if (task.type === 'event') run.handled?.(task.item, 'took too long');
        if (task.type === 'call') task.reply(undefined, `${run.name} took too long`);
        void worker.terminate();
      };
      entry.busy = { task, timer: setTimeout(expire, run.taskMs ?? WASM_LIMITS.eventMs), expire };
      worker.postMessage(task.type === 'call' ? { type: 'call', fn: task.fn, args: task.args } : task);
    };
    worker.on('message', (message: { type: string; error?: string; value?: unknown; op?: string; player?: string; message?: string; ms?: number }) => {
      // What it does with its players: right away, without waiting for it.
      if (message.type === 'players') {
        if (message.op === 'send') entry.players.get(message.player ?? '')?.send(message.message ?? '');
        if (message.op === 'broadcast') for (const player of entry.players.values()) player.send(message.message ?? '');
        if (message.op === 'disconnect') entry.players.get(message.player ?? '')?.close();
        if (message.op === 'tick') {
          if (entry.ticker) clearInterval(entry.ticker);
          entry.ticker = message.ms ? setInterval(() => !entry.queue.some((t) => t.type === 'tick') && queue({ type: 'tick' }), Math.max(50, message.ms)) : undefined;
          entry.ticker?.unref?.();
        }
        return;
      }
      if (message.type === 'ready') {
        entry.ready = true;
        run.ready?.();
      }
      if (message.type === 'done' && entry.busy) {
        clearTimeout(entry.busy.timer);
        if (message.error) log.write(`weave: ${run.name} failed on ${entry.busy.task.type === 'event' ? 'an event' : `a player's ${entry.busy.task.type}`}: ${message.error}\n`);
        if (entry.busy.task.type === 'event') run.handled?.(entry.busy.task.item, message.error);
        if (entry.busy.task.type === 'call') entry.busy.task.reply(message.value, message.error);
        entry.busy = undefined;
      }
      entry.next();
    });
    worker.on('error', (error: Error) => log.write(`weave: ${run.name} stopped: ${error.message}\n`));
    worker.on('exit', (code) => {
      if (entry.busy) clearTimeout(entry.busy.timer);
      // Calls it won't answer any more: answered as failed.
      for (const task of [entry.busy?.task, ...entry.queue]) if (task?.type === 'call') task.reply(undefined, `${run.name} stopped`);
      if (entry.ticker) clearInterval(entry.ticker);
      for (const player of entry.players.values()) player.close();
      entry.server?.close();
      port1.close();
      log.write(`weave: ${run.name} exited (${code})\n`);
      log.end();
      if (this.#wasm.get(key) === entry) this.#wasm.delete(key);
      if (!entry.stopping) this.#again(key, again);
    });
    if (run.site) this.#serveSite(key, entry, run.site, queue);
  }

  /** Where each component's website listened last: the same port again after a restart, so its address stays. */
  #sitePorts = new Map<string, number>();

  /**
   * A component's website, on 127.0.0.1: its files (its site folder, nothing outside it), and its players'
   * WebSockets at /weave/socket, which Weave holds: each player's arrival, messages and leaving become its tasks.
   */
  #serveSite(key: string, entry: WasmEntry, site: NonNullable<WasmRun['site']>, queue: (task: WasmTask) => void): void {
    const folder = site.folder ? resolvePath(site.folder) : undefined;
    const server = createHttpServer((req, res) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') return void res.writeHead(405).end();
      if (!site.who(req)) return void res.writeHead(403).end();
      const path = decodeURIComponent(new URL(req.url ?? '/', 'http://site').pathname);
      let file = folder ? resolvePath(folder, `.${path}`) : undefined;
      if (!file || (file !== folder && !file.startsWith(folder + sep))) return void res.writeHead(404).end();
      if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
      if (!existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end();
      res.writeHead(200, { 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-cache' });
      if (req.method === 'HEAD') return void res.end();
      createReadStream(file).pipe(res);
    });
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const person = site.who(req);
      if (!person || new URL(req.url ?? '/', 'http://site').pathname !== '/weave/socket') return void socket.destroy();
      const id = randomBytes(6).toString('base64url');
      const connection = acceptWebSocket(req, socket, head, {
        message: (message) => queue({ type: 'message', player: id, message }),
        close: () => {
          if (entry.players.delete(id)) queue({ type: 'leave', player: id });
        },
      });
      if (!connection) return void socket.destroy();
      entry.players.set(id, connection);
      queue({ type: 'join', player: JSON.stringify({ id, ...person }) });
    });
    entry.server = server;
    void listenNear(server, this.#sitePorts.get(key) ?? 0).then(
      (port) => {
        this.#sitePorts.set(key, port);
        if (!entry.stopping) site.listening(port);
      },
      () => {},
    );
  }

  /** Call one of a running component's functions: one call (or event) at a time, under the same time limit. */
  callWasm(key: string, fn: string, args: unknown[]): Promise<unknown> {
    const entry = this.#wasm.get(key);
    if (!entry) return Promise.reject(new Error('not running'));
    return new Promise((resolve, reject) => {
      entry.queue.push({ type: 'call', fn, args, reply: (value, error) => (error === undefined ? resolve(value) : reject(new Error(error))) });
      entry.next();
    });
  }

  /** Hand a running component an event: it handles them one at a time, in order. */
  deliver(key: string, item: string): void {
    const entry = this.#wasm.get(key);
    if (!entry) return;
    entry.queue.push({ type: 'event', item });
    entry.next();
  }

  /** Run it under this key; when it crashes, `again` is called after a wait that grows each time. */
  start(key: string, run: Run, again: () => void): void {
    if (this.#procs.has(key)) return;
    mkdirSync(dirname(run.log), { recursive: true });
    mkdirSync(run.cwd, { recursive: true });
    if (run.container) {
      // One left from before (a crash, a stop that didn't reach Docker) would block the name.
      const [docker, ...first] = this.#docker();
      spawnSync(docker, [...first, 'rm', '-f', run.container], { windowsHide: true, timeout: 20_000 });
    }
    const [named, ...args] = run.command;
    const program = !run.container && !isAbsolute(named) && existsSync(join(run.cwd, named)) ? join(run.cwd, named) : named;
    const log = createWriteStream(run.log, { flags: 'a' });
    const child = spawn(program, args, {
      cwd: run.cwd,
      env: { PATH: process.env.PATH ?? '', SYSTEMROOT: process.env.SYSTEMROOT ?? '', ...run.env },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    // The log ends once, after both outputs are drained: not by whichever pipe closes first.
    child.stdout?.pipe(log, { end: false });
    child.stderr?.pipe(log, { end: false });
    const entry = { child, stopping: false, ...(run.container ? { container: run.container } : {}) };
    this.#procs.set(key, entry);
    child.on('error', (error) => !log.writableEnded && log.write(`weave: couldn't start ${run.name}: ${error.message}\n`));
    child.on('close', (code) => {
      log.end(`weave: ${run.name} exited (${code})\n`);
      if (this.#procs.get(key) === entry) this.#procs.delete(key);
      if (!entry.stopping) this.#again(key, again);
    });
  }

  /** Stop it, and don't start it again. A container is stopped through Docker: ending its docker client wouldn't. */
  stop(key: string): void {
    const restarts = this.#restarts.get(key);
    if (restarts?.timer) clearTimeout(restarts.timer);
    this.#restarts.delete(key);
    const wasm = this.#wasm.get(key);
    if (wasm) {
      wasm.stopping = true;
      if (wasm.busy) clearTimeout(wasm.busy.timer);
      if (wasm.ticker) clearInterval(wasm.ticker);
      for (const player of wasm.players.values()) player.close();
      wasm.server?.close();
      void wasm.worker.terminate();
      this.#wasm.delete(key);
    }
    const entry = this.#procs.get(key);
    if (!entry) return;
    entry.stopping = true;
    if (entry.container) {
      const [docker, ...first] = this.#docker();
      spawnSync(docker, [...first, 'stop', '-t', '5', entry.container], { windowsHide: true, timeout: 20_000 });
    }
    entry.child.kill();
    this.#procs.delete(key);
  }

  stopAll(): void {
    for (const key of [...this.#procs.keys(), ...this.#wasm.keys(), ...this.#restarts.keys()]) this.stop(key);
  }
}

/**
 * What you approve when you approve a release: this release (its event), and what it says it starts on any
 * computer (its build commands, its image). The same on a computer and on an always-on node. Canonical: the same
 * release reads the same however it was stored (sealed storage sorts keys).
 */
export const releaseApproval = (a: { id: string; manifest: AppManifest }): string =>
  launchFingerprint(['release', canonicalJson((a.manifest.start ?? {}) as unknown as Json), canonicalJson((a.manifest.install?.image ?? null) as unknown as Json)], a.id);

/**
 * What a person consents to when they let a release's program run on their computer: this release (its event) and
 * exactly this file by its SHA-256, with the command that runs it, all read from the signed release. Another version,
 * or the same file name with other bytes, is another consent. The settings they give it aren't part of it: those are
 * their own, given per website, and change nothing about what runs.
 */
export const programConsent = (a: { id: string; manifest: AppManifest }, program: ReleaseProgram): string =>
  launchFingerprint(['program', program.platform, program.asset.file, program.asset.sha256, ...program.command], a.id);
