import React from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileText, ChevronRight } from 'lucide-react';

const STATUS_CONFIG = {
  DRAFT:     { label: 'Rascunho',   bg: 'bg-gray-100', text: 'text-gray-700' },
  SUBMITTED: { label: 'Enviado',    bg: 'bg-blue-100', text: 'text-blue-700' },
  IN_REVIEW: { label: 'Em Revisão', bg: 'bg-amber-100', text: 'text-amber-700' },
  RETURNED:  { label: 'Devolvido',  bg: 'bg-red-100', text: 'text-red-700' },
  APPROVED:  { label: 'Aprovado',   bg: 'bg-green-100', text: 'text-green-700' },
  ARCHIVED:  { label: 'Arquivado',  bg: 'bg-purple-100', text: 'text-purple-700' },
};

export default function RecentReportsCard({ reports = [] }) {
  if (reports.length === 0) {
    return (
      <div className="p-8 text-center border border-dashed border-gray-200 rounded-2xl">
        <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
        <p className="text-gray-500 font-medium">Nenhum relatório ainda</p>
        <p className="text-sm text-gray-400 mt-1">Comece criando seu primeiro relatório</p>
        <Link to={createPageUrl('ReportEditor?novo=1')}>
          <Button variant="outline" className="mt-4 border-black text-black hover:bg-black hover:text-white">
            Criar Relatório
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {reports.map(report => {
        const cfg = STATUS_CONFIG[report.status] || STATUS_CONFIG.DRAFT;
        const atividades = Array.isArray(report.atividades) ? report.atividades : [];
        const publico = atividades.reduce((sum, a) => {
          const repeticoes = a.quantas_repeticoes || 1;
          const est = a.publico_estimado || 0;
          return sum + (est * repeticoes);
        }, 0);
        
        return (
          <Link key={report.id} to={createPageUrl(`ReportEditor?id=${report.id}`)} className="block group">
            <div className="p-4 border border-gray-100 rounded-xl hover:border-gray-300 hover:shadow-md transition-all bg-white">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-black">
                  {report.mes_referencia} / {report.ano}
                </h3>
                <Badge className={`${cfg.bg} ${cfg.text} font-normal`}>
                  {cfg.label}
                </Badge>
              </div>
              <p className="text-sm text-gray-600 mb-3">{report.museu}</p>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>{atividades.length} atividade(s) • {publico.toLocaleString('pt-BR')} pessoa(s)</span>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 transition-colors" />
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
