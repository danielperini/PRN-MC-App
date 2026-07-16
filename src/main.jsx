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
import { installCronogramaMetasDadosReais } from '@/utils/installCronogramaMetasDadosReais'
import { installRelatorioCamposOficiais } from '@/utils/installRelatorioCamposOficiais'
import { installRelatorioMetasSchemaFix } from '@/utils/installRelatorioMetasSchemaFix'
import { installRelatorioItens2a5 } from '@/utils/installRelatorioItens2a5'
import { installRelatorioConteudosOficiais } from '@/utils/installRelatorioConteudosOficiais'
import { installRelatorioGenerationWorkflow } from '@/utils/installRelatorioGenerationWorkflow'
import { installRelatorioPdfHeader } from '@/utils/installRelatorioPdfHeader'
import { installRelatorioExecucaoSafeEntities } from '@/utils/installRelatorioExecucaoSafeEntities'
import { installRelatorioTabelasEstruturadas } from '@/utils/installRelatorioTabelasEstruturadas'
import { installRelatorioFinanceAuditContext } from '@/utils/installRelatorioFinanceAuditContext'
import { installRelatorioExecucaoActivityEvidence } from '@/utils/installRelatorioExecucaoActivityEvidence'
import { installRelatoriosAtividadesCompletos } from '@/utils/installRelatoriosAtividadesCompletos'
import { installRelatorioExecucaoFinalizacao } from '@/utils/installRelatorioExecucaoFinalizacao'
import { installRelatorioMetasAditivosSnapshot } from '@/utils/installRelatorioMetasAditivosSnapshot'
import { installRuntimeErrorGuards } from '@/utils/installRuntimeErrorGuards'
import { installPdfDownloadGuard } from '@/utils/pdfDownloadGuard'

installRuntimeErrorGuards()
installActivityGalleryPdfRouting()
installComprasDataNFFilter()
installMetasPlanoTrabalhoNFs()
installRelatorioAtividadeMetaLink()
installCronogramaMetasOficial()
installCronogramaMetasDadosReais()
installRelatorioCamposOficiais()
installRelatorioMetasSchemaFix()
installRelatorioItens2a5()
installRelatorioConteudosOficiais()
installRelatorioGenerationWorkflow()
installRelatorioPdfHeader()
installRelatorioExecucaoSafeEntities()
installRelatorioTabelasEstruturadas()
installRelatorioFinanceAuditContext()
installRelatorioExecucaoActivityEvidence()
installRelatoriosAtividadesCompletos()
installRelatorioExecucaoFinalizacao()
installRelatorioMetasAditivosSnapshot()
installPdfDownloadGuard()

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)