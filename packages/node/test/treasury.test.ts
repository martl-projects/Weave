import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { afterAll, describe, expect, it } from 'vitest';
import { checksumAddress, readPayment, safeAddress, TEST_USDC, TRANSFER_TOPIC, treasurySaltNonce } from '@weave/core';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close();
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'weave-treasury-'));
  dirs.push(dir);
  const node = WeaveNode.init(name, dir);
  nodes.push(node);
  return node;
}

const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));

/** A wallet as MetaMask & co. have one: an address, and personal_sign. */
function wallet() {
  const secret = secp256k1.utils.randomSecretKey();
  const address = checksumAddress('0x' + bytesToHex(keccak_256(secp256k1.getPublicKey(secret, false).subarray(1)).subarray(12)));
  const sign = (message: string) => {
    const body = utf8ToBytes(message);
    const hash = keccak_256(new Uint8Array([...utf8ToBytes(`\x19Ethereum Signed Message:\n${body.length}`), ...body]));
    const sig = secp256k1.sign(hash, secret, { prehash: false, format: 'recovered' });
    return '0x' + bytesToHex(sig.subarray(1)) + (27 + sig[0]).toString(16);
  };
  return { address, sign };
}

describe('treasuries', () => {
  it('links a wallet only with its own signature, and computes the Safe its maintainers own', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const project = await martin.createProject({ name: 'Pferderennen' });

    // No wallet yet: no address, Martin is listed as missing.
    expect(await martin.treasury('Pferderennen')).toMatchObject({ owners: [], missing: [{ name: 'Martin' }], maintainer: true });

    const mine = wallet();
    const other = wallet();
    const message = await martin.walletMessage(mine.address);
    await expect(martin.linkWallet({ address: mine.address })).rejects.toThrow(/sign this/);
    await expect(martin.linkWallet({ address: mine.address, proof: other.sign(message) })).rejects.toThrow(/isn't from/);
    expect(await martin.linkWallet({ address: mine.address.toLowerCase(), proof: mine.sign(message) })).toMatchObject({ address: mine.address, verified: true, mine: true });

    const treasury = await martin.treasury('Pferderennen');
    expect(treasury.owners).toEqual([{ person: { did: martin.identity.author, name: 'Martin' }, address: mine.address }]);
    expect(treasury.threshold).toBe(1);
    expect(treasury.address).toBe(safeAddress([mine.address], 1, treasurySaltNonce(project.id)));

    // Anyone with Martin's events sees the same wallet, checked against its signature.
    sync(martin, lena);
    expect(await lena.wallet('Martin')).toMatchObject({ address: mine.address, verified: true, mine: false });

    await martin.linkWallet({ address: '' });
    expect(await martin.wallet()).toBeUndefined();
  });

  it('knows who a split pays, announces the treasury, and keeps parts without an address', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    await martin.createProject({ name: 'Flug' });
    const mine = wallet();
    await martin.linkWallet({ address: mine.address, proof: mine.sign(await martin.walletMessage(mine.address)) });

    const t = await martin.setSplit({ project: 'Flug', preset: 'standard' });
    // No community named: its part goes to the treasury; the foundation has no address yet.
    expect(t.recipients).toEqual([
      { kind: 'person', id: martin.identity.author, name: 'Martin', address: mine.address, share: 840000, part: 'makers' },
      { kind: 'project', id: t.project.id, name: 'Flug', address: t.address, share: 100000, part: 'treasury' },
      { kind: 'project', id: t.project.id, name: 'Flug', address: t.address, share: 50000, part: 'community' },
      { kind: 'foundation', id: '', name: 'Weave Foundation', share: 10000, part: 'foundation' },
    ]);
    // On chain, what has no address stays with the maker.
    expect(t.allocations?.reduce((sum, a) => sum + a.share, 0)).toBe(1_000_000);
    expect(new Map(t.allocations!.map((a) => [a.address, a.share]))).toEqual(new Map([[mine.address, 850000], [t.address!, 150000]]));
    expect(t.deploy?.data.startsWith('0x1688f0b9')).toBe(true);

    // The split announced the treasury publicly: others can check it against the owners' wallets.
    expect(t.announced).toBe(true);
    sync(martin, lena);
    const seen = martin.replica.events((e) => e.kind === 'weave.treasury');
    expect(seen).toHaveLength(1);

    // Labels: anyone's, on any address; blocking needs a reason; withdrawing removes it.
    await expect(lena.label({ target: t.address!, label: 'block' })).rejects.toThrow(/say why/);
    await lena.label({ target: t.address!, label: 'endorse', reason: 'good people' });
    await martin.label({ target: t.address!, label: 'block', reason: 'testing' });
    sync(martin, lena);
    expect((await lena.labels({ target: t.address! })).map((l) => [l.by.name, l.label])).toEqual(expect.arrayContaining([['Lena', 'endorse'], ['Martin', 'block']]));
    expect(await lena.labels({ target: t.address!, by: ['Lena'] })).toHaveLength(1);
    await lena.label({ target: t.address!, label: '' });
    expect(await lena.labels({ target: t.address!, by: ['Lena'] })).toHaveLength(0);
  });

  it('splits income by a preset or custom shares, the foundation optional; only maintainers set it, changes wait', async () => {
    const martin = person('Martin');
    await martin.createProject({ name: 'Gameshow' });

    const first = await martin.setSplit({ project: 'Gameshow', preset: 'standard' });
    expect(first.split).toMatchObject({ preset: 'standard', shares: { makers: 8400, treasury: 1000, community: 500, foundation: 100 } });
    expect(first.pending).toBeUndefined();

    // The foundation can be left out entirely; a change counts only after the notice.
    const changed = await martin.setSplit({ project: 'Gameshow', shares: { makers: 9000, treasury: 1000 } });
    expect(changed.split?.preset).toBe('standard');
    expect(changed.pending).toMatchObject({ preset: 'custom', shares: { makers: 9000, treasury: 1000, community: 0, foundation: 0 } });

    await expect(martin.setSplit({ project: 'Gameshow', shares: { makers: 9000 } })).rejects.toThrow(/add up to 10000/);
    await expect(martin.setSplit({ project: 'Gameshow', preset: 'greedy' })).rejects.toThrow(/no preset/);
  });
});

describe('tiers paid on chain', () => {
  const tx = (n: number) => '0x' + String(n).padStart(64, '0');
  const all = (nodes: WeaveNode[]) => {
    for (let round = 0; round < 2; round++) for (const a of nodes) for (const b of nodes) if (a !== b) sync(a, b);
  };

  it('reads a transfer from a receipt: to the tier, from one wallet, a month per price', () => {
    const price = { chain: TEST_USDC.chain, token: TEST_USDC.token, symbol: 'USDC', decimals: 6, to: '0x2222222222222222222222222222222222222222', amount: 5_000_000 };
    const transfer = (from: string, to: string, value: number, token = TEST_USDC.token) => ({ address: token, topics: [TRANSFER_TOPIC, '0x' + from.slice(2).padStart(64, '0'), '0x' + to.slice(2).padStart(64, '0')], data: '0x' + value.toString(16).padStart(64, '0') });
    const lena = '0x1111111111111111111111111111111111111111';
    expect(readPayment({ status: '0x1', logs: [transfer(lena, price.to, 10_000_000)] }, price)).toMatchObject({ ok: true, months: 2, from: checksumAddress(lena) });
    expect(readPayment({ status: '0x1', logs: [transfer(lena, price.to, 1_000_000)] }, price)).toMatchObject({ ok: false, reason: expect.stringMatching(/a month is 5/) });
    expect(readPayment({ status: '0x1', logs: [transfer(lena, price.to, 10_000_000, '0x3333333333333333333333333333333333333333')] }, price)).toMatchObject({ ok: false });
    expect(readPayment({ status: '0x0', logs: [] }, price)).toMatchObject({ ok: false, reason: expect.stringMatching(/failed/) });
    expect(readPayment(null, price)).toMatchObject({ ok: false, reason: expect.stringMatching(/pending/) });
  });

  it('lets in whoever paid from their linked wallet, once per transaction', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const eve = person('Eve');
    const lenaWallet = wallet();
    await lena.linkWallet({ address: lenaWallet.address, proof: lenaWallet.sign(await lena.walletMessage(lenaWallet.address)) });
    const price = { chain: TEST_USDC.chain, token: TEST_USDC.token, symbol: 'USDC', decimals: 6, to: '0x2222222222222222222222222222222222222222', amount: 5_000_000 };
    const tier = await martin.createTier({ name: 'Editors', onchain: price });
    expect(tier.onchain).toEqual(price);

    // A fake chain: tx 1 is Lena paying two months, anything else isn't mined yet.
    const read: string[] = [];
    martin.checkPayment = async (p, hash) => {
      read.push(hash);
      expect(p).toEqual(price);
      return hash === tx(1) ? { ok: true, from: lenaWallet.address, value: '10000000', months: 2 } : { ok: false, reason: 'no such transaction on the chain (yet): it may still be pending' };
    };
    all([martin, lena, eve]);
    await expect(eve.requestMembership({ tier: tier.id, payment: tx(1) })).rejects.toThrow(/link the wallet/);
    const eveWallet = wallet();
    await eve.linkWallet({ address: eveWallet.address, proof: eveWallet.sign(await eve.walletMessage(eveWallet.address)) });

    await lena.requestMembership({ tier: tier.id, payment: tx(1) });
    await eve.requestMembership({ tier: tier.id, payment: tx(1) }); // Lena's transaction, claimed by Eve
    all([martin, lena, eve]);
    await martin.reconcile();
    all([martin, lena, eve]);

    const [membership] = await lena.memberships();
    expect(membership).toMatchObject({ name: 'Editors', membership: { active: true } });
    expect(Date.parse(membership.membership!.until) - Date.now()).toBeGreaterThan(55 * 86400_000);
    expect((await martin.membershipRequests()).map((r) => [r.name, r.payment?.ok, r.payment?.reason])).toEqual([['Eve', false, 'that transaction already let Lena in']]);
    expect(read).toEqual([tx(1)]);
  });
});
