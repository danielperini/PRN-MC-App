import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { getNFNumber, getSupplierName, getNFValue } from '@/lib/purchaseDuplicateGuard';

export default function DuplicatePurchaseDetectedModal({ duplicate, onClose, onProceed }) {
  if (!duplicate) return null;

  const nf = getNFNumber(duplicate) || '—';
  const supplier = getSupplierName(duplicate) || duplicate.fornecedor_nome || '—';
  const value = getNFValue(duplicate);
  const status = duplicate.status || '—';

  return (
    <Dialog open={!!duplicate} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-700">
            <AlertCircle className="h-5 w-5" />
            Possível Solicitação Duplicada
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
            <div>
              <p className="text-xs text-amber-600 mb-1">Nota Fiscal</p>
              <p className="text-sm font-semibold text-amber-900">{nf}</p>
            </div>

            <div>
              <p className="text-xs text-amber-600 mb-1">Fornecedor</p>
              <p className="text-sm font-semibold text-amber-900">{supplier}</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-amber-600 mb-1">Valor</p>
                <p className="text-sm font-semibold text-amber-900">
                  {value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </p>
              </div>

              <div>
                <p className="text-xs text-amber-600 mb-1">Status</p>
                <Badge className={`${
                  status === 'PAGO' ? 'bg-green-100 text-green-800' :
                  status === 'APROVADO_ADMIN' || status === 'APROVADO_COORD' ? 'bg-blue-100 text-blue-800' :
                  status === 'SOLICITADO' ? 'bg-yellow-100 text-yellow-800' :
                  status === 'DEVOLVIDO' ? 'bg-amber-100 text-amber-800' :
                  'bg-gray-100 text-gray-800'
                }`}>
                  {status}
                </Badge>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-600">
              <strong>Atenção:</strong> Já existe uma solicitação de compra com dados similares (número da NF, fornecedor ou valor).
            </p>
          </div>

          <div className="flex flex-col gap-2">
            {duplicate.id && (
              <a
                href={`#/Compras/${duplicate.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between px-3 py-2 rounded-lg border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-sm transition"
              >
                <span>Ver solicitação existente</span>
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>

          <p className="text-xs text-gray-500">
            Você pode revisar a solicitação existente antes de prosseguir. Se for realmente uma nova compra, clique em "Prosseguir mesmo assim".
          </p>
        </div>

        <div className="flex gap-2 justify-end border-t pt-4">
          <Button
            variant="outline"
            onClick={onClose}
            className="gap-2"
          >
            Cancelar
          </Button>

          <Button
            onClick={onProceed}
            className="gap-2 bg-amber-600 hover:bg-amber-700 text-white"
          >
            Prosseguir mesmo assim
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}