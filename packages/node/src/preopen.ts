import { selfKey, sealContext, spaceScope, b64u, type PreopenWork } from '@weave/core';
import { resolveHome } from './home.ts';
import { loadEncryptionKeys, loadIdentity } from './keystore.ts';
import { SELF_SCOPE } from './shared.ts';
import { loadSpaces } from './spacestore.ts';

/**
 * The keys a home opens its sealed events with, before any node is open: for opening them ahead of time, somewhere
 * whose memory is thrown away after (core's preopen.ts). The person's own space and every group, project and
 * community the home has keys of, each epoch with its keys in the order `openIn` tries them. Direct chats aren't here
 * (their keys are made of the two people's, once the node knows who they are): the node opens those itself, as it
 * opens anything else that wasn't opened ahead.
 */
export function preopenKeys(dir: string): PreopenWork['keys'] {
  const home = resolveHome(dir);
  const keys: PreopenWork['keys'] = {};
  const identity = loadIdentity(home);
  if (identity) {
    // As the node has it: the oldest encryption key, or (homes from before those) the device's own.
    const secret = (loadEncryptionKeys(home)[0]?.keys ?? identity.keys).secretKey;
    keys[SELF_SCOPE] = { '': [{ key: b64u.encode(selfKey(secret)), context: `weave/self/v1:${identity.author}` }] };
  }
  for (const space of loadSpaces(home)) {
    const epochs: PreopenWork['keys'][string] = {};
    for (const epoch of new Set([...Object.keys(space.keys), ...Object.keys(space.alternates ?? {})])) {
      const tries = [space.keys[epoch], ...(space.alternates?.[epoch] ?? [])].filter((k): k is string => !!k);
      if (tries.length) epochs[epoch] = tries.map((key) => ({ key, context: sealContext(space, Number(epoch)) }));
    }
    keys[spaceScope(space)] = epochs;
  }
  return keys;
}
