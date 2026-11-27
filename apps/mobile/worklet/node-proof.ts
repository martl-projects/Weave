import './host/globals.ts';
import fs from 'bare-fs';
import os from 'bare-os';
import path from 'bare-path';
import { WeaveNode, closeOpenStores, loadConfig, resolveHome, saveConfig } from '@weave/node';

/*
 * The whole node on Bare, as a phone would run it: a home of real files, its log in SQLite (bare-sqlite). It makes a
 * home, writes into it, closes it, opens it again and reads what it wrote. build-node.ts packs it; run it with Bare.
 * Its last line is `ok` and what it read, or the error.
 *
 * With `--invite=` (and `--bootstrap=host:port` for a test network) it goes online instead, as a person of its own:
 * it joins the group it is invited to over the DHT, waits for what was said there, says something, and stays until a
 * file `stop` is in its home.
 */

declare const Bare: { argv: string[]; exit(code?: number): void };

const arg = (name: string) => Bare.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until<T>(what: string, get: () => Promise<T | undefined | false>, ms = 40_000): Promise<T> {
  const began = Date.now();
  for (;;) {
    const value = await get();
    if (value) return value;
    if (Date.now() - began > ms) throw new Error(`waited ${ms / 1000} s for ${what}`);
    await sleep(200);
  }
}

/** Online, with a computer's node: join its group, read what it said, answer. */
async function online(dir: string, invite: string): Promise<void> {
  fs.mkdirSync(dir, { recursive: true });
  const node = WeaveNode.init('Phone', dir);
  const [host, port] = (arg('bootstrap') ?? '').split(':');
  if (host) {
    node.config = { ...loadConfig(resolveHome(dir)), bootstrap: [{ host, port: Number(port) }] };
    saveConfig(resolveHome(dir), node.config);
  }
  await node.goOnline();
  const began = Date.now();
  await node.joinSpace(invite);
  const heard = await until('what the computer said', async () => (await node.messages('Friends').catch(() => [])).find((m) => m.text === 'from the computer'));
  await node.say({ space: 'Friends', text: 'from the phone' });
  console.log(JSON.stringify({ ok: true, heard: heard.text, ms: Date.now() - began }));
  await until('the stop', async () => fs.existsSync(path.join(dir, 'stop')), 120_000);
  await node.close();
  closeOpenStores();
}

async function offline(dir: string): Promise<void> {
  fs.mkdirSync(dir, { recursive: true });
  const began = Date.now();
  const node = WeaveNode.init('Bare', dir);
  await node.createGroup('Friends');
  await node.createProject({ name: 'Weave' });
  for (let i = 0; i < 200; i++) await node.say({ space: 'Friends', text: `hello ${i}` });
  await node.submit({ space: 'Weave', title: 'From a phone', text: 'written on Bare' });
  const events = node.replica.events().length;
  await node.close();
  closeOpenStores();
  const written = Date.now() - began;

  const reopened = Date.now();
  const again = WeaveNode.open(dir, { keepEvents: true });
  const chat = await again.messages('Friends');
  const posts = await again.posts({ space: 'Weave' });
  const spaces = (await again.spaces()).map((s) => s.name).sort();
  await again.close();
  closeOpenStores();
  console.log(JSON.stringify({ ok: chat.length === 200 && posts.length === 1 && again.replica.events().length === events, events, chat: chat.length, last: chat.at(-1)?.text, posts: posts.map((p) => p.title), spaces, files: fs.readdirSync(dir).sort(), ms: { written, reopened: Date.now() - reopened } }));
}

const invite = arg('invite');
(invite ? online(arg('home')!, invite) : offline(arg('home') ?? path.join(os.tmpdir(), `weave-bare-${Date.now()}`))).then(
  () => Bare.exit(0),
  (error: unknown) => {
    console.log(error instanceof Error ? (error.stack ?? error.message) : String(error));
    Bare.exit(1);
  },
);
