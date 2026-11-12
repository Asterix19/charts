# `@stacklatte/chart-web` — renamed to `@stacklatte/chart-react`

The React chart was renamed because "web" was ambiguous (it is React-only; Angular has its own package). This package is kept so existing installs keep working: it is now a thin re-export of [`@stacklatte/chart-react`](../chart-react), with identical exports.

Nothing changes at runtime. For new code, install the package under its new name:

```sh
npm install @stacklatte/chart-react
```

Migration is a find-and-replace of the import path — the exports are identical:

```tsx
// before
import { SLChart, calcEMA } from '@stacklatte/chart-web';

// after
import { SLChart, calcEMA } from '@stacklatte/chart-react';
```

Guides: [React / Next.js](../docs/react.md) · [Migrating](../docs/migrating-from-chart-core.md).
