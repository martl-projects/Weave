// A Pages Function's route (pages.ts puts it in place): lens-frame.html with the CSP its address asks for.
import { frameHosts, lensFrameCspFor } from '../lensframecsp.ts';

/*
 * A lens's or a widget's view, sandboxed (lens-frame.html). Its CSP lets it reach the hosts in its address and no
 * others. The address is the page's to make (lens.tsx, from what this member allowed), and the page hands the view its
 * files only when the frame says it has exactly those: a view that sends its frame to other hosts gets nothing.
 */

interface Assets {
  fetch(request: Request | URL): Promise<Response>;
}

export async function onRequestGet(context: { request: Request; env: { ASSETS: Assets } }): Promise<Response> {
  const url = new URL(context.request.url);
  const found = await context.env.ASSETS.fetch(new URL('/lens-frame', url));
  const answer = new Response(found.body, found);
  answer.headers.set('Content-Security-Policy', lensFrameCspFor(frameHosts(url)));
  answer.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  answer.headers.set('X-Content-Type-Options', 'nosniff');
  answer.headers.set('Referrer-Policy', 'no-referrer');
  answer.headers.set('X-Robots-Tag', 'noindex, nofollow');
  answer.headers.set('Cache-Control', 'no-cache');
  return answer;
}
