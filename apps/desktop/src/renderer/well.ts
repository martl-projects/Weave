/*
 * The Arcade look's well: tetrominoes stacked at the bottom of a side panel,
 * and the wave that runs through them (drawn by ArcadeWell in arcade.tsx).
 *
 * The stack is a surface like water: a push where the mouse moves starts a
 * ripple that travels outward through the cells, reflects off the walls and
 * dies out. Each piece shows color as strongly as its cells swing, so the
 * ripple is seen piece by piece; at rest the well is nearly black.
 */

export const CELL = 16;

/** The seven tetrominoes as cells, each in its game color; rotations are worked out below. */
const SHAPES: Array<{ color: string; cells: Array<[number, number]> }> = [
  { color: '#00e5ff', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] }, // I
  { color: '#ffd400', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] }, // O
  { color: '#b65cff', cells: [[0, 0], [1, 0], [2, 0], [1, 1]] }, // T
  { color: '#39ff6a', cells: [[1, 0], [2, 0], [0, 1], [1, 1]] }, // S
  { color: '#ff3b5c', cells: [[0, 0], [1, 0], [1, 1], [2, 1]] }, // Z
  { color: '#2b55e6', cells: [[0, 0], [0, 1], [1, 1], [2, 1]] }, // J
  { color: '#ff9a1a', cells: [[2, 0], [0, 1], [1, 1], [2, 1]] }, // L
];

const rotations = (cells: Array<[number, number]>) => {
  const out: Array<Array<[number, number]>> = [];
  let shape = cells;
  for (let r = 0; r < 4; r++) {
    const minX = Math.min(...shape.map(([x]) => x));
    const minY = Math.min(...shape.map(([, y]) => y));
    out.push(shape.map(([x, y]) => [x - minX, y - minY]));
    shape = shape.map(([x, y]) => [-y, x]);
  }
  return out;
};
const PIECES = SHAPES.map((s) => ({ color: s.color, turns: rotations(s.cells) }));

export interface Piece {
  color: string;
  cells: Array<[number, number]>;
}

/** A small seeded random, so a panel keeps the same stack until it changes size. */
function seeded(seed: number): () => number {
  let h = seed >>> 0 || 1;
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)), (h >>> 0) / 4294967296);
}

/** A stack of pieces at the bottom of a cols × rows well, with an uneven top like a game in progress. */
export function stack(cols: number, rows: number): Piece[] {
  const rand = seeded(cols * 131 + rows);
  // How high the stack reaches in each column: about half the well, uneven.
  const tops: number[] = [];
  let h = Math.round(rows * 0.45);
  for (let x = 0; x < cols; x++) {
    h = Math.max(Math.round(rows * 0.25), Math.min(Math.round(rows * 0.6), h + Math.round((rand() - 0.5) * 4)));
    tops.push(rows - h);
  }
  const taken = Array.from({ length: rows }, () => new Array<boolean>(cols).fill(false));
  const inside = (x: number, y: number) => x >= 0 && x < cols && y < rows && y >= tops[x] && !taken[y][x];
  const pieces: Piece[] = [];
  for (let y = rows - 1; y >= 0; y--) {
    for (let x = 0; x < cols; x++) {
      if (!inside(x, y)) continue;
      // Try pieces and turns in a random order until one fits over this cell.
      const tries = PIECES.flatMap((p) => p.turns.map((cells) => ({ color: p.color, cells }))).sort(() => rand() - 0.5);
      let placed = false;
      for (const t of tries) {
        for (const [ax, ay] of t.cells) {
          const cells = t.cells.map(([cx, cy]) => [x + cx - ax, y + cy - ay] as [number, number]);
          if (!cells.every(([cx, cy]) => inside(cx, cy))) continue;
          for (const [cx, cy] of cells) taken[cy][cx] = true;
          pieces.push({ color: t.color, cells });
          placed = true;
          break;
        }
        if (placed) break;
      }
      if (!placed) taken[y][x] = true; // a gap, like a real stack has
    }
  }
  return pieces;
}

/** How the surface behaves; the defaults are what the app uses (tests and tuning pass others). */
export interface WaveSettings {
  /** Wave speed squared, in cells per step (the grid rings well before its limit of 0.5). */
  speed2: number;
  /** How much of its motion a cell loses each step. */
  damping: number;
  /** Damping of fine ripples only (viscosity): broad waves travel, grid-sized jitter dies at once. */
  viscosity: number;
  /** How much of its glow a piece keeps each step once the wave has passed. */
  fade: number;
  /** Swing to color. */
  gain: number;
}
export const WAVE: WaveSettings = { speed2: 0.2, damping: 0.04, viscosity: 0.05, fade: 0.9, gain: 7 };
/** Steps a second: the surface runs at this pace whatever the screen's refresh rate. */
export const STEPS_PER_SECOND = 60;

/**
 * The cells of the stacked pieces as a wave medium (the damped 2D wave
 * equation on the grid; empty cells are walls that reflect), seen piece by
 * piece: a piece glows with the strongest swing its cells had lately, so it
 * lights as a ripple passes and fades after, rather than flickering with
 * every crest and trough.
 */
export class Surface {
  readonly cols: number;
  readonly rows: number;
  readonly pieces: Piece[];
  private readonly owner: Int32Array;
  private now: Float32Array;
  private before: Float32Array;
  private next: Float32Array;
  private readonly glow: Float32Array;
  private readonly wave: WaveSettings;

  constructor(cols: number, rows: number, wave: WaveSettings = WAVE) {
    this.cols = cols;
    this.rows = rows;
    this.wave = wave;
    this.pieces = cols > 0 && rows > 0 ? stack(cols, rows) : [];
    this.owner = new Int32Array(cols * rows).fill(-1);
    this.pieces.forEach((p, i) => p.cells.forEach(([x, y]) => (this.owner[y * cols + x] = i)));
    this.now = new Float32Array(cols * rows);
    this.before = new Float32Array(cols * rows);
    this.next = new Float32Array(cols * rows);
    this.glow = new Float32Array(this.pieces.length);
  }

  /** The piece covering a cell, or -1. */
  pieceAt(x: number, y: number): number {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows ? this.owner[y * this.cols + x] : -1;
  }

  /**
   * Push the surface at a cell (where the mouse moved): the start of a ripple.
   * Like a finger in water, it pushes the cell down and lifts the cells around
   * it by as much, so the surface as a whole stays level and settles back flat.
   */
  kick(x: number, y: number, amount: number): void {
    if (this.pieceAt(x, y) < 0) return;
    const around = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([nx, ny]) => this.pieceAt(nx, ny) >= 0);
    this.now[y * this.cols + x] -= amount;
    for (const [nx, ny] of around) this.now[ny * this.cols + nx] += amount / around.length;
    if (!around.length) this.now[y * this.cols + x] += amount;
  }

  /** One step of the wave (1/STEPS_PER_SECOND of a second). Returns how much is still going on (0 once it has settled). */
  step(): number {
    const { cols, rows, owner, now, before, next, glow } = this;
    const { speed2, damping, viscosity, fade, gain } = this.wave;
    // Neighbors outside the stack mirror the cell: the wave reflects off the walls.
    const laplacian = (field: (c: number) => number, x: number, y: number, c: number) => {
      const own = field(c);
      const at = (nx: number, ny: number) => (nx >= 0 && nx < cols && ny >= 0 && ny < rows && owner[ny * cols + nx] >= 0 ? field(ny * cols + nx) : own);
      return at(x - 1, y) + at(x + 1, y) + at(x, y - 1) + at(x, y + 1) - 4 * own;
    };
    const height = (c: number) => now[c];
    const velocity = (c: number) => now[c] - before[c];
    let energy = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const c = y * cols + x;
        if (owner[c] < 0) continue;
        const u = now[c];
        // The damped wave equation, plus viscosity against grid-sized jitter and a slight pull back to rest.
        next[c] = u + velocity(c) * (1 - damping) + speed2 * laplacian(height, x, y, c) + viscosity * laplacian(velocity, x, y, c) - 0.004 * u;
        energy += Math.abs(next[c]) + Math.abs(next[c] - u);
      }
    }
    this.before = now;
    this.now = next;
    this.next = before;
    // Each piece glows with its cells' strongest swing, fading once the wave has gone by.
    let shown = 0;
    this.pieces.forEach((p, i) => {
      let swing = 0;
      for (const [x, y] of p.cells) swing = Math.max(swing, Math.abs(this.now[y * cols + x]));
      glow[i] = Math.max(swing * gain, glow[i] * fade);
      shown += glow[i];
    });
    // Nothing left that shows as color: stop, so the well doesn't keep animating for nothing.
    if (energy < 0.05 && shown < 0.05) {
      this.now.fill(0);
      this.before.fill(0);
      glow.fill(0);
      return 0;
    }
    return energy + shown;
  }

  /** How much color a piece shows right now, 0 to 1. */
  light(piece: number): number {
    return Math.min(1, this.glow[piece]);
  }
}
