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

type Got = { error?: string; status: number; statusText: string; headers: Array<[string, string]>; body: ArrayBuffer };

/** The website's tabs, and their answers by request (the first one counts). */
const tabs = new BroadcastChannel('weave-website');
const waiting = new Map<string, (answer: Got) => void>();
tabs.onmessage = ({ data }: MessageEvent<Got & { type?: string; id?: string }>) => {
  if (data?.type !== 'weave-answer' || !data.id) return;
  const answer = waiting.get(data.id);
  waiting.delete(data.id);
  answer?.(data);
};

async function throughTheTab(request: Request): Promise<Response> {
  // Asked on the website's channel, which its tab listens on (shell.ts): not through clients, which a browser may not
  // show the tab among (Safari, the tab in a frame of Weave's page).
  const url = new URL(request.url);
  const body = ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer();
  const id = crypto.randomUUID();
  const got = await new Promise<Got>((resolve) => {
    const timer = setTimeout(() => (waiting.delete(id), resolve({ error: 'no tab of this website answered: open it from Weave again' } as Got)), 90_000);
    waiting.set(id, (answer) => (clearTimeout(timer), resolve(answer)));
    tabs.postMessage({ type: 'weave-ask', id, method: request.method, url: url.pathname + url.search, headers: [...request.headers], body });
  });
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
