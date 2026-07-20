import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Botão que dispara a busca de novas fotos nas pastas Drive
 * vinculadas aos relatórios e as importa para a galeria.
 */
export default function SyncNovasFotosDriveButton({ onSync }) {
  const [estado, setEstado] = useState('idle'); // idle | preview | syncing | done | error
  const [preview, setPreview] = useState(null);
  const [resultado, setResultado] = useState(null);

  async function verificar() {
    setEstado('preview');
    setPreview(null);
    try {
      const res = await base44.functions.invoke('syncNovasFotosDriveRelatorios', { modo: 'preview' });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      setPreview(data);
      setEstado('ready');
    } catch (e) {
      toast.error('Erro ao verificar Drive: ' + e.message);
      setEstado('error');
    }
  }

  async function importar() {
    if (!preview?.total_novas) return;
    setEstado('syncing');
    setResultado(null);

    let totalImportadas = 0;
    let hasMore = true;
    let lotes = 0;

    try {
      while (hasMore && lotes < 20) {
        const res = await base44.functions.invoke('syncNovasFotosDriveRelatorios', { modo: 'sync', lote: 5 });
        const data = res?.data || res;
        if (data?.error) throw new Error(data.error);
        totalImportadas += data?.importadas || 0;
        hasMore = !!data?.has_more;
        lotes++;
        if ((data?.lote_processado || 0) === 0) break;
      }

      setResultado({ importadas: totalImportadas });
      setEstado('done');
      toast.success(`${totalImportadas} nova(s) foto(s) importada(s) do Drive!`);
      onSync?.();
    } catch (e) {
      toast.error('Erro ao importar: ' + e.message);
      setEstado('error');
    }
  }

  function resetar() {
    setEstado('idle');
    setPreview(null);
    setResultado(null);
  }

  if (estado === 'idle') {
    return (
      <Button variant="outline" size="sm" onClick={verificar} className="gap-2">
        <RefreshCw className="w-4 h-4" />
        Buscar novas fotos no Drive
      </Button>
    );
  }

  if (estado === 'preview') {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Verificando Drive…
      </Button>
    );
  }

  if (estado === 'ready') {
    const temNovas = preview?.total_novas > 0;
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {temNovas ? (
          <>
            <Badge variant="secondary" className="text-xs">
              {preview.total_novas} nova(s) encontrada(s)
            </Badge>
            <Button size="sm" onClick={importar} className="gap-2">
              <RefreshCw className="w-4 h-4" />
              Importar
            </Button>
          </>
        ) : (
          <Badge variant="secondary" className="text-xs text-green-700 bg-green-50">
            ✓ Galeria atualizada
          </Badge>
        )}
        <Button variant="ghost" size="sm" onClick={resetar} className="text-xs text-slate-500">
          Fechar
        </Button>
      </div>
    );
  }

  if (estado === 'syncing') {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Importando fotos…
      </Button>
    );
  }

  if (estado === 'done') {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-sm text-green-700">
          <CheckCircle className="w-4 h-4" />
          {resultado?.importadas} foto(s) importada(s)
        </span>
        <Button variant="ghost" size="sm" onClick={resetar} className="text-xs text-slate-500">
          OK
        </Button>
      </div>
    );
  }

  if (estado === 'error') {
    return (
      <div className="flex items-center gap-2">
        <span className="flex items-center gap-1 text-sm text-red-600">
          <AlertCircle className="w-4 h-4" />
          Falha
        </span>
        <Button variant="ghost" size="sm" onClick={resetar} className="text-xs">
          Tentar novamente
        </Button>
      </div>
    );
  }

  return null;
}