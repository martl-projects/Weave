import { describe, expect, it } from 'vitest';
import { crc32 } from 'node:zlib';
import { claudeBundle } from '../src/index.ts';

/** The files in a zip of stored entries, read through its central directory, checking each CRC. */
function unzip(data: Buffer): Map<string, Buffer> {
  const end = data.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = data.readUInt16LE(end + 10);
  let at = data.readUInt32LE(end + 16);
  const files = new Map<string, Buffer>();
  for (let i = 0; i < count; i++) {
    expect(data.readUInt32LE(at)).toBe(0x02014b50);
    const crc = data.readUInt32LE(at + 16);
    const size = data.readUInt32LE(at + 20);
    const nameLength = data.readUInt16LE(at + 28);
    const offset = data.readUInt32LE(at + 42);
    const name = data.subarray(at + 46, at + 46 + nameLength).toString('utf8');
    expect(data.readUInt32LE(offset)).toBe(0x04034b50);
    const start = offset + 30 + data.readUInt16LE(offset + 26) + data.readUInt16LE(offset + 28);
    const content = data.subarray(start, start + size);
    expect(crc32(content)).toBe(crc);
    files.set(name, content);
    at += 46 + nameLength + data.readUInt16LE(at + 30) + data.readUInt16LE(at + 32);
  }
  return files;
}

describe('Weave for Claude chat (.mcpb)', () => {
  it('bundles a manifest and a launcher that starts this Weave as the agent', () => {
    const icon = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const files = unzip(claudeBundle({ agent: 'claude', version: '0.3.0', icon, launch: { command: 'C:\\Program Files\\nodejs\\node.exe', args: ['C:\\weave\\main.ts', '--home', 'C:\\Users\\me\\.weave'] } }));
    expect([...files.keys()]).toEqual(['manifest.json', 'server/launch.js', 'icon.png']);
    const manifest = JSON.parse(files.get('manifest.json')!.toString());
    expect(manifest).toMatchObject({
      manifest_version: '0.3',
      name: 'weave',
      version: '0.3.0',
      icon: 'icon.png',
      server: { type: 'node', entry_point: 'server/launch.js', mcp_config: { command: 'node', args: ['${__dirname}/server/launch.js'] } },
    });
    expect(manifest.description).toContain('"claude"');
    const launcher = files.get('server/launch.js')!.toString();
    expect(launcher).toContain(JSON.stringify(['C:\\weave\\main.ts', '--home', 'C:\\Users\\me\\.weave', 'mcp', '--as', 'claude'], null, 2).replace(/\n/g, '\n  '));
    expect(launcher).toContain('process.stdin.pipe(child.stdin)');
    expect(files.get('icon.png')).toEqual(icon);
  });
});
