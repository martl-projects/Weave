import { describe, expect, it } from 'vitest';
import { bytesOf, closeFrame, frame, FrameReader, OP, textOf, upgradeAnswer } from '../src/rooms/wsframes.ts';

/* WebSocket frames, as a website's tab speaks them over a tunnel (src/rooms/wsframes.ts). */

/** A frame as a server sends it: unmasked. */
const serverFrame = (opcode: number, payload: Uint8Array, fin = true): Uint8Array => {
  const head = payload.length < 126 ? [((fin ? 0x80 : 0) | opcode), payload.length] : [((fin ? 0x80 : 0) | opcode), 126, payload.length >> 8, payload.length & 255];
  return Uint8Array.from([...head, ...payload]);
};

describe("a website's WebSocket, frame by frame", () => {
  it('masks what the tab sends, and reads it back whole', () => {
    for (const size of [5, 300, 70_000]) {
      const payload = Uint8Array.from({ length: size }, (_, i) => i % 251);
      const sent = frame(OP.binary, payload);
      expect(sent[1] & 0x80).toBe(0x80);
      const [got] = new FrameReader().push(sent);
      expect(got.opcode).toBe(OP.binary);
      expect(got.payload).toEqual(payload);
    }
  });

  it('puts frames together across chunks, and fragments into one message', () => {
    const reader = new FrameReader();
    const all = Uint8Array.from([...serverFrame(OP.text, bytesOf('hel'), false), ...serverFrame(OP.ping, bytesOf('?')), ...serverFrame(OP.continuation, bytesOf('lo'))]);
    const got = [...reader.push(all.subarray(0, 4)), ...reader.push(all.subarray(4, 9)), ...reader.push(all.subarray(9))];
    expect(got.map((g) => [g.opcode, textOf(g.payload)])).toEqual([
      [OP.ping, '?'],
      [OP.text, 'hello'],
    ]);
  });

  it('closes with a code and a reason', () => {
    const [got] = new FrameReader().push(closeFrame(4001, 'bye'));
    expect(got.opcode).toBe(OP.close);
    expect((got.payload[0] << 8) | got.payload[1]).toBe(4001);
    expect(textOf(got.payload.subarray(2))).toBe('bye');
  });

  it('reads the answer to an upgrade, and what came after it', () => {
    const answer = bytesOf('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nSec-WebSocket-Protocol: race\r\n\r\n');
    expect(upgradeAnswer(answer.subarray(0, 20))).toBeUndefined();
    const read = upgradeAnswer(Uint8Array.from([...answer, ...serverFrame(OP.text, bytesOf('go'))]))!;
    expect(read.status).toBe(101);
    expect(read.protocol).toBe('race');
    expect(textOf(new FrameReader().push(read.rest)[0].payload)).toBe('go');
  });
});
