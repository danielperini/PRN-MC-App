> base44-app@0.0.0 build
> vite build --mode production

✗ Build failed in 13.66s
error during build:
src/pages/RelatorioFisicoFinanceiro.jsx (2:7): "default" is not exported by "src/components/reports/RelatorioFisicoFinanceiroGenerator.jsx", imported by "src/pages/RelatorioFisicoFinanceiro.jsx".
file: /app/src/pages/RelatorioFisicoFinanceiro.jsx:2:7

1: import React from 'react';
2: import RelatorioFisicoFinanceiroGenerator from '@/components/reports/RelatorioFisicoFinanceiroGenerator';
          ^
3: 
4: export default function RelatorioFisicoFinanceiroPage() {

    at getRollupError (file:///app/node_modules/rollup/dist/es/shared/parseAst.js:402:41)
    at error (file:///app/node_modules/rollup/dist/es/shared/parseAst.js:398:42)
    at Module.error (file:///app/node_modules/rollup/dist/es/shared/node-entry.js:17040:16)
    at Module.traceVariable (file:///app/node_modules/rollup/dist/es/shared/node-entry.js:17452:29)
    at ModuleScope.findVariable (file:///app/node_modules/rollup/dist/es/shared/node-entry.js:15070:39)
    at FunctionScope.findVariable (file:///app/node_modules/rollup/dist/es/shared/node-entry.js:5673:38)
    at FunctionBodyScope.findVariable (file:///app/node_modules/rollup/dist/es/shared/node-entry.js:5673:38)
    at Identifier.bind (file:///app/node_modules/rollup/dist/es/shared/node-entry.js:5447:40)
    at CallExpression.bind (file:///app/node_modules/rollup/dist/es/shared/node-entry.js:2825:28)
    at CallExpression.bind (file:///app/node_modules/rollup/dist/es/shared/node-entry.js:12179:15)
