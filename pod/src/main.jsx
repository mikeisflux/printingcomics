import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import UnderConstruction from './pages/UnderConstruction.jsx'
import './index.css'

const holdingPageHosts = new Set(['philbopod.com', 'www.philbopod.com'])
const showHoldingPage = holdingPageHosts.has(window.location.hostname.toLowerCase())

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {showHoldingPage ? <UnderConstruction /> : <App />}
  </React.StrictMode>,
)
