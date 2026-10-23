import { randomBytes } from "node:crypto";
import { b64u, type Json } from "@weave/core";
import type { Home } from "./home.ts";
import {
  providerFor,
  type ProviderSpec,
  type VaultCredentials,
} from "./keyproviders.ts";
import { homeKeyService, keepHomeKeyIn, useHomeKey, vaultOf } from "./vault.ts";

/*
 * A company server's home key in the company's key service (stage 14). In a
 * container there's no keystore of the operating system: the home key would
 * lie in the volume next to everything it protects. Instead the company's
 * Vault or Key Vault wraps it, and the server unlocks it when it starts: a
 * stolen volume or backup opens nothing, and the company can lock its own
 * server out by disabling its key or its access.
 */

/** The key service credentials a server has in its environment. */
export function serverCredentials(): VaultCredentials {
  const env = process.env;
  return {
    ...(env.WEAVE_VAULT_TOKEN ? { token: env.WEAVE_VAULT_TOKEN } : {}),
    ...(env.WEAVE_AZURE_CLIENT_SECRET
      ? { azureClientSecret: env.WEAVE_AZURE_CLIENT_SECRET }
      : {}),
    ...(env.WEAVE_AZURE_TOKEN ? { azureToken: env.WEAVE_AZURE_TOKEN } : {}),
  };
}

/** Is this home's key in a key service? Then unlock it for this process (before anything opens the home). */
export async function unlockHomeKey(
  home: Home,
  credentials: VaultCredentials = serverCredentials(),
): Promise<boolean> {
  const held = homeKeyService(home);
  if (!held) return false;
  try {
    const key = await providerFor(
      held.provider as unknown as ProviderSpec,
      home,
      credentials,
    ).unwrap(held.wrapped, { space: held.context, epoch: 0 });
    useHomeKey(home, key);
    return true;
  } catch (error) {
    throw new Error(
      `this server's home key is in the company's key service, and it didn't open it: ${(error as Error).message}`,
    );
  }
}

/** Move this home's key into the company's key service: from now on, it opens only through it. */
export async function moveHomeKeyToKeyService(
  home: Home,
  provider: ProviderSpec,
  credentials: VaultCredentials = serverCredentials(),
): Promise<void> {
  const key = vaultOf(home).key;
  const context = `weave/home/${b64u.encode(randomBytes(12))}`;
  const service = providerFor(provider, home, credentials);
  const wrapped = await service.wrap(key, { space: context, epoch: 0 });
  // Check it comes back before the key leaves this computer's keeping.
  if (
    b64u.encode(await service.unwrap(wrapped, { space: context, epoch: 0 })) !==
    b64u.encode(key)
  )
    throw new Error("the key service gave back something else");
  keepHomeKeyIn(home, provider as unknown as Json, wrapped, context);
}
