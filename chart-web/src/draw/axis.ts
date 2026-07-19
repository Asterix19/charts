/**
 * Canvas 2D price/time grid + axis labels — the web counterpart to
 * chart-core's AxisLayer + AxisLabelsWeb combined.
 *
 * Unlike react-native-skia-on-web (which needs a DOM overlay for crisp text —
 * see chart-core's AxisLabelsWeb), plain <canvas> text rendering via
 * ctx.fillText is fully supported, so grid lines and labels are drawn
 * together in one pass here.
 */

import {
  getPriceTicks,
  getTimeTicks,
  getY,
  priceTickCount,
  type Candle,
  type ChartPadding,
  type ChartThemeColors,
} from '@stacklatte/chart-core/core';

export interface AxisDrawOptions {
  sortedData: Candle[];
  viewportStart: number;
  viewportEnd: number;
  intervalMs: number;
  width: number;
  height: number;
  priceMin: number;
  priceMax: number;
  padding: ChartPadding;
  colors: ChartThemeColors;
  hour12: boolean;
  showGrid: boolean;
}

const AXIS_FONT = '10px ui-monospace, SFMono-Regular, Menlo, monospace';

export function drawAxis(ctx: CanvasRenderingContext2D, opts: AxisDrawOptions): void {
  const {
    sortedData, viewportStart, viewportEnd, intervalMs,
    width, height, priceMin, priceMax, padding, colors, hour12, showGrid,
  } = opts;

  const chartHeight = height - padding.top - padding.bottom;
  const chartWidth = width - padding.left - padding.right;

  const yTicks = getPriceTicks(priceMin, priceMax, priceTickCount(chartHeight));
  const xTicks = getTimeTicks(sortedData, viewportStart, viewportEnd, intervalMs, chartWidth, hour12);

  ctx.save();
  ctx.font = AXIS_FONT;
  ctx.textBaseline = 'middle';

  for (const val of yTicks) {
    const y = padding.top + getY(val, priceMin, priceMax, chartHeight);
    if (y < padding.top || y > padding.top + chartHeight) continue;

    if (showGrid) {
      ctx.beginPath();
      ctx.setLineDash([4, 2]);
      ctx.strokeStyle = colors.gridH;
      ctx.lineWidth = 1;
      ctx.moveTo(padding.left, y);
      ctx.lineTo(padding.left + chartWidth, y);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.fillStyle = colors.priceLabel;
    ctx.textAlign = 'left';
    ctx.fillText(val.toFixed(2), padding.left + chartWidth + 6, y);
  }

  ctx.textBaseline = 'top';
  for (const { x, label } of xTicks) {
    const px = padding.left + x;

    if (showGrid) {
      ctx.beginPath();
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = colors.gridV;
      ctx.lineWidth = 1;
      ctx.moveTo(px, padding.top);
      ctx.lineTo(px, padding.top + chartHeight);
      ctx.stroke();
    }

    ctx.setLineDash([]);
    ctx.fillStyle = colors.timeLabel;
    ctx.textAlign = 'center';
    ctx.fillText(label, px, padding.top + chartHeight + padding.bottom - 14);
  }

  ctx.restore();
}
