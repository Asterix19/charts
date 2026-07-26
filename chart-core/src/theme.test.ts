import { getMarkerKindLabel, getMarkerStyle, getThemeColors, THEMES } from './theme';
import type { MarkerKind } from './types';

// ─── built-in presets ───────────────────────────────────────────────────────

describe('THEMES', () => {
  it('dark and light presets both define markerNeutral', () => {
    expect(typeof THEMES.dark.markerNeutral).toBe('string');
    expect(typeof THEMES.light.markerNeutral).toBe('string');
    expect(THEMES.dark.markerNeutral).not.toBe('');
    expect(THEMES.light.markerNeutral).not.toBe('');
  });
});

describe('getThemeColors', () => {
  it('resolves "dark" to THEMES.dark', () => {
    expect(getThemeColors('dark')).toBe(THEMES.dark);
  });

  it('falls back to dark for an unknown preset name', () => {
    expect(getThemeColors('not-a-real-theme' as 'dark')).toBe(THEMES.dark);
  });

  it('passes a custom ChartThemeColors object through unchanged', () => {
    expect(getThemeColors(THEMES.light)).toBe(THEMES.light);
  });
});

// ─── getMarkerStyle ─────────────────────────────────────────────────────────
// Resolves each MarkerKind to a shape + color. Colors come from the caller's
// theme (candleUp/candleDown/markerNeutral) — never hard-coded here.

describe('getMarkerStyle', () => {
  const colors = THEMES.dark;

  const cases: [MarkerKind, string, string][] = [
    ['entry-long', 'triangle-up', colors.candleUp],
    ['exit-long', 'triangle-down', colors.markerNeutral],
    ['entry-short', 'triangle-down', colors.candleDown],
    ['exit-short', 'triangle-up', colors.markerNeutral],
    ['stop-loss', 'x', colors.candleDown],
    ['take-profit', 'dot', colors.candleUp],
  ];

  it.each(cases)('%s → shape=%s, color=%s', (kind, shape, color) => {
    expect(getMarkerStyle(kind, colors)).toEqual({ shape, color });
  });

  it('entry-long and entry-short resolve to opposite triangle directions', () => {
    expect(getMarkerStyle('entry-long', colors).shape).toBe('triangle-up');
    expect(getMarkerStyle('entry-short', colors).shape).toBe('triangle-down');
  });

  it('exit-long and exit-short share the neutral color (direction-agnostic)', () => {
    expect(getMarkerStyle('exit-long', colors).color).toBe(colors.markerNeutral);
    expect(getMarkerStyle('exit-short', colors).color).toBe(colors.markerNeutral);
  });

  it('uses the colors object passed in, not a hard-coded theme', () => {
    const customColors = { ...THEMES.dark, candleUp: '#ABCDEF', markerNeutral: '#123456' };
    expect(getMarkerStyle('entry-long', customColors).color).toBe('#ABCDEF');
    expect(getMarkerStyle('exit-long', customColors).color).toBe('#123456');
  });
});

// ─── getMarkerKindLabel ─────────────────────────────────────────────────────
// Fallback tooltip heading used when a ChartMarker has no explicit label.

describe('getMarkerKindLabel', () => {
  const cases: [MarkerKind, string][] = [
    ['entry-long', 'Entry (long)'],
    ['exit-long', 'Exit (long)'],
    ['entry-short', 'Entry (short)'],
    ['exit-short', 'Exit (short)'],
    ['stop-loss', 'Stop-loss'],
    ['take-profit', 'Take-profit'],
  ];

  it.each(cases)('%s → %s', (kind, label) => {
    expect(getMarkerKindLabel(kind)).toBe(label);
  });
});
