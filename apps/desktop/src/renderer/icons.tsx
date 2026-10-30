// Icons. Most are from SerenityOS (BSD-2-Clause, see serenity/LICENSE): colorful
// 16×16 and 32×32 bitmaps in a late-90s style. Where SerenityOS has nothing that
// fits, or the icon must take a color (the vote arrows), pixelarticons (MIT)
// fills in, as SVG tinted with currentColor.
import arrowDown from 'pixelarticons/svg/arrow-big-down.svg';
import arrowUp from 'pixelarticons/svg/arrow-big-up.svg';
import bulletList from 'pixelarticons/svg/bulletlist.svg';
import code from 'pixelarticons/svg/code.svg';
import eye from 'pixelarticons/svg/eye.svg';
import github from 'pixelarticons/svg/github.svg';
import heading2 from 'pixelarticons/svg/heading-2.svg';
import heading3 from 'pixelarticons/svg/heading-3.svg';
import image from 'pixelarticons/svg/image.svg';
import link from 'pixelarticons/svg/link.svg';
import quote from 'pixelarticons/svg/quote-text-inline.svg';
import redo from 'pixelarticons/svg/redo.svg';
import undo from 'pixelarticons/svg/undo.svg';
import clock from 'pixelarticons/svg/clock.svg';
import fire from 'pixelarticons/svg/fire.svg';
import hash from 'pixelarticons/svg/hash.svg';
import lock from 'pixelarticons/svg/lock.svg';
import message from 'pixelarticons/svg/message.svg';
import trash from 'pixelarticons/svg/trash.svg';
import trophy from 'pixelarticons/svg/trophy.svg';
import database from 'pixelarticons/svg/database.svg';
import download from 'pixelarticons/svg/download.svg';
import folder from 'pixelarticons/svg/folder.svg';
import globe from 'pixelarticons/svg/globe.svg';
import plug from 'pixelarticons/svg/plug.svg';
import store from 'pixelarticons/svg/store.svg';
import mail16 from './serenity/16x16/app-mail.png';
import projects16 from './serenity/16x16/app-hack-studio.png';
import presenter16 from './serenity/16x16/app-presenter.png';
import editor16 from './serenity/16x16/app-text-editor.png';
import people16 from './serenity/16x16/app-user-settings.png';
import bulb16 from './serenity/16x16/app-welcome.png';
import bookmark16 from './serenity/16x16/bookmark-filled.png';
import certificate16 from './serenity/16x16/certificate.png';
import copy16 from './serenity/16x16/edit-copy.png';
import emoji16 from './serenity/16x16/emoji.png';
import export16 from './serenity/16x16/file-export.png';
import text16 from './serenity/16x16/filetype-text.png';
import find16 from './serenity/16x16/find.png';
import home16 from './serenity/16x16/go-home.png';
import priority16 from './serenity/16x16/highpriority.png';
import myspace16 from './serenity/16x16/home-directory.png';
import internet16 from './serenity/16x16/internet.png';
import ladybug16 from './serenity/16x16/ladybug.png';
import new16 from './serenity/16x16/new.png';
import settings16 from './serenity/16x16/settings.png';
import userPlus16 from './serenity/16x16/user-plus.png';
import close16 from './serenity/16x16/window-close.png';
import pin16 from './serenity/16x16/window-pin.png';
import mail32 from './serenity/32x32/app-mail.png';
import settings32 from './serenity/32x32/app-settings.png';
import editor32 from './serenity/32x32/app-text-editor.png';
import people32 from './serenity/32x32/app-user-settings.png';
import home32 from './serenity/32x32/home.png';
import myspace32 from './serenity/32x32/home-directory.png';
import error32 from './serenity/32x32/msgbox-error.png';
import info32 from './serenity/32x32/msgbox-information.png';
import warning32 from './serenity/32x32/msgbox-warning.png';
import userPlus32 from './serenity/32x32/user-plus.png';

/** Bitmaps: a 16×16 and, where SerenityOS has one, a 32×32 for big buttons and message boxes. */
const BITMAPS = {
  home: [home16, home32],
  bookmark: [bookmark16],
  inbox: [mail16, mail32],
  users: [people16, people32],
  user: [myspace16, myspace32],
  pencil: [editor16, editor32],
  plus: [new16],
  userPlus: [userPlus16, userPlus32],
  community: [internet16],
  zap: [projects16],
  megaphone: [presenter16],
  lightbulb: [bulb16],
  bug: [ladybug16],
  flag: [certificate16],
  notes: [text16],
  gear: [settings16, settings32],
  search: [find16],
  copy: [copy16],
  mapPin: [pin16],
  share: [export16],
  star: [priority16],
  externalLink: [internet16],
  emoji: [emoji16],
  close: [close16],
  info: [info32, info32],
  warning: [warning32, warning32],
  error: [error32, error32],
} satisfies Record<string, [string, string?]>;

/** Tintable SVGs, for what SerenityOS doesn't cover. */
const VECTORS = { arrowDown, arrowUp, bulletList, clock, code, database, download, eye, fire, folder, github, globe, hash, heading2, heading3, image, link, lock, message, plug, quote, redo, store, trash, trophy, undo };

export type IconName = keyof typeof BITMAPS | keyof typeof VECTORS;

/** Whether a name (from a manifest, say) is one of these icons. */
export const isIconName = (name: unknown): name is IconName => typeof name === 'string' && (Object.hasOwn(BITMAPS, name) || Object.hasOwn(VECTORS, name));

export function Icon({ name, size = 16, className = '' }: { name: IconName; size?: number; className?: string }) {
  if (name in BITMAPS) {
    const [small, big] = BITMAPS[name as keyof typeof BITMAPS] as [string, string?];
    return <img className={`icon bitmap ${className}`} src={size > 16 && big ? big : small} width={size} height={size} alt="" aria-hidden="true" />;
  }
  return <span className={`icon ${className}`} style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: VECTORS[name as keyof typeof VECTORS] }} />;
}
