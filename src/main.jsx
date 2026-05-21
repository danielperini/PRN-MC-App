import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/styles/theme-nuit.css'
import '@/styles/report-print-fixes.css'
import '@/utils/safeIndexedDbPreviewStorage.js'
import '@/utils/reportPdfHardLayoutFix'

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
