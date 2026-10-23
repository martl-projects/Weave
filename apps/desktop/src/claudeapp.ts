import { spawn } from 'node:child_process';
import { clipboard, shell } from 'electron';

/*
 * The Claude desktop app, from the outside: open a Claude Code session with a
 * message ready in its text box. Never sends: you press Enter.
 *
 * A new session takes the message in its link (claude://code/new?folder=…&q=…).
 * An existing one's link (claude://claude.ai/epitaxy/<id>) takes none, so on
 * Windows the message goes through the clipboard: Weave puts it there, opens
 * the session, waits until the Claude app is in front, pastes, and puts your
 * clipboard back. Elsewhere the message is left on the clipboard to paste.
 * None of these links are documented by Anthropic; they're the app's own.
 */

/** How the message got there: pasted for you, or left on the clipboard for you to paste. */
export type Delivered = 'pasted' | 'clipboard' | 'link';

/** Waits for the Claude app to come to the front, then presses Ctrl+V once. Nothing else. */
const PASTE_WHEN_CLAUDE_IS_IN_FRONT = `
Add-Type @"
using System; using System.Runtime.InteropServices;
public class WeavePaste {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint p);
  [DllImport("user32.dll")] public static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
}
"@
$deadline = (Get-Date).AddSeconds(8)
do {
  Start-Sleep -Milliseconds 200
  $id = 0; [void][WeavePaste]::GetWindowThreadProcessId([WeavePaste]::GetForegroundWindow(), [ref]$id)
  $front = (Get-Process -Id $id -ErrorAction SilentlyContinue).ProcessName
} until ($front -eq 'claude' -or (Get-Date) -gt $deadline)
if ($front -ne 'claude') { exit 2 }
# The session view puts the focus in its text box once it has loaded.
Start-Sleep -Milliseconds 1200
[WeavePaste]::keybd_event(0x11, 0, 0, [UIntPtr]::Zero); [WeavePaste]::keybd_event(0x56, 0, 0, [UIntPtr]::Zero)
[WeavePaste]::keybd_event(0x56, 0, 2, [UIntPtr]::Zero); [WeavePaste]::keybd_event(0x11, 0, 2, [UIntPtr]::Zero)
`;

function pasteWhenClaudeIsInFront(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PASTE_WHEN_CLAUDE_IS_IN_FRONT], { windowsHide: true, stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

/** Open an existing session (the Claude app's own id, local_…) with `text` in its text box. */
export async function openSession(host: string, text: string): Promise<Delivered> {
  if (!/^local_[\w-]+$/.test(host)) throw new Error('not a Claude app session');
  const previous = await clipboard.readText();
  await clipboard.writeText(text);
  await shell.openExternal(`claude://claude.ai/epitaxy/${host}`);
  if (process.platform !== 'win32') return 'clipboard';
  if (!(await pasteWhenClaudeIsInFront())) return 'clipboard'; // left there for you to paste
  // Put back what you had copied (text only), once the paste has happened.
  setTimeout(() => clipboard.writeText(previous), 500);
  return 'pasted';
}

/** Start a new Claude Code session in `folder` with `text` in its text box. */
export async function newSession(folder: string, text: string): Promise<Delivered> {
  const url = `claude://code/new?folder=${encodeURIComponent(folder)}&q=${encodeURIComponent(text.slice(0, 4000))}`;
  await shell.openExternal(url);
  return 'link';
}
