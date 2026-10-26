import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { canonicalJson, startCommand, type AppImage, type AppManifest, type Json } from '@weave/core';
import { platformKey } from './appinstall.ts';
import { launchFingerprint } from './applaunch.ts';

/*
 * The runtime: what runs code on this node. It starts processes and containers under a key (a service, a
 * website's handler), keeps them going (started again, waiting longer each time, when they crash), and stops them,
 * a container through Docker. It knows how a release runs here (its build for this platform, or its image) and
 * what approving one means. It knows nothing of spaces, keys or contracts: whoever starts something decides what
 * it gets.
 */

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

/** Waits before starting something again that crashed: longer each time. */
const RESTART_WAITS = [1000, 5000, 30_000, 60_000];

export class Runtime {
  readonly #docker: () => string[];
  #procs = new Map<string, { child: ChildProcess; stopping: boolean; container?: string }>();
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

  /** What running a release here runs: its build's command, or its container (by this name). */
  command(container: string, app: AppManifest): string[] | undefined {
    const runs = this.runs(app);
    if (runs === 'container') return this.dockerRun(container, app, [...(app.env ?? []).map((e) => e.name), 'WEAVE_API', 'WEAVE_TOKEN', 'WEAVE_PROJECT', 'WEAVE_ROOM', 'WEAVE_SERVICE', 'WEAVE_SERVICE_API', 'WEAVE_SERVICE_TOKEN', 'PORT']);
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
    return this.#procs.has(key);
  }

  /** How many things run now. */
  get size(): number {
    return this.#procs.size;
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
      if (entry.stopping) return;
      // Crashed: start again, waiting longer each time.
      const restarts = this.#restarts.get(key) ?? { count: 0 };
      restarts.count++;
      restarts.timer = setTimeout(again, RESTART_WAITS[Math.min(restarts.count - 1, RESTART_WAITS.length - 1)]);
      restarts.timer.unref?.();
      this.#restarts.set(key, restarts);
    });
  }

  /** Stop it, and don't start it again. A container is stopped through Docker: ending its docker client wouldn't. */
  stop(key: string): void {
    const restarts = this.#restarts.get(key);
    if (restarts?.timer) clearTimeout(restarts.timer);
    this.#restarts.delete(key);
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
    for (const key of [...this.#procs.keys(), ...this.#restarts.keys()]) this.stop(key);
  }
}

/**
 * What you approve when you approve a release: this release (its event), and what it says it starts on any
 * computer (its build commands, its image). The same on a computer and on an always-on node. Canonical: the same
 * release reads the same however it was stored (sealed storage sorts keys).
 */
export const releaseApproval = (a: { id: string; manifest: AppManifest }): string =>
  launchFingerprint(['release', canonicalJson((a.manifest.start ?? {}) as unknown as Json), canonicalJson((a.manifest.install?.image ?? null) as unknown as Json)], a.id);
