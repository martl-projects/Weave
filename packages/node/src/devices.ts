import { createHash, sign, verify, X509Certificate, createPrivateKey } from 'node:crypto';
import type { Did } from '@weave/core';

/*
 * Device checks (stage 12): the company's device management puts a
 * certificate from the company's device authority on each company computer.
 * Signing in, the computer shows it and signs the person and the sign-in with
 * its key; the company vouches only for sign-ins from its own computers.
 */

export interface DeviceProof {
  cert: string;
  sig: string;
}

const message = (did: Did, idToken: string) => Buffer.from(`weave/device/v1:${did}:${createHash('sha256').update(idToken).digest('base64url')}`);

/** Ed25519 keys sign the message itself; RSA and EC keys a SHA-256 of it. */
const algorithmOf = (type: string | undefined) => (type === 'ed25519' || type === 'ed448' ? null : 'sha256');

/** This computer's proof for a sign-in: its certificate, and its key's signature over the person and the token. */
export function deviceProof(certPem: string, keyPem: string, did: Did, idToken: string): DeviceProof {
  const key = createPrivateKey(keyPem);
  return { cert: certPem, sig: sign(algorithmOf(key.asymmetricKeyType), message(did, idToken), key).toString('base64url') };
}

/** Is this a company computer's proof for this sign-in? Its certificate from the company's authority, valid now, and signed. */
export function checkDevice(proof: unknown, caPem: string, did: Did, idToken: string, now = Date.now()): { subject: string; serial: string } | undefined {
  const p = proof as Partial<DeviceProof> | undefined;
  if (typeof p?.cert !== 'string' || typeof p.sig !== 'string') return undefined;
  try {
    const cert = new X509Certificate(p.cert);
    const ca = new X509Certificate(caPem);
    if (!cert.checkIssued(ca) || !cert.verify(ca.publicKey)) return undefined;
    if (Date.parse(cert.validFrom) > now || Date.parse(cert.validTo) < now) return undefined;
    if (!verify(algorithmOf(cert.publicKey.asymmetricKeyType), message(did, idToken), cert.publicKey, Buffer.from(p.sig, 'base64url'))) return undefined;
    return { subject: cert.subject.replace(/\n/g, ', '), serial: cert.serialNumber };
  } catch {
    return undefined;
  }
}

/** A certificate authority as the company names it: checked to be one. */
export function checkAuthority(caPem: string): string {
  const ca = new X509Certificate(caPem);
  if (!ca.ca) throw new Error("that certificate isn't a certificate authority");
  return ca.subject.replace(/\n/g, ', ');
}
