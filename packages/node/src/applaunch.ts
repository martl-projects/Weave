import { createHash } from 'node:crypto';

/*
 * Approving what a room's handler runs: a project's release, or a command in a folder. Weave only runs it once the
 * person approved that exact command; the approval is a fingerprint, so a changed release or command asks again.
 */

/** What an approval covers: this program with these arguments, from this release (its event id) or in this folder. */
export const launchFingerprint = (command: string[], where: string): string => createHash('sha256').update(JSON.stringify({ command, folder: where })).digest('base64url');
