/**
 * CustomPanelLayer — renders one caller-supplied `CustomPanel`'s series below the main chart.
 *
 * Unlike RsiLayer/MacdLayer/VolumeLayer, this has no indicator math of its own: it plots
 * whatever `IndicatorLine` series it's given within the Y range the caller resolved (via
 * `computeCustomPanelYRange`), plus optional horizontal reference lines — the same visual idea
 * as RSI's fixed 30/70 threshold lines, generalized to any value(s).
 */

import { Group, Line, Path } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { buildSeriesPoints, buildTimestampIndex, getThemeColors, getY } from '../core';
import type { Candle, ChartTheme, ChartThemeColors, IndicatorLine, TsPoint } from '../core';
import { buildSmoothPath } from '../pathUtils';

interface Props {
  series: { line: IndicatorLine; data: TsPoint[] }[];
  candleData: Candle[];
  width: number;
  height: number;
  yMin: number;
  yMax: number;
  referenceLines?: number[];
  theme?: ChartTheme | ChartThemeColors;
}

const CustomPanelLayer: React.FC<Props> = ({ series, candleData, width, height, yMin, yMax, referenceLines, theme = 'dark' }) => {
  const colors = getThemeColors(theme);
  const total = candleData.length;
  const indexByTimestamp = useMemo(() => buildTimestampIndex(candleData), [candleData]);

  const paths = useMemo(() => {
    if (total < 2) return [];
    return series
      .filter(({ data }) => data.length > 0)
      .map(({ line, data }) => ({
        color: line.color,
        path: buildSmoothPath(buildSeriesPoints(data, indexByTimestamp, total, width, height, yMin, yMax)),
      }))
      .filter((entry): entry is { color: string; path: NonNullable<typeof entry.path> } => entry.path !== null);
  }, [series, indexByTimestamp, total, width, height, yMin, yMax]);

  return (
    <Group>
      {referenceLines?.map((value, i) => (
        <Line key={i} p1={{ x: 0, y: getY(value, yMin, yMax, height) }} p2={{ x: width, y: getY(value, yMin, yMax, height) }} color={colors.rsiThreshold} strokeWidth={1} />
      ))}
      {paths.map(({ color, path }, i) => (
        <Path key={i} path={path} style="stroke" strokeWidth={2} color={color} strokeJoin="round" strokeCap="round" />
      ))}
    </Group>
  );
};

export default CustomPanelLayer;
