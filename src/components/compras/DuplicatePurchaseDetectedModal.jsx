import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ExternalLink, CheckCircle2, Wallet } from 'lucide-react';
import { getNFNumber, getSupplierName, getNFValue } from '@/lib/purchaseDuplicateGuard';
import { base44 } from '@/api/base44Client';

export default function DuplicatePurchaseDetectedModal({ duplicate, onClose, onProceed, onIgnore }) {
  const [rubricaInfo, setRubricaInfo] = useState(null);
  const [loadingRubrica, setLoadingRubrica] = useState(false);

  useEffect(() => {
    if (!duplicate?.rubrica_id) return;
    setLoadingRubrica(true);
    base44.entities.Rubrica.get(duplicate.rubrica_id)
      .then((r) => {
        if (r) {
          setRubricaInfo({
            nome: r.rubrica || r.nome || '—',
            valor_utilizado: r.valor_utilizado || 0,
            valor_rubrica: r.valor_rubrica || r.valor_total || 0,
            saldo: r.saldo || 0,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoadingRubrica(false));
  }, [duplicate?.rubrica_id]);

  if (!duplicate) return null;

  const nf = getNFNumber(duplicate) || '—';
  const supplier = getSupplierName(duplicate) || duplicate.fornecedor_nome || '—';
  const value = getNFValue(duplicate);
  const status = duplicate.status || '—';
  const jaDebitado = !!duplicate?.rubrica_debitada_em;
  const valorDebitado = duplicate?.rubrica_debitada_valor || duplicate?.valor_solicitado || value;

  const statusColor = 
    status === 'PAGO' ? 'bg-green-100 text-green-800' :
    status === 'APROVADO_ADMIN' || status === 'APROVADO_COORD' || status === 'APROVADO' ? 'bg-blue-100 text-blue-800' :
    status === 'SOLICITADO' ? 'bg-yellow-100 text-yellow-800' :
    status === 'DEVOLVIDO' ? 'bg-amber-100 text-amber-800' :
    'bg-gray-100 text-gray-800';

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
                <Badge className={statusColor}>
                  {status}
                </Badge>
              </div>
            </div>

            {/* Info de débito na rubrica */}
            {(jaDebitado || duplicate?.rubrica_id) && (
              <div className="rounded-md border border-amber-200 bg-white/60 p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <Wallet className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-xs font-medium text-amber-700">
                    {jaDebitado ? 'Valor debitado na rubrica' : 'Rubrica vinculada (ainda não debitada)'}
                  </span>
                </div>
                {rubricaInfo && (
                  <div className="text-xs text-amber-800 space-y-0.5 pl-5">
                    <p><strong>Rubrica:</strong> {rubricaInfo.nome}</p>
                    <p><strong>Valor debitado:</strong> {valorDebitado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                    <p><strong>Total utilizado:</strong> {rubricaInfo.valor_utilizado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                    <p><strong>Saldo disponível:</strong> {rubricaInfo.saldo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                )}
                {loadingRubrica && (
                  <p className="text-xs text-amber-500 pl-5">Carregando dados da rubrica...</p>
                )}
                {!rubricaInfo && !loadingRubrica && duplicate?.rubrica_id && (
                  <p className="text-xs text-amber-500 pl-5">Rubrica: {duplicate.rubrica_nome || duplicate.rubrica_id}</p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-xs text-gray-600">
              <strong>Atenção:</strong> Já existe uma solicitação de compra com dados similares (número da NF, fornecedor, valor e data).
              {jaDebitado && ' O valor desta nota já foi debitado da rubrica vinculada.'}
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
            Se esta nota já foi lançada e debitada, escolha "Ignorar duplicata". Se for realmente uma nova compra distinta, clique em "Prosseguir mesmo assim".
          </p>
        </div>

        <div className="flex gap-2 justify-end border-t pt-4 flex-wrap">
          <Button
            variant="outline"
            onClick={onClose}
            className="gap-2"
          >
            Cancelar
          </Button>

          {onIgnore && (
            <Button
              variant="outline"
              onClick={onIgnore}
              className="gap-2 border-green-200 text-green-700 hover:bg-green-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              Ignorar duplicata – manter a existente
            </Button>
          )}

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