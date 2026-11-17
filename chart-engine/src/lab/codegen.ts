/**
 * Turns a Lab state (the chart a person built with the controls) into things they can paste:
 * ready-to-run code for React / Angular / React Native / plain TypeScript, the LLM-safe `ChartConfig` JSON, a precise
 * plain-English spec, and a complete prompt for an AI coding assistant. The website's Lab uses it.
 *
 * The generated code assumes the reader already has `candles: Candle[]` (oldest first, `timestamp` in Unix ms).
 */
import type { ChartConfig, OverlayConfig, SubPanelConfig } from '../config';
import { DEFAULT_LAB_STATE, labSize } from './lab';
import type { LabState } from './lab';

export type CodegenTarget = 'react' | 'angular' | 'react-native' | 'typescript';

export const CODEGEN_TARGETS: { id: CodegenTarget; label: string; pkg: string; install: string; note: string }[] = [
  { id: 'react', label: 'React / Next.js', pkg: '@stacklatte/chart-react', install: 'npm install @stacklatte/chart-react', note: 'A client component (Next.js App Router: it carries "use client").' },
  { id: 'angular', label: 'Angular', pkg: '@stacklatte/chart-angular', install: 'npm install @stacklatte/chart-angular', note: 'A standalone component for Angular 19+ (signals, OnPush).' },
  { id: 'react-native', label: 'React Native', pkg: '@stacklatte/chart-native', install: 'npm install @stacklatte/chart-native @shopify/react-native-skia react-native-gesture-handler', note: 'iOS and Android with Skia. Wrap the app root in GestureHandlerRootView.' },
  { id: 'typescript', label: 'Plain TypeScript', pkg: '@stacklatte/chart-engine', install: 'npm install @stacklatte/chart-engine', note: 'Framework-free: draws into a DOM element with the Canvas 2D controller.' },
];

export interface GeneratedChart {
  target: CodegenTarget;
  /** npm package the code imports the chart from. */
  pkg: string;
  /** Shell command that installs everything the code needs. */
  install: string;
  /** The code to paste. */
  code: string;
  /** Plain-English list of the exact settings. */
  spec: string[];
  /** The same chart as a validated, LLM-safe ChartConfig, or `null` when nothing useful can be expressed. */
  chartConfig: ChartConfig | null;
  /** Settings the ChartConfig document cannot express (they are in the code as props). */
  configGaps: string[];
  /** A complete prompt for an AI coding assistant. */
  prompt: string;
}

const COLORS = { sma: '#F5A623', ema: '#50E3C2', vwap: '#60A5FA', bb: '#9B59B6', bbBasis: '#7F8C8D' };
const DOCS_URL = 'https://stacklatte.com/llms.txt';

// ---------------------------------------------------------------------------- the spec in words

export function describeChart(s: LabState): string[] {
  const lines: string[] = [];
  lines.push(s.sparkline
    ? `Compact sparkline (${s.chartType === 'line' ? 'line' : 'area'} with no axes, grid, panels or crosshair; it must not capture touch or scroll input, so many of them fit in a list)`
    : `${{ candle: 'Candlestick', line: 'Close-price line', area: 'Area (line with a gradient fill underneath)' }[s.chartType]} chart`);
  lines.push(s.theme === 'custom'
    ? `Custom theme: background ${s.cBackground}, up candles ${s.cUp}, down candles ${s.cDown}, grid ${s.cGrid}, labels ${s.cText}, crosshair ${s.cCrosshair}`
    : `${s.theme === 'dark' ? 'Dark' : 'Light'} theme`);
  if (!s.sparkline) lines.push(`${s.zoom} candles visible at a time${s.maxZoom === 'auto' ? '' : `, zoom-out capped at ${s.maxZoom} candles`}`);
  lines.push(s.interval === 'auto' ? 'Candle interval auto-detected from the data' : `Candle interval forced to ${s.interval === '60000' ? '1 minute' : '5 minutes'}`);
  if (!s.sparkline) {
    lines.push(`${s.hour12 ? '12-hour (AM/PM)' : '24-hour'} time axis; grid lines ${s.grid ? 'on' : 'off'}`);
    lines.push(s.hud ? 'OHLC readout and crosshair that follows the pointer/touch (showOhlcHud)' : 'No OHLC readout or crosshair');
    const overlays = [s.sma && `SMA(${s.smaPeriod})`, s.ema && `EMA(${s.emaPeriod})`, s.bb && `Bollinger Bands(${s.bbPeriod}, ${s.bbMult}σ) with the band area shaded`, s.vwap && 'VWAP'].filter(Boolean);
    lines.push(overlays.length ? `Overlays on the price panel: ${overlays.join(', ')}` : 'No indicator overlays');
    const panels = [s.rsi && `RSI(${s.rsiPeriod})`, s.macd && 'MACD(12, 26, 9)', s.volume && 'Volume', s.customPanel && 'a custom −1…1 panel with a zero line'].filter(Boolean);
    lines.push(panels.length ? `Sub-panels below the chart: ${panels.join(', ')}` : 'No sub-panels');
    if (s.markers) lines.push('Trade markers (entry/exit long and short, stop-loss, take-profit), with a tooltip on hover');
  }
  const size = labSize(s.size, { width: 900, height: 520 });
  lines.push(s.sparkline ? 'Size: small, for example 120 × 36 px' : s.size === 'fill' ? 'Responsive width (fills its container); 520 px high' : `Fixed size ${size.width} × ${size.height} px`);
  return lines;
}

// ---------------------------------------------------------------------------- ChartConfig (the validated, LLM-safe document)

export function toChartConfig(s: LabState): { config: ChartConfig | null; gaps: string[] } {
  const gaps: string[] = [];
  if (s.sparkline) return { config: null, gaps: ['sparkline mode is a prop, not part of ChartConfig'] };
  if (s.theme === 'custom') gaps.push('custom theme colours (the document only has the dark and light presets)');
  if (!s.grid) gaps.push('showGrid');
  if (s.hour12) gaps.push('hour12');
  if (s.maxZoom !== 'auto') gaps.push('maxZoom');
  if (s.customPanel) gaps.push('the custom panel');
  if (s.markers) gaps.push('trade markers (they are tied to your data: pass them as the markers array)');
  const overlays: OverlayConfig[] = [];
  const shadedAreas: ChartConfig['shadedAreas'] = [];
  if (s.sma) overlays.push({ type: 'sma', id: 'sma', params: { period: s.smaPeriod }, color: 'orange' });
  if (s.ema) overlays.push({ type: 'ema', id: 'ema', params: { period: s.emaPeriod }, color: 'cyan' });
  if (s.vwap) overlays.push({ type: 'vwap', id: 'vwap', params: {}, color: 'blue' });
  if (s.bb) {
    overlays.push({ type: 'bollinger_bands', params: { period: s.bbPeriod, stdDev: s.bbMult }, bands: { upper: { id: 'bb-upper', color: 'purple' }, lower: { id: 'bb-lower', color: 'purple' }, basis: { id: 'bb-basis', color: 'gray' } } });
    shadedAreas.push({ fromOverlayId: 'bb-upper', toOverlayId: 'bb-lower', color: 'purple', opacity: 0.12 });
  }
  const subPanels: SubPanelConfig[] = [];
  if (s.rsi) subPanels.push({ type: 'rsi', params: { period: s.rsiPeriod } });
  if (s.macd) subPanels.push({ type: 'macd' });
  if (s.volume) subPanels.push({ type: 'volume' });
  const config: ChartConfig = {
    version: '1',
    theme: s.theme === 'light' ? 'light' : 'dark',
    priceDisplay: s.chartType,
    interval: s.interval === '300000' ? '5m' : '1m',
    overlays, shadedAreas, subPanels,
    viewport: { visibleCandles: s.zoom, followLive: true },
    hud: { showOhlcHud: s.hud },
  };
  return { config, gaps };
}

// ---------------------------------------------------------------------------- code

interface Pieces {
  /** Names imported from the chart package. */
  imports: Set<string>;
  typeImports: Set<string>;
  /** Statements that build values from `candles` (inside a memo / computed). */
  indicatorBody: string[];
  /** Whether the code needs `indicators` / `shadedAreas` / sample markers / the custom panel. */
  hasIndicators: boolean;
  hasShaded: boolean;
  hasMarkers: boolean;
  hasCustomPanel: boolean;
  /** props as [name, JS expression] */
  props: [string, string][];
  width: string;
  height: string;
  responsive: boolean;
}

const q = (v: string) => `'${v}'`;
const num = (n: number) => String(n);

function themeLiteral(s: LabState): string {
  if (s.theme !== 'custom') return q(s.theme);
  return `{ background: ${q(s.cBackground)}, candleUp: ${q(s.cUp)}, candleDown: ${q(s.cDown)}, gridH: ${q(`${s.cGrid}66`)}, gridV: ${q(`${s.cGrid}66`)}, priceLabel: ${q(s.cText)}, timeLabel: ${q(s.cText)}, crosshair: ${q(s.cCrosshair)}, lineChart: ${q(s.cUp)}, rsiLine: ${q(s.cText)}, rsiThreshold: ${q(s.cGrid)}, hudBackground: ${q(s.cBackground)}, hudText: ${q(s.cText)}, markerNeutral: ${q(s.cText)} }`;
}

function collect(s: LabState, kind: 'react' | 'angular' | 'react-native' | 'typescript'): Pieces {
  const imports = new Set<string>();
  const typeImports = new Set<string>(['Candle']);
  const body: string[] = [];
  const names: string[] = [];
  const full = !s.sparkline;
  if (full && s.sma) { imports.add('calcSMA'); body.push(`const sma = calcSMA(candles, ${s.smaPeriod}, 'sma', '${COLORS.sma}');`); names.push('sma'); }
  if (full && s.ema) { imports.add('calcEMA'); body.push(`const ema = calcEMA(candles, ${s.emaPeriod}, 'ema', '${COLORS.ema}');`); names.push('ema'); }
  if (full && s.vwap) { imports.add('calcVWAP'); body.push(`const vwap = calcVWAP(candles, 'vwap', '${COLORS.vwap}');`); names.push('vwap'); }
  if (full && s.bb) {
    imports.add('calcBollingerBands');
    body.push(`const bb = calcBollingerBands(candles, ${s.bbPeriod}, ${s.bbMult}, { upper: '${COLORS.bb}', basis: '${COLORS.bbBasis}', lower: '${COLORS.bb}' });`);
  }
  const lineExprs = [...names.map((n) => `...(${n} ? [${n}] : [])`), ...(full && s.bb ? ['...(bb ? [bb.upper, bb.basis, bb.lower] : [])'] : [])];
  const hasIndicators = lineExprs.length > 0;
  if (hasIndicators) typeImports.add('IndicatorLine');
  if (full && s.markers) { typeImports.add('ChartMarker'); }
  if (full && s.customPanel) typeImports.add('CustomPanel');

  const props: [string, string][] = [['data', 'candles']];
  if (hasIndicators) props.push(['indicators', 'indicators']);
  if (full && s.bb) props.push(['shadedAreas', 'shadedAreas']);
  if (full && s.markers) props.push(['markers', 'markers']);
  if (full && s.customPanel) props.push(['customPanels', 'customPanels']);
  const D = DEFAULT_LAB_STATE;
  if (s.chartType !== 'candle' && !(s.sparkline && s.chartType === 'area')) props.push(['chartType', q(s.chartType)]);
  if (s.sparkline) props.push(['sparkline', 'true']);
  if (s.theme !== 'dark') props.push(['theme', s.theme === 'custom' ? 'theme' : q(s.theme)]);
  if (s.interval !== 'auto') props.push(['intervalMs', s.interval]);
  if (full) {
    if (s.zoom !== 60) props.push(['visibleDataPoints', num(s.zoom)]);
    if (s.maxZoom !== 'auto') props.push(['maxZoom', s.maxZoom]);
    if (s.hud) props.push(['showOhlcHud', 'true']);
    if (s.rsi) props.push(['showRsiPanel', 'true']);
    if (s.rsi && s.rsiPeriod !== D.rsiPeriod) props.push(['rsiPeriod', num(s.rsiPeriod)]);
    if (s.macd) props.push(['showMacdPanel', 'true']);
    if (s.volume) props.push(['showVolumePanel', 'true']);
    if (!s.grid) props.push(['showGrid', 'false']);
    if (s.hour12) props.push(['hour12', 'true']);
  }
  const size = labSize(s.size, { width: 900, height: 520 });
  const responsive = full && s.size === 'fill';
  const width = s.sparkline ? '120' : responsive ? 'width' : num(size.width);
  const height = s.sparkline ? '36' : num(size.height);
  void kind;
  return { imports, typeImports, indicatorBody: [...body, `const indicators: IndicatorLine[] = [${lineExprs.join(', ')}];`].filter((l) => hasIndicators || !l.startsWith('const indicators')), hasIndicators, hasShaded: full && s.bb, hasMarkers: full && s.markers, hasCustomPanel: full && s.customPanel, props, width, height, responsive };
}

const SHADED = `const shadedAreas = [{ fromId: 'bb-upper', toId: 'bb-lower', color: '${COLORS.bb}', opacity: 0.12 }];`;
const SHADED_TOP = `// The shaded band between the upper and lower Bollinger line (matched by indicator id).\n${SHADED}`;
const MARKERS_HELPER = `// Six sample markers, one of each kind, pinned to candles in your data. Replace with your own trades.
const MARKER_KINDS = ['entry-long', 'exit-long', 'entry-short', 'exit-short', 'stop-loss', 'take-profit'] as const;
function sampleMarkers(candles: Candle[]): ChartMarker[] {
  return [0.62, 0.7, 0.76, 0.82, 0.88, 0.94].map((at, i) => {
    const c = candles[Math.min(candles.length - 1, Math.floor(candles.length * at))];
    const kind = MARKER_KINDS[i];
    return { timestamp: c.timestamp, price: kind.startsWith('entry') ? c.low : c.high, kind, label: kind.replace('-', ' ') };
  });
}`;
const CUSTOM_PANEL = (indent: string) => `${indent}const customPanels: CustomPanel[] = [{
${indent}  id: 'wave', label: 'Wave −1…1', yRange: { min: -1, max: 1 }, referenceLines: [0],
${indent}  series: [{ id: 'wave', name: 'wave', color: '#38bdf8', data: candles.map((c, i) => ({ timestamp: c.timestamp, value: Math.sin(i / 9) })) }],
${indent}}];`;

const indent = (lines: string[], pad: string) => lines.map((l) => (l ? pad + l : l)).join('\n');
const importLine = (names: Set<string>, types: Set<string>, pkg: string) => {
  const parts = [`import { ${['SLChart', ...[...names].sort()].join(', ')} } from '${pkg}';`, `import type { ${[...types].sort().join(', ')} } from '${pkg}';`];
  return parts.join('\n');
};

const RESIZE_HOOK = `/** Measures the container so the chart (which needs numeric pixels) can fill it. */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}`;

function reactCode(s: LabState, native: boolean): string {
  const k = collect(s, native ? 'react-native' : 'react');
  const pkg = native ? '@stacklatte/chart-native' : '@stacklatte/chart-react';
  const needsMemo = k.hasIndicators || k.hasMarkers || k.hasCustomPanel;
  const reactImports = new Set<string>();
  if (needsMemo) reactImports.add('useMemo');
  if (k.responsive && !native) { reactImports.add('useEffect'); reactImports.add('useRef'); reactImports.add('useState'); }
  const head: string[] = [];
  if (!native) head.push("'use client';", '');
  if (reactImports.size) head.push(`import { ${[...reactImports].sort().join(', ')} } from 'react';`);
  if (native) head.push(`import { useWindowDimensions } from 'react-native';`);
  head.push(importLine(k.imports, k.typeImports, pkg));
  const top: string[] = [];
  if (s.theme === 'custom') top.push('', `const theme = ${themeLiteral(s)};`);
  if (k.hasShaded) top.push('', SHADED_TOP);
  if (k.hasMarkers) top.push('', MARKERS_HELPER);
  if (k.responsive && !native) top.push('', RESIZE_HOOK);
  const memo: string[] = [];
  if (k.hasIndicators) memo.push(`const indicators = useMemo(() => {`, ...k.indicatorBody.map((l) => '  ' + l), '  return indicators;', '}, [candles]);');
  if (k.hasMarkers) memo.push('const markers = useMemo(() => sampleMarkers(candles), [candles]);');
  if (k.hasCustomPanel) memo.push(CUSTOM_PANEL('').replace('const customPanels: CustomPanel[] = [{', 'const customPanels = useMemo<CustomPanel[]>(() => [{').replace(/\}\];$/, '}], [candles]);'));
  const name = s.sparkline ? 'Sparkline' : 'PriceChart';
  const props = k.props.map(([n, v]) => (v === n ? `${n}={${n}}` : v === 'true' ? n : /^'.*'$/.test(v) ? `${n}=${v.replace(/^'|'$/g, '"')}` : `${n}={${v}}`));
  const jsxProps = [props[0], `width={${k.width}}`, `height={${k.height}}`, ...props.slice(1)];
  const body: string[] = [];
  if (native) body.push('const { width } = useWindowDimensions();', ...memo);
  else if (k.responsive) body.push('const [ref, width] = useElementWidth<HTMLDivElement>();', ...memo);
  else body.push(...memo);
  const chart = `<SLChart ${jsxProps.join(' ')} />`;
  const ret = k.responsive && !native
    ? ['return (', "  <div ref={ref} style={{ width: '100%' }}>", `    {width > 0 && ${chart}}`, '  </div>', ');']
    : [`return ${chart};`];
  return [...head, ...top, '', `export function ${name}({ candles }: { candles: Candle[] }) {`, indent([...body, ...ret], '  '), '}', ''].join('\n');
}

function angularCode(s: LabState): string {
  const k = collect(s, 'angular');
  const pkg = '@stacklatte/chart-angular';
  const ng = ['ChangeDetectionStrategy', 'Component', ...(k.hasIndicators || k.hasMarkers || k.hasCustomPanel ? ['computed'] : []), 'input'];
  const lines: string[] = [`import { ${ng.sort().join(', ')} } from '@angular/core';`, `import { SlChartComponent${[...k.imports].length ? ', ' + [...k.imports].sort().join(', ') : ''} } from '${pkg}';`, `import type { ${[...k.typeImports].sort().join(', ')} } from '${pkg}';`];
  if (k.hasMarkers) lines.push('', MARKERS_HELPER);
  const signals = new Set(['indicators', 'markers', 'customPanels']); // computed() members: read with ()
  const bind = (n: string, v: string) => (/^'.*'$/.test(v) ? `${n}="${v.slice(1, -1)}"` : `[${n}]="${v === 'candles' ? 'candles()' : v === n && signals.has(n) ? n + '()' : v}"`);
  const attrs = k.props.map(([n, v]) => bind(n, v));
  const sizeAttrs = [`[width]="${k.width}"`, `[height]="${k.height}"`];
  const comp: string[] = [`@Component({`, `  selector: 'app-${s.sparkline ? 'sparkline' : 'price-chart'}',`, `  standalone: true,`, `  imports: [SlChartComponent],`, `  changeDetection: ChangeDetectionStrategy.OnPush,`];
  if (k.responsive) {
    comp.push(`  template: \`<div style="width: 100%"><sl-chart ${[attrs[0], ...sizeAttrs, ...attrs.slice(1)].join(' ')} /></div>\`,`);
  } else {
    comp.push(`  template: \`<sl-chart ${[attrs[0], ...sizeAttrs, ...attrs.slice(1)].join(' ')} />\`,`);
  }
  comp.push('})', `export class ${s.sparkline ? 'SparklineComponent' : 'PriceChartComponent'} {`, '  readonly candles = input.required<Candle[]>();');
  if (k.responsive) comp.push('  /** Chart width in CSS pixels. Bind it to your container width (ResizeObserver); sl-chart needs numbers. */', '  readonly width = input(900);');
  if (s.theme === 'custom') comp.push(`  readonly theme = ${themeLiteral(s)};`);
  const cand = (e: string) => e.replace(/\bcandles\b(?!\()/g, 'this.candles()');
  if (k.hasIndicators) comp.push('  readonly indicators = computed(() => {', ...k.indicatorBody.map((l) => '    ' + cand(l)), '    return indicators;', '  });');
  if (k.hasShaded) comp.push('  ' + SHADED.replace('const ', 'readonly '));
  if (k.hasMarkers) comp.push('  readonly markers = computed(() => sampleMarkers(this.candles()));');
  if (k.hasCustomPanel) comp.push('  readonly customPanels = computed<CustomPanel[]>(() => {', '    const candles = this.candles();', '    return [{', "      id: 'wave', label: 'Wave −1…1', yRange: { min: -1, max: 1 }, referenceLines: [0],", "      series: [{ id: 'wave', name: 'wave', color: '#38bdf8', data: candles.map((c, i) => ({ timestamp: c.timestamp, value: Math.sin(i / 9) })) }],", '    }];', '  });');
  comp.push('}');
  let code = [...lines, '', ...comp, ''].join('\n');
  // Template bindings for computed signals / inputs
  return code.replace(/\[width\]="width"/, '[width]="width()"');
}

function typescriptCode(s: LabState): string {
  const k = collect(s, 'typescript');
  const imports = [...k.imports].sort();
  const lines: string[] = [`import { ChartController } from '@stacklatte/chart-engine/canvas';`];
  const types = new Set([...k.typeImports]);
  lines.push(`import ${imports.length ? `{ ${imports.join(', ')} }` : ''}${imports.length ? ' ' : ''}from '@stacklatte/chart-engine';`.replace('import from', 'import {} from').replace(/^import \{\} from '@stacklatte\/chart-engine';$/, ''));
  lines.push(`import type { ${[...types].sort().join(', ')} } from '@stacklatte/chart-engine';`);
  const out = lines.filter(Boolean);
  if (k.hasMarkers) out.push('', MARKERS_HELPER);
  out.push('', '/** Draw into `host` and return the controller. Call `chart.update({...})` when data or settings change, `chart.destroy()` when done. */');
  out.push(`export function mountChart(host: HTMLElement, candles: Candle[]) {`);
  const body: string[] = [];
  if (s.theme === 'custom') body.push(`const theme = ${themeLiteral(s)};`);
  if (k.hasIndicators) body.push(...k.indicatorBody);
  if (k.hasShaded) body.push(SHADED);
  if (k.hasMarkers) body.push('const markers = sampleMarkers(candles);');
  if (k.hasCustomPanel) body.push(CUSTOM_PANEL(''));
  const width = k.responsive ? 'host.clientWidth' : k.width;
  const props = k.props.map(([n, v]) => (v === n ? n : `${n}: ${v}`));
  body.push(`return new ChartController(host, { ${props[0]}, width: ${width}, height: ${k.height}, ${props.slice(1).join(', ')} });`.replace(', }', ' }'));
  out.push(indent(body, '  '), '}', '');
  return out.join('\n');
}

export function generateCode(s: LabState, target: CodegenTarget): string {
  if (target === 'angular') return angularCode(s);
  if (target === 'typescript') return typescriptCode(s);
  return reactCode(s, target === 'react-native');
}

// ---------------------------------------------------------------------------- prompt

const FENCE = '```';

export function generatePrompt(s: LabState, target: CodegenTarget, parts: { code: string; chartConfig: ChartConfig | null; configGaps: string[] }): string {
  const t = CODEGEN_TARGETS.find((x) => x.id === target)!;
  const spec = describeChart(s).map((l) => `- ${l}`).join('\n');
  const lang = target === 'angular' || target === 'typescript' ? 'ts' : 'tsx';
  const config = parts.chartConfig
    ? `\nThe same chart as a validated \`ChartConfig\` (the LLM-safe JSON the library accepts through \`buildChartPipeline(config, candles)\`; unknown or invalid fields are rejected with itemised errors):\n${FENCE}json\n${JSON.stringify(parts.chartConfig, null, 2)}\n${FENCE}\n${parts.configGaps.length ? `The config cannot express: ${parts.configGaps.join('; ')}. Those are set as props in the code.\n` : ''}`
    : '';
  return `Add a trading chart to my ${t.label} project with ${t.pkg} (open source, MIT).

## Install
${FENCE}sh
${t.install}
${FENCE}
${t.note}

## The chart I want (exact settings)
${spec}

## Data
My data is an array of candles, oldest first: { timestamp: number /* Unix milliseconds */, open, high, low, close, volume?: number }[]. Use my project's existing data source and types. Do not invent data or fetch from anywhere I did not ask for.

## Starting point
Adapt this code to my project's structure, naming, styling and data flow. Keep every prop value exactly as written:
${FENCE}${lang}
${parts.code.trimEnd()}
${FENCE}
${config}
## Rules
- Use only props and functions that exist in ${t.pkg}. The API reference for AI agents is ${DOCS_URL} (full version: https://stacklatte.com/llms-full.txt). Do not invent props.
- The chart needs numeric width and height in pixels; make it responsive with a ResizeObserver (or the framework's equivalent) if I ask for a fluid layout.
- Timestamps are Unix milliseconds. Candles are drawn in timestamp order, bad candles (NaN, duplicates) are dropped for you.
${target === 'react' ? '- In Next.js the chart must be in a client component ("use client"); it draws only in the browser.\n' : ''}${target === 'angular' ? '- Use the standalone <sl-chart> component; it is SSR-safe and zone-free.\n' : ''}${target === 'react-native' ? '- The app root must be wrapped in GestureHandlerRootView (react-native-gesture-handler); the chart is iOS/Android only.\n' : ''}- After the change, run the type-checker and tell me what you changed.
`;
}

// ---------------------------------------------------------------------------- the whole bundle

export function generateChart(state: LabState, target: CodegenTarget): GeneratedChart {
  const t = CODEGEN_TARGETS.find((x) => x.id === target);
  if (!t) throw new Error(`Unknown target "${target}". Use one of: ${CODEGEN_TARGETS.map((x) => x.id).join(', ')}.`);
  const code = generateCode(state, target);
  const { config, gaps } = toChartConfig(state);
  return { target, pkg: t.pkg, install: t.install, code, spec: describeChart(state), chartConfig: config, configGaps: gaps, prompt: generatePrompt(state, target, { code, chartConfig: config, configGaps: gaps }) };
}
