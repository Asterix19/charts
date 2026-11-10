import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  PLATFORM_ID,
  SimpleChanges,
  afterNextRender,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ChartController } from '@stacklatte/chart-canvas';
import type {
  Candle,
  ChartMarker,
  ChartProps,
  ChartTheme,
  ChartThemeColors,
  ChartType,
  CustomPanel,
  IndicatorLine,
  ShadedArea,
} from '@stacklatte/chart-engine';

/**
 * `<sl-chart>` — Stacklatte trading chart for Angular (standalone component).
 *
 * ```html
 * <sl-chart [data]="candles" [width]="800" [height]="480" theme="dark"
 *           [showVolumePanel]="true" [showRsiPanel]="true" (crosshairChange)="onHover($event)" />
 * ```
 *
 * Same inputs as the React / React Native `SLChart`. Drawing and gestures live in the
 * framework-agnostic `ChartController`; this component only wires inputs to it, so it
 * renders nothing on the server and attaches in the browser after first render.
 * Chart repaints run outside the Angular zone (no change detection per frame).
 */
@Component({
  selector: 'sl-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sl-chart-host" [style.width.px]="width" [style.height.px]="height" style="position:relative">
      @if (showOhlcHud && hudCandle(); as c) {
        <div class="sl-chart-hud" style="position:absolute;top:8px;left:8px;z-index:1;pointer-events:none;font:11px ui-monospace,monospace;padding:6px 8px;border-radius:6px;background:rgba(0,0,0,.6);color:#fff">
          <div>{{ inspecting() ? 'INSPECT' : 'LIVE' }}</div>
          <div>O {{ c.open }}  H {{ c.high }}</div>
          <div>L {{ c.low }}  C {{ c.close }}</div>
        </div>
      }
    </div>
  `,
  styles: [':host { display: inline-block; }'],
})
export class SlChartComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) data!: Candle[];
  @Input({ required: true }) width!: number;
  @Input({ required: true }) height!: number;
  @Input() indicators?: IndicatorLine[];
  @Input() shadedAreas?: ShadedArea[];
  @Input() markers?: ChartMarker[];
  @Input() customPanels?: CustomPanel[];
  @Input() intervalMs?: number;
  @Input() visibleDataPoints?: number;
  @Input() theme?: ChartTheme | ChartThemeColors;
  @Input() chartType?: ChartType;
  @Input() showOhlcHud = false;
  @Input() showRsiPanel?: boolean;
  @Input() rsiPeriod?: number;
  @Input() showMacdPanel?: boolean;
  @Input() showVolumePanel?: boolean;
  @Input() showGrid?: boolean;
  @Input() hour12?: boolean;
  @Input() maxZoom?: number;
  /** Increment to jump the viewport to the latest candle. */
  @Input() scrollToLatestTrigger?: number;

  /** Emits the inspected candle while the crosshair is active, `null` when it is released. */
  @Output() crosshairChange = new EventEmitter<Candle | null>();

  protected readonly inspecting = signal(false);
  private readonly lastCandle = signal<Candle | null>(null);
  private readonly crosshair = signal<Candle | null>(null);
  protected readonly hudCandle = () => this.crosshair() ?? this.lastCandle();

  private controller?: ChartController;
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly zone = inject(NgZone);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  constructor() {
    afterNextRender(() => {
      if (!this.isBrowser) return;
      const mount = this.host.nativeElement.querySelector('.sl-chart-host') as HTMLElement;
      // Keep the animation-frame repaint loop and pointer handlers out of Angular's zone.
      this.controller = this.zone.runOutsideAngular(() => new ChartController(mount, this.props()));
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['data']) this.lastCandle.set(this.data?.length ? this.data[this.data.length - 1] : null);
    this.controller?.update(this.props());
  }

  ngOnDestroy(): void {
    this.controller?.destroy();
    this.controller = undefined;
  }

  private props(): ChartProps {
    return {
      data: this.data ?? [],
      width: this.width,
      height: this.height,
      indicators: this.indicators,
      shadedAreas: this.shadedAreas,
      markers: this.markers,
      customPanels: this.customPanels,
      intervalMs: this.intervalMs,
      visibleDataPoints: this.visibleDataPoints,
      theme: this.theme,
      chartType: this.chartType,
      showOhlcHud: this.showOhlcHud,
      showRsiPanel: this.showRsiPanel,
      rsiPeriod: this.rsiPeriod,
      showMacdPanel: this.showMacdPanel,
      showVolumePanel: this.showVolumePanel,
      showGrid: this.showGrid,
      hour12: this.hour12,
      maxZoom: this.maxZoom,
      scrollToLatestTrigger: this.scrollToLatestTrigger,
      onCrosshairChange: (candle) => this.zone.run(() => {
        this.crosshair.set(candle);
        this.inspecting.set(candle !== null);
        this.crosshairChange.emit(candle);
      }),
    };
  }
}
