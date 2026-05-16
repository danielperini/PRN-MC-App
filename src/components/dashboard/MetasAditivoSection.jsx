import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';

const METAS = [
  { id: 'MC3A-20', label: 'Meta 20', descricao: 'Gestão e coordenação' },
  { id: 'MC3A-21', label: 'Meta 21', descricao: 'Atividades culturais' },
  { id: 'MC3A-22', label: 'Meta 22', descricao: 'Comunicação e visibilidade' },
  { id: 'MC3A-23', label: 'Meta 23', descricao: 'Manutenção e operação' },
  { id: 'MC3A-24', label: 'Meta 24', descricao: 'Formação e capacitação' },
  { id: 'MC3A-25', label: 'Meta 25', descricao: 'Acessibilidade' },
];

function formatCurrency(value) {
  if (!value && value !== 0) return 'R$ 0,00';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(value);
}

function ResumoCard({ meta, rubricas, solicitacoes }) {
  const rubricasMeta = rubricas.filter(r => r.meta === meta.id);
  const totalPrevisto = rubricasMeta.reduce((sum, r) => sum + (r.valor_rubrica || 0), 0);

  const solicitacoesMeta = solicitacoes.filter(s => s.meta_id === meta.id);
  const totalGasto = solicitacoesMeta
    .filter(s => ['APROVADO_ADMIN', 'PAGO'].includes(s.status))
    .reduce((sum, s) => sum + (s.valor_aprovado_admin || s.valor_solicitado || 0), 0);

  const saldo = totalPrevisto - totalGasto;
  const percentual = totalPrevisto > 0 ? Math.min((totalGasto / totalPrevisto) * 100, 100) : 0;

  return (
    <div className="rounded-2xl border border-black bg-black p-5 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-white/70">
        {meta.label}
      </div>
      <div className="mt-2 text-3xl font-bold text-white">
        {formatCurrency(totalGasto)}
      </div>
      <div className="mt-1 text-xs text-white/60">
        de {formatCurrency(totalPrevisto)} previstos
      </div>
      <div className="mt-3 h-1.5 w-full rounded-full bg-white/20">
        <div
          className="h-1.5 rounded-full bg-white"
          style={{ width: `${percentual}%` }}
        />
      </div>
      <div className="mt-1 text-right text-xs text-white/60">
        {percentual.toFixed(1)}% utilizado
      </div>
      <div className="mt-2 text-xs text-white/50">
        Saldo: {formatCurrency(saldo)}
      </div>
    </div>
  );
}

export default function MetasAditivoSection() {
  const [rubricas, setRubricas] = useState([]);
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [rubs, sols] = await Promise.all([
          base44.entities.Rubrica.filter({ ativo: true }),
          base44.entities.PurchaseRequest.list('-created_date', 500),
        ]);
        setRubricas(rubs || []);
        setSolicitacoes(sols || []);
      } catch (e) {
        console.error('Erro ao carregar MetasAditivoSection:', e);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {METAS.map(m => (
          <div key={m.id} className="rounded-2xl border border-neutral-200 bg-neutral-100 p-5 animate-pulse h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
        Metas do 3º Aditivo
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {METAS.map(meta => (
          <ResumoCard
            key={meta.id}
            meta={meta}
            rubricas={rubricas}
            solicitacoes={solicitacoes}
          />
        ))}
      </div>
    </div>
  );
}