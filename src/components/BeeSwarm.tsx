import { useEffect, useRef } from 'react';
import { resizeSwarm, stepSwarm, SWARM, velocity, type SwarmBee } from '../lib/swarm';
import { drawBee, readColors } from './games/beeArt';

/** The longest step the bees take in one frame, so a slow frame never throws them across the screen. */
const MAX_STEP_MS = 50;
/** The furthest bees are drawn this faint, the nearest this solid. */
const FAINTEST = 0.35;
const SOLIDEST = 0.75;

/**
 * Bees flying about behind the app, for the "Beeeeeeeeeeeees!" setting. A fixed canvas behind
 * everything that never takes a tap. With reduced motion asked for, the bees stay where they are.
 */
export function BeeSwarm() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let colors = readColors();
    let bees: SwarmBee[] = [];
    let width = 0;
    let height = 0;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let still = motion.matches;

    const draw = (now: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const b of bees) {
        const { vx, vy } = velocity(b);
        const bob = still ? 0 : Math.sin((now + b.phase) / SWARM.bobMs * Math.PI * 2) * SWARM.bob;
        const depth = (b.r - SWARM.minR) / (SWARM.maxR - SWARM.minR);
        ctx.globalAlpha = FAINTEST + (SOLIDEST - FAINTEST) * depth;
        const tilt = Math.max(-0.5, Math.min(0.5, vy / (Math.abs(vx) + 1)));
        drawBee(ctx, b.x, b.y + bob, b.r, vx >= 0 ? 1 : -1, tilt, still ? 0 : now + b.phase, colors.muted);
      }
      ctx.globalAlpha = 1;
    };

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bees = resizeSwarm(bees, width, height);
      draw(performance.now());
    };

    let frame = 0;
    let last = 0;
    const tick = (now: number) => {
      frame = requestAnimationFrame(tick);
      const dt = last ? Math.min(now - last, MAX_STEP_MS) : 0;
      last = now;
      stepSwarm(bees, dt, width, height);
      draw(now);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      last = 0;
      if (still) draw(0);
      else frame = requestAnimationFrame(tick);
    };

    const onMotion = () => {
      still = motion.matches;
      start();
    };
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => {
      colors = readColors();
      if (still) draw(0);
    };
    motion.addEventListener('change', onMotion);
    scheme.addEventListener('change', onScheme);
    window.addEventListener('resize', resize);
    resize();
    start();

    if (import.meta.env.DEV) {
      // Lets the automated check see the swarm; stripped from the production build.
      (window as unknown as Record<string, unknown>).__swarm = { get bees() { return bees; }, get still() { return still; } };
    }

    return () => {
      cancelAnimationFrame(frame);
      motion.removeEventListener('change', onMotion);
      scheme.removeEventListener('change', onScheme);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="bee-swarm" aria-hidden="true" />;
}
