/**
 * OhlcHudView — the OHLC + indicator readout, as plain DOM.
 *
 * A port of the React / React Native `OhlcHud` (same content, layout and behaviour) so every consumer of
 * `ChartController` — Angular, Vue, Svelte, plain JS — gets exactly the HUD the other renderers have:
 *   • LIVE pulse (latest candle) or the inspected candle's time, plus its % change
 *   • O / H / L / C and volume
 *   • RSI (while inspecting), one row per indicator, one row per custom-panel series
 *   • a draggable grip to move it out of the way
 * All caller-supplied text (indicator names, labels) is inserted as text, never as HTML.
 */
import { abbrevName, findIndicatorValue } from '../index';
import type { Candle, ChartThemeColors, IndicatorLine } from '../index';

export interface HudCustomValue {
  id: string;
  label: string;
  color: string;
  value: number;
}

export interface HudData {
  /** The inspected candle, or the latest visible candle when nothing is being inspected. */
  candle: Candle;
  /** True when showing the latest candle (no crosshair). */
  isLive: boolean;
  colors: ChartThemeColors;
  indicators?: IndicatorLine[];
  /** RSI at the inspected candle; shown only while inspecting. */
  rsiValue?: number | null;
  customPanelValues?: HudCustomValue[];
}

const FONT = 'ui-monospace,SFMono-Regular,Menlo,monospace';
const formatTime = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const formatPrice = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function formatVolume(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(2) + 'K';
  return n.toFixed(0);
}

function node(tag: string, style: string, text?: string): HTMLElement {
  const el = document.createElement(tag);
  el.style.cssText = style;
  if (text !== undefined) el.textContent = text;
  return el;
}

export class OhlcHudView {
  readonly element: HTMLDivElement;
  private readonly status: HTMLDivElement;
  private readonly change: HTMLSpanElement;
  private readonly rows: HTMLDivElement;
  private pos = { top: 6, left: 6 };

  constructor(parent: HTMLElement) {
    const root = document.createElement('div');
    root.setAttribute('data-sl-layer', 'ohlc-hud');
    root.style.cssText = 'position:absolute;z-index:10;min-width:110px;padding:2px 10px 8px;border-radius:6px;user-select:none;font-family:' + FONT;

    const header = node('div', 'display:flex;align-items:center;gap:6px;padding:4px 0;cursor:grab;touch-action:none') as HTMLDivElement;
    header.setAttribute('data-sl-hud-grip', '');
    const grip = node('div', 'display:flex;flex-wrap:wrap;width:12px');
    for (let i = 0; i < 6; i++) grip.appendChild(node('span', 'width:3px;height:3px;border-radius:1.5px;margin:1px;opacity:.4;background:currentColor'));
    this.status = node('div', 'display:flex;align-items:center;gap:4px') as HTMLDivElement;
    this.change = node('span', 'font-size:10px;font-weight:700') as HTMLSpanElement;
    const right = node('div', 'flex:1;display:flex;align-items:center;justify-content:space-between');
    right.append(this.status, this.change);
    header.append(grip, right);

    this.rows = node('div', '') as HTMLDivElement;
    root.append(header, this.rows);
    parent.appendChild(root);
    this.element = root;
    this.applyPosition();
    this.attachDrag(header);
  }

  update(d: HudData): void {
    const { candle, isLive, colors } = d;
    const pct = ((candle.close - candle.open) / candle.open) * 100;
    const up = candle.close >= candle.open;
    const changeColor = up ? colors.candleUp : colors.candleDown;

    this.element.style.background = colors.hudBackground;
    this.element.style.color = colors.hudText;

    this.status.replaceChildren(
      ...(isLive
        ? [
            node('div', `width:5px;height:5px;border-radius:3px;background:${colors.candleUp}`),
            node('span', `font-size:9px;font-weight:700;letter-spacing:.5px;color:${colors.candleUp}`, 'LIVE'),
          ]
        : [node('span', `font-size:9px;font-weight:600;letter-spacing:.3px;color:${colors.priceLabel}`, formatTime(candle.timestamp))]),
    );
    this.change.style.color = changeColor;
    this.change.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;

    const row = (label: string, value: string, color: string, dot?: string) => {
      const r = node('div', 'display:flex;align-items:center;padding:1px 0');
      if (dot) r.appendChild(node('span', `width:6px;height:6px;border-radius:3px;margin-right:5px;display:inline-block;background:${dot}`));
      r.append(node('span', `font-size:11px;width:26px;display:inline-block;color:${colors.hudText}`, label), node('span', `font-size:11px;font-weight:600;color:${color}`, value));
      return r;
    };

    const rows: HTMLElement[] = [
      row('O', formatPrice(candle.open), colors.hudText),
      row('H', formatPrice(candle.high), colors.hudText),
      row('L', formatPrice(candle.low), colors.hudText),
      row('C', formatPrice(candle.close), changeColor),
    ];
    if (candle.volume != null) rows.push(row('V', formatVolume(candle.volume), colors.hudText));
    if (d.rsiValue != null) rows.push(row('RSI', d.rsiValue.toFixed(1), colors.rsiLine, colors.rsiLine));
    for (const ind of d.indicators ?? []) {
      const v = findIndicatorValue(ind.data, candle.timestamp);
      if (v !== null) rows.push(row(abbrevName(ind.name ?? ind.id), v.toFixed(2), ind.color, ind.color));
    }
    for (const c of d.customPanelValues ?? []) rows.push(row(abbrevName(c.label), c.value.toFixed(2), c.color, c.color));
    this.rows.replaceChildren(...rows);
  }

  destroy(): void {
    this.element.remove();
  }

  private applyPosition(): void {
    this.element.style.top = `${this.pos.top}px`;
    this.element.style.left = `${this.pos.left}px`;
  }

  /** Drag the HUD by its grip; pointer capture keeps the drag alive and the chart underneath does not pan. */
  private attachDrag(handle: HTMLElement): void {
    let start: { x: number; y: number; top: number; left: number } | null = null;
    handle.addEventListener('pointerdown', (e) => {
      start = { x: e.clientX, y: e.clientY, top: this.pos.top, left: this.pos.left };
      handle.setPointerCapture?.(e.pointerId);
      e.stopPropagation();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!start) return;
      this.pos = { top: Math.max(0, start.top + e.clientY - start.y), left: Math.max(0, start.left + e.clientX - start.x) };
      this.applyPosition();
    });
    const end = (e: PointerEvent) => {
      start = null;
      if (handle.hasPointerCapture?.(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}
