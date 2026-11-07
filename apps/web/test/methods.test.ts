import { describe, expect, it } from 'vitest';
import { PHONE_METHODS } from '@weave/node';
import { webMethods } from '../src/methods.ts';

/** What a page may ask of its node. */

describe('the methods on the web', () => {
  const allowed = webMethods(PHONE_METHODS);

  it('has the everyday screens', () => {
    for (const method of ['spaces', 'messages', 'say', 'feed', 'posts', 'hints', 'seen', 'marks', 'preferences']) expect(allowed.has(method), method).toBe(true);
  });

  it('has nothing that runs on a computer, gives out keys, or goes through the DHT', () => {
    for (const method of ['addAgent', 'backup', 'phones', 'keystores', 'moveHomeKey', 'rotateRoot', 'claudeCode', 'desk', 'visitWebsite', 'sayOnWebsite']) expect(allowed.has(method), method).toBe(false);
  });
});
