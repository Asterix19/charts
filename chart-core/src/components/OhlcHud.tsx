/**
 * OhlcHud — always-on OHLC overlay for the active or latest candle.
 *
 * When isLive is true the HUD shows the latest visible candle with a live
 * pulse indicator.  When a crosshair is active (isLive=false) it shows the
 * pinned candle's data and the candle's timestamp.
 *
 * The component never unmounts while showOhlcHud is true, so the user's
 * chosen drag position is preserved across crosshair open/close cycles.
 *
 * Drag: press and hold the grip strip at the top to reposition.
 */

import React, { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';
import { getThemeColors, abbrevName, findIndicatorValue } from '../core';
import type { ChartThemeColors, Candle, ChartTheme, IndicatorLine } from '../core';

interface Props {
  /** The candle to display — always non-null (ChartCanvas provides latest as fallback). */
  candle: Candle;
  /** True when displaying the latest candle (no crosshair active). */
  isLive: boolean;
  theme: ChartTheme | ChartThemeColors;
  indicators?: IndicatorLine[];
  rsiValue?: number | null;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatPrice(n: number): string {
  // Use at most 2 decimal places; large numbers get commas.
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const OhlcHud: React.FC<Props> = ({
  candle, isLive, theme, indicators, rsiValue, onDragStart, onDragEnd,
}) => {
  const [pos, setPos] = useState({ top: 6, left: 6 });
  const posRef       = useRef({ top: 6, left: 6 });
  const dragStartRef = useRef({ top: 6, left: 6 });

  const dragResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStartRef.current = { ...posRef.current };
        onDragStart?.();
      },
      onPanResponderMove: (_, g) => {
        const next = {
          top:  Math.max(0, dragStartRef.current.top  + g.dy),
          left: Math.max(0, dragStartRef.current.left + g.dx),
        };
        posRef.current = next;
        setPos(next);
      },
      onPanResponderRelease:   () => onDragEnd?.(),
      onPanResponderTerminate: () => onDragEnd?.(),
    })
  ).current;

  const colors = getThemeColors(theme);

  const change      = ((candle.close - candle.open) / candle.open) * 100;
  const isBullish   = candle.close >= candle.open;
  const changeColor = isBullish ? colors.candleUp : colors.candleDown;
  const closeColor  = changeColor;
  const changeSign  = change >= 0 ? '+' : '';

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.hudBackground, top: pos.top, left: pos.left },
      ]}
    >
      {/* ── Drag strip + live badge + % change ──────────────────────────── */}
      <View {...dragResponder.panHandlers} style={styles.header}>
        <GripDots color={colors.hudText} />
        <View style={styles.headerMeta}>
          {isLive ? (
            <View style={styles.liveBadge}>
              <View style={[styles.liveDot, { backgroundColor: colors.candleUp }]} />
              <Text style={[styles.liveText, { color: colors.candleUp }]}>LIVE</Text>
            </View>
          ) : (
            <Text style={[styles.timeText, { color: colors.priceLabel }]}>
              {formatTime(candle.timestamp)}
            </Text>
          )}
          <Text style={[styles.changeText, { color: changeColor }]}>
            {changeSign}{change.toFixed(2)}%
          </Text>
        </View>
      </View>

      {/* ── OHLC rows ──────────────────────────────────────────────────── */}
      <Row label="O" value={formatPrice(candle.open)}  colors={colors} />
      <Row label="H" value={formatPrice(candle.high)}  colors={colors} />
      <Row label="L" value={formatPrice(candle.low)}   colors={colors} />
      <Row label="C" value={formatPrice(candle.close)} colors={colors} valueColor={closeColor} />

      {/* RSI */}
      {rsiValue != null && (
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: colors.rsiLine }]} />
          <Text style={[styles.label, { color: colors.hudText }]}>RSI</Text>
          <Text style={[styles.value, { color: colors.rsiLine }]}>{rsiValue.toFixed(1)}</Text>
        </View>
      )}

      {/* Indicators */}
      {indicators?.map((ind) => {
        const val = findIndicatorValue(ind.data, candle.timestamp);
        if (val === null) return null;
        return (
          <View key={ind.id} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: ind.color }]} />
            <Text style={[styles.label, { color: colors.hudText }]}>
              {abbrevName(ind.name ?? ind.id)}
            </Text>
            <Text style={[styles.value, { color: ind.color }]}>{val.toFixed(2)}</Text>
          </View>
        );
      })}
    </View>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────

const GripDots: React.FC<{ color: string }> = ({ color }) => (
  <View style={styles.gripGrid}>
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <View key={i} style={[styles.gripDot, { backgroundColor: color }]} />
    ))}
  </View>
);

const Row: React.FC<{
  label: string;
  value: string;
  colors: ReturnType<typeof getThemeColors>;
  valueColor?: string;
}> = ({ label, value, colors, valueColor }) => (
  <View style={styles.row}>
    <Text style={[styles.label, { color: colors.hudText }]}>{label}</Text>
    <Text style={[styles.value, { color: valueColor ?? colors.hudText }]}>{value}</Text>
  </View>
);

// ── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    paddingHorizontal: 10,
    paddingBottom: 8,
    paddingTop: 2,
    borderRadius: 6,
    zIndex: 10,
    minWidth: 110,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    gap: 6,
    cursor: 'grab',
  } as any,
  headerMeta: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  timeText: {
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  changeText: {
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'Courier',
  },
  gripGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 12,
  },
  gripDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    margin: 1,
    opacity: 0.4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  label: {
    fontSize: 11,
    fontFamily: 'Courier',
    width: 26,
  },
  value: {
    fontSize: 11,
    fontFamily: 'Courier',
    fontWeight: '600',
  },
});

export default OhlcHud;
