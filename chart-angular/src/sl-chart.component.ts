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
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ChartController } from '@stacklatte/chart-engine/canvas';
import type {
  Candle,
  ChartMarker,
  ChartProps,
  ChartTheme,
  ChartThemeColors,
  ChartType,
  MarkerPoint,
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
  template: `<div class="sl-chart-host" [style.width.px]="width" [style.height.px]="height" style="position:relative"></div>`,
  styles: [':host { display: inline-block; }'],
})
export class SlChartComponent implements OnChanges, OnDestroy {
  /** The candles. May be unsorted/duplicated/dirty — they are normalised. */
  @Input({ required: true }) data!: Candle[];
  /** Chart width in CSS pixels. */
  @Input({ required: true }) width!: number;
  /** Chart height in CSS pixels (including sub-panels). */
  @Input({ required: true }) height!: number;
  /** Overlay lines on the price panel (`calcSMA`, `calcEMA`, `calcBollingerBands`). */
  @Input() indicators?: IndicatorLine[];
  /** Filled regions between two `indicators` (matched by id). */
  @Input() shadedAreas?: ShadedArea[];
  /** Trade markers (entry / exit / stop-loss / take-profit). */
  @Input() markers?: ChartMarker[];
  /** Your own named sub-panels for data that fits no built-in panel. */
  @Input() customPanels?: CustomPanel[];
  /** Milliseconds per candle; auto-detected from the data when omitted. */
  @Input() intervalMs?: number;
  /** How many candles are visible at once. Default 60. */
  @Input() visibleDataPoints?: number;
  /** `'dark'` (default), `'light'`, or a full `ChartThemeColors` object. */
  @Input() theme?: ChartTheme | ChartThemeColors;
  /** `'candle'` (default) or `'line'`. */
  @Input() chartType?: ChartType;
  /** Show the OHLC + indicator readout (the same HUD as React / React Native: change %, OHLC, volume, RSI, one row per indicator) and enable the crosshair. */
  @Input() showOhlcHud = false;
  /** Show an RSI sub-panel. */
  @Input() showRsiPanel?: boolean;
  /** RSI lookback period. Default 14. */
  @Input() rsiPeriod?: number;
  /** Show a MACD(12,26,9) sub-panel. */
  @Input() showMacdPanel?: boolean;
  /** Show a volume sub-panel (needs `volume` on the candles). */
  @Input() showVolumePanel?: boolean;
  /** Background grid lines. Default true. */
  @Input() showGrid?: boolean;
  /** Compact mode for lists of small charts: no axes, panels, crosshair or event capture. Draws the whole dataset as an area. */
  @Input() sparkline?: boolean;
  /** 12-hour time labels on the x-axis. Default false. */
  @Input() hour12?: boolean;
  /** Maximum candles visible when zoomed out. */
  @Input() maxZoom?: number;
  /** Increment to jump the viewport to the latest candle. */
  @Input() scrollToLatestTrigger?: number;

  /** Emits the inspected candle while the crosshair is active, `null` when it is released. */
  @Output() crosshairChange = new EventEmitter<Candle | null>();

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
    this.controller?.update(this.props());
  }

  /**
   * The trade markers currently on screen, with `x` / `y` in this component's pixel space — handy for placing your own
   * overlays next to markers. Empty until the first paint.
   */
  getVisibleMarkers(): MarkerPoint[] {
    return this.controller?.getVisibleMarkers() ?? [];
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
      sparkline: this.sparkline,
      hour12: this.hour12,
      maxZoom: this.maxZoom,
      scrollToLatestTrigger: this.scrollToLatestTrigger,
      onCrosshairChange: (candle) => this.zone.run(() => this.crosshairChange.emit(candle)),
    };
  }
}
