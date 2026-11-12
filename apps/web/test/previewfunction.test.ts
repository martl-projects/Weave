import { describe, expect, it } from 'vitest';
import { linkPage } from '../src/preview-function.ts';

/*
 * The Pages Function behind web.martl.io/j/<code> (idea bZFDCQNT): the page as Pages has it, with the open preview's tags
 * from the storage node, escaped; the page alone when there's no preview. The storage node can't put code in the page.
 */

const PAGE = '<!doctype html><html><head><title>Weave</title></head><body><script type="module" src="/app.js"></script></body></html>';
const assets = { fetch: async () => new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', etag: '"x"' } }) };
const request = new Request('https://web.martl.io/j/Pf3kQ9xz');
const options = (answer: unknown, status = 200) => ({
  storage: 'https://storage.martl.io',
  csp: "default-src 'none'",
  fetch: (async (url: string) => {
    expect(url).toBe('https://storage.martl.io/preview/Pf3kQ9xz');
    return new Response(JSON.stringify(answer), { status });
  }) as unknown as typeof fetch,
});

describe("an onboarding link's page on Pages", () => {
  it('carries the preview, escaped, with the picture from the storage node, and the page’s own policy', async () => {
    const res = await linkPage(request, assets, 'Pf3kQ9xz', options({ live: true, preview: { title: 'Pferderennen"><script>alert(1)</script>', text: 'martl invites you' }, image: true }));
    const html = await res.text();
    expect(html).toContain('<meta property="og:title" content="Pferderennen&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;">');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('<meta property="og:image" content="https://storage.martl.io/preview/Pf3kQ9xz.png">');
    expect(html).toContain('<script type="module" src="/app.js"></script>');
    expect(res.headers.get('content-security-policy')).toBe("default-src 'none'");
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('etag')).toBeNull();
  });

  it('says a link no longer works, and is the plain page when the storage node has nothing', async () => {
    expect(await (await linkPage(request, assets, 'Pf3kQ9xz', options({ live: false }))).text()).toContain('This invite link no longer works');
    const none = await (await linkPage(request, assets, 'Pf3kQ9xz', options({}, 404))).text();
    expect(none).toContain('<meta property="og:title" content="Weave">');
    expect(none).not.toContain('og:image');
    const down = await linkPage(request, assets, 'Pf3kQ9xz', { ...options({}), fetch: (async () => { throw new Error('down'); }) as unknown as typeof fetch });
    expect(down.status).toBe(200);
    expect(await linkPage(request, assets, 'bad!code', { ...options({}), fetch: (async () => { throw new Error('not asked'); }) as unknown as typeof fetch }).then((r) => r.status)).toBe(200);
  });
});
