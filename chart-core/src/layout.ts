/**
 * Candle X: centers the position within the candle slot.
 * Good for candle bodies and wicks.
 */
export const getCandleX = (index: number, total: number, chartWidth: number): number => {
  const spacing = chartWidth / Math.max(1, total);
  return index * spacing + spacing / 2;
};

/**
 * Series X: edge-based positioning.
 * First point lands at x=0, last point lands at x=chartWidth.
 * Good for indicator lines and shaded areas so they reach plot edges.
 */
export const getSeriesX = (index: number, total: number, chartWidth: number): number => {
  if (total <= 1) return 0;
  return (index / (total - 1)) * chartWidth;
};

/**
 * Maps a price value to a Y pixel coordinate.
 * Higher prices = smaller Y (top of chart).
 */
export const getY = (value: number, min: number, max: number, chartHeight: number): number => {
  const range = Math.max(1e-9, max - min);
  return ((max - value) / range) * chartHeight;
};
