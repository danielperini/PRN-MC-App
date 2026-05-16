import React from 'react';
import RelatorioFisicoFinanceiroGenerator from '@/components/reports/RelatorioFisicoFinanceiroGenerator';

export default function RelatorioFisicoFinanceiroPage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-6xl mx-auto p-6">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-black mb-2 tracking-tight">
            Gerador de Relatório
          </h1>
          <p className="text-slate-600">
            Relatório editorial, programático, financeiro e de prestação de contas do Projeto Museus Centro.
          </p>
        </div>

        <RelatorioFisicoFinanceiroGenerator />

        <div className="mt-12 grid md:grid-cols-3 gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-lg mb-2 text-black">Dados reais do sistema</h3>
            <p className="text-sm text-slate-600">
              Consulta relatórios, atividades, agenda, programação, comunicação, compras, rubricas, notas fiscais, anexos e evidências já registrados no app.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-lg mb-2 text-black">Atividades por museu</h3>
            <p className="text-sm text-slate-600">
              Organiza as atividades por MIS, MHAB e MUMO, reproduzindo integralmente os textos das equipes e vinculando fotos quando existirem.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-lg mb-2 text-black">Metas do 3º Aditivo</h3>
            <p className="text-sm text-slate-600">
              Inclui capítulo próprio de metas, com execução, rubricas associadas, indicadores e análise institucional.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-lg mb-2 text-black">Galeria e evidências</h3>
            <p className="text-sm text-slate-600">
              Seleciona até duas fotos principais por atividade com imagem e lista os demais arquivos disponíveis como repositório de evidências.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-lg mb-2 text-black">Execução financeira</h3>
            <p className="text-sm text-slate-600">
              Usa rubricas, compras e prestação de contas para apresentar previsto, utilizado, saldo, percentuais e execução por grupo.
            </p>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
            <h3 className="font-bold text-lg mb-2 text-black">Capítulos editoriais</h3>
            <p className="text-sm text-slate-600">
              Estrutura capa, introdução, território, resumo, público, programação, comunicação, prestação de contas, Museu Centro APP e conclusão.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
