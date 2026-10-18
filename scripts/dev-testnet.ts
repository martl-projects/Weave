// Runs a local Hyperswarm DHT so daemons on this machine can find each other
// without touching the public network. Point a home at it with
//
//   weave --home .dev/alice bootstrap 127.0.0.1:<port>

import createTestnet from 'hyperdht/testnet.js';

const testnet = await createTestnet(3);
const [first] = testnet.bootstrap;
console.log(`local testnet running — bootstrap ${first.host}:${first.port}`);
console.log(`  weave --home .dev/<name> bootstrap ${first.host}:${first.port}`);

process.on('SIGINT', async () => {
  await testnet.destroy();
  process.exit(0);
});
