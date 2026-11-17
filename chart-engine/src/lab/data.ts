import type { Candle } from '../types';

/** Seeded PRNG (mulberry32) — every run, every platform, every test sees the same series. */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const MINUTE = 60_000;
/** Fixed epoch so snapshots and screenshots do not depend on "now". 2026-01-05 00:00 UTC (a Monday). */
export const BASE_TS = Date.UTC(2026, 0, 5);

export interface GenerateOptions {
  seed?: number;
  startTs?: number;
  intervalMs?: number;
  startPrice?: number;
  /** Per-candle volatility as a fraction of price. 0 = perfectly flat market. */
  volatility?: number;
  withVolume?: boolean;
}

export function generateCandles(count: number, opts: GenerateOptions = {}): Candle[] {
  const { seed = 42, startTs = BASE_TS, intervalMs = MINUTE, startPrice = 50_000, volatility = 0.008, withVolume = true } = opts;
  const rand = createRng(seed);
  const out: Candle[] = new Array(count);
  let price = startPrice;
  for (let i = 0; i < count; i++) {
    const open = price;
    const close = volatility === 0 ? price : Math.max(price * 0.01, price + (rand() - 0.49) * price * volatility);
    const wick = volatility === 0 ? 0 : volatility * 0.5;
    const high = Math.max(open, close) * (1 + rand() * wick);
    const low = Math.min(open, close) * (1 - rand() * wick);
    out[i] = { timestamp: startTs + i * intervalMs, open, high, low, close, ...(withVolume ? { volume: Math.round(500 + rand() * 1500) } : {}) };
    price = close;
  }
  return out;
}

/** A new candle following `last`, as a live feed would produce it. */
export function nextCandle(last: Candle, rand: () => number, intervalMs = MINUTE): Candle {
  const open = last.close;
  const close = Math.max(open * 0.01, open + (rand() - 0.49) * open * 0.008);
  return {
    timestamp: last.timestamp + intervalMs,
    open,
    close,
    high: Math.max(open, close) * (1 + rand() * 0.004),
    low: Math.min(open, close) * (1 - rand() * 0.004),
    volume: Math.round(500 + rand() * 1500),
  };
}

/** The same candle with a new tick applied (what a feed does while a candle is still forming). */
export function tickLast(last: Candle, rand: () => number): Candle {
  const close = Math.max(last.close * 0.01, last.close + (rand() - 0.5) * last.close * 0.002);
  return { ...last, close, high: Math.max(last.high, close), low: Math.min(last.low, close), volume: (last.volume ?? 0) + Math.round(rand() * 50) };
}
