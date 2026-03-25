import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import MetaReportCard from '../components/relatorio/MetaReportCard.jsx';
import MetaReportExport from '../components/relatorio/MetaReportExport.jsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Target } from 'lucide-react';

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const ANOS = [2025, 2026, 2027];
const METAS = ['MC3A-20','MC3A-21','MC3A-22','MC3A-23','MC3A-24','MC3A-25','MC3A-EXTRA'];

function toNumberOrZero(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function RelatorioMetaInner() {
  const { user } = useCurrentUser();
  const [mesFiltro, setMesFiltro] = useState('todos');
  const [anoFiltro, setAnoFiltro] = useState('2026');

  const { data: atividades = [] } = useQuery({
    queryKey: ['activities-meta'],
    queryFn: () => base44.entities.Activity.list(),
  });

  const { data: compras = [] } = useQuery({
    queryKey: ['purchases-meta'],
    queryFn: () => base44.entities.PurchaseRequest.list(),
  });

  const { data: reports = [] } = useQuery({
    queryKey: ['reports-meta'],
    queryFn: () => base44.entities.Report.list(),
  });

  const { data: budgetLines = [] } = useQuery({
    queryKey: ['budget-lines'],
    queryFn: () => base44.entities.BudgetLine.list(),
  });

  const filteredReportIds = useMemo(() => {
    return new Set(
      reports
        .filter(r => {
          const mesOk = mesFiltro === 'todos' || r.mes_referencia === mesFiltro;
          const anoOk = !anoFiltro || String(r.ano) === anoFiltro;
          return mesOk && anoOk;
        })
        .map(r => r.id)
    );
  }, [reports, mesFiltro, anoFiltro]);

  const filteredActivities = useMemo(() => {
    if (mesFiltro === 'todos' && !anoFiltro) return atividades;
    return atividades.filter(a => filteredReportIds.has(a.report_id));
  }, [atividades, filteredReportIds, mesFiltro, anoFiltro]);

  const filteredPurchases = useMemo(() => {
    return compras.filter(c => {
      const report = reports.find(r => r.id === c.report_id);
      if (!report && c.report_id) return false;
      if (report) {
        const mesOk = mesFiltro === 'todos' || report.mes_referencia === mesFiltro;
        const anoOk = !anoFiltro || String(report.ano) === anoFiltro;
        return mesOk && anoOk;
      }
      return true;
    });
  }, [compras, reports, mesFiltro, anoFiltro]);

  const metaData = useMemo(() => {
    return METAS.map(meta => {
      const atividadesMeta = filteredActivities.filter(
        a => a.classificacao === 'META' && a.meta_codigo === meta
      );
      const comprasMeta = filteredPurchases.filter(c => c.meta_id === meta);

      const totalPublico = atividadesMeta.reduce((s, a) => {
        const publicoEstimado = toNumberOrZero(a.publico_estimado);
        const repeticoes = toNumberOrZero(a.quantas_repeticoes);
        return s + (publicoEstimado * repeticoes);
      }, 0);

      const totalOcorrencias = atividadesMeta.reduce((s, a) => {
        const repeticoes = toNumberOrZero(a.quantas_repeticoes);
        return s + repeticoes;
      }, 0);

      const totalSolicitado = comprasMeta.reduce((s, c) => s + (Number(c.valor_solicitado) || 0), 0);
      const totalAprovado = comprasMeta
        .filter(c => ['APROVADO_ADMIN','PAGO'].includes(c.status))
        .reduce((s, c) => s + (Number(c.valor_aprovado_admin || c.valor_solicitado) || 0), 0);
      const totalPago = comprasMeta
        .filter(c => c.status === 'PAGO')
        .reduce((s, c) => s + (Number(c.valor_aprovado_admin || c.valor_solicitado) || 0), 0);

      const museus = [...new Set(atividadesMeta.map(a => a.museu || '').filter(Boolean))];
      const statusMetas = atividadesMeta.map(a => a.status_meta).filter(Boolean);

      return {
        meta,
        atividades: atividadesMeta,
        compras: comprasMeta,
        totalPublico,
        totalOcorrencias,
        totalSolicitado,
        totalAprovado,
        totalPago,
        museus,
        statusMetas,
      };
    });
  }, [filteredActivities, filteredPurchases]);

  const totals = useMemo(() => ({
    atividades: metaData.reduce((s, m) => s + m.atividades.length, 0),
    publico: metaData.reduce((s, m) => s + m.totalPublico, 0),
    solicitado: metaData.reduce((s, m) => s + m.totalSolicitado, 0),
    aprovado: metaData.reduce((s, m) => s + m.totalAprovado, 0),
    pago: metaData.reduce((s, m) => s + m.totalPago, 0),
  }), [metaData]);

  const periodoLabel = mesFiltro === 'todos'
    ? `Ano ${anoFiltro || 'todos'}`
    : `${mesFiltro}/${anoFiltro}`;

  return (
    <div className="min-h-screen bg-white">
      <div className="w-full py-6 md:py-10">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-5 h-5 text-black" />
              <h1 className="text-2xl md:text-3xl font-semibold text-black tracking-tight">Relatório por Meta</h1>
            </div>
            <p className="text-gray-500 text-xs md:text-sm">
              Acompanhamento físico e financeiro consolidado por meta do 3º Aditivo
            </p>
          </div>
          <MetaReportExport
            metaData={metaData}
            totals={totals}
            periodoLabel={periodoLabel}
            budgetLines={budgetLines}
          />
        </div>

        <div className="flex flex-wrap gap-3 mb-8 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-600 whitespace-nowrap">Mês</Label>
            <Select value={mesFiltro} onValueChange={setMesFiltro}>
              <SelectTrigger className="w-36 text-sm bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meses</SelectItem>
                {MESES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-xs text-gray-600">Ano</Label>
            <Select value={anoFiltro} onValueChange={setAnoFiltro}>
              <SelectTrigger className="w-24 text-sm bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANOS.map(a => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Badge variant="outline" className="ml-auto self-center text-xs">
            {periodoLabel}
          </Badge>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-8">
          {[
            { label: 'Atividades / Meta', value: totals.atividades, color: 'text-blue-700' },
            { label: 'Público Total', value: totals.publico.toLocaleString('pt-BR'), color: 'text-green-700' },
            { label: 'Solicitado', value: `R$ ${totals.solicitado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, color: 'text-gray-700' },
            { label: 'Aprovado', value: `R$ ${totals.aprovado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, color: 'text-indigo-700' },
            { label: 'Pago', value: `R$ ${totals.pago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, color: 'text-emerald-700' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">{label}</p>
              <p className={`text-lg font-bold ${color}`}>{value}</p>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          {metaData.map(data => (
            <MetaReportCard key={data.meta} data={data} periodoLabel={periodoLabel} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function RelatorioMeta() {
  return <RequireAuth><RelatorioMetaInner /></RequireAuth>;
}
