import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, AlertCircle } from 'lucide-react';

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

// Gera cronograma a partir dos dados do membro
function gerarCronograma(member) {
  // Prioridade: campo cronograma_parcelas preenchido
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

  // Fallback: gera a partir de data_inicio_contrato + num_parcelas + valor_parcela
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
            Para exibir o cronograma de pagamentos, preencha em "Meu Perfil": Data de início do contrato,
            número de parcelas e valor por parcela.
          </p>
        </div>
      </div>
    );
  }

  // Mapa de pagamentos por competência para cruzamento
  const pagamentosPorCompetencia = {};
  for (const tp of teamPayments) {
    const comp = (tp.competencia || tp.mes_referencia || '').toLowerCase().trim();
    if (comp) pagamentosPorCompetencia[comp] = tp;
  }

  // Determina status de cada parcela
  const linhas = cronograma.map(parcela => {
    const mesAnoLower = (parcela.mesAno || '').toLowerCase();
    const pago = teamPayments.find(tp => {
      const comp = (tp.competencia || tp.mes_referencia || '').toLowerCase();
      const st = String(tp.status || '').toUpperCase();
      const isAprovado = ['PAGO', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN'].includes(st);
      if (!isAprovado) return false;
      return comp && mesAnoLower && (comp.includes(mesAnoLower.split(' ')[0]) || mesAnoLower.includes(comp.split(' ')[0]));
    });
    return { ...parcela, pago, comprovanteUrl: pago?.comprovante_url || pago?.comprovante_pagamento_url || parcela.comprovante_url || '' };
  });

  const totalRecebido = linhas.filter(l => l.pago).reduce((sum, l) => sum + l.valor, 0);
  const totalAReceber = linhas.filter(l => !l.pago).reduce((sum, l) => sum + l.valor, 0);

  return (
    <div className="space-y-4">
      {/* Info do contrato */}
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

      {/* Tabela */}
      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-border">
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Parcela</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-700">Mês/Ano</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-700">Valor</th>
              <th className="text-center px-4 py-3 font-semibold text-gray-700">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((linha, i) => (
              <tr
                key={i}
                className={`border-b border-border last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}`}
              >
                <td className="px-4 py-3 text-gray-700">
                  {linha.numero}/{linha.total}
                </td>
                <td className="px-4 py-3 text-gray-700 capitalize">{linha.mesAno}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900">{fmtBRL(linha.valor)}</td>
                <td className="px-4 py-3 text-center">
                  {linha.pago ? (
                    <Badge className="bg-green-100 text-green-800 border-green-200 font-medium">Recebido</Badge>
                  ) : (
                    <Badge className="bg-gray-100 text-gray-600 border-gray-200 font-medium">A receber</Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-center">
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
              <td colSpan={2} className="px-4 py-3 text-gray-900">Total</td>
              <td className="px-4 py-3 text-right text-gray-900">{fmtBRL(totalRecebido + totalAReceber)}</td>
              <td colSpan={2} className="px-4 py-3 text-center">
                <span className="text-green-700 mr-3">{fmtBRL(totalRecebido)} recebido</span>
                <span className="text-gray-500">{fmtBRL(totalAReceber)} a receber</span>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}