/* node:url for a browser: nothing lives at a file address here. */

export const fileURLToPath = (url: string | URL): string => new URL(url).pathname;
export const pathToFileURL = (path: string): URL => new URL(`file://${path}`);
