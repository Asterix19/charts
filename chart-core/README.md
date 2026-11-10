# `@stacklatte/chart-core` — renamed

This package is kept so existing installs keep working. It is now a thin re-export:

| You import | You get |
|---|---|
| `@stacklatte/chart-core` | everything from [`@stacklatte/chart-native`](../chart-native) (the React Native / Skia `SLChart` + engine) |
| `@stacklatte/chart-core/core` | everything from [`@stacklatte/chart-engine`](../chart-engine) (platform-agnostic logic) |

Nothing changes for you at runtime. For new code, install the package you actually need:

```sh
# React Native (iOS / Android)
npm install @stacklatte/chart-native @shopify/react-native-skia react-native-gesture-handler

# Web (Canvas 2D)
npm install @stacklatte/chart-web

# Just the math, config pipeline and JSON Schema (no renderer, no peers)
npm install @stacklatte/chart-engine
```

Migration is a find-and-replace of the import path — the exports are identical.

## Compatibility is tested

The contract tests in the repository download the published `@stacklatte/chart-core@2.3.3` and verify that every export still exists and that the engine produces identical numbers (see [Testing](../docs/testing.md)). Migration guide: [migrating from chart-core](../docs/migrating-from-chart-core.md).
