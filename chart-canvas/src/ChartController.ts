/**
 * ChartController — a framework-agnostic, DOM-only chart: give it a host element and
 * `ChartProps`, call `update()` whenever props change, `destroy()` when done.
 *
 * It owns the canvases, viewport state, pan / pinch / wheel gestures and crosshair, and
 * draws through the same primitives and engine functions as the React renderer, so any
 * framework (Angular, Vue, Svelte, plain JS) can wrap it in a few lines.
 *
 * Rendering is coalesced to one repaint per animation frame.
 */

import {
  applyZoomOutResistance,
  buildCandleGeometry,
  buildLinePoints,
  buildPaddedRange,
  buildSeriesPoints,
  buildShadedAreaPoints,
  buildTimestampIndex,
  calcMACD,
  calcRSI,
  clampViewport,
  computeCustomPanelYRange,
  computeLayout,
  filterByWindow,
  findIndicatorById,
  findIndicatorValue,
  getSeriesX,
  getThemeColors,
  getY,
  maxLegibleVisibleCandles,
  normalizeCandles,
  prepareIndicatorData,
  resolveIntervalMs,
  softZoomOutCeiling,
} from '@stacklatte/chart-engine';
import type { Candle, CandleViewport, ChartProps } from '@stacklatte/chart-engine';

import { getScaledContext } from './canvasDpr';
import { drawAxis } from './draw/axis';
import { drawCrosshairLines } from './draw/crosshair';
import { drawCustomPanel } from './draw/customPanel';
import { drawMacdPanel } from './draw/macdPanel';
import { drawCandles, drawCrosshairDot, drawLineSeries, drawShadedArea } from './draw/mainPanel';
import { drawMarkers } from './draw/markers';
import { drawRsiPanel } from './draw/rsiPanel';
import { drawVolumePanel } from './draw/volumePanel';

const MIN_VISIBLE_CANDLES = 4;
const MACD_WARMUP = 35; // slowPeriod(26) + signalPeriod(9)

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export class ChartController {
  private props: ChartProps;
  private sortedData: Candle[] = [];
  private viewport: CandleViewport = { start: 0, end: 0 };
  private isFollowingLive = true;
  private lockedTimestamp: number | null = null;
  private lastCrosshairTs: number | null = null;

  private readonly root: HTMLDivElement;
  private readonly mainCanvas: HTMLCanvasElement;
  private readonly panelCanvases = new Map<string, HTMLCanvasElement>();
  private readonly panelWrappers = new Map<string, HTMLDivElement>();

  private rafId: number | null = null;
  private destroyed = false;

  // gesture state
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private panStart: CandleViewport = { start: 0, end: 0 };
  private pinchStart: CandleViewport = { start: 0, end: 0 };
  private pinchDistance = 0;
  private dragStartX = 0;
  private dragging = false;
  private pinching = false;

  // geometry captured by the last render, read by gesture handlers
  private geo = { chartWidth: 1, padLeft: 0, slotWidth: 1, fractionalOffsetX: 0, visible: [] as Candle[] };
  private prevVisibleDataPoints: number | undefined;
  private prevScrollTrigger: number | undefined;

  constructor(private readonly host: HTMLElement, props: ChartProps) {
    this.props = props;
    this.root = document.createElement('div');
    this.root.style.position = 'relative';
    this.root.style.overflow = 'hidden';

    const mainWrap = document.createElement('div');
    mainWrap.style.position = 'relative';
    mainWrap.style.overflow = 'hidden';
    this.mainCanvas = document.createElement('canvas');
    this.mainCanvas.style.display = 'block';
    this.mainCanvas.style.touchAction = 'none';
    mainWrap.appendChild(this.mainCanvas);
    this.root.appendChild(mainWrap);
    host.appendChild(this.root);

    this.attachGestures();
    this.sortedData = normalizeCandles(props.data);
    this.resetViewport();
    this.prevVisibleDataPoints = props.visibleDataPoints;
    this.prevScrollTrigger = props.scrollToLatestTrigger;
    this.scheduleRender();
  }

  /** Apply new props (cheap to call on every change). */
  update(next: ChartProps): void {
    const prev = this.props;
    this.props = next;
    if (next.data !== prev.data) this.sortedData = normalizeCandles(next.data);

    const dataLen = this.sortedData.length;
    if (next.visibleDataPoints !== this.prevVisibleDataPoints) {
      this.prevVisibleDataPoints = next.visibleDataPoints;
      this.resetViewport();
    } else if (next.scrollToLatestTrigger !== this.prevScrollTrigger) {
      this.prevScrollTrigger = next.scrollToLatestTrigger;
      const range = this.viewport.end - this.viewport.start || this.initialRange();
      this.isFollowingLive = true;
      this.viewport = clampViewport({ start: dataLen - range, end: dataLen }, dataLen, MIN_VISIBLE_CANDLES);
    } else if (dataLen <= 0) {
      this.viewport = { start: 0, end: 0 };
    } else {
      const range = this.viewport.end - this.viewport.start || this.initialRange();
      this.viewport = this.isFollowingLive
        ? clampViewport({ start: dataLen - range, end: dataLen }, dataLen, MIN_VISIBLE_CANDLES)
        : clampViewport(this.viewport, dataLen, MIN_VISIBLE_CANDLES);
    }
    this.scheduleRender();
  }

  destroy(): void {
    this.destroyed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.detachGestures?.();
    this.root.remove();
  }

  // ── viewport helpers ──────────────────────────────────────────────────────

  private layout() {
    const p = this.props;
    return computeLayout(p.width, p.height, !!p.showRsiPanel, !!p.showMacdPanel, !!p.showVolumePanel, p.customPanels?.length ?? 0);
  }

  private maxVisible(): number {
    return this.props.maxZoom ?? maxLegibleVisibleCandles(this.layout().chartWidth, MIN_VISIBLE_CANDLES);
  }

  private initialRange(): number {
    const want = this.props.visibleDataPoints ?? 60;
    return Math.min(Math.max(MIN_VISIBLE_CANDLES, want), this.maxVisible(), this.sortedData.length || want);
  }

  private resetViewport(): void {
    const len = this.sortedData.length;
    const range = clamp(this.props.visibleDataPoints ?? 60, MIN_VISIBLE_CANDLES, Math.min(len || (this.props.visibleDataPoints ?? 60), this.maxVisible()));
    this.isFollowingLive = true;
    this.viewport = clampViewport({ start: len - range, end: len }, len, MIN_VISIBLE_CANDLES);
  }

  private setViewport(next: CandleViewport): void {
    this.viewport = next;
    this.isFollowingLive = next.end >= this.sortedData.length - 0.01;
    this.scheduleRender();
  }

  // ── gestures ──────────────────────────────────────────────────────────────

  private detachGestures?: () => void;

  private attachGestures(): void {
    const canvas = this.mainCanvas;
    const localX = (clientX: number) => clientX - canvas.getBoundingClientRect().left;

    const lockAt = (x: number) => {
      const { visible, padLeft, fractionalOffsetX, slotWidth } = this.geo;
      if (!visible.length) return;
      const idx = clamp(Math.floor((x - padLeft - fractionalOffsetX) / slotWidth), 0, visible.length - 1);
      this.lockedTimestamp = visible[idx]?.timestamp ?? null;
      this.scheduleRender();
    };
    const release = () => {
      if (this.lockedTimestamp === null) return;
      this.lockedTimestamp = null;
      this.scheduleRender();
    };

    const pan = (translationX: number) => {
      const range = this.panStart.end - this.panStart.start;
      const delta = translationX * (range / this.geo.chartWidth);
      this.setViewport(clampViewport(
        { start: this.panStart.start - delta, end: this.panStart.end - delta },
        this.sortedData.length,
        MIN_VISIBLE_CANDLES,
      ));
    };

    const zoom = (scale: number, focalX: number) => {
      if (!Number.isFinite(scale) || scale <= 0) return;
      const { chartWidth, padLeft } = this.geo;
      const len = this.sortedData.length;
      const oldRange = this.pinchStart.end - this.pinchStart.start;
      const ratio = clamp((focalX - padLeft) / chartWidth, 0, 1);
      const focalIndex = this.pinchStart.start + oldRange * ratio;
      const maxVisible = Math.min(this.maxVisible(), len);
      const resisted = applyZoomOutResistance(oldRange / scale, maxVisible);
      const range = clamp(resisted, MIN_VISIBLE_CANDLES, Math.min(softZoomOutCeiling(maxVisible), len));
      this.setViewport(clampViewport(
        { start: focalIndex - range * ratio, end: focalIndex + range * (1 - ratio) },
        len,
        MIN_VISIBLE_CANDLES,
      ));
    };

    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size >= 2) {
        this.dragging = false;
        this.pinching = true;
        this.pinchStart = this.viewport;
        const [a, b] = [...this.pointers.values()];
        this.pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
        return;
      }
      this.dragging = true;
      this.panStart = this.viewport;
      this.dragStartX = e.clientX;
      if (this.props.showOhlcHud) lockAt(localX(e.clientX));
    };

    const onMove = (e: PointerEvent) => {
      if (this.pinching) {
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pts = [...this.pointers.values()];
        if (pts.length >= 2) {
          const [a, b] = pts;
          const scale = this.pinchDistance > 0 ? Math.hypot(a.x - b.x, a.y - b.y) / this.pinchDistance : 1;
          zoom(scale, localX((a.x + b.x) / 2));
        }
        return;
      }
      if (this.dragging) {
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        pan(e.clientX - this.dragStartX);
        if (this.props.showOhlcHud) lockAt(localX(e.clientX));
        return;
      }
      if (e.pointerType === 'mouse' && e.buttons === 0 && this.props.showOhlcHud) lockAt(localX(e.clientX));
    };

    const onUp = (e: PointerEvent) => {
      if (canvas.hasPointerCapture?.(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pinching) {
        const rest = [...this.pointers.values()];
        if (rest.length === 1) {
          this.pinching = false;
          this.dragging = true;
          this.panStart = this.viewport;
          this.dragStartX = rest[0].x;
        } else if (rest.length === 0) {
          this.pinching = false;
        }
        return;
      }
      if (this.pointers.size === 0) {
        this.dragging = false;
        if (e.pointerType !== 'mouse') release();
      }
    };

    const onLeave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && !this.dragging && !this.pinching) release();
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      this.pinchStart = this.viewport;
      zoom(Math.exp(-e.deltaY * 0.001), localX(e.clientX));
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    this.detachGestures = () => {
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
  }

  // ── rendering ─────────────────────────────────────────────────────────────

  private scheduleRender(): void {
    if (this.destroyed || this.rafId !== null) return;
    this.rafId = requestAnimationFrame(() => {
      this.rafId = null;
      if (!this.destroyed) this.render();
    });
  }

  /** Creates / removes panel canvases so the DOM matches the requested panels, in stack order. */
  private syncPanels(keys: string[], heights: Record<string, number>, panelGap: number, width: number): void {
    for (const [key, wrap] of this.panelWrappers) {
      if (!keys.includes(key)) {
        wrap.remove();
        this.panelWrappers.delete(key);
        this.panelCanvases.delete(key);
      }
    }
    for (const key of keys) {
      let wrap = this.panelWrappers.get(key);
      if (!wrap) {
        wrap = document.createElement('div');
        const canvas = document.createElement('canvas');
        canvas.style.display = 'block';
        wrap.appendChild(canvas);
        this.panelWrappers.set(key, wrap);
        this.panelCanvases.set(key, canvas);
      }
      wrap.style.width = `${width}px`;
      wrap.style.height = `${panelGap + heights[key]}px`;
      wrap.style.paddingTop = `${panelGap}px`;
      wrap.style.boxSizing = 'border-box';
      const canvas = this.panelCanvases.get(key)!;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${heights[key]}px`;
      this.root.appendChild(wrap); // appendChild re-orders existing nodes, keeping stack order
    }
  }

  private render(): void {
    const p = this.props;
    const { width, height } = p;
    const theme = p.theme ?? 'dark';
    const colors = getThemeColors(theme);
    const chartType = p.chartType ?? 'candle';
    const hour12 = p.hour12 ?? false;
    const showGrid = p.showGrid ?? true;
    const rsiPeriod = p.rsiPeriod ?? 14;
    const sortedData = this.sortedData;
    const L = this.layout();
    const { padding, chartWidth, panelGap, mainChartHeight, mainCanvasHeight } = L;

    this.root.style.width = `${width}px`;
    this.root.style.height = `${height}px`;
    this.root.style.backgroundColor = colors.background;

    const vp = this.viewport;
    const visibleStart = Math.floor(vp.start);
    const visibleEnd = Math.ceil(vp.end);
    const visible = sortedData.slice(visibleStart, visibleEnd);

    if (!visible.length) {
      const ctx = getScaledContext(this.mainCanvas, width, mainCanvasHeight);
      this.mainCanvas.style.width = `${width}px`;
      this.mainCanvas.style.height = `${mainCanvasHeight}px`;
      if (ctx) {
        ctx.fillStyle = colors.priceLabel;
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No data', width / 2, mainCanvasHeight / 2);
      }
      this.syncPanels([], {}, panelGap, width);
      this.geo = { ...this.geo, visible: [] };
      return;
    }

    const range = vp.end - vp.start;
    const slotWidth = range > 0 ? chartWidth / range : chartWidth;
    const virtualWidth = visible.length * slotWidth;
    const fractionalOffsetX = -(vp.start - visibleStart) * slotWidth;
    this.geo = { chartWidth, padLeft: padding.left, slotWidth, fractionalOffsetX, visible };

    const intervalMs = resolveIntervalMs(p.intervalMs, sortedData);
    const startTs = visible[0].timestamp - intervalMs;
    const endTs = visible[visible.length - 1].timestamp + intervalMs;

    const rsi = p.showRsiPanel ? calcRSI(sortedData.slice(Math.max(0, visibleStart - rsiPeriod), visibleEnd), rsiPeriod) : [];
    const macd = p.showMacdPanel ? calcMACD(sortedData.slice(Math.max(0, visibleStart - MACD_WARMUP), visibleEnd)) : null;
    const prepared = (p.indicators ?? []).map((line) => ({ line, data: prepareIndicatorData(line, startTs, endTs) }));
    const shaded = (p.shadedAreas ?? []).flatMap((area) => {
      const from = findIndicatorById(p.indicators, area.fromId);
      const to = findIndicatorById(p.indicators, area.toId);
      return from && to
        ? [{ area, fromData: prepareIndicatorData(from, startTs, endTs), toData: prepareIndicatorData(to, startTs, endTs) }]
        : [];
    });
    const markers = p.markers?.length ? filterByWindow(p.markers, visible[0].timestamp, visible[visible.length - 1].timestamp) : [];
    const customPanels = (p.customPanels ?? []).map((panel) => {
      const series = panel.series.map((line) => ({ line, data: prepareIndicatorData(line, startTs, endTs) }));
      const { yMin, yMax } = computeCustomPanelYRange(panel.yRange, series.map((s) => s.data), panel.referenceLines);
      return { panel, series, yMin, yMax };
    });

    const values = [
      ...visible.flatMap((c) => [c.high, c.low]),
      ...prepared.flatMap(({ data }) => data.map((pt) => pt.value).filter((v) => typeof v === 'number' && Number.isFinite(v))),
    ];
    const price = buildPaddedRange(Math.min(...values), Math.max(...values), 0.05);

    // crosshair
    const idx = this.lockedTimestamp === null ? -1 : visible.findIndex((c) => c.timestamp === this.lockedTimestamp);
    const crossCandle = idx >= 0 ? visible[idx] : null;
    const crossX = crossCandle ? (idx + 0.5) * slotWidth + fractionalOffsetX : null;
    const crossY = crossCandle ? getY(crossCandle.close, price.min, price.max, mainChartHeight) : null;
    if ((crossCandle?.timestamp ?? null) !== this.lastCrosshairTs) {
      this.lastCrosshairTs = crossCandle?.timestamp ?? null;
      p.onCrosshairChange?.(crossCandle);
    }

    // ── panel DOM ──
    const keys: string[] = [];
    const heights: Record<string, number> = {};
    if (p.showVolumePanel) { keys.push('volume'); heights.volume = L.volumePanelHeight; }
    if (p.showRsiPanel) { keys.push('rsi'); heights.rsi = L.rsiPanelHeight; }
    if (p.showMacdPanel && macd) { keys.push('macd'); heights.macd = L.macdPanelHeight; }
    for (const { panel } of customPanels) { keys.push(`custom:${panel.id}`); heights[`custom:${panel.id}`] = L.customPanelHeight; }
    this.syncPanels(keys, heights, panelGap, width);
    this.mainCanvas.style.width = `${width}px`;
    this.mainCanvas.style.height = `${mainCanvasHeight}px`;

    // ── main panel ──
    const ctx = getScaledContext(this.mainCanvas, width, mainCanvasHeight);
    if (ctx) {
      drawAxis(ctx, {
        sortedData, viewportStart: vp.start, viewportEnd: vp.end, intervalMs, width, height: mainCanvasHeight,
        priceMin: price.min, priceMax: price.max, padding, colors, hour12, showGrid,
      });
      ctx.save();
      ctx.beginPath();
      ctx.rect(padding.left, padding.top, chartWidth, mainChartHeight);
      ctx.clip();

      ctx.save();
      ctx.translate(padding.left + fractionalOffsetX, padding.top);
      if (chartType === 'candle') {
        drawCandles(ctx, buildCandleGeometry(visible, virtualWidth, mainChartHeight, price.min, price.max, colors.candleUp, colors.candleDown));
      } else {
        drawLineSeries(ctx, buildLinePoints(visible, virtualWidth, mainChartHeight, price.min, price.max), colors.lineChart);
      }
      const index = buildTimestampIndex(visible);
      for (const { line, data } of prepared) {
        if (visible.length < 2 || data.length === 0) continue;
        drawLineSeries(ctx, buildSeriesPoints(data, index, visible.length, virtualWidth, mainChartHeight, price.min, price.max), line.color);
      }
      for (const { area, fromData, toData } of shaded) {
        if (visible.length < 2) continue;
        const { top, bottom } = buildShadedAreaPoints(fromData, toData, index, visible.length, virtualWidth, mainChartHeight, price.min, price.max);
        drawShadedArea(ctx, top, bottom, area.color || '#888', area.opacity ?? 0.3);
      }
      if (markers.length > 0) {
        drawMarkers(ctx, { markers, candleData: visible, width: virtualWidth, height: mainChartHeight, priceMin: price.min, priceMax: price.max, colors });
      }
      ctx.restore();

      if (crossCandle && crossX !== null && crossY !== null) {
        ctx.save();
        ctx.translate(padding.left, padding.top);
        drawCrosshairLines(ctx, { x: crossX, y: crossY, width: chartWidth, height: mainChartHeight, color: colors.crosshair });
        if (chartType === 'line') drawCrosshairDot(ctx, { x: crossX, y: crossY }, colors.lineChart, 2);
        for (const { line } of prepared) {
          const val = findIndicatorValue(line.data, crossCandle.timestamp);
          if (val === null) continue;
          const dotX = fractionalOffsetX + getSeriesX(idx, visible.length, virtualWidth);
          drawCrosshairDot(ctx, { x: dotX, y: getY(val, price.min, price.max, mainChartHeight) }, line.color, 3);
        }
        ctx.restore();
      }
      ctx.restore();
    }

    // ── sub-panels ──
    const frame = (key: string, panelHeight: number, body: (c: CanvasRenderingContext2D) => void, dots?: (c: CanvasRenderingContext2D) => void) => {
      const canvas = this.panelCanvases.get(key);
      if (!canvas) return;
      const c = getScaledContext(canvas, width, panelHeight);
      if (!c) return;
      c.save();
      c.beginPath();
      c.rect(padding.left, 0, chartWidth, panelHeight);
      c.clip();

      c.save();
      c.translate(padding.left + fractionalOffsetX, 0);
      c.strokeStyle = colors.crosshair;
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, 0);
      c.lineTo(chartWidth, 0);
      c.stroke();
      body(c);
      c.restore();

      if (crossCandle && crossX !== null) {
        c.save();
        c.translate(padding.left + crossX, 0);
        c.strokeStyle = colors.crosshair;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(0, 0);
        c.lineTo(0, panelHeight);
        c.stroke();
        dots?.(c);
        c.restore();
      }
      c.restore();
    };

    if (p.showVolumePanel) {
      frame('volume', L.volumePanelHeight, (c) => drawVolumePanel(c, { candleData: visible, width: virtualWidth, height: L.volumePanelHeight, colors }));
    }
    if (p.showRsiPanel) {
      const rsiAt = crossCandle ? findIndicatorValue(rsi, crossCandle.timestamp) : null;
      frame(
        'rsi', L.rsiPanelHeight,
        (c) => drawRsiPanel(c, { data: rsi, candleData: visible, width: virtualWidth, height: L.rsiPanelHeight, colors }),
        (c) => { if (rsiAt != null) drawCrosshairDot(c, { x: 0, y: getY(rsiAt, 0, 100, L.rsiPanelHeight) }, colors.rsiLine, 2); },
      );
    }
    if (p.showMacdPanel && macd) {
      frame('macd', L.macdPanelHeight, (c) => drawMacdPanel(c, {
        macd: macd.macd, signal: macd.signal, histogram: macd.histogram,
        candleData: visible, width: virtualWidth, height: L.macdPanelHeight, colors,
      }));
    }
    for (const { panel, series, yMin, yMax } of customPanels) {
      frame(
        `custom:${panel.id}`, L.customPanelHeight,
        (c) => drawCustomPanel(c, {
          series: series.map((s) => ({ color: s.line.color, data: s.data })),
          candleData: visible, width: virtualWidth, height: L.customPanelHeight, yMin, yMax,
          referenceLines: panel.referenceLines, colors,
        }),
        (c) => {
          if (!crossCandle) return;
          for (const { line, data } of series) {
            const val = findIndicatorValue(data, crossCandle.timestamp);
            if (val !== null) drawCrosshairDot(c, { x: 0, y: getY(val, yMin, yMax, L.customPanelHeight) }, line.color, 2);
          }
        },
      );
    }
  }
}
