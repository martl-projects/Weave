import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { Json } from './bytes.ts';
import { boxTo, openBox, type Box } from './crypto.ts';
import type { EventFields } from './events.ts';
import { isDid, type Did, type KeyPair } from './keys.ts';
import { parseOnchainPrice, type OnchainPrice } from './memberships.ts';
import type { EventView } from './records.ts';
import { checksumAddress, isAddress } from './treasury.ts';

/*
 * Ticketed events: one-off things with an entry price, like a live stream.
 * Tickets are paid into the event's own Safe (its hosts' wallets own it), which
 * holds the money until the event: then the hosts pay it out by the event's
 * split, or, if it's called off, back to everyone who paid. Weave reads the
 * payments from the chain and prepares those transactions; the hosts sign them
 * in their own wallets.
 *
 *   weave.show            {show, name, project, room, starts, ends, price, capacity, hosts, owners, threshold, split, cancelled}
 *                         owners/threshold: the wallets its Safe was made for, kept when hosts change wallets
 *                         public, by its host: the event. price is an onchain price per ticket,
 *                         paid to the event's Safe; split: [{to: did | address, share}] in basis
 *                         points, how the money is paid out after it. The latest one counts.
 *   weave.ticket.request  {box}   public, boxed to the host: {show, payment, entry}
 *   weave.ticket          {box}   public, boxed to the holder: {show, tx}, their ticket
 *   weave.ticket.record   {show, holder, tx, from, value}   sealed to the host: who paid, kept
 *                         for letting them in and for paying back
 */
export const KIND_SHOW = 'weave.show';
export const KIND_TICKET_REQUEST = 'weave.ticket.request';
export const KIND_TICKET = 'weave.ticket';
export const KIND_TICKET_RECORD = 'weave.ticket.record';

/** Where a split part of a show goes: a person (did, paid to their linked wallet), a project's treasury ('project:<id>'), or an address. */
export interface ShowShare {
  to: string;
  /** Basis points: 10000 = 100%. */
  share: number;
}

export interface Show {
  id: string;
  host: Did;
  name: string;
  /** The project it belongs to, and the room it happens in, if any. */
  project?: string;
  room?: string;
  starts: string;
  ends: string;
  /** Per ticket, paid to the show's Safe. */
  price: OnchainPrice;
  capacity?: number;
  /** Who owns the Safe with the host: their wallets sign together. */
  hosts: Did[];
  /** The wallets its Safe was made for, and how many of them sign: the Safe's owners, whatever wallets the hosts link later. */
  owners?: string[];
  threshold?: number;
  split: ShowShare[];
  cancelled: boolean;
  time: string;
}

const str = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');
const isTime = (value: unknown): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value));

/** A show's split from untrusted input: people or addresses, whole basis points adding up to 10000; or undefined. */
export function parseShowSplit(value: unknown): ShowShare[] | undefined {
  if (!Array.isArray(value) || !value.length || value.length > 50) return undefined;
  const split: ShowShare[] = [];
  for (const part of value) {
    const { to, share } = (part ?? {}) as { to?: unknown; share?: unknown };
    const project = typeof to === 'string' && /^project:[A-Za-z0-9_-]{1,100}$/.test(to);
    if (!(isDid(to) || isAddress(to) || project) || !Number.isInteger(share) || (share as number) <= 0) return undefined;
    split.push({ to: isAddress(to) ? checksumAddress(to) : (to as string), share: share as number });
  }
  return split.reduce((sum, p) => sum + p.share, 0) === 10000 ? split : undefined;
}

/** Every show from their hosts' public events, the latest per show and host winning. */
export function showsOf(events: EventView[]): Show[] {
  const latest = new Map<string, Show>();
  for (const event of [...events].sort((a, b) => a.time.localeCompare(b.time))) {
    if (event.kind !== KIND_SHOW) continue;
    const body = (event.body ?? {}) as Record<string, unknown>;
    const id = str(body.show, 100);
    const name = str(body.name, 80).trim();
    const price = parseOnchainPrice(body.price);
    const split = parseShowSplit(body.split);
    if (!id || !name || !price || !split || !isTime(body.starts) || !isTime(body.ends)) continue;
    const key = `${event.author} ${id}`;
    // Only its host changes a show; someone else's event with the same id is another show.
    const before = [...latest.values()].find((s) => s.id === id);
    if (before && before.host !== event.author) continue;
    const capacity = Number(body.capacity);
    const hosts = Array.isArray(body.hosts) ? body.hosts.filter(isDid).slice(0, 10) : [];
    const owners = Array.isArray(body.owners) ? body.owners.filter(isAddress).slice(0, 10).map(checksumAddress) : [];
    const threshold = Number(body.threshold);
    latest.set(key, {
      id,
      host: event.author,
      name,
      ...(str(body.project, 100) ? { project: str(body.project, 100) } : {}),
      ...(str(body.room, 100) ? { room: str(body.room, 100) } : {}),
      starts: new Date(body.starts).toISOString(),
      ends: new Date(body.ends).toISOString(),
      price,
      ...(Number.isInteger(capacity) && capacity > 0 ? { capacity } : {}),
      hosts: hosts.includes(event.author) ? hosts : [event.author, ...hosts],
      ...(owners.length && Number.isInteger(threshold) && threshold >= 1 && threshold <= owners.length ? { owners, threshold } : {}),
      split,
      cancelled: body.cancelled === true,
      time: event.time,
    });
  }
  return [...latest.values()].sort((a, b) => a.starts.localeCompare(b.starts));
}

/** The salt nonce that makes a show's Safe its own. */
export const showSaltNonce = (showId: string): bigint => BigInt('0x' + bytesToHex(keccak_256(utf8ToBytes(`weave.show:${showId}`))));

/** Whether a ticket lets its holder in at `now`: from an hour before the start to the end, unless the show is called off. */
export const showOpen = (show: Show, now = new Date()): boolean =>
  !show.cancelled && now.getTime() >= Date.parse(show.starts) - 3600_000 && now.getTime() <= Date.parse(show.ends);

export interface TicketRequest {
  show: string;
  /** The transaction that paid for it. */
  payment: string;
  entry: { topics: string[]; bootstrap: Array<{ host: string; port: number }> };
}

export function ticketRequest(hostEncryptionKey: Did, request: TicketRequest): EventFields {
  return { kind: KIND_TICKET_REQUEST, body: { box: boxTo(hostEncryptionKey, request as unknown as Json) } };
}

export function openTicketRequest(event: EventView, me: { keys: KeyPair }): TicketRequest | undefined {
  const box = (event.body as { box?: Box } | null)?.box;
  if (event.kind !== KIND_TICKET_REQUEST || !box) return undefined;
  try {
    const opened = openBox(me.keys.secretKey, me.keys.publicKey, box) as unknown as TicketRequest;
    if (typeof opened?.show !== 'string' || typeof opened.payment !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(opened.payment)) return undefined;
    return { show: opened.show.slice(0, 100), payment: opened.payment.toLowerCase(), entry: opened.entry ?? { topics: [], bootstrap: [] } };
  } catch {
    return undefined;
  }
}

/** A ticket for its holder: only they can read it. */
export const ticketFor = (holderEncryptionKey: Did, ticket: { show: string; tx: string }): EventFields => ({ kind: KIND_TICKET, body: { box: boxTo(holderEncryptionKey, ticket as unknown as Json) } });

export function openTicket(event: EventView, me: { keys: KeyPair }): { show: string; tx: string } | undefined {
  const box = (event.body as { box?: Box } | null)?.box;
  if (event.kind !== KIND_TICKET || !box) return undefined;
  try {
    const opened = openBox(me.keys.secretKey, me.keys.publicKey, box) as unknown as { show: string; tx: string };
    return typeof opened?.show === 'string' && typeof opened.tx === 'string' ? { show: opened.show, tx: opened.tx } : undefined;
  } catch {
    return undefined;
  }
}

// ---------------------------------------------------------------- paying out, or back

/** Safe v1.4.1 MultiSendCallOnly: several calls in one Safe transaction, none of them a delegatecall. */
export const MULTI_SEND_CALL_ONLY = '0x9641d764fc13c8B624c04430C7356C1C7C8102e2';

const word = (hex: string) => (hex.startsWith('0x') ? hex.slice(2) : hex).toLowerCase().padStart(64, '0');
const uint = (n: number | bigint) => BigInt(n).toString(16).padStart(64, '0');
const selector = (signature: string) => bytesToHex(keccak_256(utf8ToBytes(signature))).slice(0, 8);

/** The call that sends `amount` (smallest unit) of an ERC-20 token. */
export const erc20Transfer = (to: string, amount: bigint): string => '0x' + selector('transfer(address,uint256)') + word(to) + uint(amount);

/** The call that asks for an address's balance of an ERC-20 token (eth_call). */
export const erc20BalanceOf = (owner: string): string => '0x' + selector('balanceOf(address)') + word(owner);

/** Several calls as one: MultiSendCallOnly.multiSend(bytes) with each call packed (operation 0, to, value, data). */
export function multiSendData(calls: Array<{ to: string; data: string }>): string {
  const packed = calls
    .map((c) => {
      const data = c.data.startsWith('0x') ? c.data.slice(2) : c.data;
      return '00' + word(c.to).slice(24) + uint(0) + uint(data.length / 2) + data;
    })
    .join('');
  return '0x' + selector('multiSend(bytes)') + uint(32) + uint(packed.length / 2) + packed.padEnd(Math.ceil(packed.length / 64) * 64, '0');
}

/** How a balance is paid out by shares (basis points): rounded down, what's left to the first. */
export function payouts(balance: bigint, shares: Array<{ address: string; share: number }>): Array<{ address: string; amount: bigint }> {
  const out = shares.map((s) => ({ address: s.address, amount: (balance * BigInt(s.share)) / 10000n }));
  const rest = balance - out.reduce((sum, p) => sum + p.amount, 0n);
  if (out.length) out[0].amount += rest;
  return out.filter((p) => p.amount > 0n);
}

/**
 * A batch for the Safe app's Transaction Builder (app.safe.global): the hosts
 * open their show's Safe there, load it, check it, and sign it in their
 * wallets; once enough have signed, any of them sends it.
 */
export function safeBatch(input: { chain: number; safe: string; name: string; description: string; calls: Array<{ to: string; data: string }> }) {
  return {
    version: '1.0',
    chainId: String(input.chain),
    createdAt: Date.now(),
    meta: { name: input.name, description: input.description, createdFromSafeAddress: checksumAddress(input.safe) },
    transactions: input.calls.map((c) => ({ to: checksumAddress(c.to), value: '0', data: c.data, contractMethod: null, contractInputsValues: null })),
  };
}
