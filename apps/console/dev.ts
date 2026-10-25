// A sample company for working on the admin console: stand-ins for Vault and
// the company's sign-in, a company node with a few people, spaces and settings,
// and the console on http://localhost:7730. Signing in shows a page to pick who:
// Lena (admin), Ada (auditor) or Sam (helpdesk).

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WeaveNode } from '../../packages/node/src/index.ts';
import { OidcStub, VaultStub } from '../../packages/node/test/helpers/stubs.ts';

const oidc = await new OidcStub().start();
const vault = await new VaultStub(oidc).start();
vault.createKey('acme');
const dir = () => mkdtempSync(join(tmpdir(), 'weave-console-dev-'));
const settle = () => new Promise((r) => setTimeout(r, 300));
const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) a.replica.events().forEach((e) => b.replica.ingest(e));
};

const acme = WeaveNode.init('Acme Robotics', dir());
acme.kmsCredentials = { token: vault.rootToken };
await acme.createCompany({ name: 'Acme Robotics', provider: { kind: 'vault', address: vault.address, key: 'acme', jwt: { role: 'employees' } }, issuer: oidc.issuer, audience: 'weave', admins: 'weave-admins' });
await settle();
for (const [kind, name] of [['project', 'Roadmap'], ['project', 'Firmware'], ['group', 'Engineering'], ['group', 'Leadership']] as const) await acme.companyAction({ action: 'space', kind, name });
await settle();
const spaces = (await acme.company())!.spaces;
const id = (name: string) => spaces.find((s) => s.name === name)!.id;
await acme.companyAction({ action: 'map', group: 'engineering', space: id('Engineering') });
await acme.companyAction({ action: 'map', group: 'engineering', space: id('Firmware'), role: 'maintainer' });
await acme.companyAction({ action: 'map', group: 'employees', space: id('Roadmap') });
await acme.companyAction({ action: 'map', group: 'leadership', space: id('Leadership') });
await acme.companyAction({ action: 'settings', directs: 'company', chats: true, public: false, retention: { minDays: 90, maxDays: 2555 }, auditors: 'weave-auditors', helpdesk: 'weave-helpdesk' });
await acme.companyAction({ action: 'settings', retention: { space: id('Roadmap'), maxDays: 365 } });

const link = await acme.enrollLink();
const people = [
  { name: 'Lena Brandt', sub: 'lena', groups: ['employees', 'engineering', 'weave-admins'] },
  { name: 'Kofi Mensah', sub: 'kofi', groups: ['employees', 'engineering'] },
  { name: 'Ada Novak', sub: 'ada', groups: ['employees', 'leadership', 'weave-auditors'] },
  { name: 'Sam Ortiz', sub: 'sam', groups: ['employees', 'weave-helpdesk'] },
];
const nodes: WeaveNode[] = [];
for (const p of people) nodes.push(await WeaveNode.enroll(link, dir(), { idToken: ({ nonce }) => oidc.token({ nonce, sub: p.sub, email: `${p.sub}@acme.example`, groups: p.groups }), name: p.name }));
const all = [acme, ...nodes];
sync(all);
for (const n of nodes) await n.reconcile();
await settle();
sync(all);
for (let i = 0; i < 2; i++) {
  await acme.reconcile();
  sync(all);
  for (const n of nodes) await n.reconcile();
  sync(all);
}
await nodes[0].say({ space: 'Engineering', text: 'Welcome to the new Weave space!' });
// Agents: Lena's is approved in Engineering; Kofi's waits.
const lenaAgent = await nodes[0].addAgent('claude', ['weave.msg']);
await nodes[1].addAgent('helper', ['weave.msg']);
sync(all);
await acme.approveAgent({ space: id('Engineering'), agent: lenaAgent.did });
await acme.companyAction({ action: 'hold', space: id('Leadership'), until: '2027-06-30', reason: 'Board review' });
sync(all);
await acme.reconcile();

oidc.people = people.slice(0, 1).concat(people.slice(2)).map((p) => ({ sub: p.sub, email: `${p.sub}@acme.example`, name: p.name, groups: p.groups }));
const info = await acme.setConsole({ on: true, port: 7730, clientId: 'weave-console' });
console.log(`admin console at ${info.url} (sign in as Lena, an admin; Ada, an auditor; or Sam, the helpdesk)`);
