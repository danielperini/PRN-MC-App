import React from 'react';
import { FileText, Image, CheckCircle2, Clock, AlertCircle, Loader2, Eye, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const STATUS_CONFIG = {
  ENVIADO: { label: 'Enviado', color: 'bg-blue-100 text-blue-700', icon: Clock },
  ANALISANDO_IA: { label: 'Analisando IA...', color: 'bg-yellow-100 text-yellow-700', icon: Loader2, spin: true },
  AGUARDANDO_REVISAO: { label: 'Aguardando revisão', color: 'bg-orange-100 text-orange-700', icon: Eye },
  RASCUNHO: { label: 'Rascunho', color: 'bg-slate-100 text-slate-600', icon: FileText },
  ENVIADO_APROVACAO: { label: 'Enviado para aprovação', color: 'bg-purple-100 text-purple-700', icon: Send },
  APROVADO: { label: 'Aprovado', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  REJEITADO: { label: 'Rejeitado', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  ERRO_PROCESSAMENTO: { label: 'Erro no processamento', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

const TIPO_LABEL = {
  FOTO_ATIVIDADE: 'Foto de Atividade',
  NOTA_FISCAL_PDF: 'Nota Fiscal PDF',
  NOTA_FISCAL_XML: 'Nota Fiscal XML',
  DOCUMENTO_ADMINISTRATIVO: 'Documento Administrativo',
  OUTRO: 'Outro',
  PENDENTE: 'Pendente',
};

export default function DocumentIntakeCard({ intake, onReview }) {
  const status = STATUS_CONFIG[intake.status_processamento] || STATUS_CONFIG.ENVIADO;
  const Icon = status.icon;
  const isImage = intake.tipo_detectado === 'FOTO_ATIVIDADE';
  const podeRevisar = intake.status_processamento === 'AGUARDANDO_REVISAO';
  const isAnalisando = intake.status_processamento === 'ANALISANDO_IA';

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white flex items-start gap-4 hover:shadow-sm transition-shadow">
      <div className={cn(
        'w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0',
        isImage ? 'bg-purple-100' : 'bg-slate-100'
      )}>
        {isImage ? <Image className="w-6 h-6 text-purple-500" /> : <FileText className="w-6 h-6 text-slate-400" />}
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">
          {intake.file_name_final || intake.file_name_original}
        </p>
        <p className="text-xs text-slate-400 mb-2">
          {TIPO_LABEL[intake.tipo_detectado] || 'Tipo desconhecido'} •{' '}
          {new Date(intake.created_date).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
        </p>

        <div className="flex items-center gap-2 flex-wrap">
          <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium', status.color)}>
            <Icon className={cn('w-3 h-3', status.spin && 'animate-spin')} />
            {status.label}
          </span>

          {intake.erros_validacao?.length > 0 && (
            <span className="text-xs text-red-500 flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {intake.erros_validacao.length} inconsistência(s)
            </span>
          )}
        </div>
      </div>

      {podeRevisar && (
        <Button size="sm" onClick={() => onReview(intake)} className="flex-shrink-0">
          Revisar
        </Button>
      )}
      {isAnalisando && (
        <div className="flex-shrink-0 flex items-center gap-1 text-xs text-yellow-600">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      )}
    </div>
  );
}