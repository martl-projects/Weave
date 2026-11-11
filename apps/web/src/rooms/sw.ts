/*
 * A website's tab's service worker (docs/web-stage2.md, step 9): everything the website asks of its own origin goes to
 * the tab (shell.ts), which asks the host through the tunnel. The tab itself is the page under /__weave/, which this
 * answers for a tab opened anew; whatever goes elsewhere (another origin) isn't touched.
 */

export {};

declare const BUILD: string;
/** Which build this is: a new one is a new file, so a browser takes the new service worker. */
(self as unknown as { weaveBuild: string }).weaveBuild = BUILD;

interface WorkerEvent {
  request: Request;
  waitUntil(work: Promise<unknown>): void;
  respondWith(answer: Promise<Response>): void;
}

interface Client {
  frameType: string;
  url: string;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

declare const self: { addEventListener(type: string, listener: (event: WorkerEvent) => void): void; skipWaiting(): Promise<void>; clients: { claim(): Promise<void>; matchAll(options: { type: string; includeUncontrolled?: boolean }): Promise<Client[]> } };

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

async function throughTheTab(request: Request): Promise<Response> {
  // The tab is the top-level window. A browser that doesn't say which one is (Safari has no frameType) asks them all:
  // only the tab answers, the website's own frames don't listen.
  // Controlled or not: the tab came before this service worker, and a browser may not hand it over (Safari).
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const tabs = windows.some((client) => client.frameType === 'top-level') ? windows.filter((client) => client.frameType === 'top-level') : windows;
  if (!tabs.length) return said('this website is open in no tab: open it from Weave');
  const url = new URL(request.url);
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
  type Got = { error?: string; status: number; statusText: string; headers: Array<[string, string]>; body: ArrayBuffer };
  const asked = tabs.map((tab) => {
    const channel = new MessageChannel();
    const copy = body?.slice(0);
    tab.postMessage({ type: 'weave-ask', method: request.method, url: url.pathname + url.search, headers: [...request.headers], body: copy }, [channel.port2, ...(copy ? [copy] : [])]);
    return new Promise<Got>((resolve) => (channel.port1.onmessage = ({ data }) => resolve(data)));
  });
  const got = await Promise.race([...asked, new Promise<Got>((resolve) => setTimeout(() => resolve({ error: 'no tab of this website answered: open it from Weave again' } as Got), 90_000))]);
  if (got.error) return said(got.error);
  const empty = request.method === 'HEAD' || got.status === 204 || got.status === 304;
  // Headers the browser refuses in an answer made here are left out, one by one, rather than the whole answer.
  const headers = new Headers();
  for (const [name, value] of got.headers) {
    try {
      headers.append(name, value);
    } catch {
      // a header this browser doesn't take
    }
  }
  const status = got.status >= 200 && got.status <= 599 ? got.status : 502;
  // A page of the website gets the tab's WebSocket first (ws.js), before any script of its own.
  if (!empty && /text\/html/i.test(headers.get('content-type') ?? '')) {
    const page = new TextDecoder().decode(got.body);
    const ours = '<script src="/__weave/ws.js"></script>';
    const withOurs = /<head[^>]*>/i.test(page) ? page.replace(/<head[^>]*>/i, (head) => head + ours) : ours + page;
    headers.delete('content-length');
    return new Response(withOurs, { status, statusText: /^[\t\x20-\x7e]*$/.test(got.statusText) ? got.statusText : '', headers });
  }
  return new Response(empty ? null : got.body, { status, statusText: /^[\t\x20-\x7e]*$/.test(got.statusText) ? got.statusText : '', headers });
}

/** What went wrong, as the page says it: never a browser's bare error page. */
const said = (text: string, status = 502) => new Response(`Weave: ${text}`, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });

const answerSafely = (request: Request) => throughTheTab(request).catch((error: Error) => said(error?.message ?? String(error)));

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/__weave/')) return;
  // The tab itself, opened anew (a reload, a link from outside): left to the Worker, which answers any address with the
  // tab's page. Fetched here, it took the CSP of the day this service worker came, and the tab didn't open.
  if (event.request.mode === 'navigate' && event.request.destination === 'document') return;
  event.respondWith(answerSafely(event.request));
});
