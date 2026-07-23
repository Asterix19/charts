/**
 * Canvas 2D trade markers — the web counterpart to chart-core's MarkerLayer.
 *
 * Geometry comes from buildMarkerPoints() in chart-core (the same getCandleX/
 * getY pixel math the candle layer uses); shape/color per marker kind comes
 * from getMarkerStyle(). This module only issues the matching Canvas 2D
 * draw calls. Markers are drawn at a fixed pixel size regardless of zoom.
 */

import {
  buildMarkerPoints,
  buildTimestampIndex,
  getMarkerStyle,
  MARKER_SIZE,
  type Candle,
  type ChartMarker,
  type ChartThemeColors,
} from '@stacklatte/chart-core/core';
import { fillPolygon } from './path';

export function drawMarkers(
  ctx: CanvasRenderingContext2D,
  opts: {
    markers: ChartMarker[];
    candleData: Candle[];
    width: number;
    height: number;
    priceMin: number;
    priceMax: number;
    colors: ChartThemeColors;
  },
): void {
  const { markers, candleData, width, height, priceMin, priceMax, colors } = opts;
  const total = candleData.length;
  if (total === 0 || markers.length === 0) return;

  const indexByTimestamp = buildTimestampIndex(candleData);
  const points = buildMarkerPoints(markers, indexByTimestamp, total, width, height, priceMin, priceMax);
  const half = MARKER_SIZE / 2;

  for (const pt of points) {
    const { shape, color } = getMarkerStyle(pt.kind, colors);

    switch (shape) {
      case 'triangle-up':
        fillPolygon(ctx, [
          { x: pt.x, y: pt.y - half },
          { x: pt.x + half, y: pt.y + half },
          { x: pt.x - half, y: pt.y + half },
        ], { color });
        break;

      case 'triangle-down':
        fillPolygon(ctx, [
          { x: pt.x, y: pt.y + half },
          { x: pt.x + half, y: pt.y - half },
          { x: pt.x - half, y: pt.y - half },
        ], { color });
        break;

      case 'x':
        ctx.save();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(pt.x - half, pt.y - half);
        ctx.lineTo(pt.x + half, pt.y + half);
        ctx.moveTo(pt.x - half, pt.y + half);
        ctx.lineTo(pt.x + half, pt.y - half);
        ctx.stroke();
        ctx.restore();
        break;

      case 'dot':
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, half, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
    }
  }
}
