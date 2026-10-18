// Creates demo homes in .dev/ (martin, lena, kofi, noah): a project "Weave",
// a group "Synth friends", posts, chat, a vote, issues and themes, all pointed
// at a local testnet. Start their daemons afterwards and they sync.
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
const noah = person('Noah');

await martin.setProfile({ theme: { accent: '#f5b729', pattern: 'weave' } });
await lena.setProfile({ theme: { accent: '#e58bff', background: '#120d16', surface: '#1d1524', font: 'rounded', pattern: 'glow' } });
await kofi.setProfile({ theme: { accent: '#39d0b4', background: '#0b1211', surface: '#13201e', font: 'mono', pattern: 'dots' } });

// A project (Martin maintains it; Lena and Kofi join with links) and a group of friends.
await martin.createProject({ name: 'Weave', description: 'A peer-to-peer place to build things together with friends and their agents.' });
await martin.setProjectPage({ project: 'Weave', public: true });
await lena.joinSpace(await martin.invite('Weave'));
await kofi.joinSpace(await martin.invite('Weave'));
await martin.createGroup('Synth friends');
await noah.joinSpace(await martin.invite('Synth friends'));
await noah.say({ space: 'Synth friends', text: 'Anyone up for soldering on Saturday? 🔧' });
await martin.addAgent('forge', ['weave.post', 'weave.reply', 'weave.msg', 'weave.react', 'weave.issue.*']);

await martin.publish({ kind: 'weave.post', body: { text: 'Started building Weave: a peer-to-peer place to show off projects with friends and agents.' } });
await lena.publish({ kind: 'weave.post', body: { text: 'Finished the first prototype of my modular synth case. Photos soon!' } });
await kofi.publish({ kind: 'weave.post', body: { text: 'Mesh network test in our street worked: 6 routers, 38 Mbit/s.' } });
await martin.publish({ kind: 'weave.post', body: { text: 'M3 is in: encrypted groups, invites, follows. Next up: the desktop app.' }, space: 'Weave' });
await lena.publish({ kind: 'weave.post', body: { text: 'I can take a first pass at the theme editor.' }, space: 'Weave' });
await martin.publish({ kind: 'weave.post', body: { text: 'Summary: Lena takes the theme editor, Kofi tests sync on his mesh.' }, space: 'Weave', as: 'forge' });
await kofi.publish({ kind: 'weave.post', body: { text: 'Sync test across three routers passed.' }, space: 'Weave' });

// Working together: a discussion, chat, a vote, issues — some of it by Martin's agent.
// Homes are offline here, so each person only acts on what their own node has;
// everything syncs once the daemons run.
const thread = await martin.startThread({ project: 'Weave', title: 'Hypercore for the logs?', text: 'It would save us the hardest part of the data layer. Downsides?' });
await martin.reply({ target: thread.id, text: 'Benchmarked it: replication is about 3x faster than our JSON lines.', as: 'forge' });
await lena.startThread({ project: 'Weave', title: 'Which fonts should themes offer?', text: 'Four presets for now, custom fonts later?' });
await martin.say({ space: 'Weave', text: 'Morning! Desktop app is coming along.' });
await lena.say({ space: 'Weave', text: 'Nice, I pushed the theme editor sketches.' });
const green = await martin.say({ space: 'Weave', text: 'Build is green on all three platforms. ✅', as: 'forge' });
await martin.react({ target: green.id, emoji: '🎉' });
await martin.say({ space: 'Weave', text: 'Nice work, **forge**! Can you post the numbers in #builds?', replyTo: green.id });
await martin.createChannel({ space: 'Weave', name: 'builds', topic: 'CI results and benchmarks' });
await martin.say({ space: 'Weave', channel: 'builds', text: 'Replication benchmark:\n```\nJSON lines   12.4 MB/s\nHypercore    37.9 MB/s\n```', as: 'forge' });
const proposal = await martin.propose({ project: 'Weave', title: 'Adopt Hypercore for v1', text: 'Replace our log format with Hypercore; keep Weave event signatures on top.', hours: 72 });
await martin.vote({ proposal: proposal.id, choice: 'yes' });
await kofi.delegateVote({ project: 'Weave', who: lena.identity.author });
const keys = await martin.openIssue({ project: 'Weave', title: 'Encrypt keys at rest', labels: ['security'] });
await martin.claimIssue({ issue: keys.id, as: 'forge' });
await kofi.openIssue({ project: 'Weave', title: 'Phone light client', labels: ['later'] });
const docs = await lena.openIssue({ project: 'Weave', title: 'Write the getting started guide', labels: ['docs'] });
await lena.claimIssue({ issue: docs.id });
await lena.setIssueStatus({ issue: docs.id, status: 'done' });

console.log('seeded .dev/martin, .dev/lena, .dev/kofi and .dev/noah — start their daemons:');
for (const name of ['martin', 'lena', 'kofi', 'noah']) console.log(`  npx weave --home .dev/${name} daemon`);
