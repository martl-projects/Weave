import { execFile } from 'node:child_process';
import { existsSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { dialog, type MenuItemConstructorOptions } from 'electron';

/*
 * The `weave` command on macOS, like VS Code's "Install 'code' command": the
 * packaged app carries a small script in Resources/bin that runs the bundled CLI
 * with the app's own Node (see package.ts), and the app menu links
 * /usr/local/bin/weave to it after asking. macOS asks for a password when
 * /usr/local/bin isn't writable. (Windows: the installer puts the folder on the
 * PATH instead.)
 */

const LINK = '/usr/local/bin/weave';
const SHIM = join(process.resourcesPath ?? '', 'bin', 'weave');

/** Only a packaged app has the script. */
export const hasCommand = (): boolean => existsSync(SHIM);

const linked = (): string | undefined => {
  try {
    return readlinkSync(LINK);
  } catch {
    return undefined;
  }
};

const quote = (s: string) => `'${s.replaceAll("'", `'\\''`)}'`;
const appleScript = (s: string) => `"${s.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

/** Run a shell command, as administrator (macOS asks for the password) when it isn't allowed otherwise. */
async function shell(command: string): Promise<boolean> {
  try {
    await promisify(execFile)('/bin/sh', ['-c', command]);
    return true;
  } catch {
    try {
      await promisify(execFile)('osascript', ['-e', `do shell script ${appleScript(command)} with administrator privileges`]);
      return true;
    } catch (error) {
      if (/-128|User canceled/.test(String((error as Error).message))) return false; // closed the password dialog
      throw error;
    }
  }
}

async function install(): Promise<void> {
  if (linked() === SHIM) {
    await dialog.showMessageBox({ message: "The 'weave' command is already installed.", detail: `${LINK} runs this copy of Weave.` });
    return;
  }
  const replacing = existsSync(LINK) || linked() !== undefined;
  const { response } = await dialog.showMessageBox({
    type: 'question',
    buttons: ['Install', 'Cancel'],
    defaultId: 0,
    cancelId: 1,
    message: "Install the 'weave' command?",
    detail: `This links ${LINK} to Weave, so terminals and AI agents can run weave.${replacing ? ` It replaces the ${LINK} that is there now.` : ''} macOS may ask for your password.`,
  });
  if (response !== 0) return;
  try {
    if (!(await shell(`mkdir -p /usr/local/bin && ln -sfn ${quote(SHIM)} ${LINK}`))) return;
    await dialog.showMessageBox({ message: "The 'weave' command is installed.", detail: 'Open a new terminal and try: weave --help' });
  } catch (error) {
    dialog.showErrorBox("Couldn't install the 'weave' command", (error as Error).message);
  }
}

async function uninstall(): Promise<void> {
  if (linked() !== SHIM) {
    await dialog.showMessageBox({ message: "The 'weave' command isn't installed from this copy of Weave.", detail: `${LINK} is left as it is.` });
    return;
  }
  try {
    if (await shell(`rm -f ${LINK}`)) await dialog.showMessageBox({ message: "The 'weave' command is uninstalled." });
  } catch (error) {
    dialog.showErrorBox("Couldn't uninstall the 'weave' command", (error as Error).message);
  }
}

/** The macOS menu bar: the usual menus, with the command in the app menu. */
export const macMenu = (): MenuItemConstructorOptions[] => [
  {
    role: 'appMenu',
    submenu: [
      { role: 'about' },
      { type: 'separator' },
      { label: "Install 'weave' Command…", click: () => void install() },
      { label: "Uninstall 'weave' Command", click: () => void uninstall() },
      { type: 'separator' },
      { role: 'services' },
      { type: 'separator' },
      { role: 'hide' },
      { role: 'hideOthers' },
      { role: 'unhide' },
      { type: 'separator' },
      { role: 'quit' },
    ],
  },
  { role: 'fileMenu' },
  { role: 'editMenu' },
  { role: 'viewMenu' },
  { role: 'windowMenu' },
];
