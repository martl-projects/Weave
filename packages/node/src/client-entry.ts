// Entry point without networking or native modules, for processes that only
// talk to a daemon (e.g. the desktop app's main process).
export type * from './backend.ts';
export { ApiClient, connectDaemon, type DaemonInfo } from './client.ts';
export { resolveHome, type Home } from './home.ts';
export { HOME_SOURCES, PROJECT_STATUSES, RPC_METHODS } from './backend.ts';
export { DEFAULT_THEME, FONTS, PATTERNS, type Theme } from './theme.ts';
