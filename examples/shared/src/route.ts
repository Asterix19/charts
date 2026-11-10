import { SCENARIOS } from './scenarios';

/** Every web demo uses the same URL shape: `/#/scenarios/<id>`. */
export const scenarioHash = (id: string) => `#/scenarios/${id}`;

/** The scenario id in a location hash, or null when the hash is not a scenario route. */
export function scenarioIdFromHash(hash: string): string | null {
  const m = /^#\/scenarios\/([a-z0-9-]+)$/.exec(hash);
  return m && SCENARIOS.some((s) => s.id === m[1]) ? m[1] : null;
}

export const isScenarioRoute = (hash: string) => hash.startsWith('#/scenarios');
