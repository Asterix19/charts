/**
 * Canvas 2D drawing for the main price panel — the web counterpart to
 * chart-native's CandlestickLayer / LineLayer / IndicatorLayer / ShadedAreaLayer.
 *
 * All geometry comes from chart-engine (buildCandleGeometry, buildLinePoints,
 * buildSeriesPoints, buildShadedAreaPoints) — this module only issues the
 * matching Canvas 2D draw calls. Callers are expected to have already
 * translated the context to the plot origin.
 */

import type { CandleBar, Point } from '../../index';
import { fillPolygon, fillSmoothArea, strokeSmoothPath } from './path';

/** Draws candle bodies and wicks from geometry produced by `buildCandleGeometry`. */
export function drawCandles(ctx: CanvasRenderingContext2D, bars: CandleBar[]): void {
  ctx.save();
  for (const bar of bars) {
    ctx.strokeStyle = bar.color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(bar.x, bar.wick.y1);
    ctx.lineTo(bar.x, bar.wick.y2);
    ctx.stroke();

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = bar.color;
    ctx.fillRect(bar.x - bar.width / 2, bar.body.y, bar.width, bar.body.height);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

/** Strokes a smooth Catmull-Rom curve through the points (used for line charts and indicator overlays). */
export function drawLineSeries(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  color: string,
  lineWidth = 2,
): void {
  strokeSmoothPath(ctx, pts, { color, lineWidth });
}

/** The gradient fill under a close-price line (`chartType: 'area'`): `color` fading to transparent down to `baseY`. */
export function drawAreaFill(ctx: CanvasRenderingContext2D, pts: Point[], baseY: number, color: string): void {
  fillSmoothArea(ctx, pts, baseY, { color, topAlpha: 0.4 });
}

/** Fills the polygon between a `top` and `bottom` point series (see `buildShadedAreaPoints`). */
export function drawShadedArea(
  ctx: CanvasRenderingContext2D,
  top: Point[],
  bottom: Point[],
  color: string,
  opacity: number,
): void {
  fillPolygon(ctx, [...top, ...bottom], { color, opacity });
}

/** A filled dot with a contrasting ring, marking a series value under the crosshair. */
export function drawCrosshairDot(
  ctx: CanvasRenderingContext2D,
  point: Point,
  color: string,
  radius = 3,
): void {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
