/**
 * Rules for the "Queen's orders" game: the queen asks for one form of a verb by its meaning, and
 * four workers walk up to her, each carrying a form of that verb in Maltese; the player taps the
 * one with the right form before they arrive. Pure functions on plain data, tested without a screen.
 */
import { shuffle, takeDistinct, type Question, type Rng } from './games';
import { similarity } from './letters';
import type { Word } from './words';

/** A verb can be asked when at least this many of its forms are in the deck. */
export const MIN_FORMS = 4;
/** Orders in one audience: different forms of one verb (fewer if the verb has fewer). */
export const ORDERS = 5;
/** Audiences in a run, one verb each (fewer if fewer verbs qualify). */
export const AUDIENCES = 4;
/** Workers walking up with each order: the right form and the wrong ones. */
export const WORKERS = 4;
/** From this many right answers in a row, the wrong forms are the ones that look most like the answer. */
export const LOOKALIKES_FROM = 3;
/** Look-alike wrong forms are drawn at random from this many of the most similar. */
export const LOOKALIKE_POOL = 4;
/** The walk to the queen: its length at the start, the time each right answer in a row takes off, the floor. */
export const WALK = { start: 12_000, faster: 250, min: 8_000 };
/** After a miss the field stands still this long, showing the order and the form it wanted. */
export const REVEAL_MS = 1600;
/** The banner naming a new verb shows this long before its first order. */
export const BANNER_MS = 1200;

/** A verb that can be asked: its dictionary form and its conjugated forms, in deck order. */
export interface Verb {
  verb: Word;
  forms: Word[];
}

/**
 * The verbs the game can ask, in deck order (by the dictionary form's place in the deck), each
 * with its forms in deck order. A verb whose dictionary row is missing, or which has fewer than
 * `MIN_FORMS` forms, is left out.
 */
export function courtVerbs(words: readonly Word[]): Verb[] {
  const forms = new Map<string, Word[]>();
  for (const w of words) {
    if (!w.formOf) continue;
    const list = forms.get(w.formOf);
    if (list) list.push(w);
    else forms.set(w.formOf, [w]);
  }
  const verbs: Verb[] = [];
  for (const w of words) {
    if (w.formOf) continue;
    const list = forms.get(w.id);
    if (list && list.length >= MIN_FORMS) {
      verbs.push({ verb: w, forms: list });
      forms.delete(w.id);
    }
  }
  return verbs;
}

/** The verbs of a run: `AUDIENCES` of them at random, none twice. */
export function planRun(verbs: readonly Verb[], rng: Rng = Math.random): Verb[] {
  return shuffle(verbs, rng).slice(0, AUDIENCES);
}

/** The forms asked in one audience: `ORDERS` different forms of the verb at random, or all it has. */
export function planAudience(verb: Verb, rng: Rng = Math.random): Word[] {
  return shuffle(verb.forms, rng).slice(0, ORDERS);
}

/**
 * One order: the form asked and three other forms of the same verb, shuffled. While the run of
 * right answers is under `LOOKALIKES_FROM` the wrong forms are random; from then on they are
 * three of the `LOOKALIKE_POOL` forms that look most like the answer.
 */
export function makeOrder(verb: Verb, form: Word, run: number, rng: Rng = Math.random): Question {
  let others = shuffle(
    verb.forms.filter((w) => w.id !== form.id),
    rng,
  );
  if (run >= LOOKALIKES_FROM) {
    const score = new Map(others.map((w) => [w.id, similarity(w.mt, form.mt)]));
    const ranked = [...others].sort((a, b) => score.get(b.id)! - score.get(a.id)!);
    others = [...shuffle(ranked.slice(0, LOOKALIKE_POOL), rng), ...ranked.slice(LOOKALIKE_POOL)];
  }
  return { answer: form, options: shuffle(takeDistinct(others, WORKERS, [form]), rng) };
}

/** How long the workers take to reach the queen, with `run` right answers in a row. */
export function walkMs(run: number): number {
  return Math.max(WALK.min, WALK.start - Math.max(0, run) * WALK.faster);
}

export type FormState = 'right' | 'wrong' | 'unasked';

/** The verb's forms in deck order, each marked by how its order went in the audience just played. */
export function paradigm(verb: Verb, asked: ReadonlyMap<string, boolean>): { form: Word; state: FormState }[] {
  return verb.forms.map((form) => {
    const right = asked.get(form.id);
    return { form, state: right === undefined ? 'unasked' : right ? 'right' : 'wrong' };
  });
}
