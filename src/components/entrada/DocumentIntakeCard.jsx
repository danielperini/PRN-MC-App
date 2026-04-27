import React, { useState, useEffect } from 'react';
import { FileText, Image, CheckCircle2, Clock, AlertCircle, Loader2, Eye, Send, FolderOpen, RefreshCw, X } from 'lucide-react';
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

const DESTINO_LABEL = {
  PurchaseRequest: { label: 'Compras', path: '/Compras' },
  TeamPayment: { label: 'Pagamentos da Equipe', path: '/GestaoPagamentos' },
  Attachment: { label: 'Documentos / Arquivos', path: '/GestorArquivos' },
  Activity: { label: 'Atividade', path: '/NovaAtividade' },
  Programacao: { label: 'Programação', path: '/Agenda' },
};

export default function DocumentIntakeCard({ intake, onReview }) {
  const { toast } = useToast();
  const [localTipo, setLocalTipo] = useState(intake.tipo_detectado);
  const [loading, setLoading] = useState(false);

  // Sincronizar quando intake muda
  useEffect(() => {
    setLocalTipo(intake.tipo_detectado);
  }, [intake.id, intake.tipo_detectado]);

  const status = STATUS_CONFIG[intake.status_processamento] || STATUS_CONFIG.ENVIADO;
  const Icon = status.icon;
  const isImage = localTipo === 'FOTO_ATIVIDADE';

  // Estados condicionais simplificados
  const isProcessing = intake.status_processamento === 'ANALISANDO_IA' || intake.status_processamento === 'ENVIADO';
  const canReview = intake.status_processamento === 'AGUARDANDO_REVISAO' || intake.status_processamento === 'RASCUNHO';
  const hasError = intake.status_processamento === 'ERRO_PROCESSAMENTO';
  const hasType = localTipo && localTipo !== 'PENDENTE';
  const isNF = localTipo === 'NOTA_FISCAL_PDF' || localTipo === 'NOTA_FISCAL_XML';
  const canDelete = !['ENVIADO_APROVACAO', 'APROVADO', 'REJEITADO', 'VINCULADO'].includes(intake.status_processamento) && intake.grupo_status !== 'VINCULADO' && intake.grupo_status !== 'ENVIADO_APROVACAO';

  const destinoInfo = intake.entidade_destino && intake.entidade_destino !== 'Attachment'
    ? DESTINO_LABEL[intake.entidade_destino]
    : null;

  // Filtrar erros relevantes (remover datas futuras já passadas)
  const relevantErrors = (intake.erros_validacao || []).filter(e => {
    const txt = String(e).toLowerCase();
    if (txt.includes('futura') || txt.includes('future')) {
      const match = txt.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (match) {
        const dataDoc = new Date(`${match[3]}-${match[2]}-${match[1]}`);
        if (dataDoc <= new Date()) return false;
      }
    }
    return true;
  });

  async function handleClassification(novoTipo) {
    if (novoTipo === localTipo) return;
    setLoading(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        tipo_detectado: novoTipo,
        status_processamento: 'AGUARDANDO_REVISAO',
        revisado_pelo_usuario: true,
      });
      setLocalTipo(novoTipo);
      toast({ title: 'Categoria atualizada com sucesso.' });
    } catch (e) {
      toast({ title: 'Erro ao atualizar categoria', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function handleReanalyse() {
    setLoading(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ENVIADO',
        erros_validacao: [],
      });
      await base44.functions.invoke('classifyAndRouteDocument', { intake_id: intake.id });
      toast({ title: 'Documento reenviado para análise.' });
    } catch (e) {
      toast({ title: 'Erro ao reenviar', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    const statusProtegidos = ['ENVIADO_APROVACAO', 'APROVADO', 'REJEITADO', 'VINCULADO'];
    if (statusProtegidos.includes(intake.status_processamento) || intake.grupo_status === 'VINCULADO' || intake.grupo_status === 'ENVIADO_APROVACAO') {
      toast({
        title: 'Não é possível deletar',
        description: 'Este arquivo já está vinculado a um processo e não pode ser excluído.',
        variant: 'destructive'
      });
      return;
    }

    if (!window.confirm('Tem certeza que deseja deletar este arquivo? Esta ação não pode ser desfeita.')) return;
    setLoading(true);
    try {
      // Deleta o attachment vinculado
      if (intake.entidade_destino_id) {
        try {
          await base44.entities.Attachment.delete(intake.entidade_destino_id);
        } catch (e) {
          console.warn('Erro ao deletar attachment:', e.message);
        }
      }
      
      // Marca DocumentIntake como removido
      await base44.entities.DocumentIntake.update(intake.id, {
        status_registro: 'REMOVIDO'
      });
      toast({ title: 'Arquivo removido com sucesso.' });
    } catch (e) {
      toast({ title: 'Erro ao deletar', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white hover:shadow-sm transition-shadow space-y-3">
      {/* Header com ícone, nome, data e status */}
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

            {relevantErrors.length > 0 && (
              <span className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                {relevantErrors.length} inconsistência(s)
              </span>
            )}
          </div>
        </div>

        {/* Botões de ação à direita */}
        <div className="flex-shrink-0 flex items-center gap-1">
          {canReview && (
            <Button size="sm" onClick={() => onReview({ ...intake, tipo_detectado: localTipo })}>
              Revisar
            </Button>
          )}
          {hasError && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleReanalyse}
              disabled={loading}
              className="text-xs h-7"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Reanalisar
            </Button>
          )}
          {canDelete && (
            <Button
              size="sm"
              variant="destructive"
              onClick={handleDelete}
              disabled={loading}
              className="h-7 w-7 p-0"
              title="Deletar arquivo"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
            </Button>
          )}
        </div>
      </div>

      {/* Seção: Classificação da IA + Reclassificação */}
      {hasType && !isProcessing && (
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
                onValueChange={handleClassification}
                disabled={loading}
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
            {loading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" />}
          </div>

          {intake.rubrica_nome_sugerida && (
            <p className="text-xs text-slate-500">
              💡 Rubrica sugerida: <span className="font-medium text-slate-700">{intake.rubrica_nome_sugerida}</span>
            </p>
          )}
        </div>
      )}

      {/* Seção: Agrupamento PDF+XML */}
      {isNF && intake.grupo_status && (
        <div className="border-t border-slate-100 pt-3">
          {intake.grupo_status === 'COMPLETO' ? (
            <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 px-2 py-1.5 rounded">
              <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
              <span>PDF e XML associados — pronto para processar</span>
            </div>
          ) : intake.grupo_status === 'INCOMPLETO' ? (
            <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-2 py-1.5 rounded">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
              <span>Envie PDF + XML da mesma nota para completar</span>
            </div>
          ) : null}
        </div>
      )}

      {/* Seção: Destino do documento */}
      {destinoInfo && (
        <div className="border-t border-slate-100 pt-3 flex items-center gap-2">
          <FolderOpen className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
          <span className="text-xs text-slate-500">Disponível em:</span>
          <a
            href={destinoInfo.path}
            className="text-xs font-semibold text-green-700 hover:underline"
          >
            {destinoInfo.label}
          </a>
        </div>
      )}

      {/* Seção: Erro na análise — permite reclassificação manual */}
      {hasError && (
        <div className="border-t border-slate-100 pt-3 space-y-2">
          <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>Arquivo salvo, mas ocorreu erro na análise. Classifique manualmente para vincular à área correta.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Classificar como:</span>
            <div className="flex-1 max-w-[280px]">
              <Select value={localTipo} onValueChange={handleClassification} disabled={loading}>
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
          </div>
        </div>
      )}
    </div>
  );
}