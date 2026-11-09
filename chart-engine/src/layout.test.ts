import { getCandleX, getSeriesX, getY } from './layout';

// ─── getCandleX ────────────────────────────────────────────────────────────
// Centers each candle within its slot: slot = chartWidth / total,
// so candle i lands at i*slot + slot/2.

describe('getCandleX', () => {
  it('first candle is centered in first slot', () => {
    // chartWidth=100, total=4 → slot=25. index 0 → 0*25 + 12.5 = 12.5
    expect(getCandleX(0, 4, 100)).toBe(12.5);
  });

  it('last candle is centered in last slot', () => {
    // index 3 → 3*25 + 12.5 = 87.5
    expect(getCandleX(3, 4, 100)).toBe(87.5);
  });

  it('middle candle is centered correctly', () => {
    // chartWidth=200, total=5 → slot=40. index 2 → 2*40 + 20 = 100
    expect(getCandleX(2, 5, 200)).toBe(100);
  });

  it('guards against zero total (uses max(1, total))', () => {
    // total=0 → slot = 100/1 = 100. index 0 → 0 + 50 = 50
    expect(getCandleX(0, 0, 100)).toBe(50);
  });

  it('single candle is centered at half width', () => {
    expect(getCandleX(0, 1, 200)).toBe(100);
  });
});

// ─── getSeriesX ────────────────────────────────────────────────────────────
// Edge-based: first point → 0, last point → chartWidth.
// Ensures indicator lines span the full plot width.

describe('getSeriesX', () => {
  it('first point maps to x=0', () => {
    expect(getSeriesX(0, 5, 400)).toBe(0);
  });

  it('last point maps to chartWidth', () => {
    expect(getSeriesX(4, 5, 400)).toBe(400);
  });

  it('midpoint maps to half chartWidth', () => {
    expect(getSeriesX(2, 5, 400)).toBe(200);
  });

  it('returns 0 when total is 1 (only one point)', () => {
    expect(getSeriesX(0, 1, 300)).toBe(0);
  });

  it('returns 0 when total is 0 (edge guard)', () => {
    expect(getSeriesX(0, 0, 300)).toBe(0);
  });
});

// ─── getY ──────────────────────────────────────────────────────────────────
// Price-to-pixel: higher price → smaller Y (top of chart).
// Formula: ((max - value) / (max - min)) * chartHeight

describe('getY', () => {
  it('max price maps to y=0 (top of chart)', () => {
    expect(getY(100, 0, 100, 400)).toBe(0);
  });

  it('min price maps to chartHeight (bottom of chart)', () => {
    expect(getY(0, 0, 100, 400)).toBe(400);
  });

  it('midpoint price maps to half chartHeight', () => {
    expect(getY(50, 0, 100, 400)).toBe(200);
  });

  it('price above range clamps to negative Y (above chart top)', () => {
    expect(getY(150, 0, 100, 400)).toBe(-200);
  });

  it('price below range produces Y beyond chartHeight', () => {
    expect(getY(-50, 0, 100, 400)).toBe(600);
  });

  it('handles equal min/max (zero range) without division by zero', () => {
    // range is clamped to 1e-9 — result will be a finite number, not NaN/Infinity
    const y = getY(50, 50, 50, 400);
    expect(isFinite(y)).toBe(true);
  });

  it('works with non-zero min range', () => {
    // range 90-110=20, chartHeight=100. value 100 → ((110-100)/20)*100 = 50
    expect(getY(100, 90, 110, 100)).toBe(50);
  });
});
