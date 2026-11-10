// Consumer test: the CommonJS entry point (older toolchains, Jest without ESM, Node scripts).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const engine = require('@stacklatte/chart-engine');
const schema = require('@stacklatte/chart-engine/ChartConfig.schema.json');

test('require() resolves the same API', () => {
  assert.equal(typeof engine.calcRSI, 'function');
  assert.equal(typeof engine.buildChartPipeline, 'function');
});

test('the JSON Schema is resolvable and closed (additionalProperties: false)', () => {
  const root = schema.definitions.ChartConfig;
  assert.equal(root.additionalProperties, false);
  assert.ok(root.required.includes('theme'));
});
