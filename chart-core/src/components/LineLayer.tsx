/**
 * LineLayer — draws a continuous line through candle close prices.
 *
 * Point coordinates come from buildLinePoints() in core so all math
 * stays outside this component.  This file only constructs the Skia
 * path and renders it.
 */

import { Path } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { buildLinePoints } from '../core';
import type { Candle } from '../core';
import { buildSmoothPath } from '../pathUtils';

interface Props {
  data: Candle[];
  width: number;
  height: number;
  priceMin: number;
  priceMax: number;
  /** Stroke color — pass theme.lineChart from the parent. */
  color?: string;
}

const LineLayer: React.FC<Props> = ({ data, width, height, priceMin, priceMax, color = '#00e5ff' }) => {
  const path = useMemo(() => {
    // Need at least two points to draw a line
    if (data.length < 2) return null;

    // Coordinate math is delegated to core; we only build the Skia path here
    const pts = buildLinePoints(data, width, height, priceMin, priceMax);
    return buildSmoothPath(pts);
  }, [data, width, height, priceMin, priceMax]);

  if (!path) return null;

  return (
    <Path path={path} style="stroke" strokeWidth={2} color={color} strokeJoin="round" strokeCap="round" />
  );
};

export default LineLayer;
