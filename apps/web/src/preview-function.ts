import { previewTags } from '../../../packages/core/src/onboard.ts';

/*
 * An onboarding link's page on Cloudflare Pages (idea bZFDCQNT): /j/<code> is the page itself, with what a link card
 * shows (og:title, og:description, og:image) from the storage node's open preview. Only that comes from the storage
 * node, as text in escaped attributes: the page's code stays Pages' own, so a storage node taken over still can't change
 * what browsers run. The sealed plan and its secret (after the #) never pass through here.
 *
 * pages.ts bundles this into dist/functions/j/[code].js with the storage node's origin and the page's CSP, which a
 * Function's response doesn't get from _headers.
 */

declare const STORAGE: string;
declare const CSP: string;

interface Assets {
  fetch(request: Request | URL | string): Promise<Response>;
}

/** The answer for /j/<code>: the page with the preview's tags, or the page as it is when the preview can't be had. */
export async function linkPage(request: Request, assets: Assets, code: string, options: { storage: string; csp: string; fetch?: typeof fetch }): Promise<Response> {
  const page = await assets.fetch(new URL('/', request.url));
  const headers = new Headers(page.headers);
  headers.set('content-security-policy', options.csp);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-robots-tag', 'noindex, nofollow');
  headers.set('cache-control', 'no-cache');
  headers.delete('content-length');
  headers.delete('etag');
  let preview: Parameters<typeof previewTags>[0];
  if (/^[A-Za-z0-9]{8}$/.test(code)) {
    try {
      const answer = await (options.fetch ?? fetch)(`${options.storage}/preview/${code}`, { headers: { accept: 'application/json' } });
      if (answer.ok) {
        const body = (await answer.json()) as { live?: unknown; preview?: { title?: unknown; text?: unknown }; image?: unknown };
        const title = typeof body.preview?.title === 'string' ? body.preview.title.slice(0, 100) : undefined;
        const text = typeof body.preview?.text === 'string' ? body.preview.text.slice(0, 300) : undefined;
        preview = { live: body.live === true, ...(title ? { preview: { title, ...(text ? { text } : {}) } } : {}), ...(body.image === true ? { image: true as const } : {}) };
      }
    } catch {
      // No preview: the page as it is, which still works.
    }
  }
  const html = (await page.text()).replace('</head>', `${previewTags(preview, `${options.storage}/preview/${code}.png`)}\n</head>`);
  return new Response(html, { status: 200, headers });
}

export const onRequestGet = (context: { request: Request; env: { ASSETS: Assets }; params: { code: string | string[] } }) =>
  linkPage(context.request, context.env.ASSETS, String(context.params.code), { storage: STORAGE, csp: CSP });
