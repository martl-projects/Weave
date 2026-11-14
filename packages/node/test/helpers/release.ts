import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseManifest, type AppManifest, type Json } from '@weave/core';
import type { ServiceInfo, WeaveNode } from '../../src/index.ts';
import { digestOf } from '../../src/shipped.ts';
import { packFolder, storeFiles } from '../../src/weavereleases.ts';
import { buildComponent } from './components.ts';

/*
 * Services in tests come from releases, as everywhere: a folder (a weave.app.json and the component it names) is
 * released from Weave in a project, and the service is added from that release. Weave releases (the shipped
 * service) publishes it in weave-releases.test.ts; here the maintainer publishes exactly what it would (the same
 * blobs and manifest), so a test doesn't need it running.
 */

const WEAVE_RELEASES = join(import.meta.dirname, '..', '..', '..', 'shipped', 'weave-releases');

let shipped: string | undefined;

/** A folder of shipped services with Weave releases in it, as packages/shipped/build.ts makes it. */
export async function shippedWeaveReleases(): Promise<string> {
  if (shipped) return shipped;
  const component = await buildComponent(join(WEAVE_RELEASES, 'src', 'service.js'), 'service');
  const dir = mkdtempSync(join(tmpdir(), 'weave-shipped-releases-'));
  copyFileSync(component, join(dir, 'weave-releases.wasm'));
  writeFileSync(join(dir, 'shipped.json'), JSON.stringify({ 'weave-releases': { component: 'weave-releases.wasm', digest: digestOf(component), manifest: JSON.parse(readFileSync(join(WEAVE_RELEASES, 'weave.app.json'), 'utf8')) } }));
  shipped = dir;
  return dir;
}

/** A folder to release: its weave.app.json, its component (as wasm.component names it), and its site if it has one. */
export function serviceFolder(manifest: Record<string, unknown>, component: string, site?: string): string {
  const folder = mkdtempSync(join(tmpdir(), 'weave-service-folder-'));
  const wasm = { component: 'service.wasm', ...((manifest.wasm as Record<string, unknown> | undefined) ?? {}), ...(site ? { site: 'site' } : {}) } as { component: string; site?: string };
  writeFileSync(join(folder, 'weave.app.json'), JSON.stringify({ ...manifest, wasm }, null, 2));
  copyFileSync(component, join(folder, wasm.component));
  if (site) cpSync(site, join(folder, wasm.site!), { recursive: true });
  return folder;
}

/**
 * Release a folder from Weave in a project, as its maintainer: its files kept as blobs on this node, and the release
 * published as Weave releases publishes it.
 */
export async function releaseFolder(node: WeaveNode, input: { project: string; tag: string; folder: string }): Promise<AppManifest> {
  const packed = packFolder(input.folder);
  const project = (await node.spaces()).find((s) => s.id === input.project || s.name === input.project);
  if (!project) throw new Error(`no project ${input.project}`);
  const assets = storeFiles(packed.files, (data) => void node.blobs.put(data));
  const { install: _install, ...rest } = packed.manifest;
  const manifest = parseManifest({ ...rest, install: { tag: input.tag, source: { provider: 'weave', ref: project.id }, assets } });
  await node.publish({ kind: 'weave.app', body: manifest as unknown as Json, space: project.id });
  return manifest;
}

/** Copy the blobs one node keeps to another (nodes in tests aren't connected): what a member would fetch. */
export function shareBlobs(from: WeaveNode, to: WeaveNode, manifest: AppManifest): void {
  for (const asset of Object.values(manifest.install?.assets ?? {})) for (const part of asset.parts ?? []) to.blobs.put(from.blobs.get(part.hash)!);
}

let releases = 0;

/** A file that stands in for a component, for a service that never runs in its test (it uses its gate directly). */
export function placeholderComponent(): string {
  const file = join(mkdtempSync(join(tmpdir(), 'weave-placeholder-')), 'service.wasm');
  writeFileSync(file, 'not run in this test');
  return file;
}

/** What a release of a test's service is made of: its manifest, and its component (built from a test's JavaScript, or a file). */
export interface TestRelease {
  manifest: Record<string, unknown>;
  /** The component's file, or (source) a test's JavaScript built for its world. */
  component?: string;
  source?: string;
  world?: 'service' | 'website';
  http?: boolean;
  site?: string;
  /** The project it's released in (made if the node has none of that name; default "Releases"). */
  project?: string;
  tag?: string;
}

/** Release a test's service from Weave in a project of the node's (made if needed): where it is, to add it from. */
export async function releaseService(node: WeaveNode, input: TestRelease): Promise<{ project: string; tag: string; manifest: AppManifest }> {
  const component = input.component ?? (await buildComponent(input.source!, input.world ?? (input.site ? 'website' : 'service'), input.http ? { http: true } : {}));
  const project = input.project ?? 'Releases';
  if (!(await node.spaces()).some((s) => s.kind === 'project' && (s.name === project || s.id === project))) await node.createProject({ name: project });
  const tag = input.tag ?? `dev-${++releases}`;
  const manifest = await releaseFolder(node, { project, tag, folder: serviceFolder(input.manifest, component, input.site) });
  return { project, tag, manifest };
}

/** A service of a node's own, from a release: released from Weave in a project of the node's, then added from it and approved. */
export async function serviceFromRelease(node: WeaveNode, input: TestRelease & { name?: string; spaces?: string[]; settings?: Record<string, string>; settingsIn?: string; description?: string; node?: string }): Promise<ServiceInfo> {
  const { project, tag } = await releaseService(node, input);
  return node.addService({ ...(input.name ? { name: input.name } : {}), ...(input.description ? { description: input.description } : {}), artifact: { project, tag }, spaces: input.spaces ?? [], approve: true, settings: input.settings ?? {}, ...(input.settingsIn ? { settingsIn: input.settingsIn } : {}), ...(input.node ? { node: input.node } : {}) });
}

/** An empty folder of a test's own, for files it makes. */
export function folderWith(files: Record<string, string | Uint8Array>): string {
  const folder = mkdtempSync(join(tmpdir(), 'weave-release-files-'));
  for (const [path, body] of Object.entries(files)) {
    mkdirSync(join(folder, path, '..'), { recursive: true });
    writeFileSync(join(folder, path), body);
  }
  return folder;
}
