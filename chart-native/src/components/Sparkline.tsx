/**
 * SLSparkline — the compact renderer behind `<SLChart sparkline … />`: the whole dataset as an area (or a line) in a small
 * box, with no axes, panels, crosshair or gestures, so a list full of them scrolls normally.
 */
import { Canvas, Group } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { View } from 'react-native';
import { buildPaddedRange, computeSparklineLayout, getThemeColors, normalizeCandles } from '@stacklatte/chart-engine';
import type { ChartProps } from '@stacklatte/chart-engine';

import LineLayer from './LineLayer';

const SLSparkline: React.FC<ChartProps> = ({ data, width, height, theme = 'dark', chartType }) => {
  const colors = getThemeColors(theme);
  const sorted = useMemo(() => normalizeCandles(data), [data]);
  const range = useMemo(() => {
    if (!sorted.length) return { min: 0, max: 1 };
    const closes = sorted.map((c) => c.close);
    return buildPaddedRange(Math.min(...closes), Math.max(...closes), 0.05);
  }, [sorted]);
  const L = computeSparklineLayout(width, height);

  return (
    <View pointerEvents="none" style={{ width, height, backgroundColor: colors.background }}>
      {sorted.length >= 2 && (
        <Canvas style={{ width, height }}>
          <Group transform={[{ translateX: L.padding.left }, { translateY: L.padding.top }]}>
            <LineLayer
              data={sorted}
              width={L.chartWidth}
              height={L.mainChartHeight}
              priceMin={range.min}
              priceMax={range.max}
              color={colors.lineChart}
              fill={chartType !== 'line'}
              strokeWidth={1.5}
            />
          </Group>
        </Canvas>
      )}
    </View>
  );
};

export default SLSparkline;
