import { SLChart } from '@stacklatte/chart-native';
import { SCENARIOS, getScenario } from '@stacklatte/chart-examples';
import type { Candle } from '@stacklatte/chart-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { LogBox, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * One scenario from the shared catalogue (the same one the web, Angular and vanilla demos serve),
 * rendered with @stacklatte/chart-native. Deep-link with `demo://scenarios?id=stress-2k`.
 * testIDs follow the cross-platform contract: tab-<id>, title, description, chart-host, stats.
 */
export default function ScenariosScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id: idParam, clean } = useLocalSearchParams<{ id?: string; clean?: string }>();
  const id = SCENARIOS.some((sc) => sc.id === idParam) ? (idParam as string) : SCENARIOS[0].id;
  // Comparison runs screenshot the chart only: LogBox toasts (e.g. the deprecation warnings an older chart package prints) must not cover it.
  useEffect(() => {
    if (clean === '1') LogBox.ignoreAllLogs(true);
  }, [clean]);

  return (
    <View style={[s.screen, { paddingTop: insets.top }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabs} contentContainerStyle={s.tabsContent} testID="tabs">
        {SCENARIOS.map((sc) => (
          <TouchableOpacity
            key={sc.id}
            testID={`tab-${sc.id}`}
            accessibilityLabel={`tab-${sc.id}`}
            onPress={() => router.setParams({ id: sc.id })}
            style={[s.tab, sc.id === id && s.tabOn]}>
            <Text style={[s.tabText, sc.id === id && s.tabTextOn]}>{sc.title}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
      {/* keyed: every scenario starts from fresh state, so nothing needs resetting */}
      <ScenarioView key={id} id={id} clean={clean === '1'} />
    </View>
  );
}

function ScenarioView({ id, clean }: { id: string; clean: boolean }) {
  const scenario = useMemo(() => getScenario(id), [id]);
  const { width } = useWindowDimensions();
  const [data, setData] = useState<Candle[]>(() => scenario.data());
  const [ticks, setTicks] = useState(0);
  const [fps, setFps] = useState(0);
  const [mountMs, setMountMs] = useState(0);
  const [toLatest, setToLatest] = useState(0);

  useEffect(() => {
    // Time from the first effect (the chart has rendered once by now) to the second painted frame.
    const startedAt = Date.now();
    const raf = requestAnimationFrame(() => requestAnimationFrame(() => setMountMs(Date.now() - startedAt)));
    if (!scenario.live) return () => cancelAnimationFrame(raf);
    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      setData((prev) => scenario.live!.next(prev, tick));
      setTicks(tick);
    }, scenario.live.tickMs);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(timer);
    };
  }, [scenario]);

  // JS-thread frame rate (a proxy for responsiveness; the Skia canvas itself renders on the UI thread).
  useEffect(() => {
    let frames = 0;
    let last = Date.now();
    let raf = 0;
    const loop = () => {
      frames += 1;
      const now = Date.now();
      if (now - last >= 1000) {
        setFps(Math.round((frames * 1000) / (now - last)));
        frames = 0;
        last = now;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const props = useMemo(() => scenario.props(data), [scenario, data]);

  return (
    <>
      <Text style={s.title} testID="title">{scenario.title}</Text>
      <Text style={s.desc} testID="description">{scenario.description}</Text>
      <TouchableOpacity testID="now" accessibilityLabel="now" onPress={() => setToLatest((n) => n + 1)} style={[s.tab, { alignSelf: 'flex-start', marginHorizontal: 16, marginTop: 8 }]}>
        <Text style={s.tabText}>Now</Text>
      </TouchableOpacity>
      <Text
        style={[s.stats, clean && { color: 'transparent' }]} // clean: comparison runs screenshot the chart only (the stats text changes every frame); transparent, not opacity 0, so it stays in the accessibility tree
        testID="stats"
        accessibilityLabel={`stats scenario=${id} candles=${data.length} ticks=${ticks}`}>
        {`${data.length.toLocaleString()} candles · mount ${mountMs} ms · ${fps} JS fps${scenario.live ? ` · ${ticks} ticks` : ''}`}
      </Text>
      <View testID="chart-host" style={s.host}>
        <SLChart data={data} width={width - 32} height={scenario.height} {...props} scrollToLatestTrigger={toLatest} />
      </View>
    </>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b0b0f' },
  tabs: { maxHeight: 44, flexGrow: 0 },
  tabsContent: { paddingHorizontal: 12, gap: 6, alignItems: 'center' },
  tab: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#374151' },
  tabOn: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  tabText: { color: '#9ca3af', fontSize: 12 },
  tabTextOn: { color: '#fff' },
  title: { color: '#e5e7eb', fontSize: 18, fontWeight: '600', marginHorizontal: 16, marginTop: 8 },
  desc: { color: '#9ca3af', fontSize: 12, marginHorizontal: 16, marginBottom: 8 },
  host: { marginHorizontal: 16, borderRadius: 12, overflow: 'hidden', backgroundColor: '#0b0b0f' },
  stats: { color: '#9ca3af', fontSize: 11, marginHorizontal: 16, marginTop: 8, fontFamily: 'Menlo' },
});
