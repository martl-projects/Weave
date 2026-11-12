import { sha256 } from '@noble/hashes/sha2.js';
import { b64u, utf8 } from './bytes.ts';
import { open, randomBytes, seal, type Sealed } from './crypto.ts';
import { isDid, type Did } from './keys.ts';

/*
 * Onboarding links (idea bZFDCQNT): one short link that makes the account, the friendship and the memberships, and opens
 * the project. The link is `<page>/j/<code>#<secret>`: the storage node keeps the plan sealed under the code, and the
 * secret after `#` (which no server ever sees) opens it. The plan is a list of steps from a fixed set; a client runs the
 * ones it knows in order and skips the rest, so plans can grow without breaking older clients.
 *
 *   account    make an account on the storage node (the web; someone with Weave already skips it)
 *   contact    add the creator as a contact (their contact link); `friends`: the creator adds them back, by the contact
 *              link they box to `enc` (the creator's encryption key) in the space they joined
 *   join       join a space with its invite (or knock) link
 *   open       open a space when done; `play`: with its app's Play
 *   welcome    a line from the creator, shown at the end
 */

export const ONBOARD_PATH = '/j/';
const CODE = /^[A-Za-z0-9]{8}$/;
const CONTEXT = 'weave/onboard/plan/v1';
const MAX_STEPS = 12;

export type OnboardStep =
  | { do: 'account' }
  | { do: 'contact'; link: string; friends?: true; enc?: Did }
  | { do: 'join'; link: string; space: { id: string; kind: string; name: string } }
  | { do: 'open'; space: string; play?: true }
  | { do: 'welcome'; text: string };

export interface OnboardPlan {
  v: 1;
  by: { did: Did; name?: string };
  /** What it invites to, e.g. the project's name. */
  title: string;
  steps: OnboardStep[];
}

const isText = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;

/** One step from untrusted input, or undefined for one this Weave doesn't know (it's skipped). */
function stepOf(value: unknown): OnboardStep | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const s = value as Record<string, unknown>;
  switch (s.do) {
    case 'account':
      return { do: 'account' };
    case 'contact':
      return isText(s.link, 4000) && s.link.startsWith('weave:contact:') ? { do: 'contact', link: s.link, ...(s.friends === true ? { friends: true as const } : {}), ...(isDid(s.enc) ? { enc: s.enc } : {}) } : undefined;
    case 'join': {
      const space = s.space as Record<string, unknown> | undefined;
      if (!isText(s.link, 20_000) || !/^weave:(invite|knock):/.test(s.link) || !space || !isText(space.id, 200) || !isText(space.kind, 20) || !isText(space.name, 200)) return undefined;
      return { do: 'join', link: s.link, space: { id: space.id, kind: space.kind, name: space.name } };
    }
    case 'open':
      return isText(s.space, 200) ? { do: 'open', space: s.space, ...(s.play === true ? { play: true as const } : {}) } : undefined;
    case 'welcome':
      return isText(s.text, 1000) ? { do: 'welcome', text: s.text } : undefined;
  }
  return undefined;
}

/** A plan from untrusted input: its known steps, in order. Throws if it isn't a plan at all. */
export function parsePlan(value: unknown): OnboardPlan {
  const p = (value ?? {}) as Record<string, unknown>;
  const by = (p.by ?? {}) as Record<string, unknown>;
  if (p.v !== 1 || !isDid(by.did) || !isText(p.title, 200) || !Array.isArray(p.steps)) throw new Error('this link holds no plan this Weave can read');
  const steps = p.steps.slice(0, MAX_STEPS).map(stepOf).filter((s): s is OnboardStep => !!s);
  return { v: 1, by: { did: by.did, ...(isText(by.name, 100) ? { name: by.name } : {}) }, title: p.title, steps };
}

/** A new link's secret: 16 random bytes, 22 characters after the `#`. */
export const newPlanSecret = (): Uint8Array => randomBytes(16);

const derive = (secret: Uint8Array, purpose: string) => sha256(new Uint8Array([...utf8(`weave/onboard/${purpose}/v1`), ...secret]));

/** What a taker shows the storage node to use the link: proves the secret without giving it away. */
export const planCheck = (secret: Uint8Array): string => b64u.encode(derive(secret, 'check'));

/** The plan sealed for the storage node, which can't open it. */
export function sealPlan(plan: OnboardPlan, secret: Uint8Array): string {
  const sealed = seal(derive(secret, 'key'), plan as unknown as Parameters<typeof seal>[1], CONTEXT);
  return `${sealed.nonce}.${sealed.ct}`;
}

export function openPlan(sealed: string, secret: Uint8Array): OnboardPlan {
  const [nonce, ct] = sealed.split('.');
  let value: unknown;
  try {
    value = open(derive(secret, 'key'), { nonce, ct } as Sealed, CONTEXT);
  } catch {
    throw new Error("this link's secret doesn't open its plan: is the link whole?");
  }
  return parsePlan(value);
}

/** The link someone sends: `https://web.martl.io/j/Pf3kQ9xz#<secret>`. */
export const onboardLink = (page: string, code: string, secret: Uint8Array): string => `${new URL(page).origin}${ONBOARD_PATH}${code}#${b64u.encode(secret)}`;

/** A link's parts, from text that may have more around it; undefined if it isn't one. */
export function parseOnboardLink(text: string): { page: string; code: string; secret: Uint8Array } | undefined {
  const match = /(https?:\/\/[^\s/#?]+)\/j\/([A-Za-z0-9]{8})#([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/.exec(text);
  if (!match || !CODE.test(match[2])) return undefined;
  try {
    const secret = b64u.decode(match[3]);
    return secret.length === 16 ? { page: new URL(match[1]).origin, code: match[2], secret } : undefined;
  } catch {
    return undefined;
  }
}

/** Text for an HTML attribute. */
const attr = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * The page for an onboarding link, with what its link preview shows (og:title, og:description, og:image): for a
 * node that serves the page itself (storageserver.ts) and for web.martl.io, in its Pages Function (apps/web/src/preview-function.ts).
 */
export function previewTags(preview: { live: boolean; preview?: { title: string; text?: string }; image?: true } | undefined, imageUrl: string): string {
  const title = !preview ? 'Weave' : !preview.live ? 'This invite link no longer works' : (preview.preview?.title ?? 'An invitation to Weave');
  const text = !preview?.live ? 'Ask whoever sent it for a new one.' : (preview.preview?.text ?? 'Join on Weave: a place to build things together.');
  return [
    `<meta property="og:title" content="${attr(title)}">`,
    `<meta property="og:description" content="${attr(text)}">`,
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Weave">',
    ...(preview?.live && preview.image ? [`<meta property="og:image" content="${attr(imageUrl)}">`, '<meta name="twitter:card" content="summary_large_image">'] : ['<meta name="twitter:card" content="summary">']),
  ].join('\n');
}
