import React, { useMemo, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, Upload, FileText, X, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  notifyPaymentCompleted,
  notifyPaymentProofAttached
} from '@/services/notifications/paymentNotifications';
import { uploadNotaFiscalToDrive } from '@/lib/uploadNotaFiscalToDrive';

function toNum(value) {
  if (value === null || value === undefined || value === '') return 0;

  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const normalized = String(value)
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(toNum(value));
}

function getPurchaseValue(purchase = {}) {
  return (
    toNum(purchase.valor_pago) ||
    toNum(purchase.valor_aprovado_admin) ||
    toNum(purchase.valor_aprovado) ||
    toNum(purchase.valor_final) ||
    toNum(purchase.valor_solicitado) ||
    toNum(purchase.valor_total) ||
    toNum(purchase.valor) ||
    toNum(purchase.rubrica_debitada_valor) ||
    0
  );
}

function getPessoaFornecedor(purchase = {}) {
  return (
    purchase.fornecedor_nome ||
    purchase.nf_emitente_nome ||
    purchase.prestador_nome ||
    purchase.solicitante_nome ||
    purchase.created_by ||
    ''
  );
}

function getCpfCnpj(purchase = {}) {
  return (
    purchase.fornecedor_cpf_cnpj ||
    purchase.fornecedor_cnpj ||
    purchase.nf_emitente_cpf_cnpj ||
    purchase.cnpj ||
    purchase.cpf ||
    ''
  );
}

function getNumeroNF(purchase = {}) {
  return purchase.nf_numero || purchase.numero_nf || purchase.nota_fiscal_numero || '';
}

function getReceiptUrl(purchase = {}) {
  return (
    purchase.comprovante_pagamento_url ||
    purchase.comprovante_url ||
    purchase.payment_receipt_url ||
    purchase.recibo_url ||
    ''
  );
}

function compareValues(expectedValue, extractedValue) {
  const expected = toNum(expectedValue);
  const extracted = toNum(extractedValue);

  if (!expected || !extracted) return null;

  return Math.abs(expected - extracted) <= 0.05;
}

async function tryAnalyzeReceipt({ purchase, comprovanteUrl, expectedValue }) {
  if (!comprovanteUrl) return { available: false };

  try {
    const response = await base44.functions.invoke('analisarComprovantePagamento', {
      purchaseId: purchase.id,
      comprovanteUrl,
      valorEsperado: expectedValue
    });

    const data = response?.data || response || {};
    const valorExtraido =
      data.valor_pago ||
      data.valor ||
      data.valor_total ||
      data.extracted?.valor_pago ||
      data.extracted?.valor ||
      null;

    return {
      available: true,
      raw: data,
      valorExtraido,
      valorCompativel: compareValues(expectedValue, valorExtraido)
    };
  } catch (error) {
    console.warn('Leitura automatica do comprovante indisponivel:', error);
    return {
      available: false,
      error: error?.message || 'Leitura automatica indisponivel'
    };
  }
}

async function createPaymentDocumentRecord({ purchase, comprovanteUrl, fileName, currentUser }) {
  if (!comprovanteUrl || !base44.entities?.DocumentIntake?.create) return;

  try {
    await base44.entities.DocumentIntake.create({
      tipo_documento: 'COMPROVANTE_PAGAMENTO',
      tipo_detectado: 'COMPROVANTE_PAGAMENTO',
      origem: 'Compras',
      entidade_destino: 'PurchaseRequest',
      entidade_destino_id: purchase.id,
      purchase_id: purchase.id,
      purchase_request_id: purchase.id,
      fornecedor: getPessoaFornecedor(purchase),
      fornecedor_nome: getPessoaFornecedor(purchase),
      valor: getPurchaseValue(purchase),
      numero_nf: getNumeroNF(purchase),
      mes_referencia: purchase.mes_referencia || purchase.mes || '',
      ano: purchase.ano || purchase.ano_referencia || '',
      file_url: comprovanteUrl,
      arquivo_original_url: comprovanteUrl,
      comprovante_pagamento_url: comprovanteUrl,
      comprovante_drive_url: purchase.comprovante_drive_url || '',
      comprovante_drive_file_id: purchase.comprovante_drive_file_id || '',
      comprovante_drive_folder_path: purchase.comprovante_drive_folder_path || '',
      comprovante_drive_backup_status: purchase.comprovante_drive_backup_status || '',
      filename: fileName || 'comprovante-pagamento.pdf',
      nome_arquivo: fileName || 'comprovante-pagamento.pdf',
      criado_por: currentUser?.email || '',
      created_by_email: currentUser?.email || ''
    });
  } catch (error) {
    console.warn('Comprovante salvo na solicitacao, mas nao registrado na gestao documental:', error);
  }
}

async function createPaymentAuditRecord({ purchase, currentUser, action, comprovanteUrl }) {
  const AuditLog = base44.entities?.AuditLog || base44.entities?.AuditTrail;
  if (!AuditLog?.create) return;

  try {
    await AuditLog.create({
      action,
      entidade: 'PurchaseRequest',
      entity_type: 'PurchaseRequest',
      entidade_id: purchase.id,
      entity_id: purchase.id,
      usuario: currentUser?.email || '',
      user_email: currentUser?.email || '',
      valor: getPurchaseValue(purchase),
      comprovante_url: comprovanteUrl || '',
      data_evento: new Date().toISOString(),
      detalhes: `${action} para solicitacao ${purchase.id}`
    });
  } catch (error) {
    console.warn('Falha ao registrar auditoria de pagamento:', error);
  }
}

export default function PagarSolicitacaoDialog({ purchase, currentUser, onClose, onSuccess }) {
  const [comprovanteFile, setComprovanteFile] = useState(null);
  const [comprovanteUrl, setComprovanteUrl] = useState(getReceiptUrl(purchase));
  const [uploading, setUploading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [analysisMessage, setAnalysisMessage] = useState('');
  const fileRef = useRef(null);

  const valorSolicitacao = useMemo(() => getPurchaseValue(purchase), [purchase]);
  const fornecedor = useMemo(() => getPessoaFornecedor(purchase), [purchase]);
  const cpfCnpj = useMemo(() => getCpfCnpj(purchase), [purchase]);
  const numeroNF = useMemo(() => getNumeroNF(purchase), [purchase]);
  const hasExistingReceipt = !!getReceiptUrl(purchase);

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type && file.type !== 'application/pdf') {
      toast.error('Anexe o comprovante em PDF.');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Anexe o comprovante em PDF.');
      return;
    }

    setUploading(true);
    setAnalysisMessage('');

    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      const url = result?.file_url || result?.data?.file_url || result?.url || '';

      if (!url) {
        throw new Error('O upload foi concluido sem URL de arquivo.');
      }

      setComprovanteFile({ name: file.name, url, file });
      setComprovanteUrl(url);
      toast.success('Comprovante carregado.');
    } catch (error) {
      console.error('Erro ao enviar comprovante:', error);
      toast.error(`Erro ao enviar comprovante: ${error.message}`);
    } finally {
      setUploading(false);
    }
  }

  async function savePayment({ withoutReceipt = false } = {}) {
    if (!purchase?.id) return;

    if (!withoutReceipt && !comprovanteUrl) {
      toast.error('Anexe um comprovante ou use "Sem comprovante - adicionar depois".');
      return;
    }

    setSalvando(true);
    setAnalysisMessage('');

    try {
      let analysis = { available: false };

      if (!withoutReceipt && comprovanteUrl) {
        analysis = await tryAnalyzeReceipt({
          purchase,
          comprovanteUrl,
          expectedValue: valorSolicitacao
        });

        if (analysis.available && analysis.valorCompativel === true) {
          setAnalysisMessage('Valor do comprovante compativel com a solicitacao.');
          toast.success('Valor do comprovante compativel com a solicitacao.');
        } else if (analysis.available && analysis.valorCompativel === false) {
          setAnalysisMessage('Valor do comprovante diferente do valor da solicitacao. Revise antes de concluir.');
          toast.warning('Valor do comprovante diverge da solicitacao. Revise.');
        } else {
          setAnalysisMessage('Nao foi possivel ler automaticamente o comprovante. O arquivo foi anexado a solicitacao.');
          toast.warning('Nao foi possivel ler automaticamente o comprovante.');
        }
      }

      const paidAt = purchase.pago_em || purchase.data_pagamento || new Date().toISOString();
      const receiptName =
        comprovanteFile?.name ||
        purchase.comprovante_pagamento_nome ||
        purchase.comprovante_nome ||
        '';
      const nextComprovanteUrl = withoutReceipt ? getReceiptUrl(purchase) : comprovanteUrl;
      const nextHasReceipt = !!nextComprovanteUrl;
      let driveBackup = null;

      if (!withoutReceipt && comprovanteFile?.file) {
        try {
          driveBackup = await uploadNotaFiscalToDrive(comprovanteFile.file, {
            categoria: 'COMPROVANTE_PAGAMENTO',
            fornecedor,
            valor: valorSolicitacao,
            dataReferencia: paidAt,
            numero_nf: numeroNF,
            purchaseId: purchase.id
          });
        } catch (error) {
          console.warn('Comprovante anexado, mas backup no Drive nao foi concluido:', error);
          toast.warning('Comprovante anexado a solicitacao. Backup no Drive nao disponivel neste momento.');
        }
      }

      const updatePayload = {
        status: 'PAGO',
        pago_em: paidAt,
        data_pagamento: paidAt,
        pago_por: purchase.pago_por || currentUser?.email || '',
        payment_marked_by: purchase.payment_marked_by || currentUser?.email || '',
        comprovante_pendente: !nextHasReceipt,
        comprovante_pagamento_url: nextComprovanteUrl || null,
        comprovante_url: nextComprovanteUrl || null,
        payment_receipt_url: nextComprovanteUrl || null,
        comprovante_pagamento_nome: nextHasReceipt ? receiptName : '',
        comprovante_pagamento_tipo: nextHasReceipt ? 'COMPROVANTE_DEPOSITO' : '',
        comprovante_valor_extraido: analysis?.valorExtraido || null,
        comprovante_valor_compativel:
          typeof analysis?.valorCompativel === 'boolean' ? analysis.valorCompativel : null,
        comprovante_leitura_ia_status: analysis?.available ? 'processado' : 'indisponivel',
        comprovante_drive_url: driveBackup?.drive_pdf_link || driveBackup?.fileUrl || driveBackup?.downloadUrl || purchase.comprovante_drive_url || '',
        comprovante_drive_file_id: driveBackup?.fileId || driveBackup?.drive_file_id || purchase.comprovante_drive_file_id || '',
        comprovante_drive_folder_path: driveBackup?.folderPath || purchase.comprovante_drive_folder_path || '',
        comprovante_drive_backup_status: driveBackup ? 'CONCLUIDO' : (!withoutReceipt && comprovanteFile?.file ? 'ERRO' : (purchase.comprovante_drive_backup_status || ''))
      };

      await base44.entities.PurchaseRequest.update(purchase.id, updatePayload);

      const updatedPurchase = {
        ...purchase,
        ...updatePayload
      };

      if (!withoutReceipt && comprovanteUrl) {
        await createPaymentDocumentRecord({
          purchase: updatedPurchase,
          comprovanteUrl,
          fileName: receiptName,
          currentUser
        });
      }

      await createPaymentAuditRecord({
        purchase: updatedPurchase,
        currentUser,
        action: withoutReceipt ? 'Solicitacao marcada como paga sem comprovante' : 'Comprovante de pagamento anexado',
        comprovanteUrl: withoutReceipt ? '' : comprovanteUrl
      });

      await notifyPaymentCompleted(updatedPurchase, currentUser).catch((error) => {
        console.warn('Falha ao notificar pagamento:', error);
      });

      if (!withoutReceipt && comprovanteUrl) {
        await notifyPaymentProofAttached(updatedPurchase, currentUser).catch((error) => {
          console.warn('Falha ao notificar comprovante de pagamento:', error);
        });
      }

      toast.success(
        withoutReceipt && !nextHasReceipt
          ? 'Solicitacao marcada como paga sem comprovante.'
          : hasExistingReceipt
            ? 'Comprovante anexado a solicitacao.'
            : 'Comprovante anexado e solicitacao marcada como paga.'
      );

      onSuccess?.(updatedPurchase);
      onClose?.();
    } catch (error) {
      console.error('Erro ao marcar solicitacao como paga:', error);
      toast.error(`Erro ao marcar solicitacao como paga: ${error.message}`);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Marcar solicitacao como paga
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <p className="text-sm leading-relaxed text-gray-600">
            Anexe o comprovante de deposito ou transferencia em PDF. O arquivo sera
            vinculado a solicitacao e podera ser comparado com o valor da nota fiscal.
            Se o comprovante ainda nao estiver disponivel, marque como pago sem
            comprovante e adicione o arquivo depois.
          </p>

          <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm md:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Descricao</p>
              <p className="mt-1 font-semibold text-gray-900">
                {purchase.descricao_item || purchase.objeto || 'Sem descricao'}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Fornecedor</p>
              <p className="mt-1 font-semibold text-gray-900">{fornecedor || 'Nao informado'}</p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">CPF/CNPJ</p>
              <p className="mt-1 text-gray-700">{cpfCnpj || 'Nao informado'}</p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Valor</p>
              <p className="mt-1 font-bold text-gray-900">{fmtBRL(valorSolicitacao)}</p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Nota fiscal</p>
              <p className="mt-1 text-gray-700">{numeroNF || 'Nao informada'}</p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Status atual</p>
              <p className="mt-1 text-gray-700">{purchase.status || 'Nao informado'}</p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Rubrica</p>
              <p className="mt-1 text-gray-700">
                {purchase.rubrica_nome || purchase.rubrica || purchase.rubrica_id || 'Nao informada'}
              </p>
            </div>

            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Centro de custo</p>
              <p className="mt-1 text-gray-700">{purchase.centro_custo || 'Nao informado'}</p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-gray-900">
              Comprovante de deposito / transferencia em PDF
            </label>

            <div
              className="cursor-pointer rounded-xl border-2 border-dashed border-gray-300 p-5 text-center transition-colors hover:border-black"
              onClick={() => fileRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  fileRef.current?.click();
                }
              }}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-sm">Enviando comprovante...</span>
                </div>
              ) : comprovanteUrl ? (
                <div className="flex items-center justify-between gap-3 px-2">
                  <div className="flex min-w-0 items-center gap-2 text-green-700">
                    <FileText className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate text-sm font-medium">
                      {comprovanteFile?.name || purchase.comprovante_pagamento_nome || 'Comprovante anexado'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setComprovanteFile(null);
                      setComprovanteUrl('');
                      setAnalysisMessage('');
                    }}
                    className="rounded-md p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remover comprovante selecionado"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Upload className="h-6 w-6" />
                  <span className="text-sm">Clique para selecionar o PDF do comprovante</span>
                </div>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              onChange={handleFileChange}
            />

            <p className="text-xs text-gray-400">
              O pagamento nao debita rubrica novamente. A rubrica permanece vinculada ao
              momento de aprovacao da solicitacao.
            </p>
          </div>

          {analysisMessage && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              {analysisMessage}
            </div>
          )}

          {!comprovanteUrl && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
              O comprovante pode ser anexado agora ou posteriormente.
            </div>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={salvando || uploading}>
            Cancelar
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="border-amber-300 text-amber-800 hover:bg-amber-50"
            onClick={() => savePayment({ withoutReceipt: true })}
            disabled={salvando || uploading}
          >
            {salvando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Sem comprovante - adicionar depois
          </Button>

          <Button
            size="sm"
            className="gap-2 bg-green-700 text-white hover:bg-green-800"
            onClick={() => savePayment({ withoutReceipt: false })}
            disabled={salvando || uploading || !comprovanteUrl}
          >
            {salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle className="h-4 w-4" />}
            {salvando ? 'Salvando...' : 'Salvar comprovante e marcar como pago'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
