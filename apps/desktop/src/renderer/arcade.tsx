import { useEffect, useRef, useSyncExternalStore } from 'react';
import { CELL, STEPS_PER_SECOND, Surface } from './well.ts';

/*
 * The Arcade look's live effects:
 * - a glow that follows the mouse (the --mx/--my variables arcade.css paints with)
 *   and little tetromino-colored blocks that drop from the cursor and fade out;
 * - a well of tetrominoes at the bottom of the side panels, nearly black at rest,
 *   where moving the mouse sends ripples of color through the pieces.
 * Only while the Arcade look is on; no falling blocks or waves when the system asks for less motion.
 */

const COLORS = ['#00e5ff', '#ffd400', '#b65cff', '#39ff6a', '#ff3b5c', '#2b55e6', '#ff9a1a'];
const quiet = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Whether the Arcade look is on, following the View menu. */
function subscribeSkin(listener: () => void): () => void {
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-skin'] });
  return () => observer.disconnect();
}
export const useArcade = () => useSyncExternalStore(subscribeSkin, () => document.documentElement.dataset.skin === 'arcade');

// ---------------------------------------------------------------- glow and falling blocks under the mouse

const SIZE = 8;
const MAX = 90;

interface Falling {
  x: number;
  y: number;
  vy: number;
  life: number;
  color: string;
}

/** Draw a block like the game's: its color, lit top-left, shaded bottom-right. */
function block(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string, edge = 2): void {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, size, size);
  ctx.fillStyle = '#ffffff80';
  ctx.fillRect(x, y, size, edge);
  ctx.fillRect(x, y, edge, size);
  ctx.fillStyle = '#00000080';
  ctx.fillRect(x, y + size - edge, size, edge);
  ctx.fillRect(x + size - edge, y, edge, size);
}

export function startArcadeEffects(): void {
  const root = document.documentElement;
  let canvas: HTMLCanvasElement | undefined;
  let blocks: Falling[] = [];
  let frame = 0;
  let last = 0;

  const draw = () => {
    frame = 0;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    blocks = blocks.filter((b) => b.life > 0 && b.y < canvas!.height);
    for (const b of blocks) {
      b.vy += 0.35;
      b.y += b.vy;
      b.life -= 1;
      ctx.globalAlpha = Math.min(1, b.life / 30);
      block(ctx, Math.round(b.x / SIZE) * SIZE, Math.round(b.y / SIZE) * SIZE, SIZE, b.color);
    }
    ctx.globalAlpha = 1;
    if (blocks.length) frame = requestAnimationFrame(draw);
  };

  const resize = () => {
    if (!canvas) return;
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  };

  const onMove = (e: PointerEvent) => {
    root.style.setProperty('--mx', `${e.clientX}px`);
    root.style.setProperty('--my', `${e.clientY}px`);
    if (!canvas || quiet() || e.timeStamp - last < 45) return;
    last = e.timeStamp;
    if (blocks.length < MAX) blocks.push({ x: e.clientX - SIZE / 2, y: e.clientY + 6, vy: Math.random() * 1.5, life: 45 + Math.random() * 25, color: COLORS[Math.floor(Math.random() * COLORS.length)] });
    if (!frame) frame = requestAnimationFrame(draw);
  };

  const sync = () => {
    const on = root.dataset.skin === 'arcade';
    if (on && !canvas) {
      canvas = document.createElement('canvas');
      canvas.className = 'arcade-blocks';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.append(canvas);
      resize();
      window.addEventListener('pointermove', onMove, { passive: true });
      window.addEventListener('resize', resize);
    } else if (!on && canvas) {
      canvas.remove();
      canvas = undefined;
      blocks = [];
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
      root.style.removeProperty('--mx');
      root.style.removeProperty('--my');
    }
  };

  subscribeSkin(sync);
  sync();
}

// ---------------------------------------------------------------- the well in the side panels

const KICK = 0.04; // how much a pixel of mouse movement pushes the surface
const MAX_KICK = 0.25; // the strongest push in one step, however fast the mouse
const HOVER = 0.12; // how much the piece under the mouse lights up on its own

/** Tetrominoes stacked at the bottom of a side panel, rippling with color when the mouse moves over them (see well.ts). */
export function ArcadeWell() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current!;
    const panel = canvas.parentElement!;
    let well = new Surface(0, 0);
    let hovered = -1;
    let frame = 0;
    let lastX = 0;
    let lastY = 0;
    // Mouse movement since the last step, per cell, applied as one push at the next step.
    const pending = new Map<string, { x: number; y: number; amount: number }>();
    let clock = 0;

    const paint = () => {
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const offsetY = canvas.height - well.rows * CELL;
      well.pieces.forEach((p, i) => {
        // Small swings stay dark; a passing ripple shows the piece's color. The piece under the mouse is only lifted a little.
        const swing = well.light(i);
        const light = Math.max(swing < 0.1 ? 0 : swing, i === hovered ? HOVER : 0);
        for (const [x, y] of p.cells) {
          const px = x * CELL + 1;
          const py = offsetY + y * CELL + 1;
          const size = CELL - 2;
          // At rest: almost black, a hint of grey edge.
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#0d0d12';
          ctx.fillRect(px, py, size, size);
          ctx.strokeStyle = '#1c1c25';
          ctx.lineWidth = 1;
          ctx.strokeRect(px + 0.5, py + 0.5, size - 1, size - 1);
          if (light < 0.01) continue;
          // Moving: the piece's own color comes up with the swing, lit like a block when strong.
          ctx.globalAlpha = light * 0.9;
          if (light > 0.45) block(ctx, px, py, size, p.color, 3);
          else {
            ctx.fillStyle = p.color;
            ctx.fillRect(px + 1, py + 1, size - 2, size - 2);
          }
        }
      });
      ctx.globalAlpha = 1;
    };

    // A fixed number of steps a second, whatever the screen's refresh rate: catch up by time, not by frames.
    const tick = (time: number) => {
      frame = 0;
      const due = clock ? Math.min(4, Math.floor(((time - clock) * STEPS_PER_SECOND) / 1000)) : 1;
      let moving = 1;
      for (let i = 0; i < due; i++) {
        for (const kick of pending.values()) well.kick(kick.x, kick.y, Math.min(MAX_KICK, kick.amount));
        pending.clear();
        moving = well.step();
      }
      if (due > 0) clock = clock ? clock + (due * 1000) / STEPS_PER_SECOND : time;
      paint();
      if (moving || pending.size) frame = requestAnimationFrame(tick);
      else clock = 0;
    };
    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const layout = () => {
      canvas.width = panel.clientWidth;
      canvas.height = panel.clientHeight;
      const cols = Math.floor(canvas.width / CELL);
      const rows = Math.floor(canvas.height / CELL);
      if (cols !== well.cols || rows !== well.rows) well = new Surface(cols, rows);
      paint();
    };

    const onMove = (e: PointerEvent) => {
      const box = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - box.left) / CELL);
      const y = Math.floor((e.clientY - box.top - (canvas.height - well.rows * CELL)) / CELL);
      const at = well.pieceAt(x, y);
      const moved = Math.hypot(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
      const changed = at !== hovered;
      hovered = at;
      if (at >= 0 && !quiet()) {
        const key = `${x},${y}`;
        const kick = pending.get(key) ?? { x, y, amount: 0 };
        kick.amount += moved * KICK;
        pending.set(key, kick);
        wake();
      } else if (changed && !frame) paint();
    };
    const onLeave = () => {
      hovered = -1;
      if (!frame) paint();
    };

    const resize = new ResizeObserver(layout);
    resize.observe(panel);
    panel.addEventListener('pointermove', onMove);
    panel.addEventListener('pointerleave', onLeave);
    layout();
    return () => {
      resize.disconnect();
      panel.removeEventListener('pointermove', onMove);
      panel.removeEventListener('pointerleave', onLeave);
      cancelAnimationFrame(frame);
    };
  }, []);
  return <canvas ref={ref} className="arcade-well" aria-hidden="true" />;
}
