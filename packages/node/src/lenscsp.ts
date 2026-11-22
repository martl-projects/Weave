// Its own module, with nothing else: the phone app's worker (on Bare) serves lens views too.

/** The hosts as CSP sources, HTTPS only: "api.example.com" and "*.example.com" as they are, anything else left out. */
export function lensSources(net: readonly string[] | undefined): string {
  return (net ?? [])
    .filter((host) => /^(\*\.)?([a-z0-9-]+\.)+[a-z0-9-]+$/.test(host))
    .map((host) => `https://${host}`)
    .join(' ');
}

/**
 * How a board's client service's view (or a group widget's) is served, wherever it is: sandboxed (an origin of its
 * own, scripts only), no forms, no navigating its parent. All it knows is what the board view hands it by postMessage.
 * Its scripts may start workers from blob: URLs, as a map renderer does. Without hosts it has no network at all; with
 * the hosts its manifest names ("net") and its member allowed, it may fetch from and show images of those over HTTPS,
 * and nothing else.
 */
export function lensCsp(net?: readonly string[]): string {
  const hosts = lensSources(net);
  const extra = hosts ? ` ${hosts}` : '';
  return `sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-inline'; worker-src blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:${extra}; font-src 'self' data:; media-src 'self' data: blob:${extra}; connect-src ${hosts || "'none'"}; form-action 'none'; base-uri 'none'`;
}

/** A view without a network, as every view was before "net". */
export const LENS_CSP = lensCsp();
