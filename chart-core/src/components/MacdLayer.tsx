/**
 * MacdLayer — renders the MACD sub-panel below the main chart.
 *
 * Layout (Y axis centered at 0, symmetric range):
 *   Histogram bars  — green when positive, red when negative
 *   Zero line       — threshold reference
 *   MACD line       — blue
 *   Signal line     — amber
 */

import { Group, Line, Path, Rect } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import {
  buildMacdHistogramBars,
  buildSeriesPoints,
  buildTimestampIndex,
  computeMacdYRange,
  getThemeColors,
  getY,
  MACD_COLORS,
} from '../core';
import { buildSmoothPath } from '../pathUtils';
import type { Candle, ChartTheme, ChartThemeColors, TsPoint } from '../core';

interface Props {
  macd: TsPoint[];
  signal: TsPoint[];
  histogram: TsPoint[];
  candleData: Candle[];
  width: number;
  height: number;
  theme?: ChartTheme | ChartThemeColors;
}

const MacdLayer: React.FC<Props> = ({
  macd, signal, histogram, candleData, width, height, theme = 'dark',
}) => {
  const colors = getThemeColors(theme);
  const total = candleData.length;
  const indexByTimestamp = useMemo(() => buildTimestampIndex(candleData), [candleData]);

  const { yMin, yMax } = useMemo(
    () => computeMacdYRange(macd, signal, histogram),
    [macd, signal, histogram],
  );

  const zeroY = useMemo(() => getY(0, yMin, yMax, height), [yMin, yMax, height]);

  const histBars = useMemo(
    () => buildMacdHistogramBars(histogram, indexByTimestamp, total, width, height, yMin, yMax, zeroY),
    [histogram, indexByTimestamp, total, width, height, yMin, yMax, zeroY],
  );

  const macdPath = useMemo(() => {
    if (total < 2 || macd.length === 0) return null;
    const pts = buildSeriesPoints(macd, indexByTimestamp, total, width, height, yMin, yMax);
    if (pts.length < 2) return null;
    return buildSmoothPath(pts);
  }, [macd, indexByTimestamp, total, width, height, yMin, yMax]);

  const signalPath = useMemo(() => {
    if (total < 2 || signal.length === 0) return null;
    const pts = buildSeriesPoints(signal, indexByTimestamp, total, width, height, yMin, yMax);
    if (pts.length < 2) return null;
    return buildSmoothPath(pts);
  }, [signal, indexByTimestamp, total, width, height, yMin, yMax]);

  if (total === 0) return null;

  return (
    <Group>
      {/* Zero line */}
      <Line
        p1={{ x: 0, y: zeroY }}
        p2={{ x: width, y: zeroY }}
        color={colors.rsiThreshold}
        strokeWidth={1}
      />

      {/* Histogram bars */}
      {histBars.map((bar, i) => (
        <Rect
          key={i}
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          color={bar.isPositive ? MACD_COLORS.histPos : MACD_COLORS.histNeg}
          opacity={0.75}
        />
      ))}

      {/* MACD line */}
      {macdPath && (
        <Path
          path={macdPath}
          style="stroke"
          strokeWidth={1.5}
          color={MACD_COLORS.line}
          strokeJoin="round"
          strokeCap="round"
        />
      )}

      {/* Signal line */}
      {signalPath && (
        <Path
          path={signalPath}
          style="stroke"
          strokeWidth={1.5}
          color={MACD_COLORS.signal}
          strokeJoin="round"
          strokeCap="round"
        />
      )}
    </Group>
  );
};

export default MacdLayer;
