import { afterNextRender, ChangeDetectionStrategy, Component, ElementRef, effect, signal, ViewChild, ViewEncapsulation, computed } from '@angular/core';
import { SlChartComponent } from '@stacklatte/chart-angular';
import type { Candle, ChartTheme, ChartType } from '@stacklatte/chart-angular';
import {
  LIVE_OPTIONS, PLAYGROUND_INITIAL_COUNT, PLAYGROUND_INTERVAL_MS, PLAYGROUND_WARMUP, ZOOM_OPTIONS,
  advanceLive, appendBulk, buildOverlays, liveLabel, playgroundCandles,
} from '@stacklatte/chart-examples';
import type { LiveMs } from '@stacklatte/chart-examples';

/**
 * The same playground as the React demo and the iOS demo's Chart tab: zoom, candle/line, theme, SMA/EMA/BB overlays,
 * RSI/MACD/Volume panels, the OHLC HUD + crosshair, 12/24h, live ticks down to 100 ms, ↵ Now, ⊙ Reset and the +5K stress button.
 */
@Component({
  selector: 'app-playground',
  standalone: true,
  imports: [SlChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styles: `
    app-playground { display: flex; flex-direction: column; height: calc(100vh - 34px); background: #0d0e14; color: #d4d8e8; }
    app-playground .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; padding: 6px 8px; background: #13141c; border-bottom: 1px solid #1e2130; }
    app-playground .toolLabel { font-size: 9px; font-weight: 700; color: #3a3f58; letter-spacing: 0.8px; margin-right: 2px; text-transform: uppercase; }
    app-playground .divider { width: 1px; height: 14px; background: #1e2130; margin: 0 3px; }
    app-playground .pill { margin: 0; padding: 4px 9px; border-radius: 4px; border: none; background: transparent; color: #5a5f7a; font-size: 11px; font-weight: 600; letter-spacing: 0.2px; cursor: pointer; }
    app-playground .pill:hover { background: #1e2130; }
    app-playground .liveDot { width: 5px; height: 5px; border-radius: 50%; margin-right: 1px; }
    app-playground .actionBtn { margin: 0; padding: 4px 7px; border-radius: 4px; border: 1px solid #1e2130; background: transparent; color: #5a5f7a; font-size: 10px; font-weight: 600; cursor: pointer; }
    app-playground .actionBtn:hover { background: #1e2130; }
    app-playground .actionBtnBlue { border-color: #1a3a6e; color: #60a5fa; }
    app-playground .actionBtnOrange { border-color: #a0522d; color: #cd853f; }
    app-playground .chartWrap { flex: 1; min-height: 0; overflow: hidden; }
    app-playground .statusBar { padding: 6px 10px; background: #13141c; border-top: 1px solid #1e2130; font-size: 11px; color: #5a5f7a; font-variant-numeric: tabular-nums; }
  `,
  template: `
    <div class="toolbar">
      <span class="toolLabel">Zoom</span>
      @for (z of zooms; track z) {
        <button type="button" class="pill" [style]="on(zoom() === z)" (click)="zoom.set(z)">{{ z }}</button>
      }
      <span class="divider"></span>
      <button type="button" class="pill" [style]="on(chartType() === 'candle')" (click)="chartType.set('candle')">Candle</button>
      <button type="button" class="pill" [style]="on(chartType() === 'line')" (click)="chartType.set('line')">Line</button>
      <span class="divider"></span>
      <button type="button" class="pill" id="dark" [style]="on(theme() === 'dark')" (click)="theme.set('dark')">Dark</button>
      <button type="button" class="pill" id="light" [style]="on(theme() === 'light')" (click)="theme.set('light')">Light</button>
      <span class="divider"></span>
      <span class="toolLabel">Overlay</span>
      <button type="button" class="pill" id="sma" [style]="on(sma(), '#F5A623', '#3A2A00')" (click)="sma.set(!sma())">SMA</button>
      <button type="button" class="pill" id="ema" [style]="on(ema(), '#50E3C2', '#0A2A26')" (click)="ema.set(!ema())">EMA</button>
      <button type="button" class="pill" id="bb" [style]="on(bb(), '#C39BD3', '#2A1A3A')" (click)="bb.set(!bb())">BB</button>
      <span class="divider"></span>
      <span class="toolLabel">Panel</span>
      <button type="button" class="pill" id="rsi" [style]="on(rsi(), '#FFB84D', '#3A2400')" (click)="rsi.set(!rsi())">RSI</button>
      <button type="button" class="pill" id="macd" [style]="on(macd(), '#60A5FA', '#0A1A3A')" (click)="macd.set(!macd())">MACD</button>
      <button type="button" class="pill" id="volume" [style]="on(volume(), '#60A5FA', '#0A1A3A')" (click)="volume.set(!volume())">Volume</button>
      <button type="button" class="pill" id="hud" [style]="on(hud())" (click)="hud.set(!hud())">HUD</button>
      <span class="divider"></span>
      <button type="button" class="pill" [style]="on(!hour12())" (click)="hour12.set(false)">24h</button>
      <button type="button" class="pill" [style]="on(hour12())" (click)="hour12.set(true)">12h</button>
      <span class="divider"></span>
      <span class="liveDot" [style.background-color]="liveColor()"></span>
      @for (v of liveOptions; track v) {
        <button type="button" class="pill" [attr.data-live]="v" [style]="liveStyle(v)" (click)="liveMs.set(v)">{{ liveLabel(v) }}</button>
      }
      <span class="divider"></span>
      <button type="button" class="actionBtn" id="now" (click)="latest.set(latest() + 1)">↵ Now</button>
      <button type="button" class="actionBtn actionBtnBlue" id="reset" (click)="zoom.set(60)">⊙ Reset</button>
      <button type="button" class="actionBtn actionBtnOrange" id="append" (click)="addBulk()">+5K</button>
    </div>

    <div class="chartWrap" #wrap>
      @if (size().width > 0 && size().height > 0) {
        <sl-chart
          [data]="data()" [indicators]="overlays().indicators" [shadedAreas]="overlays().shadedAreas"
          [width]="size().width" [height]="size().height" [intervalMs]="intervalMs"
          [visibleDataPoints]="zoom()" [theme]="theme()" [chartType]="chartType()"
          [showRsiPanel]="rsi()" [showMacdPanel]="macd()" [showVolumePanel]="volume()" [showOhlcHud]="hud()"
          [scrollToLatestTrigger]="latest()" [hour12]="hour12()"
          (crosshairChange)="hovered.set($event)" />
      }
    </div>

    <div class="statusBar" id="readout">
      @if (hovered(); as c) {
        {{ stamp(c) }} · O {{ c.open.toFixed(2) }} · H {{ c.high.toFixed(2) }} · L {{ c.low.toFixed(2) }} · C {{ c.close.toFixed(2) }}@if (c.volume != null) { · V {{ c.volume }} }
      } @else {
        Hover the chart to inspect a candle · {{ data().length }} candles loaded
      }
    </div>
  `,
})
export class PlaygroundComponent {
  readonly zooms = ZOOM_OPTIONS;
  readonly liveOptions = LIVE_OPTIONS;
  readonly liveLabel = liveLabel;
  readonly intervalMs = PLAYGROUND_INTERVAL_MS;

  readonly chartType = signal<ChartType>('candle');
  readonly theme = signal<ChartTheme>('dark');
  readonly zoom = signal(60);
  readonly hour12 = signal(false);
  readonly sma = signal(false);
  readonly ema = signal(false);
  readonly bb = signal(false);
  readonly rsi = signal(false);
  readonly macd = signal(false);
  readonly volume = signal(false);
  readonly hud = signal(true);
  readonly liveMs = signal<LiveMs>(3000);
  readonly latest = signal(0);
  readonly hovered = signal<Candle | null>(null);
  readonly size = signal({ width: 0, height: 0 });

  private readonly all = signal<Candle[]>(playgroundCandles(PLAYGROUND_INITIAL_COUNT));
  readonly data = computed(() => this.all().slice(PLAYGROUND_WARMUP));
  readonly overlays = computed(() => buildOverlays(this.all(), this.sma(), this.ema(), this.bb()));
  readonly liveColor = computed(() => (this.liveMs() === null ? '#5A5F7A' : this.liveMs() === 100 ? '#E53935' : '#26A65B'));

  // Decorator query (not viewChild()): the Vite JIT demo has no Angular compiler transform for signal queries.
  @ViewChild('wrap', { static: true }) private wrap!: ElementRef<HTMLElement>;

  constructor() {
    // Live feed: restarted whenever the speed pill changes, cleaned up with the component.
    effect((onCleanup) => {
      const ms = this.liveMs();
      if (ms === null) return;
      const id = setInterval(() => this.all.update(advanceLive), ms);
      onCleanup(() => clearInterval(id));
    });
    afterNextRender(() => {
      const observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        this.size.set({ width: Math.round(width), height: Math.round(height) });
      });
      observer.observe(this.wrap.nativeElement);
    });
  }

  addBulk() {
    this.all.update(appendBulk);
    this.latest.update((v) => v + 1);
  }

  stamp(c: Candle) { return new Date(c.timestamp).toLocaleString(); }

  on(active: boolean, color = '#FFFFFF', bg = '#2563EB') {
    return active ? `color:${color};background-color:${bg}` : '';
  }
  liveStyle(v: LiveMs) {
    return this.on(this.liveMs() === v, v === 100 ? '#E53935' : v === null ? '#5A5F7A' : '#26A65B', v === 100 ? '#3D1A1A' : v === null ? '#222436' : '#1A3D2B');
  }
}
