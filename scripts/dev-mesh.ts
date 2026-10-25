// Simulates a small Weave mesh on this machine: a local Hyperswarm testnet
// (no traffic to the public DHT), several people each running a node, and an
// agent running on its own node with a key delegated by its owner.
//
//   npm run dev:mesh -- --people 4 --seconds 20

import { parseArgs } from 'node:util';
import createTestnet from 'hyperdht/testnet.js';
import { createIdentity, createSubKey, delegation, Replica, type SigningIdentity, type WeaveRecord } from '@weave/core';
import { SwarmNode } from '@weave/net';

const { values } = parseArgs({
  options: {
    people: { type: 'string', default: '3' },
    seconds: { type: 'string', default: '15' },
  },
});
const peopleCount = Math.max(2, Math.min(8, Number(values.people)));
const seconds = Number(values.seconds);

const NAMES = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'grace', 'heidi'];
const COLORS = [31, 32, 33, 34, 35, 36, 91, 92, 93];
const paint = (i: number, text: string) => `\x1b[${COLORS[i % COLORS.length]}m${text}\x1b[0m`;

interface Peer {
  name: string;
  color: number;
  identity: SigningIdentity;
  replica: Replica;
  node?: SwarmNode;
}

const testnet = await createTestnet(3);
console.log(`local testnet up, bootstrap ${testnet.bootstrap.map((b) => `${b.host}:${b.port}`).join(', ')}`);

const peers: Peer[] = NAMES.slice(0, peopleCount).map((name, i) => ({
  name,
  color: i,
  identity: createIdentity(),
  replica: new Replica(),
}));

// Alice's agent runs on its own node, with a key alice delegated to it.
const alice = peers[0];
const forgeKey = createSubKey(alice.identity.did);
alice.replica.append(alice.identity, delegation(forgeKey.did, 'agent', ['weave.post', 'weave.reply'], 'Forge'));
const forge: Peer = { name: 'forge (alice\'s agent)', color: peopleCount, identity: forgeKey, replica: new Replica() };
peers.push(forge);

const nameOf = (event: WeaveRecord) => {
  const peer = peers.find((p) => p.identity.did === event.signer);
  return peer ? paint(peer.color, peer.name) : event.signer.slice(0, 16);
};

for (const peer of peers) {
  peer.replica.onAppend((event) => {
    if (event.signer === peer.identity.did || event.kind === 'weave.delegate') return;
    console.log(`${paint(peer.color, peer.name.padEnd(22))} <- ${nameOf(event)}: ${JSON.stringify(event.body)} (seq ${event.seq})`);
  });
  peer.node = new SwarmNode(peer.replica, { bootstrap: testnet.bootstrap });
  await peer.node.join('dev-mesh');
}
console.log(`${peers.length} nodes joined the topic; posting for ${seconds}s\n`);

const LINES = ['working on the cone editor', 'pushed a fix', 'anyone tried the new build?', 'nice!', 'meeting at 8?', 'shared a screenshot'];
let tick = 0;
const timer = setInterval(() => {
  tick++;
  const people = peers.filter((p) => p !== forge);
  const author = people[tick % people.length];
  author.replica.append(author.identity, { kind: 'weave.post', body: LINES[tick % LINES.length] });
  // Forge reacts once it has seen its delegation.
  if (tick % 3 === 0 && forge.replica.authority.grant(forge.identity.did)) {
    forge.replica.append(forge.identity, { kind: 'weave.reply', body: `summary after ${tick} posts` });
  }
}, 1000);

await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
clearInterval(timer);
await new Promise((resolve) => setTimeout(resolve, 1500)); // let the last events arrive

const reference = JSON.stringify(peers[0].replica.heads());
console.log('\nresult:');
for (const peer of peers) {
  const same = JSON.stringify(peer.replica.heads()) === reference;
  console.log(`  ${paint(peer.color, peer.name.padEnd(22))} ${String(peer.replica.events().length).padStart(3)} events, ${peer.node!.sessions.size} peers, ${same ? 'in sync' : 'DIFFERENT'}`);
}

for (const peer of peers) await peer.node!.destroy();
await testnet.destroy();
