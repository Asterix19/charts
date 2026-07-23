/**
 * VolumeLayer — renders the volume sub-panel below the main chart.
 *
 * Bars are colored per candle direction (candleUp/candleDown), same as the
 * main candlestick body colors. Geometry comes from buildVolumeBars() in
 * core, anchored to a fixed [0, yMax] range computed by computeVolumeYRange.
 */

import { Group, Rect } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { buildVolumeBars, computeVolumeYRange, getThemeColors } from '../core';
import type { Candle, ChartTheme, ChartThemeColors } from '../core';

interface Props {
  candleData: Candle[];
  width: number;
  height: number;
  theme?: ChartTheme | ChartThemeColors;
}

const VolumeLayer: React.FC<Props> = ({ candleData, width, height, theme = 'dark' }) => {
  const colors = getThemeColors(theme);

  const { yMax } = useMemo(() => computeVolumeYRange(candleData), [candleData]);

  const bars = useMemo(
    () => buildVolumeBars(candleData, width, height, yMax, colors.candleUp, colors.candleDown),
    [candleData, width, height, yMax, colors.candleUp, colors.candleDown],
  );

  return (
    <Group>
      {bars.map((bar, i) => (
        <Rect
          key={String(candleData[i]?.timestamp ?? i)}
          x={bar.x}
          y={bar.y}
          width={bar.width}
          height={bar.height}
          color={bar.color}
          opacity={0.6}
        />
      ))}
    </Group>
  );
};

export default VolumeLayer;
