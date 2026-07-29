import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, AlertCircle, TrendingUp, CheckCircle2, Clock } from 'lucide-react';

function fmtBRL(v) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setMonth(d.getMonth() + months);
  return d;
}

function fmtMesAno(date) {
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}

function parseVencimento(mesAnoStr) {
  // Tenta parsear "julho de 2026", "2026-07-01", etc.
  if (!mesAnoStr) return null;
  // ISO date
  if (/^\d{4}-\d{2}/.test(mesAnoStr)) return new Date(mesAnoStr + (mesAnoStr.length === 7 ? '-01' : '') + 'T12:00:00');
  // "julho de 2026" ou "julho 2026"
  const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  const lower = mesAnoStr.toLowerCase();
  const mesIdx = meses.findIndex(m => lower.includes(m));
  const anoMatch = lower.match(/\d{4}/);
  if (mesIdx >= 0 && anoMatch) return new Date(Number(anoMatch[0]), mesIdx, 1, 12);
  return null;
}

function gerarCronograma(member) {
  if (Array.isArray(member.cronograma_parcelas) && member.cronograma_parcelas.length > 0) {
    return member.cronograma_parcelas.map((p, i) => ({
      numero: p.numero ?? i + 1,
      total: member.cronograma_parcelas.length,
      mesAno: p.vencimento || '',
      valor: Number(p.valor || member.contrato_valor_parcela || 0),
      purchase_request_id: p.purchase_request_id || null,
      comprovante_url: p.comprovante_url || null,
    }));
  }

  const inicio = member.data_inicio_contrato || member.inicio_vinculo_referencia;
  const numParcelas = Number(member.contrato_num_parcelas || member.numero_parcelas || 0);
  const valorParcela = Number(member.contrato_valor_parcela || member.valor_parcela || 0);

  if (!inicio || !numParcelas || !valorParcela) return null;

  return Array.from({ length: numParcelas }, (_, i) => {
    const date = addMonths(inicio, i);
    return {
      numero: i + 1,
      total: numParcelas,
      mesAno: fmtMesAno(date),
      valor: valorParcela,
      purchase_request_id: null,
      comprovante_url: null,
    };
  });
}

function StatusBadge({ pago, atrasado }) {
  if (pago) return <Badge className="bg-green-100 text-green-800 border-green-200 font-medium">Recebido</Badge>;
  if (atrasado) return <Badge className="bg-red-100 text-red-700 border-red-200 font-medium">Atrasado</Badge>;
  return <Badge className="bg-gray-100 text-gray-600 border-gray-200 font-medium">A receber</Badge>;
}

function SummaryCard({ icon: Icon, label, value, colorClass }) {
  return (
    <div className={`rounded-xl border p-4 flex items-center gap-3 ${colorClass}`}>
      <div className="flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </div>
    </div>
  );
}

export default function TabelaPagamentosContrato({ targetEmail }) {
  const { data: members = [] } = useQuery({
    queryKey: ['team-member-pagamentos', targetEmail],
    queryFn: () => base44.entities.TeamMember.filter({ user_email: targetEmail }),
    enabled: !!targetEmail,
    staleTime: 60000,
  });

  const member = members[0] || null;

  const { data: teamPayments = [] } = useQuery({
    queryKey: ['team-payments-pagamentos', targetEmail],
    queryFn: () => base44.entities.TeamPayment.filter({ user_email: targetEmail }, '-created_date', 100),
    enabled: !!targetEmail,
    staleTime: 60000,
  });

  if (!member) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
        <AlertCircle className="w-4 h-4" />
        Nenhum vínculo contratual encontrado.
      </div>
    );
  }

  const cronograma = gerarCronograma(member);

  if (!cronograma) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold">Dados de contrato incompletos</p>
          <p className="text-xs mt-1">
            Para exibir o cronograma de pagamentos, preencha em "Espaço do Usuário": Data de início do contrato,
            número de parcelas e valor por parcela.
          </p>
        </div>
      </div>
    );
  }

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Calcula linhas com status e acumulado
  let acumulado = 0;
  const linhas = cronograma.map(parcela => {
    const mesAnoLower = (parcela.mesAno || '').toLowerCase();
    const pago = teamPayments.find(tp => {
      const comp = (tp.competencia || tp.mes_referencia || '').toLowerCase();
      const st = String(tp.status || '').toUpperCase();
      const isAprovado = ['PAGO', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN'].includes(st);
      if (!isAprovado) return false;
      return comp && mesAnoLower && (comp.includes(mesAnoLower.split(' ')[0]) || mesAnoLower.includes(comp.split(' ')[0]));
    });

    const vencDate = parseVencimento(parcela.mesAno);
    const atrasado = !pago && vencDate && vencDate < hoje;

    acumulado += parcela.valor;

    return {
      ...parcela,
      pago,
      atrasado,
      acumulado,
      comprovanteUrl: pago?.comprovante_url || pago?.comprovante_pagamento_url || parcela.comprovante_url || '',
    };
  });

  const totalContrato = linhas.reduce((sum, l) => sum + l.valor, 0);
  const totalRecebido = linhas.filter(l => l.pago).reduce((sum, l) => sum + l.valor, 0);
  const totalAReceber = totalContrato - totalRecebido;

  return (
    <div className="space-y-5">
      {/* Info do contrato */}
      {(member.data_inicio_contrato || member.data_fim_contrato || member.contrato_num_parcelas) && (
        <div className="flex flex-wrap gap-3 text-sm">
          {member.data_inicio_contrato && (
            <span className="text-muted-foreground">Início: <strong>{new Date(member.data_inicio_contrato + 'T12:00:00').toLocaleDateString('pt-BR')}</strong></span>
          )}
          {member.data_fim_contrato && (
            <span className="text-muted-foreground">Término: <strong>{new Date(member.data_fim_contrato + 'T12:00:00').toLocaleDateString('pt-BR')}</strong></span>
          )}
          {member.contrato_num_parcelas && (
            <span className="text-muted-foreground">Parcelas: <strong>{member.contrato_num_parcelas}</strong></span>
          )}
        </div>
      )}

      {/* Cards de resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <SummaryCard
          icon={TrendingUp}
          label="Valor Total do Contrato"
          value={fmtBRL(totalContrato)}
          colorClass="border-slate-200 bg-slate-50 text-slate-700"
        />
        <SummaryCard
          icon={CheckCircle2}
          label="Total Recebido"
          value={fmtBRL(totalRecebido)}
          colorClass="border-green-200 bg-green-50 text-green-800"
        />
        <SummaryCard
          icon={Clock}
          label="Saldo a Receber"
          value={fmtBRL(totalAReceber)}
          colorClass="border-amber-200 bg-amber-50 text-amber-800"
        />
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-border">
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Parcela</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Mês/Ano</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Valor</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">Acumulado</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700 whitespace-nowrap">Status</th>
                <th className="px-4 py-3 whitespace-nowrap"></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((linha, i) => (
                <tr
                  key={i}
                  className={`border-b border-border last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
                >
                  <td className="px-4 py-3 text-gray-700 whitespace-nowrap font-medium">
                    {linha.numero}/{linha.total}
                  </td>
                  <td className="px-4 py-3 text-gray-700 capitalize">{linha.mesAno}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{fmtBRL(linha.valor)}</td>
                  <td className="px-4 py-3 text-right text-gray-400 whitespace-nowrap text-xs">{fmtBRL(linha.acumulado)}</td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    <StatusBadge pago={!!linha.pago} atrasado={linha.atrasado} />
                  </td>
                  <td className="px-4 py-3 text-center whitespace-nowrap">
                    {linha.comprovanteUrl && (
                      <a href={linha.comprovanteUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <ExternalLink className="w-3 h-3" /> Comprovante
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-slate-50 border-t-2 border-border font-bold">
                <td colSpan={2} className="px-4 py-3 text-gray-900">Total do Contrato</td>
                <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">{fmtBRL(totalContrato)}</td>
                <td className="px-4 py-3"></td>
                <td colSpan={2} className="px-4 py-3 text-center">
                  <span className="text-green-700 mr-3 text-xs">{fmtBRL(totalRecebido)} recebido</span>
                  <span className="text-amber-700 text-xs">{fmtBRL(totalAReceber)} a receber</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}