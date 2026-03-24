import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Trash2,
  Eye,
  Plus,
  Loader2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Database,
  MessageCircle,
  FileText,
} from 'lucide-react';

function BaseConhecimentoInner() {
  const queryClient = useQueryClient();

  const [showUpload, setShowUpload] = useState(false);
  const [busca, setBusca] = useState('');
  const [pergunta, setPergunta] = useState('');
  const [resposta, setResposta] = useState('');
  const [loadingIA, setLoadingIA] = useState(false);

  // 🔥 AGORA CORRETO
  const { data: mirror, isLoading, refetch } = useQuery({
    queryKey: ['base-conhecimento'],
    queryFn: async () => {
      const res = await base44.functions.invoke('syncBaseConhecimento');
      return res?.data || {};
    },
    refetchOnWindowFocus: true,
    staleTime: 1000 * 60 * 5, // 5 min
  });

  const { data: docs = [] } = useQuery({
    queryKey: ['knowledge-docs'],
    queryFn: () => base44.entities.KnowledgeDocument.list('-created_date', 100),
  });

  const perguntarIA = async () => {
    if (!pergunta.trim()) return;

    setLoadingIA(true);
    setResposta('');

    try {
      const res = await base44.functions.invoke('askBaseConhecimento', {
        pergunta,
        contexto: mirror?.items || [],
        documentos: docs,
      });

      setResposta(res?.data?.resposta || 'Sem resposta');
    } catch {
      setResposta('Erro ao consultar IA');
    } finally {
      setLoadingIA(false);
    }
  };

  const itensFiltrados = useMemo(() => {
    const items = mirror?.items || [];
    const termo = busca.toLowerCase();

    if (!termo) return items;

    return items.filter((item) =>
      JSON.stringify(item).toLowerCase().includes(termo)
    );
  }, [mirror, busca]);

  return (
    <div className="p-6 space-y-8">

      {/* HEADER */}
      <div className="flex justify-between items-center">
        <h1 className="text-xl font-bold">Biblioteca de Conhecimento IA</h1>

        <Button onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" />
          Atualizar
        </Button>
      </div>

      {/* STATUS */}
      <div className="border p-4 rounded-lg flex justify-between">
        <div>
          <div className="text-xs text-gray-500">Base espelhada</div>
          <div className="font-bold">
            {mirror?.total_items || 0} registros
          </div>
        </div>

        <div className="text-sm text-gray-500">
          {mirror?.last_sync
            ? new Date(mirror.last_sync).toLocaleString('pt-BR')
            : 'Carregando...'}
        </div>
      </div>

      {/* IA */}
      <div className="border p-4 rounded-lg space-y-2">
        <Input
          placeholder="Pergunte sobre programação, minibio, atividades..."
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
        />

        <Button onClick={perguntarIA} disabled={loadingIA}>
          {loadingIA ? 'Consultando...' : 'Perguntar'}
        </Button>

        {resposta && (
          <div className="bg-gray-100 p-3 rounded text-sm whitespace-pre-wrap">
            {resposta}
          </div>
        )}
      </div>

      {/* BUSCA */}
      <Input
        placeholder="Buscar na base"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
      />

      {/* LISTA */}
      <div className="space-y-2">
        {isLoading ? (
          <div>Carregando...</div>
        ) : (
          itensFiltrados.map((item, i) => (
            <div key={i} className="border p-3 rounded">
              <div className="font-semibold">{item.titulo}</div>
              <div className="text-xs text-gray-500">
                {item.data} · {item.museu}
              </div>
            </div>
          ))
        )}
      </div>

    </div>
  );
}

export default function BaseConhecimento() {
  return (
    <RequireAuth>
      <BaseConhecimentoInner />
    </RequireAuth>
  );
}
