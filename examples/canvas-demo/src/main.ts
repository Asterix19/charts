import { ChartController } from '@stacklatte/chart-canvas';
import {
  SCENARIOS,
  getScenario,
  installProbe,
  reportAttributes,
  scenarioHash,
  scenarioIdFromHash,
} from '@stacklatte/chart-examples';
import type { Candle } from '@stacklatte/chart-engine';

// Vanilla JS: no framework, just ChartController + the shared scenario catalogue.
const app = document.getElementById('app')!;
installProbe();

let controller: ChartController | undefined;
let timer: ReturnType<typeof setInterval> | undefined;
let resizeObserver: ResizeObserver | undefined;

function render(): void {
  controller?.destroy();
  clearInterval(timer);
  resizeObserver?.disconnect();

  const id = scenarioIdFromHash(location.hash) ?? SCENARIOS[0].id;
  const scenario = getScenario(id);
  const startedAt = performance.now();

  app.innerHTML = `
    <nav class="sc-tabs" data-testid="tabs">
      ${SCENARIOS.map((s) => `<a class="sc-tab sc-${s.kind}${s.id === id ? ' on' : ''}" href="${scenarioHash(s.id)}" data-testid="tab-${s.id}">${s.title}</a>`).join('')}
    </nav>
    <h2 data-testid="title"></h2>
    <p data-testid="description"></p>
    <div class="sc-host" data-testid="chart-host"></div>
    <button type="button" data-testid="now" class="sc-tab">Now</button>
    <div class="sc-stats" data-testid="stats"></div>`;
  app.querySelector('[data-testid="title"]')!.textContent = scenario.title;
  app.querySelector('[data-testid="description"]')!.textContent = scenario.description;

  const host = app.querySelector<HTMLElement>('[data-testid="chart-host"]')!;
  const stats = app.querySelector<HTMLElement>('[data-testid="stats"]')!;

  let data: Candle[] = scenario.data();
  let ticks = 0;
  let mountMs = 0;
  let toLatest = 0;
  const paintStats = () => {
    stats.setAttribute('data-crosshair', stats.getAttribute('data-crosshair') ?? '');
    for (const [k, v] of Object.entries(reportAttributes({ scenario: id, candles: data.length, mountMs, ticks }))) stats.setAttribute(k, v);
    stats.textContent = `${data.length.toLocaleString()} candles · mount ${mountMs.toFixed(0)} ms${scenario.live ? ` · ${ticks} ticks` : ''}`;
  };

  const width = () => Math.floor(host.getBoundingClientRect().width);
  const chartProps = () => ({
    data, width: width(), height: scenario.height, ...scenario.props(data), scrollToLatestTrigger: toLatest,
    onCrosshairChange: (c: Candle | null) => stats.setAttribute('data-crosshair', c ? String(c.timestamp) : ''),
  });
  app.querySelector('[data-testid="now"]')!.addEventListener('click', () => { toLatest += 1; controller?.update(chartProps()); });
  controller = new ChartController(host, chartProps());
  // Test hook: lets the e2e suite find marker positions without re-deriving the layout.
  (window as unknown as { __SL_CHART__?: ChartController }).__SL_CHART__ = controller;
  paintStats();
  requestAnimationFrame(() => requestAnimationFrame(() => { mountMs = performance.now() - startedAt; paintStats(); }));

  resizeObserver = new ResizeObserver(() => controller?.update(chartProps()));
  resizeObserver.observe(host);

  if (scenario.live) {
    timer = setInterval(() => {
      ticks += 1;
      data = scenario.live!.next(data, ticks);
      controller!.update(chartProps());
      paintStats();
    }, scenario.live.tickMs);
  }
}

window.addEventListener('hashchange', render);
render();
