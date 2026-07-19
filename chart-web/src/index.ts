// ── Core logic (platform-agnostic, shared with @stacklatte/chart-core) ─────
export * from '@stacklatte/chart-core/core';

// ── Canvas 2D renderer ───────────────────────────────────────────────────────
export { default as SLChart } from './ChartCanvas';
export { default as OhlcHud } from './components/OhlcHud';
