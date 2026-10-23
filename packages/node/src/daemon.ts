import { rmSync } from 'node:fs';
import { startApi } from './api.ts';
import { startLinks, type LinkServer } from './links.ts';
import { connectDaemon, type DaemonInfo } from './client.ts';
import { resolveHome, writeJson } from './home.ts';
import { WeaveNode } from './node.ts';

export interface Daemon {
  node: WeaveNode;
  port: number;
  stop(): Promise<void>;
}

/** Open the node in `dir`, go online and serve the local API. One daemon per home. */
export async function startDaemon(dir?: string, options: { port?: number; linkPort?: number } = {}): Promise<Daemon> {
  const home = resolveHome(dir);
  if (await connectDaemon(home)) throw new Error(`a daemon is already running for ${home.dir}`);

  const node = WeaveNode.open(home.dir);
  // Serve the API right away; joining the DHT can take a while (or never finish when offline).
  const api = await startApi(node, options.port);
  const info: DaemonInfo = { pid: process.pid, port: api.port, token: api.token };
  writeJson(home.daemon, info);
  // Post addresses (http://weave.localhost:7710/…). One Weave per computer gets the port; the others go without.
  const linkPort = options.linkPort ?? (process.env.WEAVE_LINK_PORT ? Number(process.env.WEAVE_LINK_PORT) : undefined);
  const links = await startLinks(node, linkPort).catch((error: Error & { code?: string }): LinkServer | undefined => {
    console.error(`weave: post links are off: ${error.code === 'EADDRINUSE' ? 'another Weave serves them on this computer' : error.message}`);
    return undefined;
  });
  // Claude Code sessions, for the Mentions panel, if the person turned that on.
  node.startFollowing();
  const online = node.goOnline().catch((error: Error) => console.error(`weave: could not go online: ${error.message}`));

  // Carry out standing admission rules shortly after new events arrive.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reconcile = () => {
    clearTimeout(timer);
    timer = setTimeout(() => node.reconcile().catch((error: Error) => console.error(`weave: ${error.message}`)), 500);
  };
  const unsubscribe = node.replica.onAppend(reconcile);
  reconcile();

  let stopped = false;
  return {
    node,
    port: api.port,
    async stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      clearTimeout(timer);
      rmSync(home.daemon, { force: true });
      await api.close();
      await links?.close();
      await online;
      await node.close();
    },
  };
}
