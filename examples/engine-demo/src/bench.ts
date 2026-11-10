// Throughput of the engine's hot paths. Prints a table and writes bench-results.json.
import { writeFileSync } from 'node:fs';
import { calcBollingerBands, calcEMA, calcMACD, calcRSI, normalizeCandles } from '@stacklatte/chart-engine';
import { generateCandles } from '@stacklatte/chart-examples';

const time = (fn: () => unknown, runs = 5) => {
  fn();
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) fn();
  return (performance.now() - t0) / runs;
};

const rows: Record<string, Record<string, number>> = {};
for (const n of [1_000, 10_000, 100_000, 1_000_000]) {
  const c = generateCandles(n);
  rows[n] = {
    normalizeCandles: time(() => normalizeCandles(c)),
    calcRSI: time(() => calcRSI(c, 14)),
    calcEMA: time(() => calcEMA(c, 21, 'e', '#fff')),
    calcMACD: time(() => calcMACD(c)),
    calcBollingerBands: time(() => calcBollingerBands(c, 20, 2, { upper: '#1', lower: '#2', basis: '#3' })),
  };
}
console.log('ms per call'.padEnd(12), ...Object.keys(rows['1000']).map((k) => k.padStart(20)));
for (const [n, r] of Object.entries(rows)) console.log(Number(n).toLocaleString().padEnd(12), ...Object.values(r).map((v) => v.toFixed(2).padStart(20)));
writeFileSync(new URL('../bench-results.json', import.meta.url), JSON.stringify(rows, null, 2));
