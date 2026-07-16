import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/styles/theme-nuit.css'
import '@/styles/report-print-fixes.css'
import { installActivityGalleryPdfRouting } from '@/utils/installActivityGalleryPdfRouting'
import { installComprasDataNFFilter } from '@/utils/installComprasDataNFFilter'
import { installComprasMetaColumn } from '@/utils/installComprasMetaColumn'
import { installMetasPlanoTrabalhoNFs } from '@/utils/installMetasPlanoTrabalhoNFs'
import { installCronogramaMetasOficial } from '@/utils/installCronogramaMetasOficial'
import { installRelatorioCamposOficiais } from '@/utils/installRelatorioCamposOficiais'
import { installRelatorioMetasSchemaFix } from '@/utils/installRelatorioMetasSchemaFix'
import { installPdfDownloadGuard } from '@/utils/pdfDownloadGuard'

installActivityGalleryPdfRouting()
installComprasDataNFFilter()
installComprasMetaColumn()
installMetasPlanoTrabalhoNFs()
installCronogramaMetasOficial()
installRelatorioCamposOficiais()
installRelatorioMetasSchemaFix()
installPdfDownloadGuard()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)
