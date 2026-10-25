/*
 * The chain treasuries and paid access live on, and amounts in tokens: plain
 * constants and arithmetic, no cryptography, so the apps' screens can use them.
 */

/** The chain treasuries live on while this is a prototype: Base Sepolia, a test network without real money. */
export const TREASURY_CHAIN = { id: 84532, name: 'Base Sepolia', rpc: 'https://sepolia.base.org', explorer: 'https://sepolia.basescan.org' } as const;

/** Circle's test USDC on Base Sepolia: no real money. */
export const TEST_USDC = { chain: TREASURY_CHAIN.id, token: '0x036CbD53842c5426634e7929541eC2318f3dCF7e', symbol: 'USDC', decimals: 6 } as const;

/** An amount in the token's smallest unit, shown with its decimals: 2500000 with 6 → "2.5". */
export function formatUnits(value: bigint | number | string, decimals: number): string {
  const v = BigInt(value);
  const base = 10n ** BigInt(decimals);
  const fraction = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${v / base}${fraction ? `.${fraction}` : ''}`;
}

/** A decimal amount ("2.5", also "2,5") in the token's smallest unit, or undefined. */
export function parseUnits(text: string, decimals: number): number | undefined {
  const match = /^(\d{1,12})(?:[.,](\d+))?$/.exec(text.trim());
  if (!match || (match[2]?.length ?? 0) > decimals) return undefined;
  const value = Number(match[1]) * 10 ** decimals + Number((match[2] ?? '').padEnd(decimals, '0') || 0);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export const isHexAddress = (value: unknown): value is string => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
export const isTxHash = (value: unknown): value is string => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
