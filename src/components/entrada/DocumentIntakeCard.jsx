import React, { useState } from 'react';
import {
  FileText, Image, CheckCircle2, Clock, AlertCircle, Loader2,
  Eye, Send, RefreshCw, X, Download, ExternalLink
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const STATUS_CONFIG = {
  ENVIADO:            { label: 'Enviado',              color: 'bg-blue-100 text-blue-700',    icon: Clock },
  ANALISANDO_IA:      { label: 'Analisando...',        color: 'bg-yellow-100 text-yellow-700', icon: Loader2, spin: true },
  AGUARDANDO_REVISAO: { label: 'Aguardando revisão',   color: 'bg-orange-100 text-orange-700', icon: Eye },
  RASCUNHO:           { label: 'Rascunho',             color: 'bg-slate-100 text-slate-600',   icon: FileText },
  ENVIADO_APROVACAO:  { label: 'Enviado p/ aprovação', color: 'bg-purple-100 text-purple-700', icon: Send },
  APROVADO:           { label: 'Aprovado',             color: 'bg-green-100 text-green-700',   icon: CheckCircle2 },
  REJEITADO:          { label: 'Rejeitado',            color: 'bg-red-100 text-red-700',       icon: AlertCircle },
  ERRO_PROCESSAMENTO: { label: 'Erro',                 color: 'bg-red-100 text-red-700',       icon: AlertCircle },
};

const TIPO_LABEL = {
  NOTA_FISCAL_PDF:         'NF PDF',
  NOTA_FISCAL_XML:         'NF XML',
  FOTO_ATIVIDADE:          'Foto',
  DOCUMENTO_ADMINISTRATIVO:'Documento',
  OUTRO:                   'Outro',
  PENDENTE:                'Pendente',
};

function parseValorBR(v) {
  const s = String(v || '0').trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(s.replace(',', '.')) || 0;
}

function getValorDisplay(intake) {
  const ia = intake.resultado_ia || {};
  const valor = ia.nf_valor_total || ia.valor || ia.valor_total || intake.valor;
  if (!valor) return null;
  const num = parseValorBR(valor);
  if (!num || num <= 0) return null;
  return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

export default function DocumentIntakeCard({ intake, onReview, onDeleted, onSentToApproval }) {
  const [loading, setLoading] = useState(false);
  const [sendingApproval, setSendingApproval] = useState(false);

  const status = STATUS_CONFIG[intake.status_processamento] || STATUS_CONFIG.ENVIADO;
  const Icon = status.icon;
  const tipo = intake.tipo_detectado;
  const isImage = tipo === 'FOTO_ATIVIDADE';
  const isNF = tipo === 'NOTA_FISCAL_PDF' || tipo === 'NOTA_FISCAL_XML';

  const canReview = ['AGUARDANDO_REVISAO', 'RASCUNHO'].includes(intake.status_processamento);
  const hasError = intake.status_processamento === 'ERRO_PROCESSAMENTO';
  const isProcessing = ['ANALISANDO_IA', 'ENVIADO'].includes(intake.status_processamento);
  const canSendApproval = canReview && isNF;

  const valorDisplay = getValorDisplay(intake);
  const fileName = intake.file_name_final || intake.file_name_original || 'Arquivo';
  const tipoLabel = TIPO_LABEL[tipo] || tipo || 'Pendente';

  async function handleReanalyse() {
    setLoading(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ENVIADO',
        erros_validacao: [],
      });
      toast.success('Documento reenviado para análise.');
    } catch (e) {
      toast.error('Erro ao reenviar: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Tem certeza que deseja deletar este arquivo?')) return;
    setLoading(true);
    try {
      if (intake.entidade_destino_id) {
        try {
          await base44.entities.Attachment.delete(intake.entidade_destino_id);
        } catch (e) {
          console.warn('Erro ao deletar attachment:', e.message);
        }
      }
      try {
        await base44.entities.DocumentIntake.delete(intake.id);
      } catch (e) {
        if (!e.message?.includes('not found')) throw e;
      }
      toast.success('Arquivo deletado.');
      if (onDeleted) onDeleted(intake.id);
    } catch (e) {
      toast.error('Erro ao deletar: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSendToApproval() {
    const ia = intake.resultado_ia || {};
    const rubrica_id = intake.rubrica_id_sugerida || ia.rubrica_id;
    const centro_custo = intake.centro_custo || ia.centro_custo_sugerido;
    const valor = parseValorBR(ia.nf_valor_total || ia.valor || ia.valor_total || 0);

    if (!rubrica_id || !centro_custo || !valor) {
      toast.error('Preencha rubrica, centro de custo e valor antes de enviar. Clique em "Editar" para revisar.');
      return;
    }

    setSendingApproval(true);
    try {
      const rubrica = await base44.entities.Rubrica.get(rubrica_id).catch(() => null);
      const rubrica_nome = rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || '';

      await base44.entities.PurchaseRequest.create({
        descricao_item: ia.descricao_servico || ia.nf_emitente_nome || fileName,
        fornecedor_nome: ia.nf_emitente_nome || '',
        fornecedor_cpf_cnpj: ia.nf_emitente_cpf_cnpj || '',
        valor: valor,
        rubrica_id: rubrica_id,
        rubrica_nome: rubrica_nome,
        centro_custo: centro_custo,
        nota_fiscal_url: intake.arquivo_original_url || '',
        status: 'AGUARDANDO_APROVACAO',
        origem: 'EntradaUnica',
        intake_id: intake.id,
        nf_numero: ia.nf_numero || '',
        nf_data_emissao: ia.nf_data_emissao || ia.data_emissao || '',
      });

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'APROVADO',
        ocultar_entrada_unica: true,
        entidade_destino: 'PurchaseRequest',
      });

      if (onSentToApproval) onSentToApproval(intake.id);
    } catch (e) {
      toast.error('Erro ao enviar para aprovação: ' + e.message);
    } finally {
      setSendingApproval(false);
    }
  }

  return (
    <div className="border border-slate-200 rounded-xl p-4 bg-white hover:shadow-sm transition-shadow">
      <div className="flex items-center gap-3">
        {/* Ícone */}
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
          isImage ? 'bg-purple-100' : 'bg-slate-100'
        )}>
          {isImage
            ? <Image className="w-5 h-5 text-purple-500" />
            : <FileText className="w-5 h-5 text-slate-400" />
          }
        </div>

        {/* Info principal */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800 truncate" title={fileName}>
            {fileName}
          </p>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Tipo */}
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {tipoLabel}
            </span>
            {/* Status */}
            <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium', status.color)}>
              <Icon className={cn('w-3 h-3', status.spin && 'animate-spin')} />
              {status.label}
            </span>
            {/* Valor */}
            {valorDisplay && (
              <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                {valorDisplay}
              </span>
            )}
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Ver arquivo */}
          {intake.arquivo_original_url && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              title="Ver arquivo"
              onClick={() => window.open(intake.arquivo_original_url, '_blank')}
            >
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </Button>
          )}

          {/* Baixar arquivo */}
          {intake.arquivo_original_url && (
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0"
              title="Baixar arquivo"
              onClick={() => {
                const a = document.createElement('a');
                a.href = intake.arquivo_original_url;
                a.download = fileName;
                a.click();
              }}
            >
              <Download className="w-4 h-4 text-slate-400" />
            </Button>
          )}

          {/* Reanalisar (em erro) */}
          {hasError && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleReanalyse}
              disabled={loading}
              className="text-xs h-8 px-2"
              title="Reanalisar"
            >
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            </Button>
          )}

          {/* Editar formulário */}
          {canReview && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReview({ ...intake })}
              className="h-8 text-xs px-3"
            >
              Editar
            </Button>
          )}

          {/* Enviar para aprovação */}
          {canSendApproval && (
            <Button
              size="sm"
              onClick={handleSendToApproval}
              disabled={sendingApproval}
              className="h-8 text-xs px-3 bg-black text-white hover:bg-gray-800"
            >
              {sendingApproval
                ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                : <Send className="w-3 h-3 mr-1" />
              }
              {sendingApproval ? 'Enviando...' : 'Enviar'}
            </Button>
          )}

          {/* Deletar */}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleDelete}
            disabled={loading || sendingApproval}
            className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50"
            title="Deletar arquivo"
          >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Aviso de erro */}
      {hasError && (
        <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>Erro na análise. Clique em reanalisar ou edite manualmente.</span>
        </div>
      )}

      {/* Aviso de agrupamento NF incompleto */}
      {isNF && intake.grupo_status === 'INCOMPLETO' && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Envie também o XML desta nota para completar o par PDF+XML.</span>
        </div>
      )}
    </div>
  );
}