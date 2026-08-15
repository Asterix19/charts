import {
  SLChart,
  calcSMA,
  calcEMA,
  calcBollingerBands,
} from '@stacklatte/chart-web';
import type {
  Candle,
  ChartType,
  ChartTheme,
  IndicatorLine,
  ShadedArea,
} from '@stacklatte/chart-web';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import './App.css';

// ─── Constants ──────────────────────────────────────────────────────────────

const INTERVAL_MS = 60_000;
const DISPLAY_COUNT = 300;
const WARMUP = 60;
const INITIAL_COUNT = DISPLAY_COUNT + WARMUP;
const MAX_ALL_DATA = WARMUP + 10_000;

// ─── Data helpers ───────────────────────────────────────────────────────────

function currentBucket(): number {
  return Math.floor(Date.now() / INTERVAL_MS) * INTERVAL_MS;
}

function randomVolume(): number {
  return Math.round(50 + Math.random() * 450);
}

function generateCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 67_000;
  const bucket = currentBucket();
  const startTime = bucket - (count - 1) * INTERVAL_MS;
  for (let i = 0; i < count; i++) {
    const timestamp = startTime + i * INTERVAL_MS;
    const change = price * 0.003 * (Math.random() - 0.48);
    const open = price;
    const close = Math.max(1, price + change);
    const range = Math.abs(close - open);
    const high = Math.max(open, close) + range * (0.2 + Math.random() * 0.8);
    const low = Math.min(open, close) - range * (0.2 + Math.random() * 0.8);
    candles.push({ timestamp, open, high, low, close, volume: randomVolume() });
    price = close;
  }
  return candles;
}

function nextCandle(last: Candle, timestamp: number): Candle {
  const price = last.close;
  const change = price * 0.003 * (Math.random() - 0.48);
  const open = price;
  const close = Math.max(1, price + change);
  const range = Math.abs(close - open);
  return {
    timestamp,
    open,
    close,
    high: Math.max(open, close) + range * (0.2 + Math.random() * 0.8),
    low: Math.min(open, close) - range * (0.2 + Math.random() * 0.8),
    volume: randomVolume(),
  };
}

function tickCandle(last: Candle): Candle {
  const close = Math.max(1, last.close * (1 + 0.001 * (Math.random() - 0.48)));
  return {
    ...last,
    close,
    high: Math.max(last.high, close),
    low: Math.min(last.low, close),
    volume: (last.volume ?? 0) + Math.round(Math.random() * 8),
  };
}

function generateBulk(last: Candle, count: number): Candle[] {
  const out: Candle[] = [];
  let prev = last;
  for (let i = 0; i < count; i++) {
    const ts = prev.timestamp + INTERVAL_MS;
    prev = nextCandle(prev, ts);
    out.push(prev);
  }
  return out;
}

// ─── Live speed ─────────────────────────────────────────────────────────────

type LiveMs = 3000 | 1000 | 500 | 100 | null;

// ─── Indicator builder ──────────────────────────────────────────────────────

function buildOverlays(
  candles: Candle[],
  showSma: boolean,
  showEma: boolean,
  showBb: boolean,
): { indicators: IndicatorLine[]; shadedAreas: ShadedArea[] } {
  const indicators: IndicatorLine[] = [];
  const shadedAreas: ShadedArea[] = [];

  if (showSma) {
    const s = calcSMA(candles, 20, 'sma20', '#F5A623');
    if (s) indicators.push(s);
  }
  if (showEma) {
    const e = calcEMA(candles, 50, 'ema50', '#50E3C2');
    if (e) indicators.push(e);
  }
  if (showBb) {
    const bb = calcBollingerBands(candles, 20, 2, {
      upper: '#9B59B6',
      basis: '#7F8C8D',
      lower: '#9B59B6',
    });
    if (bb) {
      indicators.push(bb.upper, bb.basis, bb.lower);
      shadedAreas.push({ fromId: 'bb-upper', toId: 'bb-lower', color: '#9B59B6', opacity: 0.12 });
    }
  }

  return { indicators, shadedAreas };
}

// ─── Resize-aware container hook ───────────────────────────────────────────

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

// ─── Pill button ────────────────────────────────────────────────────────────

interface PillProps {
  label: string;
  active: boolean;
  onClick: () => void;
  activeColor?: string;
  activeBg?: string;
}

function Pill({ label, active, onClick, activeColor = '#FFFFFF', activeBg = '#2563EB' }: PillProps) {
  return (
    <button
      type="button"
      className="pill"
      onClick={onClick}
      style={active ? { color: activeColor, backgroundColor: activeBg } : undefined}
    >
      {label}
    </button>
  );
}

function Divider() {
  return <span className="divider" />;
}

// ─── Main app ───────────────────────────────────────────────────────────────

export default function App() {
  const [chartWrapRef, chartSize] = useElementSize<HTMLDivElement>();

  const [chartType, setChartType] = useState<ChartType>('candle');
  const [theme, setTheme] = useState<ChartTheme>('dark');
  const [visibleDataPoints, setVisibleDataPoints] = useState(60);
  const [hour12, setHour12] = useState(false);

  const [showSma, setShowSma] = useState(false);
  const [showEma, setShowEma] = useState(false);
  const [showBb, setShowBb] = useState(false);

  const [showRsi, setShowRsi] = useState(false);
  const [showMacd, setShowMacd] = useState(false);
  const [showVolume, setShowVolume] = useState(false);
  const [showHud, setShowHud] = useState(true);

  const [liveMs, setLiveMs] = useState<LiveMs>(3000);
  const [latestToken, setLatestToken] = useState(0);

  const [allData, setAllData] = useState<Candle[]>(() => generateCandles(INITIAL_COUNT));
  const data = useMemo(() => allData.slice(WARMUP), [allData]);

  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);

  // Live feed
  useEffect(() => {
    if (liveMs === null) return;
    const id = setInterval(() => {
      setAllData(prev => {
        const tail = prev[prev.length - 1];
        const bucket = currentBucket();
        if (tail.timestamp === bucket) {
          return [...prev.slice(0, -1), tickCandle(tail)];
        }
        return [...prev.slice(1), nextCandle(tail, bucket)];
      });
    }, liveMs);
    return () => clearInterval(id);
  }, [liveMs]);

  const addBulk = useCallback(() => {
    setAllData(prev => {
      const bulk = generateBulk(prev[prev.length - 1], 5000);
      const next = [...prev, ...bulk];
      return next.length > MAX_ALL_DATA ? next.slice(next.length - MAX_ALL_DATA) : next;
    });
    setLatestToken(v => v + 1);
  }, []);

  const { indicators, shadedAreas } = useMemo(
    () => buildOverlays(allData, showSma, showEma, showBb),
    [allData, showSma, showEma, showBb],
  );

  const liveColor = liveMs === null ? '#5A5F7A' : liveMs === 100 ? '#E53935' : '#26A65B';

  const zoomPills = [20, 40, 60, 120, 240].map(z => (
    <Pill key={z} label={`${z}`} active={visibleDataPoints === z} onClick={() => setVisibleDataPoints(z)} />
  ));

  const livePills = ([null, 3000, 1000, 500, 100] as LiveMs[]).map(v => (
    <Pill
      key={String(v)}
      label={v === null ? 'Off' : v === 3000 ? '3s' : v === 1000 ? '1s' : v === 500 ? '½s' : '⚡'}
      active={liveMs === v}
      onClick={() => setLiveMs(v)}
      activeColor={v === 100 ? '#E53935' : v === null ? '#5A5F7A' : '#26A65B'}
      activeBg={v === 100 ? '#3D1A1A' : v === null ? '#222436' : '#1A3D2B'}
    />
  ));

  return (
    <div className="screen">
      <div className="toolbar">
        <span className="toolLabel">Zoom</span>
        {zoomPills}
        <Divider />
        <Pill label="Candle" active={chartType === 'candle'} onClick={() => setChartType('candle')} />
        <Pill label="Line" active={chartType === 'line'} onClick={() => setChartType('line')} />
        <Divider />
        <Pill label="Dark" active={theme === 'dark'} onClick={() => setTheme('dark')} />
        <Pill label="Light" active={theme === 'light'} onClick={() => setTheme('light')} />
        <Divider />
        <span className="toolLabel">Overlay</span>
        <Pill label="SMA" active={showSma} onClick={() => setShowSma(v => !v)} activeColor="#F5A623" activeBg="#3A2A00" />
        <Pill label="EMA" active={showEma} onClick={() => setShowEma(v => !v)} activeColor="#50E3C2" activeBg="#0A2A26" />
        <Pill label="BB" active={showBb} onClick={() => setShowBb(v => !v)} activeColor="#C39BD3" activeBg="#2A1A3A" />
        <Divider />
        <span className="toolLabel">Panel</span>
        <Pill label="RSI" active={showRsi} onClick={() => setShowRsi(v => !v)} activeColor="#FFB84D" activeBg="#3A2400" />
        <Pill label="MACD" active={showMacd} onClick={() => setShowMacd(v => !v)} activeColor="#60A5FA" activeBg="#0A1A3A" />
        <Pill label="Volume" active={showVolume} onClick={() => setShowVolume(v => !v)} activeColor="#60A5FA" activeBg="#0A1A3A" />
        <Pill label="HUD" active={showHud} onClick={() => setShowHud(v => !v)} />
        <Divider />
        <Pill label="24h" active={!hour12} onClick={() => setHour12(false)} />
        <Pill label="12h" active={hour12} onClick={() => setHour12(true)} />
        <Divider />
        <span className="liveDot" style={{ backgroundColor: liveColor }} />
        {livePills}
        <Divider />
        <button type="button" className="actionBtn" onClick={() => setLatestToken(v => v + 1)}>
          ↵ Now
        </button>
        <button type="button" className="actionBtn actionBtnBlue" onClick={() => setVisibleDataPoints(60)}>
          ⊙ Reset
        </button>
        <button type="button" className="actionBtn actionBtnOrange" onClick={addBulk}>
          +5K
        </button>
      </div>

      <div className="chartWrap" ref={chartWrapRef}>
        {chartSize.width > 0 && chartSize.height > 0 && (
          <SLChart
            data={data}
            indicators={indicators}
            shadedAreas={shadedAreas}
            width={chartSize.width}
            height={chartSize.height}
            intervalMs={INTERVAL_MS}
            visibleDataPoints={visibleDataPoints}
            theme={theme}
            chartType={chartType}
            showRsiPanel={showRsi}
            showMacdPanel={showMacd}
            showVolumePanel={showVolume}
            showOhlcHud={showHud}
            scrollToLatestTrigger={latestToken}
            hour12={hour12}
            onCrosshairChange={setHoveredCandle}
          />
        )}
      </div>

      <div className="statusBar">
        {hoveredCandle ? (
          <span>
            {new Date(hoveredCandle.timestamp).toLocaleString()} · O {hoveredCandle.open.toFixed(2)} · H{' '}
            {hoveredCandle.high.toFixed(2)} · L {hoveredCandle.low.toFixed(2)} · C {hoveredCandle.close.toFixed(2)}
            {hoveredCandle.volume != null ? ` · V ${hoveredCandle.volume}` : ''}
          </span>
        ) : (
          <span>Hover the chart to inspect a candle · {data.length} candles loaded</span>
        )}
      </div>
    </div>
  );
}
