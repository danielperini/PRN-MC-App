// 🔥 VERSÃO FINAL ESTÁVEL

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
import { Trash2, Eye, EyeOff, Plus, Loader2, CheckCircle, XCircle } from 'lucide-react';

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
      console.log('UPLOAD INICIADO');

      const upload = await base44.integrations.Core.UploadFile({ file });

      if (!upload?.file_url) {
        throw new Error('Falha no upload');
      }

      console.log('ARQUIVO:', upload.file_url);

      setProgress('Processando com IA...');

      const res = await base44.functions.invoke('processDocumentUpload', {
        file_url: upload.file_url,
        ...form,
      });

      console.log('RESPOSTA:', res);

      // 🔥 validação real
      if (!res || !res.data) {
        throw new Error('Sem resposta da function');
      }

      if (res.data.error) {
        throw new Error(res.data.error);
      }

      if (!res.data.success) {
        throw new Error('Documento não foi salvo');
      }

      toast.success('Documento Salvo');

      await onSaved();
      onClose();

    } catch (err) {
      console.error('ERRO:', err);
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

          {/* 👁️ VISUALIZAR */}
          <Button size="sm" onClick={() => onPreview(doc)}>
            <Eye />
          </Button>

          {/* ✅ ATIVO / INATIVO */}
          <Button size="sm" onClick={() => onToggle(doc)}>
            {doc.ativo ? <CheckCircle /> : <XCircle />}
          </Button>

          {/* 🗑️ EXCLUIR */}
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

  const { data: docs = [], refetch } = useQuery({
    queryKey: ['docs'],
    queryFn: () => base44.entities.KnowledgeDocument.list('-created_date', 100),
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['docs'] });
    await refetch();
  };

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
