import base44 from "@base44/vite-plugin"
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { fileURLToPath, URL } from 'node:url'

function corrigirImportRelatorioExecucao() {
  return {
    name: 'corrigir-import-relatorio-execucao',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replace(/\\/g, '/').endsWith('/src/pages/RelatorioExecucaoObjeto.jsx')) return null

      const corrigido = code.replace(
        /from\s+['"]@\/utils\/sincronizarRelatorioExecucao(?:\.js)?['"]/g,
        "from '@/utils/sincronizarRelatorioExecucaoCompat.js'"
      )

      return corrigido === code ? null : { code: corrigido, map: null }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error',
  resolve: {
    alias: [
      {
        find: /^@\/utils\/sincronizarRelatorioExecucao(?:\.js)?$/,
        replacement: fileURLToPath(new URL('./src/utils/sincronizarRelatorioExecucaoCompat.js', import.meta.url)),
      },
    ],
  },
  plugins: [
    corrigirImportRelatorioExecucao(),
    base44({
      legacySDKImports: process.env.BASE44_LEGACY_SDK_IMPORTS === 'true',
      hmrNotifier: true,
      navigationNotifier: true,
      analyticsTracker: true,
      visualEditAgent: true
    }),
    react(),
  ]
});