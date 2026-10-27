import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MessageChannel, Worker } from 'node:worker_threads';
import { canonicalJson, startCommand, type AppImage, type AppManifest, type Json } from '@weave/core';
import { platformKey } from './appinstall.ts';
import { launchFingerprint } from './applaunch.ts';

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
 * of its own (wasmworker.ts) with a memory limit, and gets only its /data folder and the host's functions. It
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
  /** Answers its calls to the host (me, setting, publish, answer, log); a throw is the call's error. */
  host(name: string, args: unknown[]): unknown;
  /** It's ready: hand it what it missed. */
  ready?(): void;
  /** An event was handled, or given up (`error`): either way the next one comes. */
  handled?(item: string, error?: string): void;
}

/** A component running: its worker, the events waiting, the one it's on, and how to hand it the next. */
interface WasmEntry {
  worker: Worker;
  stopping: boolean;
  ready: boolean;
  queue: string[];
  busy?: { item: string; timer: ReturnType<typeof setTimeout> };
  next(): void;
}

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

  /** `docker`: how to call Docker (tests put a stand-in there). */
  constructor(docker: () => string[]) {
    this.#docker = docker;
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

  /** How a release runs here: its container when it has one and Docker runs, else its build for this platform. */
  runs(app: AppManifest): 'release' | 'container' | undefined {
    if (this.containerOf(app)) return 'container';
    return app.install?.assets?.[platformKey()] && startCommand(app, platformKey(), true) ? 'release' : undefined;
  }

  /** Why a release doesn't run here, in words. */
  whyNot(app: AppManifest): string {
    if (app.install?.image?.packaged) return `${app.name} is a Weave service: it runs in a container, and Docker isn't running here`;
    return `${[app.name, app.install?.tag].filter(Boolean).join(' ')} has no release file for this computer (${platformKey()})${app.install?.image ? ", and Docker isn't running here" : ''}`;
  }

  /** What running a release here runs: its build's command, or its container (by this name). */
  command(container: string, app: AppManifest): string[] | undefined {
    const runs = this.runs(app);
    if (runs === 'container') return this.dockerRun(container, app, [...(app.env ?? []).map((e) => e.name), 'WEAVE_API', 'WEAVE_TOKEN', 'WEAVE_PROJECT', 'WEAVE_WEBSITE', 'WEAVE_SERVICE', 'WEAVE_SERVICE_API', 'WEAVE_SERVICE_TOKEN', 'PORT']);
    return runs === 'release' ? startCommand(app, platformKey(), true) : undefined;
  }

  /** What a release runs, in words for an approval: here, or on another computer (by platform). */
  runText(app: AppManifest): string {
    const here = this.command('weave', app);
    if (here) return here.join(' ');
    const builds = Object.entries(app.start?.release ?? {}).map(([platform, command]) => `${command.join(' ')} (${platform})`);
    return [...builds, ...(app.install?.image ? [`the container ${app.install.image.ref}@${app.install.image.digest}`] : [])].join(', ') || 'nothing';
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
  startWasm(key: string, run: WasmRun, again: () => void): void {
    if (this.running(key) || !WASM_WORKER) return;
    mkdirSync(dirname(run.log), { recursive: true });
    mkdirSync(run.data, { recursive: true });
    const log = createWriteStream(run.log, { flags: 'a' });
    const { port1, port2 } = new MessageChannel();
    const flag = new SharedArrayBuffer(4);
    const waiting = new Int32Array(flag);
    const worker = new Worker(WASM_WORKER, {
      workerData: { dir: run.dir, entry: run.entry, data: run.data, host: port2, flag },
      transferList: [port2],
      resourceLimits: { maxOldGenerationSizeMb: WASM_LIMITS.memoryMb },
      // Its own output only: nothing of the daemon's environment.
      env: {},
      stdout: true,
      stderr: true,
    });
    worker.stdout.pipe(log, { end: false });
    worker.stderr.pipe(log, { end: false });
    const entry: WasmEntry = { worker, stopping: false, ready: false, queue: [], next: () => {} };
    this.#wasm.set(key, entry);
    // Its calls to the host: answered here (they may take a while), then it goes on.
    port1.on('message', async ({ name, args }: { name: string; args: unknown[] }) => {
      let reply: { value?: unknown; error?: string };
      try {
        reply = { value: await run.host(name, args) };
      } catch (error) {
        reply = { error: (error as Error)?.message ?? String(error) };
      }
      port1.postMessage(reply);
      Atomics.store(waiting, 0, 1);
      Atomics.notify(waiting, 0);
    });
    entry.next = () => {
      if (entry.busy || !entry.ready || entry.stopping) return;
      const item = entry.queue.shift();
      if (item === undefined) return;
      // Too long on one event: it's given up, and the worker ends (and starts again).
      const timer = setTimeout(() => {
        log.write(`weave: ${run.name} took longer than ${WASM_LIMITS.eventMs / 1000}s on an event: stopped\n`);
        run.handled?.(item, 'took too long');
        void worker.terminate();
      }, WASM_LIMITS.eventMs);
      entry.busy = { item, timer };
      worker.postMessage({ type: 'event', item });
    };
    worker.on('message', (message: { type: string; error?: string }) => {
      if (message.type === 'ready') {
        entry.ready = true;
        run.ready?.();
      }
      if (message.type === 'done' && entry.busy) {
        clearTimeout(entry.busy.timer);
        if (message.error) log.write(`weave: ${run.name} failed on an event: ${message.error}\n`);
        run.handled?.(entry.busy.item, message.error);
        entry.busy = undefined;
      }
      entry.next();
    });
    worker.on('error', (error: Error) => log.write(`weave: ${run.name} stopped: ${error.message}\n`));
    worker.on('exit', (code) => {
      if (entry.busy) clearTimeout(entry.busy.timer);
      port1.close();
      log.write(`weave: ${run.name} exited (${code})\n`);
      log.end();
      if (this.#wasm.get(key) === entry) this.#wasm.delete(key);
      if (!entry.stopping) this.#again(key, again);
    });
  }

  /** Hand a running component an event: it handles them one at a time, in order. */
  deliver(key: string, item: string): void {
    const entry = this.#wasm.get(key);
    if (!entry) return;
    entry.queue.push(item);
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
    child.stdout?.pipe(log);
    child.stderr?.pipe(log);
    const entry = { child, stopping: false, ...(run.container ? { container: run.container } : {}) };
    this.#procs.set(key, entry);
    child.on('error', (error) => log.write(`weave: couldn't start ${run.name}: ${error.message}\n`));
    child.on('exit', (code) => {
      log.write(`weave: ${run.name} exited (${code})\n`);
      log.end();
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
