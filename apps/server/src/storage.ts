// A storage node: holds people's spaces for their browsers, without being able to read them (docs/web-stage2.md).
//
//   weave-storage run       run it: --dir, --port (8790), --origin https://… (several times), --web <the page's folder>
//   weave-storage invite    a new invitation, for one account, once: --dir, --origin for the link
//
// Its folder is WEAVE_STORAGE_DIR, or --dir. TLS is a proxy's in front of it (see Caddyfile.storage): --behind-proxy
// then counts connections by the address the proxy names.

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
    web: { type: 'string' },
    'behind-proxy': { type: 'boolean', default: false },
  },
});

const dir = values.dir ?? process.env.WEAVE_STORAGE_DIR;
if (!dir) {
  console.error('say where it keeps things: --dir, or WEAVE_STORAGE_DIR');
  process.exit(1);
}

const command = positionals[0];

if (command === 'invite') {
  const code = StorageNode.inviteIn(resolve(dir));
  console.log(values.origin[0] ? `${values.origin[0]}/?invite=${code}` : code);
} else if (command === 'run') {
  if (!values.origin.length) {
    console.error('say where pages may connect from: --origin https://…');
    process.exit(1);
  }
  const node = await StorageNode.open({ dir: resolve(dir), network: swarmNetwork() });
  const server = storageServer(node, { origins: values.origin, web: values.web && resolve(values.web), behindProxy: values['behind-proxy'] });
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
  console.error('weave-storage run | invite');
  process.exit(1);
}
