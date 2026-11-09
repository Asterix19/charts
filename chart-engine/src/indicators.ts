import type { Candle, IndicatorLine, MacdResult, RsiPoint, TsPoint } from './types';
import { buildPaddedRange } from './viewport';

// ─── RSI scale ────────────────────────────────────────────────────────────

/** RSI is always rendered on a fixed 0–100 scale. */
export const RSI_MIN = 0;
/** RSI is always rendered on a fixed 0–100 scale. */
export const RSI_MAX = 100;

// ─── RSI (Wilder smoothing) ────────────────────────────────────────────────

export function calcRSI(candles: Candle[], period = 14): RsiPoint[] {
  if (!candles || candles.length < period + 1) return [];

  const closes = candles.map((c) => c.close);
  let gainSum = 0;
  let lossSum = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gainSum += diff;
    else lossSum += -diff;
  }

  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;

  const rsiAt = (g: number, l: number) => {
    if (l === 0) return 100;
    const rs = g / l;
    return 100 - 100 / (1 + rs);
  };

  const out: RsiPoint[] = [
    { timestamp: candles[period].timestamp, value: rsiAt(avgGain, avgLoss) },
  ];

  for (let i = period + 1; i < candles.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    out.push({ timestamp: candles[i].timestamp, value: rsiAt(avgGain, avgLoss) });
  }

  return out;
}

// ─── SMA ──────────────────────────────────────────────────────────────────

export function calcSMA(
  candles: Candle[],
  period: number,
  id: string,
  color: string
): IndicatorLine | null {
  if (candles.length < period) return null;

  const out: TsPoint[] = [];

  // Sliding-window sum — O(n) instead of O(n × period).
  let sum = 0;
  for (let i = 0; i < period - 1; i++) sum += candles[i].close;
  for (let i = period - 1; i < candles.length; i++) {
    sum += candles[i].close;
    out.push({ timestamp: candles[i].timestamp, value: sum / period });
    sum -= candles[i - period + 1].close;
  }

  return { id, name: `SMA(${period})`, color, data: out };
}

// ─── EMA ──────────────────────────────────────────────────────────────────

export function calcEMA(
  candles: Candle[],
  period: number,
  id: string,
  color: string
): IndicatorLine | null {
  if (candles.length < period) return null;

  const k = 2 / (period + 1);
  const out: TsPoint[] = [];

  // Seed EMA using SMA of first `period` closes
  let ema = candles.slice(0, period).reduce((acc, c) => acc + c.close, 0) / period;

  // Align first EMA value on candle[period - 1]
  out.push({ timestamp: candles[period - 1].timestamp, value: ema });

  for (let i = period; i < candles.length; i++) {
    const c = candles[i];
    ema = c.close * k + ema * (1 - k);
    out.push({ timestamp: c.timestamp, value: ema });
  }

  return { id, name: `EMA(${period})`, color, data: out };
}

// ─── MACD ─────────────────────────────────────────────────────────────────

/**
 * MACD(12,26,9): classic momentum oscillator.
 *
 * Returns three aligned series — all starting from the first candle where
 * both the MACD line and signal line are fully seeded.
 *   macd      = EMA(fast) − EMA(slow)
 *   signal    = EMA(signalPeriod) of macd
 *   histogram = macd − signal
 */
export function calcMACD(
  candles: Candle[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult | null {
  if (candles.length < slowPeriod + signalPeriod) return null;

  const kFast = 2 / (fastPeriod + 1);
  const kSlow = 2 / (slowPeriod + 1);
  const kSig  = 2 / (signalPeriod + 1);

  // Seed both EMAs with their respective SMA
  let emaFast = candles.slice(0, fastPeriod).reduce((s, c) => s + c.close, 0) / fastPeriod;
  let emaSlow = candles.slice(0, slowPeriod).reduce((s, c) => s + c.close, 0) / slowPeriod;

  // Advance emaFast from fastPeriod → slowPeriod so both EMAs are aligned at
  // candle[slowPeriod − 1] (the first point where MACD is defined).
  for (let i = fastPeriod; i < slowPeriod; i++) {
    emaFast = candles[i].close * kFast + emaFast * (1 - kFast);
  }

  // Build MACD line — first point at candle[slowPeriod − 1]
  const macdLine: TsPoint[] = [
    { timestamp: candles[slowPeriod - 1].timestamp, value: emaFast - emaSlow },
  ];
  for (let i = slowPeriod; i < candles.length; i++) {
    const close = candles[i].close;
    emaFast = close * kFast + emaFast * (1 - kFast);
    emaSlow = close * kSlow + emaSlow * (1 - kSlow);
    macdLine.push({ timestamp: candles[i].timestamp, value: emaFast - emaSlow });
  }

  if (macdLine.length < signalPeriod) return null;

  // Seed signal EMA from first signalPeriod MACD values
  let sigEma = macdLine.slice(0, signalPeriod).reduce((s, p) => s + p.value, 0) / signalPeriod;

  const signalLine: TsPoint[] = [{ timestamp: macdLine[signalPeriod - 1].timestamp, value: sigEma }];
  const histogram: TsPoint[]  = [{ timestamp: macdLine[signalPeriod - 1].timestamp, value: macdLine[signalPeriod - 1].value - sigEma }];

  for (let i = signalPeriod; i < macdLine.length; i++) {
    sigEma = macdLine[i].value * kSig + sigEma * (1 - kSig);
    signalLine.push({ timestamp: macdLine[i].timestamp, value: sigEma });
    histogram.push({ timestamp: macdLine[i].timestamp, value: macdLine[i].value - sigEma });
  }

  return { macd: macdLine, signal: signalLine, histogram };
}

// ─── Bollinger Bands ──────────────────────────────────────────────────────

export function calcBollingerBands(
  candles: Candle[],
  period: number,
  multiplier: number,
  colors: { upper: string; lower: string; basis: string }
): { upper: IndicatorLine; lower: IndicatorLine; basis: IndicatorLine } | null {
  if (candles.length < period) return null;

  const basisData: TsPoint[] = [];
  const upperData: TsPoint[] = [];
  const lowerData: TsPoint[] = [];

  // Sliding-window using sum and sum-of-squares — O(n) instead of O(n × period).
  // Clamping variance to ≥ 0 guards against floating-point drift on flat series.
  let sum = 0;
  let sumSq = 0;
  for (let i = 0; i < period - 1; i++) {
    sum   += candles[i].close;
    sumSq += candles[i].close * candles[i].close;
  }

  for (let i = period - 1; i < candles.length; i++) {
    const c = candles[i].close;
    sum   += c;
    sumSq += c * c;

    const mean   = sum / period;
    const stdDev = Math.sqrt(Math.max(0, sumSq / period - mean * mean));
    const ts     = candles[i].timestamp;

    basisData.push({ timestamp: ts, value: mean });
    upperData.push({ timestamp: ts, value: mean + multiplier * stdDev });
    lowerData.push({ timestamp: ts, value: mean - multiplier * stdDev });

    const oldest = candles[i - period + 1].close;
    sum   -= oldest;
    sumSq -= oldest * oldest;
  }

  return {
    basis: { id: 'bb-basis', name: `BB Basis(${period})`, color: colors.basis, data: basisData },
    upper: { id: 'bb-upper', name: `BB Upper(${period})`, color: colors.upper, data: upperData },
    lower: { id: 'bb-lower', name: `BB Lower(${period})`, color: colors.lower, data: lowerData },
  };
}

// ─── MACD panel helpers ───────────────────────────────────────────────────

/**
 * Compute the Y axis range for a MACD panel.
 *
 * The range is symmetric around zero and padded 15 % so neither the MACD line
 * nor the histogram bars hug the panel edges.  Pass all three MACD series so
 * the range encompasses every drawn element.
 */
export function computeMacdYRange(
  macd: TsPoint[],
  signal: TsPoint[],
  histogram: TsPoint[],
): { yMin: number; yMax: number } {
  const absValues = [...macd, ...signal, ...histogram].map((p) => Math.abs(p.value));
  const maxAbsValue = absValues.length > 0 ? Math.max(...absValues) : 1;
  const pad = maxAbsValue * 0.15;
  return { yMin: -(maxAbsValue + pad), yMax: maxAbsValue + pad };
}

// ─── Volume ───────────────────────────────────────────────────────────────

/**
 * Compute the Y axis range for a volume panel.
 *
 * Always anchored at 0 (bars grow up from the bottom). The max is padded
 * 10 % so the tallest bar doesn't touch the panel's top edge.
 */
export function computeVolumeYRange(candles: Candle[]): { yMin: number; yMax: number } {
  const maxVolume = candles.reduce((max, c) => Math.max(max, c.volume ?? 0), 0);
  return { yMin: 0, yMax: maxVolume > 0 ? maxVolume * 1.1 : 1 };
}

// ─── Custom panels ────────────────────────────────────────────────────────

/**
 * Resolve the Y axis range for a custom panel: the caller's fixed `yRange` if given (e.g. a
 * correlation coefficient's natural -1..1), otherwise auto-computed from the panel's own visible
 * series data and reference lines, padded 10% via the same `buildPaddedRange` the main price
 * panel uses — so an empty or single-value panel still gets a sane, non-zero-height range.
 */
export function computeCustomPanelYRange(
  yRange: 'auto' | { min: number; max: number } | undefined,
  series: TsPoint[][],
  referenceLines: number[] = [],
): { yMin: number; yMax: number } {
  if (yRange && yRange !== 'auto') return { yMin: yRange.min, yMax: yRange.max };

  const values = series.flatMap((points) => points.map((p) => p.value)).concat(referenceLines);
  if (values.length === 0) return { yMin: 0, yMax: 1 };
  const { min, max } = buildPaddedRange(Math.min(...values), Math.max(...values), 0.1);
  return { yMin: min, yMax: max };
}
