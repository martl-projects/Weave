import type { Json } from './bytes.ts';
import type { Did } from './keys.ts';

/*
 * Accounts elsewhere: a person says an account on another platform is theirs (GitHub, X, Reddit…), with a proof that
 * names their Weave id there (a gist, a post). Weave knows no platform: a verifier for it (a client app, run by
 * whoever looks, see the WIT's verifier world) checks the proof. Said on the hub, everyone sees it; said in a space,
 * only its members do (a project's services among them, which give access by it).
 *
 *   weave.account  {platform, handle, proof, on}   the latest per person and platform counts; on: false takes it back
 */

export const KIND_ACCOUNT = 'weave.account';

export interface AccountClaim {
  platform: string;
  /** The account's name there. */
  handle: string;
  /** Where its proof is: an address, or what the platform's verifier understands. */
  proof: string;
}

export const isPlatform = (value: unknown): value is string => typeof value === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(value);
const isHandle = (value: unknown): value is string => typeof value === 'string' && /^[^\s]{1,100}$/.test(value);
const isProof = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 500;

/** What a proof must hold, on any platform: the person's Weave id. */
export const accountProofText = (did: Did): string => `My Weave id: ${did}`;

/** The accounts people said are theirs in these entries: by person, then platform (the latest word of each). */
export function accountClaimsOf(entries: Array<{ kind: string; body: Json; event: { author: Did; time: string } }>): Map<Did, Map<string, AccountClaim>> {
  const out = new Map<Did, Map<string, AccountClaim>>();
  for (const e of [...entries].filter((x) => x.kind === KIND_ACCOUNT).sort((a, b) => a.event.time.localeCompare(b.event.time))) {
    const b = (e.body && typeof e.body === 'object' && !Array.isArray(e.body) ? e.body : {}) as Record<string, unknown>;
    if (!isPlatform(b.platform)) continue;
    const mine = out.get(e.event.author) ?? new Map<string, AccountClaim>();
    if (b.on === false) mine.delete(b.platform);
    else if (isHandle(b.handle) && isProof(b.proof)) mine.set(b.platform, { platform: b.platform, handle: b.handle, proof: b.proof });
    if (mine.size) out.set(e.event.author, mine);
    else out.delete(e.event.author);
  }
  return out;
}
