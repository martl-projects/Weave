/*
 * Gumroad, as a payment bridge for membership tiers. A creator links a tier to
 * a Gumroad membership product with license keys switched on; a supporter
 * buys it there and sends the license key from their receipt with their
 * request (encrypted to the creator). The creator's node checks the key with
 * Gumroad's license API, which needs no access token, and grants or renews a
 * month at a time while the subscription is paid.
 *
 * Weave never sees card details or money; Gumroad stays the merchant.
 *
 * Creators don't have to set the product up by hand: with an access token
 * from their Gumroad account (scope edit_products) createGumroadMembership
 * makes a monthly membership with a license key in its content, publishes it
 * and returns the link for the tier. The token is used for that and not kept.
 */

import type { GumroadLink } from '@weave/core';
import type { Fetch } from './github.ts';

export const GUMROAD_API = 'https://api.gumroad.com/v2';
export const GUMROAD_VERIFY = `${GUMROAD_API}/licenses/verify`;

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

export interface NewGumroadMembership {
  name: string;
  /** Per month, in the currency's smallest unit (cents). */
  price: number;
  /** ISO code; Gumroad uses the account's currency without one. */
  currency?: string;
  /** Plain text for the product page. */
  description?: string;
}

export interface CreatedGumroadMembership {
  link: GumroadLink;
  /** On sale; false when Gumroad kept it as a draft (warning says why). */
  published: boolean;
  warning?: string;
}

/**
 * Make a Gumroad membership that sells a tier: one monthly tier named like
 * the Weave tier, a license key in its content (so buyers get one on their
 * receipt), published. A product left half made is deleted again.
 */
export async function createGumroadMembership(token: string, input: NewGumroadMembership, fetchImpl: Fetch = fetch): Promise<CreatedGumroadMembership> {
  if (!token.trim()) throw new Error('a Gumroad access token is needed to create the product');
  if (!(input.price > 0)) throw new Error('a Gumroad membership needs a price: --price 5');
  const call = async (method: string, path: string, body?: Record<string, unknown>) => {
    const res = await fetchImpl(`${GUMROAD_API}${path}`, {
      method,
      headers: { authorization: `Bearer ${token.trim()}`, accept: 'application/json', ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(30_000),
    });
    const data = (await res.json().catch(() => ({}))) as { success?: boolean; message?: string } & Record<string, unknown>;
    if (res.status === 401 || res.status === 403) throw new Error("Gumroad didn't accept the access token (it needs the edit_products scope)");
    if (!data.success) throw new Error(`Gumroad: ${data.message || `${method} ${path} failed (${res.status})`}`);
    return data;
  };

  const created = await call('POST', '/products', {
    native_type: 'membership',
    name: input.name,
    price: input.price,
    ...(input.currency ? { price_currency_type: input.currency.toLowerCase() } : {}),
    subscription_duration: 'monthly',
    ...(input.description ? { description: `<p>${escapeHtml(input.description)}</p>` } : {}),
    draft: true, // published once the license key is in
  });
  const product = created.product as { id?: string; short_url?: string } | undefined;
  if (!product?.id || !product.short_url) throw new Error("Gumroad didn't return the new product's id and page");
  const id = encodeURIComponent(product.id);

  try {
    // A membership starts with per-tier content; the license key goes into content shared by all tiers.
    await call('PUT', `/products/${id}`, {
      has_same_rich_content_for_all_variants: true,
      rich_content: [
        {
          title: 'Your Weave license key',
          description: {
            type: 'doc',
            content: [
              { type: 'paragraph', content: [{ type: 'text', text: `Paste this key into Weave to join ${input.name}: in the app when you ask to join, or with weave support <tier> --license <key>.` }] },
              { type: 'licenseKey' },
            ],
          },
        },
      ],
    });
  } catch (e) {
    await call('DELETE', `/products/${id}`).catch(() => undefined);
    throw e;
  }

  // Gumroad names the first tier "Untitled"; buyers see it at checkout.
  await nameFirstTier(call, id, input.name).catch(() => undefined);

  const link: GumroadLink = { product: product.id, url: product.short_url };
  try {
    await call('PUT', `/products/${id}/enable`);
    return { link, published: true };
  } catch (e) {
    return { link, published: false, warning: `${(e as Error).message}; publish it on Gumroad, the tier is linked already` };
  }
}

async function nameFirstTier(call: (method: string, path: string, body?: Record<string, unknown>) => Promise<Record<string, unknown>>, id: string, name: string): Promise<void> {
  const categories = (await call('GET', `/products/${id}/variant_categories`)).variant_categories as { id: string; title?: string }[] | undefined;
  const category = categories?.find((c) => c.title === 'Tier') ?? categories?.[0];
  if (!category) return;
  const path = `/products/${id}/variant_categories/${encodeURIComponent(category.id)}/variants`;
  const variants = (await call('GET', path)).variants as { id: string }[] | undefined;
  if (variants?.length === 1) await call('PUT', `${path}/${encodeURIComponent(variants[0]!.id)}`, { name });
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
