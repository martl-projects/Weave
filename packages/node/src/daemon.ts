import { rmSync } from 'node:fs';
import { startApi } from './api.ts';
import { startLinks, type LinkServer } from './links.ts';
import { connectDaemon, type DaemonInfo } from './client.ts';
import { resolveHome, writeJson } from './home.ts';
import { WeaveNode } from './node.ts';
import { unlockHomeKey } from './homekey.ts';

export interface Daemon {
  node: WeaveNode;
  port: number;
  stop(): Promise<void>;
}

/**
 * Open the node in `dir`, go online and serve the local API. One daemon per home. `onStopRequest` runs when a
 * client asks it to stop (POST /v1/stop); `version`, `build` and `startedBy` go into daemon.json for clients.
 * `linkPort`: where post addresses are served (default 7710, or WEAVE_LINK_PORT).
 */
export async function startDaemon(
  dir?: string,
  options: { port?: number; linkPort?: number; onStopRequest?: () => void } & Pick<DaemonInfo, 'version' | 'build' | 'startedBy'> = {},
): Promise<Daemon> {
  const home = resolveHome(dir);
  if (await connectDaemon(home)) throw new Error(`a daemon is already running for ${home.dir}`);

  // A company server's home key may be in the company's key service: unlock it before anything opens the home.
  await unlockHomeKey(home);
  const node = WeaveNode.open(home.dir);
  // Serve the API right away; joining the DHT can take a while (or never finish when offline).
  const api = await startApi(node, options.port, { ...(options.onStopRequest ? { stop: options.onStopRequest } : {}), service: (token) => node.serviceGate(token) });
  const info: DaemonInfo = {
    pid: process.pid,
    port: api.port,
    token: api.token,
    ...(options.version ? { version: options.version } : {}),
    ...(options.build ? { build: options.build } : {}),
    ...(options.startedBy ? { startedBy: options.startedBy } : {}),
  };
  writeJson(home.daemon, info);
  // Post addresses (http://weave.localhost:7710/…). One Weave per computer gets the port; the others go without.
  const linkPort = options.linkPort ?? (process.env.WEAVE_LINK_PORT ? Number(process.env.WEAVE_LINK_PORT) : undefined);
  const links = await startLinks(node, linkPort, node.githubAppFlow).catch((error: Error & { code?: string }): LinkServer | undefined => {
    console.error(`weave: post links are off: ${error.code === 'EADDRINUSE' ? 'another Weave serves them on this computer' : error.message}`);
    return undefined;
  });
  // Where GitHub sends the person back when they set up their own GitHub App.
  node.linkPort = links?.port;
  // Claude Code sessions, for the Mentions panel, if the person turned that on.
  node.startFollowing();
  const online = node.goOnline().catch((error: Error) => console.error(`weave: could not go online: ${error.message}`));
  // A company's node serves its user management and admins too (stage 12).
  await node.startServices();
  // The person's own services, each with its own token for the API.
  node.runServices({ port: api.port });

  // Carry out standing admission rules shortly after new events arrive.
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reconcile = () => {
    clearTimeout(timer);
    timer = setTimeout(() => node.reconcile().catch((error: Error) => console.error(`weave: ${error.message}`)), 500);
  };
  const unsubscribe = node.replica.onAppend(reconcile);
  reconcile();
  // And every few minutes regardless: sign-ins renew, keys time out, the company's duties come due.
  const heartbeat = setInterval(reconcile, 5 * 60_000);
  heartbeat.unref();

  // Routines: create what's due, shortly after starting (the computer may have been off) and every minute.
  const tick = () => void node.tickRoutines().catch((error: Error) => console.error(`weave: routines: ${error.message}`));
  const firstTick = setTimeout(tick, 3000);
  const routines = setInterval(tick, 60_000);

  let stopped = false;
  return {
    node,
    port: api.port,
    async stop() {
      if (stopped) return;
      stopped = true;
      unsubscribe();
      clearTimeout(timer);
      clearTimeout(firstTick);
      clearInterval(routines);
      clearInterval(heartbeat);
      rmSync(home.daemon, { force: true });
      await api.close();
      await links?.close();
      // Going online may never finish (no network, a bootstrap that doesn't answer): closing the node ends it anyway.
      await Promise.race([online, new Promise((resolve) => setTimeout(resolve, 2000).unref())]);
      await node.close();
    },
  };
}
