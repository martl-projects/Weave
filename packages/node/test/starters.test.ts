import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Socket } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { closeOpenStores, WeaveNode } from '../src/index.ts';
import { readSecretJson } from '../src/vault.ts';
import { buildComponent } from './helpers/components.ts';

/*
 * The starters (W4): what someone writing a WebAssembly service starts from. Made the way they'd make it
 * (weave service new, then the starter's own build command), and run the way it would run: the bot answers, the
 * quiz is played by its host and two players Weave vouches for.
 */

const root = join(import.meta.dirname, '..', '..', '..');
const starters = join(root, 'packages', 'sdk', 'starters');
const dirs: string[] = [];
const nodes: WeaveNode[] = [];
const tempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-starters-'));
  nodes.push(node);
  return node;
}
const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};
const tokenOf = (node: WeaveNode, name: string) => readSecretJson<Array<{ name: string; token: string }>>(node.home, join(node.home.dir, 'services.json'))!.find((s) => s.name === name)!.token;

/** A starter made as someone would: weave service new, then its package.json's build command (jco componentize). */
let bot: string;
beforeAll(async () => {
  const home = tempDir('weave-starters-cli-');
  const folder = join(tempDir('weave-starters-made-'), 'hello-bot');
  const made = spawnSync(process.execPath, [join(root, 'packages', 'cli', 'src', 'main.ts'), '--home', home, 'service', 'new', folder], { encoding: 'utf8', env: { ...process.env, WEAVE_KEYSTORE: 'file' } });
  expect(made.status, made.stderr).toBe(0);
  expect(made.stdout).toMatch(/npm run build[^]*weave service add hello-bot --wasm service\.wasm/);
  const script = (JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8')) as { scripts: { build: string } }).scripts.build;
  expect(script).toMatch(/^jco componentize /);
  const jco = join(root, 'node_modules', '@bytecodealliance', 'jco', 'dist', 'jco.js');
  const built = spawnSync(process.execPath, [jco, ...script.split(' ').slice(1)], { cwd: folder, encoding: 'utf8' });
  expect(built.status, built.stderr + built.stdout).toBe(0);
  bot = join(folder, 'service.wasm');
  expect(existsSync(bot)).toBe(true);
}, 240_000);

/** A player's WebSocket, as the website service hands it on: with their X-Weave-Person (the host's own browser: none). JSON both ways. */
function playerSocket(port: number, person: string): Promise<{ got: Array<Record<string, unknown>>; say(message: unknown): void; close(): void }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path: '/weave/socket', headers: { connection: 'Upgrade', upgrade: 'websocket', 'sec-websocket-version': '13', 'sec-websocket-key': 'dGhlIHNhbXBsZSBub25jZQ==', ...(person ? { 'x-weave-person': person } : {}) } });
    req.on('upgrade', (_res, socket: Socket) => {
      const got: Array<Record<string, unknown>> = [];
      let buffer = Buffer.alloc(0);
      socket.on('data', (chunk: Buffer) => {
        buffer = Buffer.concat([buffer, chunk]);
        // Frames from the server: unmasked text.
        while (buffer.length >= 2) {
          let length = buffer[1] & 0x7f;
          let at = 2;
          if (length === 126) [length, at] = [buffer.readUInt16BE(2), 4];
          if (buffer.length < at + length) return;
          if ((buffer[0] & 0x0f) === 1) got.push(JSON.parse(buffer.subarray(at, at + length).toString('utf8')) as Record<string, unknown>);
          buffer = buffer.subarray(at + length);
        }
      });
      resolve({
        got,
        // Frames from a browser: masked.
        say: (message) => {
          const payload = Buffer.from(JSON.stringify(message));
          const mask = Buffer.from([1, 2, 3, 4]);
          const masked = Buffer.from(payload.map((b, i) => b ^ mask[i % 4]));
          socket.write(Buffer.concat([Buffer.from([0x81, 0x80 | payload.length]), mask, masked]));
        },
        close: () => socket.destroy(),
      });
    });
    req.on('error', reject);
    req.end();
  });
}

const vouch = (token: string, person: Record<string, unknown>) => {
  const payload = Buffer.from(JSON.stringify({ ...person, t: Math.floor(Date.now() / 1000) })).toString('base64url');
  return `${payload}.${createHmac('sha256', token).update(payload).digest('base64url')}`;
};

describe('the starters', { timeout: 120_000 }, () => {
  it('JavaScript service: made with weave service new, built with its own command, it answers and remembers', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Bots' });
    await lena.joinSpace(await martl.invite('Bots'));
    sync([martl, lena]);
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    try {
      await martl.addService({ name: 'hello-bot', contract: { reads: 'addressed', writes: [], version: '1.0' }, spaces: ['Bots'], wasm: bot, settings: { GREETING: 'Servus' } });
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000 });
      sync([martl, lena]);
      await lena.askService({ space: 'Bots', service: 'martl/hello-bot', text: 'one' });
      await lena.askService({ space: 'Bots', service: 'martl/hello-bot', text: 'two' });
      await vi.waitFor(
        async () => {
          sync([martl, lena]);
          const answers = (await lena.serviceRequests({ space: 'Bots' })).map((r) => r.results[0]?.text).sort();
          expect(answers).toEqual(['Servus from hello-bot! You asked "one" (that\'s 1 time now).', 'Servus from hello-bot! You asked "two" (that\'s 2 times now).']);
        },
        { timeout: 30_000, interval: 300 },
      );
    } finally {
      await martl.removeService('hello-bot').catch(() => {});
      await api.close();
    }
  });

  it('JavaScript website: the buzzer quiz, played by its host and two players', async () => {
    const quiz = await buildComponent(join(starters, 'js-website', 'src', 'game.js'), 'website');
    const martl = person('martl');
    await martl.createProject({ name: 'Club' });
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    try {
      await martl.addService({ builtin: 'website', spaces: ['Club'] });
      await martl.addService({ name: 'quiz', description: 'Buzzer quiz', contract: { reads: 'nothing', writes: [], website: true, version: '1.0' }, spaces: ['Club'], wasm: quiz, site: join(starters, 'js-website', 'site') });
      const hosted = await vi.waitFor(
        async () => {
          const found = (await martl.websites('Club')).find((r) => r.name === 'Buzzer quiz' && r.url);
          expect(found).toBeTruthy();
          return found!;
        },
        { timeout: 30_000, interval: 200 },
      );
      const port = Number(new URL(hosted.url!).port);
      expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toContain('<title>Buzzer quiz</title>');
      expect(await (await fetch(`http://127.0.0.1:${port}/app.js`)).text()).toContain('/weave/socket');

      // martl (the host: on this computer), Lena and Kofi (players the website service vouches for).
      const token = tokenOf(martl, 'quiz');
      const host = await playerSocket(port, '');
      const lena = await playerSocket(port, vouch(token, { did: 'did:key:z6MkLena', name: 'Lena', host: false, member: true, maintainer: false }));
      const kofi = await playerSocket(port, vouch(token, { did: 'did:key:z6MkKofi', name: 'Kofi', host: false, member: true, maintainer: false }));
      const last = (p: { got: Array<Record<string, unknown>> }) => [...p.got].reverse().find((m) => m.type === 'state') as { round: { question: string; buzzed?: string } | null; scores: Array<{ name: string; points: number }>; players: Array<{ name: string }> } | undefined;
      await vi.waitFor(() => expect(last(host)?.players.map((p) => p.name).sort()).toEqual(['Kofi', 'Lena', 'martl']), { timeout: 10_000 });
      expect(lena.got.find((m) => m.type === 'welcome')).toEqual({ type: 'welcome', you: { name: 'Lena', host: false } });

      // Only the host asks; a player can't.
      lena.say({ type: 'ask', question: 'Sneaky?' });
      host.say({ type: 'ask', question: 'Capital of Austria?' });
      await vi.waitFor(() => expect(last(kofi)?.round?.question).toBe('Capital of Austria?'), { timeout: 10_000 });
      // Kofi buzzes first, and is wrong: the others may buzz again, he may not.
      kofi.say({ type: 'buzz' });
      await vi.waitFor(() => expect(last(host)?.round?.buzzed).toBe('Kofi'), { timeout: 10_000 });
      host.say({ type: 'wrong' });
      await vi.waitFor(() => expect(last(host)?.round?.buzzed).toBeFalsy(), { timeout: 10_000 });
      kofi.say({ type: 'buzz' });
      lena.say({ type: 'buzz' });
      await vi.waitFor(() => expect(last(host)?.round?.buzzed).toBe('Lena'), { timeout: 10_000 });
      host.say({ type: 'right' });
      await vi.waitFor(() => expect(last(lena)?.scores).toEqual([{ name: 'Lena', points: 1, did: 'did:key:z6MkLena' }]), { timeout: 10_000 });
      // The scores are kept, by Weave id, for the next run.
      expect(JSON.parse(readFileSync(join(martl.home.dir, 'services', 'quiz', 'data', 'scores.json'), 'utf8'))).toEqual({ 'did:key:z6MkLena': { name: 'Lena', points: 1 } });
      for (const p of [host, lena, kofi]) p.close();
    } finally {
      await martl.removeService('quiz').catch(() => {});
      await api.close();
    }
  });
});
