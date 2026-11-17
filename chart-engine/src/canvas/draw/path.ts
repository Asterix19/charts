/**
 * Canvas 2D equivalent of chart-native's Skia pathUtils.buildSmoothPath.
 *
 * Same Catmull-Rom → cubic-bezier conversion (tension fixed at 1/6) so a
 * chart-react line looks identical to its chart-native counterpart — just
 * emitted as ctx.bezierCurveTo() calls instead of an SkPath.
 */

import { withAlpha } from '../../utils';

export interface Point {
  x: number;
  y: number;
}

function traceSmoothPath(ctx: CanvasRenderingContext2D, pts: Point[]): void {
  ctx.moveTo(pts[0].x, pts[0].y);

  const n = pts.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[i > 0 ? i - 1 : 0];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2 < n ? i + 2 : n - 1];

    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }
}

/** Strokes a cubic-bezier curve passing exactly through every point (Catmull-Rom, tension 1/6). */
export function strokeSmoothPath(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  opts: { color: string; lineWidth?: number },
): void {
  if (pts.length < 2) return;

  ctx.save();
  ctx.beginPath();
  traceSmoothPath(ctx, pts);
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = opts.lineWidth ?? 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

/**
 * Fills the region between a smooth curve (same Catmull-Rom path as `strokeSmoothPath`) and the horizontal line `baseY`
 * with a vertical gradient: `color` at `topAlpha` under the highest point, fading to transparent at the baseline.
 */
export function fillSmoothArea(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  baseY: number,
  opts: { color: string; topAlpha?: number },
): void {
  if (pts.length < 2) return;
  ctx.save();
  ctx.beginPath();
  traceSmoothPath(ctx, pts);
  ctx.lineTo(pts[pts.length - 1].x, baseY);
  ctx.lineTo(pts[0].x, baseY);
  ctx.closePath();
  const top = Math.min(...pts.map((p) => p.y));
  const gradient = ctx.createLinearGradient(0, top, 0, baseY);
  gradient.addColorStop(0, withAlpha(opts.color, opts.topAlpha ?? 0.4));
  gradient.addColorStop(1, withAlpha(opts.color, 0));
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.restore();
}

/** Fills a closed polygon through the given points. */
export function fillPolygon(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  opts: { color: string; opacity?: number },
): void {
  if (pts.length < 3) return;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = opts.color;
  ctx.globalAlpha = opts.opacity ?? 1;
  ctx.fill();
  ctx.restore();
}

/** Strokes a straight dashed line between two points. */
export function strokeDashedLine(
  ctx: CanvasRenderingContext2D,
  p1: Point,
  p2: Point,
  opts: { color: string; lineWidth?: number; dash?: number[] },
): void {
  ctx.save();
  ctx.beginPath();
  ctx.setLineDash(opts.dash ?? []);
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.strokeStyle = opts.color;
  ctx.lineWidth = opts.lineWidth ?? 1;
  ctx.stroke();
  ctx.restore();
}
