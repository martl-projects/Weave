/* node:os for a browser: there is no computer to speak of. */

export const homedir = (): string => '/';
export const tmpdir = (): string => '/tmp';
export const hostname = (): string => 'browser';
export const platform = (): string => 'browser';
export const uptime = (): number => performance.now() / 1000;
export const userInfo = (): { username: string } => ({ username: 'web' });
export const EOL = '\n';
