import { mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { closeOpenStores, startLinks, WeaveNode, type FeedItem } from '../src/index.ts';

const dirs: string[] = [];
const closers: Array<() => Promise<void>> = [];
afterAll(async () => {
  await Promise.all(closers.map((close) => close()));
  closeOpenStores(); // weave.db stays open until then, and Windows won't delete it
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'weave-links-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

/** A request as a browser sends it: to 127.0.0.1, naming the host it asked for. */
function get(port: number, path: string, headers: Record<string, string> = {}, method = 'GET'): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers: { host: `weave.localhost:${port}`, ...headers } }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('post links on this computer', () => {
  it('shows a post read-only, safely, only to weave.localhost', async () => {
    const martin = person('Martin');
    await martin.createProject({ name: 'Weave' });
    const post = await martin.submit({ space: 'Weave', board: 'ideas', title: 'Links <b>back</b>', text: 'Hello **world** <script>alert(1)</script> ![x](https://evil.example/pixel.png) [ok](https://example.com) [bad](javascript:alert(1))' });
    await martin.say({ post: post.id, text: 'nice <img src=x onerror=alert(1)>' });
    const links = await startLinks(martin, 0);
    closers.push(links.close);
    const path = new URL(post.url).pathname;

    const page = await get(links.port, path);
    expect(page.status).toBe(200);
    expect(page.headers['content-security-policy']).toContain("default-src 'none'");
    expect(page.body).toContain('Links &lt;b&gt;back&lt;/b&gt;');
    expect(page.body).toContain('<strong>world</strong>');
    expect(page.body).not.toMatch(/<script>|<img|evil\.example|javascript:/);
    expect(page.body).toContain('<a href="https://example.com" rel="noreferrer">ok</a>');
    expect(page.body).toContain('nice &lt;img');
    expect(page.body).toContain('Open in Weave');

    // Another name for this computer (a page trying DNS rebinding) gets nothing.
    expect((await get(links.port, path, { host: `localhost:${links.port}` })).status).toBe(403);
    expect((await get(links.port, path, { host: 'evil.example' })).status).toBe(403);
    // A post that isn't here.
    const missing = await get(links.port, '/weave~NqgQ/ideas/zzzz');
    expect(missing.status).toBe(404);
    expect(missing.body).toContain("isn't on this computer");
  });

  it('brings the app to the post, from its own page only', async () => {
    const martin = person('Martin');
    await martin.createProject({ name: 'Weave' });
    const post = await martin.submit({ space: 'Weave', title: 'Open me' });
    const links = await startLinks(martin, 0);
    closers.push(links.close);
    const opens: FeedItem[] = [];
    const watching = new AbortController();
    void martin.watch((item) => item.kind === 'weave.open' && opens.push(item), watching.signal);
    const path = new URL(post.url).pathname;

    expect((await get(links.port, `/open${path}`, {}, 'POST')).status).toBe(403); // no Origin: not a Weave page
    expect((await get(links.port, `/open${path}`, { origin: 'https://evil.example' }, 'POST')).status).toBe(403);
    const opened = await get(links.port, `/open${path}`, { origin: `http://weave.localhost:${links.port}` }, 'POST');
    expect(opened.status).toBe(303);
    expect(opened.headers.location).toBe(`${path}?opened=1`);
    expect(opens.map((o) => o.body)).toEqual([{ what: 'post', post: { id: post.id, title: 'Open me' }, space: post.space }]);
    watching.abort();
  });
});
