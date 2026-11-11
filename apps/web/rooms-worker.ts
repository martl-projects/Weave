/*
 * *.weave-rooms.net (docs/web-stage2.md, step 9): a Cloudflare Worker in front of the website tab's static files. Each
 * website has an origin of its own under it; whatever it's asked, it answers with the tab's page, which opens the
 * website through its tunnel, except its own files under /__weave/. Pages can't do this: it has no wildcard names.
 */

import { roomsCsp } from './src/rooms/csp.ts';

interface Assets {
  fetch(request: Request | URL): Promise<Response>;
}

declare const STORAGE_ORIGIN: string;
declare const WEB_ORIGIN: string;

/** The tab's own page and files: they reach the storage node and frame the website, nothing else. */
const CSP = roomsCsp(STORAGE_ORIGIN, WEB_ORIGIN);

export default {
  async fetch(request: Request, env: { ASSETS: Assets }): Promise<Response> {
    const url = new URL(request.url);
    const own = url.pathname.startsWith('/__weave/') ? url : new URL('/__weave/shell.html', url);
    const found = await env.ASSETS.fetch(own);
    const answer = new Response(found.body, found);
    answer.headers.set('Content-Security-Policy', CSP);
    answer.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    answer.headers.set('X-Content-Type-Options', 'nosniff');
    answer.headers.set('Referrer-Policy', 'no-referrer');
    answer.headers.set('X-Robots-Tag', 'noindex, nofollow');
    answer.headers.set('Cache-Control', 'no-cache');
    // The service worker answers for the whole website, from under /__weave/.
    if (own.pathname === '/__weave/sw.js') answer.headers.set('Service-Worker-Allowed', '/');
    return answer;
  },
};
