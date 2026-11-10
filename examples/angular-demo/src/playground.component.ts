import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { SlChartComponent } from '@stacklatte/chart-angular';
import type { Candle } from '@stacklatte/chart-angular';

// Deterministic series so e2e runs are reproducible.
function mulberry32(seed: number) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function makeCandles(count: number): Candle[] {
  const rand = mulberry32(7);
  let price = 100;
  return Array.from({ length: count }, (_, i) => {
    const open = price;
    const close = Math.max(1, open * (1 + (rand() - 0.48) * 0.02));
    price = close;
    const span = Math.abs(close - open);
    return {
      timestamp: Date.UTC(2026, 0, 1) + i * 3_600_000,
      open, close,
      high: Math.max(open, close) + span * (0.2 + rand()),
      low: Math.min(open, close) - span * (0.2 + rand()),
      volume: Math.round(500 + rand() * 1500),
    };
  });
}

@Component({
  selector: 'app-playground',
  standalone: true,
  imports: [SlChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main>
      <h1>@stacklatte/chart-angular</h1>
      <button id="rsi" [class.on]="rsi()" (click)="rsi.set(!rsi())">RSI</button>
      <button id="volume" [class.on]="volume()" (click)="volume.set(!volume())">Volume</button>
      <button id="macd" [class.on]="macd()" (click)="macd.set(!macd())">MACD</button>
      <button id="light" [class.on]="theme() === 'light'" (click)="theme.set(theme() === 'light' ? 'dark' : 'light')">Light</button>
      <button id="append" (click)="append()">Append candle</button>
      <sl-chart
        [data]="data()" [width]="900" [height]="520" [theme]="theme()" [showOhlcHud]="true"
        [showRsiPanel]="rsi()" [showVolumePanel]="volume()" [showMacdPanel]="macd()"
        (crosshairChange)="hovered.set($event?.close ?? null)" />
      <div id="readout">{{ hovered() === null ? 'no selection' : 'close ' + hovered()!.toFixed(2) }}</div>
    </main>
  `,
})
export class PlaygroundComponent {
  readonly data = signal(makeCandles(300));
  readonly rsi = signal(false);
  readonly volume = signal(false);
  readonly macd = signal(false);
  readonly theme = signal<'dark' | 'light'>('dark');
  readonly hovered = signal<number | null>(null);

  append() {
    const last = this.data().at(-1)!;
    const close = last.close * 1.01;
    this.data.update((d) => [...d, { timestamp: last.timestamp + 3_600_000, open: last.close, close, high: close * 1.002, low: last.close * 0.998, volume: 900 }]);
  }
}

