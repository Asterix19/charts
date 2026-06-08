import { Canvas, Circle, DashPathEffect, Group, Line } from '@shopify/react-native-skia';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import {
  buildPaddedRange,
  calcMACD,
  calcRSI,
  clampViewport,
  computeLayout,
  findIndicatorById,
  findIndicatorValue,
  getSeriesX,
  getThemeColors,
  getY,
  normalizeCandles,
  prepareIndicatorData,
  resolveIntervalMs,
} from '../core';

import type { CandleViewport, ChartProps } from '../core';

import AxisLabelsWeb from './AxisLabelsWeb';
import AxisLayer from './AxisLayer';
import CandlestickLayer from './CandlestickLayer';
import CrosshairOverlayWeb from './CrosshairOverlayWeb';
import IndicatorLayer from './IndicatorLayer';
import LineLayer from './LineLayer';
import MacdLayer from './MacdLayer';
import OhlcHud from './OhlcHud';
import RsiLayer from './RsiLayer';
import ShadedAreaLayer from './ShadedAreaLayer';

type Viewport = CandleViewport;

const MIN_VISIBLE_CANDLES = 4;

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const SLChart: React.FC<ChartProps> = ({
  data,
  indicators,
  shadedAreas,
  width,
  height,
  intervalMs: intervalMsProp,
  visibleDataPoints: visibleDataPointsProp = 60,
  theme = 'dark',
  showOhlcHud = false,
  showRsiPanel = false,
  rsiPeriod = 14,
  showMacdPanel = false,
  showGrid = true,
  chartType = 'candle',
  scrollToLatestTrigger,
  onCrosshairChange,
  hour12 = false,
  maxZoom,
}) => {
  const isWeb = Platform.OS === 'web';
  const colors = getThemeColors(theme);

  const sortedData = useMemo(() => normalizeCandles(data), [data]);

  const intervalMs = useMemo(
    () => resolveIntervalMs(intervalMsProp, sortedData),
    [intervalMsProp, sortedData],
  );

  const {
    padding,
    chartWidth,
    panelGap,
    rsiPanelHeight,
    macdPanelHeight,
    mainChartHeight,
    mainCanvasHeight,
  } = computeLayout(width, height, showRsiPanel, showMacdPanel);

  const initialRange = Math.min(
    Math.max(MIN_VISIBLE_CANDLES, visibleDataPointsProp),
    maxZoom ?? sortedData.length,
    sortedData.length || visibleDataPointsProp,
  );

  const [viewport, setViewport] = useState<Viewport>(() => {
    const end = sortedData.length;
    const start = Math.max(0, end - initialRange);
    return { start, end };
  });

  const [isFollowingLive, setIsFollowingLive] = useState(true);

  const viewportRef = useRef(viewport);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  // Keep a ref to sortedData.length so the visibleDataPoints effect can read
  // the current length without it being a dependency (which would cause the
  // effect to fire on every data update, not just prop changes).
  const sortedDataLengthRef = useRef(sortedData.length);
  sortedDataLengthRef.current = sortedData.length;

  // When the caller changes visibleDataPoints, reset the viewport to that
  // range anchored at the latest data point and re-engage live-follow mode.
  useEffect(() => {
    const len = sortedDataLengthRef.current;
    const range = clamp(visibleDataPointsProp, MIN_VISIBLE_CANDLES, len || visibleDataPointsProp);
    setIsFollowingLive(true);
    setViewport(clampViewport(
      { start: len - range, end: len },
      len,
      MIN_VISIBLE_CANDLES,
    ));
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

  const visibleCandles = useMemo(() => {
    return sortedData.slice(visibleStartIndex, visibleEndIndex);
  }, [sortedData, visibleStartIndex, visibleEndIndex]);

  const slotWidth = useMemo(() => {
    const range = viewport.end - viewport.start;
    return range > 0 ? chartWidth / range : chartWidth;
  }, [chartWidth, viewport]);

  const virtualWidth = visibleCandles.length * slotWidth;

  const fractionalOffsetX = useMemo(() => {
    return -(viewport.start - visibleStartIndex) * slotWidth;
  }, [viewport.start, visibleStartIndex, slotWidth]);

  // RSI/MACD are computed only on the visible slice + their warm-up window.
  // This keeps computation proportional to the visible candle count (~60–100
  // candles) rather than the full dataset (potentially 10 K+), regardless of
  // how much historical data is loaded.
  const MACD_WARMUP = 35; // slowPeriod(26) + signalPeriod(9)

  const visibleRsi = useMemo(() => {
    if (!showRsiPanel) return [];
    const slice = sortedData.slice(
      Math.max(0, visibleStartIndex - rsiPeriod),
      visibleEndIndex,
    );
    return calcRSI(slice, rsiPeriod);
  }, [showRsiPanel, rsiPeriod, sortedData, visibleStartIndex, visibleEndIndex]);

  const visibleMacd = useMemo(() => {
    if (!showMacdPanel) return null;
    const slice = sortedData.slice(
      Math.max(0, visibleStartIndex - MACD_WARMUP),
      visibleEndIndex,
    );
    return calcMACD(slice);
  }, [showMacdPanel, sortedData, visibleStartIndex, visibleEndIndex]);

  const preparedIndicators = useMemo(() => {
    if (!indicators?.length || !visibleCandles.length) return [];

    const startTs = visibleCandles[0].timestamp - intervalMs;
    const endTs = visibleCandles[visibleCandles.length - 1].timestamp + intervalMs;

    return indicators.map((line) => ({
      line,
      data: prepareIndicatorData(line, startTs, endTs),
    }));
  }, [indicators, visibleCandles, intervalMs]);

  const preparedShaded = useMemo(() => {
    if (!shadedAreas?.length || !visibleCandles.length) return [];

    const startTs = visibleCandles[0].timestamp - intervalMs;
    const endTs = visibleCandles[visibleCandles.length - 1].timestamp + intervalMs;

    return shadedAreas.flatMap((area) => {
      const from = findIndicatorById(indicators, area.fromId);
      const to = findIndicatorById(indicators, area.toId);

      if (!from || !to) return [];

      return [
        {
          area,
          fromData: prepareIndicatorData(from, startTs, endTs),
          toData: prepareIndicatorData(to, startTs, endTs),
        },
      ];
    });
  }, [shadedAreas, indicators, visibleCandles, intervalMs]);

  const displayPriceRange = useMemo(() => {
    if (!visibleCandles.length) return { min: 0, max: 1 };

    const candleValues = visibleCandles.flatMap((c) => [c.high, c.low]);

    const indicatorValues = preparedIndicators.flatMap(({ data: lineData }) =>
      lineData
        .map((point: any) => point.value ?? point.y ?? point.close ?? null)
        .filter((value: any) => typeof value === 'number' && Number.isFinite(value)),
    );

    const values = [...candleValues, ...indicatorValues];

    return buildPaddedRange(Math.min(...values), Math.max(...values), 0.05);
  }, [visibleCandles, preparedIndicators]);

  // Only the locked timestamp lives in state. Everything else is derived during
  // render so crosshair position is always in sync with the current viewport —
  // no stale-state flicker when the viewport changes mid-gesture.
  const [lockedTimestamp, setLockedTimestamp] = useState<number | null>(null);

  // Refs so gesture callbacks (stale useMemo closures) can read current values.
  const slotWidthRef = useRef(slotWidth);
  slotWidthRef.current = slotWidth;
  const fractionalOffsetXRef = useRef(fractionalOffsetX);
  fractionalOffsetXRef.current = fractionalOffsetX;
  const visibleCandlesRef = useRef(visibleCandles);
  visibleCandlesRef.current = visibleCandles;

  // Derive crosshair geometry from the locked timestamp + current render values.
  const crosshairInfo = useMemo(() => {
    if (lockedTimestamp === null) return null;
    const idx = visibleCandles.findIndex(c => c.timestamp === lockedTimestamp);
    if (idx === -1) return null;
    const candle = visibleCandles[idx];
    return {
      idx,
      candle,
      x: (idx + 0.5) * slotWidth + fractionalOffsetX,
      y: getY(candle.close, displayPriceRange.min, displayPriceRange.max, mainChartHeight),
    };
  }, [lockedTimestamp, visibleCandles, slotWidth, fractionalOffsetX,
      displayPriceRange.min, displayPriceRange.max, mainChartHeight]);

  const crosshairX      = crosshairInfo?.x      ?? null;
  const crosshairY      = crosshairInfo?.y      ?? null;
  const crosshairCandle = crosshairInfo?.candle ?? null;
  const crosshairCandleIdx = crosshairInfo?.idx ?? -1;

  // Notify parent when the inspected candle changes.
  useEffect(() => {
    onCrosshairChange?.(crosshairCandle);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crosshairCandle?.timestamp]);

  const lockCrosshairAtTouchX = (viewX: number) => {
    const vc = visibleCandlesRef.current;
    if (!vc.length) return;

    // Convert screen x → virtual slot index.
    const xInChart = viewX - padding.left - fractionalOffsetXRef.current;
    const idx = clamp(
      Math.floor(xInChart / slotWidthRef.current),
      0,
      vc.length - 1,
    );
    setLockedTimestamp(vc[idx]?.timestamp ?? null);
  };

  const releaseInspection = () => {
    setLockedTimestamp(null);
  };

  const panStartViewportRef = useRef<Viewport>(viewport);
  const pinchStartViewportRef = useRef<Viewport>(viewport);

  const updateViewportFromPan = (translationX: number) => {
    const startViewport = panStartViewportRef.current;

    const range = startViewport.end - startViewport.start;
    const candlesPerPixel = range / chartWidth;
    const deltaCandles = translationX * candlesPerPixel;

    const next = clampViewport(
      {
        start: startViewport.start - deltaCandles,
        end: startViewport.end - deltaCandles,
      },
      sortedData.length,
      MIN_VISIBLE_CANDLES,
    );

    setIsFollowingLive(next.end >= sortedData.length - 0.01);
    setViewport(next);
  };

  const updateViewportFromPinch = (scale: number, focalX: number) => {
    if (!Number.isFinite(scale) || scale <= 0) return;

    const startViewport = pinchStartViewportRef.current;
    const oldRange = startViewport.end - startViewport.start;

    const focalRatio = clamp((focalX - padding.left) / chartWidth, 0, 1);
    const focalIndex = startViewport.start + oldRange * focalRatio;

    const maxVisible = Math.min(maxZoom ?? sortedData.length, sortedData.length);

    const nextRange = clamp(
      oldRange / scale,
      MIN_VISIBLE_CANDLES,
      maxVisible,
    );

    const next = clampViewport(
      {
        start: focalIndex - nextRange * focalRatio,
        end: focalIndex + nextRange * (1 - focalRatio),
      },
      sortedData.length,
      MIN_VISIBLE_CANDLES,
    );

    setIsFollowingLive(next.end >= sortedData.length - 0.01);
    setViewport(next);
  };

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .minPointers(1)
        .maxPointers(1)
        .onBegin((event) => {
          panStartViewportRef.current = viewportRef.current;

          if (showOhlcHud) {
            lockCrosshairAtTouchX(event.x);
          }
        })
        .onUpdate((event) => {
          updateViewportFromPan(event.translationX);
        })
        .onFinalize(() => {
          releaseInspection();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [showOhlcHud, chartWidth, sortedData.length, padding.left],
  );

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .runOnJS(true)
        .onBegin(() => {
          pinchStartViewportRef.current = viewportRef.current;
          releaseInspection();
        })
        .onUpdate((event) => {
          updateViewportFromPinch(event.scale, event.focalX);
        })
        .onFinalize(() => {
          releaseInspection();
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chartWidth, sortedData.length, padding.left, maxZoom],
  );

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, panGesture),
    [pinchGesture, panGesture],
  );

  if (!visibleCandles.length) {
    return (
      <View
        style={{
          width,
          height,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ color: colors.priceLabel }}>No data</Text>
      </View>
    );
  }

  const plotClip = {
    x: padding.left,
    y: padding.top,
    width: chartWidth,
    height: mainChartHeight,
  };

  const rsiAtCrosshair =
    showRsiPanel && crosshairCandle
      ? findIndicatorValue(visibleRsi, crosshairCandle.timestamp)
      : null;

  const contentTransform = [
    { translateX: padding.left + fractionalOffsetX },
    { translateY: padding.top },
  ];

  return (
    <GestureDetector gesture={composedGesture}>
      <View
        style={{
          width,
          height,
          backgroundColor: colors.background,
          flexDirection: 'column',
          position: 'relative',
        }}
      >
        {showOhlcHud && (
          <OhlcHud
            candle={crosshairCandle ?? visibleCandles[visibleCandles.length - 1]}
            isLive={crosshairCandle === null}
            theme={theme}
            indicators={indicators}
            rsiValue={rsiAtCrosshair}
          />
        )}

        <View
          style={{
            width,
            height: mainCanvasHeight,
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <Canvas style={{ width, height: mainCanvasHeight }}>
            <AxisLayer
              sortedData={sortedData}
              viewportStart={viewport.start}
              viewportEnd={viewport.end}
              intervalMs={intervalMs}
              width={width}
              height={mainCanvasHeight}
              priceMin={displayPriceRange.min}
              priceMax={displayPriceRange.max}
              padding={padding}
              theme={theme}
              hour12={hour12}
              showGrid={showGrid}
            />

            <Group clip={plotClip}>
              <Group transform={contentTransform}>
                {chartType === 'candle' ? (
                  <CandlestickLayer
                    data={visibleCandles}
                    width={virtualWidth}
                    height={mainChartHeight}
                    priceMin={displayPriceRange.min}
                    priceMax={displayPriceRange.max}
                    colorUp={colors.candleUp}
                    colorDown={colors.candleDown}
                  />
                ) : (
                  <LineLayer
                    data={visibleCandles}
                    width={virtualWidth}
                    height={mainChartHeight}
                    priceMin={displayPriceRange.min}
                    priceMax={displayPriceRange.max}
                    color={colors.lineChart}
                  />
                )}

                {preparedIndicators.map(({ line, data: lineData }, idx) => (
                  <IndicatorLayer
                    key={line.id ?? String(idx)}
                    data={lineData}
                    candleData={visibleCandles}
                    width={virtualWidth}
                    height={mainChartHeight}
                    color={line.color}
                    yMin={displayPriceRange.min}
                    yMax={displayPriceRange.max}
                  />
                ))}

                {preparedShaded.map(({ area, fromData, toData }, idx) => (
                  <ShadedAreaLayer
                    key={String(idx)}
                    from={fromData}
                    to={toData}
                    candleData={visibleCandles}
                    width={virtualWidth}
                    height={mainChartHeight}
                    color={area.color || '#888'}
                    opacity={area.opacity || 0.3}
                    yMin={displayPriceRange.min}
                    yMax={displayPriceRange.max}
                  />
                ))}
              </Group>

              {crosshairCandle !== null &&
                crosshairX !== null &&
                crosshairY !== null &&
                !isWeb && (
                  <>
                    <Group transform={[{ translateX: padding.left }]}>
                      <Line
                        p1={{ x: 0, y: padding.top + crosshairY }}
                        p2={{ x: chartWidth, y: padding.top + crosshairY }}
                        color={colors.crosshair}
                        strokeWidth={1}
                      >
                        <DashPathEffect intervals={[4, 4]} />
                      </Line>
                    </Group>

                    <Group transform={[{ translateX: padding.left + crosshairX }]}>
                      <Line
                        p1={{ x: 0, y: padding.top }}
                        p2={{ x: 0, y: padding.top + mainChartHeight }}
                        color={colors.crosshair}
                        strokeWidth={1}
                      >
                        <DashPathEffect intervals={[4, 4]} />
                      </Line>

                      {chartType === 'line' && (
                        <Circle
                          cx={0}
                          cy={padding.top + crosshairY}
                          r={2}
                          color={colors.lineChart}
                        />
                      )}
                    </Group>

                    {/* Indicator dots — positioned at the exact x where each line
                        is drawn (getSeriesX, edge-based), not at the candle centre. */}
                    {crosshairCandleIdx >= 0 && preparedIndicators.map(({ line }) => {
                      const val = findIndicatorValue(line.data, crosshairCandle.timestamp);
                      if (val === null) return null;

                      const dotX =
                        padding.left +
                        fractionalOffsetX +
                        getSeriesX(crosshairCandleIdx, visibleCandles.length, virtualWidth);

                      const cy =
                        padding.top +
                        getY(val, displayPriceRange.min, displayPriceRange.max, mainChartHeight);

                      return (
                        <Circle
                          key={line.id}
                          cx={dotX}
                          cy={cy}
                          r={3}
                          color={line.color}
                        />
                      );
                    })}
                  </>
                )}
            </Group>
          </Canvas>

          {isWeb && (
            <CrosshairOverlayWeb
              x={crosshairX}
              y={crosshairY}
              chartWidth={chartWidth}
              mainChartHeight={mainChartHeight}
              padding={padding}
              color={colors.crosshair}
            />
          )}

          {isWeb && (
            <AxisLabelsWeb
              sortedData={sortedData}
              viewportStart={viewport.start}
              viewportEnd={viewport.end}
              intervalMs={intervalMs}
              width={width}
              canvasHeight={mainCanvasHeight}
              priceMin={displayPriceRange.min}
              priceMax={displayPriceRange.max}
              padding={padding}
              theme={theme}
              hour12={hour12}
            />
          )}
        </View>

        {showRsiPanel && (
          <View style={{ width, height: panelGap + rsiPanelHeight }}>
            <View style={{ height: panelGap }} />

            <Canvas style={{ width, height: rsiPanelHeight }}>
              <Group clip={{ x: padding.left, y: 0, width: chartWidth, height: rsiPanelHeight }}>
                <Group transform={[{ translateX: padding.left + fractionalOffsetX }]}>
                  <Line
                    p1={{ x: 0, y: 0 }}
                    p2={{ x: chartWidth, y: 0 }}
                    color={colors.crosshair}
                    strokeWidth={1}
                  />

                  <RsiLayer
                    data={visibleRsi}
                    candleData={visibleCandles}
                    width={virtualWidth}
                    height={rsiPanelHeight}
                    theme={theme}
                  />
                </Group>

                {crosshairCandle !== null && crosshairX !== null && (
                  <Group transform={[{ translateX: padding.left + crosshairX }]}>
                    <Line
                      p1={{ x: 0, y: 0 }}
                      p2={{ x: 0, y: rsiPanelHeight }}
                      color={colors.crosshair}
                      strokeWidth={1}
                    />

                    {rsiAtCrosshair != null && (
                      <Circle
                        cx={0}
                        cy={getY(rsiAtCrosshair, 0, 100, rsiPanelHeight)}
                        r={2}
                        color={colors.rsiLine}
                      />
                    )}
                  </Group>
                )}
              </Group>
            </Canvas>
          </View>
        )}

        {showMacdPanel && visibleMacd && (
          <View style={{ width, height: panelGap + macdPanelHeight }}>
            <View style={{ height: panelGap }} />

            <Canvas style={{ width, height: macdPanelHeight }}>
              <Group clip={{ x: padding.left, y: 0, width: chartWidth, height: macdPanelHeight }}>
                <Group transform={[{ translateX: padding.left + fractionalOffsetX }]}>
                  <Line
                    p1={{ x: 0, y: 0 }}
                    p2={{ x: chartWidth, y: 0 }}
                    color={colors.crosshair}
                    strokeWidth={1}
                  />

                  <MacdLayer
                    macd={visibleMacd.macd}
                    signal={visibleMacd.signal}
                    histogram={visibleMacd.histogram}
                    candleData={visibleCandles}
                    width={virtualWidth}
                    height={macdPanelHeight}
                    theme={theme}
                  />
                </Group>

                {crosshairCandle !== null && crosshairX !== null && (
                  <Group transform={[{ translateX: padding.left + crosshairX }]}>
                    <Line
                      p1={{ x: 0, y: 0 }}
                      p2={{ x: 0, y: macdPanelHeight }}
                      color={colors.crosshair}
                      strokeWidth={1}
                    />
                  </Group>
                )}
              </Group>
            </Canvas>
          </View>
        )}
      </View>
    </GestureDetector>
  );
};

export default SLChart;