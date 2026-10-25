import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import type { OnchainPrice } from './memberships.ts';
import { checksumAddress, TREASURY_CHAIN } from './treasury.ts';

/*
 * Payments on chain, for tiers (group access) paid with a token: the supporter
 * sends the token to the tier's address from their linked wallet, then asks to
 * join with the transaction's hash. The creator's node reads the transaction's
 * receipt from the chain and lets them in for as many months as they paid.
 * Weave never touches the money; it only reads what the chain says.
 */

/** Circle's test USDC on Base Sepolia: no real money. */
export const TEST_USDC = { chain: TREASURY_CHAIN.id, token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', symbol: 'USDC', decimals: 6 } as const;

/** keccak256("Transfer(address,address,uint256)"): the ERC-20 transfer event's first topic. */
export const TRANSFER_TOPIC = '0x' + bytesToHex(keccak_256(utf8ToBytes('Transfer(address,address,uint256)')));

export const isTxHash = (value: unknown): value is string => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);

/** The parts of a transaction receipt (eth_getTransactionReceipt) a payment is read from. */
export interface Receipt {
  status?: string;
  logs?: Array<{ address?: string; topics?: string[]; data?: string }>;
}

export interface PaymentCheck {
  ok: boolean;
  /** Who paid: the wallet the token came from. */
  from?: string;
  /** How much reached the tier's address, in the token's smallest unit. */
  value?: string;
  /** Whole months it pays for (at most 36). */
  months?: number;
  reason?: string;
}

const topicAddress = (topic: string | undefined) => (topic && topic.length === 66 ? checksumAddress('0x' + topic.slice(26)) : undefined);

/** What a receipt says about paying `price`: the token transfers to its address, added up per sender. */
export function readPayment(receipt: Receipt | null | undefined, price: OnchainPrice): PaymentCheck {
  if (!receipt) return { ok: false, reason: 'no such transaction on the chain (yet): it may still be pending' };
  if (receipt.status !== '0x1') return { ok: false, reason: 'the transaction failed on the chain' };
  const to = price.to.toLowerCase();
  const sums = new Map<string, bigint>();
  for (const log of receipt.logs ?? []) {
    if (log.address?.toLowerCase() !== price.token.toLowerCase() || log.topics?.[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    if (topicAddress(log.topics?.[2])?.toLowerCase() !== to) continue;
    const from = topicAddress(log.topics?.[1]);
    if (!from) continue;
    sums.set(from, (sums.get(from) ?? 0n) + BigInt(log.data && log.data !== '0x' ? log.data : '0x0'));
  }
  if (!sums.size) return { ok: false, reason: `the transaction sends no ${price.symbol} to ${checksumAddress(price.to)}` };
  if (sums.size > 1) return { ok: false, reason: 'the transaction pays from several wallets: pay from one' };
  const [[from, value]] = [...sums];
  const months = value / BigInt(price.amount);
  if (months < 1n) return { ok: false, from, value: value.toString(), reason: `that pays ${formatUnits(value, price.decimals)} ${price.symbol}, a month is ${formatUnits(BigInt(price.amount), price.decimals)}` };
  return { ok: true, from, value: value.toString(), months: Number(months > 36n ? 36n : months) };
}

/** An amount in the token's smallest unit, shown with its decimals: 2500000 with 6 → "2.5". */
export function formatUnits(value: bigint | number, decimals: number): string {
  const v = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const fraction = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${v / base}${fraction ? `.${fraction}` : ''}`;
}

/** A decimal amount ("2.5") in the token's smallest unit, or undefined. */
export function parseUnits(text: string, decimals: number): number | undefined {
  const match = /^(\d{1,12})(?:\.(\d+))?$/.exec(text.trim());
  if (!match || (match[2]?.length ?? 0) > decimals) return undefined;
  const value = Number(match[1]) * 10 ** decimals + Number((match[2] ?? '').padEnd(decimals, '0') || 0);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}
