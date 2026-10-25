import { secp256k1 } from '@noble/curves/secp256k1.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { checksumAddress, isAddress } from './treasury.ts';
import type { EventView } from './records.ts';
import type { Did } from './keys.ts';

/*
 * Signing a Safe's transactions together, in Weave: one owner proposes a
 * transaction (a payout, a refund), every owner signs its hash in their own
 * wallet, and the signatures are passed around as Weave events. Once enough
 * owners signed, anyone can send it to the Safe (execTransaction). The Safe
 * itself checks every signature again; Weave checks them first so nobody waits
 * on a bad one.
 *
 *   weave.safe.proposal   {proposal, chain, safe, to, value, data, operation, nonce, title}
 *                         public, by an owner's person: a transaction for the Safe to sign
 *   weave.safe.signature  {proposal, hash, signature}
 *                         public, by anyone: an owner's signature over the transaction's hash
 *                         (EIP-712 signTypedData, or eth_sign/personal_sign over the hash)
 */
export const KIND_SAFE_PROPOSAL = 'weave.safe.proposal';
export const KIND_SAFE_SIGNATURE = 'weave.safe.signature';

export interface SafeTx {
  to: string;
  /** Wei sent along, as a decimal string. */
  value: string;
  data: string;
  /** 0: a call, 1: a delegatecall (MultiSend). */
  operation: 0 | 1;
  nonce: number;
}

const strip0x = (hex: string) => (hex.startsWith('0x') ? hex.slice(2) : hex);
const word = (hex: string) => strip0x(hex).toLowerCase().padStart(64, '0');
const uint = (n: number | bigint | string) => BigInt(n).toString(16).padStart(64, '0');
const keccakHex = (hex: string) => bytesToHex(keccak_256(hexToBytes(strip0x(hex))));
const typeHash = (type: string) => bytesToHex(keccak_256(utf8ToBytes(type)));
const selector = (signature: string) => typeHash(signature).slice(0, 8);

const DOMAIN_TYPEHASH = typeHash('EIP712Domain(uint256 chainId,address verifyingContract)');
const SAFE_TX_TYPEHASH = typeHash('SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)');

/** The hash a Safe's owners sign for a transaction (Safe v1.3+: EIP-712 with the chain id and the Safe's address). */
export function safeTxHash(chain: number, safe: string, tx: SafeTx): string {
  const domain = keccakHex(DOMAIN_TYPEHASH + uint(chain) + word(safe));
  const zero = uint(0);
  const struct = keccakHex(SAFE_TX_TYPEHASH + word(tx.to) + uint(tx.value) + keccakHex(tx.data) + uint(tx.operation) + zero + zero + zero + word('0x0') + word('0x0') + uint(tx.nonce));
  return '0x' + keccakHex('1901' + domain + struct);
}

/** The typed data a wallet signs for it (eth_signTypedData_v4): the same hash, shown readably. */
export function safeTxTypedData(chain: number, safe: string, tx: SafeTx) {
  return {
    types: {
      EIP712Domain: [
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      SafeTx: [
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'data', type: 'bytes' },
        { name: 'operation', type: 'uint8' },
        { name: 'safeTxGas', type: 'uint256' },
        { name: 'baseGas', type: 'uint256' },
        { name: 'gasPrice', type: 'uint256' },
        { name: 'gasToken', type: 'address' },
        { name: 'refundReceiver', type: 'address' },
        { name: 'nonce', type: 'uint256' },
      ],
    },
    primaryType: 'SafeTx',
    domain: { chainId: chain, verifyingContract: checksumAddress(safe) },
    message: { to: checksumAddress(tx.to), value: tx.value, data: tx.data, operation: tx.operation, safeTxGas: '0', baseGas: '0', gasPrice: '0', gasToken: '0x0000000000000000000000000000000000000000', refundReceiver: '0x0000000000000000000000000000000000000000', nonce: tx.nonce },
  };
}

/**
 * Who signed a transaction's hash, and the signature as the Safe takes it.
 * Wallets sign either the typed data (v 27/28, taken as it is) or the hash as a
 * message (eth_sign/personal_sign: the Safe wants v + 4, so 31/32).
 */
export function safeSigner(hash: string, signature: string): { owner: string; signature: string } | undefined {
  try {
    const sig = hexToBytes(strip0x(signature));
    if (sig.length !== 65) return undefined;
    let v = sig[64];
    let digest = hexToBytes(strip0x(hash));
    let safeV = v;
    if (v === 31 || v === 32) {
      v -= 4;
      safeV = v + 4;
      digest = keccak_256(new Uint8Array([...utf8ToBytes('\x19Ethereum Signed Message:\n32'), ...digest]));
    } else if (v === 0 || v === 1 || v === 27 || v === 28) {
      v = v < 27 ? v + 27 : v;
      safeV = v;
    } else return undefined;
    const point = secp256k1.Point.fromBytes(secp256k1.recoverPublicKey(new Uint8Array([v - 27, ...sig.subarray(0, 64)]), digest, { prehash: false }));
    const owner = checksumAddress('0x' + bytesToHex(keccak_256(point.toBytes(false).subarray(1)).subarray(12)));
    return { owner, signature: '0x' + bytesToHex(sig.subarray(0, 64)) + safeV.toString(16).padStart(2, '0') };
  } catch {
    return undefined;
  }
}

/** A signature over the hash as a message (personal_sign), as the Safe takes it: what a wallet's "sign message" gives, with v + 4. */
export const asEthSign = (signature: string): string => {
  const sig = strip0x(signature);
  const v = parseInt(sig.slice(128, 130), 16);
  return '0x' + sig.slice(0, 128) + (v < 27 ? v + 31 : v + 4).toString(16);
};

/** The call that runs a signed transaction on the Safe: execTransaction with the signatures sorted by owner. */
export function execTransactionData(tx: SafeTx, signatures: Array<{ owner: string; signature: string }>): string {
  const sorted = [...signatures].sort((a, b) => a.owner.toLowerCase().localeCompare(b.owner.toLowerCase()));
  const sigs = sorted.map((s) => strip0x(s.signature)).join('');
  const data = strip0x(tx.data);
  const dataOffset = 10 * 32;
  const sigsOffset = dataOffset + 32 + Math.ceil(data.length / 64) * 32;
  return (
    '0x' +
    selector('execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)') +
    word(tx.to) +
    uint(tx.value) +
    uint(dataOffset) +
    uint(tx.operation) +
    uint(0) +
    uint(0) +
    uint(0) +
    word('0x0') +
    word('0x0') +
    uint(sigsOffset) +
    uint(data.length / 2) +
    data.padEnd(Math.ceil(data.length / 64) * 64, '0') +
    uint(sigs.length / 2) +
    sigs.padEnd(Math.ceil(sigs.length / 64) * 64, '0')
  );
}

/** Read-only calls to a Safe (eth_call). */
export const SAFE_CALLS = {
  nonce: '0x' + selector('nonce()'),
  getOwners: '0x' + selector('getOwners()'),
  getThreshold: '0x' + selector('getThreshold()'),
  /** What the Safe itself says the hash is: for checking ours. */
  getTransactionHash: (tx: SafeTx) => {
    const data = strip0x(tx.data);
    return (
      '0x' +
      selector('getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256)') +
      word(tx.to) +
      uint(tx.value) +
      uint(10 * 32) +
      uint(tx.operation) +
      uint(0) +
      uint(0) +
      uint(0) +
      word('0x0') +
      word('0x0') +
      uint(tx.nonce) +
      uint(data.length / 2) +
      data.padEnd(Math.ceil(data.length / 64) * 64, '0')
    );
  },
};

export interface SafeProposal {
  id: string;
  chain: number;
  safe: string;
  tx: SafeTx;
  title: string;
  hash: string;
  by: Did;
  time: string;
}

/** A Safe transaction from untrusted input, or undefined. */
export function parseSafeTx(value: unknown): SafeTx | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const v = value as Record<string, unknown>;
  const nonce = Number(v.nonce);
  if (!isAddress(v.to) || typeof v.data !== 'string' || !/^0x([0-9a-fA-F]{2})*$/.test(v.data) || (v.operation !== 0 && v.operation !== 1) || !Number.isSafeInteger(nonce) || nonce < 0) return undefined;
  const value_ = typeof v.value === 'string' && /^\d{1,78}$/.test(v.value) ? v.value : '0';
  return { to: checksumAddress(v.to), value: value_, data: v.data.toLowerCase(), operation: v.operation, nonce };
}

/** Proposals and their valid signatures (each owner once), from public events. Which owners count is the caller's to say. */
export function safeProposalsOf(events: EventView[]): Array<SafeProposal & { signatures: Array<{ owner: string; signature: string; by: Did }> }> {
  const proposals = new Map<string, SafeProposal & { signatures: Array<{ owner: string; signature: string; by: Did }> }>();
  const sorted = [...events].sort((a, b) => a.time.localeCompare(b.time));
  for (const event of sorted) {
    if (event.kind !== KIND_SAFE_PROPOSAL) continue;
    const body = (event.body ?? {}) as Record<string, unknown>;
    const id = typeof body.proposal === 'string' ? body.proposal.slice(0, 100) : '';
    const chain = Number(body.chain);
    const tx = parseSafeTx(body);
    if (!id || proposals.has(id) || !tx || !isAddress(body.safe) || !Number.isSafeInteger(chain)) continue;
    const safe = checksumAddress(body.safe);
    proposals.set(id, { id, chain, safe, tx, title: typeof body.title === 'string' ? body.title.slice(0, 200) : '', hash: safeTxHash(chain, safe, tx), by: event.author, time: event.time, signatures: [] });
  }
  for (const event of sorted) {
    if (event.kind !== KIND_SAFE_SIGNATURE) continue;
    const body = (event.body ?? {}) as Record<string, unknown>;
    const proposal = typeof body.proposal === 'string' ? proposals.get(body.proposal) : undefined;
    const signed = proposal && typeof body.signature === 'string' ? safeSigner(proposal.hash, body.signature) : undefined;
    if (!proposal || !signed || proposal.signatures.some((s) => s.owner === signed.owner)) continue;
    proposal.signatures.push({ ...signed, by: event.author });
  }
  return [...proposals.values()];
}
