import '@angular/compiler';
import { ChangeDetectionStrategy, Component, ViewEncapsulation, signal, provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { DEMO_PACKAGES, SCENARIOS, isScenarioRoute } from '@stacklatte/chart-examples';

import { LabComponent } from './lab.component';
import { ScenariosComponent } from './scenarios.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [LabComponent, ScenariosComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styles: `
    body { margin: 0; }
    .demo-root { display: flex; flex-direction: column; height: 100vh; background: #0d0e14; color: #d4d8e8; }
    .demo-content { flex: 1; min-height: 0; overflow: auto; }
    .demo-banner { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; padding: 10px 16px; background: ${DEMO_PACKAGES.angular.accent}; color: #fff; font: 13px system-ui, sans-serif; }
    .demo-banner h1 { margin: 0; font-size: 18px; letter-spacing: .01em; }
    .demo-banner h1 small { font-weight: 500; opacity: .85; font-size: 13px; }
    .demo-badge { background: rgb(0 0 0 / .28); padding: 3px 9px; border-radius: 999px; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }
    .demo-meta { opacity: .9; font-size: 12px; }
    .demo-banner nav { margin-left: auto; display: flex; gap: 6px; }
    .demo-banner nav a { color: #fff; text-decoration: none; padding: 4px 10px; border-radius: 6px; font-weight: 600; background: rgb(255 255 255 / .12); }
    .demo-banner nav a[aria-current='page'] { background: rgb(0 0 0 / .3); }
    .demo-banner :focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  `,
  template: `
    <div class="demo-root">
      <header class="demo-banner" data-testid="package-banner">
        <span class="demo-badge">${DEMO_PACKAGES.angular.platform}</span>
        <h1>${DEMO_PACKAGES.angular.pkg} <small>v{{ version }}</small></h1>
        <span class="demo-meta">${DEMO_PACKAGES.angular.renderer} · engine v{{ engine }}</span>
        <nav>
          <a href="#/" [attr.aria-current]="scenarios() ? null : 'page'" data-testid="nav-lab">Lab: every capability</a>
          <a href="#/scenarios/basic" [attr.aria-current]="scenarios() ? 'page' : null" data-testid="nav-scenarios">{{ scenarioCount }} scenarios</a>
        </nav>
      </header>
      <div class="demo-content">
        @if (scenarios()) { <app-scenarios /> } @else { <app-lab /> }
      </div>
    </div>
  `,
})
class RootComponent {
  readonly scenarioCount = SCENARIOS.length;
  readonly version = __PKG_VERSION__;
  readonly engine = __ENGINE_VERSION__;
  readonly scenarios = signal(isScenarioRoute(location.hash));
  constructor() {
    window.addEventListener('hashchange', () => this.scenarios.set(isScenarioRoute(location.hash)));
  }
}

bootstrapApplication(RootComponent, { providers: [provideZonelessChangeDetection()] }).catch((e) => console.error(e));
