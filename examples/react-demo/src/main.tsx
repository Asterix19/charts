import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { isScenarioRoute } from '@stacklatte/chart-examples';

import App from './App';
import Scenarios from './Scenarios';
import './index.css';

function Root() {
  const [scenarios, setScenarios] = useState(() => isScenarioRoute(location.hash));
  useEffect(() => {
    const onHash = () => setScenarios(isScenarioRoute(location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return (
    <>
      <div style={{ padding: '8px 16px', fontSize: 12, fontFamily: 'system-ui, sans-serif' }}>
        <a href="#/" style={{ marginRight: 12, color: scenarios ? '#9ca3af' : '#60a5fa' }}>Playground</a>
        <a href="#/scenarios/basic" data-testid="nav-scenarios" style={{ color: scenarios ? '#60a5fa' : '#9ca3af' }}>Scenarios</a>
      </div>
      {scenarios ? <Scenarios /> : <App />}
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
