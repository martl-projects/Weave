/*
 * A website's tab's service worker (docs/web-stage2.md, step 9): everything the website asks of its own origin goes to
 * the tab (shell.ts), which asks the host through the tunnel. The tab itself is the page under /__weave/, which this
 * answers for a tab opened anew; whatever goes elsewhere (another origin) isn't touched.
 */

export {};

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

declare const self: { addEventListener(type: string, listener: (event: WorkerEvent) => void): void; skipWaiting(): Promise<void>; clients: { claim(): Promise<void>; matchAll(options: { type: string }): Promise<Client[]> } };

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

async function throughTheTab(request: Request): Promise<Response> {
  const tab = (await self.clients.matchAll({ type: 'window' })).find((client) => client.frameType === 'top-level');
  if (!tab) return new Response('This website is open in no tab of Weave’s: open it from Weave.', { status: 502 });
  const url = new URL(request.url);
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
  const channel = new MessageChannel();
  const answer = new Promise<{ error?: string; status: number; statusText: string; headers: Array<[string, string]>; body: ArrayBuffer }>((resolve) => (channel.port1.onmessage = ({ data }) => resolve(data)));
  tab.postMessage({ type: 'weave-ask', method: request.method, url: url.pathname + url.search, headers: [...request.headers], body }, [channel.port2, ...(body ? [body] : [])]);
  const got = await answer;
  if (got.error) return new Response(got.error, { status: 502, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  const empty = request.method === 'HEAD' || got.status === 204 || got.status === 304;
  return new Response(empty ? null : got.body, { status: got.status, statusText: got.statusText, headers: got.headers });
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== location.origin || url.pathname.startsWith('/__weave/')) return;
  // The tab itself, opened anew (a reload, a link from outside): its page, which opens the website in its frame.
  if (event.request.mode === 'navigate' && event.request.destination === 'document') return event.respondWith(fetch('/__weave/shell.html'));
  event.respondWith(throughTheTab(event.request));
});
