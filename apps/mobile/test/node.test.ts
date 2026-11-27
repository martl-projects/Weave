import { execFileSync, spawn } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import createTestnet from 'hyperdht/testnet.js';
import { WeaveNode, closeOpenStores, loadConfig, resolveHome, saveConfig } from '@weave/node';
import { buildNodeProof } from '../build-node.ts';

/*
 * The whole node on real Bare, as a phone's own node would run (worklet/node-proof.ts): it makes a home of real files
 * with its log in SQLite (bare-sqlite), writes, closes, opens again and reads. And the home it made is one a
 * computer's node opens: the same files, the same database.
 */

const app = join(import.meta.dirname, '..');
const bare = (createRequire(join(app, 'package.json'))('bare-runtime') as () => string)();
if (process.platform !== 'win32') chmodSync(bare, 0o755);
const home = mkdtempSync(join(tmpdir(), 'weave-bare-node-'));

afterAll(() => {
  closeOpenStores();
  rmSync(home, { recursive: true, force: true });
});

describe('the node on Bare', () => {
  it('makes a home, writes, and reads it after opening again', async () => {
    const packed = await buildNodeProof();
    const out = execFileSync(bare, [packed, `--home=${home}`], { encoding: 'utf8', timeout: 60_000 });
    const said = JSON.parse(out.trim().split('\n').at(-1)!) as { ok: boolean; chat: number; last: string; posts: string[]; spaces: string[]; files: string[] };
    expect(said).toMatchObject({ ok: true, chat: 200, last: 'hello 199', posts: ['From a phone'], spaces: ['Friends', 'Weave'] });
    expect(said.files).toContain('weave.db');
  }, 120_000);

  it('leaves a home a computer opens', async () => {
    expect(existsSync(join(home, 'weave.db'))).toBe(true);
    const node = WeaveNode.open(home);
    expect((await node.messages('Friends')).length).toBe(200);
    expect((await node.posts({ space: 'Weave' })).map((p) => p.title)).toEqual(['From a phone']);
    await node.close();
  });

  it("joins a computer's group over the DHT, reads what was said and answers", async () => {
    const testnet = await createTestnet(3);
    const dir = mkdtempSync(join(tmpdir(), 'weave-bare-computer-'));
    const phoneDir = mkdtempSync(join(tmpdir(), 'weave-bare-phone-'));
    const computer = WeaveNode.init('Computer', dir);
    computer.config = { ...loadConfig(resolveHome(dir)), bootstrap: testnet.bootstrap };
    saveConfig(resolveHome(dir), computer.config);
    await computer.createGroup('Friends');
    await computer.say({ space: 'Friends', text: 'from the computer' });
    await computer.goOnline();
    const invite = await computer.invite('Friends');
    const { host, port } = testnet.bootstrap[0];
    const phone = spawn(bare, [await buildNodeProof(), `--home=${phoneDir}`, `--bootstrap=${host}:${port}`, `--invite=${invite}`], { stdio: ['ignore', 'pipe', 'inherit'] });
    let said = '';
    phone.stdout.on('data', (chunk: Buffer) => (said += chunk.toString('utf8')));
    try {
      const began = Date.now();
      for (;;) {
        if ((await computer.messages('Friends')).some((m) => m.text === 'from the phone')) break;
        if (phone.exitCode !== null || Date.now() - began > 60_000) throw new Error(`the phone's node said: ${said || 'nothing'}`);
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      expect(JSON.parse(said.trim().split('\n').at(-1)!)).toMatchObject({ ok: true, heard: 'from the computer' });
      expect((await computer.members('Friends')).map((m) => m.name).sort()).toEqual(['Computer', 'Phone']);
    } finally {
      writeFileSync(join(phoneDir, 'stop'), '');
      await new Promise((resolve) => (phone.exitCode !== null ? resolve(undefined) : phone.once('exit', resolve)));
      await computer.close();
      await testnet.destroy();
      closeOpenStores();
      for (const d of [dir, phoneDir]) rmSync(d, { recursive: true, force: true });
    }
  }, 120_000);
});
