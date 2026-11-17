#!/usr/bin/env node
/**
 * Start every demo at once, for hands-on testing.
 *
 *   npm run demo:all                 build the packages, start React + Angular + the native Metro server, open the hub page
 *   npm run demo:all -- --ios        also build/launch the iOS app in the simulator (expo run:ios)
 *   npm run demo:all -- --android    same for an Android emulator
 *   npm run demo:all -- --no-native  web demos only
 *   npm run demo:all -- --skip-build reuse the existing dist/ folders
 *   npm run demo:all -- --no-open    do not open the browser
 *
 * Hub page: http://localhost:5100 — which package each demo shows, its version, its URL and whether it is up.
 * Ctrl+C stops everything.
 */
import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEMO_PACKAGES, LAB_CAPABILITIES, SCENARIOS } from '@stacklatte/chart-examples';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const flag = (n) => process.argv.includes(`--${n}`);
const version = (pkg) => JSON.parse(readFileSync(join(root, pkg, 'package.json'), 'utf8')).version;

const HUB_PORT = 5100;
const demos = [
  { id: 'react', port: 5199, workspace: 'react-demo', url: 'http://localhost:5199/', pkg: DEMO_PACKAGES.react, version: version('chart-react'), colour: '\x1b[34m' },
  { id: 'angular', port: 5200, workspace: 'angular-demo', url: 'http://localhost:5200/', pkg: DEMO_PACKAGES.angular, version: version('chart-angular'), colour: '\x1b[31m' },
];
const native = !flag('no-native');
const nativeDemo = { id: 'native', port: 8081, pkg: DEMO_PACKAGES.native, version: version('chart-native'), colour: '\x1b[32m' };
const controls = LAB_CAPABILITIES.length;

// ---------------------------------------------------------------- build what the web demos consume
if (!flag('skip-build')) {
  console.log('Building chart-engine, chart-react and chart-angular (the demos run the built packages)…');
  execFileSync('npm', ['run', 'build', '-w', '@stacklatte/chart-engine', '-w', '@stacklatte/chart-react', '-w', '@stacklatte/chart-angular'], { cwd: root, stdio: 'inherit' });
}

// ---------------------------------------------------------------- processes
const children = [];
function run(label, colour, cmd, args, cwd = root) {
  const child = spawn(cmd, args, { cwd, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: (({ CI: _ci, ...rest }) => ({ ...rest, FORCE_COLOR: '1', BROWSER: 'none' }))(process.env) });
  children.push(child);
  const tag = `${colour}${label.padEnd(8)}\x1b[0m│ `;
  for (const stream of [child.stdout, child.stderr]) {
    let buf = '';
    stream.on('data', (d) => {
      buf += d.toString();
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const l of lines) if (l.trim()) console.log(tag + l);
    });
  }
  child.on('exit', (code) => console.log(`${tag}exited (${code})`));
  return child;
}
for (const d of demos) run(d.id, d.colour, 'npm', ['run', 'dev', `--workspace=${d.workspace}`, '--', '--port', String(d.port), '--strictPort']);
if (native) {
  const demoDir = join(root, 'examples', 'demo');
  if (flag('ios')) run('native', nativeDemo.colour, 'npx', ['expo', 'run:ios'], demoDir);
  else if (flag('android')) run('native', nativeDemo.colour, 'npx', ['expo', 'run:android'], demoDir);
  else run('native', nativeDemo.colour, 'npx', ['expo', 'start', '--dev-client', '--port', String(nativeDemo.port)], demoDir);
}

function shutdown() {
  for (const c of children) { try { process.kill(-c.pid, 'SIGTERM'); } catch { /* already gone */ } }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ---------------------------------------------------------------- hub page
const up = async (url) => { try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } };

const card = (d, body) => `
  <article style="--accent:${d.pkg.accent}">
    <header><span class="badge">${d.pkg.platform}</span><span class="dot" data-url="${d.id}" title="checking…"></span></header>
    <h2>${d.pkg.pkg} <small>v${d.version}</small></h2>
    <p class="renderer">${d.pkg.renderer}</p>
    ${body}
  </article>`;

const page = () => `<!doctype html><meta charset="utf-8"><title>Stacklatte Charts · demos</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;background:#0d0e14;color:#d4d8e8;font:15px/1.5 system-ui,sans-serif}
  main{max-width:1100px;margin:0 auto;padding:32px 20px 60px}
  h1{font-size:26px;margin:0 0 4px} .sub{color:#8a90ad;margin:0 0 28px}
  .grid{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
  article{background:#13141c;border:1px solid #1e2130;border-top:6px solid var(--accent);border-radius:12px;padding:18px 20px}
  article header{display:flex;justify-content:space-between;align-items:center}
  .badge{background:var(--accent);color:#fff;border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
  .dot{width:10px;height:10px;border-radius:50%;background:#5a5f7a}.dot.up{background:#26a65b}.dot.down{background:#e53935}
  h2{margin:12px 0 0;font-size:20px;word-break:break-all} h2 small{color:#8a90ad;font-weight:500;font-size:14px}
  .renderer{margin:2px 0 12px;color:#8a90ad}
  ul{margin:8px 0 14px;padding-left:18px;color:#b6bbd2} li{margin:3px 0}
  a.btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;border-radius:8px;padding:8px 14px;margin:0 8px 6px 0}
  a.btn.alt{background:#262a3d}
  code{background:#0d0e14;border:1px solid #262a3d;border-radius:6px;padding:2px 6px;font-size:13px}
  .note{margin-top:26px;color:#8a90ad;font-size:13px}
</style>
<main>
  <h1>Stacklatte Charts · every demo</h1>
  <p class="sub">Each demo shows one package. The coloured bar at the top of every page names it. Every capability is a visible control (${controls} controls, grouped), plus ${SCENARIOS.length} scenarios.</p>
  <div class="grid">
    ${demos.map((d) => card(d, `
      <ul><li><b>Lab</b>: all ${controls} controls visible at once: data, view, overlays, panels, markers, custom theme, stress, live feed</li>
      <li><b>${SCENARIOS.length} scenarios</b>: feature, edge, stress and live cases</li></ul>
      <a class="btn" href="${d.url}">Open the Lab</a><a class="btn alt" href="${d.url}#/scenarios/basic">Scenarios</a>`)).join('')}
    ${native ? card(nativeDemo, `
      <ul><li><b>Lab tab</b>: the same ${controls} controls, as a scrollable panel under the chart</li>
      <li><b>Scenarios tab</b>: the same ${SCENARIOS.length} scenarios</li></ul>
      <p>Metro is running on <code>:${nativeDemo.port}</code>. ${flag('ios') || flag('android') ? 'The app is being built and launched on the simulator/emulator.' : 'With the dev client installed on a booted simulator, open the app against this Metro with:'}</p>
      ${flag('ios') || flag('android') ? '' : `<p><code>xcrun simctl openurl booted "com.anonymous.demo://expo-development-client/?url=http%3A%2F%2Flocalhost%3A${nativeDemo.port}"</code></p><p>First time? Run <code>npm run demo:all -- --ios</code> once to build and install the app.</p>`}
      <a class="btn alt" href="http://localhost:${nativeDemo.port}/">Metro status</a>`) : ''}
  </div>
  <p class="note">Stop everything with Ctrl+C in the terminal. The web demos run the <i>built</i> packages (what npm users get). Re-run <code>npm run demo:all</code> after changing package code.</p>
</main>
<script>
  const ids = ${JSON.stringify([...demos.map((d) => d.id), ...(native ? ['native'] : [])])};
  async function poll(){ const s = await (await fetch('/status')).json();
    for (const id of ids) { const el = document.querySelector('[data-url="'+id+'"]'); el.className = 'dot ' + (s[id] ? 'up' : 'down'); el.title = s[id] ? 'running' : 'not reachable'; } }
  poll(); setInterval(poll, 3000);
</script>`;

createServer(async (req, res) => {
  if (req.url === '/status') {
    const status = Object.fromEntries(await Promise.all([...demos.map(async (d) => [d.id, await up(d.url)]), ...(native ? [(async () => ['native', await up(`http://localhost:${nativeDemo.port}/`)])()] : [])]));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(status));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(page());
}).listen(HUB_PORT, () => {
  console.log(`\n\x1b[1mHub: http://localhost:${HUB_PORT}\x1b[0m   (React :5199 · Angular :5200${native ? ' · Metro :8081' : ''})\n`);
  if (!flag('no-open') && process.platform === 'darwin') spawn('open', [`http://localhost:${HUB_PORT}`], { stdio: 'ignore' });
});
