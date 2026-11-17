// jco's bindgen as jco-transpile ships it (its package doesn't export the file, so by its path).
import { $init, generate } from '../../../node_modules/@bytecodealliance/jco-transpile/vendor/js-component-bindgen-component.js';

/*
 * A release's pure component (a board's lens, a chat's widget), made runnable in a page: what jco transpile does on a
 * computer, with jco's own bindgen (a component itself, run here as it runs there). Loaded by a service's Worker only
 * when it starts one of those (service.ts), from /lens-transpile.js, with the bindgen's core modules next to it.
 * Instantiated, never with WASI's shims bound in: the Worker hands it the same imports as Weave's own services.
 */

interface Generated {
  files: Array<[string, Uint8Array]>;
  exports: Array<[string, string]>;
}

/** The component's files: component.js (its glue, `instantiate`) and its core modules, by name. */
export async function transpileComponent(component: Uint8Array): Promise<Map<string, Uint8Array>> {
  await $init;
  const generated = (generate as (component: Uint8Array, options: object) => Generated)(component, {
    name: 'component',
    map: [],
    instantiation: { tag: 'async' },
    noTypescript: true,
    noNodejsCompat: true,
    tlaCompat: false,
    base64Cutoff: 5000,
    validLiftingOptimization: false,
    tracing: false,
    noComponentErrorWrapping: true,
    noNamespacedExports: false,
    multiMemory: false,
    emitConditionalSuspendingWasm: true,
  });
  const names = generated.exports.map(([name]) => name);
  if (!names.includes('fold') || !names.includes('act')) throw new Error('it isn\'t a client service: it has no fold and act');
  return new Map(generated.files);
}
