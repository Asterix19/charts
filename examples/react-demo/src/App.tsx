import { SLChart } from '@stacklatte/chart-react';
import type { Candle, ChartType, ChartTheme } from '@stacklatte/chart-react';
import {
  LIVE_OPTIONS, PLAYGROUND_INITIAL_COUNT, PLAYGROUND_INTERVAL_MS, PLAYGROUND_WARMUP, ZOOM_OPTIONS,
  advanceLive, appendBulk, buildOverlays, liveLabel, playgroundCandles,
} from '@stacklatte/chart-examples';
import type { LiveMs } from '@stacklatte/chart-examples';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import './App.css';

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

  const [allData, setAllData] = useState<Candle[]>(() => playgroundCandles(PLAYGROUND_INITIAL_COUNT));
  const data = useMemo(() => allData.slice(PLAYGROUND_WARMUP), [allData]);

  const [hoveredCandle, setHoveredCandle] = useState<Candle | null>(null);

  // Live feed
  useEffect(() => {
    if (liveMs === null) return;
    const id = setInterval(() => setAllData(advanceLive), liveMs);
    return () => clearInterval(id);
  }, [liveMs]);

  const addBulk = useCallback(() => {
    setAllData(appendBulk);
    setLatestToken(v => v + 1);
  }, []);

  const { indicators, shadedAreas } = useMemo(
    () => buildOverlays(allData, showSma, showEma, showBb),
    [allData, showSma, showEma, showBb],
  );

  const liveColor = liveMs === null ? '#5A5F7A' : liveMs === 100 ? '#E53935' : '#26A65B';

  const zoomPills = ZOOM_OPTIONS.map(z => (
    <Pill key={z} label={`${z}`} active={visibleDataPoints === z} onClick={() => setVisibleDataPoints(z)} />
  ));

  const livePills = LIVE_OPTIONS.map(v => (
    <Pill
      key={String(v)}
      label={liveLabel(v)}
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
            intervalMs={PLAYGROUND_INTERVAL_MS}
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
