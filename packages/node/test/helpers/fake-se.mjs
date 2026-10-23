// A stand-in for weave-se (apps/desktop/native/weave-se.swift), for tests on computers without a Secure Enclave:
// the same commands and answers, with a software P-256 key whose "blob" is simply the private key.
import { createECDH } from 'node:crypto';
import { readFileSync } from 'node:fs';

const command = process.argv[2];
if (process.env.FAKE_SE_ABSENT) {
  process.stderr.write('this Mac has no Secure Enclave\n');
  process.exit(1);
}
if (command === 'create') {
  const key = createECDH('prime256v1');
  key.generateKeys();
  process.stdout.write(JSON.stringify({ blob: key.getPrivateKey('base64'), publicKey: key.getPublicKey('base64') }) + '\n');
} else if (command === 'agree') {
  const { blob, peer } = JSON.parse(readFileSync(0, 'utf8'));
  const key = createECDH('prime256v1');
  key.setPrivateKey(Buffer.from(blob, 'base64'));
  process.stdout.write(key.computeSecret(Buffer.from(peer, 'base64')).toString('base64') + '\n');
} else {
  process.stderr.write('usage: weave-se create | agree\n');
  process.exit(1);
}
