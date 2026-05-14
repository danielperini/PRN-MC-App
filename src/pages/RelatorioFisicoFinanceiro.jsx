import React from 'react';
import RelatorioFisicoFinanceiroGenerator from '@/components/reports/RelatorioFisicoFinanceiroGenerator';

export default function RelatorioFisicoFinanceiroPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Relatório Físico-Financeiro
          </h1>
          <p className="text-slate-600">
            Geração automática e inteligente do relatório consolidado do Projeto Museus Centro
          </p>
        </div>

        <RelatorioFisicoFinanceiroGenerator />

        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-bold text-lg mb-2">📊 Dados Reais</h3>
            <p className="text-sm text-slate-600">
              Consulta automaticamente relatórios aprovados, atividades, agenda, programação, releases, comunicação, compras, notas fiscais e documentação.
            </p>
          </div>

          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-bold text-lg mb-2">🎨 Análise Visual</h3>
            <p className="text-sm text-slate-600">
              IA analisa imagens para identificar atividades, público, contexto e dinâmica cultural. Sem duplicidade fotográfica.
            </p>
          </div>

          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-bold text-lg mb-2">💾 Backup Automático</h3>
            <p className="text-sm text-slate-600">
              Exportação em PDF com armazenamento automático no Google Drive, organizado por ano/mês/museu.
            </p>
          </div>

          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-bold text-lg mb-2">✍️ Textos Editoriais</h3>
            <p className="text-sm text-slate-600">
              Geração de narrativas sofisticadas, institucionais e curatoriais usando IA nativa do Base44.
            </p>
          </div>

          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-bold text-lg mb-2">🔍 Auditável</h3>
            <p className="text-sm text-slate-600">
              Cada dado referencia sua fonte (relatório, atividade, release, agenda, imagem). Hash de integridade.
            </p>
          </div>

          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-bold text-lg mb-2">📋 21 Seções</h3>
            <p className="text-sm text-slate-600">
              Capa, introdução, painel executivo, atividades, agenda, comunicação, fotos, financeiro, rubricas, compras, equipe, prestação de contas e muito mais.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}