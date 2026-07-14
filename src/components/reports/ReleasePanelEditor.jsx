import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[,;|]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function toText(value, fallback = '') {
  if (value == null) return fallback;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  return fallback;
}

function normalizeRelease(release) {
  return {
    ...release,
    id: release?.id || release?._id || `release_${Math.random().toString(36).slice(2)}`,
    titulo: toText(release?.titulo, 'Release sem título'),
    conteudo_resumido: toText(release?.conteudo_resumido),
    conteudo_completo: toText(release?.conteudo_completo),
    museus: toArray(release?.museus),
    tipos_atividade: toArray(release?.tipos_atividade),
    atividades_vinculadas: toArray(release?.atividades_vinculadas),
  };
}

export default function ReleasePanelEditor({ mes, ano, museu, onSelect }) {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadReleases();
  }, [mes, ano, museu]);

  const loadReleases = async () => {
    setLoading(true);
    setError('');
    try {
      const resultado = await base44.entities.Release.filter({ mes, ano, ativo: true });
      setReleases((Array.isArray(resultado) ? resultado : []).map(normalizeRelease));
    } catch (loadError) {
      console.error('Erro ao carregar releases:', loadError);
      setReleases([]);
      setError(loadError?.message || 'Não foi possível carregar os releases deste período.');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError('');
    try {
      await base44.functions.invoke('syncReleasesDrive', {});
      await loadReleases();
    } catch (syncError) {
      console.error('Erro ao sincronizar:', syncError);
      setError(syncError?.message || 'Falha ao sincronizar releases do Drive.');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-6">
        <Loader2 className="w-5 h-5 animate-spin" />
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-lg">Releases do Período</h3>
        <Button onClick={handleSync} disabled={syncing} size="sm" variant="outline">
          {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Sincronizar Drive
        </Button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {error}
        </div>
      )}

      <div className="space-y-2">
        {releases.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum release disponível</p>
        ) : (
          releases.map((release) => (
            <div
              key={release.id}
              className="p-3 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
              onClick={() => onSelect?.(release)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{release.titulo}</p>
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                    {release.conteudo_resumido || release.conteudo_completo.substring(0, 120)}
                  </p>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {release.museus.map((museuItem) => (
                      <Badge key={museuItem} variant="outline" className="text-xs">{museuItem}</Badge>
                    ))}
                    {release.tipos_atividade.map((tipoItem) => (
                      <Badge key={tipoItem} className="text-xs bg-blue-100 text-blue-700">{tipoItem}</Badge>
                    ))}
                  </div>
                </div>
                {release.atividades_vinculadas.length > 0 && (
                  <LinkIcon className="w-4 h-4 text-green-600 flex-shrink-0 mt-1" />
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
