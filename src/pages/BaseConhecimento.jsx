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
import { BookOpen, Upload, Trash2, Eye, EyeOff, Plus, Loader2 } from 'lucide-react';

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

  const resetForm = () => {
    setForm({
      titulo: '',
      categoria: '',
      cargo_relacionado: '',
      tags: ''
    });
    setFile(null);
    setProgress('');
    setUploading(false);
  };

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
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      setProgress('IA analisando documento (PDF/Excel)...');

      const res = await base44.functions.invoke('processDocumentUpload', {
        file_url,
        ...form,
      });

      if (res.data?.success) {
        toast.success('Documento Salvo');
        onSaved();
        resetForm();
        onClose();
      } else {
        toast.error(res.data?.error || 'Erro ao processar documento');
      }
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUploading(false);
      setProgress('');
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          resetForm();
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Adicionar Documento Inteligente</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            placeholder="Título"
            value={form.titulo}
            onChange={(e) => set('titulo', e.target.value)}
          />

          <Select value={form.categoria} onValueChange={(v) => set('categoria', v)}>
            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              {CATEGORIAS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={form.cargo_relacionado} onValueChange={(v) => set('cargo_relacionado', v)}>
            <SelectTrigger><SelectValue placeholder="Relacionado a qual cargo?" /></SelectTrigger>
            <SelectContent>
              {CARGOS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Input
            placeholder="Tags (ex: salário, contrato, pagamento)"
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
          />

          <Input
            type="file"
            accept=".pdf,.xlsx,.xls,.csv,.doc,.docx,.txt"
            onChange={(e) => setFile(e.target.files[0])}
          />

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
          <Button size="sm" onClick={() => onPreview(doc)}><Eye /></Button>
          <Button size="sm" onClick={() => onToggle(doc)}>
            {doc.ativo ? <Eye /> : <EyeOff />}
          </Button>
          <Button size="sm" onClick={() => onDelete(doc)}><Trash2 /></Button>
        </div>
      </div>

      {doc.resumo_ia && (
        <div className="text-sm text-gray-600">
          <b>Resumo IA:</b> {doc.resumo_ia}
        </div>
      )}

      {doc.salarios_e_pagamentos && (
        <div className="text-sm text-blue-700">
          <b>Valores identificados:</b><br />
          <pre className="text-xs whitespace-pre-wrap">{doc.salarios_e_pagamentos}</pre>
        </div>
      )}
    </div>
  );
}

function BaseConhecimentoInner() {
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [preview, setPreview] = useState(null);

  const { data: docs = [] } = useQuery({
    queryKey: ['docs'],
    queryFn: () => base44.entities.KnowledgeDocument.list('-created_date', 100),
  });

  const toggle = async (doc) => {
    await base44.entities.KnowledgeDocument.update(doc.id, { ativo: !doc.ativo });
    queryClient.invalidateQueries({ queryKey: ['docs'] });
  };

  const del = async (doc) => {
    await base44.entities.KnowledgeDocument.delete(doc.id);
    queryClient.invalidateQueries({ queryKey: ['docs'] });
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
        {docs.map((doc) => (
          <DocCard
            key={doc.id}
            doc={doc}
            onToggle={toggle}
            onDelete={del}
            onPreview={setPreview}
          />
        ))}
      </div>

      <UploadDialog
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onSaved={() => queryClient.invalidateQueries({ queryKey: ['docs'] })}
      />

      {preview && (
        <Dialog open onOpenChange={() => setPreview(null)}>
          <DialogContent className="max-w-2xl">
            <DialogTitle>{preview.titulo}</DialogTitle>

            <div className="space-y-4 text-sm">
              {preview.resumo_ia && (
                <div>
                  <b>Resumo:</b>
                  <p>{preview.resumo_ia}</p>
                </div>
              )}

              <div>
                <b>Conteúdo:</b>
                <pre className="max-h-[300px] overflow-auto text-xs">
                  {preview.conteudo_extraido}
                </pre>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
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
