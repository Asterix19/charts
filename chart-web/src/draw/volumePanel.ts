/**
 * Canvas 2D volume sub-panel — the web counterpart to chart-core's VolumeLayer.
 */

import {
  buildVolumeBars,
  computeVolumeYRange,
  type Candle,
  type ChartThemeColors,
} from '@stacklatte/chart-core/core';

export function drawVolumePanel(
  ctx: CanvasRenderingContext2D,
  opts: {
    candleData: Candle[];
    width: number;
    height: number;
    colors: ChartThemeColors;
  },
): void {
  const { candleData, width, height, colors } = opts;
  if (candleData.length === 0) return;

  const { yMax } = computeVolumeYRange(candleData);
  const bars = buildVolumeBars(candleData, width, height, yMax, colors.candleUp, colors.candleDown);

  ctx.save();
  ctx.globalAlpha = 0.6;
  for (const bar of bars) {
    ctx.fillStyle = bar.color;
    ctx.fillRect(bar.x, bar.y, bar.width, bar.height);
  }
  ctx.restore();
}
