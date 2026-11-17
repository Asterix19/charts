import type { Candle, TsPoint } from './types';

/**
 * Abbreviate an indicator name to at most 3 uppercase characters.
 *
 * Rules (first match wins):
 *  1. Multi-word string  → initials of each word   "Simple Moving Average" → "SMA"
 *  2. CamelCase string   → embedded capitals        "BollingerBandUpper"   → "BBU"
 *  3. Fallback           → first 3 chars upper      "ema14"                → "EMA"
 */
export function abbrevName(name: string): string {
  const trimmed = name.trim();
  if (/\s/.test(trimmed)) {
    return trimmed.split(/\s+/).map(w => w[0]).join('').toUpperCase().slice(0, 3);
  }
  const caps = trimmed.replace(/[^A-Z]/g, '');
  if (caps.length >= 2) return caps.slice(0, 3);
  return trimmed.slice(0, 3).toUpperCase();
}

/**
 * Look up an indicator's value at a specific timestamp.
 * Returns null if no matching point is found.
 */
export function findIndicatorValue(data: TsPoint[], timestamp: number): number | null {
  return data.find(p => p.timestamp === timestamp)?.value ?? null;
}

/**
 * Extend a series so it visually fills the entire visible candle window.
 * Adds a leading point at leftTs and/or a trailing point at rightTs when the
 * series doesn't already reach those edges.
 * This is a rendering trick — it does NOT recompute the indicator.
 */
export function extendToEdges(series: TsPoint[], leftTs: number, rightTs: number): TsPoint[] {
  if (!series.length) return series;

  const s = series.slice().sort((a, b) => a.timestamp - b.timestamp);
  const out: TsPoint[] = [];

  if (s[0].timestamp > leftTs) out.push({ timestamp: leftTs, value: s[0].value });
  out.push(...s);

  const last = s[s.length - 1];
  if (last.timestamp < rightTs) out.push({ timestamp: rightTs, value: last.value });

  return out;
}

/**
 * Parse an SVG-style dash string (e.g. "4 4") into a number array
 * suitable for Skia's DashPathEffect intervals.
 */
export function parseDashArray(dash: string): number[] {
  return dash
    .split(' ')
    .map((n) => Number(n.trim()))
    .filter((n) => !isNaN(n) && n > 0);
}

/**
 * Returns true only when two candles share identical OHLC values.
 * Used to detect live mutations vs. genuine new data.
 */
export function sameOhlc(a: Candle | null, b: Candle | null): boolean {
  if (!a || !b) return false;
  return a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close;
}

/** A candle can be drawn only if its timestamp and all four prices are finite numbers. */
function isDrawable(c: Candle | null | undefined): c is Candle {
  return !!c && Number.isFinite(c.timestamp) && Number.isFinite(c.open) && Number.isFinite(c.high)
    && Number.isFinite(c.low) && Number.isFinite(c.close);
}

/** `volume` is optional; a present-but-garbage value (NaN, Infinity, a string) would poison the volume panel. */
const hasBadVolume = (c: Candle) => c.volume != null && !Number.isFinite(c.volume);

/**
 * Prepare raw candles for rendering: drop undrawable candles (non-finite timestamp or price —
 * one bad tick would otherwise turn the whole price range into NaN and blank the chart),
 * strip non-finite volume, sort by timestamp and dedupe (first occurrence wins).
 * Always returns a new array; never mutates the input.
 */
export function normalizeCandles(candles: Candle[]): Candle[] {
  // Fast path: live feeds are almost always clean and already strictly ascending, so a
  // linear scan avoids an O(n log n) comparator sort on every tick.
  let clean = true;
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    if (!isDrawable(c) || hasBadVolume(c) || (i > 0 && c.timestamp <= candles[i - 1].timestamp)) { clean = false; break; }
  }
  if (clean) return candles.slice();

  const sorted = candles
    .filter(isDrawable)
    .map((c) => {
      if (!hasBadVolume(c)) return c;
      const { volume: _drop, ...rest } = c;
      return rest;
    })
    .sort((a, b) => a.timestamp - b.timestamp);
  const out: Candle[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0 || sorted[i].timestamp !== sorted[i - 1].timestamp) out.push(sorted[i]);
  }
  return out;
}

/**
 * Turn a plain list of prices (oldest first) into chart data, for static data such as a stock list's last 30 closes.
 * Each point becomes a flat candle (open = high = low = close), `intervalMs` apart, ending at `endTs` (default: now).
 * Non-finite values are skipped.
 */
export function closesToCandles(closes: readonly number[], opts: { endTs?: number; intervalMs?: number } = {}): Candle[] {
  const intervalMs = opts.intervalMs ?? 86_400_000;
  const endTs = opts.endTs ?? Date.now();
  const clean = closes.filter((v) => Number.isFinite(v));
  return clean.map((close, i) => ({ timestamp: endTs - (clean.length - 1 - i) * intervalMs, open: close, high: close, low: close, close }));
}

/** `rgba()` of a CSS colour at the given alpha. Handles #rgb, #rrggbb, #rrggbbaa and rgb()/rgba(); anything else is returned as is. */
export function withAlpha(color: string, alpha: number): string {
  const hex = /^#([0-9a-f]{3,8})$/i.exec(color.trim());
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('');
    if (h.length === 6 || h.length === 8) {
      const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
      return `rgba(${n(0)}, ${n(2)}, ${n(4)}, ${alpha})`;
    }
  }
  const rgb = /^rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i.exec(color.trim());
  if (rgb) return `rgba(${rgb[1]}, ${rgb[2]}, ${rgb[3]}, ${alpha})`;
  return color;
}
