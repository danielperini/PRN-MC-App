// 🔥 VERSÃO FINAL COM CHAT IA INTEGRADO (SEM QUEBRAR NADA)

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

function UploadDialog({ open, onClose, onSaved }) {
  const [form, setForm] = useState({
    titulo: '',
    categoria: '',
    cargo_relacionado: '',
    tags: ''
  });

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!form.titulo || !form.categoria) {
      toast.error('Título e categoria são obrigatórios');
      return;
    }

    if (!file) {
      toast.error('Selecione um arquivo');
      return;
    }

    setUploading(true);
    setProgress('Enviando arquivo...');

    try {
      const upload = await base44.integrations.Core.UploadFile({ file });

      if (!upload?.file_url) throw new Error('Falha no upload');

      setProgress('Processando com IA...');

      const res = await base44.functions.invoke('processDocumentUpload', {
        file_url: upload.file_url,
        ...form,
      });

      if (!res?.data?.success) {
        throw new Error(res?.data?.error || 'Documento não foi salvo');
      }

      toast.success('Documento salvo');

      await onSaved();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Erro ao salvar documento');
    } finally {
      setUploading(false);
      setProgress('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar Documento Inteligente</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input placeholder="Título" value={form.titulo} onChange={e => set('titulo', e.target.value)} />

          <Select onValueChange={v => set('categoria', v)}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select onValueChange={v => set('cargo_relacionado', v)}>
            <SelectTrigger><SelectValue placeholder="Cargo" /></SelectTrigger>
            <SelectContent>
              {CARGOS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          <Input placeholder="Tags" value={form.tags} onChange={e => set('tags', e.target.value)} />

          <Input type="file" onChange={e => setFile(e.target.files[0])} />

          {uploading && (
            <div className="text-sm text-blue-600 flex gap-2">
              <Loader2 className="animate-spin w-4 h-4" />
              {progress}
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={uploading}>
              {uploading ? 'Salvando...' : 'Salvar Documento'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MirrorItemCard({ item, index }) {
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="font-semibold">
        {item?.titulo || item?.first_text || `Linha ${index + 1}`}
      </div>
    </div>
  );
}

function BaseConhecimentoInner() {
  const queryClient = useQueryClient();

  const [mirror, setMirror] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [busca, setBusca] = useState('');

  // 🔥 CHAT
  const [pergunta, setPergunta] = useState('');
  const [resposta, setResposta] = useState('');
  const [loadingIA, setLoadingIA] = useState(false);

  const loadMirror = async () => {
    const res = await base44.functions.invoke('syncBaseConhecimento', { mode: 'load_only' });
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
        </div>
      </div>

      {/* 🔥 CHAT IA */}
      <div className="border rounded-lg p-4 mb-6 space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <MessageCircle className="w-4 h-4" />
          Consultar base (IA)
        </div>

        <Input
          placeholder="Pergunte sobre programação, meses ou equipe"
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

      <Input
        placeholder="Buscar direto na planilha"
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="mb-6"
      />

      <div className="space-y-3">
        {itensFiltrados.map((item, i) => (
          <MirrorItemCard key={i} item={item} index={i} />
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
