/**
 * LineLayer — draws a continuous line through candle close prices, optionally with a gradient fill underneath
 * (`chartType: 'area'`, and every `sparkline`).
 *
 * Point coordinates come from buildLinePoints() in core so all math
 * stays outside this component.  This file only constructs the Skia
 * path and renders it.
 */

import { LinearGradient, Path, vec } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { buildLinePoints, withAlpha } from '@stacklatte/chart-engine';
import type { Candle } from '@stacklatte/chart-engine';
import { buildSmoothAreaPath, buildSmoothPath } from '../pathUtils';

interface Props {
  data: Candle[];
  width: number;
  height: number;
  priceMin: number;
  priceMax: number;
  /** Stroke color — pass theme.lineChart from the parent. */
  color?: string;
  /** Fill the region under the line with a gradient of `color` fading to transparent. */
  fill?: boolean;
  strokeWidth?: number;
}

const LineLayer: React.FC<Props> = ({ data, width, height, priceMin, priceMax, color = '#00e5ff', fill = false, strokeWidth = 2 }) => {
  const paths = useMemo(() => {
    // Need at least two points to draw a line
    if (data.length < 2) return null;

    // Coordinate math is delegated to core; we only build the Skia paths here
    const pts = buildLinePoints(data, width, height, priceMin, priceMax);
    const line = buildSmoothPath(pts);
    if (!line) return null;
    return { line, area: fill ? buildSmoothAreaPath(pts, height) : null, top: Math.min(...pts.map((p) => p.y)) };
  }, [data, width, height, priceMin, priceMax, fill]);

  if (!paths) return null;

  return (
    <>
      {paths.area && (
        <Path path={paths.area} style="fill">
          <LinearGradient start={vec(0, paths.top)} end={vec(0, height)} colors={[withAlpha(color, 0.4), withAlpha(color, 0)]} />
        </Path>
      )}
      <Path path={paths.line} style="stroke" strokeWidth={strokeWidth} color={color} strokeJoin="round" strokeCap="round" />
    </>
  );
};

export default LineLayer;
