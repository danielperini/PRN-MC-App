import RequireCoordinator from '@/components/auth/RequireCoordinator';
import ReportCardGeneratorDashboard from '@/components/reports/ReportCardGeneratorDashboard';
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
              Escolha diretamente o tipo de relatório desejado. Cada card reseta a geração anterior,
              consolida dados reais do app e abre a prévia correspondente para exportação em PDF com foto de capa.
            </p>
          </div>

          <ReportCardGeneratorDashboard />

          <div className="mt-12 grid gap-6 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-2 text-lg font-bold text-black">Geração por card</h3>
              <p className="text-sm leading-6 text-slate-600">
                O botão único foi substituído por cards de geração direta: geral, editorial,
                físico-financeiro, galeria, museu, atividade, período, fotos, GPS, público, metas e documentos fiscais.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-2 text-lg font-bold text-black">Reset antes de gerar</h3>
              <p className="text-sm leading-6 text-slate-600">
                Antes de cada nova geração, o app limpa prévias anteriores, cache local, sessionStorage,
                localStorage e IndexedDB para evitar PDF antigo ou HTML reaproveitado indevidamente.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="mb-2 text-lg font-bold text-black">PDF com foto de capa</h3>
              <p className="text-sm leading-6 text-slate-600">
                O HTML gerado recebe uma camada de capa editorial com foto quando há imagem disponível nos dados,
                preservando o layout A4 e a rastreabilidade visual das evidências.
              </p>
            </div>
          </div>
        </div>
      </div>
    </RequireCoordinator>
  );
}
