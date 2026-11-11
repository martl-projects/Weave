import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { b64u } from '@weave/core';
import { closeOpenStores, linkToken, openLink, WeaveNode, type BrowserHandover } from '../src/index.ts';

/*
 * A browser linked to a person's Weave (docs/web-stage2.md): one of their computers gives it a key of its own, without
 * the recovery words, through the storage node it'll use. It is the person there, and can be revoked like an agent.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const tempDir = () => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-browserlink-'));
  dirs.push(dir);
  return dir;
};
const person = (name: string) => {
  const node = WeaveNode.init(name, tempDir());
  nodes.push(node);
  return node;
};
const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));

describe('a linked browser', () => {
  // The storage node's handovers, as storageserver.ts keeps them.
  const waiting = new Map<string, string>();
  let server: Server;
  let url: string;
  beforeAll(async () => {
    server = createServer((req, res) => {
      const token = req.url!.slice('/link/'.length);
      if (req.method === 'GET') return res.writeHead(waiting.has(token) ? 200 : 404).end(waiting.get(token));
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => (waiting.set(token, body), res.writeHead(201).end()));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterAll(() => server.close());

  it('is the person, without the recovery words, and can be revoked', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Party' });
    await lena.joinSpace(await martl.invite('Party'));
    sync(lena, martl);
    sync(martl, lena);
    await martl.say({ space: 'Party', text: 'see you saturday' });

    const linked = await martl.linkBrowser({ url, name: 'my phone' });
    expect(linked.name).toBe('my-phone');
    const secret = b64u.decode(new URL(linked.link).hash.slice('#link='.length));
    expect(linked.link.startsWith(`${url}/#link=`)).toBe(true);
    const handover = openLink<BrowserHandover>(secret, waiting.get(linkToken(secret))!);
    // What the storage node holds doesn't open without the link's secret.
    expect(waiting.get(linkToken(secret))).not.toContain(handover.secretKey);

    const web = await WeaveNode.fromBrowserLink(handover, tempDir());
    nodes.push(web);
    expect(web.identity.author).toBe(martl.identity.author);
    expect(web.identity.did).toBe(linked.key);
    expect(martl.replica.authority.grant(linked.key)).toMatchObject({ role: 'agent', permissions: ['*'], name: 'browser:my-phone' });

    // It reads martl's spaces, and what it says is martl's, not an agent's.
    sync(martl, web);
    sync(lena, web);
    expect((await web.spaces()).map((s) => s.name)).toContain('Party');
    expect((await web.messages('Party')).map((m) => m.text)).toContain('see you saturday');
    await web.say({ space: 'Party', text: 'from the web' });
    sync(web, lena);
    const said = (await lena.messages('Party')).find((m) => m.text === 'from the web');
    expect(said?.by).toEqual({ did: martl.identity.author, name: 'martl' });

    // Direct chats are martl's too (they chat as friends, who follow each other).
    await martl.setEdge({ edge: 'follow', who: lena.identity.author, on: true });
    await lena.setEdge({ edge: 'follow', who: martl.identity.author, on: true });
    sync(martl, lena);
    sync(lena, martl);
    sync(martl, web);
    sync(lena, web);
    const chat = await lena.openChat(martl.identity.author);
    await lena.say({ space: chat.id, text: 'just for you' });
    sync(lena, web);
    const webChat = await web.openChat(lena.identity.author);
    expect((await web.messages(webChat.id)).map((m) => m.text)).toContain('just for you');

    // A space martl joins later reaches it through martl's computers.
    await martl.createGroup('Later');
    await martl.reconcile();
    sync(martl, web);
    await web.reconcile();
    expect((await web.spaces()).map((s) => s.name)).toContain('Later');

    // It can't link browsers or add keys: that takes a computer of martl's.
    await expect(web.linkBrowser({ url })).rejects.toThrow(/from one of your own computers/);

    // Revoked on martl's computer: what it says after that counts nowhere.
    await martl.revokeKey({ key: linked.key });
    sync(martl, lena);
    await web.say({ space: 'Party', text: 'after the revoke' });
    sync(web, lena);
    expect((await lena.messages('Party')).map((m) => m.text)).not.toContain('after the revoke');
  });

  it('opens once, and only with its secret', async () => {
    const martl = person('martl');
    const linked = await martl.linkBrowser({ url });
    const secret = b64u.decode(new URL(linked.link).hash.slice('#link='.length));
    expect(() => openLink(new Uint8Array(32), waiting.get(linkToken(secret))!)).toThrow();
    await expect(martl.linkBrowser({ url: 'http://example.org' })).rejects.toThrow(/https/);
  });
});
