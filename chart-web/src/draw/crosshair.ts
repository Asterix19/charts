/**
 * Canvas 2D dashed crosshair — the web counterpart to chart-core's
 * CrosshairLayer (native Skia canvas draws its own dashed lines; on
 * react-native-web it falls back to a DOM overlay because DashPathEffect
 * isn't supported there). Plain <canvas> supports ctx.setLineDash natively,
 * so chart-web always draws the crosshair directly on-canvas.
 */

import { strokeDashedLine } from './path';

export function drawCrosshairLines(
  ctx: CanvasRenderingContext2D,
  opts: {
    x: number;
    y: number;
    width: number;
    height: number;
    color: string;
    dash?: number[];
  },
): void {
  const { x, y, width, height, color, dash = [4, 4] } = opts;

  strokeDashedLine(ctx, { x, y: 0 }, { x, y: height }, { color, dash });
  strokeDashedLine(ctx, { x: 0, y }, { x: width, y }, { color, dash });
}
