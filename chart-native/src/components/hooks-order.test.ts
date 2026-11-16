import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * Rules of Hooks, as a structural guard: SLChart returns early ("No data") when nothing is visible. Any hook after that
 * return runs on some renders and not others, and React throws "Rendered fewer hooks than expected" the moment the
 * dataset shrinks and the viewport is briefly empty (found by the native Lab: switching 500 -> 100 candles crashed it).
 */
describe('SLChart hook order', () => {
  const source = readFileSync(new URL('./ChartCanvas.tsx', import.meta.url), 'utf8');
  const earlyReturn = source.indexOf('if (!visibleCandles.length) {');

  it('has the early return this guard is about', () => {
    expect(earlyReturn).toBeGreaterThan(0);
  });

  it('calls no hook after the early return', () => {
    const after = source.slice(earlyReturn);
    const hooks = [...after.matchAll(/\buse(?:Memo|Ref|State|Effect|LayoutEffect|Callback|Reducer|Context|SharedValue|DerivedValue|AnimatedStyle)\s*\(/g)].map((m) => m[0]);
    expect(hooks, 'move these hooks above the early return').toEqual([]);
  });
});
