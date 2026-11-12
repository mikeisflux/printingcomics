import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import UnderConstruction from './pages/UnderConstruction';

const holdingPageHosts = new Set(['philbopod.com', 'www.philbopod.com']);
const showHoldingPage = holdingPageHosts.has(window.location.hostname.toLowerCase());

ReactDOM.createRoot(document.getElementById('root')).render(
  showHoldingPage ? <UnderConstruction /> : <App />
);
