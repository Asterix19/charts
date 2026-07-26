/**
 * MarkerTooltip — hover tooltip for a single trade marker (entry, exit,
 * stop-loss, take-profit).
 *
 * Plain-DOM port of chart-core's MarkerTooltip: same content/positioning
 * logic, built with <div>/<span> instead of RN View/Text. Purely
 * presentational — the parent resolves which marker is hovered (via
 * findMarkerAt()) and passes its plot-local x/y here.
 */

import { getMarkerKindLabel, getThemeColors } from '@stacklatte/chart-core/core';
import type { ChartPadding, ChartTheme, ChartThemeColors, MarkerPoint } from '@stacklatte/chart-core/core';
import React from 'react';

interface Props {
  point: MarkerPoint;
  /**
   * Plot-local pixel position of the marker, pre-padding — same coordinate
   * space the candle/marker canvas draws in after its ctx.translate. The
   * caller is responsible for folding in fractionalOffsetX (scroll
   * sub-pixel offset) the same way that translate does.
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
    <div
      style={{
        position: 'absolute',
        top,
        left,
        width: TOOLTIP_WIDTH,
        borderRadius: 6,
        paddingTop: 6,
        paddingBottom: 6,
        paddingLeft: 10,
        paddingRight: 10,
        zIndex: 20,
        pointerEvents: 'none',
        backgroundColor: colors.hudBackground,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        userSelect: 'none',
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 3, color: colors.hudText, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {heading}
      </div>
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
    </div>
  );
};

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 1, paddingBottom: 1 };
const labelStyle: React.CSSProperties = { fontSize: 10, opacity: 0.75 };
const valueStyle: React.CSSProperties = { fontSize: 10, fontWeight: 600 };

const Row: React.FC<{
  label: string;
  value: string;
  colors: ChartThemeColors;
  valueColor?: string;
}> = ({ label, value, colors, valueColor }) => (
  <div style={rowStyle}>
    <span style={{ ...labelStyle, color: colors.hudText }}>{label}</span>
    <span style={{ ...valueStyle, color: valueColor ?? colors.hudText }}>{value}</span>
  </div>
);

export default MarkerTooltip;
