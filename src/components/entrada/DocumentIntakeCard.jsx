import React, { useState } from 'react';
import { FileText, Image, CheckCircle2, Clock, AlertCircle, Loader2, Eye, Send, ChevronDown } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';

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

const TIPO_OPTIONS = [
  { value: 'NOTA_FISCAL_PDF', label: 'Nota fiscal de fornecedor (PDF)' },
  { value: 'NOTA_FISCAL_XML', label: 'Nota fiscal XML' },
  { value: 'FOTO_ATIVIDADE', label: 'Foto de atividade' },
  { value: 'DOCUMENTO_ADMINISTRATIVO', label: 'Documento administrativo' },
  { value: 'OUTRO', label: 'Outro documento' },
];

const TIPO_LABEL = {
  FOTO_ATIVIDADE: 'Foto de Atividade',
  NOTA_FISCAL_PDF: 'Nota Fiscal PDF',
  NOTA_FISCAL_XML: 'Nota Fiscal XML',
  DOCUMENTO_ADMINISTRATIVO: 'Documento Administrativo',
  OUTRO: 'Outro',
  PENDENTE: 'Pendente',
};

export default function DocumentIntakeCard({ intake, onReview }) {
  const { toast } = useToast();
  const [reclassifying, setReclassifying] = useState(false);
  const [localTipo, setLocalTipo] = useState(intake.tipo_detectado);

  const status = STATUS_CONFIG[intake.status_processamento] || STATUS_CONFIG.ENVIADO;
  const Icon = status.icon;
  const isImage = localTipo === 'FOTO_ATIVIDADE';
  const podeRevisar = intake.status_processamento === 'AGUARDANDO_REVISAO' || intake.status_processamento === 'RASCUNHO';
  const isAnalisando = intake.status_processamento === 'ANALISANDO_IA' || intake.status_processamento === 'ENVIADO';
  const tipoIdentificado = localTipo && localTipo !== 'PENDENTE';

  async function handleReclassify(novoTipo) {
    if (novoTipo === localTipo) return;
    setReclassifying(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        tipo_detectado: novoTipo,
        status_processamento: 'AGUARDANDO_REVISAO',
        revisado_pelo_usuario: true,
      });
      setLocalTipo(novoTipo);
      toast({ title: 'Categoria atualizada com sucesso.' });
    } catch (e) {
      toast({ title: 'Erro ao reclassificar', description: e.message, variant: 'destructive' });
    } finally {
      setReclassifying(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white hover:shadow-sm transition-shadow space-y-3">
      <div className="flex items-start gap-4">
        <div className={cn(
          'w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0',
          isImage ? 'bg-purple-100' : 'bg-slate-100'
        )}>
          {isImage
            ? <Image className="w-6 h-6 text-purple-500" />
            : <FileText className="w-6 h-6 text-slate-400" />
          }
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate">
            {intake.file_name_final || intake.file_name_original}
          </p>
          <p className="text-xs text-slate-400 mb-2">
            {new Date(intake.created_date).toLocaleDateString('pt-BR', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })}
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

        <div className="flex-shrink-0">
          {podeRevisar && (
            <Button size="sm" onClick={() => onReview({ ...intake, tipo_detectado: localTipo })}>
              Revisar
            </Button>
          )}
          {isAnalisando && (
            <div className="flex items-center gap-1 text-xs text-yellow-600">
              <Loader2 className="w-4 h-4 animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Categoria identificada pela IA — visível após análise */}
      {tipoIdentificado && !isAnalisando && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Categoria identificada pela IA:</span>
            <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">
              {TIPO_LABEL[localTipo] || localTipo}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Confirmar ou alterar:</span>
            <div className="flex-1 max-w-[280px]">
              <Select
                value={localTipo}
                onValueChange={handleReclassify}
                disabled={reclassifying}
              >
                <SelectTrigger className="h-7 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPO_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value} className="text-xs">
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {reclassifying && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </div>

          {intake.rubrica_nome_sugerida && (
            <p className="text-xs text-slate-500">
              💡 Rubrica sugerida: <span className="font-medium text-slate-700">{intake.rubrica_nome_sugerida}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}