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

/*
 * Web Push (docs/web-push.md): what a sender sealed to this browser's push key, opened here with it, shown. iOS takes
 * away a page's pushes if one comes and nothing is shown, so even one that doesn't open shows something.
 */
interface PushWorker {
  registration: { showNotification(title: string, options: NotificationOptions & { data?: unknown }): Promise<void> };
  clients: { matchAll(o: { type: 'window'; includeUncontrolled: boolean }): Promise<Array<{ url: string; visibilityState?: string; focused?: boolean; focus(): Promise<unknown>; navigate(url: string): Promise<unknown>; postMessage(m: unknown): void }>>; openWindow(url: string): Promise<unknown> };
  addEventListener(type: 'push', listener: (event: { data?: { json(): unknown }; waitUntil(work: Promise<unknown>): void }) => void): void;
  addEventListener(type: 'notificationclick', listener: (event: { notification: { data?: { open?: string }; close(): void }; waitUntil(work: Promise<unknown>): void }) => void): void;
}
const pushing = self as unknown as PushWorker;

pushing.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      const { loadBadge, loadPushKey, openNotice, saveBadge } = await import('./pushkey.ts');
      let notice: { title: string; text?: string; open?: string; tag?: string } = { title: 'Weave', text: 'Something new for you' };
      try {
        const message = event.data?.json() as { from?: string; sealed?: unknown } | undefined;
        const key = await loadPushKey();
        if (key && message?.sealed) notice = openNotice(key, message.sealed as Parameters<typeof openNotice>[1]);
      } catch (error) {
        // Not for this key (an old subscription), or altered: the plain line above.
        console.warn('weave: a push that does not open here:', (error as Error).message);
      }
      // Weave open where it's seen: its node tells it itself (and on a computer shows its own); none on top of it.
      const windows = await pushing.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const seen = windows.filter((w) => w.focused || w.visibilityState === 'visible');
      if (seen.length) return seen.forEach((w) => w.postMessage({ type: 'weave-push', notice }));
      await pushing.registration.showNotification(notice.title, { body: notice.text ?? '', icon: '/icon-192.png', badge: '/icon-192.png', tag: notice.tag, data: { open: notice.open } }).catch((error: Error) => windows.forEach((w) => w.postMessage({ type: 'weave-push-failed', why: error.message })));
      // One more on Weave's icon, counted on from what the app said last.
      const count = (await loadBadge().catch(() => 0)) + 1;
      await saveBadge(count).catch(() => undefined);
      await (self as unknown as { navigator: { setAppBadge?(n: number): Promise<void> } }).navigator.setAppBadge?.(count).catch(() => undefined);
    })(),
  );
});

pushing.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const open = event.notification.data?.open ?? '#/';
  event.waitUntil(
    (async () => {
      const windows = await pushing.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const there = windows[0];
      if (there) {
        await there.focus();
        there.postMessage({ type: 'weave-open', open });
        return;
      }
      await pushing.clients.openWindow(`/${open.startsWith('#') ? open : `#${open}`}`);
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/dev/')) return;
  event.respondWith(answer(event.request, url.pathname));
});
