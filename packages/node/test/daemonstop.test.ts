import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeOpenStores, connectDaemon, daemonInfo, loadConfig, resolveHome, saveConfig, startDaemon, stopDaemon, WeaveNode } from '../src/index.ts';

/*
 * Stopping and restarting the daemon properly (not ending it from outside, which on Windows skips closing the
 * node), and what daemon.json tells clients about it. The homes here never go on the network: their bootstrap
 * points nowhere, and they join no starter groups.
 */

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

async function offlineHome(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'weave-stop-'));
  dirs.push(dir);
  const node = WeaveNode.init('Stopper', dir);
  await node.close();
  const home = resolveHome(dir);
  saveConfig(home, { ...loadConfig(home), bootstrap: [{ host: '127.0.0.1', port: 1 }] });
  return dir;
}

const cli = join(import.meta.dirname, '..', '..', 'cli', 'src', 'main.ts');
const runCli = (dir: string, args: string[]) =>
  new Promise<{ code: number | null; out: string }>((resolve) => {
    const p = spawn(process.execPath, [cli, '--home', dir, ...args], { env: process.env });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('exit', (code) => resolve({ code, out }));
  });
const until = async (check: () => Promise<boolean> | boolean, ms = 20_000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await check()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
};

describe('stopping the daemon', { timeout: 120_000 }, () => {
  it('stops on request over its API, after closing the node, and says what it is in daemon.json', async () => {
    const dir = await offlineHome();
    let asked = 0;
    const daemon = await startDaemon(dir, { version: '9.9.9', build: 'dev', startedBy: 'app', onStopRequest: () => void (asked++, daemon.stop()) });
    expect(daemonInfo(resolveHome(dir))).toMatchObject({ pid: process.pid, version: '9.9.9', build: 'dev', startedBy: 'app' });
    const client = (await connectDaemon(resolveHome(dir)))!;
    await client.stop();
    expect(await until(() => !existsSync(resolveHome(dir).daemon))).toBe(true);
    expect(asked).toBe(1);
    expect(await connectDaemon(resolveHome(dir))).toBeUndefined();
  });

  it('weave daemon stop and restart: a real daemon process exits by itself, and a new one comes up', async () => {
    const dir = await offlineHome();
    const home = resolveHome(dir);
    const first = spawn(process.execPath, [cli, '--home', dir, 'daemon'], { env: process.env, stdio: 'ignore' });
    const exited = new Promise<number | null>((resolve) => first.on('exit', (code) => resolve(code)));
    expect(await until(async () => !!(await connectDaemon(home)))).toBe(true);
    // Run from the source: a development build, started by hand.
    expect(daemonInfo(home)).toMatchObject({ pid: first.pid, build: 'dev', startedBy: 'cli' });

    const restarted = await runCli(dir, ['daemon', 'restart']);
    expect(restarted.out).toMatch(/restarted the daemon/);
    // The first one exited on its own, cleanly: nothing ended it from outside.
    expect(await exited).toBe(0);
    const second = daemonInfo(home)!;
    expect(second.pid).not.toBe(first.pid);
    expect(second.startedBy).toBe('cli');
    expect(await connectDaemon(home)).toBeTruthy();

    // And stopping it: gone, with its files.
    expect((await runCli(dir, ['daemon', 'stop'])).out).toMatch(/stopped the daemon/);
    expect(existsSync(home.daemon)).toBe(false);
    expect(existsSync(home.lock)).toBe(false);
    expect(await stopDaemon(home)).toBe(false);
    expect((await runCli(dir, ['daemon', 'stop'])).out).toMatch(/no daemon running/);
  });
});
