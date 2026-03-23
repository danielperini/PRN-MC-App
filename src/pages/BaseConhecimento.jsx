// 🔥 VERSÃO CORRIGIDA COM DEBUG + GARANTIA DE SALVAMENTO

import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { BookOpen, Trash2, Eye, EyeOff, Plus, Loader2 } from 'lucide-react';

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

    try {
      console.log('🚀 Upload iniciando...');

      const upload = await base44.integrations.Core.UploadFile({ file });

      if (!upload?.file_url) {
        throw new Error('Upload falhou');
      }

      console.log('📁 Arquivo enviado:', upload.file_url);

      setProgress('Processando com IA...');

      const res = await base44.functions.invoke('processDocumentUpload', {
        file_url: upload.file_url,
        ...form
      });

      console.log('📊 RESPOSTA FUNCTION:', res);

      // 🔥 VALIDAÇÃO REAL
      if (!res || !res.data) {
        throw new Error('Sem resposta da function');
      }

      if (res.data.error) {
        throw new Error(res.data.error);
      }

      if (!res.data.success) {
        throw new Error('Processamento não retornou sucesso');
      }

      // ✅ SUCESSO REAL
      toast.success('Documento Salvo');

      await onSaved(); // 🔥 aguarda refetch
      onClose();

    } catch (err) {
      console.error('❌ ERRO REAL:', err);
      toast.error(err.message || 'Erro ao salvar documento');
    } finally {
      setUploading(false);
      setProgress('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
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

function BaseConhecimentoInner() {
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);

  const { data: docs = [], refetch } = useQuery({
    queryKey: ['docs'],
    queryFn: () => base44.entities.KnowledgeDocument.list('-created_date', 100),
  });

  return (
    <div className="p-6">
      <div className="flex justify-between mb-6">
        <h1 className="text-xl font-bold">Biblioteca de Conhecimento IA</h1>
        <Button onClick={() => setShowUpload(true)}>
          <Plus /> Adicionar Documento
        </Button>
      </div>

      <div className="space-y-4">
        {docs.map(doc => (
          <div key={doc.id} className="border p-4 rounded">
            {doc.titulo}
          </div>
        ))}
      </div>

      <UploadDialog
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onSaved={refetch}
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
