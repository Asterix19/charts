/**
 * MarkerTooltip — hover (web) / tap (native) tooltip for a single trade
 * marker (entry, exit, stop-loss, take-profit).
 *
 * Purely presentational: the parent resolves which marker is active (via
 * findMarkerAt()) and passes its plot-local x/y here; this component only
 * turns that + the marker's own fields into an absolutely-positioned box,
 * offset above-right of the marker and clamped to stay inside the chart —
 * same "dumb overlay driven by props" shape as CrosshairOverlayWeb.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getMarkerKindLabel, getThemeColors } from '../core';
import type { ChartPadding, ChartTheme, ChartThemeColors, MarkerPoint } from '../core';

interface Props {
  point: MarkerPoint;
  /**
   * Plot-local pixel position of the marker, pre-padding — same coordinate
   * space the candle/marker layers draw in inside their transformed Group.
   * The caller is responsible for folding in fractionalOffsetX (scroll
   * sub-pixel offset) the same way that Group's transform does.
   */
  x: number;
  y: number;
  padding: ChartPadding;
  /** Full chart box, for clamping the tooltip so it never renders off-screen. */
  containerWidth: number;
  containerHeight: number;
  theme: ChartTheme | ChartThemeColors;
}

const TOOLTIP_WIDTH = 132;
const TOOLTIP_HEIGHT_ESTIMATE = 78; // rough; only used for edge-clamping, not layout

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function formatPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const MarkerTooltip: React.FC<Props> = ({ point, x, y, padding, containerWidth, containerHeight, theme }) => {
  const colors = getThemeColors(theme);

  const absX = padding.left + x;
  const absY = padding.top + y;

  const left = clamp(absX + 10, 0, Math.max(0, containerWidth - TOOLTIP_WIDTH));
  const top = clamp(absY - TOOLTIP_HEIGHT_ESTIMATE - 10, 0, Math.max(0, containerHeight - TOOLTIP_HEIGHT_ESTIMATE));

  const heading = point.label ?? getMarkerKindLabel(point.kind);
  const isPositive = (point.changePct ?? 0) >= 0;
  const changeColor = isPositive ? colors.candleUp : colors.candleDown;

  return (
    <View
      // @ts-ignore — pointerEvents not in RN types for web
      pointerEvents="none"
      style={[styles.container, { top, left, width: TOOLTIP_WIDTH, backgroundColor: colors.hudBackground }]}
    >
      <Text style={[styles.heading, { color: colors.hudText }]} numberOfLines={1}>{heading}</Text>
      <Row label="Price" value={formatPrice(point.price)} colors={colors} />
      <Row label="Time" value={formatTime(point.timestamp)} colors={colors} />
      {point.changePct != null && (
        <Row
          label="Chg"
          value={`${isPositive ? '+' : ''}${point.changePct.toFixed(2)}%`}
          colors={colors}
          valueColor={changeColor}
        />
      )}
    </View>
  );
};

const Row: React.FC<{
  label: string;
  value: string;
  colors: ChartThemeColors;
  valueColor?: string;
}> = ({ label, value, colors, valueColor }) => (
  <View style={styles.row}>
    <Text style={[styles.label, { color: colors.hudText }]}>{label}</Text>
    <Text style={[styles.value, { color: valueColor ?? colors.hudText }]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    zIndex: 20,
  },
  heading: {
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 1,
  },
  label: {
    fontSize: 10,
    fontFamily: 'Courier',
    opacity: 0.75,
  },
  value: {
    fontSize: 10,
    fontFamily: 'Courier',
    fontWeight: '600',
  },
});

export default MarkerTooltip;
