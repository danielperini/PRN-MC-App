import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { base44 } from '@/api/base44Client';
import { AlertCircle, Loader2, CheckCircle2, RotateCw, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function CoordReviewModalNF({ purchase, intake, onClose, onSaved }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [showMotivo, setShowMotivo] = useState(false);

  const hasProblems = (intake?.erros_validacao || []).length > 0;

  async function handleDevolverParaAjuste() {
    if (!motivoRejeicao.trim()) {
      toast({ title: 'Descreva o motivo da devolução.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // Atualiza a compra para status DEVOLVIDO
      await base44.entities.PurchaseRequest.update(purchase.id, {
        status: 'DEVOLVIDO',
        comentario_rejeicao: motivoRejeicao,
        rejected_by: (await base44.auth.me()).email,
        rejected_at: new Date().toISOString(),
      });

      // Atualiza o DocumentIntake
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'AGUARDANDO_REVISAO',
      });

      toast({
        title: 'Documento devolvido.',
        description: 'O usuário receberá a notificação para ajustar e reenviar.',
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao devolver', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function handleDeletarDocumento() {
    if (!confirm('Tem certeza que deseja deletar este documento? Esta ação não pode ser desfeita.')) return;

    setLoading(true);
    try {
      // Marca como deletado
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'DELETADO',
      });

      // Deleta a compra se existir
      if (purchase.id) {
        try {
          await base44.asServiceRole.entities.PurchaseRequest.delete(purchase.id);
        } catch (e) {
          console.warn('Aviso: não foi possível deletar a compra:', e.message);
        }
      }

      toast({ title: 'Documento deletado com sucesso.' });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao deletar', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  async function handleAprovarMesmoComErros() {
    setLoading(true);
    try {
      // Chama a função de aprovação
      const res = await base44.functions.invoke('purchaseActions', {
        action: 'approve_coord',
        purchaseId: purchase.id,
        comentario: `Aprovado mesmo com inconsistências: ${
          (intake.erros_validacao || []).slice(0, 2).join('; ') || 'Análise manual confirmada'
        }`,
      });

      if (!res.data?.success) {
        throw new Error(res.data?.error || 'Erro na aprovação');
      }

      toast({
        title: 'Documento aprovado.',
        description: 'A compra foi aprovada e o valor foi debitado da rubrica.',
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao aprovar', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            Revisão de Nota Fiscal - Coordenador
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Informações do documento */}
          <div className="bg-slate-50 p-4 rounded-lg space-y-2">
            <p className="text-sm">
              <span className="font-medium">NF:</span> {intake?.nf_numero}
            </p>
            <p className="text-sm">
              <span className="font-medium">Fornecedor:</span> {intake?.nf_emitente_nome}
            </p>
            <p className="text-sm">
              <span className="font-medium">Valor:</span> R$ {parseFloat(intake?.nf_valor_total || 0).toFixed(2)}
            </p>
          </div>

          {/* Problemas detectados */}
          {hasProblems && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-2">
              <p className="font-medium text-red-900 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                Inconsistências detectadas:
              </p>
              <ul className="text-sm text-red-800 space-y-1">
                {(intake.erros_validacao || []).map((erro, i) => (
                  <li key={i}>• {erro}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Opções de ação */}
          <div className="space-y-3 border-t pt-4">
            <p className="text-sm font-medium text-slate-700">O que deseja fazer?</p>

            {/* Devolver */}
            <div className="space-y-2">
              <Button
                variant="outline"
                className="w-full justify-start text-left"
                onClick={() => setShowMotivo(!showMotivo)}
              >
                <RotateCw className="w-4 h-4 mr-2 flex-shrink-0" />
                <span className="flex-1">Devolver para o usuário ajustar</span>
              </Button>
              {showMotivo && (
                <div className="bg-slate-50 p-3 rounded-lg space-y-2 ml-2">
                  <label className="text-xs font-medium text-slate-700">
                    Motivo da devolução
                  </label>
                  <Textarea
                    placeholder="Descreva o que precisa ser ajustado ou corrigido..."
                    value={motivoRejeicao}
                    onChange={(e) => setMotivoRejeicao(e.target.value)}
                    className="text-sm h-24"
                  />
                  <Button
                    onClick={handleDevolverParaAjuste}
                    disabled={loading || !motivoRejeicao.trim()}
                    className="w-full bg-amber-600 hover:bg-amber-700"
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    Devolver e Notificar
                  </Button>
                </div>
              )}
            </div>

            {/* Deletar */}
            <Button
              variant="destructive"
              className="w-full justify-start"
              onClick={handleDeletarDocumento}
              disabled={loading}
            >
              <Trash2 className="w-4 h-4 mr-2 flex-shrink-0" />
              Deletar este documento
            </Button>

            {/* Aprovar mesmo com erros */}
            <Button
              className="w-full justify-start bg-green-600 hover:bg-green-700"
              onClick={handleAprovarMesmoComErros}
              disabled={loading}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2 flex-shrink-0" />}
              {hasProblems ? 'Aprovar mesmo com inconsistências' : 'Aprovar'}
            </Button>
          </div>

          {/* Aviso */}
          <div className="p-2 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
            💡 Se aprovar, o valor será debitado imediatamente da rubrica. Se devolver, o usuário poderá trocar o arquivo ou deletar.
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}