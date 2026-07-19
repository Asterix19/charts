/**
 * Canvas 2D RSI sub-panel — the web counterpart to chart-core's RsiLayer.
 */

import {
  buildSeriesPoints,
  buildTimestampIndex,
  getY,
  RSI_MAX,
  RSI_MIN,
  type Candle,
  type ChartThemeColors,
  type RsiPoint,
} from '@stacklatte/chart-core/core';
import { strokeSmoothPath } from './path';

export function drawRsiPanel(
  ctx: CanvasRenderingContext2D,
  opts: {
    data: RsiPoint[];
    candleData: Candle[];
    width: number;
    height: number;
    colors: ChartThemeColors;
  },
): void {
  const { data, candleData, width, height, colors } = opts;
  const total = candleData.length;
  const indexByTimestamp = buildTimestampIndex(candleData);

  const y70 = getY(70, RSI_MIN, RSI_MAX, height);
  const y30 = getY(30, RSI_MIN, RSI_MAX, height);

  ctx.save();
  ctx.strokeStyle = colors.rsiThreshold;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y70);
  ctx.lineTo(width, y70);
  ctx.moveTo(0, y30);
  ctx.lineTo(width, y30);
  ctx.stroke();
  ctx.restore();

  if (total < 2 || data.length === 0) return;
  const pts = buildSeriesPoints(data, indexByTimestamp, total, width, height, RSI_MIN, RSI_MAX);
  strokeSmoothPath(ctx, pts, { color: colors.rsiLine, lineWidth: 2 });
}
