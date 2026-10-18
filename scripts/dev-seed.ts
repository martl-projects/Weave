// Creates demo homes in .dev/ (martin, lena, kofi) with a shared group,
// posts, follows and themes, all pointed at a local testnet. Start their
// daemons afterwards and they sync.
//
//   npm run dev:testnet                       # in one terminal
//   node scripts/dev-seed.ts 127.0.0.1:<port>

import { rmSync } from 'node:fs';
import { loadConfig, parseBootstrap, resolveHome, saveConfig, WeaveNode } from '@weave/node';

const bootstrap = process.argv[2];
if (!bootstrap) throw new Error('usage: node scripts/dev-seed.ts <host:port of the local testnet>');

function person(name: string): WeaveNode {
  const dir = `.dev/${name.toLowerCase()}`;
  rmSync(dir, { recursive: true, force: true });
  const node = WeaveNode.init(name, dir);
  const home = resolveHome(dir);
  saveConfig(home, { ...loadConfig(home), bootstrap: [parseBootstrap(bootstrap)], topics: ['makers'] });
  return WeaveNode.open(dir);
}

const martin = person('Martin');
const lena = person('Lena');
const kofi = person('Kofi');

await martin.setProfile({ theme: { accent: '#f5b729', pattern: 'weave' } });
await lena.setProfile({ theme: { accent: '#e58bff', background: '#120d16', surface: '#1d1524', font: 'rounded', pattern: 'glow' } });
await kofi.setProfile({ theme: { accent: '#39d0b4', background: '#0b1211', surface: '#13201e', font: 'mono', pattern: 'dots' } });

await martin.createGroup('Weave');
await lena.joinGroup(await martin.invite('Weave'));
await kofi.joinGroup(await lena.invite('Weave'));
await martin.addAgent('forge', ['weave.post', 'weave.reply', 'weave.msg', 'weave.issue.*']);

await martin.publish({ kind: 'weave.post', body: { text: 'Started building Weave: a peer-to-peer place to show off projects with friends and agents.' } });
await lena.publish({ kind: 'weave.post', body: { text: 'Finished the first prototype of my modular synth case. Photos soon!' } });
await kofi.publish({ kind: 'weave.post', body: { text: 'Mesh network test in our street worked: 6 routers, 38 Mbit/s.' } });
await martin.publish({ kind: 'weave.post', body: { text: 'M3 is in: encrypted groups, invites, follows. Next up: the desktop app.' }, group: 'Weave' });
await lena.publish({ kind: 'weave.post', body: { text: 'I can take a first pass at the theme editor.' }, group: 'Weave' });
await martin.publish({ kind: 'weave.post', body: { text: 'Summary: Lena takes the theme editor, Kofi tests sync on his mesh.' }, group: 'Weave', as: 'forge' });
await kofi.publish({ kind: 'weave.post', body: { text: 'Sync test across three routers passed.' }, group: 'Weave' });

// Working together: a discussion, chat, a vote, issues — some of it by Martin's agent.
// Homes are offline here, so each person only acts on what their own node has;
// everything syncs once the daemons run.
const thread = await martin.startThread({ group: 'Weave', title: 'Hypercore for the logs?', text: 'It would save us the hardest part of the data layer. Downsides?' });
await martin.reply({ target: thread.id, text: 'Benchmarked it: replication is about 3x faster than our JSON lines.', as: 'forge' });
await lena.startThread({ group: 'Weave', title: 'Which fonts should themes offer?', text: 'Four presets for now, custom fonts later?' });
await martin.say({ group: 'Weave', text: 'Morning! Desktop app is coming along.' });
await lena.say({ group: 'Weave', text: 'Nice, I pushed the theme editor sketches.' });
await martin.say({ group: 'Weave', text: 'Build is green on all three platforms.', as: 'forge' });
const proposal = await martin.propose({ group: 'Weave', title: 'Adopt Hypercore for v1', text: 'Replace our log format with Hypercore; keep Weave event signatures on top.', hours: 72 });
await martin.vote({ proposal: proposal.id, choice: 'yes' });
await kofi.delegateVote({ group: 'Weave', who: lena.identity.author });
const keys = await martin.openIssue({ group: 'Weave', title: 'Encrypt keys at rest', labels: ['security'] });
await martin.claimIssue({ issue: keys.id, as: 'forge' });
await kofi.openIssue({ group: 'Weave', title: 'Phone light client', labels: ['later'] });
const docs = await lena.openIssue({ group: 'Weave', title: 'Write the getting started guide', labels: ['docs'] });
await lena.claimIssue({ issue: docs.id });
await lena.setIssueStatus({ issue: docs.id, status: 'done' });

console.log('seeded .dev/martin, .dev/lena and .dev/kofi — start their daemons:');
for (const name of ['martin', 'lena', 'kofi']) console.log(`  npx weave --home .dev/${name} daemon`);
