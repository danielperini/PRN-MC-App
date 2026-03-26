import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RefreshCw } from 'lucide-react';

function AdminProgramacaoInner() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const sincronizar = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await base44.functions.invoke('syncProgramacao');
      const data = res?.data || res;

      if (!data?.ok) {
        setError(data?.error || 'Erro na sincronização');
      } else {
        setResult(data);
      }
    } catch (e) {
      setError(e?.message || 'Erro ao executar função');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full py-6">
      <div className="max-w-4xl mx-auto px-4 space-y-6">

        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Admin • Programação</h1>

          <Button onClick={sincronizar} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Sincronizando...' : 'Sincronizar programação'}
          </Button>
        </div>

        {error && (
          <div className="border p-4 bg-red-50 text-red-700 rounded">
            <strong>Erro:</strong> {error}
          </div>
        )}

        {result && (
          <div className="space-y-4">

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="border p-3 rounded bg-white">
                <div className="text-xs text-gray-500">Total eventos</div>
                <div className="text-lg font-semibold">
                  {result.total_items}
                </div>
              </div>

              <div className="border p-3 rounded bg-white">
                <div className="text-xs text-gray-500">Criados</div>
                <div className="text-lg font-semibold">
                  {result.programacao_sync?.created}
                </div>
              </div>

              <div className="border p-3 rounded bg-white">
                <div className="text-xs text-gray-500">Removidos</div>
                <div className="text-lg font-semibold">
                  {result.programacao_sync?.deleted_previous}
                </div>
              </div>

              <div className="border p-3 rounded bg-white">
                <div className="text-xs text-gray-500">Erros</div>
                <div className="text-lg font-semibold">
                  {result.programacao_sync?.errors?.length || 0}
                </div>
              </div>
            </div>

            <div className="border p-4 rounded bg-white">
              <div className="font-semibold mb-2">Por museu</div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(result.counts_by_museum || {}).map(([k, v]) => (
                  <Badge key={k}>{k}: {v}</Badge>
                ))}
              </div>
            </div>

            {result.debug_sheets?.length > 0 && (
              <div className="border p-4 rounded bg-white">
                <div className="font-semibold mb-2">Leitura por aba</div>

                <div className="space-y-2 text-sm">
                  {result.debug_sheets.map((s, i) => (
                    <div key={i} className="border p-2 rounded">
                      <div><strong>{s.sheetName}</strong></div>
                      <div>Linhas: {s.totalRows}</div>
                      <div>Eventos: {s.eventosExtraidos}</div>
                      {s.error && (
                        <div className="text-red-600">Erro: {s.error}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
}

export default function AdminProgramacao() {
  return (
    <RequireAuth>
      <AdminProgramacaoInner />
    </RequireAuth>
  );
}
