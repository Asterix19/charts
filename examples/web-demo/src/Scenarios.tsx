import { SLChart } from '@stacklatte/chart-web';
import {
  SCENARIOS,
  getScenario,
  installProbe,
  reportAttributes,
  scenarioHash,
  scenarioIdFromHash,
} from '@stacklatte/chart-examples';
import React, { useEffect, useMemo, useRef, useState } from 'react';

import './Scenarios.css';

/** One scenario from the shared catalogue, rendered with the React renderer (@stacklatte/chart-web). */
export default function Scenarios() {
  const [id, setId] = useState(() => scenarioIdFromHash(location.hash) ?? SCENARIOS[0].id);
  useEffect(() => {
    const onHash = () => setId(scenarioIdFromHash(location.hash) ?? SCENARIOS[0].id);
    window.addEventListener('hashchange', onHash);
    installProbe();
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return <ScenarioView key={id} id={id} />;
}

function ScenarioView({ id }: { id: string }) {
  const scenario = useMemo(() => getScenario(id), [id]);
  const startedAt = useRef(performance.now());
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [data, setData] = useState(() => scenario.data());
  const [ticks, setTicks] = useState(0);
  const [mountMs, setMountMs] = useState(0);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Mount time = first render → first painted frame.
  useEffect(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => setMountMs(performance.now() - startedAt.current)));
  }, []);

  useEffect(() => {
    if (!scenario.live) return;
    let tick = 0;
    const timer = setInterval(() => {
      tick += 1;
      setData((prev) => scenario.live!.next(prev, tick));
      setTicks(tick);
    }, scenario.live.tickMs);
    return () => clearInterval(timer);
  }, [scenario]);

  const props = useMemo(() => scenario.props(data), [scenario, data]);
  const stats = reportAttributes({ scenario: id, candles: data.length, mountMs, ticks });

  return (
    <div className="sc">
      <nav className="sc-tabs" data-testid="tabs">
        {SCENARIOS.map((s) => (
          <a key={s.id} href={scenarioHash(s.id)} data-testid={`tab-${s.id}`} className={`sc-tab sc-${s.kind}${s.id === id ? ' on' : ''}`}>
            {s.title}
          </a>
        ))}
      </nav>
      <h2 data-testid="title">{scenario.title}</h2>
      <p data-testid="description">{scenario.description}</p>
      <div ref={hostRef} className="sc-host" data-testid="chart-host">
        {width > 0 && <SLChart data={data} width={width} height={scenario.height} {...props} />}
      </div>
      <div className="sc-stats" data-testid="stats" {...stats}>
        {data.length.toLocaleString()} candles · mount {mountMs.toFixed(0)} ms{scenario.live ? ` · ${ticks} ticks` : ''}
      </div>
    </div>
  );
}
