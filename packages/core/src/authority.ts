import { isDid, type Did } from './keys.ts';
import type { EventFields, WeaveEvent } from './events.ts';

export const KIND_DELEGATE = 'weave.delegate';
export const KIND_REVOKE = 'weave.revoke';
/** An encrypted event; its real kind is inside and is checked by whoever can decrypt it. */
export const KIND_SEALED = 'weave.sealed';

/** Kinds only a root identity may sign itself. */
const ROOT_ONLY = new Set([KIND_DELEGATE, KIND_REVOKE]);

export type Role = 'device' | 'agent';

export interface Grant {
  author: Did;
  subject: Did;
  role: Role;
  name?: string;
  /** Kind patterns: exact (`weave.post`), prefix (`weave.*`) or everything (`*`). */
  permissions: string[];
  /** Events from this subject with a higher seq are invalid. */
  revokedAfter?: number;
}

export type Check = { ok: true } | { ok: false; reason: string; retry: boolean };

/** Event fields for a root delegating to a device or agent key. */
export function delegation(subject: Did, role: Role, permissions: string[], name?: string): EventFields {
  return { kind: KIND_DELEGATE, body: { subject, role, permissions, ...(name ? { name } : {}) } };
}

/** Event fields for a root revoking a key; events it signed up to `afterSeq` stay valid. */
export function revocation(subject: Did, afterSeq: number): EventFields {
  return { kind: KIND_REVOKE, body: { subject, afterSeq } };
}

/** `weave.issue.*` covers `weave.issue` itself and everything under it, like `weave.issue.claim`. */
export function permits(permissions: string[], kind: string): boolean {
  return permissions.some((p) => p === '*' || p === kind || (p.endsWith('.*') && (kind === p.slice(0, -2) || kind.startsWith(p.slice(0, -1)))));
}

/**
 * Tracks which keys may sign for which authors, built from the delegate and
 * revoke events in root logs.
 */
export class Authority {
  #grants = new Map<Did, Grant>();

  grant(subject: Did): Grant | undefined {
    return this.#grants.get(subject);
  }

  /** Feed an accepted event; only root-signed delegations and revocations have an effect. */
  apply(event: WeaveEvent): void {
    if (event.signer !== event.author) return;
    const body = event.body as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || !isDid(body.subject) || body.subject === event.author) return;
    const existing = this.#grants.get(body.subject);
    if (existing && existing.author !== event.author) return; // a key acts for one person only

    if (event.kind === KIND_DELEGATE) {
      const role = body.role === 'agent' ? 'agent' : 'device';
      const permissions = Array.isArray(body.permissions) ? body.permissions.filter((p): p is string => typeof p === 'string') : [];
      this.#grants.set(body.subject, {
        author: event.author,
        subject: body.subject,
        role,
        permissions,
        ...(typeof body.name === 'string' ? { name: body.name } : {}),
        ...(existing?.revokedAfter !== undefined ? { revokedAfter: existing.revokedAfter } : {}),
      });
    } else if (event.kind === KIND_REVOKE && Number.isSafeInteger(body.afterSeq)) {
      const afterSeq = body.afterSeq as number;
      const grant = existing ?? { author: event.author, subject: body.subject, role: 'device' as const, permissions: [] };
      grant.revokedAfter = Math.min(grant.revokedAfter ?? Infinity, afterSeq);
      this.#grants.set(body.subject, grant);
    }
  }

  /** May this event's signer sign it for its author? `retry` means a missing delegation may still arrive. */
  check(event: WeaveEvent): Check {
    if (event.signer === event.author) return { ok: true };
    if (ROOT_ONLY.has(event.kind)) return { ok: false, reason: `${event.kind} must be signed by the root`, retry: false };
    const grant = this.#grants.get(event.signer);
    if (!grant || grant.author !== event.author) return { ok: false, reason: 'signer not delegated by author', retry: true };
    if (grant.revokedAfter !== undefined && event.seq > grant.revokedAfter) {
      return { ok: false, reason: 'signer revoked', retry: false };
    }
    // Relays can't see a sealed event's kind; any delegated key may carry one, and
    // readers drop the event after decrypting if its inner kind isn't permitted.
    if (event.kind === KIND_SEALED && grant.permissions.length > 0) return { ok: true };
    if (!permits(grant.permissions, event.kind)) {
      return { ok: false, reason: `signer may not sign ${event.kind}`, retry: false };
    }
    return { ok: true };
  }
}
