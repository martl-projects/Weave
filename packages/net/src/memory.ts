import { randomBytes } from 'node:crypto';
import { Duplex } from 'node:stream';

/**
 * Two connected in-memory streams: what one writes, the other reads. For tests
 * and simulations. Both carry the same random `handshakeHash`, as the two ends
 * of a Hyperswarm connection do.
 */
export function duplexPair(): [Duplex, Duplex] {
  let a: Duplex;
  let b: Duplex;
  const make = (other: () => Duplex) =>
    new Duplex({
      read() {},
      write(chunk, _encoding, callback) {
        other().push(chunk);
        callback();
      },
      final(callback) {
        other().push(null);
        callback();
      },
    });
  a = make(() => b);
  b = make(() => a);
  const handshakeHash = randomBytes(32);
  Object.assign(a, { handshakeHash });
  Object.assign(b, { handshakeHash });
  return [a, b];
}
