import { DEMO_PACKAGES, SCENARIOS } from '@stacklatte/chart-examples';
import React from 'react';

const PKG = DEMO_PACKAGES.react;

/** Always-visible identification of what this page demonstrates: package, version, renderer, engine. */
export default function Banner({ route }: { route: 'lab' | 'scenarios' }) {
  return (
    <header className="demo-banner" style={{ ['--accent' as string]: PKG.accent }} data-testid="package-banner">
      <span className="demo-badge">{PKG.platform}</span>
      <h1>{PKG.pkg} <small>v{__PKG_VERSION__}</small></h1>
      <span className="demo-meta">{PKG.renderer} · engine v{__ENGINE_VERSION__}</span>
      <nav>
        <a href="#/" aria-current={route === 'lab' ? 'page' : undefined} data-testid="nav-lab">Lab: every capability</a>
        <a href="#/scenarios/basic" aria-current={route === 'scenarios' ? 'page' : undefined} data-testid="nav-scenarios">{SCENARIOS.length} scenarios</a>
      </nav>
    </header>
  );
}
