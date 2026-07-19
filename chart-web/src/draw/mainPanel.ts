/**
 * Canvas 2D drawing for the main price panel — the web counterpart to
 * chart-core's CandlestickLayer / LineLayer / IndicatorLayer / ShadedAreaLayer.
 *
 * All geometry comes from chart-core/core (buildCandleGeometry, buildLinePoints,
 * buildSeriesPoints, buildShadedAreaPoints) — this module only issues the
 * matching Canvas 2D draw calls. Callers are expected to have already
 * translated the context to the plot origin.
 */

import type { CandleBar, Point } from '@stacklatte/chart-core/core';
import { fillPolygon, strokeSmoothPath } from './path';

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

export function drawLineSeries(
  ctx: CanvasRenderingContext2D,
  pts: Point[],
  color: string,
): void {
  strokeSmoothPath(ctx, pts, { color, lineWidth: 2 });
}

export function drawShadedArea(
  ctx: CanvasRenderingContext2D,
  top: Point[],
  bottom: Point[],
  color: string,
  opacity: number,
): void {
  fillPolygon(ctx, [...top, ...bottom], { color, opacity });
}

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
