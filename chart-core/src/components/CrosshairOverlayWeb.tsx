/**
 * CrosshairOverlayWeb — dashed crosshair for React Native Web.
 *
 * Skia's DashPathEffect is not available on web, so this component
 * reproduces the crosshair using absolutely-positioned Views with CSS
 * dashed borders.  It sits on top of the canvas with pointerEvents: 'none'
 * so it never interferes with touch/mouse handling.
 *
 * Color is injected by the parent from the theme system.
 */

import React from 'react';
import { View } from 'react-native';
import type { ChartPadding } from '../core';

interface Props {
  /** Horizontal position in plot-local coordinates (null = hidden). */
  x: number | null;
  /** Vertical position in plot-local coordinates (null = hidden). */
  y: number | null;
  chartWidth: number;
  mainChartHeight: number;
  padding: ChartPadding;
  /** Stroke color — injected from the theme crosshair color. */
  color?: string;
}

const CrosshairOverlayWeb: React.FC<Props> = ({
  x, y, chartWidth, mainChartHeight, padding, color = '#888',
}) => {
  if (x == null || y == null) return null;

  // Convert plot-local coords to canvas-absolute coords
  const absX = padding.left + x;
  const absY = padding.top + y;

  return (
    // @ts-ignore — pointerEvents not in RN types for web
    <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none' }}>
      {/* Vertical dashed line */}
      <View
        style={{
          position: 'absolute',
          left: absX,
          top: padding.top,
          width: 1,
          height: mainChartHeight,
          // @ts-ignore
          borderLeftWidth: 1,
          borderLeftColor: color,
          borderStyle: 'dashed',
        }}
      />
      {/* Horizontal dashed line */}
      <View
        style={{
          position: 'absolute',
          left: padding.left,
          top: absY,
          width: chartWidth,
          height: 1,
          // @ts-ignore
          borderTopWidth: 1,
          borderTopColor: color,
          borderStyle: 'dashed',
        }}
      />
    </View>
  );
};

export default CrosshairOverlayWeb;
