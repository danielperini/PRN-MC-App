import RequireCoordinator from '@/components/auth/RequireCoordinator';
import RelatorioFisicoFinanceiroGenerator from '@/components/reports/RelatorioFisicoFinanceiroGenerator';
import ReportDeliveryFormatsPanel from '@/components/reports/ReportDeliveryFormatsPanel';
import '@/utils/reportFinalPolishRuntime.js';

export default function RelatorioFisicoFinanceiroPage() {
  return (
    <RequireCoordinator>
      <div className="min-h-screen bg-white">
        <div className="mx-auto max-w-7xl p-6">
          <div className="mb-8 rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-6 shadow-sm md:p-8">
            <p className="mb-3 text-xs font-bold uppercase tracking-[0.22em] text-slate-500">
              Museus Centro APP
            </p>
            <h1 className="mb-3 text-4xl font-bold tracking-tight text-black md:text-5xl">
              Gerador de Relatórios
            </h1>
            <p className="max-w-4xl text-base leading-7 text-slate-600">
              Relatório editorial, físico-financeiro, galeria de evidências, atividades,
              público, metas, documentos fiscais e volumes em PDF do Projeto Museus Centro.
              A geração usa dados reais do app e preserva rastreabilidade institucional.
            </p>
          </div>

          <ReportDeliveryFormatsPanel />

          <RelatorioFisicoFinanceiroGenerator />

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-2 text-lg font-bold text-black">Dados reais do sistema</h3>
              <p className="text-sm leading-6 text-slate-600">
                Consulta relatórios, atividades, agenda, programação, comunicação, compras,
                rubricas, notas fiscais, anexos, galeria e evidências já registrados no app.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-2 text-lg font-bold text-black">Filtros por museu e período</h3>
              <p className="text-sm leading-6 text-slate-600">
                Permite gerar relatórios para todos os museus ou recortes por MIS, MHAB e MUMO,
                respeitando data inicial, data final e capítulos selecionados.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-2 text-lg font-bold text-black">Volumes editoriais em PDF</h3>
              <p className="text-sm leading-6 text-slate-600">
                Mantém exportação por Volume 1, Volume 2 e Volume 3, com lógica de capítulos,
                prévia HTML e numeração contínua informada pelo usuário.
              </p>
            </div>
          </div>
        </div>
      </div>
    </RequireCoordinator>
  );
}
