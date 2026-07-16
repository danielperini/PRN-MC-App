import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/styles/theme-nuit.css'
import '@/styles/report-print-fixes.css'
import { installActivityGalleryPdfRouting } from '@/utils/installActivityGalleryPdfRouting'
import { installComprasDataNFFilter } from '@/utils/installComprasDataNFFilter'
import { installPdfDownloadGuard } from '@/utils/pdfDownloadGuard'

installActivityGalleryPdfRouting()
installComprasDataNFFilter()
installPdfDownloadGuard()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
