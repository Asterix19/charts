/**
 * CrosshairLayer — dashed crosshair lines on the native (Skia) canvas.
 *
 * Renders a vertical line at x and a horizontal line at y within the plot
 * area.  DashPathEffect is used for the dashed style; it is not available
 * on web, so this component returns null on web — CrosshairOverlayWeb
 * handles the web case instead.
 *
 * Color is injected by the parent from the theme system.
 */

import { DashPathEffect, Group, Line } from '@shopify/react-native-skia';
import React from 'react';
import { Platform } from 'react-native';
import { parseDashArray } from '../core';

const isWeb = Platform.OS === 'web';

interface Props {
  /** Horizontal position in plot-local coordinates (null = hidden). */
  x: number | null;
  /** Vertical position in plot-local coordinates (null = hidden). */
  y: number | null;
  width: number;
  height: number;
  /** Stroke color — injected from the theme crosshair color. */
  color?: string;
  strokeWidth?: number;
  /** Space-separated dash/gap pattern, e.g. "4 4". */
  dash?: string;
}

const CrosshairLayer: React.FC<Props> = ({
  x, y, width, height,
  color = '#888',
  strokeWidth = 1,
  dash = '4 4',
}) => {
  if (x == null || y == null) return null;
  // On web DashPathEffect is not supported — CrosshairOverlayWeb renders instead
  if (isWeb) return null;

  const intervals = parseDashArray(dash);

  return (
    <Group>
      {/* Vertical line spanning the full plot height */}
      <Line p1={{ x, y: 0 }} p2={{ x, y: height }} color={color} strokeWidth={strokeWidth}>
        {intervals.length > 0 && <DashPathEffect intervals={intervals} />}
      </Line>
      {/* Horizontal line spanning the full plot width */}
      <Line p1={{ x: 0, y }} p2={{ x: width, y }} color={color} strokeWidth={strokeWidth}>
        {intervals.length > 0 && <DashPathEffect intervals={intervals} />}
      </Line>
    </Group>
  );
};

export default CrosshairLayer;
