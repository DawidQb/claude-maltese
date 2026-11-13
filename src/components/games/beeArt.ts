/** Drawing shared by the games on a canvas: the theme's colours and the bee. */

export interface Colors {
  bg: string;
  wall: string;
  line: string;
  ink: string;
  muted: string;
  tag: string;
  good: string;
  bad: string;
  honey: string;
}

/** The theme's colours, from the CSS variables. Read again when the colour scheme changes. */
export function readColors(): Colors {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    bg: v('--surface'),
    wall: v('--surface-2'),
    line: v('--line'),
    ink: v('--ink'),
    muted: v('--muted'),
    tag: v('--bg'),
    good: v('--known'),
    bad: v('--no'),
    honey: v('--accent'),
  };
}

/** Where the bee's eye is, for a bee drawn by `drawBee` with the same arguments. */
export function beeEye(x: number, y: number, r: number, facing: 1 | -1, tilt: number): { x: number; y: number } {
  const ex = r * 1.15;
  const ey = -r * 0.2;
  return {
    x: x + facing * (ex * Math.cos(tilt) - ey * Math.sin(tilt)),
    y: y + ex * Math.sin(tilt) + ey * Math.cos(tilt),
  };
}

/**
 * The bee, side on, centred on (x, y) with radius `r`: facing right (1) or left (-1), nose
 * tilted down by `tilt` radians (negative: up). `now` beats the wings; `outline` edges them.
 */
export function drawBee(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, facing: 1 | -1, tilt: number, now: number, outline: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(facing, 1);
  ctx.rotate(tilt);

  // Wings, beating.
  const beat = Math.sin(now / 38) * 0.5;
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  for (const wing of [-0.9 + beat, -0.35 + beat]) {
    ctx.save();
    ctx.translate(-2, -r * 0.55);
    ctx.rotate(wing);
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.6, r * 0.42, r * 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Striped body.
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.15, r * 0.85, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#f2b705';
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = '#2a2420';
  ctx.fillRect(-r * 0.55, -r, r * 0.3, r * 2);
  ctx.fillRect(r * 0.05, -r, r * 0.3, r * 2);
  ctx.restore();
  ctx.strokeStyle = '#2a2420';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Head, eye, sting.
  ctx.beginPath();
  ctx.arc(r * 1.0, -r * 0.1, r * 0.48, 0, Math.PI * 2);
  ctx.fillStyle = '#2a2420';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(r * 1.15, -r * 0.2, r * 0.14, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-r * 1.1, 0);
  ctx.lineTo(-r * 1.55, r * 0.05);
  ctx.strokeStyle = '#2a2420';
  ctx.stroke();
  ctx.restore();
}

/**
 * A spider hanging head down, centred on (x, y) with body radius `r`: a round body in the ink
 * colour, a smaller head below it with two red eyes, and eight legs that flex with `now` (pass 0
 * to keep them still).
 */
export function drawSpider(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, now: number, colors: Colors) {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = colors.ink;
  ctx.lineWidth = Math.max(1.5, r * 0.16);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Legs: four a side, each a thigh up and out and a shin down to the foot.
  for (const side of [-1, 1]) {
    for (let k = 0; k < 4; k++) {
      const flex = now ? Math.sin(now / 140 + k * 1.3 + (side > 0 ? 0.6 : 0)) * 0.12 : 0;
      const a = (-0.75 + k * 0.42 + flex) * Math.PI * 0.5;
      const kneeX = side * Math.cos(a) * r * 1.5;
      const kneeY = Math.sin(a) * r * 1.5 - r * 0.5;
      ctx.beginPath();
      ctx.moveTo(side * r * 0.3, 0);
      ctx.lineTo(kneeX, kneeY);
      ctx.lineTo(kneeX + side * r * 0.6, kneeY + r * 1.1);
      ctx.stroke();
    }
  }
  // Body, then the head below it.
  ctx.fillStyle = colors.ink;
  ctx.beginPath();
  ctx.ellipse(0, -r * 0.15, r, r * 1.05, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, r * 1.05, r * 0.52, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = colors.bad;
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(side * r * 0.2, r * 1.15, r * 0.13, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
