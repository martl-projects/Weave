// Files pasted into a chat (Ctrl+V): what the clipboard holds, named when it comes without a name.
/**
 * The file on a clipboard, if it holds one: the first (a message carries one). A picture straight from a screenshot
 * comes as "image.png", or nameless: it's named for when it was taken.
 */
export function pastedFile(clipboard: Pick<DataTransfer, 'files' | 'items'>, now = new Date()): File | undefined {
  const file = clipboard.files[0] ?? [...clipboard.items].find((i) => i.kind === 'file')?.getAsFile() ?? undefined;
  if (!file) return undefined;
  if (file.name && file.name !== 'image.png') return file;
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') || 'png';
  return new File([file], `screenshot-${stamp}.${ext}`, { type: file.type || 'image/png', lastModified: now.getTime() });
}
