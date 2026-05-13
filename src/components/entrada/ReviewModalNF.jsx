import React, { useEffect, useMemo, useState } from 'react';
import CoordReviewModalNF from './CoordReviewModalNF';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { FileText, Loader2, ShieldCheck, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function cleanText(value, fallback = '') {
  return String(value || fallback)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function parseValor(value) {
  const raw = String(value || '0').trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) {
    return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return Number(raw.replace(',', '.')) || 0;
}

function formatValor(value) {
  const n = parseValor(value);
  return n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getExt(filename, fallback = 'pdf') {
  const ext = String(filename || '').split('.').pop()?.toLowerCase();
  if (['pdf', 'xml'].includes(ext)) return ext;
  return fallback;
}

function getCargoOuServico(data = {}) {
  const source =
    data.descricao_servico ||
    data.descricao_item ||
    data.rubrica_nome ||
    data.rubrica ||
    data.cargo ||
    data.funcao ||
    data.tipo_gasto ||
    'NOTA FISCAL';

  let text = cleanText(source, 'NOTA FISCAL');

  text = text
    .replace(/^SERVICO\s+DE\s+/i, '')
    .replace(/^SERVICOS\s+DE\s+/i, '')
    .replace(/^PRESTACAO\s+DE\s+SERVICOS?\s+DE\s+/i, '')
    .replace(/^NOTA\s+FISCAL\s*/i, '')
    .trim();

  return text || 'NOTA FISCAL';
}

function isAuxiliaryPayload(data = {}) {
  const haystack = normalizeText([
    data.file_name,
    data.nf_nome_original,
    data.nf_nome_renomeado,
    data.description,
    data.nf_tipo_documento,
    data.tipo_detectado,
    data.categoria,
  ].filter(Boolean).join(' '));

  return (
    haystack.includes('recibo') ||
    haystack.includes('comprovante') ||
    haystack.includes('pagamento') ||
    haystack.includes('pix') ||
    haystack.includes('boleto') ||
    haystack.includes('transferencia') ||
    haystack.includes('transferência')
  );
}

function buildNomePadraoArquivo(data = {}, options = {}) {
  const ext = options.ext || getExt(data.file_name || data.nf_nome_original || data.nf_nome_renomeado, data.nf_tipo_documento === 'xml_nf' ? 'xml' : 'pdf');
  const numero = cleanText(data.nf_numero || data.numero_nf || data.numero || 'SEM NUM');
  const cargo = getCargoOuServico(data);
  const fornecedor = cleanText(data.nf_emitente_nome || data.fornecedor_nome || data.emitente_nome || data.fornecedor || 'FORNECEDOR');
  const valor = formatValor(data.nf_valor_total || data.valor_solicitado || data.valor || data.total || 0);
  const isXml = ext === 'xml' || data.nf_tipo_documento === 'xml_nf';
  const isAux = options.auxiliar || isAuxiliaryPayload(data);
  const prefix = isAux ? '02 RECIBO NF' : '01 NF';

  return `${prefix} ${numero} ${cargo} - ${fornecedor} - MUSEUS CENTRO - ${valor}.${isXml ? 'xml' : 'pdf'}`;
}

function isNomeNoPadrao(fileName = '') {
  const name = String(fileName || '').trim();
  return /^\d{2}\s+(NF|RECIBO\s+NF)\s+.+\s+-\s+.+\s+-\s+MUSEUS\s+CENTRO\s+-\s+\d{1,3}(?:\.\d{3})*,\d{2}\.(pdf|xml)$/i.test(name);
}

function ensureNomePadrao(data = {}, fallback = {}) {
  const currentName = data.file_name || data.nf_nome_renomeado || data.nf_nome_original || fallback.file_name_original || '';
  if (isNomeNoPadrao(currentName)) {
    return {
      ...data,
      file_name: currentName,
      nf_nome_renomeado: currentName,
      nome_padronizado_ia: currentName,
      nome_padronizado_status: 'ja_estava_no_padrao',
    };
  }

  const merged = { ...fallback, ...data };
  const ext = getExt(currentName, merged.nf_tipo_documento === 'xml_nf' ? 'xml' : 'pdf');
  const nextName = buildNomePadraoArquivo(merged, { ext, auxiliar: isAuxiliaryPayload(merged) });

  return {
    ...data,
    file_name: nextName,
    nf_nome_original: data.nf_nome_original || currentName,
    nf_nome_renomeado: nextName,
    nome_padronizado_ia: nextName,
    nome_padronizado_status: 'renomeado_por_ia',
    nome_padronizado_regra: '01 NF <NUMERO> <RUBRICA/CARGO> - <FORNECEDOR> - MUSEUS CENTRO - <VALOR>.<EXT>',
  };
}

function buildFallbackFromIntake(intake) {
  const ia = intake?.resultado_ia || {};
  return {
    file_name_original: intake?.file_name_original || intake?.file_name_final || '',
    file_name: intake?.file_name_final || intake?.file_name_original || '',
    nf_nome_original: intake?.file_name_original || intake?.file_name_final || '',
    nf_numero: ia.nf_numero || intake?.nf_numero || '',
    nf_valor_total: ia.nf_valor_total || intake?.nf_valor_total || '',
    nf_emitente_nome: ia.nf_emitente_nome || intake?.nf_emitente_nome || '',
    nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || intake?.nf_emitente_cpf_cnpj || '',
    descricao_servico: ia.descricao_servico || ia.descricao || intake?.descricao_servico || '',
    rubrica_nome: intake?.rubrica_nome_sugerida || ia.rubrica_nome || ia.rubrica || '',
    nf_tipo_documento: intake?.tipo_detectado === 'NOTA_FISCAL_XML' ? 'xml_nf' : 'pdf_nf',
  };
}

function isDocumentoAuxiliar(intake) {
  const ia = intake?.resultado_ia || {};
  const haystack = normalizeText([
    intake?.file_name_original,
    intake?.file_name_final,
    intake?.tipo_detectado,
    intake?.classificacao,
    intake?.categoria,
    ia?.tipo_documento,
    ia?.classificacao,
    ia?.categoria,
    ia?.descricao_servico,
    ia?.descricao,
    ia?.texto_extraido,
  ].filter(Boolean).join(' '));

  const hasAuxiliarKeyword =
    haystack.includes('recibo') ||
    haystack.includes('comprovante') ||
    haystack.includes('comprovacao') ||
    haystack.includes('pagamento') ||
    haystack.includes('deposito') ||
    haystack.includes('pix') ||
    haystack.includes('transferencia') ||
    haystack.includes('boleto');

  const hasNotaKeyword =
    haystack.includes('nota fiscal') ||
    haystack.includes('nfse') ||
    haystack.includes('nfs-e') ||
    haystack.includes('danfe') ||
    haystack.includes('xml') ||
    intake?.tipo_detectado === 'NOTA_FISCAL_PDF' ||
    intake?.tipo_detectado === 'NOTA_FISCAL_XML';

  return hasAuxiliarKeyword && !hasNotaKeyword;
}

function AttachmentNamingGuard({ intake, children }) {
  const fallback = useMemo(() => buildFallbackFromIntake(intake), [intake]);

  useEffect(() => {
    const attachment = base44?.entities?.Attachment;
    const documentIntake = base44?.entities?.DocumentIntake;

    if (!attachment) return undefined;

    const originalCreate = attachment.create?.bind(attachment);
    const originalUpdate = attachment.update?.bind(attachment);
    const originalDocumentIntakeUpdate = documentIntake?.update?.bind(documentIntake);

    if (originalCreate) {
      attachment.create = async (payload = {}, ...args) => {
        const normalizedPayload = ensureNomePadrao(payload, fallback);
        return originalCreate(normalizedPayload, ...args);
      };
    }

    if (originalUpdate) {
      attachment.update = async (id, payload = {}, ...args) => {
        const shouldNormalize =
          payload?.file_name ||
          payload?.nf_nome_original ||
          payload?.nf_nome_renomeado ||
          payload?.nf_tipo_documento ||
          payload?.nf_numero ||
          payload?.nf_valor_total;

        const normalizedPayload = shouldNormalize ? ensureNomePadrao(payload, fallback) : payload;
        return originalUpdate(id, normalizedPayload, ...args);
      };
    }

    if (documentIntake && originalDocumentIntakeUpdate) {
      documentIntake.update = async (id, payload = {}, ...args) => {
        if (!payload || typeof payload !== 'object') return originalDocumentIntakeUpdate(id, payload, ...args);

        const currentName = payload.file_name_final || payload.file_name || fallback.file_name;
        const shouldNormalize =
          currentName ||
          payload?.resultado_ia?.nf_numero ||
          payload?.resultado_ia?.nf_valor_total ||
          payload?.resultado_ia?.nf_emitente_nome;

        if (!shouldNormalize) return originalDocumentIntakeUpdate(id, payload, ...args);

        const merged = {
          ...fallback,
          ...(payload.resultado_ia || {}),
          file_name: currentName,
          nf_nome_original: fallback.file_name_original,
        };
        const normalized = ensureNomePadrao(merged, fallback);

        return originalDocumentIntakeUpdate(
          id,
          {
            ...payload,
            file_name_final: normalized.file_name,
            nome_padronizado_ia: normalized.file_name,
            nome_padronizado_status: normalized.nome_padronizado_status,
            resultado_ia: payload.resultado_ia
              ? {
                  ...payload.resultado_ia,
                  file_name_final: normalized.file_name,
                  nome_padronizado_ia: normalized.file_name,
                  nome_padronizado_status: normalized.nome_padronizado_status,
                }
              : payload.resultado_ia,
          },
          ...args
        );
      };
    }

    return () => {
      if (originalCreate) attachment.create = originalCreate;
      if (originalUpdate) attachment.update = originalUpdate;
      if (documentIntake && originalDocumentIntakeUpdate) documentIntake.update = originalDocumentIntakeUpdate;
    };
  }, [fallback]);

  return children;
}

export default function ReviewModalNF(props) {
  const { intake, onClose, onSaved } = props;
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  const fallback = useMemo(() => buildFallbackFromIntake(intake), [intake]);
  const nomeAuxiliarPadronizado = useMemo(
    () => buildNomePadraoArquivo(fallback, { ext: 'pdf', auxiliar: true }),
    [fallback]
  );

  if (!isDocumentoAuxiliar(intake)) {
    return (
      <AttachmentNamingGuard intake={intake}>
        <CoordReviewModalNF {...props} />
      </AttachmentNamingGuard>
    );
  }

  async function marcarComoAnexoAuxiliar() {
    if (!intake?.id) return;

    setSaving(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        tipo_detectado: 'DOCUMENTO_COMPLEMENTAR',
        categoria: 'comprovante_recibo',
        status_processamento: 'APROVADO',
        ocultar_entrada_unica: true,
        nao_gerar_solicitacao_financeira: true,
        nao_debitar_rubrica: true,
        file_name_final: nomeAuxiliarPadronizado,
        nome_padronizado_ia: nomeAuxiliarPadronizado,
        nome_padronizado_status: isNomeNoPadrao(intake?.file_name_original || intake?.file_name_final)
          ? 'ja_estava_no_padrao'
          : 'renomeado_por_ia',
        observacao_sistema:
          'Documento auxiliar vinculado ao processo. Não gera PurchaseRequest, não debita rubrica e foi padronizado conforme regra de nomes da Entrada Única.',
        resultado_ia: {
          ...(intake?.resultado_ia || {}),
          file_name_final: nomeAuxiliarPadronizado,
          nome_padronizado_ia: nomeAuxiliarPadronizado,
          nome_padronizado_status: isNomeNoPadrao(intake?.file_name_original || intake?.file_name_final)
            ? 'ja_estava_no_padrao'
            : 'renomeado_por_ia',
        },
      });

      toast({
        title: 'Documento auxiliar registrado sem débito financeiro.',
        description: 'Recibo/comprovante foi padronizado e não soma no utilizado. O valor permanece debitado apenas pela nota fiscal.',
        duration: 4000,
      });

      await onSaved?.();
      onClose?.();
    } catch (error) {
      toast({
        title: 'Erro ao registrar documento auxiliar',
        description: error?.message || 'Falha ao atualizar documento.',
        variant: 'destructive',
        duration: 4000,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-green-600" />
            Documento auxiliar detectado
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-green-100 bg-green-50 p-4 text-sm text-green-800">
            Este arquivo parece ser recibo, comprovante ou PDF auxiliar da nota fiscal.
            Ele será registrado como anexo complementar, padronizado e não criará nova solicitação financeira.
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700 flex items-start gap-2">
            <FileText className="w-4 h-4 mt-0.5 text-slate-500" />
            <div className="min-w-0">
              <p className="font-medium truncate">{intake?.file_name_original || intake?.file_name_final || 'Documento'}</p>
              <p className="text-xs text-slate-500 mt-1">
                Novo nome sugerido: {nomeAuxiliarPadronizado}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Regra financeira: o valor deve ser somado ao utilizado apenas uma vez, pela NF principal.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              <X className="w-4 h-4 mr-1" />
              Cancelar
            </Button>
            <Button type="button" onClick={marcarComoAnexoAuxiliar} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              Registrar sem débito
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
