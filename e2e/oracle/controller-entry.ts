// Bundled by hud-parity.spec.ts: the framework-agnostic ChartController (what Angular wraps), exposed like the React entry.
import { ChartController } from '@stacklatte/chart-canvas';

declare global {
  interface Window {
    renderChart(props: Record<string, unknown>): void;
  }
}

window.renderChart = (props) => {
  new ChartController(document.getElementById('root')!, props as never);
};
