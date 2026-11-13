import { describe, expect, it } from 'vitest';
import {
  BEE_RADIUS,
  beeWords,
  bumpCounts,
  DIFFICULTY,
  difficulty,
  doorLabel,
  enterRoom,
  flap,
  MAX_BUMPS,
  MIN_DOOR,
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
    const hit = step(bee, DT, arena);
    if (hit) return hit.event;
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

  it('places two full-size doors exactly as before door counts and sizes could change', () => {
    // The original rule, kept here as the reference.
    const before = (a: Arena, correct: number, rng: () => number, headroom: number) => {
      const half = (a.height - headroom) / 2;
      const room = half - 14 - 28 / 2;
      const size = Math.min(room, Math.max(96, Math.min(150, a.height * 0.26)));
      const upperTop = headroom + 14 + rng() * (room - size);
      const lowerTop = headroom + half + 28 / 2 + rng() * (room - size);
      return [
        { top: upperTop, bottom: upperTop + size, option: 0, correct: correct === 0 },
        { top: lowerTop, bottom: lowerTop + size, option: 1, correct: correct === 1 },
      ];
    };
    for (const height of [360, 560, 900]) {
      for (const headroom of [0, 70]) {
        const a = { width: 360, height };
        const draws = [0.1, 0.8];
        const rng = () => draws.shift() ?? 0.5;
        const again = [0.1, 0.8];
        expect(placeDoors(a, 1, rng, headroom)).toEqual(before(a, 1, () => again.shift() ?? 0.5, headroom));
      }
    }
  });

  it('reports the door the bee flew through', () => {
    const bee = launched(1);
    const target = bee.doors[1];
    for (let i = 0; i < 600; i++) {
      if (bee.y > (target.top + target.bottom) / 2 && bee.vy > -100) flap(bee);
      const hit = step(bee, DT, arena);
      if (hit) {
        expect(hit).toEqual({ event: 'correct', door: target });
        return;
      }
    }
    throw new Error('no wall reached');
  });

  it('places three doors inside the arena, below the word, without overlap, at any phone height', () => {
    for (const height of [400, 500, 560, 700, 900]) {
      for (const r of [0, 0.5, 0.999]) {
        for (const correct of [0, 1, 2]) {
          const doors = placeDoors({ width: 360, height }, correct, () => r, 70, 3, DIFFICULTY.narrowScale);
          expect(doors).toHaveLength(3);
          expect(doors.filter((d) => d.correct).map((d) => d.option)).toEqual([correct]);
          expect(doors[0].top).toBeGreaterThan(70);
          expect(doors[2].bottom).toBeLessThanOrEqual(height);
          for (let i = 1; i < 3; i++) expect(doors[i].top).toBeGreaterThan(doors[i - 1].bottom + BEE_RADIUS);
          for (const d of doors) expect(d.bottom - d.top).toBeGreaterThanOrEqual(MIN_DOOR);
        }
      }
    }
  });

  it('never makes a door shorter than MIN_DOOR, however small the scale', () => {
    for (const height of [400, 560, 700, 900]) {
      for (const scale of [1, DIFFICULTY.narrowScale, DIFFICULTY.crampedScale, 0.3]) {
        for (const d of placeDoors({ width: 360, height }, 0, () => 0.5, 70, 2, scale)) {
          expect(d.bottom - d.top).toBeGreaterThanOrEqual(MIN_DOOR);
        }
      }
    }
  });

  it('shrinks the doors with the scale', () => {
    const a = { width: 360, height: 800 };
    const size = (scale: number) => {
      const [d] = placeDoors(a, 0, () => 0.5, 70, 2, scale);
      return d.bottom - d.top;
    };
    expect(size(DIFFICULTY.narrowScale)).toBeCloseTo(size(1) * DIFFICULTY.narrowScale, 5);
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

  it('keeps climbing at a steady speed while held, and falls again once let go', () => {
    const bee = launched(0);
    bee.vx = 0;
    bee.y = arena.height - BEE_RADIUS - 1;
    flap(bee);
    let prev = bee.y;
    for (let i = 0; i < 30; i++) {
      step(bee, DT, arena, true);
      expect(bee.y).toBeLessThan(prev);
      prev = bee.y;
    }
    // Steady, not ever faster: the climb is capped.
    const climb = prev;
    step(bee, DT, arena, true);
    const perStep = climb - bee.y;
    step(bee, DT, arena, true);
    expect(bee.y).toBeCloseTo(climb - 2 * perStep, 5);
    // Let go: gravity takes over and the bee comes back down.
    const top = bee.y;
    for (let i = 0; i < 30; i++) step(bee, DT, arena);
    expect(bee.y).toBeGreaterThan(top);
  });

  it('stays inside the arena while held at the ceiling', () => {
    const bee = launched(0);
    bee.vx = 0;
    for (let i = 0; i < 600; i++) {
      step(bee, DT, arena, true);
      expect(bee.y).toBeGreaterThanOrEqual(BEE_RADIUS);
    }
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
      const hit = step(bee, DT, arena);
      if (hit) {
        expect(hit).toEqual({ event: 'bump' });
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

describe('entering the next room', () => {
  const mid = (bee: Bee, option: number) => (bee.doors[option].top + bee.doors[option].bottom) / 2;

  /** Flies straight on at a fixed height and reports how long it took to reach a wall. */
  function crossing(bee: Bee, y: number) {
    let t = 0;
    for (let i = 0; i < 1200; i++) {
      bee.y = y;
      bee.vy = 0;
      t += DT;
      const hit = step(bee, DT, arena);
      if (hit) return { hit, t };
    }
    throw new Error('no wall reached');
  }

  for (const dir of [1, -1] as const) {
    it(`goes on through the wall in the same direction (${dir === 1 ? 'right' : 'left'})`, () => {
      const bee = launched(0);
      if (dir === -1) {
        flyTo(bee, mid(bee, 1));
        turn(bee, arena, SPEED.start, placeDoors(arena, 0, () => 0.5));
      }
      expect(flyTo(bee, mid(bee, 0))).toBe('correct');
      const { x, y, vy } = bee;
      const next = placeDoors(arena, 1, () => 0.3);
      enterRoom(bee, arena, SPEED.start, next);

      expect(bee.dir).toBe(dir);
      expect(bee.x).toBe(x - dir * (arena.width - WALL));
      expect(bee.y).toBe(y);
      expect(bee.vy).toBe(vy);
      expect(bee.vx).toBe(dir * SPEED.start * arena.width);
      expect(bee.doors).toBe(next);
      // Still in the doorway of the wall behind.
      expect(dir === 1 ? bee.x < WALL : bee.x > arena.width - WALL).toBe(true);

      // No event while leaving the doorway; the far wall next, after at least a full crossing.
      const { hit, t } = crossing(bee, mid(bee, 1));
      expect(hit.event).toBe('correct');
      expect(bee.x).toBe(dir === 1 ? arena.width - WALL - BEE_RADIUS : WALL + BEE_RADIUS);
      const full = (arena.width - 2 * (WALL + BEE_RADIUS)) / (SPEED.start * arena.width);
      expect(t).toBeGreaterThanOrEqual(full);
      expect(t).toBeLessThan(full * 1.2);
    });
  }
});

describe('difficulty', () => {
  const tall = { width: 390, height: 700 };

  it('starts gentle and tightens as the run of right answers grows', () => {
    const at = (run: number) => difficulty(run, tall, 70);
    for (const run of [0, 1, 2]) expect(at(run)).toEqual({ doors: 2, scale: 1, lookalikes: false });
    for (const run of [3, 4, 5]) expect(at(run)).toEqual({ doors: 2, scale: 1, lookalikes: true });
    for (const run of [6, 7, 8]) expect(at(run)).toEqual({ doors: 2, scale: DIFFICULTY.narrowScale, lookalikes: true });
    for (const run of [9, 10, 25]) expect(at(run)).toEqual({ doors: 3, scale: DIFFICULTY.narrowScale, lookalikes: true });
  });

  it('keeps two smaller doors where three would not fit', () => {
    expect(difficulty(9, { width: 390, height: 300 }, 70)).toEqual({ doors: 2, scale: DIFFICULTY.crampedScale, lookalikes: true });
    // A tall prompt strip leaves too little room, too.
    expect(difficulty(9, { width: 390, height: 420 }, 140).doors).toBe(2);
  });

  it('adds the third door only where each of the three is comfortably tall', () => {
    for (const height of [300, 400, 450, 500, 560, 700, 900]) {
      const level = difficulty(9, { width: 390, height }, 70);
      if (level.doors === 3) {
        for (const d of placeDoors({ width: 390, height }, 0, () => 0.5, 70, 3, level.scale)) {
          expect(d.bottom - d.top).toBeGreaterThanOrEqual(84);
        }
      }
    }
  });
});

describe('bumpCounts', () => {
  it('forgives one bump per question and counts the next as a miss', () => {
    expect(MAX_BUMPS).toBe(1);
    expect(bumpCounts(0)).toBe('bump');
    expect(bumpCounts(1)).toBe('wrong');
    expect(bumpCounts(2)).toBe('wrong');
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
    // Top speed after about fifteen right answers.
    let fifteen = SPEED.start;
    for (let i = 0; i < 14; i++) fifteen = nextSpeed(fifteen, 'correct');
    expect(fifteen).toBeLessThan(SPEED.max);
    expect(nextSpeed(nextSpeed(fifteen, 'correct'), 'correct')).toBe(SPEED.max);
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
