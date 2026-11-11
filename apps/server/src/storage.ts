// A storage node: holds people's spaces for their browsers, without being able to read them (docs/web-stage2.md).
//
//   weave-storage run       run it: --dir, --port (8790), --origin https://… (several times), --web <the page's folder>,
//                           --relay-origin https://*.weave-rooms.net (websites' tabs, which may use the relay)
//   weave-storage invite    a new invitation, for one account, once: --dir, --origin for the link; --accounts 20 for one
//                           link that 20 people can use
//   weave-storage invites   the invitations not used up yet
//
// Its folder is WEAVE_STORAGE_DIR, or --dir. TLS is a proxy's in front of it (see deploy/Caddyfile): --behind-proxy
// then counts connections by the address the proxy names. Setting one up: docs/web-deploy.md.

import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { StorageNode, storageServer, swarmNetwork } from '@weave/node';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    dir: { type: 'string' },
    port: { type: 'string', default: '8790' },
    host: { type: 'string', default: '127.0.0.1' },
    origin: { type: 'string', multiple: true, default: [] },
    'relay-origin': { type: 'string', multiple: true, default: [] },
    web: { type: 'string' },
    'behind-proxy': { type: 'boolean', default: false },
    accounts: { type: 'string', default: '1' },
  },
});

const dir = values.dir ?? process.env.WEAVE_STORAGE_DIR;
if (!dir) {
  console.error('say where it keeps things: --dir, or WEAVE_STORAGE_DIR');
  process.exit(1);
}

const command = positionals[0];

if (command === 'invite') {
  const code = StorageNode.inviteIn(resolve(dir), Number(values.accounts));
  console.log(values.origin[0] ? `${values.origin[0]}/?invite=${code}` : code);
} else if (command === 'invites') {
  const { single, shared } = StorageNode.invitesIn(resolve(dir));
  console.log(`for one account: ${single}`);
  for (const { id, left } of shared) console.log(`shared ${id}: ${left} left`);
} else if (command === 'run') {
  if (!values.origin.length) {
    console.error('say where pages may connect from: --origin https://…');
    process.exit(1);
  }
  const node = await StorageNode.open({ dir: resolve(dir), network: swarmNetwork() });
  const server = storageServer(node, { origins: values.origin, relayOrigins: values['relay-origin'], web: values.web && resolve(values.web), behindProxy: values['behind-proxy'] });
  server.listen(Number(values.port), values.host, () => console.log(`weave-storage on ${values.host}:${values.port}, for ${values.origin.join(', ')}`));
  const stop = async () => {
    server.closeAllConnections();
    server.close();
    await node.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());
} else {
  console.error('weave-storage run | invite | invites');
  process.exit(1);
}
