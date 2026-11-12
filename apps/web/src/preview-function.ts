import { playManifest, playTags, previewTags, type PlayApp } from '../../../packages/core/src/onboard.ts';

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

/** A game's own app as the storage node has it (its name and icon), or nothing. */
async function appOf(code: string, options: { storage: string; fetch?: typeof fetch }): Promise<PlayApp | undefined> {
  if (!/^[A-Za-z0-9]{8}$/.test(code)) return undefined;
  try {
    const answer = await (options.fetch ?? fetch)(`${options.storage}/preview/${code}/app`, { headers: { accept: 'application/json' } });
    if (!answer.ok) return undefined;
    const body = (await answer.json()) as { title?: unknown; icon?: { w?: unknown; h?: unknown } };
    if (typeof body.title !== 'string') return undefined;
    const w = Number(body.icon?.w);
    const h = Number(body.icon?.h);
    return { title: body.title.slice(0, 100), ...(Number.isInteger(w) && Number.isInteger(h) && w > 0 && h > 0 && w <= 4096 && h <= 4096 ? { icon: { w, h } } : {}) };
  } catch {
    return undefined;
  }
}

/** /play/<code>: the page as an app of the game's own (its manifest, name and icon); the page's code stays Pages' own. */
export async function playPage(request: Request, assets: Assets, code: string, options: { storage: string; csp: string; fetch?: typeof fetch }): Promise<Response> {
  const page = await assets.fetch(new URL('/', request.url));
  const headers = new Headers(page.headers);
  headers.set('content-security-policy', options.csp);
  headers.set('x-content-type-options', 'nosniff');
  headers.set('referrer-policy', 'no-referrer');
  headers.set('x-robots-tag', 'noindex, nofollow');
  headers.set('cache-control', 'no-cache');
  headers.delete('content-length');
  headers.delete('etag');
  return new Response(playTags(await page.text(), await appOf(code, options), code, options.storage), { status: 200, headers });
}

/** /play/<code>/manifest: that app's manifest. */
export async function playManifestResponse(code: string, options: { storage: string; fetch?: typeof fetch }): Promise<Response> {
  return new Response(JSON.stringify(playManifest(await appOf(code, options), code, options.storage)), { headers: { 'content-type': 'application/manifest+json', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' } });
}

type Context = { request: Request; env: { ASSETS: Assets }; params: { code: string | string[] } };
export const linkFunction = (context: Context) => linkPage(context.request, context.env.ASSETS, String(context.params.code), { storage: STORAGE, csp: CSP });
export const playFunction = (context: Context) => playPage(context.request, context.env.ASSETS, String(context.params.code), { storage: STORAGE, csp: CSP });
export const manifestFunction = (context: Context) => playManifestResponse(String(context.params.code), { storage: STORAGE });
