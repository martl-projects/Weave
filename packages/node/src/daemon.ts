import { rmSync } from 'node:fs';
import { startApi } from './api.ts';
import { connectDaemon, type DaemonInfo } from './client.ts';
import { resolveHome, writeJson } from './home.ts';
import { WeaveNode } from './node.ts';

export interface Daemon {
  node: WeaveNode;
  port: number;
  stop(): Promise<void>;
}

/** Open the node in `dir`, go online and serve the local API. One daemon per home. */
export async function startDaemon(dir?: string, options: { port?: number } = {}): Promise<Daemon> {
  const home = resolveHome(dir);
  if (await connectDaemon(home)) throw new Error(`a daemon is already running for ${home.dir}`);

  const node = WeaveNode.open(home.dir);
  await node.goOnline();
  const api = await startApi(node, options.port);
  const info: DaemonInfo = { pid: process.pid, port: api.port, token: api.token };
  writeJson(home.daemon, info);

  let stopped = false;
  return {
    node,
    port: api.port,
    async stop() {
      if (stopped) return;
      stopped = true;
      rmSync(home.daemon, { force: true });
      await api.close();
      await node.goOffline();
    },
  };
}
