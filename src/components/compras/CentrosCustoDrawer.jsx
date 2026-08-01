import React, { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import RubricaEditRow from '@/components/rubricas/RubricaEditRow';

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v ?? 0);
}

export default function CentrosCustoDrawer({ centro, rubricas, compras, open, onClose, isCoordenador = true }) {
  const rubricasDoCentro = useMemo(() => {
    if (!centro) return [];
    return rubricas.filter(r => {
      const c = String(r.centro_custo || '').trim().toUpperCase();
      return c === centro.centro.toUpperCase() ||
        c.includes(centro.centro.substring(0, 5).toUpperCase());
    });
  }, [centro, rubricas]);

  const comprasUtilizadas = useMemo(() => {
    const STATUS_APROVADOS = new Set(['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
    const mapa = {};
    for (const c of compras) {
      if (!c.rubrica_id) continue;
      if (!STATUS_APROVADOS.has(String(c.status || '').toUpperCase())) continue;
      const val = toNumber(c.valor_pago || c.valor_aprovado_admin || c.valor_aprovado || c.valor_solicitado);
      mapa[c.rubrica_id] = (mapa[c.rubrica_id] || 0) + val;
    }
    return mapa;
  }, [compras]);

  if (!centro) return null;

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 flex flex-col overflow-hidden">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
          <SheetTitle className="text-base font-bold text-gray-900">{centro.centro}</SheetTitle>
          <div className="flex gap-4 mt-1 text-sm">
            <span className="text-gray-500">Previsto: <strong className="text-gray-900">{fmtBRL(centro.totalOrcado)}</strong></span>
            <span className={centro.totalSaldo < 0 ? 'text-red-600' : 'text-green-700'}>
              Saldo: <strong>{fmtBRL(centro.totalSaldo)}</strong>
            </span>
          </div>
          <p className="text-xs text-gray-400">{rubricasDoCentro.length} rubrica(s){isCoordenador ? ' — clique no lápis para editar' : ''}</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {rubricasDoCentro.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma rubrica encontrada neste centro.</p>
          ) : (
            rubricasDoCentro.map(r => (
              <RubricaEditRow
                key={r.id}
                rubrica={r}
                utilizado={comprasUtilizadas[r.id]}
                isCoordenador={isCoordenador}
                queryKeysToInvalidate={['rubricas-centros-transversais', 'compras-aprovadas-centros']}
                accentColor="blue"
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}