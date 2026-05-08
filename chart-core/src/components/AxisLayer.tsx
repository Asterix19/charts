import {
  DashPathEffect,
  Group,
  Line,
  Text as SkText,
  matchFont,
} from '@shopify/react-native-skia';
import React, { useMemo } from 'react';
import { Platform } from 'react-native';
import { getY, getThemeColors, getPriceTicks, getTimeTicks, priceTickCount } from '../core';
import type { ChartThemeColors, Candle, ChartTheme } from '../core';

const isWeb = Platform.OS === 'web';

interface Props {
  sortedData: Candle[];
  viewportStart: number;
  viewportEnd: number;
  /** Detected candle interval in ms (from resolveIntervalMs). */
  intervalMs: number;
  width: number;
  height: number;
  priceMin: number;
  priceMax: number;
  padding: { top: number; right: number; bottom: number; left: number };
  theme?: ChartTheme | ChartThemeColors;
  hour12?: boolean;
  showGrid?: boolean;
}

const AxisLayer: React.FC<Props> = ({
  sortedData, viewportStart, viewportEnd, intervalMs,
  width, height, priceMin, priceMax,
  padding, theme = 'dark', hour12 = false, showGrid = true,
}) => {
  const font = useMemo(() => {
    if (isWeb) return null;
    try {
      return matchFont({
        fontFamily: Platform.select({ ios: 'Helvetica Neue', android: 'sans-serif', default: 'Arial' }) ?? 'Arial',
        fontSize: 10,
      });
    } catch {
      return null;
    }
  }, []);
  const canDrawText = !isWeb && !!font;

  const colors = getThemeColors(theme);
  const chartHeight = height - padding.top - padding.bottom;
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
    <Group>
      {yTicks.map((val, idx) => {
        const y = padding.top + getY(val, priceMin, priceMax, chartHeight);
        if (y < padding.top || y > padding.top + chartHeight) return null;
        const label = val.toFixed(2);
        const textWidth = canDrawText ? font!.measureText(label).width : 0;
        return (
          <Group key={`y-${idx}`}>
            {showGrid && (
              <Line p1={{ x: padding.left, y }} p2={{ x: padding.left + chartWidth, y }} color={colors.gridH} strokeWidth={1}>
                {!isWeb && <DashPathEffect intervals={[4, 2]} />}
              </Line>
            )}
            {canDrawText && (
              <SkText x={padding.left + chartWidth + 6} y={y + 4} text={label} font={font!} color={colors.priceLabel} />
            )}
          </Group>
        );
      })}

      {xTicks.map(({ x, label, ts }) => {
        // Skia clips outside the canvas automatically; no explicit bounds check needed.
        const px = padding.left + x;
        const textWidth = canDrawText ? font!.measureText(label).width : 0;
        return (
          <Group key={String(ts)}>
            {showGrid && (
              <Line
                p1={{ x: px, y: padding.top }}
                p2={{ x: px, y: padding.top + chartHeight }}
                color={colors.gridV}
                strokeWidth={1}
              >
                {!isWeb && <DashPathEffect intervals={[2, 2]} />}
              </Line>
            )}
            {canDrawText && (
              <SkText
                x={px - textWidth / 2}
                y={padding.top + chartHeight + padding.bottom - 4}
                text={label}
                font={font!}
                color={colors.timeLabel}
              />
            )}
          </Group>
        );
      })}
    </Group>
  );
};

export default AxisLayer;
