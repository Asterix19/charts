# Generate charts with an LLM (`ChartConfig`)

Hand-written chart props let a model invent things: a theme that does not exist, a hex colour where a palette name was required, a prop from another library. `ChartConfig` closes that door:

- every string field is a **closed enum** (`theme`, `interval`, overlay `type`, `color`, marker `kind`, …) — colours are a fixed named palette, never raw hex;
- unknown keys are **rejected**;
- the same rules are published as a **JSON Schema** you can give a model as a structured-output / tool-calling schema;
- a config that does not validate throws an **itemised error** (`[code] path: message`, listing the allowed values) that a model can read and fix.

The runtime validator and the JSON Schema are tested against each other, so a model that follows the schema is not rejected for structural reasons.

## 1. A valid config

```json
{
  "version": "1",
  "theme": "dark",
  "priceDisplay": "candle",
  "interval": "1h",
  "overlays": [
    { "type": "ema", "id": "ema-9", "params": { "period": 9 }, "color": "cyan" },
    {
      "type": "bollinger_bands",
      "params": { "period": 20, "stdDev": 2 },
      "bands": {
        "upper": { "id": "bb-upper", "color": "blue" },
        "lower": { "id": "bb-lower", "color": "blue" },
        "basis": { "id": "bb-basis", "color": "gray" }
      }
    }
  ],
  "shadedAreas": [{ "fromOverlayId": "bb-upper", "toOverlayId": "bb-lower", "color": "blue", "opacity": 0.12 }],
  "subPanels": [{ "type": "rsi", "params": { "period": 14 } }, { "type": "volume" }],
  "viewport": { "visibleCandles": 100, "followLive": true },
  "hud": { "showOhlcHud": true }
}
```

Allowed values: `theme` `dark | light`; `priceDisplay` `candle | line`; `interval` `1m 5m 15m 30m 1h 4h 1d 1w`; overlay `type` `sma | ema | bollinger_bands | vwap`; sub-panel `type` `rsi | macd | volume`; `color` `blue orange green red purple yellow cyan pink white gray`; marker `kind` `entry-long exit-long entry-short exit-short stop-loss take-profit`. `period` is an integer 1–500, `visibleCandles` an integer 10–500, `opacity` 0–1.

## 2. What a model typically gets wrong — and what it hears back

```json invalid
{
  "version": "1",
  "theme": "neon",
  "priceDisplay": "candle",
  "interval": "2h",
  "overlays": [{ "type": "ema", "id": "e", "params": { "period": 9 }, "color": "#00ffff" }],
  "shadedAreas": [],
  "subPanels": [],
  "viewport": { "visibleCandles": 100, "followLive": true },
  "hud": { "showOhlcHud": true },
  "sparkles": true
}
```

All problems are reported at once, each with the allowed values:

```
Invalid ChartConfig:
  [UNKNOWN_KEY] sparkles: Unknown key "sparkles". Allowed keys: version, theme, priceDisplay, interval, overlays, ...
  [INVALID_ENUM] theme: "neon" is not allowed. Expected one of: dark, light.
  [INVALID_ENUM] interval: "2h" is not allowed. Expected one of: 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w.
  [INVALID_ENUM] overlays[0].color: "#00ffff" is not allowed. Expected one of: blue, orange, green, red, purple, yellow, cyan, pink, white, gray.
```

## 3. Validate, compile, and let the model retry

`buildChartPipeline(config, candles)` validates, normalises (fills defaults) and compiles the config into props for `SLChart` / `<sl-chart>` / `ChartController`. Feed the error text back to the model and ask again:

```ts
import { buildChartPipeline } from '@stacklatte/chart-engine';
import type { Candle, ChartConfig } from '@stacklatte/chart-engine';

/** `ask` calls your LLM with the conversation so far and returns its JSON reply. */
export async function chartFromPrompt(
  ask: (messages: string[]) => Promise<unknown>,
  prompt: string,
  candles: Candle[],
) {
  const messages = [prompt];
  for (let attempt = 0; attempt < 3; attempt++) {
    const reply = await ask(messages);
    try {
      return buildChartPipeline(reply as ChartConfig, candles); // ready-to-render props
    } catch (error) {
      messages.push(`That ChartConfig was rejected:\n${(error as Error).message}\nReturn a corrected ChartConfig.`);
    }
  }
  throw new Error('The model did not produce a valid ChartConfig in 3 attempts.');
}
```

## 4. Give the model the schema

The JSON Schema ships with the engine (and is installed with every renderer):

```ts nocheck
import schema from '@stacklatte/chart-engine/ChartConfig.schema.json' with { type: 'json' };

// OpenAI structured output
const response_format = { type: 'json_schema', json_schema: { name: 'ChartConfig', schema: schema.definitions.ChartConfig, strict: false } };

// Anthropic tool use
const tools = [{ name: 'show_chart', description: 'Configure the chart', input_schema: schema.definitions.ChartConfig }];
```

The schema uses `additionalProperties: false` throughout and encodes the closed enums and the numeric ranges, so providers that enforce JSON Schema will not even produce an out-of-enum value. Semantic rules a schema cannot express (unique overlay ids, `shadedAreas` referring to existing overlays) are still checked by `buildChartPipeline`.

## 5. Render the result

```tsx
import { SLChart, buildChartPipeline } from '@stacklatte/chart-web';
import type { Candle, ChartConfig } from '@stacklatte/chart-web';

export function ConfiguredChart({ config, candles }: { config: ChartConfig; candles: Candle[] }) {
  const props = buildChartPipeline(config, candles);
  return <SLChart {...props} width={800} height={480} />;
}
```

`buildChartPipeline` returns everything except `width` and `height`. The same call works with `@stacklatte/chart-native`, `@stacklatte/chart-angular` (bind the returned fields to the inputs) and `@stacklatte/chart-canvas`.

## Live example

The stacklatte.com tutorial lets you paste a config, see it compile or fail with the itemised error, and render it live.
