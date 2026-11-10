import '@angular/compiler';
import { ChangeDetectionStrategy, Component, signal, provideZonelessChangeDetection } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import { isScenarioRoute } from '@stacklatte/chart-examples';

import { PlaygroundComponent } from './playground.component';
import { ScenariosComponent } from './scenarios.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PlaygroundComponent, ScenariosComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div style="padding:8px 16px;font:12px system-ui,sans-serif">
      <a href="#/" style="margin-right:12px;color:#60a5fa">Playground</a>
      <a href="#/scenarios/basic" data-testid="nav-scenarios" style="color:#60a5fa">Scenarios</a>
    </div>
    @if (scenarios()) { <app-scenarios /> } @else { <app-playground /> }
  `,
})
class RootComponent {
  readonly scenarios = signal(isScenarioRoute(location.hash));
  constructor() {
    window.addEventListener('hashchange', () => this.scenarios.set(isScenarioRoute(location.hash)));
  }
}

bootstrapApplication(RootComponent, { providers: [provideZonelessChangeDetection()] }).catch((e) => console.error(e));
