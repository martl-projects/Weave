import { b64u } from '@weave/core';
import { PRF_SALT } from './lock.ts';

/*
 * The passkey, in the page (a Worker has no WebAuthn). There's no server behind it: nobody checks the ceremony, what
 * counts is the value its PRF gives, which only the passkey can make. A browser that says nothing about PRF may have it
 * all the same (Safari), so this tries rather than asks.
 */

export interface PasskeySecret {
  id: string;
  secret: Uint8Array;
}

type PrfResults = { prf?: { enabled?: boolean; results?: { first?: BufferSource } } };

const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));
const prf = { eval: { first: PRF_SALT as BufferSource } };
const value = (first: BufferSource): Uint8Array => (ArrayBuffer.isView(first) ? new Uint8Array(first.buffer as ArrayBuffer, first.byteOffset, first.byteLength) : new Uint8Array(first)).slice();

/** Ask an existing passkey: the one with this id, or whichever the person picks. */
export async function askPasskey(id?: string): Promise<PasskeySecret> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: random(32),
      userVerification: 'required',
      ...(id ? { allowCredentials: [{ type: 'public-key' as const, id: b64u.decode(id) as BufferSource }] } : {}),
      extensions: { prf } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  const first = (credential?.getClientExtensionResults() as PrfResults | undefined)?.prf?.results?.first;
  if (!credential || !first) throw new Error("this passkey can't open an account here: it gives no PRF value");
  return { id: b64u.encode(new Uint8Array(credential.rawId)), secret: value(first) };
}

/** A new passkey for this site. Some give the value right away, others only when asked. */
export async function makePasskey(name: string): Promise<PasskeySecret> {
  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: 'Weave' },
      user: { id: random(32), name, displayName: name },
      challenge: random(32),
      pubKeyCredParams: [
        { type: 'public-key', alg: -8 },
        { type: 'public-key', alg: -7 },
        { type: 'public-key', alg: -257 },
      ],
      authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
      extensions: { prf } as AuthenticationExtensionsClientInputs,
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error('no passkey was made');
  const id = b64u.encode(new Uint8Array(credential.rawId));
  const first = (credential.getClientExtensionResults() as PrfResults).prf?.results?.first;
  if (first) return { id, secret: value(first) };
  try {
    return await askPasskey(id);
  } catch (error) {
    // Made, but it opens nothing (no PRF here): it shouldn't wait in the keychain to be picked later. Browsers that can
    // take a hint remove it.
    const signal = (PublicKeyCredential as unknown as { signalUnknownCredential?(o: { rpId: string; credentialId: string }): Promise<void> }).signalUnknownCredential;
    await signal?.call(PublicKeyCredential, { rpId: location.hostname, credentialId: id }).catch(() => {});
    throw error;
  }
}
