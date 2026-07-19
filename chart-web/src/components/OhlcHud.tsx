/**
 * OhlcHud — always-on OHLC overlay for the active or latest candle.
 *
 * Plain-DOM port of chart-core's OhlcHud: same layout/behavior, but built
 * with <div>/<span> + pointer events for the drag handle instead of
 * RN View/Text + PanResponder.
 */

import { abbrevName, findIndicatorValue, getThemeColors } from '@stacklatte/chart-core/core';
import type { Candle, ChartTheme, ChartThemeColors, IndicatorLine } from '@stacklatte/chart-core/core';
import React, { useRef, useState } from 'react';

interface Props {
  candle: Candle;
  isLive: boolean;
  theme: ChartTheme | ChartThemeColors;
  indicators?: IndicatorLine[];
  rsiValue?: number | null;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatPrice(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const OhlcHud: React.FC<Props> = ({ candle, isLive, theme, indicators, rsiValue }) => {
  const [pos, setPos] = useState({ top: 6, left: 6 });
  const dragStartRef = useRef({ top: 6, left: 6 });
  const pointerStartRef = useRef({ x: 0, y: 0 });
  const draggingRef = useRef(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true;
    dragStartRef.current = pos;
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - pointerStartRef.current.x;
    const dy = e.clientY - pointerStartRef.current.y;
    setPos({
      top: Math.max(0, dragStartRef.current.top + dy),
      left: Math.max(0, dragStartRef.current.left + dx),
    });
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const colors = getThemeColors(theme);

  const change = ((candle.close - candle.open) / candle.open) * 100;
  const isBullish = candle.close >= candle.open;
  const changeColor = isBullish ? colors.candleUp : colors.candleDown;
  const changeSign = change >= 0 ? '+' : '';

  return (
    <div
      style={{
        position: 'absolute',
        top: pos.top,
        left: pos.left,
        paddingLeft: 10,
        paddingRight: 10,
        paddingBottom: 8,
        paddingTop: 2,
        borderRadius: 6,
        zIndex: 10,
        minWidth: 110,
        backgroundColor: colors.hudBackground,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        userSelect: 'none',
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingTop: 4,
          paddingBottom: 4,
          cursor: 'grab',
        }}
      >
        <GripDots color={colors.hudText} />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {isLive ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: colors.candleUp }} />
              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, color: colors.candleUp }}>
                LIVE
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: 0.3, color: colors.priceLabel }}>
              {formatTime(candle.timestamp)}
            </span>
          )}
          <span style={{ fontSize: 10, fontWeight: 700, color: changeColor }}>
            {changeSign}
            {change.toFixed(2)}%
          </span>
        </div>
      </div>

      <Row label="O" value={formatPrice(candle.open)} colors={colors} />
      <Row label="H" value={formatPrice(candle.high)} colors={colors} />
      <Row label="L" value={formatPrice(candle.low)} colors={colors} />
      <Row label="C" value={formatPrice(candle.close)} colors={colors} valueColor={changeColor} />

      {rsiValue != null && (
        <div style={rowStyle}>
          <span style={{ ...dotStyle, backgroundColor: colors.rsiLine }} />
          <span style={{ ...labelStyle, color: colors.hudText }}>RSI</span>
          <span style={{ ...valueStyle, color: colors.rsiLine }}>{rsiValue.toFixed(1)}</span>
        </div>
      )}

      {indicators?.map((ind) => {
        const val = findIndicatorValue(ind.data, candle.timestamp);
        if (val === null) return null;
        return (
          <div key={ind.id} style={rowStyle}>
            <span style={{ ...dotStyle, backgroundColor: ind.color }} />
            <span style={{ ...labelStyle, color: colors.hudText }}>{abbrevName(ind.name ?? ind.id)}</span>
            <span style={{ ...valueStyle, color: ind.color }}>{val.toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
};

const GripDots: React.FC<{ color: string }> = ({ color }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', width: 12 }}>
    {[0, 1, 2, 3, 4, 5].map((i) => (
      <span
        key={i}
        style={{ width: 3, height: 3, borderRadius: 1.5, margin: 1, opacity: 0.4, backgroundColor: color }}
      />
    ))}
  </div>
);

const rowStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', paddingTop: 1, paddingBottom: 1 };
const dotStyle: React.CSSProperties = { width: 6, height: 6, borderRadius: 3, marginRight: 5, display: 'inline-block' };
const labelStyle: React.CSSProperties = { fontSize: 11, width: 26, display: 'inline-block' };
const valueStyle: React.CSSProperties = { fontSize: 11, fontWeight: 600 };

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

export default OhlcHud;
