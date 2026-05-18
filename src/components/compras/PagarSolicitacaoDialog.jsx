import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle, Upload, FileText, X, Loader2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { notifyPaymentCompleted, notifyPaymentProofAttached } from '@/services/notifications/paymentNotifications';

function toNum(v) {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  return `R$ ${toNum(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

export default function PagarSolicitacaoDialog({ purchase, currentUser, onClose, onSuccess }) {
  const [comprovanteFile, setComprovanteFile] = useState(null);
  const [comprovanteUrl, setComprovanteUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const fileRef = useRef(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Apenas arquivos PDF são aceitos para comprovante.');
      return;
    }
    setUploading(true);
    try {
      const result = await base44.integrations.Core.UploadFile({ file });
      const url = result?.file_url || result?.data?.file_url || '';
      if (!url) throw new Error('Upload sem URL');
      setComprovanteFile({ name: file.name, url });
      setComprovanteUrl(url);
      toast.success('Comprovante carregado.');
    } catch (e) {
      toast.error('Erro ao enviar arquivo: ' + e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleConfirmar() {
    if (!comprovanteUrl) {
      toast.error('Anexe o comprovante de pagamento (PDF) antes de confirmar.');
      return;
    }
    setSalvando(true);
    try {
      const res = await base44.functions.invoke('vincularComprovantePagamento', {
        comprovanteUrl,
        purchaseId: purchase.id,
      });
      if (res.data?.success) {
        const updatedPurchase = {
          ...purchase,
          status: 'PAGO',
          comprovante_pagamento_url: comprovanteUrl,
          comprovante_url: comprovanteUrl,
        };
        await notifyPaymentCompleted(updatedPurchase, currentUser).catch((error) => {
          console.warn('Falha ao notificar pagamento:', error);
        });
        await notifyPaymentProofAttached(updatedPurchase, currentUser).catch((error) => {
          console.warn('Falha ao notificar comprovante de pagamento:', error);
        });
        toast.success('Pagamento registrado com comprovante.');
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.data?.error || 'Erro ao registrar pagamento.');
      }
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            Registrar Pagamento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Resumo da solicitação */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-sm">
            <p className="font-semibold text-black">{purchase.descricao_item}</p>
            <p className="text-gray-600">Fornecedor: <span className="text-black">{purchase.fornecedor_nome || '—'}</span></p>
            <p className="text-gray-600">Valor: <span className="font-bold text-black">{fmtBRL(purchase.valor_solicitado)}</span></p>
            {purchase.numero_processamento && (
              <p className="text-gray-500 text-xs font-mono">Nº {purchase.numero_processamento}</p>
            )}
          </div>

          {/* Upload do comprovante */}
          <div className="space-y-2">
            <label className="text-sm font-semibold text-black block">
              Comprovante de Depósito / Transferência (PDF) *
            </label>

            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center cursor-pointer hover:border-black transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <div className="flex flex-col items-center gap-2 text-gray-500">
                  <Loader2 className="w-6 h-6 animate-spin" />
                  <span className="text-sm">Enviando...</span>
                </div>
              ) : comprovanteFile ? (
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-2 text-green-700">
                    <FileText className="w-4 h-4" />
                    <span className="text-sm font-medium truncate max-w-[200px]">{comprovanteFile.name}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setComprovanteFile(null); setComprovanteUrl(''); }}
                    className="text-gray-400 hover:text-red-500"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Upload className="w-6 h-6" />
                  <span className="text-sm">Clique para selecionar o PDF do comprovante</span>
                </div>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={handleFileChange}
            />

            <p className="text-xs text-gray-400">
              Somente PDF. O comprovante será vinculado à solicitação e registrado com data/hora.
            </p>
          </div>

          {!comprovanteUrl && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              O comprovante é obrigatório para registrar o pagamento.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="ghost" size="sm" onClick={onClose}>Cancelar</Button>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white gap-2"
            onClick={handleConfirmar}
            disabled={salvando || !comprovanteUrl}
          >
            {salvando ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {salvando ? 'Registrando...' : 'Confirmar Pagamento'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
