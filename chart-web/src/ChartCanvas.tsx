/**
 * SLChart (web) — Canvas 2D renderer sharing chart-core's engine.
 *
 * State management, viewport math, indicator prep and layout all reuse the
 * exact same functions chart-core's ChartCanvas.tsx uses (imported from
 * '@stacklatte/chart-core/core') — only the rendering (Canvas 2D draw calls
 * instead of Skia JSX) and the gesture layer (Pointer Events + wheel instead
 * of react-native-gesture-handler) are web-native reimplementations.
 */

import {
  buildCandleGeometry,
  buildLinePoints,
  buildMarkerPoints,
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
  applyZoomOutResistance,
  findMarkerAt,
  getSeriesX,
  getThemeColors,
  getY,
  maxLegibleVisibleCandles,
  normalizeCandles,
  softZoomOutCeiling,
  prepareIndicatorData,
  resolveIntervalMs,
} from '@stacklatte/chart-core/core';
import type { CandleViewport, ChartProps, MarkerPoint } from '@stacklatte/chart-core/core';
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { getScaledContext } from './canvasDpr';
import { drawAxis } from './draw/axis';
import { drawCrosshairLines } from './draw/crosshair';
import { drawCustomPanel } from './draw/customPanel';
import { drawMacdPanel } from './draw/macdPanel';
import { drawCandles, drawCrosshairDot, drawLineSeries, drawShadedArea } from './draw/mainPanel';
import { drawMarkers } from './draw/markers';
import { drawRsiPanel } from './draw/rsiPanel';
import { drawVolumePanel } from './draw/volumePanel';
import OhlcHud from './components/OhlcHud';
import MarkerTooltip from './components/MarkerTooltip';

type Viewport = CandleViewport;

const MIN_VISIBLE_CANDLES = 4;
const MACD_WARMUP = 35; // slowPeriod(26) + signalPeriod(9)

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const SLChart: React.FC<ChartProps> = ({
  data,
  indicators,
  shadedAreas,
  markers,
  customPanels,
  width,
  height,
  intervalMs: intervalMsProp,
  visibleDataPoints: visibleDataPointsProp = 60,
  theme = 'dark',
  showOhlcHud = false,
  showRsiPanel = false,
  rsiPeriod = 14,
  showMacdPanel = false,
  showVolumePanel = false,
  showGrid = true,
  chartType = 'candle',
  scrollToLatestTrigger,
  onCrosshairChange,
  hour12 = false,
  maxZoom,
}) => {
  const colors = getThemeColors(theme);

  const sortedData = useMemo(() => normalizeCandles(data), [data]);

  const intervalMs = useMemo(
    () => resolveIntervalMs(intervalMsProp, sortedData),
    [intervalMsProp, sortedData],
  );

  const {
    padding, chartWidth, panelGap, rsiPanelHeight, macdPanelHeight, volumePanelHeight, customPanelHeight, mainChartHeight, mainCanvasHeight,
  } = computeLayout(width, height, showRsiPanel, showMacdPanel, showVolumePanel, customPanels?.length ?? 0);

  const initialRange = Math.min(
    Math.max(MIN_VISIBLE_CANDLES, visibleDataPointsProp),
    maxZoom ?? maxLegibleVisibleCandles(chartWidth, MIN_VISIBLE_CANDLES),
    sortedData.length || visibleDataPointsProp,
  );

  const [viewport, setViewport] = useState<Viewport>(() => {
    const end = sortedData.length;
    const start = Math.max(0, end - initialRange);
    return { start, end };
  });

  const [isFollowingLive, setIsFollowingLive] = useState(true);
  const [lockedTimestamp, setLockedTimestamp] = useState<number | null>(null);
  const [hoveredMarker, setHoveredMarker] = useState<MarkerPoint | null>(null);

  const viewportRef = useRef(viewport);
  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const sortedDataLengthRef = useRef(sortedData.length);
  sortedDataLengthRef.current = sortedData.length;

  useEffect(() => {
    const len = sortedDataLengthRef.current;
    const legibleMax = maxZoom ?? maxLegibleVisibleCandles(chartWidth, MIN_VISIBLE_CANDLES);
    const range = clamp(visibleDataPointsProp, MIN_VISIBLE_CANDLES, Math.min(len || visibleDataPointsProp, legibleMax));
    setIsFollowingLive(true);
    setViewport(clampViewport({ start: len - range, end: len }, len, MIN_VISIBLE_CANDLES));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleDataPointsProp]);

  useEffect(() => {
    setViewport((prev) => {
      if (sortedData.length <= 0) return { start: 0, end: 0 };
      const range = prev.end - prev.start || initialRange;
      if (isFollowingLive) {
        return clampViewport(
          { start: sortedData.length - range, end: sortedData.length },
          sortedData.length,
          MIN_VISIBLE_CANDLES,
        );
      }
      return clampViewport(prev, sortedData.length, MIN_VISIBLE_CANDLES);
    });
  }, [sortedData.length, isFollowingLive, initialRange]);

  useEffect(() => {
    if (!scrollToLatestTrigger) return;
    setIsFollowingLive(true);
    setViewport((prev) => {
      const range = prev.end - prev.start || initialRange;
      return clampViewport(
        { start: sortedData.length - range, end: sortedData.length },
        sortedData.length,
        MIN_VISIBLE_CANDLES,
      );
    });
  }, [scrollToLatestTrigger, sortedData.length, initialRange]);

  const visibleStartIndex = Math.floor(viewport.start);
  const visibleEndIndex = Math.ceil(viewport.end);

  const visibleCandles = useMemo(
    () => sortedData.slice(visibleStartIndex, visibleEndIndex),
    [sortedData, visibleStartIndex, visibleEndIndex],
  );

  const slotWidth = useMemo(() => {
    const range = viewport.end - viewport.start;
    return range > 0 ? chartWidth / range : chartWidth;
  }, [chartWidth, viewport]);

  const virtualWidth = visibleCandles.length * slotWidth;

  const fractionalOffsetX = useMemo(
    () => -(viewport.start - visibleStartIndex) * slotWidth,
    [viewport.start, visibleStartIndex, slotWidth],
  );

  const visibleRsi = useMemo(() => {
    if (!showRsiPanel) return [];
    const slice = sortedData.slice(Math.max(0, visibleStartIndex - rsiPeriod), visibleEndIndex);
    return calcRSI(slice, rsiPeriod);
  }, [showRsiPanel, rsiPeriod, sortedData, visibleStartIndex, visibleEndIndex]);

  const visibleMacd = useMemo(() => {
    if (!showMacdPanel) return null;
    const slice = sortedData.slice(Math.max(0, visibleStartIndex - MACD_WARMUP), visibleEndIndex);
    return calcMACD(slice);
  }, [showMacdPanel, sortedData, visibleStartIndex, visibleEndIndex]);

  const preparedIndicators = useMemo(() => {
    if (!indicators?.length || !visibleCandles.length) return [];
    const startTs = visibleCandles[0].timestamp - intervalMs;
    const endTs = visibleCandles[visibleCandles.length - 1].timestamp + intervalMs;
    return indicators.map((line) => ({ line, data: prepareIndicatorData(line, startTs, endTs) }));
  }, [indicators, visibleCandles, intervalMs]);

  const preparedShaded = useMemo(() => {
    if (!shadedAreas?.length || !visibleCandles.length) return [];
    const startTs = visibleCandles[0].timestamp - intervalMs;
    const endTs = visibleCandles[visibleCandles.length - 1].timestamp + intervalMs;
    return shadedAreas.flatMap((area) => {
      const from = findIndicatorById(indicators, area.fromId);
      const to = findIndicatorById(indicators, area.toId);
      if (!from || !to) return [];
      return [{
        area,
        fromData: prepareIndicatorData(from, startTs, endTs),
        toData: prepareIndicatorData(to, startTs, endTs),
      }];
    });
  }, [shadedAreas, indicators, visibleCandles, intervalMs]);

  const visibleMarkers = useMemo(() => {
    if (!markers?.length || !visibleCandles.length) return [];
    const startTs = visibleCandles[0].timestamp;
    const endTs = visibleCandles[visibleCandles.length - 1].timestamp;
    return filterByWindow(markers, startTs, endTs);
  }, [markers, visibleCandles]);

  const preparedCustomPanels = useMemo(() => {
    if (!customPanels?.length || !visibleCandles.length) return [];
    const startTs = visibleCandles[0].timestamp - intervalMs;
    const endTs = visibleCandles[visibleCandles.length - 1].timestamp + intervalMs;
    return customPanels.map((panel) => {
      const series = panel.series.map((line) => ({ line, data: prepareIndicatorData(line, startTs, endTs) }));
      const { yMin, yMax } = computeCustomPanelYRange(panel.yRange, series.map((s) => s.data), panel.referenceLines);
      return { panel, series, yMin, yMax };
    });
  }, [customPanels, visibleCandles, intervalMs]);

  const displayPriceRange = useMemo(() => {
    if (!visibleCandles.length) return { min: 0, max: 1 };
    const candleValues = visibleCandles.flatMap((c) => [c.high, c.low]);
    const indicatorValues = preparedIndicators.flatMap(({ data: lineData }) =>
      lineData.map((point) => point.value).filter((v) => typeof v === 'number' && Number.isFinite(v)),
    );
    const values = [...candleValues, ...indicatorValues];
    return buildPaddedRange(Math.min(...values), Math.max(...values), 0.05);
  }, [visibleCandles, preparedIndicators]);

  const indexByTimestamp = useMemo(() => buildTimestampIndex(visibleCandles), [visibleCandles]);

  // Plot-local marker geometry, reused both to draw (drawMarkers, which
  // recomputes its own copy from the same inputs) and to hit-test hover
  // (findMarkerAt, below) against.
  const markerPoints = useMemo(
    () => buildMarkerPoints(
      visibleMarkers, indexByTimestamp, visibleCandles.length, virtualWidth, mainChartHeight,
      displayPriceRange.min, displayPriceRange.max,
    ),
    [visibleMarkers, indexByTimestamp, visibleCandles.length, virtualWidth, mainChartHeight, displayPriceRange.min, displayPriceRange.max],
  );

  const slotWidthRef = useRef(slotWidth);
  slotWidthRef.current = slotWidth;
  const fractionalOffsetXRef = useRef(fractionalOffsetX);
  fractionalOffsetXRef.current = fractionalOffsetX;
  const visibleCandlesRef = useRef(visibleCandles);
  visibleCandlesRef.current = visibleCandles;
  const markerPointsRef = useRef(markerPoints);
  markerPointsRef.current = markerPoints;

  const crosshairInfo = useMemo(() => {
    if (lockedTimestamp === null) return null;
    const idx = visibleCandles.findIndex((c) => c.timestamp === lockedTimestamp);
    if (idx === -1) return null;
    const candle = visibleCandles[idx];
    return {
      idx,
      candle,
      x: (idx + 0.5) * slotWidth + fractionalOffsetX,
      y: getY(candle.close, displayPriceRange.min, displayPriceRange.max, mainChartHeight),
    };
  }, [lockedTimestamp, visibleCandles, slotWidth, fractionalOffsetX, displayPriceRange.min, displayPriceRange.max, mainChartHeight]);

  const crosshairX = crosshairInfo?.x ?? null;
  const crosshairY = crosshairInfo?.y ?? null;
  const crosshairCandle = crosshairInfo?.candle ?? null;
  const crosshairCandleIdx = crosshairInfo?.idx ?? -1;

  useEffect(() => {
    onCrosshairChange?.(crosshairCandle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crosshairCandle?.timestamp]);

  // ── Gesture plumbing ─────────────────────────────────────────────────────
  // Refs so the pointer/wheel handlers (attached once) always read fresh
  // render-scoped values without needing to be re-attached every render.
  const geometryRef = useRef({ chartWidth, padding, dataLength: sortedData.length, maxZoom, showOhlcHud });
  geometryRef.current = { chartWidth, padding, dataLength: sortedData.length, maxZoom, showOhlcHud };

  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  const rsiCanvasRef = useRef<HTMLCanvasElement>(null);
  const macdCanvasRef = useRef<HTMLCanvasElement>(null);
  const volumeCanvasRef = useRef<HTMLCanvasElement>(null);
  // Dynamic list (unlike the fixed RSI/MACD/Volume refs above) — one canvas per custom panel,
  // keyed by panel id via a callback ref, since the panel count/identity varies per caller.
  const customPanelCanvasRefs = useRef(new Map<string, HTMLCanvasElement | null>());

  const panStartViewportRef = useRef<Viewport>(viewport);
  const pinchStartViewportRef = useRef<Viewport>(viewport);
  const pinchInitialDistanceRef = useRef(0);
  const dragStartClientXRef = useRef(0);
  const isDraggingRef = useRef(false);
  const isPinchingRef = useRef(false);
  const activePointersRef = useRef(new Map<number, { x: number; y: number }>());

  const lockCrosshairAtTouchX = (localX: number) => {
    const vc = visibleCandlesRef.current;
    if (!vc.length) return;
    const xInChart = localX - geometryRef.current.padding.left - fractionalOffsetXRef.current;
    const idx = clamp(Math.floor(xInChart / slotWidthRef.current), 0, vc.length - 1);
    setLockedTimestamp(vc[idx]?.timestamp ?? null);
  };

  const releaseInspection = () => setLockedTimestamp(null);

  // Hover-to-inspect a marker — independent of showOhlcHud, since the
  // marker tooltip is useful even when the OHLC HUD/crosshair aren't enabled.
  const hitTestMarker = (localX: number, localY: number) => {
    const xInChart = localX - geometryRef.current.padding.left - fractionalOffsetXRef.current;
    const yInChart = localY - geometryRef.current.padding.top;
    setHoveredMarker(findMarkerAt(markerPointsRef.current, xInChart, yInChart));
  };

  const releaseMarkerTooltip = () => setHoveredMarker(null);

  const updateViewportFromPan = (translationX: number) => {
    const startViewport = panStartViewportRef.current;
    const { chartWidth: cw, dataLength } = geometryRef.current;
    const range = startViewport.end - startViewport.start;
    const candlesPerPixel = range / cw;
    const deltaCandles = translationX * candlesPerPixel;

    const next = clampViewport(
      { start: startViewport.start - deltaCandles, end: startViewport.end - deltaCandles },
      dataLength,
      MIN_VISIBLE_CANDLES,
    );

    setIsFollowingLive(next.end >= dataLength - 0.01);
    setViewport(next);
  };

  const updateViewportFromPinch = (scale: number, focalX: number) => {
    if (!Number.isFinite(scale) || scale <= 0) return;
    const { chartWidth: cw, padding: pad, dataLength, maxZoom: mz } = geometryRef.current;
    const startViewport = pinchStartViewportRef.current;
    const oldRange = startViewport.end - startViewport.start;

    const focalRatio = clamp((focalX - pad.left) / cw, 0, 1);
    const focalIndex = startViewport.start + oldRange * focalRatio;
    const maxVisible = Math.min(mz ?? maxLegibleVisibleCandles(cw, MIN_VISIBLE_CANDLES), dataLength);
    const resistedRange = applyZoomOutResistance(oldRange / scale, maxVisible);
    const nextRange = clamp(resistedRange, MIN_VISIBLE_CANDLES, Math.min(softZoomOutCeiling(maxVisible), dataLength));

    const next = clampViewport(
      { start: focalIndex - nextRange * focalRatio, end: focalIndex + nextRange * (1 - focalRatio) },
      dataLength,
      MIN_VISIBLE_CANDLES,
    );

    setIsFollowingLive(next.end >= dataLength - 0.01);
    setViewport(next);
  };

  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;

    const localXOf = (clientX: number) => clientX - canvas.getBoundingClientRect().left;
    const localYOf = (clientY: number) => clientY - canvas.getBoundingClientRect().top;

    const onPointerDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (activePointersRef.current.size >= 2) {
        isDraggingRef.current = false;
        isPinchingRef.current = true;
        pinchStartViewportRef.current = viewportRef.current;
        const [a, b] = Array.from(activePointersRef.current.values());
        pinchInitialDistanceRef.current = Math.hypot(a.x - b.x, a.y - b.y);
        return;
      }

      isDraggingRef.current = true;
      panStartViewportRef.current = viewportRef.current;
      dragStartClientXRef.current = e.clientX;

      if (geometryRef.current.showOhlcHud) {
        lockCrosshairAtTouchX(localXOf(e.clientX));
      }
      hitTestMarker(localXOf(e.clientX), localYOf(e.clientY));
    };

    const onPointerMove = (e: PointerEvent) => {
      if (isPinchingRef.current) {
        activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const pts = Array.from(activePointersRef.current.values());
        if (pts.length >= 2) {
          const [a, b] = pts;
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          const focalXLocal = localXOf((a.x + b.x) / 2);
          const scale = pinchInitialDistanceRef.current > 0 ? dist / pinchInitialDistanceRef.current : 1;
          updateViewportFromPinch(scale, focalXLocal);
        }
        return;
      }

      if (isDraggingRef.current) {
        activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        updateViewportFromPan(e.clientX - dragStartClientXRef.current);
        if (geometryRef.current.showOhlcHud) lockCrosshairAtTouchX(localXOf(e.clientX));
        hitTestMarker(localXOf(e.clientX), localYOf(e.clientY));
        return;
      }

      if (e.pointerType === 'mouse' && e.buttons === 0) {
        if (geometryRef.current.showOhlcHud) lockCrosshairAtTouchX(localXOf(e.clientX));
        hitTestMarker(localXOf(e.clientX), localYOf(e.clientY));
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
      activePointersRef.current.delete(e.pointerId);

      if (isPinchingRef.current) {
        const remaining = Array.from(activePointersRef.current.values());
        if (remaining.length === 1) {
          isPinchingRef.current = false;
          isDraggingRef.current = true;
          panStartViewportRef.current = viewportRef.current;
          dragStartClientXRef.current = remaining[0].x;
        } else if (remaining.length === 0) {
          isPinchingRef.current = false;
        }
        return;
      }

      if (activePointersRef.current.size === 0) {
        isDraggingRef.current = false;
        if (e.pointerType !== 'mouse') {
          releaseInspection();
          releaseMarkerTooltip();
        }
      }
    };

    const onPointerLeave = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' && !isDraggingRef.current && !isPinchingRef.current) {
        releaseInspection();
        releaseMarkerTooltip();
      }
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      pinchStartViewportRef.current = viewportRef.current;
      const scale = Math.exp(-e.deltaY * 0.001);
      updateViewportFromPinch(scale, localXOf(e.clientX));
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerLeave);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      canvas.removeEventListener('wheel', onWheel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rsiAtCrosshair =
    showRsiPanel && crosshairCandle ? findIndicatorValue(visibleRsi, crosshairCandle.timestamp) : null;

  const customPanelValuesAtCrosshair = useMemo(() => {
    if (!crosshairCandle) return [];
    return preparedCustomPanels.flatMap(({ panel, series }) =>
      series.flatMap(({ line, data }) => {
        const value = findIndicatorValue(data, crosshairCandle.timestamp);
        return value === null ? [] : [{ id: `${panel.id}-${line.id}`, label: line.name ?? line.id, color: line.color, value }];
      }),
    );
  }, [preparedCustomPanels, crosshairCandle]);

  // ── Draw ──────────────────────────────────────────────────────────────────
  useLayoutEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || !visibleCandles.length) return;

    const ctx = getScaledContext(canvas, width, mainCanvasHeight);
    if (!ctx) return;

    drawAxis(ctx, {
      sortedData, viewportStart: viewport.start, viewportEnd: viewport.end, intervalMs,
      width, height: mainCanvasHeight, priceMin: displayPriceRange.min, priceMax: displayPriceRange.max,
      padding, colors, hour12, showGrid,
    });

    ctx.save();
    ctx.beginPath();
    ctx.rect(padding.left, padding.top, chartWidth, mainChartHeight);
    ctx.clip();

    ctx.save();
    ctx.translate(padding.left + fractionalOffsetX, padding.top);

    if (chartType === 'candle') {
      const bars = buildCandleGeometry(
        visibleCandles, virtualWidth, mainChartHeight,
        displayPriceRange.min, displayPriceRange.max, colors.candleUp, colors.candleDown,
      );
      drawCandles(ctx, bars);
    } else {
      const pts = buildLinePoints(visibleCandles, virtualWidth, mainChartHeight, displayPriceRange.min, displayPriceRange.max);
      drawLineSeries(ctx, pts, colors.lineChart);
    }

    for (const { line, data: lineData } of preparedIndicators) {
      if (visibleCandles.length < 2 || lineData.length === 0) continue;
      const pts = buildSeriesPoints(lineData, indexByTimestamp, visibleCandles.length, virtualWidth, mainChartHeight, displayPriceRange.min, displayPriceRange.max);
      drawLineSeries(ctx, pts, line.color);
    }

    for (const { area, fromData, toData } of preparedShaded) {
      if (visibleCandles.length < 2) continue;
      const { top, bottom } = buildShadedAreaPoints(fromData, toData, indexByTimestamp, visibleCandles.length, virtualWidth, mainChartHeight, displayPriceRange.min, displayPriceRange.max);
      drawShadedArea(ctx, top, bottom, area.color || '#888', area.opacity ?? 0.3);
    }

    if (visibleMarkers.length > 0) {
      drawMarkers(ctx, {
        markers: visibleMarkers, candleData: visibleCandles, width: virtualWidth, height: mainChartHeight,
        priceMin: displayPriceRange.min, priceMax: displayPriceRange.max, colors,
      });
    }

    ctx.restore();

    if (crosshairCandle !== null && crosshairX !== null && crosshairY !== null) {
      ctx.save();
      ctx.translate(padding.left, padding.top);

      drawCrosshairLines(ctx, { x: crosshairX, y: crosshairY, width: chartWidth, height: mainChartHeight, color: colors.crosshair });

      if (chartType === 'line') {
        drawCrosshairDot(ctx, { x: crosshairX, y: crosshairY }, colors.lineChart, 2);
      }

      for (const { line } of preparedIndicators) {
        const val = findIndicatorValue(line.data, crosshairCandle.timestamp);
        if (val === null) continue;
        const dotX = fractionalOffsetX + getSeriesX(crosshairCandleIdx, visibleCandles.length, virtualWidth);
        const dotY = getY(val, displayPriceRange.min, displayPriceRange.max, mainChartHeight);
        drawCrosshairDot(ctx, { x: dotX, y: dotY }, line.color, 3);
      }

      ctx.restore();
    }

    ctx.restore();
  });

  useLayoutEffect(() => {
    const canvas = volumeCanvasRef.current;
    if (!showVolumePanel || !canvas || !visibleCandles.length) return;
    const ctx = getScaledContext(canvas, width, volumePanelHeight);
    if (!ctx) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(padding.left, 0, chartWidth, volumePanelHeight);
    ctx.clip();

    ctx.save();
    ctx.translate(padding.left + fractionalOffsetX, 0);
    ctx.strokeStyle = colors.crosshair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(chartWidth, 0);
    ctx.stroke();
    drawVolumePanel(ctx, { candleData: visibleCandles, width: virtualWidth, height: volumePanelHeight, colors });
    ctx.restore();

    if (crosshairCandle !== null && crosshairX !== null) {
      ctx.save();
      ctx.translate(padding.left + crosshairX, 0);
      ctx.strokeStyle = colors.crosshair;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, volumePanelHeight);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  });

  useLayoutEffect(() => {
    const canvas = rsiCanvasRef.current;
    if (!showRsiPanel || !canvas || !visibleCandles.length) return;
    const ctx = getScaledContext(canvas, width, rsiPanelHeight);
    if (!ctx) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(padding.left, 0, chartWidth, rsiPanelHeight);
    ctx.clip();

    ctx.save();
    ctx.translate(padding.left + fractionalOffsetX, 0);
    ctx.strokeStyle = colors.crosshair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(chartWidth, 0);
    ctx.stroke();
    drawRsiPanel(ctx, { data: visibleRsi, candleData: visibleCandles, width: virtualWidth, height: rsiPanelHeight, colors });
    ctx.restore();

    if (crosshairCandle !== null && crosshairX !== null) {
      ctx.save();
      ctx.translate(padding.left + crosshairX, 0);
      ctx.strokeStyle = colors.crosshair;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, rsiPanelHeight);
      ctx.stroke();
      if (rsiAtCrosshair != null) {
        drawCrosshairDot(ctx, { x: 0, y: getY(rsiAtCrosshair, 0, 100, rsiPanelHeight) }, colors.rsiLine, 2);
      }
      ctx.restore();
    }

    ctx.restore();
  });

  useLayoutEffect(() => {
    const canvas = macdCanvasRef.current;
    if (!showMacdPanel || !visibleMacd || !canvas || !visibleCandles.length) return;
    const ctx = getScaledContext(canvas, width, macdPanelHeight);
    if (!ctx) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(padding.left, 0, chartWidth, macdPanelHeight);
    ctx.clip();

    ctx.save();
    ctx.translate(padding.left + fractionalOffsetX, 0);
    ctx.strokeStyle = colors.crosshair;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(chartWidth, 0);
    ctx.stroke();
    drawMacdPanel(ctx, {
      macd: visibleMacd.macd, signal: visibleMacd.signal, histogram: visibleMacd.histogram,
      candleData: visibleCandles, width: virtualWidth, height: macdPanelHeight, colors,
    });
    ctx.restore();

    if (crosshairCandle !== null && crosshairX !== null) {
      ctx.save();
      ctx.translate(padding.left + crosshairX, 0);
      ctx.strokeStyle = colors.crosshair;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, macdPanelHeight);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  });

  useLayoutEffect(() => {
    if (!visibleCandles.length) return;
    for (const { panel, series, yMin, yMax } of preparedCustomPanels) {
      const canvas = customPanelCanvasRefs.current.get(panel.id);
      if (!canvas) continue;
      const ctx = getScaledContext(canvas, width, customPanelHeight);
      if (!ctx) continue;

      ctx.save();
      ctx.beginPath();
      ctx.rect(padding.left, 0, chartWidth, customPanelHeight);
      ctx.clip();

      ctx.save();
      ctx.translate(padding.left + fractionalOffsetX, 0);
      ctx.strokeStyle = colors.crosshair;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(chartWidth, 0);
      ctx.stroke();
      drawCustomPanel(ctx, {
        series: series.map((s) => ({ color: s.line.color, data: s.data })),
        candleData: visibleCandles,
        width: virtualWidth,
        height: customPanelHeight,
        yMin,
        yMax,
        referenceLines: panel.referenceLines,
        colors,
      });
      ctx.restore();

      if (crosshairCandle !== null && crosshairX !== null) {
        ctx.save();
        ctx.translate(padding.left + crosshairX, 0);
        ctx.strokeStyle = colors.crosshair;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, customPanelHeight);
        ctx.stroke();
        for (const { line, data } of series) {
          const val = findIndicatorValue(data, crosshairCandle.timestamp);
          if (val === null) continue;
          drawCrosshairDot(ctx, { x: 0, y: getY(val, yMin, yMax, customPanelHeight) }, line.color, 2);
        }
        ctx.restore();
      }

      ctx.restore();
    }
  });

  if (!visibleCandles.length) {
    return (
      <div style={{ width, height, backgroundColor: colors.background, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: colors.priceLabel }}>No data</span>
      </div>
    );
  }

  return (
    <div style={{ width, height, backgroundColor: colors.background, position: 'relative' }}>
      {showOhlcHud && (
        <OhlcHud
          candle={crosshairCandle ?? visibleCandles[visibleCandles.length - 1]}
          isLive={crosshairCandle === null}
          theme={theme}
          indicators={indicators}
          rsiValue={rsiAtCrosshair}
          customPanelValues={customPanelValuesAtCrosshair}
        />
      )}

      {hoveredMarker && (
        <MarkerTooltip
          point={hoveredMarker}
          x={hoveredMarker.x + fractionalOffsetX}
          y={hoveredMarker.y}
          padding={padding}
          containerWidth={width}
          containerHeight={height}
          theme={theme}
        />
      )}

      <div style={{ width, height: mainCanvasHeight, position: 'relative', overflow: 'hidden' }}>
        <canvas
          ref={mainCanvasRef}
          style={{ width, height: mainCanvasHeight, display: 'block', touchAction: 'none' }}
        />
      </div>

      {showVolumePanel && (
        <div style={{ width, height: panelGap + volumePanelHeight }}>
          <div style={{ height: panelGap }} />
          <canvas ref={volumeCanvasRef} style={{ width, height: volumePanelHeight, display: 'block' }} />
        </div>
      )}

      {showRsiPanel && (
        <div style={{ width, height: panelGap + rsiPanelHeight }}>
          <div style={{ height: panelGap }} />
          <canvas ref={rsiCanvasRef} style={{ width, height: rsiPanelHeight, display: 'block' }} />
        </div>
      )}

      {showMacdPanel && visibleMacd && (
        <div style={{ width, height: panelGap + macdPanelHeight }}>
          <div style={{ height: panelGap }} />
          <canvas ref={macdCanvasRef} style={{ width, height: macdPanelHeight, display: 'block' }} />
        </div>
      )}

      {preparedCustomPanels.map(({ panel }) => (
        <div key={panel.id} style={{ width, height: panelGap + customPanelHeight }}>
          <div style={{ height: panelGap }} />
          <canvas
            ref={(el) => {
              customPanelCanvasRefs.current.set(panel.id, el);
            }}
            style={{ width, height: customPanelHeight, display: 'block' }}
          />
        </div>
      ))}
    </div>
  );
};

export default SLChart;
