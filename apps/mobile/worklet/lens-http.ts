import { lensCsp } from '@weave/node/phone';
import type { Pipe } from './phone.ts';

/** A file of a client service's view, as the node gives it (lensFile). */
export type LensFile = { type: string; data: string; net?: string[] };

/**
 * One request for a file of a client service's view on the worker's local port: GET /lens/<release>/<file>, answered
 * with the file (`file` asks the node for it: the computer's, or this phone's own), sandboxed (lensCsp: its hosts only
 * if its member allowed them), and the connection closed. `open` holds the connections open now.
 */
export function serveLensRequest(local: Pipe, open: Set<Pipe>, file: (release: string, path: string) => Promise<LensFile>): void {
  open.add(local);
  let head = '';
  let answered = false;
  const answer = (status: string, type: string, body: Buffer, net?: string[]) => {
    answered = true;
    const lines = [`HTTP/1.1 ${status}`, `content-type: ${type}`, `content-length: ${body.length}`, `content-security-policy: ${lensCsp(net)}`, 'x-content-type-options: nosniff', 'cache-control: no-cache', 'connection: close'];
    local.end(Buffer.concat([Buffer.from(`${lines.join('\r\n')}\r\n\r\n`), body]));
  };
  const end = () => {
    open.delete(local);
    local.destroy();
  };
  local.on('error', end);
  local.on('close', end);
  local.on('data', (chunk: Buffer) => {
    if (answered) return;
    head += chunk.toString('latin1');
    if (head.length > 8192) return answer('431 Request Header Fields Too Large', 'text/plain', Buffer.alloc(0));
    if (!head.includes('\r\n\r\n')) return;
    answered = true;
    const at = /^GET \/lens\/([A-Za-z0-9_-]{1,100})\/([^ ?#]*)\S* HTTP\/1\.[01]\r\n/.exec(head);
    let path: string | undefined;
    try {
      path = at ? decodeURIComponent(at[2]) : undefined;
    } catch {
      path = undefined;
    }
    if (!at || path === undefined) return answer('404 Not Found', 'text/plain', Buffer.from('Not here'));
    file(at[1], path).then(
      (found) => answer('200 OK', found.type, Buffer.from(found.data, 'base64'), found.net),
      (error: Error) => answer('404 Not Found', 'text/plain; charset=utf-8', Buffer.from(error.message)),
    );
  });
}
