/*
 * Gumroad, as a payment bridge for membership tiers. A creator links a tier to
 * a Gumroad membership product with license keys switched on; a supporter
 * buys it there and sends the license key from their receipt with their
 * request (encrypted to the creator). The creator's node checks the key with
 * Gumroad's license API, which needs no access token, and grants or renews a
 * month at a time while the subscription is paid.
 *
 * Weave never sees card details or money; Gumroad stays the merchant.
 */

import type { GumroadLink } from '@weave/core';

export const GUMROAD_VERIFY = 'https://api.gumroad.com/v2/licenses/verify';

export interface LicenseCheck {
  /** Paid up: renew (or grant). */
  ok: boolean;
  /** Why not, in words for the creator. */
  reason?: string;
  /** The buyer's email at Gumroad, shown only to the creator. */
  email?: string;
}

export type LicenseChecker = (link: GumroadLink, license: string) => Promise<LicenseCheck>;

/** Ask Gumroad whether a license key belongs to a paid-up purchase of the product. */
export const checkGumroadLicense: LicenseChecker = async (link, license) => {
  const res = await fetch(GUMROAD_VERIFY, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    // increment_uses_count=false: checking isn't using; a renewal check shouldn't count as a new activation.
    body: new URLSearchParams({ product_id: link.product, license_key: license.trim(), increment_uses_count: 'false' }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string; purchase?: Record<string, unknown> };
  if (!data.success || !data.purchase) return { ok: false, reason: data.message || `Gumroad doesn't know that license key (${res.status})` };
  return judgePurchase(link, data.purchase);
};

/** Whether a purchase Gumroad returned is paid up for this tier. */
export function judgePurchase(link: GumroadLink, purchase: Record<string, unknown>): LicenseCheck {
  const email = typeof purchase.email === 'string' ? purchase.email : undefined;
  const no = (reason: string): LicenseCheck => ({ ok: false, reason, ...(email ? { email } : {}) });
  if (typeof purchase.product_id === 'string' && purchase.product_id !== link.product) return no('that license key is for another Gumroad product');
  if (purchase.refunded === true) return no('the purchase was refunded');
  if (purchase.chargebacked === true) return no('the purchase was charged back');
  if (purchase.subscription_ended_at) return no('the membership has ended');
  if (purchase.subscription_failed_at) return no("the membership's last payment failed");
  if (purchase.subscription_cancelled_at) return no('the membership was cancelled');
  if (link.variant) {
    const variants = typeof purchase.variants === 'string' ? purchase.variants : '';
    if (!variants.toLowerCase().includes(link.variant.toLowerCase())) return no(`that's not the "${link.variant}" tier on Gumroad${variants ? ` (it's ${variants})` : ''}`);
  }
  return { ok: true, ...(email ? { email } : {}) };
}
