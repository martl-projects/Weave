/*
 * Weave links as text (idea bZFDCQNT), without the screens: an onboarding link (https://…/j/<code>#<secret>), and the same
 * link as the OS hands it to the Weave app from Weave Web's "Open in the Weave app" (weave:join:<it, base64url>).
 */

export const ONBOARD_IN_TEXT = /https?:\/\/[^\s/#?]+\/j\/[A-Za-z0-9]{8}#[A-Za-z0-9_-]{22}/;
const JOIN_LINK = /^weave:join:([A-Za-z0-9_-]+)$/;

/** The weave:join:… link for an onboarding link, as Weave Web makes it. */
export const joinLinkFor = (link: string): string => `weave:join:${btoa(link).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;

/** The onboarding link a weave:join:… link carries, or undefined. */
export function joinLinkOf(link: string): string | undefined {
  const match = JOIN_LINK.exec(link.trim());
  if (!match) return undefined;
  try {
    return ONBOARD_IN_TEXT.exec(atob(match[1].replace(/-/g, '+').replace(/_/g, '/')))?.[0];
  } catch {
    return undefined;
  }
}
