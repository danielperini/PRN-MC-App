import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertCircle } from 'lucide-react';

const MIN_CHARS = 10;

/**
 * DevolverNFDialog — dialog de confirmação de devolução de NF com motivo obrigatório.
 *
 * Props:
 *   open: boolean
 *   onClose: () => void
 *   onConfirm: (motivo: string) => Promise<void>
 *   purchase: PurchaseRequest (para exibir contexto)
 */
export default function DevolverNFDialog({ open, onClose, onConfirm, purchase }) {
  const [motivo, setMotivo] = useState('');
  const [loading, setLoading] = useState(false);

  const isValid = motivo.trim().length >= MIN_CHARS;

  async function handleConfirm() {
    if (!isValid || loading) return;
    setLoading(true);
    try {
      await onConfirm(motivo.trim());
      setMotivo('');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (loading) return;
    setMotivo('');
    onClose();
  }

  const nfLabel = purchase?.nf_numero
    ? `NF ${purchase.nf_numero}`
    : purchase?.descricao_item || 'esta solicitação';

  const fornecedor = purchase?.fornecedor_nome || purchase?.nf_emitente_nome || '';

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-[420px]">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100">
              <AlertCircle className="h-4 w-4 text-red-600" />
            </div>
            <DialogTitle className="text-base">Devolver Nota Fiscal</DialogTitle>
          </div>
        </DialogHeader>

        {/* Contexto da NF */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm">
          <p className="font-medium text-gray-800">{nfLabel}</p>
          {fornecedor && <p className="text-xs text-gray-500 mt-0.5">{fornecedor}</p>}
        </div>

        {/* Textarea */}
        <div className="space-y-1">
          <label className="text-sm font-medium text-gray-700">
            Motivo da devolução <span className="text-red-500">*</span>
          </label>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Descreva o motivo da devolução e o que precisa ser corrigido…"
            className="min-h-[100px] resize-none"
            disabled={loading}
          />
          <div className="flex justify-between text-xs">
            <span className={motivo.trim().length < MIN_CHARS ? 'text-red-500' : 'text-gray-400'}>
              {motivo.trim().length < MIN_CHARS
                ? `Mínimo ${MIN_CHARS} caracteres`
                : ''}
            </span>
            <span className="text-gray-400">{motivo.length} caracteres</span>
          </div>
        </div>

        <DialogFooter className="gap-2 pt-1">
          <Button variant="outline" onClick={handleClose} disabled={loading}>
            Cancelar
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!isValid || loading}
          >
            {loading ? 'Devolvendo…' : 'Confirmar devolução'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}