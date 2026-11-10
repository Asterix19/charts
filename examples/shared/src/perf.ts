/**
 * Frame-time probe shared by every web demo. Playwright calls `window.__SL__.probe.start()`,
 * drives real input, then `stop()` to read the stats — so each renderer is measured the same way.
 */
export interface FrameStats {
  frames: number;
  durationMs: number;
  fps: number;
  p50: number;
  p95: number;
  max: number;
  /** Frames slower than 50 ms (a visible hitch). */
  long: number;
}

const pct = (sorted: number[], p: number) => (sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0);

export function summarizeFrames(deltas: number[], durationMs: number): FrameStats {
  const sorted = [...deltas].sort((a, b) => a - b);
  return {
    frames: deltas.length,
    durationMs,
    fps: durationMs > 0 ? (deltas.length / durationMs) * 1000 : 0,
    p50: pct(sorted, 0.5),
    p95: pct(sorted, 0.95),
    max: sorted.length ? sorted[sorted.length - 1] : 0,
    long: deltas.filter((d) => d > 50).length,
  };
}

export interface FrameProbe {
  start(): void;
  stop(): FrameStats;
}

export function createFrameProbe(): FrameProbe {
  let deltas: number[] = [];
  let last = 0;
  let raf = 0;
  let running = false;
  let t0 = 0;
  // Wall-clock time, not the rAF timestamp argument: headless Chromium advances that timestamp in fixed
  // 16.7 ms steps, so a 40 ms stall would be invisible. performance.now() inside the callback is real.
  const tick = () => {
    if (!running) return;
    const now = performance.now();
    if (last) deltas.push(now - last);
    last = now;
    raf = requestAnimationFrame(tick);
  };
  return {
    start() {
      deltas = [];
      last = 0;
      running = true;
      t0 = performance.now();
      raf = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      return summarizeFrames(deltas, performance.now() - t0);
    },
  };
}

declare global {
  interface Window {
    __SL__?: { probe: FrameProbe };
  }
}

/** Expose the probe on `window` for the e2e suite. Idempotent. */
export function installProbe(): FrameProbe {
  if (!window.__SL__) window.__SL__ = { probe: createFrameProbe() };
  return window.__SL__.probe;
}

/** What each demo writes onto its `[data-testid="stats"]` element so tests can read it without parsing text. */
export interface ScenarioReport {
  scenario: string;
  candles: number;
  mountMs: number;
  ticks: number;
}

export function reportAttributes(r: ScenarioReport): Record<string, string> {
  return {
    'data-scenario': r.scenario,
    'data-candles': String(r.candles),
    'data-mount-ms': r.mountMs.toFixed(1),
    'data-ticks': String(r.ticks),
  };
}
