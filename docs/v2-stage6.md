# v2 stage 6: companies (key providers, split keys, SSO)

Built on stages 1–5. Spec: change 19 (managed spaces); the detail post "Key management in detail" (sections 4–5); Julian's "Business Version" (SSO and corporate data retention); Work board item "v2 stage 6".

For a company, the question is: who can read our spaces, and how do we make sure ex-employees, the cloud provider and Weave's developers can't? Answer: the company's own key service holds half of every key, and its identity provider decides who gets it.

## 1. Key providers

```ts
interface KeyProvider {
  wrap(key, context): Promise<string>;     // context: {space, epoch, did}
  unwrap(wrapped, context): Promise<key>;  // may be refused (policy, offboarded, offline)
  destroy(): Promise<void>;                // shred every epoch it ever wrapped
  describe(): {kind, keyRef}
}
```

- `local`: the home's vault (stage 2); for personal use and tests.
- `vault`: HashiCorp Vault's **Transit** engine (`/v1/transit/encrypt|decrypt/<key>`), with the context as Transit's derivation context, so every unwrap is bound to its space and epoch and lands in Vault's audit log. Auth: a Vault token, or the employee's SSO token through Vault's JWT/OIDC auth (`/v1/auth/jwt/login`), so no cloud secret is stored on laptops.
- Cloud KMSs (AWS, Azure, GCP) and PKCS#11 come when a company asks; they fit the same interface.

## 2. Managed spaces: split keys

A space becomes **managed** with `weave.space.managed {provider: {kind, address, key}, ttlMinutes, graceHours, attestor?}`, set by its owner. From the next epoch on:

```
epochKey = HKDF(weavePart ‖ kmsPart, "weave/managed-epoch/v1:" + space + ":" + epoch)
```

- `weavePart` is the epoch key Weave hands out as always (rekeys, invites, gifts); on its own it opens nothing.
- `kmsPart` is random, wrapped by the provider; the wrapped part rides in the rekey event (`kms`), readable by members, useless without the provider.
- A node unwraps `kmsPart` when it needs the epoch and keeps the result **in memory for `ttlMinutes`** (default 15). With `graceHours` > 0 (default 8) it also keeps it on disk, sealed at rest, until the grace runs out, for working offline. Grace 0: strict.
- Epochs from before the space was managed stay as they were (the company can shred them).

Consequences: an ex-employee's `weavePart` reads nothing new once the provider refuses them; the provider's operator never sees content or `weavePart`; Weave's developers aren't involved at all. Destroying the provider's key shreds every copy of every managed epoch.

Writing in a managed space needs the current epoch unlocked: the node unlocks managed epochs ahead (on start, on reconcile, when keys change), and says so plainly when the provider refuses.

## 3. SSO: attestations and offboarding

- A company runs an **attestor**: a Weave identity (a service) that checks employees' sign-ins with the company's OIDC provider (Entra ID, Okta, Google…): the ID token's signature against the issuer's keys (JWKS), audience, expiry.
- For a valid sign-in it signs `weave.org.attest {did, subject, email, groups, until}` in the managed space: "this Weave person is employee X, in these groups, until then" (default: 24 hours, renewed while the employee signs in).
- A managed space with an `attestor` admits only attested members: their events count while their attestation holds. A manager's node removes people whose attestation lapsed (with the usual rekey); the provider refuses them anyway.
- Employees: `weave sso <space> <id-token>` hands a token to the attestor (sealed to it, in the space). Getting the token is the IdP's sign-in (the app opens it; the CLI takes one obtained by the company's own tooling).

## 4. Retention: legal hold and archive nodes

- `weave.space.hold {until, reason}` by the owner: while it stands, shredding is refused (by whoever tries, and by every member's node), and nothing is forgotten by rule.
- **Archive nodes**: a node with `archive: true` in its config keeps everything of its spaces: it never forgets (stage 3), never releases bodies (stage 4). The company runs them as service members with their own provider access.

## Order of work

1. Providers: interface, `local`, `vault` (Transit + token or JWT auth); tests against a local Transit stand-in.
2. Managed spaces: the setting, split keys at rekey, unwrap with TTL and grace, sealing and opening through it; tests: a member reads, an ex-member doesn't, destroying the key shreds.
3. SSO: the attestor (OIDC check, attestations), membership by attestation, offboarding; tests against a local OIDC issuer.
4. Hold and archive nodes; tests.
5. CLI; release v0.9.

Tested here without a real Vault or identity provider: the stand-ins follow Vault's Transit and JWT-auth HTTP APIs and OIDC's ID tokens and JWKS. A first company pilot is where these get tried for real.
