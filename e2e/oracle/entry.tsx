// Bundled twice by oracle-web.spec.ts: once against the PUBLISHED chart-web 1.3.2 (aliased in), once against this workspace's chart-react.
import { SLChart } from '@stacklatte/chart-react';
import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';

declare global {
  interface Window {
    renderChart(props: Record<string, unknown>): void;
  }
}

const root = createRoot(document.getElementById('root')!);
window.renderChart = (props) => {
  try {
    flushSync(() => root.render(<SLChart {...(props as never)} />));
  } catch (error) {
    (window as unknown as { __renderError?: string }).__renderError = String(error); // the published chart can throw on bad input
  }
};
