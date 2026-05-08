/**
 * CandlestickLayer — renders OHLC bars (wick + body) for every visible candle.
 *
 * All geometry (x position, body bounds, wick bounds, body width) is computed
 * by buildCandleGeometry() in core.  This component only iterates the result
 * and issues Skia draw calls.
 *
 * Colors are injected via props from the theme system so this component stays
 * theme-agnostic.
 */

import { Group, Line, Rect } from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { buildCandleGeometry } from '../core';
import type { Candle } from '../core';

interface Props {
  data: Candle[];
  width: number;
  height: number;
  priceMin: number;
  priceMax: number;
  /** Bullish candle color — pass theme.candleUp from the parent. */
  colorUp?: string;
  /** Bearish candle color — pass theme.candleDown from the parent. */
  colorDown?: string;
}

const CandlestickLayer: React.FC<Props> = ({
  data, width, height, priceMin, priceMax,
  colorUp, colorDown,
}) => {
  // Memoised so geometry is only rebuilt when the visible candle set changes
  const bars = useMemo(
    () => buildCandleGeometry(data, width, height, priceMin, priceMax, colorUp, colorDown),
    [data, width, height, priceMin, priceMax, colorUp, colorDown]
  );

  return (
    <Group>
      {bars.map((bar, i) => (
        <Group key={String(data[i].timestamp ?? i)}>
          {/* Wick — thin vertical line from high to low */}
          <Line p1={{ x: bar.x, y: bar.wick.y1 }} p2={{ x: bar.x, y: bar.wick.y2 }} color={bar.color} strokeWidth={1} />
          {/* Body — filled rectangle between open and close */}
          <Rect
            x={bar.x - bar.width / 2}
            y={bar.body.y}
            width={bar.width}
            height={bar.body.height}
            color={bar.color}
            opacity={0.9}
          />
        </Group>
      ))}
    </Group>
  );
};

export default CandlestickLayer;
