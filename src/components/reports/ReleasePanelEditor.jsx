import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Loader2, FileText, Link as LinkIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function ReleasePanelEditor({ mes, ano, museu, onSelect }) {
  const [releases, setReleases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    loadReleases();
  }, [mes, ano, museu]);

  const loadReleases = async () => {
    setLoading(true);
    try {
      const resultado = await base44.entities.Release.filter({
        mes,
        ano,
        ativo: true
      });
      
      setReleases(resultado || []);
    } catch (error) {
      console.error('Erro ao carregar releases:', error);
      setReleases([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await base44.functions.invoke('syncReleasesDrive', {});
      await loadReleases();
    } catch (error) {
      console.error('Erro ao sincronizar:', error);
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
        <Button 
          onClick={handleSync} 
          disabled={syncing}
          size="sm"
          variant="outline"
        >
          {syncing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
          Sincronizar Drive
        </Button>
      </div>

      <div className="space-y-2">
        {releases.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhum release disponível</p>
        ) : (
          releases.map(release => (
            <div 
              key={release.id} 
              className="p-3 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer"
              onClick={() => onSelect && onSelect(release)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <p className="font-medium text-sm">{release.titulo}</p>
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">
                    {release.conteudo_resumido || release.conteudo_completo?.substring(0, 120)}
                  </p>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {release.museus?.map(m => (
                      <Badge key={m} variant="outline" className="text-xs">
                        {m}
                      </Badge>
                    ))}
                    {release.tipos_atividade?.map(t => (
                      <Badge key={t} className="text-xs bg-blue-100 text-blue-700">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
                {release.atividades_vinculadas?.length > 0 && (
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