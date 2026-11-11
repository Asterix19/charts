import { buildChartPipeline as buildStrict, validateChartConfig as validateStrict } from '@stacklatte/chart-engine';

export * from '@stacklatte/chart-engine';

/** Lenient by default for backwards compatibility with chart-core 2.x. Pass `{ strict: true }` for strict validation. */
export const buildChartPipeline: typeof buildStrict = (config, data, options) => buildStrict(config, data, { strict: false, ...options });

/** Lenient by default for backwards compatibility with chart-core 2.x. Pass `{ strict: true }` for strict validation. */
export const validateChartConfig: typeof validateStrict = (config, options) => validateStrict(config, { strict: false, ...options });
