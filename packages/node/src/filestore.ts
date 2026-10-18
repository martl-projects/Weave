import { appendFileSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MemoryStore, type Did, type LogStore, type WeaveEvent } from '@weave/core';

/**
 * LogStore backed by one JSON-lines file per signing key. Everything is kept
 * in memory as well; files are only appended to, never rewritten.
 */
export class FileStore implements LogStore {
  readonly dir: string;
  #memory = new MemoryStore();

  constructor(dir: string) {
    this.dir = dir;
    mkdirSync(dir, { recursive: true });
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl'))) {
      const lines = readFileSync(join(dir, file), 'utf8').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          this.#memory.append(JSON.parse(line) as WeaveEvent);
        } catch {
          break; // a torn last line after a crash: keep what came before it
        }
      }
    }
  }

  head(signer: Did): WeaveEvent | undefined {
    return this.#memory.head(signer);
  }

  get(signer: Did, seq: number): WeaveEvent | undefined {
    return this.#memory.get(signer, seq);
  }

  range(signer: Did, from: number, to?: number): WeaveEvent[] {
    return this.#memory.range(signer, from, to);
  }

  signers(): Did[] {
    return this.#memory.signers();
  }

  append(event: WeaveEvent): void {
    this.#memory.append(event);
    appendFileSync(join(this.dir, fileName(event.signer)), JSON.stringify(event) + '\n');
  }
}

/** `did:key:z6Mk…` → `z6Mk….jsonl` (colons are not allowed in Windows file names). */
const fileName = (signer: Did): string => `${signer.slice('did:key:'.length)}.jsonl`;
