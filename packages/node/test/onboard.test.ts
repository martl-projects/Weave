import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { PlanStore, StorageNode, storageServer, type StorageNetwork } from '../src/index.ts';
import { people, sync } from './helpers/people.ts';

/*
 * Onboarding links from a creator's Weave (idea bZFDCQNT): martl makes a link for a project at a storage node that lets
 * him; Lena, who has Weave, looks at it and follows it, and is in the project with martl as her contact; martl's node
 * follows her back; taking the link back stops it and closes its invite. The page and the storage node are one origin
 * here, as a node that serves its page.
 */

const { person } = people('onboard');
const dirs: string[] = [];
const servers: Server[] = [];
const nodes: StorageNode[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
  for (const node of nodes.splice(0)) await node.close();
});
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));

async function storage() {
  const dir = mkdtempSync(join(tmpdir(), 'weave-onboard-storage-'));
  dirs.push(dir);
  const network = (): StorageNetwork => ({ join: async () => {}, leave: async () => {}, announce: () => {}, destroy: async () => {} });
  const node = await StorageNode.open({ dir, network });
  nodes.push(node);
  // A free port first, so the page's own origin is known before the server that lets only it open a socket.
  const probe = createServer();
  await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  const page = `http://127.0.0.1:${port}`;
  const server = storageServer(node, { origins: [page] });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(port, '127.0.0.1', resolve));
  return { dir, page, node };
}

describe('onboarding links', { timeout: 60_000 }, () => {
  it('makes a link for a project; someone with Weave follows it into the project as a friend; taking it back stops it', async () => {
    const { dir, page, node: store } = await storage();
    const martl = person('martl');
    const lena = person('Lena');
    const ada = person('Ada');
    await martl.createProject({ name: 'Pferderennen' });

    // Not before the storage node's operator lets this computer.
    await expect(martl.createOnboardLink({ project: 'Pferderennen', page })).rejects.toThrow(/weave-storage planner did:key:/);
    PlanStore.allowIn(dir, martl.identity.did);
    const made = await martl.createOnboardLink({ project: 'Pferderennen', page, uses: 5, welcome: 'Viel Spaß beim Rennen!', play: true, preview: { text: 'Komm mitspielen' } });
    expect(made.link).toMatch(new RegExp(`^${page}/j/[A-Za-z0-9]{8}#[A-Za-z0-9_-]{22}$`));
    expect(made).toMatchObject({ title: 'Pferderennen', friends: true, uses: 5 });
    expect(store.plans.preview(made.code)).toEqual({ live: true, preview: { title: 'Pferderennen', text: 'Komm mitspielen' } });

    // Lena looks first: who invites, to what, nothing used up.
    const look = await lena.lookAtOnboardLink(`Hier: ${made.link}`);
    expect(look).toMatchObject({ by: { name: 'martl' }, title: 'Pferderennen', welcome: 'Viel Spaß beim Rennen!', mine: false, spaces: [{ name: 'Pferderennen', kind: 'project', member: false }] });
    expect((await martl.onboardLinks())[0]).toMatchObject({ code: made.code, used: 0 });

    // She follows it: martl is her contact, she's in the project, and it's the one to open, with Play.
    const followed = await lena.followOnboardLink(made.link);
    expect(followed).toMatchObject({ open: { name: 'Pferderennen' }, welcome: 'Viel Spaß beim Rennen!', play: true });
    expect((await lena.profile(martl.identity.author)).following).toBe(true);
    expect((await lena.spaces()).map((s) => s.name)).toContain('Pferderennen');
    expect((await martl.onboardLinks())[0].used).toBe(1);

    // martl's node hears of her joining and follows her back: friends.
    sync(lena, martl);
    expect(await martl.followBackOnboarded()).toBe(1);
    expect((await martl.profile(lena.identity.author)).following).toBe(true);
    expect(await martl.followBackOnboarded()).toBe(0);
    // He added her back by the contact link she boxed to him: both see a friend, as when two add each other.
    expect((await martl.profile(lena.identity.author)).contact).toBe(true);
    sync(martl, lena);
    expect((await lena.social()).friends.map((p) => p.name)).toContain('martl');
    // Her follow reaches him in their chat once his keys are with her, as their daemons do it as they go.
    await lena.reconcile();
    sync(lena, martl);
    expect((await martl.social()).friends.map((p) => p.name)).toContain('Lena');

    // Taken back: the link stops, and its invite closes, so a copy of the plan's invite lets nobody new in.
    const plan = await ada.lookAtOnboardLink(made.link);
    const invite = plan.steps.find((s) => s.do === 'join')!;
    await martl.revokeOnboardLink(made.code);
    await expect(ada.lookAtOnboardLink(made.link)).rejects.toThrow('no longer works');
    expect((await martl.onboardLinks())[0]).toMatchObject({ code: made.code, revoked: true });
    expect(store.plans.preview(made.code)).toEqual({ live: false });
    await ada.joinSpace((invite as { link: string }).link);
    sync(ada, martl);
    sync(martl, lena);
    const members = (await martl.members('Pferderennen')).map((m) => m.name);
    expect(members).toContain('Lena');
    expect(members).not.toContain('Ada');
  });

  it("refuses one's own link and a link that isn't whole", async () => {
    const { dir, page } = await storage();
    const martl = person('martl');
    await martl.createProject({ name: 'Snake Flight' });
    PlanStore.allowIn(dir, martl.identity.did);
    const made = await martl.createOnboardLink({ project: 'Snake Flight', page, friends: false, preview: false });
    expect((await martl.lookAtOnboardLink(made.link)).mine).toBe(true);
    await expect(martl.followOnboardLink(made.link)).rejects.toThrow(/your own link/);
    const lena = person('Lena');
    await expect(lena.lookAtOnboardLink(made.link.replace(/#.*/, '#AAAAAAAAAAAAAAAAAAAAAA'))).rejects.toThrow(/is the link whole/);
    await expect(lena.lookAtOnboardLink(`${page}/j/${made.code}`)).rejects.toThrow(/not an onboarding link/);
  });
});
