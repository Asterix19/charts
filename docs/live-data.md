# Live data

Charts update when you pass a new `data` array. Candles are re-normalised on every change (sorted, deduped, bad values dropped) in a single linear pass, so it is safe to update on every tick.

## The two kinds of update

A live feed does one of two things; both are handled by passing the new array:

1. **Mutate the forming candle** — the last candle's `close` / `high` / `low` / `volume` change while the interval is still open.
2. **Append a new candle** — the interval rolled over.

```tsx
import { SLChart } from '@stacklatte/chart-web';
import type { Candle } from '@stacklatte/chart-web';
import { useEffect, useState } from 'react';

export function LiveChart({ initial, url }: { initial: Candle[]; url: string }) {
  const [candles, setCandles] = useState(initial);

  useEffect(() => {
    const socket = new WebSocket(url);
    socket.onmessage = (event) => {
      const tick: Candle = JSON.parse(event.data); // { timestamp, open, high, low, close, volume }
      setCandles((prev) => {
        const last = prev[prev.length - 1];
        return last && last.timestamp === tick.timestamp
          ? [...prev.slice(0, -1), tick] // same interval: replace the forming candle
          : [...prev, tick]; // new interval: append
      });
    };
    return () => socket.close();
  }, [url]);

  return <SLChart data={candles} width={800} height={420} showOhlcHud />;
}
```

## Follow-live behaviour

While the user is looking at the newest candle, the chart keeps following new candles. As soon as they pan back in time it stops following, so reading history is never interrupted. To jump back to the newest candle, increment `scrollToLatestTrigger`:

```tsx
import { SLChart } from '@stacklatte/chart-web';
import type { Candle } from '@stacklatte/chart-web';
import { useState } from 'react';

export function WithNowButton({ candles }: { candles: Candle[] }) {
  const [trigger, setTrigger] = useState(0);
  return (
    <>
      <button onClick={() => setTrigger((n) => n + 1)}>Now</button>
      <SLChart data={candles} width={800} height={420} scrollToLatestTrigger={trigger} />
    </>
  );
}
```

## Keep the array bounded

The chart handles tens of thousands of candles (see [performance](./performance.md)), but a live feed that appends forever eventually uses a lot of memory. Cap what you keep — the repository's *Live Burst* scenario trims to 10,000 candles:

```ts
import type { Candle } from '@stacklatte/chart-engine';

export const append = (candles: Candle[], tick: Candle, max = 10_000): Candle[] => {
  const next = [...candles, tick];
  return next.length > max ? next.slice(next.length - max) : next;
};
```

## Tested under load

The *Live Feed* (a new candle every 2 s) and *Live Burst* (a tick every 100 ms, a new candle every fifth tick) scenarios run on every platform in CI and must keep the frame time under budget — see [Testing](./testing.md).
