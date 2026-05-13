import React, { useState, useRef } from 'react';
import {
  FileText, Image, CheckCircle2, Clock, AlertCircle, Loader2,
  Eye, Send, RefreshCw, X, Download, ExternalLink, Link2, Plus
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { deleteIntake } from '@/lib/deleteIntegrado';

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
  NOTA_FISCAL_PDF:          'NF PDF',
  NOTA_FISCAL_XML:          'NF XML',
  FOTO_ATIVIDADE:           'Foto',
  DOCUMENTO_ADMINISTRATIVO: 'Documento',
  OUTRO:                    'Outro',
  PENDENTE:                 'Pendente',
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

function hasStrongFileNameData(fileName) {
  const text = String(fileName || '').toLowerCase();
  return /\bnf\s*\d+/i.test(text) || /r\$?\s*\d+[.,]\d{2}/i.test(text) || /museus\s+centro/i.test(text);
}

export default function DocumentIntakeCard({ intake, onReview, onDeleted, onSentToApproval, onReanalyse, onLinkXml, onAddXmlToPdf }) {
  const [loading, setLoading] = useState(false);
  const [sendingApproval, setSendingApproval] = useState(false);
  const [addingXml, setAddingXml] = useState(false);
  const xmlInputRef = useRef(null);

  const status = STATUS_CONFIG[intake.status_processamento] || STATUS_CONFIG.ENVIADO;
  const Icon = status.icon;

  const tipo = intake.tipo_detectado;
  const isXML = tipo === 'NOTA_FISCAL_XML';
  const isPDF = tipo === 'NOTA_FISCAL_PDF';
  const isNF = isPDF || isXML;
  const isImage = tipo === 'FOTO_ATIVIDADE';

  const fileName = intake.file_name_final || intake.file_name_original || 'Arquivo';
  const statusKey = String(intake.status_processamento || '').toUpperCase();
  const isProcessing = ['ANALISANDO_IA', 'ENVIADO'].includes(statusKey);
  const canFallbackReview = isPDF && isProcessing && hasStrongFileNameData(fileName);

  // XML nunca pode revisar nem enviar. PDF em análise com dados no nome pode revisar para não ficar travado.
  const canReview = (
    ['AGUARDANDO_REVISAO', 'RASCUNHO', 'ERRO_PROCESSAMENTO'].includes(statusKey) ||
    canFallbackReview
  ) && !isXML;
  const hasError = intake.status_processamento === 'ERRO_PROCESSAMENTO';
  const canSendApproval = canReview && isPDF && !isProcessing;

  // XML: mostrar "Vincular XML" apenas se não vinculado e não completo
  const canLinkXml = isXML && !intake.nf_pdf_intake_id && intake.grupo_status !== 'COMPLETO';

  const valorDisplay = getValorDisplay(intake);
  const tipoLabel = TIPO_LABEL[tipo] || tipo || 'Pendente';

  async function handleReanalyse() {
    if (!onReanalyse) return;
    setLoading(true);
    try {
      await onReanalyse(intake);
      toast.success('Documento reenviado para análise.');
    } catch (e) {
      toast.error('Erro ao reanalisar: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Tem certeza que deseja deletar este arquivo?')) return;
    setLoading(true);
    try {
      await deleteIntake(intake);
      toast.success('Registro deletado e rubrica estornada com sucesso.');
      if (onDeleted) onDeleted(intake.id);
    } catch (e) {
      toast.error('Erro ao deletar: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  function handleLinkXml() {
    if (!onLinkXml) {
      toast.error('Função de vínculo não disponível.');
      return;
    }
    onLinkXml(intake);
  }

  async function handleXmlFileSelected(e) {
    const file = e.target.files?.[0];
    if (!file || !onAddXmlToPdf) return;
    e.target.value = '';
    setAddingXml(true);
    try {
      await onAddXmlToPdf(intake, file);
    } finally {
      setAddingXml(false);
    }
  }

  async function handleSendToApproval() {
    const ia = intake.resultado_ia || {};
    const rubrica_id = intake.rubrica_id_sugerida || ia.rubrica_id;
    const centro_custo = intake.centro_custo || ia.centro_custo_sugerido;
    const valor = parseValorBR(ia.nf_valor_total || ia.valor || ia.valor_total || 0);

    if (!rubrica_id || !centro_custo || !valor) {
      toast.error('Preencha rubrica, centro de custo e valor antes de enviar. Clique em "Revisar" para completar.');
      if (onReview) onReview({ ...intake });
      return;
    }

    setSendingApproval(true);
    try {
      const rubrica = await base44.entities.Rubrica.get(rubrica_id).catch(() => null);
      const rubrica_nome = rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || '';

      const novaPurchase = await base44.entities.PurchaseRequest.create({
        descricao_item: ia.descricao_servico || ia.nf_emitente_nome || fileName,
        fornecedor_nome: ia.nf_emitente_nome || '',
        fornecedor_cpf_cnpj: ia.nf_emitente_cpf_cnpj || '',
        valor_solicitado: valor,
        valor_total: valor,
        valor: valor,
        rubrica_id: rubrica_id,
        rubrica_nome: rubrica_nome,
        budgetline_id: rubrica_id,
        centro_custo: centro_custo,
        nota_fiscal_url: intake.arquivo_original_url || '',
        arquivo_url: intake.arquivo_original_url || '',
        status: 'SOLICITADO',
        origem: 'EntradaUnica',
        intake_id: intake.id,
        documento_intake_id: intake.id,
        nf_numero: ia.nf_numero || '',
        nf_data_emissao: ia.nf_data_emissao || ia.data_emissao || '',
      });

      await base44.entities.Attachment.create({
        purchase_request_id: novaPurchase?.id || '',
        document_intake_id: intake.id,
        file_name: intake.file_name_final || intake.file_name_original || fileName,
        file_url: intake.arquivo_original_url || '',
        file_type: intake.mime_type || 'application/pdf',
        description: 'Entrada Única - Nota Fiscal',
        nf_categoria: 'nota_fiscal',
        nf_numero: ia.nf_numero || '',
        nf_valor_total: valor,
        nf_data_emissao: ia.nf_data_emissao || ia.data_emissao || '',
        nf_emitente_nome: ia.nf_emitente_nome || '',
        nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || '',
        nf_tipo_documento: 'pdf_nf',
        nf_nome_original: intake.file_name_original || '',
        nf_nome_renomeado: intake.file_name_final || intake.file_name_original || fileName,
        nf_status_leitura: 'lido_com_sucesso',
        nf_revisado: true,
        rubrica_id,
        rubrica_nome,
      }).catch(() => null);

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ENVIADO_APROVACAO',
        ocultar_entrada_unica: true,
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: novaPurchase?.id || '',
      });

      toast.success('Enviado para aprovação com sucesso.');
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
            <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {tipoLabel}
            </span>
            {/* XML vinculado: só mostrar "Aguardando vínculo"; se já vinculado, não mostrar status */}
            {isXML && !intake.nf_pdf_intake_id && intake.grupo_status !== 'COMPLETO' && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                <Clock className="w-3 h-3" />
                Aguardando vínculo
              </span>
            )}
            {!isXML && (
              <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium', status.color)}>
                <Icon className={cn('w-3 h-3', status.spin && 'animate-spin')} />
                {status.label}
              </span>
            )}
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
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Ver arquivo"
              onClick={() => window.open(intake.arquivo_original_url, '_blank')}>
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </Button>
          )}

          {/* Baixar */}
          {intake.arquivo_original_url && (
            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Baixar arquivo"
              onClick={() => { const a = document.createElement('a'); a.href = intake.arquivo_original_url; a.download = fileName; a.click(); }}>
              <Download className="w-4 h-4 text-slate-400" />
            </Button>
          )}

          {/* Reanalisar (em erro ou análise travada, não XML) */}
          {(hasError || canFallbackReview) && !isXML && (
            <Button size="sm" variant="outline" onClick={handleReanalyse} disabled={loading}
              className="text-xs h-8 px-2" title="Reanalisar com IA">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              {!loading && 'Reanalisar'}
            </Button>
          )}

          {/* XML: botão Vincular ao PDF (se não vinculado) */}
          {canLinkXml && (
            <Button size="sm" variant="outline" onClick={handleLinkXml} disabled={loading}
              className="h-8 text-xs px-3">
              {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Link2 className="w-3 h-3 mr-1" />}
              Vincular XML ao PDF
            </Button>
          )}

          {/* XML: já vinculado — não mostrar mais ações */}
          {isXML && (intake.nf_pdf_intake_id || intake.grupo_status === 'COMPLETO') && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              XML vinculado
            </span>
          )}

          {/* PDF: Adicionar XML (se não tem XML vinculado) */}
          {isPDF && !intake.nf_xml_intake_id && intake.grupo_status !== 'COMPLETO' && (
            <>
              <input
                ref={xmlInputRef}
                type="file"
                accept=".xml,application/xml,text/xml"
                className="hidden"
                onChange={handleXmlFileSelected}
              />
              <Button size="sm" variant="outline" disabled={addingXml}
                onClick={() => xmlInputRef.current?.click()}
                className="h-8 text-xs px-3 border-amber-300 text-amber-700 hover:bg-amber-50">
                {addingXml ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                {addingXml ? 'Vinculando...' : 'Adicionar XML'}
              </Button>
            </>
          )}

          {/* PDF: Revisar (não XML) */}
          {canReview && (
            <Button size="sm" variant="outline" onClick={() => onReview({ ...intake })}
              className="h-8 text-xs px-3">
              Revisar
            </Button>
          )}

          {/* PDF: Enviar para aprovação */}
          {canSendApproval && (
            <Button size="sm" onClick={handleSendToApproval} disabled={sendingApproval}
              className="h-8 text-xs px-3 bg-black text-white hover:bg-gray-800">
              {sendingApproval
                ? <Loader2 className="w-3 h-3 animate-spin mr-1" />
                : <Send className="w-3 h-3 mr-1" />}
              {sendingApproval ? 'Enviando...' : 'Enviar'}
            </Button>
          )}

          {/* Deletar (XML: mostrar; PDF: mostrar) */}
          <Button size="sm" variant="ghost" onClick={handleDelete} disabled={loading || sendingApproval || addingXml}
            className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50" title="Deletar arquivo">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Aviso de erro (não XML) */}
      {hasError && !isXML && (
        <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>Erro na análise. Clique em "Reanalisar" para tentar novamente ou em "Revisar" para editar manualmente.</span>
        </div>
      )}

      {/* Aviso análise travada */}
      {canFallbackReview && (
        <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>A IA ainda não concluiu. Como o nome do arquivo contém dados da NF, clique em "Revisar" para preencher/conferir manualmente.</span>
        </div>
      )}

      {/* Aviso XML aguardando vínculo */}
      {isXML && !intake.nf_pdf_intake_id && intake.grupo_status !== 'COMPLETO' && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Aguardando vínculo com o PDF correspondente.</span>
        </div>
      )}

      {/* Aviso PDF sem XML — sempre que PDF não tiver XML vinculado */}
      {isPDF && !intake.nf_xml_intake_id && intake.grupo_status !== 'COMPLETO' && (
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Envie o XML correspondente desta nota.</span>
        </div>
      )}

      {/* PDF+XML completo */}
      {isNF && intake.grupo_status === 'COMPLETO' && intake.nf_xml_url && (
        <div className="mt-3 flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          <span>XML vinculado automaticamente.</span>
        </div>
      )}
    </div>
  );
}