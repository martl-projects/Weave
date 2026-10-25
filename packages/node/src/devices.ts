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
export function checkDevice(proof: unknown, caPem: string, did: Did, idToken: string, now = Date.now()): { subject: string; serial: string; validTo: string } | undefined {
  const checked = inspectDevice(proof, caPem, did, idToken, now);
  return 'device' in checked ? checked.device : undefined;
}

/** The same check, saying what's wrong when it fails (the admin console shows it, stage 15). */
export function inspectDevice(proof: unknown, caPem: string, did: Did, idToken: string, now = Date.now()): { device: { subject: string; serial: string; validTo: string } } | { problem: string } {
  const p = proof as Partial<DeviceProof> | undefined;
  if (typeof p?.cert !== 'string' || typeof p.sig !== 'string') return { problem: 'no company computer certificate' };
  try {
    const cert = new X509Certificate(p.cert);
    const ca = new X509Certificate(caPem);
    if (!cert.checkIssued(ca) || !cert.verify(ca.publicKey)) return { problem: "a certificate from another authority than the company's" };
    if (Date.parse(cert.validFrom) > now) return { problem: 'a certificate that isn’t valid yet' };
    if (Date.parse(cert.validTo) < now) return { problem: `a certificate that expired ${new Date(cert.validTo).toISOString().slice(0, 10)}` };
    if (!verify(algorithmOf(cert.publicKey.asymmetricKeyType), message(did, idToken), cert.publicKey, Buffer.from(p.sig, 'base64url'))) return { problem: 'a certificate whose key didn’t sign this sign-in' };
    return { device: { subject: cert.subject.replace(/\n/g, ', '), serial: cert.serialNumber, validTo: new Date(cert.validTo).toISOString() } };
  } catch {
    return { problem: "a certificate that couldn't be read" };
  }
}

/** A certificate authority as the company names it: checked to be one. */
export function checkAuthority(caPem: string): string {
  const ca = new X509Certificate(caPem);
  if (!ca.ca) throw new Error("that certificate isn't a certificate authority");
  return ca.subject.replace(/\n/g, ', ');
}
