import { SLChart } from '@stacklatte/chart-native';
import type { Candle } from '@stacklatte/chart-native';
import { createLab, labApply, labChartProps, labSelected, labSize, visibleCapabilities } from '@stacklatte/chart-engine/lab';
import type { LabCapability, LabModel, LabState } from '@stacklatte/chart-engine/lab';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';

import PackageBanner from '@/components/PackageBanner';

/**
 * The Lab: every capability of chart-native as a visible control, drawn from the shared schema (the same one the React
 * and Angular demos use). testIDs: lab-<id>, lab-<id>-switch, lab-<id>-<option>, lab-<id>-dec / -inc, lab-<id>-<#color>.
 */
const ACCENT = '#16a34a';

function useLab() {
  const model = useMemo(() => createLab(), []);
  useEffect(() => () => model.dispose(), [model]);
  const state = useSyncExternalStore(model.subscribe, model.getState);
  const data = useSyncExternalStore(model.subscribe, model.getChartData);
  return { model, state, data };
}

function Control({ cap, state, model }: { cap: LabCapability; state: LabState; model: LabModel }) {
  const c = cap.control;
  const id = `lab-${cap.id}`;
  if (c.kind === 'action') {
    return (
      <Pressable testID={id} accessibilityLabel={cap.label} accessibilityRole="button" onPress={() => model.act(c.action)} style={s.action}>
        <Text style={s.actionText}>{cap.label}</Text>
      </Pressable>
    );
  }
  const value = (state as unknown as Record<string, unknown>)[cap.id];
  return (
    <View style={s.row} testID={id}>
      <View style={s.labelCol}>
        <Text style={s.label}>{cap.label}</Text>
        {cap.hint ? <Text style={s.hint}>{cap.hint}</Text> : null}
      </View>
      {c.kind === 'bool' && (
        <Switch testID={`${id}-switch`} accessibilityLabel={cap.label} value={Boolean(value)} onValueChange={(v) => labApply(model, cap.id, v)} trackColor={{ false: '#2a2f45', true: ACCENT }} thumbColor="#fff" />
      )}
      {c.kind === 'enum' && (
        <View style={s.chips}>
          {c.options.map((o) => {
            const on = labSelected(state, cap.id) === o.value;
            return (
              <Pressable key={o.value} testID={`${id}-${o.value}`} accessibilityLabel={`${cap.label} ${o.label}`} accessibilityState={{ selected: on }} onPress={() => labApply(model, cap.id, o.value)} style={[s.chip, on && s.chipOn]}>
                <Text style={[s.chipText, on && s.chipTextOn]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {c.kind === 'number' && (
        <View style={s.stepper}>
          <Pressable testID={`${id}-dec`} accessibilityLabel={`${cap.label} decrease`} style={s.step} onPress={() => labApply(model, cap.id, Math.max(c.min, Number(value) - c.step))}><Text style={s.stepText}>−</Text></Pressable>
          <Text testID={`${id}-value`} style={s.stepValue}>{String(value)}</Text>
          <Pressable testID={`${id}-inc`} accessibilityLabel={`${cap.label} increase`} style={s.step} onPress={() => labApply(model, cap.id, Math.min(c.max, Number(value) + c.step))}><Text style={s.stepText}>+</Text></Pressable>
        </View>
      )}
      {c.kind === 'color' && (
        <View style={s.chips}>
          {c.presets.map((p) => (
            <Pressable key={p} testID={`${id}-${p}`} accessibilityLabel={`${cap.label} ${p}`} accessibilityState={{ selected: value === p }} onPress={() => labApply(model, cap.id, p)} style={[s.swatch, { backgroundColor: p }, value === p && s.swatchOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

const RICH = ['sma', 'ema', 'bb', 'vwap', 'rsi', 'macd', 'volume', 'markers', 'customPanel'];

/** Test deep link: demo://lab?reset=1&preset=rich&set=rsi=false;zoom=120&act=bulk — sets controls without tapping through the panel. */
function useDeepLink(model: LabModel) {
  const { reset, preset, set, act } = useLocalSearchParams<{ reset?: string; preset?: string; set?: string; act?: string }>();
  useEffect(() => {
    if (reset === '1') model.act('reset');
    if (preset === 'rich') for (const id of RICH) labApply(model, id, true);
    for (const pair of (set ?? '').split(';').filter(Boolean)) {
      const [key, raw] = pair.split('=');
      labApply(model, key, raw === 'true' ? true : raw === 'false' ? false : raw);
    }
    if (act === 'now' || act === 'bulk' || act === 'regen') model.act(act);
  }, [model, reset, preset, set, act]);
}

export default function LabScreen() {
  const { model, state, data } = useLab();
  useDeepLink(model);
  const { width, height } = useWindowDimensions();
  const landscape = width > height;
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [hovered, setHovered] = useState<Candle | null>(null);
  const [events, setEvents] = useState(0);
  const size = labSize(state.size, area);
  const props = useMemo(() => labChartProps(state, data), [state, data]);

  return (
    <View style={s.screen} testID="lab">
      <PackageBanner />
      <View style={[s.body, landscape && s.bodyLandscape]}>
        <View style={[s.stage, landscape ? { flex: 1.2 } : { height: Math.round(height * 0.42) }]}>
          <View style={s.chart} onLayout={(e) => setArea(e.nativeEvent.layout)}>
            {area.width > 0 && area.height > 0 && (
              <SLChart {...props} width={size.width} height={size.height} onCrosshairChange={(c) => { setHovered(c); setEvents((n) => n + 1); }} />
            )}
          </View>
          <View style={s.status}>
            <Text testID="readout" style={s.statusText} numberOfLines={1}>
              {hovered ? `O ${hovered.open.toFixed(2)} · H ${hovered.high.toFixed(2)} · L ${hovered.low.toFixed(2)} · C ${hovered.close.toFixed(2)}` : 'Touch the chart to inspect a candle'}
            </Text>
            <Text testID="candle-count" style={s.statusDim}>{data.length.toLocaleString()} candles · {events} crosshair events</Text>
          </View>
        </View>
        <ScrollView style={s.panel} contentContainerStyle={{ paddingBottom: 40 }} testID="lab-panel">
          {visibleCapabilities(state).map(({ group, items }) => (
            <View key={group} style={s.group} testID={`lab-group-${group.toLowerCase().replace(/\W+/g, '-')}`}>
              <Text style={s.groupTitle}>{group}</Text>
              {items.map((cap) => <Control key={cap.id} cap={cap} state={state} model={model} />)}
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0d0e14' },
  body: { flex: 1 },
  bodyLandscape: { flexDirection: 'row' },
  stage: { minHeight: 200 },
  chart: { flex: 1, overflow: 'hidden' },
  status: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#13141c', borderTopWidth: 1, borderTopColor: '#1e2130' },
  statusText: { color: '#8a90ad', fontSize: 11 },
  statusDim: { color: '#5a5f7a', fontSize: 10 },
  panel: { flex: 1, backgroundColor: '#13141c', borderTopWidth: 1, borderTopColor: '#1e2130', paddingHorizontal: 12 },
  group: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#1e2130' },
  groupTitle: { color: '#4ade80', fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  row: { paddingVertical: 6, gap: 6 },
  labelCol: { gap: 1 },
  label: { color: '#d4d8e8', fontSize: 13, fontWeight: '600' },
  hint: { color: '#5a5f7a', fontSize: 11 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { borderWidth: 1, borderColor: '#262a3d', backgroundColor: '#0d0e14', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  chipOn: { backgroundColor: ACCENT, borderColor: ACCENT },
  chipText: { color: '#8a90ad', fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: '#fff' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  step: { width: 40, height: 34, borderRadius: 6, backgroundColor: '#0d0e14', borderWidth: 1, borderColor: '#262a3d', alignItems: 'center', justifyContent: 'center' },
  stepText: { color: '#d4d8e8', fontSize: 18, fontWeight: '600' },
  stepValue: { color: '#d4d8e8', minWidth: 36, textAlign: 'center', fontVariant: ['tabular-nums'] },
  swatch: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: '#262a3d' },
  swatchOn: { borderColor: '#fff' },
  action: { backgroundColor: '#0d0e14', borderWidth: 1, borderColor: '#262a3d', borderRadius: 6, paddingVertical: 9, paddingHorizontal: 12, marginVertical: 3, alignSelf: 'flex-start' },
  actionText: { color: '#d4d8e8', fontSize: 13, fontWeight: '600' },
});
