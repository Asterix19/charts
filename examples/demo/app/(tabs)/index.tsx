import { SLChart, calcSMA, calcEMA, calcBollingerBands, Candle, IndicatorLine, ShadedArea, ChartType, ChartTheme } from '@stacklatte/chart-core';
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ─── Constants ────────────────────────────────────────────────────────────────

const INTERVAL_MS   = 60_000;
const DISPLAY_COUNT = 300;
const WARMUP        = 60;
const INITIAL_COUNT = DISPLAY_COUNT + WARMUP;
const MAX_ALL_DATA  = WARMUP + 10_000;

// ─── Data helpers ─────────────────────────────────────────────────────────────

function currentBucket(): number {
  return Math.floor(Date.now() / INTERVAL_MS) * INTERVAL_MS;
}

function generateCandles(count: number): Candle[] {
  const candles: Candle[] = [];
  let price = 67_000;
  const bucket = currentBucket();
  const startTime = bucket - (count - 1) * INTERVAL_MS;
  for (let i = 0; i < count; i++) {
    const timestamp = startTime + i * INTERVAL_MS;
    const change = price * 0.003 * (Math.random() - 0.48);
    const open   = price;
    const close  = Math.max(1, price + change);
    const range  = Math.abs(close - open);
    const high   = Math.max(open, close) + range * (0.2 + Math.random() * 0.8);
    const low    = Math.min(open, close) - range * (0.2 + Math.random() * 0.8);
    candles.push({ timestamp, open, high, low, close });
    price = close;
  }
  return candles;
}

function nextCandle(last: Candle, timestamp: number): Candle {
  const price  = last.close;
  const change = price * 0.003 * (Math.random() - 0.48);
  const open   = price;
  const close  = Math.max(1, price + change);
  const range  = Math.abs(close - open);
  return {
    timestamp,
    open, close,
    high: Math.max(open, close) + range * (0.2 + Math.random() * 0.8),
    low:  Math.min(open, close) - range * (0.2 + Math.random() * 0.8),
  };
}

function tickCandle(last: Candle): Candle {
  const close = Math.max(1, last.close * (1 + 0.001 * (Math.random() - 0.48)));
  return {
    ...last,
    close,
    high: Math.max(last.high, close),
    low:  Math.min(last.low,  close),
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

// ─── Live speed ───────────────────────────────────────────────────────────────

type LiveMs = 3000 | 1000 | 500 | 100 | null;

// ─── Indicator builder ────────────────────────────────────────────────────────

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
      upper: '#9B59B6', basis: '#7F8C8D', lower: '#9B59B6',
    });
    if (bb) {
      indicators.push(bb.upper, bb.basis, bb.lower);
      shadedAreas.push({ fromId: 'bb-upper', toId: 'bb-lower', color: '#9B59B6', opacity: 0.12 });
    }
  }

  return { indicators, shadedAreas };
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:        '#0D0E14',
  surface:   '#13141C',
  border:    '#1E2130',
  accent:    '#2563EB',
  accentDim: '#1A3A6E',
  bull:      '#26A65B',
  bear:      '#E53935',
  text:      '#D4D8E8',
  textDim:   '#5A5F7A',
  textMuted: '#3A3F58',
};

// ─── Pill button ──────────────────────────────────────────────────────────────

interface PillProps {
  label: string;
  active: boolean;
  onPress: () => void;
  activeColor?: string;
  activeBg?: string;
}

function Pill({ label, active, onPress, activeColor = '#FFFFFF', activeBg = C.accent }: PillProps) {
  return (
    <TouchableOpacity
      style={[p.pill, active && { backgroundColor: activeBg }]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={[p.pillTxt, { color: active ? activeColor : C.textDim }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const p = StyleSheet.create({
  pill: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillTxt: { fontSize: 11, fontWeight: '600', letterSpacing: 0.2 },
});

// ─── Toolbar row ──────────────────────────────────────────────────────────────

function ToolRow({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.toolRow}>
      {children}
    </ScrollView>
  );
}

function Divider() {
  return <View style={s.divider} />;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ChartDemoScreen() {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;

  const [chartType, setChartType]     = useState<ChartType>('candle');
  const [theme, setTheme]             = useState<ChartTheme>('dark');
  const [visibleDataPoints, setVisibleCandles] = useState(60);
  const [chartLayout, setChartLayout] = useState({ width: 0, height: 0 });
  const [hour12, setHour12]           = useState(false);

  const [showSma, setShowSma] = useState(false);
  const [showEma, setShowEma] = useState(false);
  const [showBb,  setShowBb]  = useState(false);

  const [showRsi,  setShowRsi]  = useState(false);
  const [showMacd, setShowMacd] = useState(false);
  const [showHud,  setShowHud]  = useState(true);

  const [liveMs, setLiveMs] = useState<LiveMs>(3000);
  const [latestToken, setLatestToken] = useState(0);

  const [allData, setAllData] = useState<Candle[]>(() => generateCandles(INITIAL_COUNT));
  const data = useMemo(() => allData.slice(WARMUP), [allData]);

  // Live feed
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (liveMs === null) return;
    intervalRef.current = setInterval(() => {
      setAllData(prev => {
        const tail = prev[prev.length - 1];
        const bucket = currentBucket();
        if (tail.timestamp === bucket) {
          return [...prev.slice(0, -1), tickCandle(tail)];
        } else {
          return [...prev.slice(1), nextCandle(tail, bucket)];
        }
      });
    }, liveMs);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
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

  const liveColor = liveMs === null ? C.textDim : liveMs === 100 ? C.bear : C.bull;

  // Shared control groups — rendered in both portrait and landscape toolbars.
  const zoomPills = [20, 40, 60, 120, 240].map(z => (
    <Pill key={z} label={`${z}`} active={visibleDataPoints === z} onPress={() => setVisibleCandles(z)} />
  ));

  const livePills = ([null, 3000, 1000, 500, 100] as LiveMs[]).map(v => (
    <Pill
      key={String(v)}
      label={v === null ? 'Off' : v === 3000 ? '3s' : v === 1000 ? '1s' : v === 500 ? '½s' : '⚡'}
      active={liveMs === v}
      onPress={() => setLiveMs(v)}
      activeColor={v === 100 ? C.bear : v === null ? C.textDim : C.bull}
      activeBg={v === 100 ? '#3D1A1A' : v === null ? '#222436' : '#1A3D2B'}
    />
  ));

  const actionButtons = (
    <>
      <TouchableOpacity style={s.actionBtn} onPress={() => setLatestToken(v => v + 1)} activeOpacity={0.7}>
        <Text style={s.actionBtnTxt}>↵ Now</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.actionBtn, { borderColor: '#1A3A6E' }]} onPress={() => setVisibleCandles(60)} activeOpacity={0.7}>
        <Text style={[s.actionBtnTxt, { color: '#60A5FA' }]}>⊙ Reset</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[s.actionBtn, { borderColor: '#A0522D' }]} onPress={addBulk} activeOpacity={0.7}>
        <Text style={[s.actionBtnTxt, { color: '#CD853F' }]}>+5K</Text>
      </TouchableOpacity>
    </>
  );

  return (
    <View style={[s.screen, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>

      {isLandscape ? (
        /* ── Landscape: single compact scrollable row ─────────────────── */
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.toolbarLandscape}
          contentContainerStyle={s.toolRowLandscape}
        >
          <Text style={s.toolLabel}>Zoom</Text>
          {zoomPills}
          <Divider />
          <Pill label="Candle" active={chartType === 'candle'} onPress={() => setChartType('candle')} />
          <Pill label="Line"   active={chartType === 'line'}   onPress={() => setChartType('line')} />
          <Divider />
          <Pill label="Dark"  active={theme === 'dark'}  onPress={() => setTheme('dark')} />
          <Pill label="Light" active={theme === 'light'} onPress={() => setTheme('light')} />
          <Divider />
          <Pill label="SMA" active={showSma} onPress={() => setShowSma(v => !v)} activeColor="#F5A623" activeBg="#3A2A00" />
          <Pill label="EMA" active={showEma} onPress={() => setShowEma(v => !v)} activeColor="#50E3C2" activeBg="#0A2A26" />
          <Pill label="BB"  active={showBb}  onPress={() => setShowBb(v => !v)}  activeColor="#C39BD3" activeBg="#2A1A3A" />
          <Divider />
          <Pill label="RSI"  active={showRsi}  onPress={() => setShowRsi(v => !v)}  activeColor="#FFB84D" activeBg="#3A2400" />
          <Pill label="MACD" active={showMacd} onPress={() => setShowMacd(v => !v)} activeColor="#60A5FA" activeBg="#0A1A3A" />
          <Pill label="HUD"  active={showHud}  onPress={() => setShowHud(v => !v)} />
          <Divider />
          <Pill label="24h" active={!hour12} onPress={() => setHour12(false)} />
          <Pill label="12h" active={hour12}  onPress={() => setHour12(true)} />
          <Divider />
          <View style={[s.liveDot, { backgroundColor: liveColor }]} />
          {livePills}
          <Divider />
          {actionButtons}
        </ScrollView>
      ) : (
        /* ── Portrait: two toolbar rows + action bar ──────────────────── */
        <>
          <View style={s.toolbar}>
            <ToolRow>
              <Text style={s.toolLabel}>Zoom</Text>
              {zoomPills}
              <Divider />
              <Pill label="Candle" active={chartType === 'candle'} onPress={() => setChartType('candle')} />
              <Pill label="Line"   active={chartType === 'line'}   onPress={() => setChartType('line')} />
              <Divider />
              <Pill label="Dark"  active={theme === 'dark'}  onPress={() => setTheme('dark')} />
              <Pill label="Light" active={theme === 'light'} onPress={() => setTheme('light')} />
            </ToolRow>

            <ToolRow>
              <Text style={s.toolLabel}>Overlay</Text>
              <Pill label="SMA" active={showSma} onPress={() => setShowSma(v => !v)} activeColor="#F5A623" activeBg="#3A2A00" />
              <Pill label="EMA" active={showEma} onPress={() => setShowEma(v => !v)} activeColor="#50E3C2" activeBg="#0A2A26" />
              <Pill label="BB"  active={showBb}  onPress={() => setShowBb(v => !v)}  activeColor="#C39BD3" activeBg="#2A1A3A" />
              <Divider />
              <Text style={s.toolLabel}>Panel</Text>
              <Pill label="RSI"  active={showRsi}  onPress={() => setShowRsi(v => !v)}  activeColor="#FFB84D" activeBg="#3A2400" />
              <Pill label="MACD" active={showMacd} onPress={() => setShowMacd(v => !v)} activeColor="#60A5FA" activeBg="#0A1A3A" />
              <Pill label="HUD"  active={showHud}  onPress={() => setShowHud(v => !v)} />
              <Divider />
              <Pill label="24h" active={!hour12} onPress={() => setHour12(false)} />
              <Pill label="12h" active={hour12}  onPress={() => setHour12(true)} />
              <Divider />
              <View style={[s.liveDot, { backgroundColor: liveColor }]} />
              {livePills}
            </ToolRow>
          </View>

          <View style={s.actionBar}>
            {actionButtons}
          </View>
        </>
      )}

      {/* ── Chart ─────────────────────────────────────────────────────────── */}
      <View style={s.chartWrap} onLayout={e => setChartLayout(e.nativeEvent.layout)}>
        {chartLayout.width > 0 && chartLayout.height > 0 && (
          <SLChart
            data={data}
            indicators={indicators}
            shadedAreas={shadedAreas}
            width={chartLayout.width}
            height={chartLayout.height}
            intervalMs={INTERVAL_MS}
            visibleDataPoints={visibleDataPoints}
            theme={theme}
            chartType={chartType}
            showRsiPanel={showRsi}
            showMacdPanel={showMacd}
            showOhlcHud={showHud}
            scrollToLatestTrigger={latestToken}
            hour12={hour12}
          />
        )}
      </View>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },

  actionBtn: {
    paddingHorizontal: 7,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  actionBtnTxt: {
    fontSize: 10,
    fontWeight: '600',
    color: C.textDim,
  },

  // Toolbar
  toolbar: {
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 2,
  },
  toolRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexWrap: 'nowrap',
  },
  toolLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: C.textMuted,
    letterSpacing: 0.8,
    marginRight: 1,
  },
  divider: {
    width: 1,
    height: 14,
    backgroundColor: C.border,
    marginHorizontal: 3,
  },
  liveDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    marginRight: 1,
  },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  // Landscape toolbar
  toolbarLandscape: {
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    flexGrow: 0,
    flexShrink: 0,
  },
  toolRowLandscape: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },

  // Chart
  chartWrap: { flex: 1, overflow: 'hidden' },
});
