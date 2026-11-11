import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, afterNextRender, inject, signal, computed, ViewChild } from '@angular/core';
import { SlChartComponent } from '@stacklatte/chart-angular';
import {
  SCENARIOS,
  getScenario,
  installProbe,
  reportAttributes,
  scenarioHash,
  scenarioIdFromHash,
} from '@stacklatte/chart-examples';
import type { Candle } from '@stacklatte/chart-angular';

/** One scenario from the shared catalogue, rendered with <sl-chart> (@stacklatte/chart-angular). */
@Component({
  selector: 'app-scenarios',
  standalone: true,
  imports: [SlChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .sc { max-width: 960px; margin: 0 auto; padding: 12px 16px 48px; color: #e5e7eb; font-family: system-ui, sans-serif; }
    .sc-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
    .sc-tab { padding: 5px 10px; border-radius: 8px; border: 1px solid #374151; color: #9ca3af; text-decoration: none; font-size: 12px; }
    .sc-tab.on { background: #2563eb; border-color: #2563eb; color: #fff; }
    .sc-stress { border-color: #92400e; } .sc-edge { border-color: #4b5563; border-style: dashed; } .sc-live { border-color: #065f46; }
    h2 { margin: 8px 0 2px; font-size: 18px; } p { margin: 0 0 10px; color: #9ca3af; font-size: 13px; }
    .sc-host { width: 100%; background: #0b0b0f; border-radius: 12px; overflow: hidden; min-height: 40px; }
    .sc-stats { margin-top: 8px; font: 12px ui-monospace, monospace; color: #9ca3af; }
  `],
  template: `
    <div class="sc">
      <nav class="sc-tabs" data-testid="tabs">
        @for (s of all; track s.id) {
          <a [href]="hash(s.id)" [attr.data-testid]="'tab-' + s.id" [class]="'sc-tab sc-' + s.kind + (s.id === id() ? ' on' : '')">{{ s.title }}</a>
        }
      </nav>
      <h2 data-testid="title">{{ scenario().title }}</h2>
      <p data-testid="description">{{ scenario().description }}</p>
      <div class="sc-host" data-testid="chart-host">
        @if (width() > 0) {
          <sl-chart
            [data]="data()" [width]="width()" [height]="scenario().height"
            [intervalMs]="p().intervalMs" [visibleDataPoints]="p().visibleDataPoints" [theme]="p().theme" [chartType]="p().chartType"
            [showOhlcHud]="!!p().showOhlcHud" [showRsiPanel]="p().showRsiPanel" [rsiPeriod]="p().rsiPeriod"
            [showMacdPanel]="p().showMacdPanel" [showVolumePanel]="p().showVolumePanel" [showGrid]="p().showGrid"
            [indicators]="p().indicators" [shadedAreas]="p().shadedAreas" [markers]="p().markers" [customPanels]="p().customPanels"
            [scrollToLatestTrigger]="toLatest()" (crosshairChange)="crosshair.set($event ? $event.timestamp : null)" />
        }
      </div>
      <button type="button" data-testid="now" class="sc-tab" (click)="toLatest.set(toLatest() + 1)">Now</button>
      <div class="sc-stats" data-testid="stats" [attr.data-crosshair]="crosshair() ?? ''" [attr.data-scenario]="stats()['data-scenario']" [attr.data-candles]="stats()['data-candles']"
           [attr.data-mount-ms]="stats()['data-mount-ms']" [attr.data-ticks]="stats()['data-ticks']">
        {{ data().length.toLocaleString() }} candles · mount {{ mountMs().toFixed(0) }} ms{{ scenario().live ? ' · ' + ticks() + ' ticks' : '' }}
      </div>
    </div>
  `,
})
export class ScenariosComponent implements OnDestroy {
  readonly all = SCENARIOS;
  readonly hash = scenarioHash;
  readonly id = signal(scenarioIdFromHash(location.hash) ?? SCENARIOS[0].id);
  readonly scenario = computed(() => getScenario(this.id()));
  readonly data = signal<Candle[]>([]);
  readonly ticks = signal(0);
  readonly mountMs = signal(0);
  readonly width = signal(0);
  // Decorator form: signal queries need Angular's compiler transform, which this JIT/Vite demo does not apply.
  @ViewChild(SlChartComponent) private chart?: SlChartComponent;
  readonly toLatest = signal(0);
  readonly crosshair = signal<number | null>(null);
  readonly p = computed(() => this.scenario().props(this.data()));
  readonly stats = computed(() => reportAttributes({ scenario: this.id(), candles: this.data().length, mountMs: this.mountMs(), ticks: this.ticks() }));

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private timer?: ReturnType<typeof setInterval>;
  private resize?: ResizeObserver;
  private readonly onHash = () => this.load(scenarioIdFromHash(location.hash) ?? SCENARIOS[0].id);

  constructor() {
    installProbe();
    // Test hook: lets the e2e suite find marker positions without re-deriving the layout.
    (window as unknown as { __SL_CHART__?: unknown }).__SL_CHART__ = { getVisibleMarkers: () => this.chart?.getVisibleMarkers() ?? [] };
    this.load(this.id());
    window.addEventListener('hashchange', this.onHash);
    afterNextRender(() => {
      const el = this.host.nativeElement.querySelector('.sc-host') as HTMLElement;
      this.resize = new ResizeObserver(([entry]) => this.width.set(Math.floor(entry.contentRect.width)));
      this.resize.observe(el);
    });
  }

  private load(id: string): void {
    clearInterval(this.timer);
    const startedAt = performance.now();
    const scenario = getScenario(id);
    this.id.set(id);
    this.ticks.set(0);
    this.mountMs.set(0);
    this.data.set(scenario.data());
    requestAnimationFrame(() => requestAnimationFrame(() => this.mountMs.set(performance.now() - startedAt)));
    if (scenario.live) {
      let tick = 0;
      this.timer = setInterval(() => {
        tick += 1;
        this.data.update((d) => scenario.live!.next(d, tick));
        this.ticks.set(tick);
      }, scenario.live.tickMs);
    }
  }

  ngOnDestroy(): void {
    clearInterval(this.timer);
    this.resize?.disconnect();
    window.removeEventListener('hashchange', this.onHash);
  }
}
