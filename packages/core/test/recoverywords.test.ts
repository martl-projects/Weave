import { describe, expect, it } from 'vitest';
import { newRecoveryWords, normalizeWords } from '../src/recovery.js';

describe('recovery words', () => {
  const words = newRecoveryWords();
  const list = words.split(' ');

  it('takes them as they are', () => {
    expect(normalizeWords(`  ${words.toUpperCase()}\n`)).toBe(words);
  });

  it('leaves out the numbers of a copied list', () => {
    expect(normalizeWords(list.map((w, i) => `${i + 1}. ${w}`).join('\n'))).toBe(words);
    expect(normalizeWords(list.map((w, i) => `${i + 1}) ${w}`).join(' '))).toBe(words);
    expect(normalizeWords(list.map((w, i) => `${i + 1}.${w}`).join(' '))).toBe(words);
    expect(normalizeWords(list.map((w, i) => `${i + 1}\t${w}`).join('\n'))).toBe(words);
  });

  it('leaves out commas', () => {
    expect(normalizeWords(list.join(', '))).toBe(words);
  });

  it('still wants 24 real words', () => {
    expect(() => normalizeWords(list.slice(1).join(' '))).toThrow(/24 words/);
  });
});
