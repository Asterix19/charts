/**
 * MarkerLayer — renders trade/event markers (entry, exit, stop-loss,
 * take-profit) on top of the main price panel.
 *
 * Geometry comes from buildMarkerPoints() in core — the exact same
 * getCandleX/getY pixel math the candle layer uses — so markers stay in
 * sync through pan/zoom/live updates with no external state. Shape/color
 * per marker kind is resolved via getMarkerStyle() from the theme system.
 *
 * Markers are drawn at a fixed pixel size regardless of zoom level.
 */

import { Circle, Group, Line, Path } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import {
  buildMarkerPoints,
  buildTimestampIndex,
  getMarkerStyle,
  getThemeColors,
  MARKER_SIZE,
} from '../core';
import type { Candle, ChartMarker, ChartTheme, ChartThemeColors } from '../core';
import { buildTrianglePath } from '../pathUtils';

interface Props {
  markers: ChartMarker[];
  candleData: Candle[];
  width: number;
  height: number;
  priceMin: number;
  priceMax: number;
  theme?: ChartTheme | ChartThemeColors;
}

const MarkerLayer: React.FC<Props> = ({
  markers, candleData, width, height, priceMin, priceMax, theme = 'dark',
}) => {
  const colors = getThemeColors(theme);
  const total = candleData.length;

  const indexByTimestamp = useMemo(() => buildTimestampIndex(candleData), [candleData]);

  const points = useMemo(
    () => buildMarkerPoints(markers, indexByTimestamp, total, width, height, priceMin, priceMax),
    [markers, indexByTimestamp, total, width, height, priceMin, priceMax],
  );

  if (points.length === 0) return null;

  return (
    <Group>
      {points.map((pt, i) => {
        const { shape, color } = getMarkerStyle(pt.kind, colors);
        const key = `${pt.kind}-${i}`;

        switch (shape) {
          case 'triangle-up':
            return <Path key={key} path={buildTrianglePath(pt.x, pt.y, MARKER_SIZE, true)} color={color} />;
          case 'triangle-down':
            return <Path key={key} path={buildTrianglePath(pt.x, pt.y, MARKER_SIZE, false)} color={color} />;
          case 'x': {
            const half = MARKER_SIZE / 2;
            return (
              <Group key={key}>
                <Line p1={{ x: pt.x - half, y: pt.y - half }} p2={{ x: pt.x + half, y: pt.y + half }} color={color} strokeWidth={2} />
                <Line p1={{ x: pt.x - half, y: pt.y + half }} p2={{ x: pt.x + half, y: pt.y - half }} color={color} strokeWidth={2} />
              </Group>
            );
          }
          case 'dot':
            return <Circle key={key} cx={pt.x} cy={pt.y} r={MARKER_SIZE / 2} color={color} />;
        }
      })}
    </Group>
  );
};

export default MarkerLayer;
