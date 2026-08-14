import { AlertTriangle } from 'lucide-react';

export default function MigrationReconciliationAlert() {
  return (
    <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950" role="status">
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden="true" />
        <div>
          <p className="font-semibold">Dados financeiros em processo de conciliação</p>
          <p className="mt-1 text-sm">
            O acervo documental foi migrado, mas não há movimentações bancárias nem fonte estruturada do 4º Aditivo.
            Valores de execução, saldo e percentuais financeiros não devem ser usados como posição contábil final.
            Consulte Administração do Sistema → Gestão de Pendências de Migração.
          </p>
        </div>
      </div>
    </div>
  );
}
