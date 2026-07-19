/**
 * Canvas 2D MACD sub-panel — the web counterpart to chart-core's MacdLayer.
 */

import {
  buildMacdHistogramBars,
  buildSeriesPoints,
  buildTimestampIndex,
  computeMacdYRange,
  getY,
  MACD_COLORS,
  type Candle,
  type ChartThemeColors,
  type TsPoint,
} from '@stacklatte/chart-core/core';
import { strokeSmoothPath } from './path';

export function drawMacdPanel(
  ctx: CanvasRenderingContext2D,
  opts: {
    macd: TsPoint[];
    signal: TsPoint[];
    histogram: TsPoint[];
    candleData: Candle[];
    width: number;
    height: number;
    colors: ChartThemeColors;
  },
): void {
  const { macd, signal, histogram, candleData, width, height, colors } = opts;
  const total = candleData.length;
  if (total === 0) return;

  const indexByTimestamp = buildTimestampIndex(candleData);
  const { yMin, yMax } = computeMacdYRange(macd, signal, histogram);
  const zeroY = getY(0, yMin, yMax, height);

  ctx.save();
  ctx.strokeStyle = colors.rsiThreshold;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, zeroY);
  ctx.lineTo(width, zeroY);
  ctx.stroke();
  ctx.restore();

  const histBars = buildMacdHistogramBars(histogram, indexByTimestamp, total, width, height, yMin, yMax, zeroY);
  ctx.save();
  ctx.globalAlpha = 0.75;
  for (const bar of histBars) {
    ctx.fillStyle = bar.isPositive ? MACD_COLORS.histPos : MACD_COLORS.histNeg;
    ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
  }
  ctx.restore();

  if (total >= 2 && macd.length >= 2) {
    const macdPts = buildSeriesPoints(macd, indexByTimestamp, total, width, height, yMin, yMax);
    strokeSmoothPath(ctx, macdPts, { color: MACD_COLORS.line, lineWidth: 1.5 });
  }

  if (total >= 2 && signal.length >= 2) {
    const signalPts = buildSeriesPoints(signal, indexByTimestamp, total, width, height, yMin, yMax);
    strokeSmoothPath(ctx, signalPts, { color: MACD_COLORS.signal, lineWidth: 1.5 });
  }
}
