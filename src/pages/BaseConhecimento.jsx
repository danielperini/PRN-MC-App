// 🔥 VERSÃO FINAL COM CHAT IA + GOOGLE SHEETS CONTEXTUAL

import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Trash2, Eye, Plus, Loader2, CheckCircle, XCircle, RefreshCw, Database, MessageCircle } from 'lucide-react';

const CATEGORIAS = ['Contrato', 'Plano de Trabalho', 'Manual', 'Meta', 'Relatório', 'Financeiro', 'RH', 'Outro'];

const CARGOS = [
  'Coordenador',
  'Educador',
  'Produtor',
  'Designer',
  'Administrativo',
  'Assistente'
];

function BaseConhecimentoInner() {
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [mirror, setMirror] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [busca, setBusca] = useState('');

  // 🔥 CHAT IA
  const [pergunta, setPergunta] = useState('');
  const [resposta, setResposta] = useState('');
  const [loadingIA, setLoadingIA] = useState(false);

  const { data: docs = [], refetch } = useQuery({
    queryKey: ['docs'],
    queryFn: () => base44.entities.KnowledgeDocument.list('-created_date', 100),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['docs'] });
    await refetch();
  };

  const loadMirror = async () => {
    const res = await base44.functions.invoke('syncBaseConhecimento', {
      mode: 'load_only'
    });
    setMirror(res?.data || null);
  };

  const syncMirror = async () => {
    setSyncing(true);
    try {
      const res = await base44.functions.invoke('syncBaseConhecimento');
      setMirror(res?.data || null);
      toast.success('Base sincronizada');
    } catch {
      toast.error('Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  // 🔥 CONSULTA IA
  const perguntarIA = async () => {
    if (!pergunta) return;

    setLoadingIA(true);
    setResposta('');

    try {
      const res = await base44.functions.invoke('askBaseConhecimento', {
        pergunta,
        contexto: mirror?.items || []
      });

      setResposta(res?.data?.resposta || 'Sem resposta');
    } catch {
      setResposta('Erro ao consultar IA');
    } finally {
      setLoadingIA(false);
    }
  };

  useEffect(() => {
    loadMirror();
  }, []);

  const itensFiltrados = useMemo(() => {
    const items = mirror?.items || [];
    if (!busca) return items;

    return items.filter((item) =>
      JSON.stringify(item).toLowerCase().includes(busca.toLowerCase())
    );
  }, [mirror, busca]);

  return (
    <div className="p-6">

      <div className="flex justify-between mb-6">
        <h1 className="text-xl font-bold">Biblioteca de Conhecimento IA</h1>

        <div className="flex gap-2">
          <Button onClick={syncMirror}>
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </Button>

          <Button onClick={() => setShowUpload(true)}>
            <Plus /> Documento
          </Button>
        </div>
      </div>

      {/* 🔥 BLOCO CHAT IA */}
      <div className="border rounded-lg p-4 mb-6 space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <MessageCircle className="w-4 h-4" />
          Consultar base (IA)
        </div>

        <Input
          placeholder="Ex: programação de março, minibio equipe, atividades MIS..."
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
        />

        <Button onClick={perguntarIA} disabled={loadingIA}>
          {loadingIA ? 'Consultando...' : 'Perguntar'}
        </Button>

        {resposta && (
          <div className="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap">
            {resposta}
          </div>
        )}
      </div>

      <div className="border rounded-lg p-4 mb-4 flex justify-between items-center">
        <div>
          <div className="text-xs text-gray-500">Google Sheets (tempo real)</div>
          <div className="font-medium flex items-center gap-2">
            <Database className="w-4 h-4" />
            {mirror?.total_items || 0} registros
          </div>
        </div>

        <div className="text-sm text-gray-500">
          {mirror?.last_sync
            ? new Date(mirror.last_sync).toLocaleString('pt-BR')
            : 'Carregando...'}
        </div>
      </div>

      <Input
        placeholder="Buscar direto na planilha"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="mb-6"
      />

      <div className="space-y-3">
        {itensFiltrados.map((item, i) => (
          <div key={i} className="border rounded-lg p-4">
            <div className="font-semibold">
              {item?.titulo || item?.first_text || `Linha ${i + 1}`}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}

export default function BaseConhecimento() {
  return (
    <RequireAuth requiredRole="COORDENADOR">
      <BaseConhecimentoInner />
    </RequireAuth>
  );
}
