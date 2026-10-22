# v2 stage 9: company features, second part

Built on stage 6 (managed spaces, providers, SSO, hold). From the detail post "Key management in detail" (section 5): approved agents, work identities with escrowed recovery, audit, and a cloud KMS.

## 1. Approved agents

In a managed space, agents act only if those who manage it approved them: `weave.space.agent {agent, on}` (control, by managers). Default: none.

- **Writing:** the node refuses `as <agent>` in a managed space for an agent not approved.
- **Counting:** every node ignores events signed there by agent keys that aren't approved (as it ignores kinds an agent isn't permitted).
- **Reading:** the MCP server asks the node which spaces its agent may not see (`agentBlocked(as)`) and keeps them out of everything it returns, and refuses tools aimed at them.
- An agent is named by its key (a person's agent `helper` is a different key from someone else's `helper`).

## 2. Work identities, recovery held by the company

Employees should have a **work identity** per company (`weave init` in a separate home, as today), and the company may keep its recovery:

- `weave escrow <space>`: the employee hands their recovery words to the company: the node checks they belong to the identity, wraps them with the space's key provider (context: the person) and writes `weave.org.escrow {person, wrapped}` in the managed space.
- `weave escrow open <space> <person>`: someone who manages the space unwraps them through the key service (so it's in the company's audit log) and hands them to the employee's new device: `weave restore`.
- Only the company's key service can open an escrow; members who read the space see that one exists, not the words.

## 3. Audit export

`weave audit <space> [since]`: the space's governance as JSON lines, oldest first: who joined, left or was removed, keys rotated, settings (managed, history, holds, rules, agents approved), attestations, shreds, escrows opened. Each line: time, kind, who, signing key, and what changed. No content.

Opening an escrow writes `weave.org.escrow.opened {person}`, so audits show who recovered whose identity.

## 4. Azure Key Vault

A provider for Entra-ID companies: `{kind: 'azure', vault, key}` (an RSA key in Key Vault).

- **Wrap:** `POST {vault}/keys/{key}/wrapkey?api-version=7.4` with `RSA-OAEP-256`; unwrap with `unwrapkey`.
- **Bound to space and epoch:** Key Vault's wrap has no context, so what it wraps is a seed and the company half is `HKDF(seed, space ‖ epoch)`: a wrapped part opens only for its own space and epoch. (Unlike Vault Transit, Key Vault's own log doesn't show which space; the Weave audit does.)
- **Sign-in:** an Entra access token for `https://vault.azure.net`: given directly, or from client credentials, or from the employee's sign-in token as a federated client assertion (no stored secrets on laptops).
- **Destroy:** deleting the key (`DELETE {vault}/keys/{key}`).

## Order of work

1. Approved agents (setting, write check, counting, MCP filtering); tests.
2. Escrow and opening; tests (only through the key service, words check, the audit line).
3. Audit export; tests.
4. Azure Key Vault provider; tests against a stand-in following Key Vault's API and Entra's token endpoint.
5. Release.
