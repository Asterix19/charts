/**
 * pathUtils — shared Skia path builders for smooth curves.
 *
 * buildSmoothPath uses Catmull-Rom → cubic-bezier conversion so the resulting
 * curve passes exactly through every data point while looking visually smooth.
 * Tension is fixed at 1/6 — the classical "natural" value.
 */

import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';

interface Point {
  x: number;
  y: number;
}

/**
 * Builds a smooth cubic-bezier path through the given points.
 *
 * For each segment p[i] → p[i+1] the control points are derived from the
 * neighbouring points p[i-1] and p[i+2] (clamped at the ends):
 *
 *   cp1 = p[i]   + (p[i+1] - p[i-1]) / 6
 *   cp2 = p[i+1] - (p[i+2] - p[i])   / 6
 */
export const buildSmoothPath = (pts: Point[]): SkPath | null => {
  if (pts.length < 2) return null;

  const path = Skia.Path.Make();
  path.moveTo(pts[0].x, pts[0].y);

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

    path.cubicTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
  }

  return path;
};
