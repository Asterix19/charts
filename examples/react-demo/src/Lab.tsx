import { SLChart } from '@stacklatte/chart-react';
import type { Candle } from '@stacklatte/chart-react';
import { LAB_GROUPS, createLab, labApply, labChartProps, labSelected, labSize, visibleCapabilities } from '@stacklatte/chart-engine/lab';
import type { LabCapability, LabModel, LabState } from '@stacklatte/chart-engine/lab';
import { DEMO_PACKAGES } from '@stacklatte/chart-examples';
import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import './Lab.css';

const PKG = DEMO_PACKAGES.react;

function useLab() {
  const model = useMemo(() => createLab(), []);
  useEffect(() => () => model.dispose(), [model]);
  const state = useSyncExternalStore(model.subscribe, model.getState);
  const data = useSyncExternalStore(model.subscribe, model.getChartData);
  return { model, state, data };
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ width: Math.round(e.contentRect.width), height: Math.round(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function Control({ cap, state, model }: { cap: LabCapability; state: LabState; model: LabModel }) {
  const c = cap.control;
  const id = `lab-${cap.id}`;
  if (c.kind === 'action') {
    return <button type="button" className="lab-action" data-testid={id} onClick={() => model.act(c.action)} title={cap.hint}>{cap.label}</button>;
  }
  const value = (state as unknown as Record<string, unknown>)[cap.id];
  return (
    <div className="lab-row" data-testid={id}>
      <div className="lab-label">
        <span>{cap.label}</span>
        {cap.hint && <small>{cap.hint}</small>}
      </div>
      {c.kind === 'bool' && (
        <button type="button" role="switch" aria-checked={Boolean(value)} aria-label={cap.label} data-testid={`${id}-switch`} className="lab-switch" onClick={() => labApply(model, cap.id, !value)}>
          <i />
        </button>
      )}
      {c.kind === 'enum' && (
        <div className="lab-seg" role="group" aria-label={cap.label}>
          {c.options.map((o) => (
            <button key={o.value} type="button" aria-pressed={labSelected(state, cap.id) === o.value} data-testid={`${id}-${o.value}`} onClick={() => labApply(model, cap.id, o.value)}>{o.label}</button>
          ))}
        </div>
      )}
      {c.kind === 'number' && (
        <div className="lab-num">
          <input type="range" min={c.min} max={c.max} step={c.step} value={Number(value)} aria-label={cap.label} data-testid={`${id}-range`} onChange={(e) => labApply(model, cap.id, Number(e.target.value))} />
          <output>{String(value)}</output>
        </div>
      )}
      {c.kind === 'color' && (
        <div className="lab-colors">
          {c.presets.map((p) => (
            <button key={p} type="button" className="lab-swatch" style={{ background: p }} aria-label={`${cap.label} ${p}`} aria-pressed={value === p} data-testid={`${id}-${p}`} onClick={() => labApply(model, cap.id, p)} />
          ))}
          <input type="color" value={String(value)} aria-label={`${cap.label} (custom)`} onChange={(e) => labApply(model, cap.id, e.target.value)} />
        </div>
      )}
    </div>
  );
}

export default function Lab() {
  const { model, state, data } = useLab();
  const [areaRef, area] = useElementSize<HTMLDivElement>();
  const [hovered, setHovered] = useState<Candle | null>(null);
  const [events, setEvents] = useState(0);
  const size = labSize(state.size, area);
  const props = useMemo(() => labChartProps(state, data), [state, data]);

  return (
    <div className="lab" style={{ ['--accent' as string]: PKG.accent }} data-testid="lab">
      <div className="lab-body">
        <div className="lab-stage">
          <div className="lab-chart" ref={areaRef}>
            {area.width > 0 && area.height > 0 && (
              <SLChart {...props} width={size.width} height={size.height} onCrosshairChange={(c) => { setHovered(c); setEvents((n) => n + 1); }} />
            )}
          </div>
          <div className="lab-status" data-testid="readout">
            {hovered
              ? <span>{new Date(hovered.timestamp).toLocaleString()} · O {hovered.open.toFixed(2)} · H {hovered.high.toFixed(2)} · L {hovered.low.toFixed(2)} · C {hovered.close.toFixed(2)}{hovered.volume != null ? ` · V ${hovered.volume}` : ''}</span>
              : <span>Hover the chart to inspect a candle</span>}
            <span className="lab-count" data-testid="candle-count">{data.length.toLocaleString()} candles · {events} crosshair events</span>
          </div>
        </div>
        <aside className="lab-panel" aria-label="Every capability">
          {visibleCapabilities(state).map(({ group, items }) => (
            <section key={group} data-testid={`lab-group-${group.toLowerCase().replace(/\W+/g, '-')}`}>
              <h2>{group}</h2>
              {items.map((cap) => <Control key={cap.id} cap={cap} state={state} model={model} />)}
            </section>
          ))}
          <p className="lab-foot">{LAB_GROUPS.length} groups · every <code>ChartProps</code> field has a control (enforced by a test).</p>
        </aside>
      </div>
    </div>
  );
}
