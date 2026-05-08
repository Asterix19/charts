import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { getY, getThemeColors, getPriceTicks, getTimeTicks, priceTickCount } from '../core';
import type { ChartThemeColors, Candle, ChartTheme } from '../core';

interface Props {
  sortedData: Candle[];
  viewportStart: number;
  viewportEnd: number;
  /** Detected candle interval in ms (from resolveIntervalMs). */
  intervalMs: number;
  width: number;
  canvasHeight: number;
  priceMin: number;
  priceMax: number;
  padding: { top: number; right: number; bottom: number; left: number };
  theme?: ChartTheme | ChartThemeColors;
  hour12?: boolean;
}

const AxisLabelsWeb: React.FC<Props> = ({
  sortedData, viewportStart, viewportEnd, intervalMs,
  width, canvasHeight, priceMin, priceMax,
  padding, theme = 'dark', hour12 = false,
}) => {
  const colors = getThemeColors(theme);
  const chartHeight = canvasHeight - padding.top - padding.bottom;
  const chartWidth  = width - padding.left - padding.right;

  const yTicks = useMemo(
    () => getPriceTicks(priceMin, priceMax, priceTickCount(chartHeight)),
    [priceMin, priceMax, chartHeight],
  );
  const xTicks = useMemo(
    () => getTimeTicks(sortedData, viewportStart, viewportEnd, intervalMs, chartWidth, hour12),
    [sortedData, viewportStart, viewportEnd, intervalMs, chartWidth, hour12],
  );

  return (
    // @ts-ignore — pointerEvents not in RN types for web
    <View style={{ position: 'absolute', top: 0, left: 0, width, height: canvasHeight, pointerEvents: 'none', overflow: 'hidden' }}>
      {yTicks.map((val, idx) => {
        const y = padding.top + getY(val, priceMin, priceMax, chartHeight);
        if (y < padding.top || y > padding.top + chartHeight) return null;
        return (
          <Text
            key={`y-${idx}`}
            style={{
              position: 'absolute',
              right: 2,
              top: y - 6,
              color: colors.priceLabel,
              fontSize: 9,
              fontFamily: 'monospace',
            }}
          >
            {val.toFixed(2)}
          </Text>
        );
      })}

      {/* x-axis: keyed by absolute timestamp so the same DOM node slides
          smoothly left/right as the viewport pans — no text content changes,
          no mount/unmount flicker. */}
      {xTicks.map(({ x, label, ts }) => {
        const left = padding.left + x;
        return (
          <Text
            key={String(ts)}
            style={{
              position: 'absolute',
              left: left - 20,
              top: padding.top + chartHeight + 4,
              width: 40,
              textAlign: 'center',
              color: colors.timeLabel,
              fontSize: 9,
              fontFamily: 'monospace',
            }}
          >
            {label}
          </Text>
        );
      })}
    </View>
  );
};

export default AxisLabelsWeb;
