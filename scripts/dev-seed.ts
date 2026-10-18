// Creates demo homes in .dev/ (martin, lena, kofi, noah): a project "Weave"
// with boards, communities with posts, upvotes and post chats, a group
// "Synth friends", chat, a vote, issues and themes, all pointed at a local
// testnet. Start their daemons afterwards and they sync.
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
const everyone = [martin, lena, kofi, noah];

/** The homes are offline; hand everyone's events to everyone, as the daemons would. */
const sync = () => {
  for (const from of everyone) for (const to of everyone) if (from !== to) for (const event of from.replica.events()) to.replica.ingest(event);
};

await martin.setProfile({ theme: { accent: '#000080', background: '#008080', surface: '#ffffff', text: '#000000', pattern: 'weave' } });
await lena.setProfile({ theme: { accent: '#ff3fa4', background: '#1a0b24', surface: '#fff4fb', text: '#2a1033', font: 'rounded', pattern: 'glow' } });
await kofi.setProfile({ theme: { accent: '#0a7a3c', background: '#d9f2e3', surface: '#ffffff', text: '#0b2215', font: 'mono', pattern: 'dots' } });

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

// Communities: boards of posts with a chat per post.
await lena.createCommunity({ name: 'Synths', description: 'Modular synths, DIY cases, patches and sounds. Show what you built!' });
await kofi.createCommunity({ name: 'Mesh', description: 'Community networks, routers on rooftops, and keeping the street online.' });
await martin.createCommunity({ name: 'Makers', description: 'Everything our friends are building. Share your projects here.' });
for (const p of [martin, kofi, noah]) await p.joinSpace(await lena.invite('Synths'));
await martin.joinSpace(await kofi.invite('Mesh'));
for (const p of [lena, kofi, noah]) await p.joinSpace(await martin.invite('Makers'));
sync();

const synthCase = await lena.submit({ space: 'Synths', title: 'Finished my first modular case: 104HP of walnut', text: 'Took three weekends. The rails are from Tiptop, the power supply is a uZeus. Photos in the chat!' });
const saturday = await noah.submit({ space: 'Synths', title: 'Soldering session on Saturday?', text: 'I have a Mutable Instruments Plaits kit waiting. Bring your irons 🔧' });
const patch = await kofi.submit({ space: 'Synths', title: 'Generative patch: Maths + Plaits + a lot of reverb', link: 'https://example.com/patch-notes' });
const rooftop = await kofi.submit({ space: 'Mesh', title: 'Rooftop test: 6 routers, 38 Mbit/s across the street', text: 'LibreMesh on GL.iNet boxes. Next: the bakery wants a node.' });
sync();

const weave = (await martin.posts()).find((p) => p.type === 'project')!;
const sharedWeave = await martin.share({ post: weave.id, to: 'Makers', text: 'Peer-to-peer place to build things together. Who wants in?' });
await lena.submit({ space: 'Makers', title: 'Weekend project: a pixel-art clock for the kitchen', text: '64×32 LED panel, an ESP32, and a lot of tiny sprites.' });
sync();

for (const [who, post, value] of [
  [martin, synthCase, 1], [kofi, synthCase, 1], [noah, synthCase, 1], [lena, synthCase, 1],
  [martin, saturday, 1], [lena, saturday, 1], [martin, patch, 1], [noah, patch, -1],
  [martin, rooftop, 1], [kofi, rooftop, 1], [lena, sharedWeave, 1], [kofi, sharedWeave, 1], [noah, sharedWeave, 1],
] as const) await who.upvote({ target: post.id, value });
await martin.say({ post: synthCase.id, text: 'That walnut is gorgeous. What did you finish it with?' });
await lena.say({ post: synthCase.id, text: 'Just hard wax oil, two coats.' });
await noah.say({ post: synthCase.id, text: 'Can I copy the design? 👀' });
await lena.say({ post: synthCase.id, text: 'Of course! I will share the cut files.' });
await martin.say({ post: saturday.id, text: 'Count me in, I will bring the fume extractor.' });
await kofi.say({ post: sharedWeave.id, text: 'Can our mesh run a helper node for this?' });
await martin.save({ target: synthCase.id, mode: 'pinned' });
await martin.save({ target: rooftop.id, mode: 'saved' });
sync();

// The project's boards: releases and ideas as posts, plus a custom board, with pinned posts and their own chats.
const release = await martin.submit({ space: 'Weave', board: 'releases', title: 'v0.1: projects, groups and communities', text: 'Groups and projects are separate now, communities are in, every post has a chat. **Retro look included.**' });
const avatars = await lena.submit({ space: 'Weave', board: 'ideas', title: 'Pixel avatars for everyone', text: 'Generated from your key, so nobody needs to upload anything.' });
await martin.setBoard({ project: 'Weave', name: 'showcase', title: 'Showcase', sort: 'top' });
await martin.submit({ space: 'Weave', board: 'showcase', title: 'First screenshot of the Win95 look' });
await martin.curate({ space: 'Weave', board: 'releases', pinned: [release.id] });
sync();
await lena.upvote({ target: release.id, value: 1 });
await kofi.upvote({ target: avatars.id, value: 1 });
await martin.upvote({ target: weave.id, value: 1 });
await kofi.say({ post: avatars.id, text: 'Yes! Deterministic sprites from the did:key.' });
await martin.say({ post: release.id, text: 'Tell me what breaks 🙂', as: 'forge' });

console.log('seeded .dev/martin, .dev/lena, .dev/kofi and .dev/noah — start their daemons:');
for (const name of ['martin', 'lena', 'kofi', 'noah']) console.log(`  npx weave --home .dev/${name} daemon`);
