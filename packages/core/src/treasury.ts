import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { TREASURY_CHAIN } from './chain.ts';
import type { Entry } from './collab.ts';
import { isDid, type Did } from './keys.ts';
import type { EventView } from './records.ts';

/*
 * Treasuries: a project's own wallet, and how its income is split. Weave never
 * holds keys or money: people keep their own wallets, a project's treasury is a
 * Safe multisig owned by its maintainers' wallets, and income is divided by a
 * split contract on chain. Weave only computes the addresses and records who
 * agreed to what.
 *
 *   weave.wallet           {chain, address, proof, contract}
 *                          public, by a person: their wallet address. proof is the wallet's
 *                          own signature (EIP-191) over walletMessage(did, address), so nobody
 *                          can claim an address they don't hold. address '' unlinks it.
 *                          contract: a smart wallet (a Safe, a Coinbase Smart Wallet), whose
 *                          signature its contract confirms on chain (EIP-1271)
 *   weave.wallet.checked   {owner, address, proof, ok}   sealed to self: what the chain said about
 *                          a smart wallet's signature, so it's asked once
 *   weave.treasury.split   {preset, shares: {makers, treasury, community, foundation}, makers, community}
 *                          in the project, by a maintainer: how income is divided, in basis
 *                          points (10000 = 100%). makers: [{did, share}] divides the makers'
 *                          part (equal when missing). The first split counts at once; a
 *                          later one only after SPLIT_NOTICE_DAYS, so nobody is surprised by it.
 *   weave.treasury         {space, kind, address, owners, threshold}
 *                          public, by a maintainer (or moderator): the space's treasury as they
 *                          computed it, so people outside the space can pay it and include it in
 *                          their own splits. Anyone can check the address against the owners'
 *                          linked wallets; that the author manages the space only its members can,
 *                          so only they take it: outsiders get no address rather than a wrong one.
 *   weave.safe.retired     {safe, successor, kind, space, owners, threshold}
 *                          public, by an owner: an address that isn't used any more (a treasury
 *                          whose owners changed wallets, or someone's old wallet), and the one that
 *                          replaced it. Money sent there is moved on by its owners; for a treasury,
 *                          owners and threshold say who still signs for the old Safe. Counts only
 *                          from the wallet's owner, or from someone who manages the treasury's space.
 *   weave.label            {target, label, reason}
 *                          public, by anyone: what they think of an address or contract
 *                          (target 'eip155:<chain>:<address>'): endorse or block, and why.
 *                          Nobody decides for everyone: people choose whose labels they follow.
 *
 * The treasury's address is the Safe (v1.4.1) its maintainers' linked wallets
 * would own, majority to sign, salted with the project's id: computed the way
 * the Safe proxy factory deploys it (CREATE2), so it exists before anything is
 * deployed and money can be sent to it already. Its address stays the same
 * only while the maintainers and their wallets do: a change gives a new one.
 */
export const KIND_WALLET = 'weave.wallet';
export const KIND_WALLET_CHECKED = 'weave.wallet.checked';
export const KIND_TREASURY_SPLIT = 'weave.treasury.split';
export const KIND_TREASURY = 'weave.treasury';
export const KIND_LABEL = 'weave.label';
export const KIND_SAFE_RETIRED = 'weave.safe.retired';

/**
 * The Weave Foundation's project, whose treasury gets the foundation part of
 * splits. Unset until the project exists: until then that part has no address
 * and stays with the makers when a split is put on chain.
 */
export const WEAVE_FOUNDATION_PROJECT: string | undefined = undefined;

export { TREASURY_CHAIN };

/** Safe v1.4.1, at the same addresses on every chain. */
export const SAFE = {
  factory: '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67',
  singleton: '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762', // SafeL2
  fallbackHandler: '0xfd0732Dc9E303f09fCEf3a7388Ad10A83459Ec99',
  /** keccak256 of SafeProxyFactory.proxyCreationCode(). */
  proxyCodeHash: '1856e0ee08399d74e0ea0b03adca210aeade6f748969ac023cdcb4dd62dcaf5f',
} as const;

/** How long a changed split waits before it counts. */
export const SPLIT_NOTICE_DAYS = 7;

export interface SplitShares {
  makers: number;
  treasury: number;
  community: number;
  /**
   * The Weave Foundation's part: suggested, never required. The foundation is a
   * project of its own, with its own treasury; its promise is to find
   * interesting projects and fund them.
   */
  foundation: number;
}

export const SPLIT_PRESETS: Record<string, SplitShares> = {
  standard: { makers: 8400, treasury: 1000, community: 500, foundation: 100 },
  community: { makers: 7000, treasury: 1500, community: 1400, foundation: 100 },
  solo: { makers: 9900, treasury: 0, community: 0, foundation: 100 },
  free: { makers: 10000, treasury: 0, community: 0, foundation: 0 },
};

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const strip0x = (hex: string) => (hex.startsWith('0x') ? hex.slice(2) : hex);

export const isAddress = (value: unknown): value is string => typeof value === 'string' && ADDRESS.test(value);

/** An address with its EIP-55 checksum (mixed case), as wallets show it. */
export function checksumAddress(address: string): string {
  if (!isAddress(address)) throw new Error(`not an address: ${address}`);
  const lower = address.slice(2).toLowerCase();
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = '0x';
  for (let i = 0; i < 40; i++) out += parseInt(hash[i], 16) >= 8 ? lower[i].toUpperCase() : lower[i];
  return out;
}

/** What a wallet signs to say it belongs to a Weave identity. */
export const walletMessage = (did: Did, address: string): string => `Weave: this wallet ${checksumAddress(address)} belongs to ${did}`;

/** The hash personal_sign (EIP-191) signs for a message. */
export function personalMessageHash(message: string): Uint8Array {
  const body = utf8ToBytes(message);
  return keccak_256(new Uint8Array([...utf8ToBytes(`\x19Ethereum Signed Message:\n${body.length}`), ...body]));
}

/** The address that signed `message` with personal_sign (EIP-191), or undefined if the signature doesn't parse. */
export function recoverSigner(message: string, signature: string): string | undefined {
  try {
    const sig = hexToBytes(strip0x(signature));
    if (sig.length !== 65) return undefined;
    const v = sig[64] >= 27 ? sig[64] - 27 : sig[64];
    if (v !== 0 && v !== 1) return undefined;
    const hash = personalMessageHash(message);
    const recovered = new Uint8Array([v, ...sig.subarray(0, 64)]);
    const point = secp256k1.Point.fromBytes(secp256k1.recoverPublicKey(recovered, hash, { prehash: false }));
    return checksumAddress('0x' + bytesToHex(keccak_256(point.toBytes(false).subarray(1)).subarray(12)));
  } catch {
    return undefined;
  }
}

/** Whether `proof` is the wallet's own signature saying it belongs to `did`. */
export const verifyWalletProof = (did: Did, address: string, proof: string): boolean =>
  isAddress(address) && recoverSigner(walletMessage(did, address), proof)?.toLowerCase() === address.toLowerCase();

/**
 * Smart wallets (a Safe, a Coinbase Smart Wallet) have no key of their own:
 * their contract says whether a signature is theirs (EIP-1271,
 * isValidSignature(hash, signature) answering this magic value). Only the chain
 * can tell, so whoever reads such a link asks the chain, and remembers.
 */
export const EIP1271_MAGIC = '0x1626ba7e';

/** The read-only call (eth_call to the wallet) asking whether `proof` is the wallet's signature over its link message. */
export function contractWalletCheck(did: Did, address: string, proof: string): { to: string; data: string } {
  const sig = strip0x(proof).toLowerCase();
  const data = selector('isValidSignature(bytes32,bytes)') + bytesToHex(personalMessageHash(walletMessage(did, address))) + uint(64) + uint(sig.length / 2) + sig.padEnd(Math.ceil(sig.length / 64) * 64, '0');
  return { to: checksumAddress(address), data: '0x' + data };
}

/** Whether a smart wallet's answer to contractWalletCheck says yes. */
export const contractWalletSaysYes = (answer: string): boolean => typeof answer === 'string' && answer.toLowerCase().startsWith(EIP1271_MAGIC + '0'.repeat(56));

export interface LinkedWallet {
  owner: Did;
  address: string;
  /** The wallet signed that it belongs to its owner. */
  verified: boolean;
  /** A smart wallet (a contract): its signature was checked on chain. */
  contract?: true;
  time: string;
}

/**
 * Everyone's linked wallet from their public wallet events, the latest per
 * person winning; unlinked ones are dropped. `contractChecked` answers for
 * smart wallets what the chain said (undefined: not asked yet, so not verified).
 */
export function walletsOf(events: EventView[], contractChecked?: (owner: Did, address: string, proof: string) => boolean | undefined): Map<Did, LinkedWallet> {
  const latest = new Map<Did, LinkedWallet | null>();
  for (const event of [...events].sort((a, b) => a.time.localeCompare(b.time))) {
    if (event.kind !== KIND_WALLET) continue;
    const body = (event.body ?? {}) as Record<string, unknown>;
    if (body.address === '') {
      latest.set(event.author, null);
      continue;
    }
    if (!isAddress(body.address)) continue;
    const address = checksumAddress(body.address);
    const proof = typeof body.proof === 'string' ? body.proof : '';
    if (body.contract === true) {
      const verified = !!proof && contractChecked?.(event.author, address, proof) === true;
      latest.set(event.author, { owner: event.author, address, verified, contract: true, time: event.time });
      continue;
    }
    const verified = !!proof && verifyWalletProof(event.author, address, proof);
    latest.set(event.author, { owner: event.author, address, verified, time: event.time });
  }
  return new Map([...latest].filter((pair): pair is [Did, LinkedWallet] => pair[1] !== null));
}

/** The smart wallet links among wallet events: what to ask the chain about. */
export function contractWalletLinks(events: EventView[]): Array<{ owner: Did; address: string; proof: string }> {
  return events.flatMap((event) => {
    const body = (event.body ?? {}) as Record<string, unknown>;
    return event.kind === KIND_WALLET && body.contract === true && isAddress(body.address) && typeof body.proof === 'string' ? [{ owner: event.author, address: checksumAddress(body.address), proof: body.proof }] : [];
  });
}

// ---------------------------------------------------------------- Safe address

const word = (hex: string) => strip0x(hex).toLowerCase().padStart(64, '0');
const uint = (n: number | bigint) => BigInt(n).toString(16).padStart(64, '0');
const selector = (signature: string) => bytesToHex(keccak_256(utf8ToBytes(signature))).slice(0, 8);

/** The call that sets a new Safe up: its owners (sorted, so the same people always give the same Safe) and how many must sign. */
export function safeSetupData(owners: string[], threshold: number): string {
  const sorted = [...owners].map((o) => o.toLowerCase()).sort();
  const args = [
    uint(8 * 32), // owners: dynamic, after the 8 head words
    uint(threshold),
    word('0x0'), // to: no setup call
    uint(8 * 32 + 32 + 32 * sorted.length), // data: dynamic, after the owners
    word(SAFE.fallbackHandler),
    word('0x0'), // paymentToken
    uint(0), // payment
    word('0x0'), // paymentReceiver
    uint(sorted.length),
    ...sorted.map(word),
    uint(0), // data: empty
  ];
  return '0x' + selector('setup(address[],uint256,address,bytes,address,address,uint256,address)') + args.join('');
}

/** The salt nonce that makes a project's treasury its own, even when the same people own several. */
export const treasurySaltNonce = (projectId: string): bigint => BigInt('0x' + bytesToHex(keccak_256(utf8ToBytes(`weave.treasury:${projectId}`))));

/** Where SafeProxyFactory.createProxyWithNonce(singleton, setup, saltNonce) puts the Safe. */
export function safeAddress(owners: string[], threshold: number, saltNonce: bigint): string {
  const setup = hexToBytes(strip0x(safeSetupData(owners, threshold)));
  const salt = keccak_256(hexToBytes(bytesToHex(keccak_256(setup)) + uint(saltNonce)));
  const digest = keccak_256(hexToBytes('ff' + strip0x(SAFE.factory).toLowerCase() + bytesToHex(salt) + proxyInitCodeHash()));
  return checksumAddress('0x' + bytesToHex(digest.subarray(12)));
}

/** keccak256(proxyCreationCode ++ singleton): the proxy's init code, constructor argument included. */
function proxyInitCodeHash(): string {
  return bytesToHex(keccak_256(hexToBytes(PROXY_CREATION_CODE + word(SAFE.singleton))));
}

/** SafeProxyFactory v1.4.1 proxyCreationCode(); its keccak256 is SAFE.proxyCodeHash. */
const PROXY_CREATION_CODE =
  '608060405234801561001057600080fd5b506040516101e63803806101e68339818101604052602081101561003357600080fd5b8101908080519060200190929190505050600073ffffffffffffffffffffffffffffffffffffffff168173ffffffffffffffffffffffffffffffffffffffff1614156100ca576040517f08c379a00000000000000000000000000000000000000000000000000000000081526004018080602001828103825260228152602001806101c46022913960400191505060405180910390fd5b806000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055505060ab806101196000396000f3fe608060405273ffffffffffffffffffffffffffffffffffffffff600054167fa619486e0000000000000000000000000000000000000000000000000000000060003514156050578060005260206000f35b3660008037600080366000845af43d6000803e60008114156070573d6000fd5b3d6000f3fea264697066735822122003d1488ee65e08fa41e58e888a9865554c535f2c77126a82cb4c0f917f31441364736f6c63430007060033496e76616c69642073696e676c65746f6e20616464726573732070726f7669646564';

/** How many of `owners` must sign: a majority. */
export const treasuryThreshold = (owners: number): number => Math.floor(owners / 2) + 1;

// ---------------------------------------------------------------- splits

export interface Split {
  preset: string;
  shares: SplitShares;
  /** How the makers' part is divided, in basis points of it; empty: equally among the maintainers. */
  makers: Array<{ did: Did; share: number }>;
  /** The community that gets the community part; until one is named, that part goes to the treasury. */
  community?: string;
  by: Did;
  time: string;
  /** When it counts. */
  from: string;
}

/** Shares from untrusted input: whole basis points that add up to 100%, or undefined. */
export function parseShares(value: unknown): SplitShares | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const shares = { makers: Number(v.makers), treasury: Number(v.treasury ?? 0), community: Number(v.community ?? 0), foundation: Number(v.foundation ?? 0) };
  const parts = Object.values(shares);
  if (!parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 10000)) return undefined;
  return parts.reduce((a, b) => a + b, 0) === 10000 ? shares : undefined;
}

/** A project's split today, and a changed one still waiting for its notice to pass. Only maintainers' splits count. */
export function splitOf(entries: Entry[], maintainers: Set<Did>, now = new Date(), seenAt: (entry: Entry) => string = (e) => e.event.time): { current?: Split; pending?: Split } {
  const splits: Split[] = [];
  for (const e of entries) {
    if (e.kind !== KIND_TREASURY_SPLIT || !maintainers.has(e.event.author)) continue;
    const body = (e.body ?? {}) as Record<string, unknown>;
    const shares = parseShares(body.shares);
    if (!shares) continue;
    const makers = Array.isArray(body.makers)
      ? body.makers.flatMap((m) => {
          const { did, share } = (m ?? {}) as { did?: unknown; share?: unknown };
          return isDid(did) && Number.isInteger(share) && (share as number) > 0 ? [{ did, share: share as number }] : [];
        })
      : [];
    // The notice counts from when it was made, as claimed, but never before this node first saw it: a change dated back can't skip it.
    const seen = seenAt(e) > e.event.time ? seenAt(e) : e.event.time;
    const from = splits.length ? new Date(Date.parse(seen) + SPLIT_NOTICE_DAYS * 86_400_000).toISOString() : e.event.time;
    splits.push({
      preset: typeof body.preset === 'string' ? body.preset.slice(0, 20) : 'custom',
      shares,
      makers: makers.reduce((sum, m) => sum + m.share, 0) === 10000 ? makers : [],
      ...(typeof body.community === 'string' && body.community ? { community: body.community.slice(0, 100) } : {}),
      by: e.event.author,
      time: e.event.time,
      from,
    });
  }
  const at = now.toISOString();
  const current = splits.filter((s) => s.from <= at).at(-1);
  const pending = splits.filter((s) => s.from > at).at(-1);
  return { ...(current ? { current } : {}), ...(pending ? { pending } : {}) };
}

// ---------------------------------------------------------------- treasuries others can see

export interface AnnouncedTreasury {
  space: string;
  kind: 'project' | 'community';
  address: string;
  owners: string[];
  threshold: number;
  by: Did;
  time: string;
  /** The address is the Safe these owners would own, salted with the space's id. Says nothing about whether they maintain it. */
  consistent: boolean;
}

/** The latest treasury each space's maintainers announced, checked against its owners and threshold. */
export function treasuriesOf(events: EventView[], manages: (space: string, author: Did) => boolean): Map<string, AnnouncedTreasury> {
  const latest = new Map<string, AnnouncedTreasury>();
  for (const event of [...events].sort((a, b) => a.time.localeCompare(b.time))) {
    if (event.kind !== KIND_TREASURY) continue;
    const body = (event.body ?? {}) as Record<string, unknown>;
    const space = typeof body.space === 'string' ? body.space.slice(0, 100) : '';
    // Anyone can announce owners whose Safe matches its address: only someone who manages the space says whose it is.
    if (!space || !manages(space, event.author)) continue;
    const owners = Array.isArray(body.owners) ? body.owners.filter(isAddress).slice(0, 50) : [];
    const threshold = Number(body.threshold);
    if (!space || !isAddress(body.address) || !owners.length || !Number.isInteger(threshold) || threshold < 1 || threshold > owners.length) continue;
    const address = checksumAddress(body.address);
    latest.set(space, {
      space,
      kind: body.kind === 'community' ? 'community' : 'project',
      address,
      owners: owners.map(checksumAddress),
      threshold,
      by: event.author,
      time: event.time,
      consistent: safeAddress(owners, threshold, treasurySaltNonce(space)) === address,
    });
  }
  return latest;
}

/** The transaction that puts a treasury on chain: any wallet can send it, the Safe then belongs to its owners alone. */
export function safeDeployment(owners: string[], threshold: number, saltNonce: bigint): { to: string; data: string } {
  const setup = strip0x(safeSetupData(owners, threshold));
  const padded = setup.padEnd(Math.ceil(setup.length / 64) * 64, '0');
  const data = selector('createProxyWithNonce(address,bytes,uint256)') + word(SAFE.singleton) + uint(3 * 32) + uint(saltNonce) + uint(setup.length / 2) + padded;
  return { to: SAFE.factory, data: '0x' + data };
}

// ---------------------------------------------------------------- who a split pays

/** Split contracts count in millionths (0xSplits: 1e6 = 100%). */
export const SPLIT_SCALE = 1_000_000;

export interface SplitRecipient {
  /** Who it is in Weave: a person, or the treasury of a project, community or the foundation. */
  kind: 'person' | 'project' | 'community' | 'foundation';
  /** Their did, or the space's id ('' for a foundation not set up yet). */
  id: string;
  /** Where the money goes; missing while they have no (verified) wallet or treasury yet. */
  address?: string;
  /** In millionths of the income. */
  share: number;
  /** What part of the split it comes from. */
  part: keyof SplitShares;
}

/**
 * Everyone a split pays and how much, with addresses where they're known: what
 * a split contract is made from, and what flows between people and projects
 * can be read from. Parts that go nowhere yet are kept, without an address.
 */
export function splitRecipients(
  split: Pick<Split, 'shares' | 'makers' | 'community'>,
  context: {
    project: string;
    /** Its maintainers: the makers when the split names none. */
    maintainers: Did[];
    wallets: Map<Did, LinkedWallet>;
    /** The project's own treasury. */
    treasury?: string;
    /** Treasuries of other spaces (the community, the foundation), by space id. */
    treasuries: Map<string, AnnouncedTreasury>;
    foundation?: string;
  },
): SplitRecipient[] {
  const out: SplitRecipient[] = [];
  const wallet = (did: Did) => {
    const w = context.wallets.get(did);
    return w?.verified ? w.address : undefined;
  };
  const equal = [...context.maintainers].sort().map((did, i, all) => ({ did, share: Math.floor(10000 / all.length) + (i === 0 ? 10000 % all.length : 0) }));
  const makers = split.makers.length ? split.makers : equal;
  // The makers' part divided again by their shares, rounded down; the last maker gets what's left.
  const makersTotal = split.shares.makers * 100;
  let given = 0;
  makers.forEach((m, i) => {
    const share = i === makers.length - 1 ? makersTotal - given : Math.floor((makersTotal * m.share) / 10000);
    given += share;
    const address = wallet(m.did);
    if (share) out.push({ kind: 'person', id: m.did, ...(address ? { address } : {}), share, part: 'makers' });
  });
  const space = (kind: SplitRecipient['kind'], id: string | undefined, part: keyof SplitShares) => {
    const share = split.shares[part] * 100;
    if (!share) return;
    const announced = id ? context.treasuries.get(id) : undefined;
    const address = id === context.project ? context.treasury : announced?.consistent ? announced.address : undefined;
    out.push({ kind, id: id ?? '', ...(address ? { address } : {}), share, part });
  };
  space('project', context.project, 'treasury');
  // No community named: its part goes to the project's treasury.
  if (split.community) space('community', split.community, 'community');
  else space('project', context.project, 'community');
  space('foundation', context.foundation, 'foundation');
  return out;
}

/**
 * What a split contract is made of: addresses (sorted, each once) and their
 * millionths. Parts without an address go to the first maker with a wallet
 * (else the first address at all); undefined when nobody has an address.
 */
export function splitAllocations(recipients: SplitRecipient[]): Array<{ address: string; share: number }> | undefined {
  const fallback = recipients.find((r) => r.part === 'makers' && r.address)?.address ?? recipients.find((r) => r.address)?.address;
  if (!fallback) return undefined;
  const sums = new Map<string, number>();
  for (const r of recipients) {
    const address = (r.address ?? fallback).toLowerCase();
    sums.set(address, (sums.get(address) ?? 0) + r.share);
  }
  return [...sums].sort(([a], [b]) => a.localeCompare(b)).map(([address, share]) => ({ address: checksumAddress(address), share }));
}

// ---------------------------------------------------------------- labels

export type LabelValue = 'endorse' | 'block';

export interface Label {
  /** 'eip155:<chain id>:<address>' */
  target: string;
  label: LabelValue;
  reason: string;
  by: Did;
  time: string;
}

const TARGET = /^eip155:(\d{1,12}):(0x[0-9a-fA-F]{40})$/;

/** The label target for an address on a chain. */
export const labelTarget = (address: string, chain: number = TREASURY_CHAIN.id): string => `eip155:${chain}:${checksumAddress(address)}`;

/** A target from untrusted input, normalized, or undefined. */
export function parseLabelTarget(value: unknown): string | undefined {
  const match = typeof value === 'string' ? TARGET.exec(value) : null;
  return match ? labelTarget(match[2], Number(match[1])) : undefined;
}

/** Everyone's current labels: the latest per author and target; any other label value withdraws theirs. */
export function labelsOf(events: EventView[]): Label[] {
  const latest = new Map<string, Label | null>();
  for (const event of [...events].sort((a, b) => a.time.localeCompare(b.time))) {
    if (event.kind !== KIND_LABEL) continue;
    const body = (event.body ?? {}) as Record<string, unknown>;
    const target = parseLabelTarget(body.target);
    if (!target) continue;
    const key = `${event.author} ${target}`;
    if (body.label !== 'endorse' && body.label !== 'block') {
      latest.set(key, null);
      continue;
    }
    latest.set(key, { target, label: body.label, reason: typeof body.reason === 'string' ? body.reason.slice(0, 500) : '', by: event.author, time: event.time });
  }
  return [...latest.values()].filter((l): l is Label => l !== null);
}

// ---------------------------------------------------------------- the split contract

/**
 * 0xSplits v2.2 (from their SDK; the same addresses on every chain they
 * support, Base and Base Sepolia among them). A push split pays its recipients
 * directly when its balance is distributed; anyone may trigger that.
 */
export const SPLITS = {
  pushFactory: '0x8E8eB0cC6AE34A38B67D5Cf91ACa38f60bc3Ecf4',
  warehouse: '0x8fb66F38cF86A3d5e8768f8F1754A24A6c661Fb8',
} as const;

/** The salt that makes a project's split contract its own. */
export const splitSalt = (projectId: string): string => '0x' + bytesToHex(keccak_256(utf8ToBytes(`weave.split:${projectId}`)));

/** The split's parameters as the factory takes them: (address[] recipients, uint256[] allocations, uint256 totalAllocation, uint16 distributionIncentive). */
export function splitParamsData(allocations: Array<{ address: string; share: number }>): string {
  const n = allocations.length;
  const total = allocations.reduce((sum, a) => sum + a.share, 0);
  return [
    uint(4 * 32), // recipients: after the 4 head words
    uint(4 * 32 + 32 + 32 * n), // allocations: after the recipients
    uint(total),
    uint(0), // no incentive for whoever distributes
    uint(n),
    ...allocations.map((a) => word(a.address)),
    uint(n),
    ...allocations.map((a) => uint(a.share)),
  ].join('');
}

/**
 * The transaction that puts a project's split contract on chain, owned by its
 * treasury (so only the maintainers, together, can change it later). Any wallet
 * can send it; payments to the split are then divided by its allocations.
 */
export function splitDeployment(allocations: Array<{ address: string; share: number }>, owner: string, salt: string): { to: string; data: string } {
  const data = selector('createSplitDeterministic((address[],uint256[],uint256,uint16),address,address,bytes32)') + uint(4 * 32) + word(owner) + word(owner) + word(salt) + splitParamsData(allocations);
  return { to: SPLITS.pushFactory, data: '0x' + data };
}

/** The call (eth_call, read only) that asks the factory where that split contract is, or will be. */
export function splitAddressCall(allocations: Array<{ address: string; share: number }>, owner: string, salt: string): { to: string; data: string } {
  const data = selector('predictDeterministicAddress((address[],uint256[],uint256,uint16),address,bytes32)') + uint(3 * 32) + word(owner) + word(salt) + splitParamsData(allocations);
  return { to: SPLITS.pushFactory, data: '0x' + data };
}

/** The call (eth_call, read only) that asks whether that split contract exists yet. */
export function splitDeployedCall(allocations: Array<{ address: string; share: number }>, owner: string, salt: string): { to: string; data: string } {
  const data = selector('isDeployed((address[],uint256[],uint256,uint16),address,bytes32)') + uint(3 * 32) + word(owner) + word(salt) + splitParamsData(allocations);
  return { to: SPLITS.pushFactory, data: '0x' + data };
}

// ---------------------------------------------------------------- retired addresses

export interface RetiredAddress {
  address: string;
  /** The address that replaced it ('' when nothing did). */
  successor: string;
  kind: 'treasury' | 'wallet';
  /** For a treasury: its space, and the wallets that still sign for the old Safe. */
  space?: string;
  owners: string[];
  threshold: number;
  by: Did;
  time: string;
}

/**
 * Retired addresses by address (lowercase), the latest retirement of each
 * counting; only those `trusted` says may retire it (a wallet's owner, a
 * treasury's managers), or a stranger could send its payers elsewhere.
 */
export function retiredOf(events: EventView[], trusted: (retired: RetiredAddress) => boolean): Map<string, RetiredAddress> {
  const out = new Map<string, RetiredAddress>();
  for (const event of [...events].sort((a, b) => a.time.localeCompare(b.time))) {
    if (event.kind !== KIND_SAFE_RETIRED) continue;
    const body = (event.body ?? {}) as Record<string, unknown>;
    if (!isAddress(body.safe)) continue;
    const owners = Array.isArray(body.owners) ? body.owners.filter(isAddress).slice(0, 50).map(checksumAddress) : [];
    const threshold = Number(body.threshold);
    const retired: RetiredAddress = {
      address: checksumAddress(body.safe),
      successor: isAddress(body.successor) ? checksumAddress(body.successor) : '',
      kind: body.kind === 'wallet' ? 'wallet' : 'treasury',
      ...(typeof body.space === 'string' && body.space ? { space: body.space.slice(0, 100) } : {}),
      owners,
      threshold: Number.isInteger(threshold) && threshold >= 1 && threshold <= Math.max(owners.length, 1) ? threshold : 1,
      by: event.author,
      time: event.time,
    };
    if (trusted(retired)) out.set(body.safe.toLowerCase(), retired);
  }
  return out;
}

/** Every wallet anyone ever linked with a valid signature, by address (lowercase): who it belongs to, even after they moved on. */
export function walletHistoryOf(events: EventView[], contractChecked?: (owner: Did, address: string, proof: string) => boolean | undefined): Map<string, Did> {
  const out = new Map<string, Did>();
  for (const event of [...events].sort((a, b) => a.time.localeCompare(b.time))) {
    if (event.kind !== KIND_WALLET) continue;
    const body = (event.body ?? {}) as Record<string, unknown>;
    if (!isAddress(body.address) || typeof body.proof !== 'string' || out.has(body.address.toLowerCase())) continue;
    const ok = body.contract === true ? contractChecked?.(event.author, checksumAddress(body.address), body.proof) === true : verifyWalletProof(event.author, body.address, body.proof);
    if (ok) out.set(body.address.toLowerCase(), event.author);
  }
  return out;
}
