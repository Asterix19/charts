#!/usr/bin/env node
// Drives the SAME React Native demo app three ways on the booted iOS simulator and compares the rendered chart pixels:
//
//   native          this repo's @stacklatte/chart-native                         (baseline)
//   core-shim       this repo's @stacklatte/chart-core, the re-export that existing 2.x users upgrade to
//   core-published  the actually published @stacklatte/chart-core@2.3.3 (what people have installed today)
//
// Requirements: a booted iPhone simulator with the demo's dev client installed (`npx expo run:ios --no-bundler`).
//   node e2e-native/compare-chart-core.mjs
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

const root = resolve(new URL('..', import.meta.url).pathname);
const work = join(root, 'e2e-native', '.compare');
const { PNG } = createRequire(import.meta.url)('playwright-core/lib/utilsBundle');

// Scenarios whose output is EXPECTED to differ from the published package (documented fixes), plus live ones.
const EXCLUDE = ['edge-dirty', 'edge-bad-period', 'edge-unsorted-markers'];
// `--variants=core-published --keep` re-runs just one variant against the screenshots kept from an earlier run.
const arg = (n) => process.argv.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const VARIANTS = (arg('variants') ?? 'native,core-shim,core-published').split(',');
const KEEP = process.argv.includes('--keep');

// 1. the published package
const cache = join(root, 'compat', '.cache', 'chart-core-2.3.3');
if (!existsSync(join(cache, 'package', 'package.json'))) {
  mkdirSync(cache, { recursive: true });
  execFileSync('npm', ['pack', '@stacklatte/chart-core@2.3.3', '--pack-destination', cache, '--silent'], { cwd: cache, stdio: 'inherit' });
  execFileSync('sh', ['-c', 'tar -xzf *.tgz'], { cwd: cache });
}

// 2. one static, clean flow shared by every variant
if (!KEEP) rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const flow = join(work, 'scenarios-clean.yaml');
execFileSync('npx', ['tsx', 'e2e-native/generate-flows.mjs', '--clean', `--exclude=${EXCLUDE.join(',')}`, `--out=.compare/scenarios-clean.yaml`], { cwd: root, stdio: 'inherit' });
// the generated flow references ../helpers/launch.yaml relative to flows/
const yaml = readFileSync(flow, 'utf8').replace('../helpers/launch.yaml', join(root, 'e2e-native', 'helpers', 'launch.yaml'));
writeFileSync(flow, yaml);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withMetro(impl, fn) {
  const log = join(work, `metro-${impl}.log`);
  const out = openSync(log, 'w');
  const env = { ...process.env, ...(impl === 'native' ? {} : { CHART_IMPL: impl }) };
  const metro = spawn('npx', ['expo', 'start', '--dev-client', '--port', '8081', '--clear'], { cwd: join(root, 'examples', 'demo'), env, stdio: ['ignore', out, out], detached: true });
  try {
    for (let i = 0; i < 90 && !/Waiting on|Logs for your project/.test(readFileSync(log, 'utf8')); i++) await sleep(1000);
    await sleep(3000);
    await fn();
  } finally {
    try { process.kill(-metro.pid); } catch { /* already gone */ }
    await sleep(2000);
  }
}

// 3. run every variant
for (const impl of VARIANTS) {
  console.log(`\n=== ${impl} ===`);
  rmSync(join(work, impl), { recursive: true, force: true }); // never mix an old run's screenshots into a new one
  await withMetro(impl, async () => {
    try {
      execFileSync('maestro', ['test', flow, '--test-output-dir', join(work, impl)], { stdio: 'inherit', timeout: 40 * 60_000 });
    } catch {
      console.error(`maestro reported a failure for ${impl}`);
    }
  });
}

// 4. compare screenshots
const shots = (impl) => {
  const map = new Map();
  const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p);
    else if (/^scenario-.*\.png$/.test(e.name)) map.set(e.name.replace(/\.png$/, ''), p);
  });
  if (existsSync(join(work, impl))) walk(join(work, impl));
  return map;
};
const crop = { top: 170, bottom: 260 }; // status-bar clock and tab bar are not the chart
function diff(a, b) {
  const A = PNG.sync.read(readFileSync(a));
  const B = PNG.sync.read(readFileSync(b));
  if (A.width !== B.width || A.height !== B.height) return { pixels: Infinity, total: 1 };
  let pixels = 0;
  const total = A.width * (A.height - crop.top - crop.bottom);
  for (let y = crop.top; y < A.height - crop.bottom; y++) {
    for (let x = 0; x < A.width; x++) {
      const i = (y * A.width + x) * 4;
      if (A.data[i] !== B.data[i] || A.data[i + 1] !== B.data[i + 1] || A.data[i + 2] !== B.data[i + 2]) pixels++;
    }
  }
  return { pixels, total };
}

const base = shots('native');
let failed = false;
console.log(`\nscenarios captured on the baseline: ${base.size}`);
for (const other of ['core-shim', 'core-published']) {
  const s = shots(other);
  const rows = [];
  for (const [name, file] of base) {
    if (!s.has(name)) { rows.push({ name, status: 'MISSING' }); continue; }
    const d = diff(file, s.get(name));
    rows.push({ name, status: d.pixels === 0 ? 'identical' : `${d.pixels} px differ (${((d.pixels / d.total) * 100).toFixed(3)}%)`, pixels: d.pixels });
  }
  const bad = rows.filter((r) => r.status !== 'identical');
  console.log(`\n${other} vs native: ${rows.length - bad.length}/${rows.length} identical`);
  for (const r of bad) console.log(`   ${r.name.padEnd(28)} ${r.status}`);
  if (bad.length) failed = true;
}
process.exit(failed ? 1 : 0);
