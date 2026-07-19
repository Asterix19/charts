/**
 * Canvas 2D equivalent of chart-core's Skia pathUtils.buildSmoothPath.
 *
 * Same Catmull-Rom → cubic-bezier conversion (tension fixed at 1/6) so a
 * chart-web line looks identical to its chart-core counterpart — just
 * emitted as ctx.bezierCurveTo() calls instead of an SkPath.
 */

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
