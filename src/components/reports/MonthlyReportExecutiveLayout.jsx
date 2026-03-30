import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle2, TrendingUp, Users, Activity } from 'lucide-react';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const STATUS_CONFIG = {
  DRAFT: { label: 'Rascunho', color: 'bg-slate-100 text-slate-700' },
  SUBMITTED: { label: 'Enviado', color: 'bg-blue-100 text-blue-700' },
  IN_REVIEW: { label: 'Em Revisão', color: 'bg-amber-100 text-amber-700' },
  RETURNED: { label: 'Devolvido', color: 'bg-red-100 text-red-700' },
  APPROVED: { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
  ARCHIVED: { label: 'Arquivado', color: 'bg-gray-100 text-gray-700' },
};

export default function MonthlyReportExecutiveLayout({ report = {} }) {
  const mes = MESES[parseInt(report.mes_referencia) - 1] || report.mes_referencia;
  const ano = report.ano || 2026;
  const statusConfig = STATUS_CONFIG[report.status] || STATUS_CONFIG.DRAFT;

  // Calcular métricas
  const atividades = Array.isArray(report.atividades) ? report.atividades : [];
  const totalAtividades = atividades.length;
  const totalPublico = atividades.reduce((sum, a) => sum + (parseInt(a.publico_estimado) || 0) * (parseInt(a.quantas_vezes_ocorreu) || 1), 0);
  const metasAtivididades = atividades.filter(a => a.classificacao === 'META').length;

  return (
    <div className="max-w-4xl mx-auto space-y-6 py-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white rounded-xl p-8 space-y-4">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-4xl font-bold">{mes}/{ano}</h1>
            <p className="text-slate-300 text-lg mt-1">Relatório Mensal</p>
          </div>
          <Badge className={`${statusConfig.color} px-4 py-2 text-sm font-semibold`}>
            {statusConfig.label}
          </Badge>
        </div>

        <div className="border-t border-slate-700 pt-4 space-y-2">
          <p className="text-base"><span className="font-semibold">Profissional:</span> {report.author_name}</p>
          <p className="text-base"><span className="font-semibold">Função:</span> {report.funcao}</p>
          <p className="text-base"><span className="font-semibold">Museu:</span> {report.museu}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 font-medium">Atividades Executadas</span>
            <Activity className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{totalAtividades}</p>
          <p className="text-xs text-gray-500">{metasAtivididades} são metas</p>
        </Card>

        <Card className="p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 font-medium">Público Total</span>
            <Users className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900">{totalPublico.toLocaleString('pt-BR')}</p>
          <p className="text-xs text-gray-500">pessoas alcançadas</p>
        </Card>

        <Card className="p-6 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 font-medium">Taxa de Conclusão</span>
            <TrendingUp className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-slate-900">100%</p>
          <p className="text-xs text-gray-500">planejado vs executado</p>
        </Card>
      </div>

      {/* Resumo Executivo */}
      {report.resumo_executivo && (
        <Card className="p-6 space-y-3">
          <h2 className="text-lg font-bold text-slate-900">Resumo Executivo</h2>
          <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">
            {report.resumo_executivo}
          </p>
        </Card>
      )}

      {/* Atividades */}
      {atividades.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-bold text-slate-900">Atividades Realizadas</h2>
          <div className="space-y-3">
            {atividades.map((atividade, idx) => (
              <Card key={idx} className="p-4 border-l-4 border-l-blue-500">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-semibold text-slate-900">{atividade.nome}</h3>
                      <Badge variant="outline" className="text-xs">
                        {atividade.classificacao || 'ROTINA'}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600 mb-2">{atividade.descricao}</p>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-gray-600">
                      <div>
                        <span className="font-medium">Local:</span> {atividade.museu || '—'}
                      </div>
                      <div>
                        <span className="font-medium">Tipo:</span> {atividade.tipo_acao || '—'}
                      </div>
                      <div>
                        <span className="font-medium">Público:</span> {atividade.publico_estimado || 0} × {atividade.quantas_vezes_ocorreu || 1}
                      </div>
                      <div>
                        <span className="font-medium">Produtos:</span> {atividade.quantidade_produtos || 0}
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Avaliação e Observações */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {report.avaliacao_pontos_positivos && (
          <Card className="p-6 space-y-3 border-l-4 border-l-green-500">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-600" />
              <h3 className="font-bold text-slate-900">Pontos Positivos</h3>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {report.avaliacao_pontos_positivos}
            </p>
          </Card>
        )}

        {report.avaliacao_desafios && (
          <Card className="p-6 space-y-3 border-l-4 border-l-amber-500">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <h3 className="font-bold text-slate-900">Desafios</h3>
            </div>
            <p className="text-sm text-gray-700 whitespace-pre-wrap">
              {report.avaliacao_desafios}
            </p>
          </Card>
        )}
      </div>

      {report.avaliacao_sugestoes && (
        <Card className="p-6 space-y-3">
          <h3 className="font-bold text-slate-900">Sugestões de Melhoria</h3>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">
            {report.avaliacao_sugestoes}
          </p>
        </Card>
      )}

      {/* Rodapé */}
      <div className="border-t pt-4 text-xs text-gray-500 space-y-1">
        <p>Relatório gerado em {new Date().toLocaleDateString('pt-BR')}</p>
        <p>Protocolo: {report.numero_protocolo || '—'}</p>
      </div>
    </div>
  );
}