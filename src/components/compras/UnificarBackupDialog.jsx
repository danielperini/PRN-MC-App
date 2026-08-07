import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Loader2, AlertTriangle, FolderGit, CheckCircle2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';

export default function UnificarBackupDialog({ open, onOpenChange }) {
  const [executando, setExecutando] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function executarUnificacao() {
    setExecutando(true);
    setResultado(null);
    try {
      const res = await base44.functions.invoke('normalizarPastasDriveNFs', { mode: 'unificar_backup' });
      const d = res?.data || res || {};
      if (d?.ok === false) throw new Error(d?.error || 'Falha ao unificar backup');

      const renomeadas = d.pastas_renomeadas?.length || 0;
      const merges = d.merges_realizados?.length || 0;
      const arquivos = (d.merges_realizados || []).reduce((a, m) => a + (m.arquivos_movidos || 0), 0);
      const trash = d.pastas_trash?.length || 0;
      const p08 = d.pasta_08_2026?.status === 'criada' ? 'criada' : 'já existia';

      setResultado({ renomeadas, merges, arquivos, trash, p08, erros: d.erros || [] });
      toast.success(
        `Backup unificado: ${renomeadas} renomeada(s), ${merges} merge(s), ${arquivos} arquivos movidos, ${trash} para lixeira. Pasta 08-2026 ${p08}.`
      );
      onOpenChange(false);
    } catch (e) {
      console.error('Erro unificar backup:', e);
      toast.error('Erro ao unificar backup: ' + (e?.message || e));
    } finally {
      setExecutando(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !executando && onOpenChange(v)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderGit className="h-5 w-5 text-gray-700" />
            Unificar pastas do backup (MM-YYYY)
          </DialogTitle>
          <DialogDescription>
            Padroniza todas as subpastas da pasta de backup para o formato canônico{' '}
            <strong>MM-YYYY</strong> (ex: 05-2026, 08-2026).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 text-sm text-gray-700">
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 text-amber-600 shrink-0" />
              <div className="space-y-1">
                <p className="font-medium text-amber-900">Atenção — operação irreversível sem restauração manual</p>
                <p className="text-amber-800">
                  Pastas com nomes por extenso (ex: <em>Maio 2026</em>, <em>Março 2026</em>) serão{' '}
                  <strong>fundidas</strong> na pasta canônica (ex: <em>05-2026</em>) e as pastas
                  esvaziadas serão enviadas para a <strong>lixeira do Drive</strong> (reversível).
                </p>
              </div>
            </div>
          </div>

          <ul className="space-y-1.5 text-xs text-gray-600">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />
              <span>Competências com 2+ pastas (ex: <em>05-2026</em> + <em>Maio 2026</em>) são fundidas em uma única <em>MM-YYYY</em>.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 text-emerald-600 shrink-0" />
              <span>Pastas únicas com nome por extenso (ex: <em>Março 2026</em>) são renomeadas para <em>03-2026</em>.</span>
            </li>
            <li className="flex items-start gap-2">
              <Trash2 className="h-3.5 w-3.5 mt-0.5 text-gray-500 shrink-0" />
              <span>Pastas esvaziadas são enviadas para a lixeira do Drive (não excluídas permanentemente).</span>
            </li>
            <li className="flex items-start gap-2">
              <FolderGit className="h-3.5 w-3.5 mt-0.5 text-blue-600 shrink-0" />
              <span>A pasta <em>08-2026</em> será criada automaticamente se ainda não existir.</span>
            </li>
          </ul>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={executando}>
            Cancelar
          </Button>
          <Button onClick={executarUnificacao} disabled={executando} className="gap-2 bg-black text-white hover:bg-gray-800">
            {executando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderGit className="h-4 w-4" />}
            {executando ? 'Unificando...' : 'Confirmar unificação'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}