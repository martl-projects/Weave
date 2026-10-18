import { Duplex } from 'node:stream';

/** Two connected in-memory streams: what one writes, the other reads. For tests and simulations. */
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
  return [a, b];
}
