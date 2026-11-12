/**
 * SLChart (web) — the React component for @stacklatte/chart-react.
 *
 * A thin wrapper: all drawing, gestures, the crosshair, the OHLC / indicator HUD and the marker tooltip live in
 * `ChartController` (`@stacklatte/chart-engine/canvas`), the same renderer the Angular component uses, so both web
 * renderers draw identically. This component only owns the host element and forwards props.
 *
 * It paints synchronously on every prop change (layout effect), exactly as it always has; pointer and wheel input
 * is coalesced to one repaint per animation frame inside the controller.
 */
import type { ChartProps } from '@stacklatte/chart-engine';
import { ChartController } from '@stacklatte/chart-engine/canvas';
import React, { useLayoutEffect, useRef } from 'react';

const SLChart: React.FC<ChartProps> = (props) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const controllerRef = useRef<ChartController | null>(null);

  // Create once; paint immediately so the first commit already shows the chart.
  useLayoutEffect(() => {
    const controller = new ChartController(hostRef.current!, props);
    controller.flush();
    controllerRef.current = controller;
    return () => {
      controller.destroy();
      controllerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the controller is created once; later props go through update()
  }, []);

  // After every render: hand over the latest props and paint.
  useLayoutEffect(() => {
    controllerRef.current?.update(props);
    controllerRef.current?.flush();
  });

  return <div ref={hostRef} style={{ width: props.width, height: props.height }} />;
};

export default SLChart;
