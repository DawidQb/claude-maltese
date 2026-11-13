/**
 * The bees that fly about behind the app when "Beeeeeeeeeeeees!" is on. Pure functions on plain
 * data, so the flight can be tested without a screen. Each bee wanders: it keeps its own speed and
 * turns a little at random, flies mostly sideways, and wraps round to the other side of the screen
 * when it flies off an edge.
 */
import type { Rng } from './games';

export interface SwarmBee {
  x: number;
  y: number;
  /** Direction of flight, in radians. */
  heading: number;
  /** px per second. */
  speed: number;
  /** Body radius in px; smaller bees are drawn fainter, as if further away. */
  r: number;
  /** Offset for the gentle up-and-down, so the bees do not bob in step. */
  phase: number;
}

/** How many bees, how big and fast, how much they turn, and how far off screen before they wrap. */
export const SWARM = {
  /** One bee per this many square px of screen… */
  areaPerBee: 22_000,
  /** …but never fewer or more than these. */
  min: 8,
  max: 36,
  minR: 6,
  maxR: 12,
  minSpeed: 35,
  maxSpeed: 85,
  /** Most a bee turns per second, either way, in radians. */
  turn: 1.6,
  /** Vertical flight is squashed by this, so the bees fly mostly sideways, as bees in a field do. */
  flatten: 0.55,
  /** px beyond the edge before a bee comes back on the other side. */
  margin: 30,
  /** Height in px and period in ms of the up-and-down. */
  bob: 4,
  bobMs: 700,
};

/** How many bees fill a screen this size. */
export function swarmSize(width: number, height: number): number {
  return Math.round(Math.min(SWARM.max, Math.max(SWARM.min, (width * height) / SWARM.areaPerBee)));
}

export function newSwarm(count: number, width: number, height: number, rng: Rng = Math.random): SwarmBee[] {
  return Array.from({ length: count }, () => {
    const depth = rng();
    return {
      x: rng() * width,
      y: rng() * height,
      heading: rng() * Math.PI * 2,
      // Nearer bees are bigger and a little faster.
      speed: SWARM.minSpeed + (SWARM.maxSpeed - SWARM.minSpeed) * (0.5 * depth + 0.5 * rng()),
      r: SWARM.minR + (SWARM.maxR - SWARM.minR) * depth,
      phase: rng() * 1000,
    };
  });
}

/** The way a bee moves this instant, in px per second. */
export function velocity(bee: SwarmBee): { vx: number; vy: number } {
  return { vx: Math.cos(bee.heading) * bee.speed, vy: Math.sin(bee.heading) * bee.speed * SWARM.flatten };
}

/** Moves every bee on by `dtMs`, turning each a little at random and wrapping at the edges. */
export function stepSwarm(bees: SwarmBee[], dtMs: number, width: number, height: number, rng: Rng = Math.random): void {
  const dt = dtMs / 1000;
  const m = SWARM.margin;
  for (const b of bees) {
    b.heading += (rng() * 2 - 1) * SWARM.turn * dt;
    const { vx, vy } = velocity(b);
    b.x += vx * dt;
    b.y += vy * dt;
    if (b.x < -m) b.x += width + 2 * m;
    else if (b.x > width + m) b.x -= width + 2 * m;
    if (b.y < -m) b.y += height + 2 * m;
    else if (b.y > height + m) b.y -= height + 2 * m;
  }
}

/** Keeps the swarm the right size for the screen: adds bees or lets the last ones go. */
export function resizeSwarm(bees: SwarmBee[], width: number, height: number, rng: Rng = Math.random): SwarmBee[] {
  const want = swarmSize(width, height);
  const kept = bees.slice(0, want).map((b) => ({ ...b, x: Math.min(b.x, width), y: Math.min(b.y, height) }));
  return want > kept.length ? [...kept, ...newSwarm(want - kept.length, width, height, rng)] : kept;
}
