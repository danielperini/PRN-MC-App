import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import '@/styles/theme-nuit.css'
import '@/styles/report-print-fixes.css'
import { installActivityGalleryPdfRouting } from '@/utils/installActivityGalleryPdfRouting'
import { installComprasDataNFFilter } from '@/utils/installComprasDataNFFilter'
import { installMetasPlanoTrabalhoNFs } from '@/utils/installMetasPlanoTrabalhoNFs'
import { installRelatorioAtividadeMetaLink } from '@/utils/installRelatorioAtividadeMetaLink'
import { installCronogramaMetasOficial } from '@/utils/installCronogramaMetasOficial'
import { installRelatorioCamposOficiais } from '@/utils/installRelatorioCamposOficiais'
import { installRelatorioMetasSchemaFix } from '@/utils/installRelatorioMetasSchemaFix'
import { installRelatorioItens2a5 } from '@/utils/installRelatorioItens2a5'
import { installRelatorioConteudosOficiais } from '@/utils/installRelatorioConteudosOficiais'
import { installRelatorioGenerationWorkflow } from '@/utils/installRelatorioGenerationWorkflow'
import { installRelatorioPdfHeader } from '@/utils/installRelatorioPdfHeader'
import { installPdfDownloadGuard } from '@/utils/pdfDownloadGuard'

installActivityGalleryPdfRouting()
installComprasDataNFFilter()
installMetasPlanoTrabalhoNFs()
installRelatorioAtividadeMetaLink()
installCronogramaMetasOficial()
installRelatorioCamposOficiais()
installRelatorioMetasSchemaFix()
installRelatorioItens2a5()
installRelatorioConteudosOficiais()
installRelatorioGenerationWorkflow()
installRelatorioPdfHeader()
installPdfDownloadGuard()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)