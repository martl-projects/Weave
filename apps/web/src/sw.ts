/*
 * The page without a network (docs/web-stage2.md, step 8). The node's data is in the browser already; what a start needs
 * besides is the page's own files. Those are looked for on the network first, so an update is there at the next reload
 * and nothing stale gets stuck; the cache answers when there's no network. The large files that change only with a
 * release (the services, SQLite, the avatars) come from the cache first. BUILD changes with each build, and old caches go.
 */

export {};

/** What's used of a service worker's scope (the project's types are a page's). */
interface WorkerEvent {
  request: Request;
  waitUntil(work: Promise<unknown>): void;
  respondWith(answer: Promise<Response>): void;
}

declare const self: { addEventListener(type: string, listener: (event: WorkerEvent) => void): void; skipWaiting(): Promise<void>; clients: { claim(): Promise<void> } };
declare const BUILD: string;

const CACHE = `weave-${BUILD}`;
const SHELL = ['/', '/app.js', '/worker.js', '/service.js', '/styles.css', '/sqlite3.wasm', '/shipped-web.json', '/manifest.json', '/icon.png', '/icon-192.png'];
const LARGE = /^\/(services|avatar3d)\/|^\/sqlite3\.wasm$/;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) => Promise.all(names.filter((name) => name.startsWith('weave-') && name !== CACHE).map((name) => caches.delete(name))))
      .then(() => self.clients.claim()),
  );
});

async function fromNetwork(cache: Cache, request: Request): Promise<Response> {
  // By its address alone: a browser may bring its own If-Modified-Since along, and a 304 handed to the page is an
  // empty page. Asked this way the browser revalidates by itself, and an unchanged file comes back whole.
  const response = await fetch(request.url, { cache: 'no-cache', credentials: 'same-origin' });
  if (response.status === 304) return (await cache.match(request, { ignoreSearch: true })) ?? fetch(request.url, { cache: 'reload', credentials: 'same-origin' });
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function answer(request: Request, path: string): Promise<Response> {
  const cache = await caches.open(CACHE);
  if (LARGE.test(path)) return (await cache.match(request)) ?? fromNetwork(cache, request);
  try {
    return await fromNetwork(cache, request);
  } catch (error) {
    // Any address of the page is the page: it finds its way by the part after the #.
    const kept = await cache.match(request, { ignoreSearch: true });
    const page = request.mode === 'navigate' ? await cache.match('/') : undefined;
    if (kept ?? page) return (kept ?? page)!;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/dev/')) return;
  event.respondWith(answer(event.request, url.pathname));
});
