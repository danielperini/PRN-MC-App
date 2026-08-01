import React, { useMemo } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import RubricaEditRow from '@/components/rubricas/RubricaEditRow';

function toNumber(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v ?? 0);
}

function normalizeCentro(value) {
  const raw = String(value || '').trim();
  const up = raw.toUpperCase();
  if (up === 'MIS BH' || up === 'MIS') return 'MIS';
  if (up === 'MHAB' || up === 'MAB') return 'MHAB';
  if (up === 'MUMO' || up === 'MUMU') return 'MUMO';
  const low = raw.toLowerCase();
  if (low.includes('noturno') && (low.includes('pampulha') || low.includes('4'))) return 'NOTURNO_PAMPULHA';
  if (low.includes('noturno')) return 'NOTURNO_CENTRO';
  if (up.includes('GERAL') || up.includes('TRANSVERSAL')) return 'GERAL/TRANSVERSAL';
  if (up.includes('COORDENA')) return 'COORDENAÇÃO';
  if (up.includes('COMUNICA')) return 'COMUNICAÇÃO';
  if (up.includes('EDUC')) return 'EDUCAÇÃO';
  if (up.includes('PROD')) return 'PRODUÇÃO';
  if (up.includes('ADMIN') || up.includes('FINANC')) return 'ADMINISTRATIVO-FINANCEIRO';
  if (up.includes('PUBLICA')) return 'PUBLICAÇÕES';
  if (up.includes('CONSULT')) return 'CONSULTORIAS';
  if (up.includes('DESPESA')) return 'DESPESAS GERAIS';
  return up;
}

const MUSEU_CANONICAL = {
  'MHAB': 'MHAB', 'MIS': 'MIS', 'MUMO': 'MUMO',
  'Noturno 2026': 'NOTURNO_CENTRO', 'Noturno Pampulha': 'NOTURNO_PAMPULHA',
  'Monitores': 'MONITORES',
};

/**
 * Sheet lateral de edição de rubricas para os cards de museu da grade.
 * Props:
 *   museu           — nome do centro (ex: 'MHAB', 'MIS', 'MUMO', 'Noturno 2026')
 *   rubricas        — lista completa de Rubrica[] da página pai
 *   compras         — lista de PurchaseRequest aprovadas da página pai
 *   open            — boolean
 *   onClose         — função
 *   isCoordenador   — boolean
 *   totais          — { totalOrcado, totalUtilizado, totalSaldo }
 */
export default function MuseuRubricasDrawer({ museu, rubricas, compras, open, onClose, isCoordenador, totais }) {
  const canonical = MUSEU_CANONICAL[museu] || normalizeCentro(museu);

  const rubricasDoCentro = useMemo(() => {
    if (!museu) return [];
    return (rubricas || []).filter(r => {
      const rc = normalizeCentro(r?.centro_custo || '');
      return rc === canonical;
    });
  }, [rubricas, museu, canonical]);

  const comprasUtilizadas = useMemo(() => {
    const STATUS_APROVADOS = new Set(['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
    const mapa = {};
    for (const c of (compras || [])) {
      if (!c.rubrica_id) continue;
      if (!STATUS_APROVADOS.has(String(c.status || '').toUpperCase())) continue;
      const val = toNumber(c.valor_pago || c.valor_aprovado_admin || c.valor_aprovado || c.valor_solicitado);
      mapa[c.rubrica_id] = (mapa[c.rubrica_id] || 0) + val;
    }
    return mapa;
  }, [compras]);

  if (!museu) return null;

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[500px] p-0 flex flex-col overflow-hidden">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
          <SheetTitle className="text-base font-bold text-gray-900">{museu} — Rubricas</SheetTitle>
          {totais && (
            <div className="flex gap-4 mt-1 text-sm flex-wrap">
              <span className="text-gray-500">Previsto: <strong className="text-gray-900">{fmtBRL(totais.totalOrcado)}</strong></span>
              <span className="text-gray-500">Utilizado: <strong className="text-gray-900">{fmtBRL(totais.totalUtilizado)}</strong></span>
              <span className={totais.totalSaldo < 0 ? 'text-red-600' : 'text-green-700'}>
                Saldo: <strong>{fmtBRL(totais.totalSaldo)}</strong>
              </span>
            </div>
          )}
          <p className="text-xs text-gray-400">{rubricasDoCentro.length} rubrica(s){isCoordenador ? ' — clique no lápis para editar' : ''}</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {rubricasDoCentro.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma rubrica encontrada para {museu}.</p>
          ) : (
            rubricasDoCentro.map(r => (
              <RubricaEditRow
                key={r.id}
                rubrica={r}
                utilizado={comprasUtilizadas[r.id]}
                isCoordenador={isCoordenador}
                queryKeysToInvalidate={['rubricas-banco', 'compras-aprovadas-resumo', 'rubricas-centros-transversais']}
                accentColor="blue"
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}