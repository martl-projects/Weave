/* What a website's tab uses of b4a and sodium (bundled as sodium-javascript for a browser). */

declare module 'b4a' {
  const b4a: {
    alloc(size: number): Buffer;
    from(text: string, encoding: 'hex'): Buffer;
    toString(bytes: Uint8Array, encoding: 'hex'): string;
  };
  export default b4a;
}

declare module 'sodium-universal' {
  const sodium: { crypto_sign_keypair(publicKey: Uint8Array, secretKey: Uint8Array): void };
  export default sodium;
}

/** For the test that compares a browser's sodium with libsodium (test/sodiumbrowser.test.ts). */
declare module 'sodium-native' {
  const sodium: {
    crypto_sign_keypair(publicKey: Uint8Array, secretKey: Uint8Array): void;
    crypto_scalarmult_ed25519_noclamp(q: Uint8Array, n: Uint8Array, p: Uint8Array): void;
  };
  export default sodium;
}
