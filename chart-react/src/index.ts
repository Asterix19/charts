// ── Core logic (platform-agnostic, shared with @stacklatte/chart-engine) ─────
export * from '@stacklatte/chart-engine';

// ── Canvas 2D renderer ───────────────────────────────────────────────────────
export { default as SLChart } from './ChartCanvas';
export { default as OhlcHud } from './components/OhlcHud';
