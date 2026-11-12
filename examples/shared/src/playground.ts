/**
 * Logic behind the interactive playground that every web demo shares, and that mirrors the iOS demo's Chart tab:
 * a random-walk live feed (down to 100 ms ticks), a +5K stress button and the SMA / EMA / Bollinger overlays.
 * Framework-free so the React and Angular playgrounds are only markup.
 */
import { calcBollingerBands, calcEMA, calcSMA } from '@stacklatte/chart-engine';
import type { Candle, IndicatorLine, ShadedArea } from '@stacklatte/chart-engine';

export const PLAYGROUND_INTERVAL_MS = 60_000;
export const PLAYGROUND_WARMUP = 60;
export const PLAYGROUND_INITIAL_COUNT = 300 + PLAYGROUND_WARMUP;
/** The ring the +5K button grows into before the oldest candles are dropped. */
export const PLAYGROUND_MAX_DATA = PLAYGROUND_WARMUP + 10_000;
export const BULK_COUNT = 5000;

export type LiveMs = 3000 | 1000 | 500 | 100 | null;
export const LIVE_OPTIONS: readonly LiveMs[] = [null, 3000, 1000, 500, 100];
export const ZOOM_OPTIONS = [20, 40, 60, 120, 240] as const;

export function liveLabel(v: LiveMs): string {
  return v === null ? 'Off' : v === 3000 ? '3s' : v === 1000 ? '1s' : v === 500 ? '½s' : '⚡';
}

export function currentBucket(now = Date.now()): number {
  return Math.floor(now / PLAYGROUND_INTERVAL_MS) * PLAYGROUND_INTERVAL_MS;
}

const volume = () => Math.round(50 + Math.random() * 450);

export function playgroundCandles(count: number): Candle[] {
  const out: Candle[] = [];
  let prev: Candle = { timestamp: currentBucket() - count * PLAYGROUND_INTERVAL_MS, open: 67_000, high: 67_000, low: 67_000, close: 67_000 };
  for (let i = 0; i < count; i++) {
    prev = nextPlaygroundCandle(prev, prev.timestamp + PLAYGROUND_INTERVAL_MS);
    out.push(prev);
  }
  return out;
}

export function nextPlaygroundCandle(last: Candle, timestamp: number): Candle {
  const open = last.close;
  const close = Math.max(1, open + open * 0.003 * (Math.random() - 0.48));
  const range = Math.abs(close - open);
  return {
    timestamp, open, close,
    high: Math.max(open, close) + range * (0.2 + Math.random() * 0.8),
    low: Math.min(open, close) - range * (0.2 + Math.random() * 0.8),
    volume: volume(),
  };
}

/** A tick inside the still-forming last candle. */
export function tickPlaygroundCandle(last: Candle): Candle {
  const close = Math.max(1, last.close * (1 + 0.001 * (Math.random() - 0.48)));
  return { ...last, close, high: Math.max(last.high, close), low: Math.min(last.low, close), volume: (last.volume ?? 0) + Math.round(Math.random() * 8) };
}

/** What one live-feed interval does: tick the forming candle, or roll over to a new minute. */
export function advanceLive(all: Candle[]): Candle[] {
  const tail = all[all.length - 1];
  const bucket = currentBucket();
  return tail.timestamp === bucket ? [...all.slice(0, -1), tickPlaygroundCandle(tail)] : [...all.slice(1), nextPlaygroundCandle(tail, bucket)];
}

/** The +5K stress button: append BULK_COUNT candles, capped at PLAYGROUND_MAX_DATA. */
export function appendBulk(all: Candle[]): Candle[] {
  const out = [...all];
  let prev = all[all.length - 1];
  for (let i = 0; i < BULK_COUNT; i++) {
    prev = nextPlaygroundCandle(prev, prev.timestamp + PLAYGROUND_INTERVAL_MS);
    out.push(prev);
  }
  return out.length > PLAYGROUND_MAX_DATA ? out.slice(out.length - PLAYGROUND_MAX_DATA) : out;
}

export function buildOverlays(candles: Candle[], sma: boolean, ema: boolean, bb: boolean): { indicators: IndicatorLine[]; shadedAreas: ShadedArea[] } {
  const indicators: IndicatorLine[] = [];
  const shadedAreas: ShadedArea[] = [];
  if (sma) { const s = calcSMA(candles, 20, 'sma20', '#F5A623'); if (s) indicators.push(s); }
  if (ema) { const e = calcEMA(candles, 50, 'ema50', '#50E3C2'); if (e) indicators.push(e); }
  if (bb) {
    const b = calcBollingerBands(candles, 20, 2, { upper: '#9B59B6', basis: '#7F8C8D', lower: '#9B59B6' });
    if (b) {
      indicators.push(b.upper, b.basis, b.lower);
      shadedAreas.push({ fromId: 'bb-upper', toId: 'bb-lower', color: '#9B59B6', opacity: 0.12 });
    }
  }
  return { indicators, shadedAreas };
}
