import { readPayment, TREASURY_CHAIN, type OnchainPrice, type PaymentCheck, type Receipt } from '@weave/core';

/*
 * Reading the chain: only public JSON-RPC calls, no keys. Weave asks a public
 * node for a transaction's receipt and reads the payment from it (core/payments.ts).
 */

/** Public RPC endpoints Weave reads from, by chain id. */
export const RPC_URLS: Record<number, string> = { [TREASURY_CHAIN.id]: TREASURY_CHAIN.rpc };

export type PaymentChecker = (price: OnchainPrice, tx: string) => Promise<PaymentCheck>;

export async function rpc<T>(chain: number, method: string, params: unknown[]): Promise<T> {
  const url = RPC_URLS[chain];
  if (!url) throw new Error(`Weave can't read chain ${chain} yet`);
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`the chain's RPC answered ${response.status}`);
  const answer = (await response.json()) as { result?: T; error?: { message?: string } };
  if (answer.error) throw new Error(answer.error.message ?? 'the chain refused the call');
  return answer.result as T;
}

/** A read-only contract call (eth_call) on a chain: its raw answer. */
export const ethCall = (chain: number, call: { to: string; data: string }): Promise<string> => rpc<string>(chain, 'eth_call', [call, 'latest']);

/** Whether a transaction paid a tier, as the chain says. Throws when the chain can't be reached (try again later). */
export const checkOnchainPayment: PaymentChecker = async (price, tx) => readPayment(await rpc<Receipt | null>(price.chain, 'eth_getTransactionReceipt', [tx]), price);
