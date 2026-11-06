/* The components of Weave's own that a page can run, by name (what build.ts wrote). Apart from runtime.ts, which reads files as it loads. */

let served = new Set<string>();

export const useServices = (names: string[]): void => void (served = new Set(names));
export const isServed = (name: string): boolean => served.has(name);
