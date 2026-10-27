// Entry point without networking or native modules, for processes that only
// talk to a daemon (e.g. the desktop app's main process).
export type * from './backend.ts';
export { ApiClient, connectDaemon, daemonInfo, followDaemon, stopDaemon, type DaemonInfo } from './client.ts';
export { resolveHome, type Home } from './home.ts';
export { HOME_SOURCES, LENS_CSP, PROJECT_STATUSES, RPC_METHODS, TEXT_LIMITS } from './backend.ts';
export { DEFAULT_THEME, FONTS, PATTERNS, type Theme } from './theme.ts';
export type { CompanyAction, CompanyPolicy } from './company.ts';
export type { AuditSinkInput } from './auditsinks.ts';
// Managed settings: node builtins only, safe for the desktop app's main process.
export { machinePolicy, type MachinePolicy } from './machine.ts';
