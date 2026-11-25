import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The frame page (lens-frame.html) puts a script of its own before a view's: what goes wrong in the view is said to
 * Weave, and its console and what held it up too where its person has the browser write that down. Run here as the
 * frame runs it, against just enough of a page.
 */

/** The script the frame page puts first into a view's page, for a view asked with or without `log`. */
function firstScript(log: boolean): string {
  const html = readFileSync(join(import.meta.dirname, '..', 'src', 'lens-frame.html'), 'utf8');
  const script = /<script>([\s\S]*)<\/script>/.exec(html)![1];
  const scripts: Array<{ textContent: string }> = [];
  let onMessage: (event: unknown) => void = () => {};
  const doc = {
    querySelectorAll: () => [],
    createElement: () => ({ textContent: '' }),
    head: { firstChild: null, insertBefore: (el: { textContent: string }) => scripts.push(el) },
    body: { appendChild: () => {} },
    documentElement: { outerHTML: '' },
  };
  const parent = { postMessage: () => {} };
  const window = { parent, addEventListener: (_: string, listener: (event: unknown) => void) => (onMessage = listener) };
  const document = { open: () => {}, write: () => {}, close: () => {}, body: {} };
  new Function('window', 'document', 'DOMParser', 'location', script)(window, document, class { parseFromString() { return doc; } }, { search: '' });
  onMessage({ source: parent, data: { weave: 'files', files: [{ path: 'index.html', type: 'text/html', data: btoa('<p>view</p>') }], ...(log ? { log: true } : {}) } });
  return scripts[0].textContent;
}

/** Run that script as a view's page would, and give what it told Weave, and the page's listeners. */
function run(script: string) {
  const told: Array<{ weave: string; level: string; text: string }> = [];
  const listeners = new Map<string, (event: unknown) => void>();
  const silent = (..._said: unknown[]): void => {};
  const quiet = { log: silent, info: silent, warn: silent, error: silent };
  let observed: ((list: { getEntries(): Array<{ duration: number; startTime: number }> }) => void) | undefined;
  class Observer {
    constructor(callback: typeof observed) {
      observed = callback;
    }
    observe() {}
  }
  // Just enough of a page: canvases made and found, an OffscreenCanvas, bitmaps, pictures, and the timer that counts.
  const onPage: Array<{ width: number; height: number; getContext(): void }> = [];
  const pictures: Array<{ complete: boolean; naturalWidth: number; naturalHeight: number }> = [];
  const document = {
    createElement: (tag: string) => (tag === 'canvas' ? { width: 300, height: 150, getContext() {} } : {}),
    querySelectorAll: () => onPage,
    images: pictures,
  };
  class Offscreen {
    width: number;
    height: number;
    constructor(width: number, height: number) {
      this.width = width;
      this.height = height;
    }
    getContext() {}
  }
  const window = { OffscreenCanvas: Offscreen, createImageBitmap: async (_from: unknown, width: number, height: number) => ({ width, height, close() {} }) };
  let count = () => {};
  new Function('parent', 'addEventListener', 'console', 'PerformanceObserver', 'performance', 'document', 'window', 'setInterval', script)(
    { postMessage: (m: (typeof told)[number]) => told.push(m) },
    (type: string, listener: (event: unknown) => void) => listeners.set(type, listener),
    quiet,
    Observer,
    { now: () => 1234 },
    document,
    window,
    (tick: () => void) => (count = tick),
  );
  return { told, listeners, console: quiet, document, window, onPage, pictures, count: () => count(), tasks: (entries: Array<{ duration: number; startTime: number }>) => observed?.({ getEntries: () => entries }) };
}

describe("what a view's frame tells Weave", () => {
  it('tells of what goes wrong in a view, and nothing of its console unless asked', () => {
    const view = run(firstScript(false));
    view.listeners.get('error')!({ message: 'x is not defined', filename: 'blob:view.js', lineno: 3, colno: 7 });
    view.listeners.get('unhandledrejection')!({ reason: new Error('no picture') });
    view.console.warn('said in the view');
    expect(view.told.map((m) => m.level)).toEqual(['error', 'error']);
    expect(view.told[0].text).toBe('x is not defined at blob:view.js:3:7');
    expect(view.told[1].text).toContain('unhandled rejection: Error: no picture');
    expect(view.listeners.has('load')).toBe(false);
  });

  it("tells of a view's console, what held it up and when it loaded, where asked: a few hundred lines at most", () => {
    const view = run(firstScript(true));
    view.console.log('page', 3, { drawn: true });
    view.console.error(new Error('broken'));
    view.tasks([
      { duration: 120, startTime: 50 },
      { duration: 480.4, startTime: 900.2 },
    ]);
    view.listeners.get('load')!({});
    expect(view.told.map((m) => [m.weave, m.level])).toEqual([
      ['log', 'info'],
      ['log', 'error'],
      ['log', 'warn'],
      ['log', 'info'],
    ]);
    expect(view.told[0].text).toBe('page 3 {"drawn":true}');
    expect(view.told[1].text).toContain('Error: broken');
    expect(view.told[2].text).toBe('the view was held up for 480 ms, 900 ms after it opened');
    expect(view.told[3].text).toBe('the view loaded 1234 ms after it opened');
    for (let i = 0; i < 500; i++) view.console.info(`frame ${i}`);
    expect(view.told).toHaveLength(300);
    // What goes wrong is still told.
    view.listeners.get('error')!({ message: 'late', filename: '', lineno: 1, colno: 1 });
    expect(view.told.at(-1)!.text).toContain('late');
  });

  it('tells how many pixels a view holds: canvases on the page and off it, bitmaps, pictures; again when that changed', async () => {
    const view = run(firstScript(true));
    view.count();
    expect(view.told.at(-1)!.text).toBe('the view holds about 0 MB of pixels: 0 canvases 0 MB, 0 bitmaps 0 MB, 0 pictures 0 MB');
    // Held by the view, as a view holds them: a canvas it made and kept off the page, one on the page, an
    // OffscreenCanvas, a bitmap, a picture.
    const kept = view.document.createElement('canvas') as { width: number; height: number };
    kept.width = 2048;
    kept.height = 2048;
    view.onPage.push({ width: 1170, height: 2532, getContext() {} });
    const off = new view.window.OffscreenCanvas(1000, 1000);
    const bitmap = await view.window.createImageBitmap(null, 500, 500);
    view.pictures.push({ complete: true, naturalWidth: 3000, naturalHeight: 2000 }, { complete: false, naturalWidth: 9000, naturalHeight: 9000 });
    view.count();
    expect(view.told.at(-1)!.text).toBe('the view holds about 58 MB of pixels: 3 canvases 33 MB (largest 2048x2048), 1 bitmaps 1 MB, 1 pictures 24 MB');
    // Nothing changed much: nothing is said.
    const said = view.told.length;
    view.count();
    off.width = 1100;
    view.count();
    expect(view.told).toHaveLength(said);
    kept.width = 4096;
    view.count();
    expect(view.told.at(-1)!.text).toContain('the view holds about 75 MB of pixels');
    expect(bitmap.width).toBe(500);
  });

  it("leaves a view's canvases alone unless asked", () => {
    const view = run(firstScript(false));
    const made = view.document.createElement;
    view.count();
    expect(view.document.createElement).toBe(made);
    expect(view.told).toEqual([]);
  });
});
