// 🔥 VERSÃO FINAL COM ESPELHO GOOGLE SHEETS + IA

import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Trash2, Eye, Plus, Loader2, CheckCircle, XCircle, RefreshCw, Database } from 'lucide-react';

const CATEGORIAS = ['Contrato', 'Plano de Trabalho', 'Manual', 'Meta', 'Relatório', 'Financeiro', 'RH', 'Outro'];

const CARGOS = [
  'Coordenador',
  'Educador',
  'Produtor',
  'Designer',
  'Administrativo',
  'Assistente'
];

const MIRROR_SLUG = 'base-conhecimento-ia-google-sheet';
const ONE_DAY = 24 * 60 * 60 * 1000;

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

      if (!upload?.file_url) {
        throw new Error('Falha no upload');
      }

      setProgress('Processando com IA...');

      const res = await base44.functions.invoke('processDocumentUpload', {
        file_url: upload.file_url,
        ...form,
      });

      if (!res || !res.data || res.data.error || !res.data.success) {
        throw new Error(res?.data?.error || 'Documento não foi salvo');
      }

      toast.success('Documento Salvo');

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

function DocCard({ doc, onToggle, onDelete, onPreview }) {
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex justify-between">

        <div>
          <p className="font-semibold">{doc.titulo}</p>

          <div className="flex gap-2 mt-1 flex-wrap">
            <Badge>{doc.categoria}</Badge>
            {doc.cargo_relacionado && <Badge variant="outline">{doc.cargo_relacionado}</Badge>}
            {doc.processado_por_ia && <Badge className="bg-green-100 text-green-700">IA</Badge>}
          </div>
        </div>

        <div className="flex gap-2">
          <Button size="sm" onClick={() => onPreview(doc)}>
            <Eye />
          </Button>

          <Button size="sm" onClick={() => onToggle(doc)}>
            {doc.ativo ? <CheckCircle /> : <XCircle />}
          </Button>

          <Button size="sm" onClick={() => onDelete(doc)}>
            <Trash2 />
          </Button>
        </div>
      </div>

      {doc.resumo_ia && (
        <div className="text-sm text-gray-600">
          <b>Resumo IA:</b> {doc.resumo_ia}
        </div>
      )}
    </div>
  );
}

function BaseConhecimentoInner() {
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [preview, setPreview] = useState(null);
  const [mirror, setMirror] = useState(null);
  const [syncing, setSyncing] = useState(false);

  const { data: docs = [], refetch } = useQuery({
    queryKey: ['docs'],
    queryFn: () => base44.entities.KnowledgeDocument.list('-created_date', 100),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['docs'] });
    await refetch();
  };

  const loadMirror = async () => {
    const res = await base44.entities.BibliotecaConhecimentoIA.list({
      filter: { slug: MIRROR_SLUG },
      limit: 1,
    });
    return res?.[0] || null;
  };

  const syncMirror = async (mode = 'manual') => {
    setSyncing(true);
    try {
      await base44.functions.invoke('syncBaseConhecimento', { mode });
      const updated = await loadMirror();
      setMirror(updated);
      toast.success('Base sincronizada');
    } catch (e) {
      toast.error('Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  const bootstrap = async () => {
    const current = await loadMirror();

    if (!current) {
      await syncMirror('first_load');
      return;
    }

    const last = current?.last_sync ? new Date(current.last_sync).getTime() : 0;

    if (!last || (Date.now() - last > ONE_DAY)) {
      await syncMirror('auto');
    } else {
      setMirror(current);
    }
  };

  useEffect(() => {
    bootstrap();
  }, []);

  return (
    <div className="p-6">

      {/* HEADER */}
      <div className="flex justify-between mb-6">
        <h1 className="text-xl font-bold">Biblioteca de Conhecimento IA</h1>

        <div className="flex gap-2">
          <Button onClick={() => syncMirror()}>
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </Button>

          <Button onClick={() => setShowUpload(true)}>
            <Plus /> Adicionar Documento
          </Button>
        </div>
      </div>

      {/* STATUS ESPELHO */}
      <div className="border rounded-lg p-4 mb-6 flex justify-between items-center">
        <div>
          <div className="text-xs text-gray-500">Espelho Google Sheets</div>
          <div className="font-medium flex items-center gap-2">
            <Database className="w-4 h-4" />
            {mirror?.total_items || 0} registros
          </div>
        </div>

        <div className="text-sm text-gray-500">
          {mirror?.last_sync
            ? new Date(mirror.last_sync).toLocaleString('pt-BR')
            : 'Nunca sincronizado'}
        </div>
      </div>

      {/* DOCUMENTOS IA */}
      <div className="space-y-4">
        {docs.map(doc => (
          <DocCard
            key={doc.id}
            doc={doc}
            onToggle={async (d) => {
              await base44.entities.KnowledgeDocument.update(d.id, { ativo: !d.ativo });
              await refresh();
            }}
            onDelete={async (d) => {
              await base44.entities.KnowledgeDocument.delete(d.id);
              await refresh();
            }}
            onPreview={setPreview}
          />
        ))}
      </div>

      <UploadDialog
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onSaved={refresh}
      />
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
