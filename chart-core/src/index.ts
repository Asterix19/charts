// @stacklatte/chart-core is kept so existing installs keep working.
// New code should depend on @stacklatte/chart-native (React Native renderer)
// or @stacklatte/chart-engine (platform-agnostic logic) directly.
import { buildChartPipeline as buildStrict, validateChartConfig as validateStrict } from '@stacklatte/chart-engine';

export * from '@stacklatte/chart-native';

/**
 * Legacy behaviour: `chart-core` 2.x never rejected out-of-enum values, unknown keys or wrongly-typed scalars in a
 * `ChartConfig`, so upgrading this package must not start throwing for configs that used to render. Pass
 * `{ strict: true }` — or import from `@stacklatte/chart-native` / `@stacklatte/chart-engine` — for strict validation.
 */
export const buildChartPipeline: typeof buildStrict = (config, data, options) => buildStrict(config, data, { strict: false, ...options });

/** Lenient by default for backwards compatibility; see {@link buildChartPipeline}. */
export const validateChartConfig: typeof validateStrict = (config, options) => validateStrict(config, { strict: false, ...options });
