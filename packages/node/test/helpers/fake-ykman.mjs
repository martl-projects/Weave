// A stand-in for YubiKey Manager's `ykman`, for tests without a YubiKey: `otp calculate <slot> <challenge>` answers
// with HMAC-SHA1 under the key's secret (FAKE_YUBIKEY_SECRET), as a YubiKey programmed for challenge-response does.
import { createHmac } from 'node:crypto';

const [area, action, slot, challenge] = process.argv.slice(2);
if (process.env.FAKE_YUBIKEY_ABSENT) {
  process.stderr.write('ERROR: No YubiKey detected!\n');
  process.exit(2);
}
if (area === 'info') {
  process.stdout.write('Device type: YubiKey 5 NFC (stand-in)\n');
} else if (area === 'otp' && action === 'calculate' && slot === '2' && /^[0-9a-f]+$/i.test(challenge ?? '')) {
  process.stdout.write(createHmac('sha1', process.env.FAKE_YUBIKEY_SECRET ?? 'yubikey-secret').update(Buffer.from(challenge, 'hex')).digest('hex') + '\n');
} else {
  process.stderr.write('ERROR: slot not configured for challenge-response\n');
  process.exit(2);
}
