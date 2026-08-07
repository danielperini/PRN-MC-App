import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, FilePenLine, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';

const LOTE = 20;

export default function RenomearNFsBancoDialog({ open, onOpenChange }) {
  const queryClient = useQueryClient();
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [preview, setPreview] = useState(null);
  const [executando, setExecutando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0, lote: 0, totalLotes: 0 });
  const [resumo, setResumo] = useState(null);

  async function carregarPreview() {
    setLoadingPreview(true);
    setResumo(null);
    try {
      const resp = await base44.functions.invoke('renomearNFsBancoLote', {
        dry_run: true, offset: 0, limit: LOTE,
      });
      const d = resp?.data || resp;
      setPreview(d);
    } catch (err) {
      toast.error('Falha ao gerar preview: ' + (err?.message || 'erro desconhecido'));
    } finally {
      setLoadingPreview(false);
    }
  }

  async function confirmarERenomear() {
    if (!preview) return;
    const total = preview.total_alvos || 0;
    const totalLotes = Math.ceil(total / LOTE);
    setExecutando(true);
    setResumo(null);
    setProgresso({ atual: 0, total, lote: 0, totalLotes });

    let ok = 0, pulado = 0, erro = 0, jaPadrao = 0;
    for (let offset = 0; offset < total; offset += LOTE) {
      const loteNum = Math.floor(offset / LOTE) + 1;
      setProgresso((p) => ({ ...p, lote: loteNum }));
      try {
        const resp = await base44.functions.invoke('renomearNFsBancoLote', {
          dry_run: false, offset, limit: LOTE,
        });
        const d = resp?.data || resp;
        const s = d?.stats || {};
        ok += s.ok || 0;
        pulado += s.pulado || 0;
        erro += s.erro || 0;
        jaPadrao += s.ja_padrao || 0;
      } catch (err) {
        toast.error(`Erro no lote ${loteNum}: ` + (err?.message || 'erro'));
      }
      setProgresso((p) => ({ ...p, atual: Math.min(p.total, p.atual + LOTE) }));
    }

    setResumo({ ok, pulado, erro, ja_padrao: jaPadrao, total });
    setExecutando(false);
    setPreview(null);
    await queryClient.invalidateQueries({ queryKey: ['backup-drive-aprovadas'] });
    await queryClient.refetchQueries({ queryKey: ['backup-drive-aprovadas'] }).catch(() => {});
    toast.success(`Concluído: ${ok} renomeado(s), ${pulado} pulado(s), ${erro} erro(s).`);
  }

  function handleClose() {
    if (executando) return;
    onOpenChange(false);
    if (!executando) {
      setPreview(null);
      setResumo(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else onOpenChange(true); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FilePenLine className="h-5 w-5" />
            Corrigir Nomes no Drive
          </DialogTitle>
          <DialogDescription>
            Renomeia os PDFs de NF no Google Drive para o padrão canônico
            <code className="mx-1 rounded bg-gray-100 px-1 text-[11px]">
              NF {'{nº}'} {'{descrição}'} - {'{fornecedor}'} - {'{centro custo}'} - R$ {'{valor}'}.pdf
            </code>
            a partir dos PurchaseRequests com backup do Drive concluído.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!preview && !resumo && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
              <p>
                Clique em <strong>Gerar preview</strong> para simular a renomeação do primeiro lote
                ({LOTE} arquivos) sem alterar nada. Serão exibidos 5 exemplos antes → depois.
              </p>
            </div>
          )}

          {loadingPreview && (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Gerando preview...
            </div>
          )}

          {preview && !executando && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-gray-200 p-2 text-center">
                  <p className="text-xs text-gray-500">Total candidatos</p>
                  <p className="text-lg font-semibold text-gray-900">{preview.total_alvos}</p>
                </div>
                <div className="rounded-lg border border-green-200 bg-green-50 p-2 text-center">
                  <p className="text-xs text-green-700">A renomear (lote)</p>
                  <p className="text-lg font-semibold text-green-700">{preview.stats?.ok ?? 0}</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-center">
                  <p className="text-xs text-amber-700">Pulados (lote)</p>
                  <p className="text-lg font-semibold text-amber-700">{preview.stats?.pulado ?? 0}</p>
                </div>
                <div className="rounded-lg border border-blue-100 bg-blue-50 p-2 text-center">
                  <p className="text-xs text-blue-700">Já no padrão (lote)</p>
                  <p className="text-lg font-semibold text-blue-700">{preview.stats?.ja_padrao ?? 0}</p>
                </div>
              </div>
              {preview.amostra?.length > 0 && (
                <div className="rounded-lg border border-gray-200">
                  <p className="border-b border-gray-100 px-3 py-2 text-xs font-medium text-gray-500">
                    Exemplos (antes → depois)
                  </p>
                  <ScrollArea className="h-48">
                    <div className="divide-y divide-gray-100">
                      {preview.amostra.map((ex) => (
                        <div key={ex.pr_id} className="px-3 py-2 text-xs">
                          <p className="text-red-500 line-through truncate">{ex.de || '(vazio)'}</p>
                          <p className="text-green-600 truncate">{ex.para}</p>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          {executando && (
            <div className="space-y-3">
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="text-blue-700">
                    Lote {progresso.lote}/{progresso.totalLotes} — renomeando...
                  </span>
                  <span className="text-blue-700">{progresso.atual}/{progresso.total}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-blue-100">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{
                      width: `${progresso.total ? (progresso.atual / progresso.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
              <p className="text-xs text-gray-400">Não feche a janela até concluir.</p>
            </div>
          )}

          {resumo && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3">
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  <div>
                    <p className="text-xs text-green-700">Renomeados</p>
                    <p className="text-lg font-semibold text-green-700">{resumo.ok}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="text-xs text-amber-700">Pulados</p>
                    <p className="text-lg font-semibold text-amber-700">{resumo.pulado}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3">
                  <CheckCircle2 className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="text-xs text-blue-700">Já no padrão</p>
                    <p className="text-lg font-semibold text-blue-700">{resumo.ja_padrao}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3">
                  <XCircle className="h-5 w-5 text-red-600" />
                  <div>
                    <p className="text-xs text-red-700">Erros</p>
                    <p className="text-lg font-semibold text-red-700">{resumo.erro}</p>
                  </div>
                </div>
              </div>
              <p className="text-center text-xs text-gray-500">
                Total processado: {resumo.total} PurchaseRequest(s)
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          {resumo ? (
            <Button variant="outline" onClick={handleClose}>Fechar</Button>
          ) : executando ? (
            <Button disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Renomeando...
            </Button>
          ) : !preview ? (
            <>
              <Button variant="outline" onClick={handleClose} disabled={loadingPreview}>
                Cancelar
              </Button>
              <Button onClick={carregarPreview} disabled={loadingPreview}>
                {loadingPreview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Gerar preview
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setPreview(null)} disabled={executando}>
                Voltar
              </Button>
              <Button onClick={confirmarERenomear} disabled={executando || preview.total_alvos === 0}>
                Confirmar e Renomear ({preview.total_alvos})
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}