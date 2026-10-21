import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { judgePurchase } from '../src/gumroad.ts';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-gumroad-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
}

const link = { product: 'sDonL7aMmKz8', url: 'https://martin.gumroad.com/l/editors', variant: 'Editors' };
const LENA = 'AAAA1111-BBBB2222-CCCC3333-DDDD4444';
const EVE = 'EEEE1111-BBBB2222-CCCC3333-DDDD4444';

describe('Gumroad answers', () => {
  it('counts only paid-up purchases of the right product and tier', () => {
    const paid = { product_id: link.product, email: 'lena@example.com', variants: '(Editors)', refunded: false, chargebacked: false, subscription_ended_at: null, subscription_failed_at: null, subscription_cancelled_at: null };
    expect(judgePurchase(link, paid)).toEqual({ ok: true, email: 'lena@example.com' });
    expect(judgePurchase(link, { ...paid, refunded: true })).toMatchObject({ ok: false, reason: 'the purchase was refunded' });
    expect(judgePurchase(link, { ...paid, subscription_cancelled_at: '2026-10-01T00:00:00Z' })).toMatchObject({ ok: false, reason: 'the membership was cancelled' });
    expect(judgePurchase(link, { ...paid, subscription_failed_at: '2026-10-01T00:00:00Z' })).toMatchObject({ ok: false });
    expect(judgePurchase(link, { ...paid, variants: '(Players)' })).toMatchObject({ ok: false, reason: expect.stringMatching(/not the "Editors" tier/) });
    expect(judgePurchase(link, { ...paid, product_id: 'somethingElse' })).toMatchObject({ ok: false, reason: expect.stringMatching(/another Gumroad product/) });
  });
});

describe('tiers sold through Gumroad', () => {
  it('lets supporters in with their license key, one person per key, and renews while they pay', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const kofi = person('Kofi');
    const eve = person('Eve');
    const all = [martin, lena, kofi, eve];

    // A fake Gumroad: Lena's key is paid up (until she cancels), any other key is unknown.
    let lenaCancelled = false;
    const asked: string[] = [];
    martin.checkLicense = async (l, key) => {
      asked.push(key);
      expect(l).toEqual(link);
      if (key !== LENA) return { ok: false, reason: "Gumroad doesn't know that license key (404)" };
      return lenaCancelled ? { ok: false, reason: 'the membership was cancelled' } : { ok: true, email: 'lena@example.com' };
    };

    const tier = await martin.createTier({ name: 'Editors', price: 500, gumroad: link });
    expect(tier.gumroad).toEqual(link);
    syncAll(all);
    expect((await lena.tiers('Martin'))[0].gumroad?.url).toBe(link.url);
    await expect(lena.requestMembership({ tier: tier.id, license: 'not a key!' })).rejects.toThrow(/looks like/);

    await lena.requestMembership({ tier: tier.id, license: LENA });
    await kofi.requestMembership({ tier: tier.id, license: LENA }); // the same key again
    await eve.requestMembership({ tier: tier.id, license: EVE });
    syncAll(all);
    await martin.reconcile();
    syncAll(all);

    // Lena is in for a month; Kofi's copy of her key and Eve's unknown key wait in the Inbox with the reason.
    const [membership] = await lena.memberships();
    expect(membership).toMatchObject({ name: 'Editors', membership: { active: true } });
    const left = await martin.membershipRequests();
    expect(left.map((r) => [r.name, r.license?.ok, r.license?.reason])).toEqual([
      ['Kofi', false, 'that license key already let Lena in'],
      ['Eve', false, "Gumroad doesn't know that license key (404)"],
    ]);
    // Each key is asked about once, not on every round.
    await martin.reconcile();
    expect(asked).toEqual([LENA, EVE]);

    // Four weeks on: still paid, so another month.
    const until = membership.membership!.until;
    martin.clock = () => Date.parse(until) - 2 * 86400_000;
    await martin.reconcile();
    syncAll(all);
    const renewed = (await lena.memberships())[0].membership!.until;
    expect(Date.parse(renewed)).toBeGreaterThan(Date.parse(until) + 27 * 86400_000);

    // A month later she has cancelled: no renewal, the grant runs out on its own.
    lenaCancelled = true;
    martin.clock = () => Date.parse(renewed) - 2 * 86400_000;
    await martin.reconcile();
    syncAll(all);
    expect((await lena.memberships())[0].membership!.until).toBe(renewed);
  });
});
