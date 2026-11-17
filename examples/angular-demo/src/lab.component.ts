import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, ViewChild, ViewEncapsulation, computed, signal } from '@angular/core';
import { SlChartComponent } from '@stacklatte/chart-angular';
import type { Candle } from '@stacklatte/chart-angular';
import { createLab, labApply, labChartProps, labSelected, labSize, visibleCapabilities } from '@stacklatte/chart-engine/lab';
import type { LabCapability, LabState } from '@stacklatte/chart-engine/lab';
import { DEMO_PACKAGES } from '@stacklatte/chart-examples';

/**
 * The Lab for <sl-chart>: every capability as a visible control, drawn from the shared schema. Same test ids and same
 * behaviour as the React and React Native labs.
 */
@Component({
  selector: 'app-lab',
  standalone: true,
  imports: [SlChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styles: `
    app-lab { --accent: ${DEMO_PACKAGES.angular.accent}; display: block; height: 100%; color: #d4d8e8; font: 13px system-ui, sans-serif; }
    app-lab .lab { display: flex; flex-direction: column; height: 100%; background: #0d0e14; }
    app-lab .lab-body { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 380px; }
    @media (max-width: 900px) { app-lab .lab-body { grid-template-columns: 1fr; grid-template-rows: 55vh auto; overflow-y: auto; } }
    app-lab .lab-stage { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
    app-lab .lab-chart { flex: 1; min-height: 0; overflow: hidden; }
    app-lab .lab-status { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 6px 12px; background: #13141c; border-top: 1px solid #1e2130; color: #8a90ad; font-variant-numeric: tabular-nums; }
    app-lab .lab-count { color: #5a5f7a; }
    app-lab .lab-panel { overflow-y: auto; background: #13141c; border-left: 1px solid #1e2130; padding: 4px 14px 24px; }
    app-lab .lab-panel section { padding: 10px 0 6px; border-bottom: 1px solid #1e2130; }
    app-lab .lab-panel h2 { margin: 0 0 8px; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--accent); filter: brightness(1.6); }
    app-lab .lab-row { display: grid; gap: 6px; padding: 6px 0; }
    app-lab .lab-label { display: flex; flex-direction: column; gap: 1px; }
    app-lab .lab-label span { font-weight: 600; color: #d4d8e8; }
    app-lab .lab-label small { color: #5a5f7a; font-size: 11px; line-height: 1.3; }
    app-lab .lab-seg { display: flex; flex-wrap: wrap; gap: 4px; }
    app-lab .lab-seg button, app-lab .lab-action { border: 1px solid #262a3d; background: #0d0e14; color: #8a90ad; padding: 4px 10px; border-radius: 6px; font: 600 12px system-ui, sans-serif; cursor: pointer; margin: 0; }
    app-lab .lab-seg button:hover, app-lab .lab-action:hover { background: #1e2130; color: #fff; }
    app-lab .lab-seg button[aria-pressed='true'] { background: var(--accent); border-color: var(--accent); color: #fff; }
    app-lab .lab-action { margin: 4px 6px 4px 0; padding: 7px 12px; }
    app-lab .lab-switch { justify-self: start; width: 42px; height: 24px; border-radius: 999px; border: 0; background: #2a2f45; position: relative; cursor: pointer; padding: 0; margin: 0; transition: background .15s; }
    app-lab .lab-switch i { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; transition: transform .15s; }
    app-lab .lab-switch[aria-checked='true'] { background: var(--accent); }
    app-lab .lab-switch[aria-checked='true'] i { transform: translateX(18px); }
    app-lab .lab-num { display: flex; align-items: center; gap: 10px; }
    app-lab .lab-num input { flex: 1; accent-color: var(--accent); }
    app-lab .lab-num output { min-width: 28px; text-align: right; font-variant-numeric: tabular-nums; }
    app-lab .lab-colors { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
    app-lab .lab-swatch { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #262a3d; cursor: pointer; padding: 0; margin: 0; }
    app-lab .lab-swatch[aria-pressed='true'] { border-color: #fff; }
    app-lab .lab-colors input[type='color'] { width: 28px; height: 24px; padding: 0; border: 0; background: none; }
    app-lab .lab-foot { color: #5a5f7a; font-size: 11px; margin: 12px 0 0; }
    app-lab :focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  `,
  template: `
    <div class="lab" data-testid="lab">
      <div class="lab-body">
        <div class="lab-stage">
          <div class="lab-chart" #area>
            @if (area_().width > 0 && area_().height > 0) {
              <sl-chart
                [data]="props().data" [indicators]="props().indicators" [shadedAreas]="props().shadedAreas" [markers]="props().markers" [customPanels]="props().customPanels"
                [width]="size().width" [height]="size().height" [intervalMs]="props().intervalMs" [visibleDataPoints]="props().visibleDataPoints"
                [theme]="props().theme" [chartType]="props().chartType" [showOhlcHud]="props().showOhlcHud ?? false" [showRsiPanel]="props().showRsiPanel"
                [rsiPeriod]="props().rsiPeriod" [showMacdPanel]="props().showMacdPanel" [showVolumePanel]="props().showVolumePanel" [showGrid]="props().showGrid"
                [hour12]="props().hour12" [maxZoom]="props().maxZoom" [scrollToLatestTrigger]="props().scrollToLatestTrigger"
                (crosshairChange)="onHover($event)" />
            }
          </div>
          <div class="lab-status" data-testid="readout">
            @if (hovered(); as c) {
              <span>{{ stamp(c) }} · O {{ c.open.toFixed(2) }} · H {{ c.high.toFixed(2) }} · L {{ c.low.toFixed(2) }} · C {{ c.close.toFixed(2) }}@if (c.volume != null) { · V {{ c.volume }} }</span>
            } @else {
              <span>Hover the chart to inspect a candle</span>
            }
            <span class="lab-count" data-testid="candle-count">{{ props().data.length.toLocaleString() }} candles · {{ events() }} crosshair events</span>
          </div>
        </div>
        <aside class="lab-panel" aria-label="Every capability">
          @for (g of groups(); track g.group) {
            <section [attr.data-testid]="'lab-group-' + slug(g.group)">
              <h2>{{ g.group }}</h2>
              @for (cap of g.items; track cap.id) {
                @if (kind(cap) === 'action') {
                  <button type="button" class="lab-action" [attr.data-testid]="'lab-' + cap.id" [title]="cap.hint ?? ''" (click)="act(cap)">{{ cap.label }}</button>
                } @else {
                  <div class="lab-row" [attr.data-testid]="'lab-' + cap.id">
                    <div class="lab-label"><span>{{ cap.label }}</span>@if (cap.hint) { <small>{{ cap.hint }}</small> }</div>
                    @switch (kind(cap)) {
                      @case ('bool') {
                        <button type="button" role="switch" class="lab-switch" [attr.aria-checked]="value(cap) ? 'true' : 'false'" [attr.aria-label]="cap.label" [attr.data-testid]="'lab-' + cap.id + '-switch'" (click)="set(cap.id, !value(cap))"><i></i></button>
                      }
                      @case ('enum') {
                        <div class="lab-seg" role="group" [attr.aria-label]="cap.label">
                          @for (o of options(cap); track o.value) {
                            <button type="button" [attr.aria-pressed]="selected(cap.id) === o.value ? 'true' : 'false'" [attr.data-testid]="'lab-' + cap.id + '-' + o.value" (click)="set(cap.id, o.value)">{{ o.label }}</button>
                          }
                        </div>
                      }
                      @case ('number') {
                        <div class="lab-num">
                          <input type="range" [attr.min]="range(cap).min" [attr.max]="range(cap).max" [attr.step]="range(cap).step" [value]="value(cap)" [attr.aria-label]="cap.label" [attr.data-testid]="'lab-' + cap.id + '-range'" (input)="set(cap.id, +$any($event.target).value)" />
                          <output>{{ value(cap) }}</output>
                        </div>
                      }
                      @case ('color') {
                        <div class="lab-colors">
                          @for (p of presets(cap); track p) {
                            <button type="button" class="lab-swatch" [style.background]="p" [attr.aria-label]="cap.label + ' ' + p" [attr.aria-pressed]="value(cap) === p ? 'true' : 'false'" [attr.data-testid]="'lab-' + cap.id + '-' + p" (click)="set(cap.id, p)"></button>
                          }
                          <input type="color" [value]="value(cap)" [attr.aria-label]="cap.label + ' (custom)'" (input)="set(cap.id, $any($event.target).value)" />
                        </div>
                      }
                    }
                  </div>
                }
              }
            </section>
          }
          <p class="lab-foot">Every <code>ChartProps</code> field has a control (enforced by a test).</p>
        </aside>
      </div>
    </div>
  `,
})
export class LabComponent implements OnDestroy {
  private readonly model = createLab();
  readonly state = signal<LabState>(this.model.getState());
  private readonly data = signal<Candle[]>(this.model.getChartData());
  readonly hovered = signal<Candle | null>(null);
  readonly events = signal(0);
  readonly area_ = signal({ width: 0, height: 0 });
  readonly groups = computed(() => visibleCapabilities(this.state()));
  readonly size = computed(() => labSize(this.state().size, this.area_()));
  readonly props = computed(() => labChartProps(this.state(), this.data()));
  private readonly unsubscribe: () => void;
  private observer?: ResizeObserver;

  // Decorator query: the Vite JIT demo has no Angular compiler transform for signal queries.
  @ViewChild('area', { static: true }) private area!: ElementRef<HTMLElement>;

  constructor() {
    this.unsubscribe = this.model.subscribe(() => {
      this.state.set(this.model.getState());
      this.data.set(this.model.getChartData());
    });
    afterNextRender(() => {
      this.observer = new ResizeObserver(([e]) => this.area_.set({ width: Math.round(e.contentRect.width), height: Math.round(e.contentRect.height) }));
      this.observer.observe(this.area.nativeElement);
    });
  }
  ngOnDestroy() { this.unsubscribe(); this.observer?.disconnect(); this.model.dispose(); }

  kind(c: LabCapability) { return c.control.kind; }
  options(c: LabCapability) { return c.control.kind === 'enum' ? c.control.options : []; }
  presets(c: LabCapability) { return c.control.kind === 'color' ? c.control.presets : []; }
  range(c: LabCapability) { return c.control.kind === 'number' ? c.control : { min: 0, max: 1, step: 1 }; }
  value(c: LabCapability) { return (this.state() as unknown as Record<string, unknown>)[c.id]; }
  selected(id: string) { return labSelected(this.state(), id); }
  set(id: string, raw: string | number | boolean) { labApply(this.model, id, raw); }
  act(c: LabCapability) { if (c.control.kind === 'action') this.model.act(c.control.action); }
  onHover(c: Candle | null) { this.hovered.set(c); this.events.update((n) => n + 1); }
  stamp(c: Candle) { return new Date(c.timestamp).toLocaleString(); }
  slug(g: string) { return g.toLowerCase().replace(/\W+/g, '-'); }
}
