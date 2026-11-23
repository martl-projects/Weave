/*
 * Full screen, as Weave means it: a lens, a mini-app or a website fills Weave's own window, inside its border and below
 * its title bar, not the whole screen. Maximized, Weave's window is the screen, and what fills it is too; restored, it
 * follows the window's size. On a phone's width the window is the screen already, so it is laid over all of it.
 *
 * Focus (a newcomer's first steps, or a quick start opened as an app of its own): what Weave has around the place a link
 * leads to folds away, the places and the members to their strips and the toolbar and status bar out of sight, and a
 * lens there starts filling the window. Leaving that place for another ends it.
 */

/** The phone's width (phonechrome.ts): Weave's window is the whole screen there. */
const PHONE = '(max-width: 700px)';

/**
 * Lay `el` over Weave's window (its class `lens-full`, and `lens-window` with its place and size while the window isn't
 * the screen). Returns how to take it back.
 */
export function fillWindow(el: HTMLElement): () => void {
  el.classList.add('lens-full');
  document.documentElement.classList.add('lens-full-on');
  const win = document.querySelector<HTMLElement>('.app-window');
  const place = () => {
    if (!win || matchMedia(PHONE).matches) {
      el.classList.remove('lens-window');
      return;
    }
    // Inside its border and its padding (Windows 95 draws the border as a shadow inside the padding).
    const box = win.getBoundingClientRect();
    const pad = getComputedStyle(win);
    const left = box.left + win.clientLeft + parseFloat(pad.paddingLeft);
    const right = box.left + win.clientLeft + win.clientWidth - parseFloat(pad.paddingRight);
    const bottom = box.top + win.clientTop + win.clientHeight - parseFloat(pad.paddingBottom);
    const title = win.querySelector('.app-title')?.getBoundingClientRect();
    const top = title && title.height > 0 ? title.bottom : box.top + win.clientTop + parseFloat(pad.paddingTop);
    el.classList.add('lens-window');
    el.style.setProperty('--fill-top', `${Math.round(top)}px`);
    el.style.setProperty('--fill-left', `${Math.round(left)}px`);
    el.style.setProperty('--fill-width', `${Math.max(0, Math.round(right - left))}px`);
    el.style.setProperty('--fill-height', `${Math.max(0, Math.round(bottom - top))}px`);
  };
  place();
  const watch = typeof ResizeObserver === 'function' && win ? new ResizeObserver(place) : undefined;
  if (win) watch?.observe(win);
  window.addEventListener('resize', place);
  return () => {
    watch?.disconnect();
    window.removeEventListener('resize', place);
    el.classList.remove('lens-full', 'lens-window');
    for (const v of ['--fill-top', '--fill-left', '--fill-width', '--fill-height']) el.style.removeProperty(v);
    if (!document.querySelector('.lens-full')) document.documentElement.classList.remove('lens-full-on');
  };
}

// ---------------------------------------------------------------- focus

/** The space a focus is on, while it lasts. */
let focused: string | undefined;
/** A lens to start filling the window: the space and board it is on, until that board shows. */
let lensWanted: { space: string; board: string } | undefined;
const FOCUS = 'weave-focus';

/** The space in focus now, if any. */
export const focusedSpace = (): string | undefined => focused;

/** Focus on a space (and, if the link leads to a board, start its lens filling the window). */
export function focusOn(space: string, board?: string): void {
  focused = space;
  lensWanted = board ? { space, board } : undefined;
  dispatchEvent(new CustomEvent(FOCUS));
}

/** End the focus: everything around comes back. */
export function endFocus(): void {
  if (!focused) return;
  focused = undefined;
  lensWanted = undefined;
  dispatchEvent(new CustomEvent(FOCUS));
}

/** Whether this board's lens is to start filling the window; asked once, when it shows. */
export function takeLensFull(space: string, board: string): boolean {
  if (lensWanted?.space !== space || lensWanted.board !== board) return false;
  lensWanted = undefined;
  return true;
}

/** Listen for the focus starting or ending. */
export function onFocus(changed: () => void): () => void {
  addEventListener(FOCUS, changed);
  return () => removeEventListener(FOCUS, changed);
}
