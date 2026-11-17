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

/** The path-construction verbs both `SkPathBuilder` and the legacy `SkPath` support. */
export interface PathOps {
  moveTo(x: number, y: number): unknown;
  lineTo(x: number, y: number): unknown;
  cubicTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): unknown;
  close(): unknown;
}

/**
 * Builds an SkPath, preferring `Skia.PathBuilder` (the supported API since
 * react-native-skia 2.10 — mutating `SkPath` directly is deprecated and will be
 * removed) and falling back to `Skia.Path.Make()` on older peer versions.
 */
export const buildPath = (draw: (path: PathOps) => void): SkPath => {
  const factory = (Skia as { PathBuilder?: { Make(): PathOps & { build(): SkPath } } }).PathBuilder;
  if (factory) {
    const builder = factory.Make();
    draw(builder);
    return builder.build();
  }
  const path = Skia.Path.Make();
  draw(path);
  return path;
};

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

  const n = pts.length;

  return buildPath((path) => {
    path.moveTo(pts[0].x, pts[0].y);

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
  });
};

/**
 * Builds an isosceles triangle path centered at (cx, cy), `size` pixels tall,
 * pointing up or down. Used by MarkerLayer for entry/exit trade markers.
 */
export const buildTrianglePath = (cx: number, cy: number, size: number, pointingUp: boolean): SkPath => {
  const half = size / 2;

  return buildPath((path) => {
    if (pointingUp) {
      path.moveTo(cx, cy - half);
      path.lineTo(cx + half, cy + half);
      path.lineTo(cx - half, cy + half);
    } else {
      path.moveTo(cx, cy + half);
      path.lineTo(cx + half, cy - half);
      path.lineTo(cx - half, cy - half);
    }
    path.close();
  });
};

/**
 * The same smooth curve as `buildSmoothPath`, closed down to the horizontal line `baseY`: the region a gradient fills for
 * `chartType: 'area'` and `sparkline`.
 */
export const buildSmoothAreaPath = (pts: Point[], baseY: number): SkPath | null => {
  if (pts.length < 2) return null;
  const n = pts.length;
  return buildPath((path) => {
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[i > 0 ? i - 1 : 0];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2 < n ? i + 2 : n - 1];
      path.cubicTo(p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6, p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6, p2.x, p2.y);
    }
    path.lineTo(pts[n - 1].x, baseY);
    path.lineTo(pts[0].x, baseY);
    path.close();
  });
};
