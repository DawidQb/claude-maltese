import { describe, expect, it } from 'vitest';
import {
  BEE_RADIUS,
  beeWords,
  doorLabel,
  flap,
  newBee,
  nextSpeed,
  placeDoors,
  SPEED,
  step,
  turn,
  WALL,
  type Arena,
  type Bee,
} from './bounce';
import { TOPICS, WORDS, wordsInTopic } from './words';

const arena: Arena = { width: 360, height: 560 };
const DT = 1 / 60;

/** Flies a bee with a simple autopilot aimed at a height, until it reaches a wall. */
function flyTo(bee: Bee, targetY: number, maxSeconds = 10) {
  for (let i = 0; i < maxSeconds * 60; i++) {
    if (bee.y > targetY && bee.vy > -100) flap(bee);
    const event = step(bee, DT, arena);
    if (event) return event;
  }
  throw new Error('the bee never reached a wall');
}

function launched(correctOption: number, rng = () => 0.5): Bee {
  const bee = newBee(arena, placeDoors(arena, correctOption, rng));
  bee.vx = SPEED.start * arena.width;
  return bee;
}

describe('placeDoors', () => {
  it('keeps both doors inside the arena, one per half, without overlap, at any screen height', () => {
    for (const height of [360, 480, 560, 700, 900]) {
      for (const r of [0, 0.25, 0.5, 0.75, 0.999]) {
        const a = { width: 360, height };
        const [upper, lower] = placeDoors(a, 0, () => r);
        expect(upper.top).toBeGreaterThanOrEqual(0);
        expect(upper.bottom).toBeLessThan(height / 2);
        expect(lower.top).toBeGreaterThan(height / 2);
        expect(lower.bottom).toBeLessThanOrEqual(height);
        // Wide enough for the bee, with solid wall between the two.
        expect(upper.bottom - upper.top).toBeGreaterThan(BEE_RADIUS * 4);
        expect(lower.top - upper.bottom).toBeGreaterThan(BEE_RADIUS);
      }
    }
  });

  it('keeps the doors below the strip reserved for the word', () => {
    for (const height of [400, 560, 800]) {
      for (const r of [0, 0.5, 0.999]) {
        const [upper, lower] = placeDoors({ width: 360, height }, 1, () => r, 70);
        expect(upper.top).toBeGreaterThan(70);
        expect(lower.top).toBeGreaterThan(upper.bottom + BEE_RADIUS);
        expect(lower.bottom).toBeLessThanOrEqual(height);
        expect(upper.bottom - upper.top).toBeGreaterThan(BEE_RADIUS * 4);
      }
    }
  });

  it('marks exactly the door of the right answer', () => {
    expect(placeDoors(arena, 0).map((d) => d.correct)).toEqual([true, false]);
    expect(placeDoors(arena, 1).map((d) => d.correct)).toEqual([false, true]);
  });
});

describe('flight', () => {
  it('falls under gravity and rises after a flap', () => {
    const bee = launched(0);
    const y0 = bee.y;
    step(bee, DT, arena);
    step(bee, DT, arena);
    expect(bee.y).toBeGreaterThan(y0);
    flap(bee);
    const y1 = bee.y;
    step(bee, DT, arena);
    expect(bee.y).toBeLessThan(y1);
  });

  it('hops on the floor and stops at the ceiling instead of leaving the arena', () => {
    const bee = launched(0);
    bee.vx = 0;
    for (let i = 0; i < 600; i++) {
      step(bee, DT, arena);
      expect(bee.y).toBeLessThanOrEqual(arena.height - BEE_RADIUS);
    }
    for (let i = 0; i < 600; i++) {
      flap(bee);
      step(bee, DT, arena);
      expect(bee.y).toBeGreaterThanOrEqual(BEE_RADIUS);
    }
  });

  it('does not report a wall while the bee is hovering before the start', () => {
    const bee = newBee(arena, placeDoors(arena, 0));
    for (let i = 0; i < 300; i++) expect(step(bee, DT, arena)).toBeNull();
  });
});

describe('reaching the wall', () => {
  const mid = (bee: Bee, option: number) => (bee.doors[option].top + bee.doors[option].bottom) / 2;

  it('scores the door with the right answer as correct', () => {
    const bee = launched(0);
    expect(flyTo(bee, mid(bee, 0))).toBe('correct');
    expect(bee.x).toBe(arena.width - WALL - BEE_RADIUS);
  });

  it('scores the other door as wrong', () => {
    const bee = launched(0);
    expect(flyTo(bee, mid(bee, 1))).toBe('wrong');
  });

  it('bumps off the solid wall between the doors', () => {
    const bee = launched(0);
    const between = (bee.doors[0].bottom + bee.doors[1].top) / 2;
    // Hold the bee exactly on the wall section between the doors.
    for (let i = 0; i < 600; i++) {
      bee.y = between;
      bee.vy = 0;
      const event = step(bee, DT, arena);
      if (event) {
        expect(event).toBe('bump');
        return;
      }
    }
    throw new Error('no wall reached');
  });

  it('flies back to the left wall after a turn', () => {
    const bee = launched(1);
    flyTo(bee, mid(bee, 1));
    turn(bee, arena, SPEED.start, placeDoors(arena, 0, () => 0.5));
    expect(bee.dir).toBe(-1);
    expect(flyTo(bee, mid(bee, 0))).toBe('correct');
    expect(bee.x).toBe(WALL + BEE_RADIUS);
  });
});

describe('nextSpeed', () => {
  it('speeds up on a right answer, slows on a wrong one, and stays within limits', () => {
    expect(nextSpeed(SPEED.start, 'correct')).toBeGreaterThan(SPEED.start);
    expect(nextSpeed(SPEED.start, 'wrong')).toBeLessThan(SPEED.start);
    expect(nextSpeed(SPEED.start, 'bump')).toBe(SPEED.start);
    let s = SPEED.start;
    for (let i = 0; i < 200; i++) s = nextSpeed(s, 'correct');
    expect(s).toBe(SPEED.max);
    for (let i = 0; i < 200; i++) s = nextSpeed(s, 'wrong');
    expect(s).toBe(SPEED.min);
  });
});

describe('beeWords', () => {
  it('leaves out words whose label is too long to read while flying', () => {
    // "gratulacje / wszystkiego najlepszego" is too long for a door and for the question strip.
    const long = WORDS.find((w) => w.id === 'awguri')!;
    expect(beeWords([long], 'mt2x', 'both')).toEqual([]);
    expect(beeWords([long], 'x2mt', 'both')).toEqual([]);
    // Short in English, so it is fine when only English is shown.
    const question = WORDS.find((w) => w.id === 'ma nafx')!;
    expect(beeWords([question], 'x2mt', 'en')).toEqual([question]);
  });

  it('labels a door with the translations or the Maltese word, depending on direction', () => {
    const bread = WORDS.find((w) => w.id === 'ħobż')!;
    expect(doorLabel(bread, 'mt2x', 'both')).toEqual(['chleb', 'bread']);
    expect(doorLabel(bread, 'mt2x', 'pl')).toEqual(['chleb']);
    expect(doorLabel(bread, 'x2mt', 'both')).toEqual(['ħobż']);
  });

  it('leaves enough words to play in every topic, direction and language choice', () => {
    for (const topic of TOPICS) {
      for (const dir of ['mt2x', 'x2mt'] as const) {
        for (const show of ['both', 'pl', 'en'] as const) {
          expect(beeWords(wordsInTopic(topic), dir, show).length, `${topic} ${dir} ${show}`).toBeGreaterThanOrEqual(8);
        }
      }
    }
  });
});
