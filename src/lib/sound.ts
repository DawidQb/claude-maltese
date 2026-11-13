/**
 * Small sounds for the games, synthesised with the Web Audio API: no audio files to download.
 * Browsers only allow sound after the player has pressed something, so the audio is started
 * by `wakeSound()`, called from a press; until then `playSound()` does nothing.
 */
export type Sound = 'right' | 'wrong' | 'bump' | 'pollen' | 'laser' | 'wave';

let audio: AudioContext | null = null;

/** Starts (or resumes) the audio. Call it from a tap, click or key press. */
export function wakeSound(): void {
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
  } catch {
    // No Web Audio here: the games stay silent.
    audio = null;
  }
}

/** One note that slides from `from` to `to` Hz, starting `at` seconds from now and dying away over `length`. */
function tone(ctx: AudioContext, type: OscillatorType, from: number, to: number, at: number, length: number, volume: number) {
  const start = ctx.currentTime + at;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + length);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(start);
  osc.stop(start + length + 0.02);
}

/** Plays a sound; `pitch` raises (above 1) or lowers it: the laser on a long run of hits, the blip of each letter traced. */
export function playSound(sound: Sound, pitch = 1): void {
  if (!audio || audio.state !== 'running') return;
  switch (sound) {
    case 'right':
      // Two notes, rising a fifth.
      tone(audio, 'triangle', 660, 660, 0, 0.16, 0.18);
      tone(audio, 'triangle', 990, 990, 0.09, 0.24, 0.18);
      break;
    case 'wrong':
      // A low thud.
      tone(audio, 'sine', 140, 55, 0, 0.3, 0.4);
      break;
    case 'bump':
      // A soft knock.
      tone(audio, 'triangle', 220, 120, 0, 0.08, 0.2);
      break;
    case 'pollen':
      // A short blip.
      tone(audio, 'sine', 1200 * pitch, 1800 * pitch, 0, 0.07, 0.1);
      break;
    case 'laser':
      // A quick falling zap.
      tone(audio, 'sawtooth', 1800 * pitch, 300 * pitch, 0, 0.12, 0.08);
      break;
    case 'wave':
      // Three rising notes.
      tone(audio, 'triangle', 523, 523, 0, 0.12, 0.15);
      tone(audio, 'triangle', 659, 659, 0.1, 0.12, 0.15);
      tone(audio, 'triangle', 784, 784, 0.2, 0.2, 0.15);
      break;
  }
}
