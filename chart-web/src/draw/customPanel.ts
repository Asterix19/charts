/**
 * Canvas 2D custom sub-panel — draws an arbitrary caller-supplied `CustomPanel` (see
 * chart-core's `types.ts`). Unlike RSI/MACD/Volume, this has no fixed indicator math of its own:
 * it just plots whatever `IndicatorLine` series the panel was given, within the Y range the
 * caller resolved (via `computeCustomPanelYRange`), plus optional horizontal reference lines —
 * the same visual idea as RSI's 30/70 threshold lines, generalized to any value(s).
 */

import { buildSeriesPoints, buildTimestampIndex, getY, type Candle, type ChartThemeColors, type TsPoint } from '@stacklatte/chart-core/core';
import { strokeSmoothPath } from './path';

export function drawCustomPanel(
  ctx: CanvasRenderingContext2D,
  opts: {
    /** One entry per series in the panel, each already clipped to the visible time window. */
    series: { color: string; data: TsPoint[] }[];
    candleData: Candle[];
    width: number;
    height: number;
    yMin: number;
    yMax: number;
    referenceLines?: number[];
    colors: ChartThemeColors;
  },
): void {
  const { series, candleData, width, height, yMin, yMax, referenceLines, colors } = opts;
  const total = candleData.length;

  if (referenceLines && referenceLines.length > 0) {
    ctx.save();
    ctx.strokeStyle = colors.rsiThreshold;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const value of referenceLines) {
      const y = getY(value, yMin, yMax, height);
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (total < 2) return;
  const indexByTimestamp = buildTimestampIndex(candleData);
  for (const { color, data } of series) {
    if (data.length === 0) continue;
    const pts = buildSeriesPoints(data, indexByTimestamp, total, width, height, yMin, yMax);
    strokeSmoothPath(ctx, pts, { color, lineWidth: 2 });
  }
}
