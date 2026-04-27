import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, Archive, Eye, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toastMessages } from '@/lib/toastMessages';

export default function RubricaDuplicadosPanel() {
  const queryClient = useQueryClient();
  const [selecionadas, setSelecionadas] = useState(new Set());
  const [inativando, setInativando] = useState(false);
  const [expandidas, setExpandidas] = useState(new Set());
  const [confirmDialog, setConfirmDialog] = useState(null);

  const { data: auditoria = {}, isLoading, refetch } = useQuery({
    queryKey: ['auditoria-duplicatas'],
    queryFn: async () => {
      const res = await base44.functions.invoke('auditarRubricasDuplicadas', {});
      return res.data;
    }
  });

  const handleInativar = (rubroId) => {
    setConfirmDialog({
      tipo: 'inativar',
      rubricaId: rubroId,
      rubricaNome: auditoria.duplicadas
        ?.flatMap(d => d.rubricas)
        .find(r => r.id === rubroId)?.nome || ''
    });
  };

  const confirmarInativacao = async () => {
    if (!confirmDialog) return;
    
    setInativando(true);
    try {
      await base44.entities.Rubrica.update(confirmDialog.rubricaId, { ativo: false });
      
      await base44.asServiceRole.entities.AuditLog.create({
        action: 'UPDATE',
        entity_type: 'RUBRICA',
        entity_id: confirmDialog.rubricaId,
        actor_email: (await base44.auth.me()).email,
        details: `Rubrica duplicada inativada: ${confirmDialog.rubricaNome}`
      });

      toastMessages.createSuccess();
      setConfirmDialog(null);
      queryClient.invalidateQueries({ queryKey: ['auditoria-duplicatas'] });
      refetch();
    } catch (error) {
      toastMessages.createFailed(error?.message);
    } finally {
      setInativando(false);
    }
  };

  if (isLoading) {
    return <div className="p-4 text-center text-gray-500">Analisando rubricas...</div>;
  }

  if (!auditoria.totalDuplicatas || auditoria.totalDuplicatas === 0) {
    return (
      <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-sm text-green-800 font-medium">✓ Nenhuma duplicata detectada</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-900">
                {auditoria.totalDuplicatas} grupo(s) de rubricas duplicadas detectado(s)
              </p>
              <p className="text-xs text-amber-800 mt-1">
                Valor duplicado: <strong>R$ {auditoria.totalDuplicado?.toLocaleString('pt-BR')}</strong>
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              disabled={isLoading}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Atualizar
            </Button>
          </div>
        </div>

        {auditoria.duplicadas?.map((grupo, idx) => (
          <div key={idx} className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => {
                const nova = new Set(expandidas);
                if (nova.has(idx)) nova.delete(idx);
                else nova.add(idx);
                setExpandidas(nova);
              }}
              className="w-full p-4 bg-gray-50 hover:bg-gray-100 transition flex items-center justify-between"
            >
              <div className="text-left">
                <p className="font-medium text-gray-900">{grupo.chaveNormalizada}</p>
                <p className="text-xs text-gray-500 mt-1">
                  {grupo.quantidade} versões • R$ {grupo.valorTotalDuplicado?.toLocaleString('pt-BR')}
                </p>
              </div>
              <Eye className={`w-4 h-4 text-gray-400 transition ${expandidas.has(idx) ? 'rotate-0' : '-rotate-90'}`} />
            </button>

            {expandidas.has(idx) && (
              <div className="p-4 space-y-3 border-t">
                {grupo.rubricas.map((r, rIdx) => (
                  <div key={rIdx} className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{r.nome}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {r.grupo} {r.centro_custo && `• ${r.centro_custo}`}
                        </p>
                        <p className="text-sm font-semibold text-gray-700 mt-2">
                          R$ {r.valor_total?.toLocaleString('pt-BR')}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          Criado em {new Date(r.created_date).toLocaleDateString('pt-BR')}
                        </p>
                      </div>

                      {rIdx > 0 && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleInativar(r.id)}
                          disabled={inativando}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 gap-2"
                        >
                          <Archive className="w-4 h-4" />
                          Inativar
                        </Button>
                      )}

                      {rIdx === 0 && (
                        <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                          Manter
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-600 p-2 bg-blue-50 rounded border border-blue-200">
                  💡 {grupo.sugestao}
                </p>
              </div>
            )}
          </div>
        ))}
      </div>

      <Dialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Inativação</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Tem certeza que deseja inativar a rubrica <strong>{confirmDialog?.rubricaNome}</strong>?
          </p>
          <p className="text-xs text-gray-500 mt-2">
            A rubrica não será deletada, apenas inativada. Você poderá reativar depois se necessário.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialog(null)} disabled={inativando}>
              Cancelar
            </Button>
            <Button
              onClick={confirmarInativacao}
              disabled={inativando}
              className="bg-red-600 hover:bg-red-700 text-white gap-2"
            >
              {inativando && <Loader2 className="w-4 h-4 animate-spin" />}
              Inativar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}