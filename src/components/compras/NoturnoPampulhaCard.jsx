import React, { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { ExternalLink } from 'lucide-react';

const DRIVE_PASTA_NFS = 'https://drive.google.com/drive/u/0/folders/1Ov9ci6Dwg297mm7QiqX1wfLIb92EZSGf';

function toNumber(v) {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v ?? 0);
}

// Valores de centro_custo aceitos na entidade para o Noturno Pampulha
const PAMPULHA_CENTROS = ['Noturno Pampulha', 'Noturno nos Museus Pampulha'];

export default function NoturnoPampulhaCard() {
  const queryClient = useQueryClient();

  const { data: rubricas = [], isLoading } = useQuery({
    queryKey: ['rubricas-pampulha-4aditivo'],
    queryFn: async () => {
      // Busca pelas duas variações possíveis de nome do centro de custo
      const results = await Promise.all(
        PAMPULHA_CENTROS.map(cc =>
          base44.entities.Rubrica.filter({ centro_custo: cc, ativo: true })
        )
      );
      // Deduplica por id
      const seen = new Set();
      return results.flat().filter(r => {
        if (seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
      });
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });

  // Reatividade: invalidar ao mudar rubricas ou compras
  useEffect(() => {
    const unsub = base44.entities.Rubrica.subscribe(() => {
      queryClient.invalidateQueries({ queryKey: ['rubricas-pampulha-4aditivo'] });
    });
    return unsub;
  }, [queryClient]);

  const totalPrevisto = rubricas.reduce((acc, r) => acc + toNumber(r.valor_rubrica || r.valor_total), 0);
  const totalUtilizado = rubricas.reduce((acc, r) => acc + toNumber(r.valor_utilizado), 0);
  const saldo = totalPrevisto - totalUtilizado;
  const pct = totalPrevisto > 0 ? (totalUtilizado / totalPrevisto) * 100 : 0;
  const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-violet-600';

  return (
    <div className="rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-violet-50 border-b border-violet-100 px-5 py-4 flex items-center justify-between gap-3">
        <div>
          <span className="inline-block rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 mb-1">
            4º Aditivo
          </span>
          <h2 className="text-lg font-bold text-gray-900 leading-tight">Noturno Pampulha</h2>
          <p className="text-xs text-gray-500 mt-0.5">Museus da Pampulha — Noturno nos Museus Ed. 2026</p>
        </div>
        <a
          href={DRIVE_PASTA_NFS}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Pasta Drive NFs
        </a>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 divide-x divide-gray-100 border-b border-gray-100">
        <div className="px-4 py-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">Total Previsto</p>
          <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{isLoading ? '...' : fmtBRL(totalPrevisto)}</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">Utilizado</p>
          <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{isLoading ? '...' : fmtBRL(totalUtilizado)}</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">Saldo</p>
          <p className={`text-xl font-bold mt-1 tabular-nums ${saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {isLoading ? '...' : fmtBRL(saldo)}
          </p>
        </div>
      </div>

      {/* Barra de execução */}
      <div className="px-5 py-3 border-b border-gray-50">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span>Percentual de execução</span>
          <span className="font-bold text-gray-700">{pct.toFixed(1)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div
            className={`h-2 rounded-full transition-all ${barColor}`}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      </div>

      {/* Lista de rubricas */}
      <div className="px-5 py-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
          Rubricas vinculadas ({rubricas.length})
        </p>
        {isLoading ? (
          <p className="text-xs text-gray-400">Carregando...</p>
        ) : rubricas.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhuma rubrica cadastrada.</p>
        ) : (
          <div className="space-y-2">
            {rubricas.map((r) => {
              const prev = toNumber(r.valor_rubrica || r.valor_total);
              const util = toNumber(r.valor_utilizado);
              const saldoR = prev - util;
              const pctR = prev > 0 ? (util / prev) * 100 : 0;
              return (
                <div key={r.id} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <p className="text-xs font-medium text-gray-800 flex-1">{r.rubrica || r.nome}</p>
                    <span className={`text-xs font-bold tabular-nums shrink-0 ${saldoR < 0 ? 'text-red-600' : 'text-gray-700'}`}>
                      {fmtBRL(saldoR)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                    <span>Prev: {fmtBRL(prev)}</span>
                    <span>Util: {fmtBRL(util)}</span>
                    <span>{pctR.toFixed(0)}%</span>
                  </div>
                  <div className="h-1 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-1 rounded-full ${pctR > 90 ? 'bg-red-500' : 'bg-violet-500'}`}
                      style={{ width: `${Math.min(pctR, 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}