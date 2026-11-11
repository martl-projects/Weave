/**
 * What a website's tab may do (rooms-worker.ts, and dev.ts as well, so a test sees what's live): its own scripts, the
 * WebAssembly its sodium compiles (BLAKE2b and the like, wasm-unsafe-eval), the storage node's relay, and the website in
 * a frame of its own origin. Nothing else.
 */
export function roomsCsp(storage: string): string {
  return [
    "default-src 'none'",
    "script-src 'self' 'wasm-unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `connect-src ${new URL(storage).origin.replace(/^http/, 'ws')}`,
    "frame-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}
