import { lensSources } from '../../../packages/node/src/lenscsp.ts';

/**
 * lens-frame.html's own CSP, in place of the page's: sandboxed (an origin of its own, scripts only, so nothing of the
 * page's storage or passkeys), framed by the page only; the view's files are blob: addresses it makes. No network, or,
 * when its member allowed a lens's hosts (its manifest's "net"), those over HTTPS and nothing else. As lensCsp on a
 * computer, with blob: for what it builds.
 */
export function lensFrameCspFor(net?: readonly string[]): string {
  const hosts = lensSources(net);
  const extra = hosts ? ` ${hosts}` : '';
  return `sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline' blob:; worker-src blob:; style-src 'unsafe-inline' blob:; img-src data: blob:${extra}; font-src data: blob:; media-src data: blob:${extra}; connect-src ${hosts || "'none'"}; form-action 'none'; base-uri 'none'; frame-ancestors 'self'`;
}

/** The hosts a frame's address names (?net=a.example,b.example): host names only, at most 20. */
export function frameHosts(url: URL): string[] {
  const raw = url.searchParams.get('net') ?? '';
  return raw
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => /^(\*\.)?([a-z0-9-]+\.)+[a-z0-9-]+$/.test(h))
    .slice(0, 20);
}
