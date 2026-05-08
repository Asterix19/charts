/**
 * IndicatorLayer — draws a single indicator line (e.g. EMA, SMA) on the
 * main chart panel.
 *
 * Point coordinates are computed by buildSeriesPoints() in core, which
 * aligns each TsPoint to the corresponding visible candle by timestamp.
 * The Y range can be pinned via yMin/yMax props (defaults to the visible
 * candle price range via resolveYRange).
 *
 * Color is injected by the parent — this layer is theme-agnostic.
 */

import { Path } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { buildSeriesPoints, buildTimestampIndex, resolveYRange } from '../core';
import type { Candle, TsPoint } from '../core';
import { buildSmoothPath } from '../pathUtils';

interface Props {
  data: TsPoint[];
  candleData: Candle[];
  width: number;
  height: number;
  /** Stroke color — injected from the indicator definition. */
  color: string;
  /** Optional fixed Y-axis minimum — defaults to visible price range. */
  yMin?: number;
  /** Optional fixed Y-axis maximum — defaults to visible price range. */
  yMax?: number;
}

const IndicatorLayer: React.FC<Props> = ({ data, candleData, width, height, color, yMin, yMax }) => {
  const total = candleData.length;
  // Build timestamp→index map once per visible-candle set
  const indexByTimestamp = useMemo(() => buildTimestampIndex(candleData), [candleData]);
  // Resolve Y range: use explicit bounds or fall back to visible price range
  const { min, max } = useMemo(() => resolveYRange(candleData, yMin, yMax), [candleData, yMin, yMax]);

  // Build the Skia path from core point coordinates
  const path = useMemo(() => {
    if (total < 2 || data.length === 0) return null;
    const pts = buildSeriesPoints(data, indexByTimestamp, total, width, height, min, max);
    return buildSmoothPath(pts);
  }, [data, indexByTimestamp, total, width, height, min, max]);

  if (!path) return null;

  return (
    <Path path={path} style="stroke" strokeWidth={2} color={color} strokeJoin="round" strokeCap="round" />
  );
};

export default IndicatorLayer;
