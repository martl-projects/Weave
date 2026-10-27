// Its own module, with nothing else: the phone app's worker (on Bare) serves lens views too.

/**
 * How a board's client service's view is served, wherever it is: sandboxed (an origin of its own, scripts only), with
 * no network, no forms, no navigating its parent. All it knows is what the board view hands it by postMessage.
 */
export const LENS_CSP = "sandbox allow-scripts; default-src 'none'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";
