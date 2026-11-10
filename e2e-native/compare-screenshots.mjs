#!/usr/bin/env node
// Skia draws to a GPU canvas, so Maestro cannot read the chart through the accessibility tree.
// Instead the gesture flow captures screenshots and this script asserts the pixels changed.
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Maestro writes <out>/<timestamp>/<flow>/takeScreenshot/<name>.png — use the newest run.
const root = new URL('./screenshots/', import.meta.url).pathname;
const runs = existsSync(root) ? readdirSync(root).filter((d) => /^\d{4}-/.test(d)).sort() : [];
if (runs.length === 0) throw new Error(`no Maestro runs found in ${root} (run the flows first)`);
const dir = join(root, runs.at(-1), '03-gestures', 'takeScreenshot');
const hash = (name) => {
  const file = join(dir, `${name}.png`);
  if (!existsSync(file)) throw new Error(`missing screenshot ${file} (did the gesture flow run?)`);
  return createHash('sha1').update(readFileSync(file)).digest('hex');
};

const before = hash('gesture-1-before');
const panned = hash('gesture-2-panned');
if (before === panned) {
  console.error('FAIL: swiping the chart did not change the rendered pixels (pan not working?)');
  process.exit(1);
}
console.log('native gesture check passed: pan changed the rendered chart');
