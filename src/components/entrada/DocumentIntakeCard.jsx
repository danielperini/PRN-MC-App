import React, { useState, useRef, useEffect } from 'react';
import {
  FileText, Image, CheckCircle2, Clock, AlertCircle, Loader2,
  Eye, Send, RefreshCw, X, Download, ExternalLink, Link2, Plus, AlertTriangle, Sparkles } from
'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { deleteIntake } from '@/lib/deleteIntegrado';
import {
  buildLinkPatch,
  loadLinkingDatasets,
  suggestEntityLinks,
} from '@/utils/linking/smartEntityLinker';
import QuickViewIA from '@/components/entrada/QuickViewIA';
import { COORD_GERAL_EMAILS } from '@/components/auth/permissions';

const STATUS_CONFIG = {
  ENVIADO: { label: 'Enviado', color: 'bg-blue-100 text-blue-700', icon: Clock },
  ANALISANDO_IA: { label: 'Analisando...', color: 'bg-yellow-100 text-yellow-700', icon: Loader2, spin: true },
  AGUARDANDO_REVISAO: { label: 'Pendente de revisão', color: 'bg-orange-100 text-orange-700', icon: Eye },
  RASCUNHO: { label: 'Rascunho', color: 'bg-slate-100 text-slate-600', icon: FileText },
  ENVIADO_APROVACAO: { label: 'Enviado p/ aprovação', color: 'bg-purple-100 text-purple-700', icon: Send },
  APROVADO: { label: 'Aprovado', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  REJEITADO: { label: 'Rejeitado', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  ERRO_PROCESSAMENTO: { label: 'Erro', color: 'bg-red-100 text-red-700', icon: AlertCircle }
};

const TIPO_LABEL = {
  NOTA_FISCAL_PDF: 'NF PDF',
  NOTA_FISCAL_XML: 'NF XML',
  RECIBO_PDF: 'Recibo/Comprovante',
  FOTO_ATIVIDADE: 'Foto',
  DOCUMENTO_ADMINISTRATIVO: 'Documento',
  CONTRATO: 'Contrato',
  CONTRATO_PDF: 'Contrato',
  TERMO_COMPROMISSO_PDF: 'Termo de compromisso',
  OUTRO: 'Outro',
  PENDENTE: 'Pendente'
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

function normalizeFileName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\.(pdf|xml)$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function getValorNumerico(intake) {
  const ia = intake?.resultado_ia || {};
  const v = ia.nf_valor_total || ia.valor || ia.valor_total || intake?.nf_valor_total || intake?.valor || 0;
  return parseValorBR(v);
}

function getCnpjIntake(intake) {
  const ia = intake?.resultado_ia || {};
  return String(ia.nf_emitente_cpf_cnpj || ia.fornecedor_cpf_cnpj || intake?.nf_emitente_cpf_cnpj || intake?.fornecedor_cpf_cnpj || '').replace(/\D/g, '');
}

function getNFNumberIntake(intake) {
  const ia = intake?.resultado_ia || {};
  return String(ia.nf_numero || intake?.nf_numero || '').replace(/\D/g, '');
}

function getNFDateIntake(intake) {
  const ia = intake?.resultado_ia || {};
  return String(ia.nf_data_emissao || ia.data_emissao || intake?.nf_data_emissao || '').trim();
}

function detectarDuplicatas(intake, allIntakes) {
  if (!allIntakes || allIntakes.length <= 1) return [];

  const outros = allIntakes.filter((i) => i.id !== intake.id);
  const duplicatas = [];

  const cnpjAtual = getCnpjIntake(intake);
  const valorAtual = getValorNumerico(intake);
  const nfNumeroAtual = getNFNumberIntake(intake);
  const nfDataAtual = getNFDateIntake(intake);

  for (const outro of outros) {
    const cnpjOutro = getCnpjIntake(outro);
    const valorOutro = getValorNumerico(outro);
    const nfNumeroOutro = getNFNumberIntake(outro);
    const nfDataOutro = getNFDateIntake(outro);

    // Duplicata confirmada: mesmo CNPJ + mesmo número NF + mesmo valor + mesma data de emissão
    if (
      cnpjAtual && cnpjOutro && cnpjAtual === cnpjOutro &&
      nfNumeroAtual && nfNumeroOutro && nfNumeroAtual === nfNumeroOutro &&
      valorAtual > 0 && valorOutro > 0 && Math.abs(valorAtual - valorOutro) < 0.02 &&
      nfDataAtual && nfDataOutro && nfDataAtual === nfDataOutro
    ) {
      duplicatas.push({
        id: outro.id,
        nome: outro.file_name_original || outro.file_name_final,
        motivo: `NF ${nfNumeroAtual} — mesmo CNPJ, valor e data`
      });
      continue;
    }
  }

  return duplicatas;
}

// Data de corte para exigir XML obrigatório
const DATA_CORTE_XML = new Date('2026-08-01');

export default function DocumentIntakeCard({ intake, allIntakes, onReview, onDeleted, onSentToApproval, onReanalyse, onLinkXml, onAddXmlToPdf, onLinkArquivo }) {
  const [loading, setLoading] = useState(false);
  const [sendingApproval, setSendingApproval] = useState(false);
  const [addingXml, setAddingXml] = useState(false);
  const [prDuplicatas, setPrDuplicatas] = useState([]);
  const [confirmSemXml, setConfirmSemXml] = useState(false);
  const xmlInputRef = useRef(null);

  // Verifica duplicatas em PurchaseRequests existentes (NFs já enviadas p/ aprovação)
  // Requer: mesmo CNPJ + mesmo número NF + mesmo valor + mesma data de emissão
  useEffect(() => {
    const cnpj = getCnpjIntake(intake);
    const valor = getValorNumerico(intake);
    const nfNumero = getNFNumberIntake(intake);
    const nfData = getNFDateIntake(intake);
    if (!cnpj || valor <= 0 || !nfNumero) return;

    let mounted = true;
    // Delay escalonado para evitar sobrecarga de chamadas simultâneas
    const timer = setTimeout(() => {
      if (!mounted) return;
      base44.entities.PurchaseRequest.filter({ fornecedor_cpf_cnpj: cnpj }, '-created_date', 20)
        .then((list) => {
          if (!mounted) return;
          const duplicadas = (list || []).filter((pr) => {
            if (pr.entidade_destino_id === intake.id || pr.intake_id === intake.id || pr.documento_intake_id === intake.id) return false;
            const valorPR = Number(pr.valor_solicitado || pr.valor_total || pr.valor || 0);
            const nfPR = String(pr.nf_numero || '').replace(/\D/g, '');
            const dataPR = String(pr.nf_data_emissao || '').trim();
            return (
              valorPR > 0 && Math.abs(valorPR - valor) < 0.02 &&
              nfPR === nfNumero &&
              nfData && dataPR && nfData === dataPR
            );
          });
          setPrDuplicatas(duplicadas);
        })
        .catch(() => {});
    }, 100);

    return () => { mounted = false; clearTimeout(timer); };
  }, [intake.id, intake.nf_emitente_cpf_cnpj, intake.fornecedor_cpf_cnpj]);

  const status = STATUS_CONFIG[intake.status_processamento] || STATUS_CONFIG.ENVIADO;
  const Icon = status.icon;

  const tipo = intake.tipo_detectado;
  const isXML = tipo === 'NOTA_FISCAL_XML';
  const isPDF = tipo === 'NOTA_FISCAL_PDF';
  const isRecibo = tipo === 'RECIBO_PDF';
  const isContrato = ['CONTRATO', 'CONTRATO_PDF', 'TERMO_COMPROMISSO_PDF'].includes(tipo);
  const isNF = isPDF || isXML;
  const isImage = tipo === 'FOTO_ATIVIDADE';

  // Status de vinculação
  const temXmlVinculado = isPDF && !!intake.nf_xml_intake_id;
  const temReciboVinculado = isPDF && !!intake.recibo_intake_id;

  // statusKey declarado antes de qualquer uso (TDZ-safe)
  const statusKey = String(intake.status_processamento || '').toUpperCase();

  // IA Histórico — badge e botão de envio direto à coordenação
  const iaHistorico = intake?.resultado_ia?.preenchido_por_ia_historico === true;
  const iaHistoricoScore = Number(intake?.resultado_ia?.ia_historico_score || 0);
  const isIAHistoricoElegivel = iaHistorico && iaHistoricoScore >= 70 && isPDF && statusKey === 'AGUARDANDO_REVISAO';
  const estaSemVinculo = (isPDF && !intake.nf_xml_intake_id && !intake.recibo_intake_id && intake.grupo_status !== 'COMPLETO') ||
    (isXML && !intake.nf_pdf_intake_id && intake.grupo_status !== 'COMPLETO') ||
    (isRecibo && !intake.nf_pdf_intake_id && intake.grupo_status !== 'COMPLETO');

  const fileName = intake.file_name_final || intake.file_name_original || 'Arquivo';
  const isProcessing = ['ANALISANDO_IA', 'ENVIADO'].includes(statusKey);
  const isEnviadoTravado = statusKey === 'ENVIADO' && isPDF;
  const errosValidacao = Array.isArray(intake.erros_validacao) ? intake.erros_validacao : [];
  const alertasIA = Array.isArray(intake?.resultado_ia?.alertas) ? intake.resultado_ia.alertas : [];
  const revisaoAlertas = statusKey === 'AGUARDANDO_REVISAO' ? [...errosValidacao, ...alertasIA] : [];
  const canFallbackReview = isPDF && isProcessing && hasStrongFileNameData(fileName);

  // XML nunca pode revisar nem enviar. Contrato vai para modal próprio.
  const canReview = (
  ['AGUARDANDO_REVISAO', 'RASCUNHO', 'ERRO_PROCESSAMENTO'].includes(statusKey) ||
  canFallbackReview ||
  isEnviadoTravado) &&
  !isXML;
  const canReviewContrato = isContrato && ['AGUARDANDO_REVISAO', 'RASCUNHO', 'ERRO_PROCESSAMENTO', 'ANALISANDO_IA'].includes(statusKey);
  const hasError = intake.status_processamento === 'ERRO_PROCESSAMENTO';
  const canReanalisar = hasError || canFallbackReview || isEnviadoTravado;
  const canSendApproval = canReview && isPDF && !isProcessing;

  // XML: mostrar "Vincular XML" apenas se não vinculado e não completo
  const canLinkXml = isXML && !intake.nf_pdf_intake_id && intake.grupo_status !== 'COMPLETO';

  // Qualquer arquivo sem vínculo pode usar vínculo manual genérico
  const canLinkArquivo = estaSemVinculo && !!onLinkArquivo;

  const valorDisplay = getValorDisplay(intake);
  const tipoLabel = TIPO_LABEL[tipo] || tipo || 'Pendente';
  const duplicatas = detectarDuplicatas(intake, allIntakes);

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

  // Verifica se é NF PDF nova (a partir de 01/08/2026) sem XML
  const createdAt = new Date(intake.created_date || intake.updated_date || 0);
  const isNovaSemXml = isPDF && !intake.nf_xml_intake_id && createdAt >= DATA_CORTE_XML;
  const isAntigaSemXml = isPDF && !intake.nf_xml_intake_id && !intake.recibo_intake_id && createdAt < DATA_CORTE_XML;

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

    // Se não tem XML e é nova (>=01/08/2026), pedir confirmação
    if (isNovaSemXml && !confirmSemXml) {
      setConfirmSemXml(true);
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
        nf_data_emissao: ia.nf_data_emissao || ia.data_emissao || ''
      });

      const attachment = await base44.entities.Attachment.create({
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
        rubrica_nome
      }).catch(() => null);

      let linkPatch = {};
      try {
        const linkSource = {
          ...intake,
          ...ia,
          __entityType: 'DocumentIntake',
          fornecedor_nome: ia.nf_emitente_nome || '',
          fornecedor_cpf_cnpj: ia.nf_emitente_cpf_cnpj || '',
          nf_numero: ia.nf_numero || '',
          valor_total: valor,
          rubrica_id,
        };
        const datasets = await loadLinkingDatasets();
        const suggestions = suggestEntityLinks(linkSource, datasets, { minScore: 55 });
        const patchCandidate = buildLinkPatch(suggestions);
        if ((suggestions.confidence || 0) >= 60 && (patchCandidate.team_member_id || patchCandidate.linked_user_id || patchCandidate.team_payment_id)) {
          linkPatch = patchCandidate;
          await Promise.all([
            novaPurchase?.id ? base44.entities.PurchaseRequest.update(novaPurchase.id, { ...linkPatch, entity_link_status: 'AUTO_LINKED' }).catch(() => null) : null,
            attachment?.id ? base44.entities.Attachment.update(attachment.id, { ...linkPatch, entity_link_status: 'AUTO_LINKED' }).catch(() => null) : null,
          ]);
        }
      } catch (linkError) {
        console.warn('Vínculo automático não aplicado:', linkError);
      }

      const xmlPendingPatch = isNovaSemXml
        ? { enviado_sem_xml: true, xml_obrigatorio_pendente: false }
        : {};

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ENVIADO_APROVACAO',
        ocultar_entrada_unica: true,
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: novaPurchase?.id || '',
        ...linkPatch,
        ...xmlPendingPatch
      });

      // Notificação in-app para coordenadores (sem e-mail) quando é IA Histórico
      if (iaHistorico && iaHistoricoScore >= 70 && novaPurchase?.id) {
        try {
          await Promise.all(COORD_GERAL_EMAILS.map((email) =>
            base44.entities.Notification.create({
              user_email: email,
              type: 'INVOICE_SUBMITTED',
              title: 'NF enviada para aprovação (IA Histórico)',
              message: `${fileName} — R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — ${ia.nf_emitente_nome || ''}`,
              entity_type: 'PurchaseRequest',
              entity_id: novaPurchase.id,
              action_url: '/Compras',
              read: false,
              email_sent: false,
            }).catch(() => {})
          ));
        } catch (_) {}
      }

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
    {/* Diálogo de confirmação: enviar NF sem XML */}
    {confirmSemXml && (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">Enviar NF sem XML?</h3>
              <p className="text-sm text-slate-600 mt-1">Esta nota fiscal não possui XML vinculado. A partir de 01/08/2026, o XML é obrigatório para conformidade fiscal. Deseja enviar mesmo assim?</p>
            </div>
          </div>
          <div className="flex gap-3 justify-end">
            <button onClick={() => setConfirmSemXml(false)} className="px-4 py-2 text-sm rounded-lg border border-slate-200 hover:bg-slate-50">Cancelar</button>
            <button
              onClick={async () => {
                setConfirmSemXml(false);
                setSendingApproval(true);
                try {
                  const ia2 = intake.resultado_ia || {};
                  const rubrica_id2 = intake.rubrica_id_sugerida || ia2.rubrica_id;
                  const centro_custo2 = intake.centro_custo || ia2.centro_custo_sugerido;
                  const valor2 = parseValorBR(ia2.nf_valor_total || ia2.valor || ia2.valor_total || 0);
                  const fileName2 = intake.file_name_final || intake.file_name_original || 'Arquivo';
                  const rubrica2 = await base44.entities.Rubrica.get(rubrica_id2).catch(() => null);
                  const rubrica_nome2 = rubrica2?.rubrica || rubrica2?.nome || rubrica2?.descricao || '';
                  const novaPurchase2 = await base44.entities.PurchaseRequest.create({
                    descricao_item: ia2.descricao_servico || ia2.nf_emitente_nome || fileName2,
                    fornecedor_nome: ia2.nf_emitente_nome || '', fornecedor_cpf_cnpj: ia2.nf_emitente_cpf_cnpj || '',
                    valor_solicitado: valor2, valor_total: valor2, valor: valor2,
                    rubrica_id: rubrica_id2, rubrica_nome: rubrica_nome2, budgetline_id: rubrica_id2, centro_custo: centro_custo2,
                    nota_fiscal_url: intake.arquivo_original_url || '', arquivo_url: intake.arquivo_original_url || '',
                    status: 'SOLICITADO', origem: 'EntradaUnica', intake_id: intake.id, documento_intake_id: intake.id,
                    nf_numero: ia2.nf_numero || '', nf_data_emissao: ia2.nf_data_emissao || ia2.data_emissao || ''
                  });
                  await base44.entities.DocumentIntake.update(intake.id, {
                    status_processamento: 'ENVIADO_APROVACAO', ocultar_entrada_unica: true,
                    entidade_destino: 'PurchaseRequest', entidade_destino_id: novaPurchase2?.id || '',
                    enviado_sem_xml: true, xml_obrigatorio_pendente: false
                  });
                  toast.success('Enviado para aprovação com sucesso.');
                  if (onSentToApproval) onSentToApproval(intake.id);
                } catch (e) {
                  toast.error('Erro ao enviar: ' + e.message);
                } finally {
                  setSendingApproval(false);
                }
              }}
              className="px-4 py-2 text-sm rounded-lg bg-orange-600 text-white hover:bg-orange-700 font-medium"
            >Enviar mesmo assim</button>
          </div>
        </div>
      </div>
    )}
      <div className="flex items-center gap-3">
        {/* Ícone */}
        <div className={cn(
          'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
          isImage ? 'bg-purple-100' : 'bg-slate-100'
        )}>
          {isImage ?
          <Image className="w-5 h-5 text-purple-500" /> :
          <FileText className="w-5 h-5 text-slate-400" />
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
            {iaHistorico && iaHistoricoScore >= 70 &&
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: '#dbeafe', color: '#1e40af' }}>
                <Sparkles className="w-3 h-3" />
                IA Histórico {Math.round(iaHistoricoScore)}%
              </span>
            }
            {/* XML vinculado: só mostrar "Aguardando vínculo"; se já vinculado, não mostrar status */}
            {isXML && !intake.nf_pdf_intake_id && intake.grupo_status !== 'COMPLETO' &&
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">
                <Clock className="w-3 h-3" />
                Aguardando vínculo
              </span>
            }
            {!isXML && !isRecibo &&
            <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium', status.color)}>
                 <Icon className={cn('w-3 h-3', status.spin && 'animate-spin')} />
                 {status.label}
               </span>
             }
            {isRecibo && !intake.nf_pdf_intake_id &&
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">
                <Clock className="w-3 h-3" />
                Sem NF vinculada
              </span>
            }
            {isRecibo && intake.nf_pdf_intake_id &&
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                <CheckCircle2 className="w-3 h-3" />
                Vinculado à NF
              </span>
            }
            {isPDF && temXmlVinculado &&
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                <CheckCircle2 className="w-3 h-3" />
                XML vinculado
              </span>
            }
            {/* Badge XML pendente — NF nova (≥01/08/2026) sem XML */}
            {isNovaSemXml &&
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700 border border-orange-200">
                <AlertTriangle className="w-3 h-3" />
                XML pendente
              </span>
            }
            {/* Badge XML pendente suave — NF antiga sem XML */}
            {isAntigaSemXml &&
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
                <AlertTriangle className="w-3 h-3" />
                XML pendente
              </span>
            }
            {isPDF && temReciboVinculado &&
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700">
                <CheckCircle2 className="w-3 h-3" />
                Comprovante vinculado
              </span>
            }
            {valorDisplay &&
            <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                {valorDisplay}
              </span>
            }
            {(duplicatas.length > 0 || prDuplicatas.length > 0) &&
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700 border border-red-200">
                <AlertCircle className="w-3 h-3" />
                Duplicata
              </span>
            }
            {revisaoAlertas.length > 0 &&
              <span
                className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium bg-amber-50 text-amber-800 border border-amber-200 max-w-[240px]"
                title={revisaoAlertas.join(' • ')}
              >
                <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                <span className="truncate">
                  {revisaoAlertas.length === 1 ? revisaoAlertas[0] : `${revisaoAlertas.length} alertas para revisão`}
                </span>
              </span>
            }
            {isContrato && intake.backup_drive_status &&
              <span className={cn(
                'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
                intake.backup_drive_status === 'CONCLUIDO'
                  ? 'bg-green-100 text-green-700'
                  : intake.backup_drive_status === 'ERRO'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700'
              )}>
                {intake.backup_drive_status === 'CONCLUIDO' ? 'Backup no Drive concluido' :
                  intake.backup_drive_status === 'ERRO' ? 'Erro no backup do Drive' :
                    'Backup no Drive pendente'}
              </span>
            }
          </div>
        </div>

        {/* Ações */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Ver arquivo */}
          {intake.arquivo_original_url &&
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Ver arquivo"
          onClick={() => window.open(intake.arquivo_original_url, '_blank')}>
              <ExternalLink className="w-4 h-4 text-slate-400" />
            </Button>
          }

          {isContrato && intake.drive_backup_url &&
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Abrir backup no Drive"
          onClick={() => window.open(intake.drive_backup_url, '_blank')}>
              <ExternalLink className="w-4 h-4 text-green-600" />
            </Button>
          }

          {/* Baixar */}
          {intake.arquivo_original_url &&
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Baixar arquivo"
          onClick={() => {const a = document.createElement('a');a.href = intake.arquivo_original_url;a.download = fileName;a.click();}}>
              <Download className="w-4 h-4 text-slate-400" />
            </Button>
          }

          {/* Reanalisar (em erro ou análise travada ou ENVIADO sem IA, não XML) */}
          {canReanalisar && !isXML &&
          <Button size="sm" variant="outline" onClick={handleReanalyse} disabled={loading}
          className="text-xs h-8 px-2" title="Reanalisar com IA">
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              {!loading && 'Reanalisar'}
            </Button>
          }

          {/* XML: botão Vincular ao PDF (se não vinculado) */}
          {canLinkXml &&
          <Button size="sm" variant="outline" onClick={handleLinkXml} disabled={loading}
          className="h-8 text-xs px-3">
               {loading ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Link2 className="w-3 h-3 mr-1" />}
               Vincular XML ao PDF
             </Button>
           }

          {/* Recibo / qualquer arquivo sem vínculo: vínculo manual genérico */}
          {canLinkArquivo && !canLinkXml &&
            <Button size="sm" variant="outline" onClick={() => onLinkArquivo(intake)} disabled={loading}
              className="h-8 text-xs px-3 border-purple-200 text-purple-700 hover:bg-purple-50">
              <Link2 className="w-3 h-3 mr-1" />
              Vincular arquivo
            </Button>
          }

          {/* XML: já vinculado — não mostrar mais ações */}
          {isXML && (intake.nf_pdf_intake_id || intake.grupo_status === 'COMPLETO') &&
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
              <CheckCircle2 className="w-3 h-3" />
              XML vinculado
            </span>
          }

          {/* PDF: Adicionar XML (se não tem XML vinculado) */}
          {isPDF && !intake.nf_xml_intake_id && intake.grupo_status !== 'COMPLETO' &&
          <>
              <input
              ref={xmlInputRef}
              type="file"
              accept=".xml,application/xml,text/xml"
              className="hidden"
              onChange={handleXmlFileSelected} />
            
              <Button size="sm" variant="outline" disabled={addingXml}
            onClick={() => xmlInputRef.current?.click()}
            className="h-8 text-xs px-3 border-amber-300 text-amber-700 hover:bg-amber-50">
                {addingXml ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                {addingXml ? 'Vinculando...' : 'Adicionar XML'}
              </Button>
            </>
          }

          {/* Contrato: botão Revisar Contrato */}
          {canReviewContrato &&
            <Button size="sm" variant="outline" onClick={() => onReview({ ...intake })}
              className="h-8 text-xs px-3 border-indigo-300 text-indigo-700 hover:bg-indigo-50">
              <FileText className="w-3 h-3 mr-1" />
              Revisar Contrato
            </Button>
          }

          {/* PDF: Revisar (não XML, não contrato) */}
          {canReview && !isContrato &&
          <Button size="sm" variant="outline" onClick={() => onReview({ ...intake })}
          className="h-8 text-xs px-3">
              Revisar
            </Button>
          }

          {/* PDF: o envio para coordenação agora é feito automaticamente pelo
              pipeline "Reprocessar Fila" (admin). Nenhum botão de envio manual. */}

          {/* Deletar (XML: mostrar; PDF: mostrar) */}
          <Button size="sm" variant="ghost" onClick={handleDelete} disabled={loading || sendingApproval || addingXml}
          className="h-8 w-8 p-0 text-red-400 hover:text-red-600 hover:bg-red-50" title="Deletar arquivo">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* ⚠️ Alerta de DUPLICATA — na fila */}
      {duplicatas.length > 0 &&
        <div className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-red-600" />
          <div>
            <span className="font-semibold">⚠️ Possível duplicata na fila.</span>{' '}
            {duplicatas.length === 1
              ? `Outro arquivo com ${duplicatas[0].motivo}: "${duplicatas[0].nome}".`
              : `${duplicatas.length} outros arquivos na fila com critérios similares.`
            }
            {' '}Verifique antes de enviar para aprovação.
          </div>
        </div>
      }

      {/* ⚠️ Alerta de DUPLICATA — já aprovada/solicitada */}
      {prDuplicatas.length > 0 &&
        <div className="mt-3 flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-red-600" />
          <div>
            <span className="font-semibold">⚠️ Já existe solicitação com mesmo CNPJ e valor.</span>{' '}
            {prDuplicatas.length === 1
              ? `Solicitação: "${prDuplicatas[0].descricao_item || prDuplicatas[0].fornecedor_nome || 'sem descrição'}" (${prDuplicatas[0].status || ''}).`
              : `${prDuplicatas.length} solicitações existentes com mesmo fornecedor e valor.`
            }
            {' '}Confirme que não é um pagamento duplicado antes de prosseguir.
          </div>
        </div>
      }

      {/* Aviso de erro (não XML) */}
      {hasError && !isXML &&
      <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>Erro na análise. Clique em "Reanalisar" para tentar novamente ou em "Revisar" para editar manualmente.</span>
        </div>
      }

      {/* Aviso análise travada */}
      {canFallbackReview &&
      <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>A IA ainda não concluiu. Como o nome do arquivo contém dados da NF, clique em "Revisar" para preencher/conferir manualmente.</span>
        </div>
      }

      {/* Aviso XML aguardando vínculo */}
      {isXML && !intake.nf_pdf_intake_id && intake.grupo_status !== 'COMPLETO' &&
      <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Aguardando vínculo com o PDF correspondente.</span>
        </div>
      }

      {/* Aviso PDF sem XML e sem recibo */}
      {isPDF && !intake.nf_xml_intake_id && !intake.recibo_intake_id && intake.grupo_status !== 'COMPLETO' &&
        <div className="mt-3 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Envie o XML e/ou comprovante correspondente desta nota. Sem XML/comprovante, apenas a NF será enviada.</span>
        </div>
      }

      {/* Aviso contrato identificado */}
      {isContrato && statusKey === 'AGUARDANDO_REVISAO' && !intake.contrato_team_member_id && !intake.contrato_fornecedor_id &&
        <div className="mt-3 flex items-start gap-2 text-xs text-indigo-700 bg-indigo-50 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>Contrato identificado. Clique em "Revisar Contrato" para vincular ao membro da equipe ou fornecedor. Nenhum valor será debitado.</span>
        </div>
      }

      {isContrato && (intake.contrato_team_member_id || intake.contrato_fornecedor_id) &&
        <div className="mt-3 flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            Contrato vinculado e arquivado com sucesso.
            {intake.drive_backup_url ? (
              <> <a href={intake.drive_backup_url} target="_blank" rel="noopener noreferrer" className="underline">Abrir backup no Drive</a>.</>
            ) : intake.backup_drive_status === 'ERRO' ? (
              <> Backup no Drive com erro; o arquivo permanece salvo no app.</>
            ) : (
              <> Backup no Drive pendente.</>
            )}
          </span>
        </div>
      }

      {/* Quick View IA — dados extraídos com validação rápida */}
      <QuickViewIA intake={intake} onValidated={() => {}} onReview={onReview} />

      {/* Aviso recibo sem NF */}
      {isRecibo && !intake.nf_pdf_intake_id && intake.grupo_status !== 'COMPLETO' &&
        <div className="mt-3 flex items-center gap-2 text-xs text-purple-700 bg-purple-50 px-3 py-2 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Recibo/comprovante sem NF vinculada. Não cria solicitação financeira. Use "Vincular arquivo" para associar à NF correspondente.</span>
        </div>
      }

      {/* PDF+XML completo */}
      {isPDF && intake.nf_xml_url && temXmlVinculado &&
        <div className="mt-3 flex items-center gap-2 text-xs text-blue-700 bg-blue-50 px-3 py-2 rounded-lg">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          <span>XML vinculado {intake.grupo_status === 'COMPLETO' ? 'automaticamente' : 'manualmente'}.</span>
        </div>
      }

      {/* PDF + Recibo/Comprovante vinculado */}
      {isPDF && intake.recibo_url && temReciboVinculado &&
        <div className="mt-3 flex items-center gap-2 text-xs text-green-700 bg-green-50 px-3 py-2 rounded-lg">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Comprovante/recibo vinculado — <a href={intake.recibo_url} target="_blank" rel="noopener noreferrer" className="underline">ver arquivo</a>.</span>
        </div>
      }
    </div>);

}