import { describe, expect, it } from 'vitest';
import type { Rng } from './games';
import { newSwarm, resizeSwarm, stepSwarm, SWARM, swarmSize, velocity } from './swarm';

function seeded(seed: number): Rng {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('swarmSize', () => {
  it('fills a phone with a good number of bees, and never too few or too many', () => {
    expect(swarmSize(390, 844)).toBe(15);
    expect(swarmSize(200, 200)).toBe(SWARM.min);
    expect(swarmSize(3840, 2160)).toBe(SWARM.max);
  });
});

describe('newSwarm', () => {
  it('places every bee on screen, with a size and speed in range', () => {
    const bees = newSwarm(50, 390, 844, seeded(1));
    expect(bees).toHaveLength(50);
    for (const b of bees) {
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x).toBeLessThanOrEqual(390);
      expect(b.y).toBeGreaterThanOrEqual(0);
      expect(b.y).toBeLessThanOrEqual(844);
      expect(b.r).toBeGreaterThanOrEqual(SWARM.minR);
      expect(b.r).toBeLessThanOrEqual(SWARM.maxR);
      expect(b.speed).toBeGreaterThanOrEqual(SWARM.minSpeed);
      expect(b.speed).toBeLessThanOrEqual(SWARM.maxSpeed);
    }
  });
});

describe('stepSwarm', () => {
  it('moves each bee at its own speed, mostly sideways', () => {
    const [b] = newSwarm(1, 390, 844, seeded(2));
    b.heading = 0;
    const x = b.x;
    stepSwarm([b], 100, 390, 844, () => 0.5);
    expect(b.x - x).toBeCloseTo(b.speed * 0.1);
    const { vx, vy } = velocity({ ...b, heading: Math.PI / 4 });
    expect(Math.abs(vy)).toBeLessThan(Math.abs(vx));
  });

  it('keeps every bee near the screen however long they fly, wrapping at the edges', () => {
    const rng = seeded(3);
    const bees = newSwarm(30, 390, 844, rng);
    for (let i = 0; i < 6000; i++) stepSwarm(bees, 16, 390, 844, rng);
    for (const b of bees) {
      expect(b.x).toBeGreaterThanOrEqual(-SWARM.margin);
      expect(b.x).toBeLessThanOrEqual(390 + SWARM.margin);
      expect(b.y).toBeGreaterThanOrEqual(-SWARM.margin);
      expect(b.y).toBeLessThanOrEqual(844 + SWARM.margin);
    }
  });

  it('turns a bee only a little in one step', () => {
    const [b] = newSwarm(1, 390, 844, seeded(4));
    const before = b.heading;
    stepSwarm([b], 16, 390, 844, () => 1);
    expect(Math.abs(b.heading - before)).toBeLessThanOrEqual(SWARM.turn * 0.016 + 1e-9);
  });
});

describe('resizeSwarm', () => {
  it('adds bees for a bigger screen and lets some go for a smaller one, keeping the rest in place', () => {
    const rng = seeded(5);
    const phone = newSwarm(swarmSize(390, 844), 390, 844, rng);
    const wide = resizeSwarm(phone, 1440, 900, rng);
    expect(wide).toHaveLength(swarmSize(1440, 900));
    expect(wide.slice(0, phone.length).map((b) => b.heading)).toEqual(phone.map((b) => b.heading));
    const small = resizeSwarm(wide, 320, 500, rng);
    expect(small).toHaveLength(swarmSize(320, 500));
    for (const b of small) {
      expect(b.x).toBeLessThanOrEqual(320);
      expect(b.y).toBeLessThanOrEqual(500);
    }
  });
});
