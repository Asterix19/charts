import { DEMO_PACKAGES } from '@stacklatte/chart-examples';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Metro watches the whole monorepo (see metro.config.js), so the package.json files can be read directly.
const nativeVersion: string = require('../../../chart-native/package.json').version;
const engineVersion: string = require('../../../chart-engine/package.json').version;

const PKG = DEMO_PACKAGES.native;

/** Names the package this app demonstrates, on every screen. Also pads the status bar inset. */
export default function PackageBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View testID="package-banner" accessibilityLabel={`package-banner ${PKG.pkg} v${nativeVersion}`} style={[s.bar, { paddingTop: insets.top + 6, backgroundColor: PKG.accent }]}>
      <View style={s.row}>
        <Text style={s.badge}>{PKG.platform}</Text>
        <Text style={s.meta}>{PKG.renderer} · engine v{engineVersion}</Text>
      </View>
      <Text style={s.title}>{PKG.pkg} <Text style={s.version}>v{nativeVersion}</Text></Text>
    </View>
  );
}

const s = StyleSheet.create({
  bar: { paddingHorizontal: 14, paddingBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { color: '#fff', backgroundColor: 'rgba(0,0,0,0.28)', overflow: 'hidden', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, fontSize: 10, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  meta: { color: 'rgba(255,255,255,0.9)', fontSize: 11 },
  title: { color: '#fff', fontSize: 16, fontWeight: '700', marginTop: 4 },
  version: { fontWeight: '500', opacity: 0.85, fontSize: 12 },
});
