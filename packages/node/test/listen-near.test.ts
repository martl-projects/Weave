import { createConnection, createServer, type AddressInfo, type Server } from 'node:net';
import { afterAll, describe, expect, it } from 'vitest';
import { listenNear } from '../src/live.ts';

/*
 * A visitor's local port for a website: the same one each time if it's free, else the next free one. When the
 * preferred port is taken, the port answered must be the one really listened on, never the taken one (that would
 * send the visitor's browser to whatever else listens there).
 */

const servers: Server[] = [];
afterAll(async () => {
  for (const s of servers) await new Promise<void>((resolve) => s.close(() => resolve()));
});

const answerer = (name: string) => {
  const server = createServer((socket) => socket.end(name));
  servers.push(server);
  return server;
};

const ask = (port: number) =>
  new Promise<string>((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port });
    let text = '';
    socket.on('data', (d) => (text += d));
    socket.on('end', () => resolve(text));
    socket.on('error', reject);
  });

describe('listenNear', () => {
  it('answers the port it really got when the preferred one is taken', async () => {
    const other = answerer('someone else');
    await new Promise<void>((resolve) => other.listen(0, '127.0.0.1', () => resolve()));
    const taken = (other.address() as AddressInfo).port;

    const mine = answerer('the website');
    const port = await listenNear(mine, taken);
    expect(port).not.toBe(taken);
    expect(port).toBe((mine.address() as AddressInfo).port);
    expect(await ask(port)).toBe('the website');
    expect(await ask(taken)).toBe('someone else');
  });

  it('takes the preferred port when it is free', async () => {
    const probe = answerer('probe');
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', () => resolve()));
    const free = (probe.address() as AddressInfo).port;
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    servers.splice(servers.indexOf(probe), 1);

    const mine = answerer('the website');
    expect(await listenNear(mine, free)).toBe(free);
    expect(await ask(free)).toBe('the website');
  });
});
