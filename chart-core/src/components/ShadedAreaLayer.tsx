/**
 * ShadedAreaLayer — fills the area between two indicator series.
 *
 * Useful for visualising bands (e.g. Bollinger Bands, Ichimoku Cloud).
 * The filled polygon is built from the `from` series going left-to-right
 * and the `to` series going right-to-left, then closed.  All coordinate
 * math lives in buildShadedAreaPoints() in core.
 *
 * Color and opacity are injected by the parent — this layer is theme-agnostic.
 */

import { Path, Skia } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { buildShadedAreaPoints, buildTimestampIndex, resolveYRange } from '../core';
import type { Candle, TsPoint } from '../core';

interface Props {
  /** Upper boundary series (timestamps must match candles). */
  from: TsPoint[];
  /** Lower boundary series (timestamps must match candles). */
  to: TsPoint[];
  candleData: Candle[];
  width: number;
  height: number;
  /** Fill color — injected from the shaded-area definition. */
  color: string;
  /** Fill opacity (0–1). */
  opacity: number;
  /** Optional fixed Y-axis minimum — defaults to visible price range. */
  yMin?: number;
  /** Optional fixed Y-axis maximum — defaults to visible price range. */
  yMax?: number;
}

const ShadedAreaLayer: React.FC<Props> = ({ from, to, candleData, width, height, color, opacity, yMin, yMax }) => {
  const total = candleData.length;
  // Build timestamp→index map once per visible-candle set
  const indexByTimestamp = useMemo(() => buildTimestampIndex(candleData), [candleData]);
  // Resolve Y range: use explicit bounds or fall back to visible price range
  const { min, max } = useMemo(() => resolveYRange(candleData, yMin, yMax), [candleData, yMin, yMax]);

  // Build the filled polygon from the two boundary series
  const areaPath = useMemo(() => {
    if (total < 2) return null;
    const { top, bottom } = buildShadedAreaPoints(from, to, indexByTimestamp, total, width, height, min, max);
    // Concatenate top (L→R) + bottom (R→L) to form a closed polygon
    const pts = [...top, ...bottom];
    if (pts.length < 3) return null;

    const path = Skia.Path.Make();
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
    path.close();
    return path;
  }, [from, to, indexByTimestamp, total, width, height, min, max]);

  if (!areaPath) return null;

  return <Path path={areaPath} style="fill" color={color} opacity={opacity} />;
};

export default ShadedAreaLayer;
