/**
 * RsiLayer — renders the RSI sub-panel below the main chart.
 *
 * The RSI value range is always 0–100.  Horizontal threshold lines are drawn
 * at 70 (overbought) and 30 (oversold).  The Y coordinate for those lines is
 * computed via getY() from core — no magic numbers in this file.
 *
 * Colors come from the theme system.
 */

import { Group, Line, Path } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { buildSeriesPoints, buildTimestampIndex, getThemeColors, getY, RSI_MAX, RSI_MIN } from '../core';
import type { Candle, ChartTheme, ChartThemeColors, RsiPoint } from '../core';
import { buildSmoothPath } from '../pathUtils';

interface Props {
  data: RsiPoint[];
  candleData: Candle[];
  width: number;
  height: number;
  theme?: ChartTheme | ChartThemeColors;
}

const RsiLayer: React.FC<Props> = ({ data, candleData, width, height, theme = 'dark' }) => {
  const colors = getThemeColors(theme);

  const total = candleData.length;
  // Pre-build the timestamp → index map once per visible-candle set
  const indexByTimestamp = useMemo(() => buildTimestampIndex(candleData), [candleData]);

  // Overbought / oversold threshold pixel positions
  const y70 = useMemo(() => getY(70, RSI_MIN, RSI_MAX, height), [height]);
  const y30 = useMemo(() => getY(30, RSI_MIN, RSI_MAX, height), [height]);

  // Build the RSI curve path from core point coordinates
  const rsiPath = useMemo(() => {
    if (total < 2 || data.length === 0) return null;
    const pts = buildSeriesPoints(data, indexByTimestamp, total, width, height, RSI_MIN, RSI_MAX);
    return buildSmoothPath(pts);
  }, [data, indexByTimestamp, total, width, height]);

  return (
    <Group>
      {/* Overbought threshold line at RSI = 70 */}
      <Line p1={{ x: 0, y: y70 }} p2={{ x: width, y: y70 }} color={colors.rsiThreshold} strokeWidth={1} />
      {/* Oversold threshold line at RSI = 30 */}
      <Line p1={{ x: 0, y: y30 }} p2={{ x: width, y: y30 }} color={colors.rsiThreshold} strokeWidth={1} />
      {rsiPath && (
        <Path path={rsiPath} style="stroke" strokeWidth={2} color={colors.rsiLine} strokeJoin="round" strokeCap="round" />
      )}
    </Group>
  );
};

export default RsiLayer;
