// Pixel icons from pixelarticons (MIT), bundled as SVG text and tinted with currentColor.
import arrowDown from 'pixelarticons/svg/arrow-big-down.svg';
import arrowUp from 'pixelarticons/svg/arrow-big-up.svg';
import bookmark from 'pixelarticons/svg/bookmark.svg';
import bug from 'pixelarticons/svg/bug.svg';
import check from 'pixelarticons/svg/check.svg';
import chevronDown from 'pixelarticons/svg/chevron-down.svg';
import chevronRight from 'pixelarticons/svg/chevron-right.svg';
import clock from 'pixelarticons/svg/clock.svg';
import close from 'pixelarticons/svg/close.svg';
import community from 'pixelarticons/svg/building-community.svg';
import copy from 'pixelarticons/svg/copy.svg';
import earth from 'pixelarticons/svg/earth.svg';
import externalLink from 'pixelarticons/svg/external-link.svg';
import fire from 'pixelarticons/svg/fire.svg';
import flag from 'pixelarticons/svg/flag.svg';
import gear from 'pixelarticons/svg/gear.svg';
import hash from 'pixelarticons/svg/hash.svg';
import home from 'pixelarticons/svg/home.svg';
import inbox from 'pixelarticons/svg/inbox.svg';
import lightbulb from 'pixelarticons/svg/lightbulb.svg';
import link from 'pixelarticons/svg/link.svg';
import lock from 'pixelarticons/svg/lock.svg';
import mail from 'pixelarticons/svg/mail.svg';
import mapPin from 'pixelarticons/svg/map-pin.svg';
import megaphone from 'pixelarticons/svg/megaphone.svg';
import message from 'pixelarticons/svg/message.svg';
import notes from 'pixelarticons/svg/notes.svg';
import pencil from 'pixelarticons/svg/pencil.svg';
import plus from 'pixelarticons/svg/plus.svg';
import search from 'pixelarticons/svg/search.svg';
import share from 'pixelarticons/svg/share.svg';
import star from 'pixelarticons/svg/star.svg';
import trophy from 'pixelarticons/svg/trophy.svg';
import user from 'pixelarticons/svg/user.svg';
import userPlus from 'pixelarticons/svg/user-plus.svg';
import users from 'pixelarticons/svg/users.svg';
import zap from 'pixelarticons/svg/zap.svg';

const ICONS = {
  arrowDown,
  arrowUp,
  bookmark,
  bug,
  check,
  chevronDown,
  chevronRight,
  clock,
  close,
  community,
  copy,
  earth,
  externalLink,
  fire,
  flag,
  gear,
  hash,
  home,
  inbox,
  lightbulb,
  link,
  lock,
  mail,
  mapPin,
  megaphone,
  message,
  notes,
  pencil,
  plus,
  search,
  share,
  star,
  trophy,
  user,
  userPlus,
  users,
  zap,
};

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 16, className = '' }: { name: IconName; size?: number; className?: string }) {
  return <span className={`icon ${className}`} style={{ width: size, height: size }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICONS[name] }} />;
}
