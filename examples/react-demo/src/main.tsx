import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { isScenarioRoute } from '@stacklatte/chart-examples';

import Banner from './Banner';
import Lab from './Lab';
import './Lab.css';
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
      <div className="demo-root">
        <Banner route={scenarios ? 'scenarios' : 'lab'} />
        <div className="demo-content">{scenarios ? <Scenarios /> : <Lab />}</div>
      </div>
    </>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
