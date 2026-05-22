import RequireCoordinator from '@/components/auth/RequireCoordinator';
import RelatorioFisicoFinanceiroGenerator from '@/components/reports/RelatorioFisicoFinanceiroGenerator';
import '@/utils/reportFinalPolishRuntime.js';

export default function RelatorioFisicoFinanceiroPage() {
  return (
    <RequireCoordinator>
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-6xl p-6">
          <div className="mb-8">
            <h1 className="mb-2 text-4xl font-bold tracking-tight text-black">
              Gerador de Relatorio
            </h1>
            <p className="text-slate-600">
              Relatorio editorial, programatico, financeiro e de prestacao de contas do Projeto Museus Centro.
            </p>
          </div>

          <RelatorioFisicoFinanceiroGenerator />

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-2 text-lg font-bold text-black">Dados reais do sistema</h3>
              <p className="text-sm text-slate-600">
                Consulta relatorios, atividades, agenda, programacao, comunicacao, compras,
                rubricas, notas fiscais, anexos e evidencias ja registrados no app.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-2 text-lg font-bold text-black">Atividades por museu</h3>
              <p className="text-sm text-slate-600">
                Organiza as atividades por MIS, MHAB e MUMO, reproduzindo integralmente os
                textos das equipes e vinculando fotos quando existirem.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-2 text-lg font-bold text-black">Metas do 3o Aditivo</h3>
              <p className="text-sm text-slate-600">
                Inclui capitulo proprio de metas, com execucao, rubricas associadas,
                indicadores e analise institucional.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-2 text-lg font-bold text-black">Galeria e evidencias</h3>
              <p className="text-sm text-slate-600">
                Seleciona ate duas fotos principais por atividade com imagem e lista os
                demais arquivos disponiveis como repositorio de evidencias.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-2 text-lg font-bold text-black">Execucao financeira</h3>
              <p className="text-sm text-slate-600">
                Usa rubricas, compras e prestacao de contas para apresentar previsto,
                utilizado, saldo, percentuais e execucao por grupo.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-2 text-lg font-bold text-black">Capitulos editoriais</h3>
              <p className="text-sm text-slate-600">
                Estrutura capa, introducao, territorio, resumo, publico, programacao,
                comunicacao, prestacao de contas, Museu Centro APP e conclusao.
              </p>
            </div>
          </div>
        </div>
      </div>
    </RequireCoordinator>
  );
}
