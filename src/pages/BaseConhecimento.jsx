import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { BookOpen, Upload, Trash2, Eye, EyeOff, FileText, Plus, X, AlertTriangle, Loader2, ListChecks, Users } from 'lucide-react';
import { METAS_3_ADITIVO, CARGOS_PLANO_TRABALHO, INFO_PROJETO } from '@/components/planoTrabalho';

const CATEGORIAS = ['Contrato', 'Plano de Trabalho', 'Manual', 'Meta', 'Relatório', 'Outro'];

const CAT_COLORS = {
  'Contrato': 'bg-blue-100 text-blue-800',
  'Plano de Trabalho': 'bg-green-100 text-green-800',
  'Manual': 'bg-purple-100 text-purple-800',
  'Meta': 'bg-orange-100 text-orange-800',
  'Relatório': 'bg-gray-100 text-gray-800',
  'Outro': 'bg-gray-100 text-gray-600',
};

function UploadDialog({ open, onClose, onSaved }) {
  const [form, setForm] = useState({ titulo: '', descricao: '', categoria: '', versao: '' });
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.titulo || !form.categoria) { toast.error('Título e categoria são obrigatórios'); return; }
    if (!file) { toast.error('Selecione um arquivo'); return; }

    setUploading(true);
    setProgress('Enviando arquivo...');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setProgress('Extraindo conteúdo...');
      const res = await base44.functions.invoke('processDocumentUpload', {
        file_url,
        titulo: form.titulo,
        categoria: form.categoria,
        descricao: form.descricao,
        versao: form.versao,
      });
      if (res.data?.success) {
        toast.success(`Documento processado! ${res.data.chars} caracteres extraídos.`);
        onSaved();
        onClose();
      } else {
        toast.error(res.data?.error || 'Erro ao processar documento');
      }
    } catch (err) {
      toast.error('Erro: ' + err.message);
    } finally {
      setUploading(false);
      setProgress('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-4 h-4" />Adicionar Documento de Referência
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={form.titulo} onChange={e => set('titulo', e.target.value)} placeholder="Ex: 3º Termo Aditivo - Plano de Trabalho" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Categoria *</Label>
              <Select value={form.categoria} onValueChange={v => set('categoria', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Versão</Label>
              <Input value={form.versao} onChange={e => set('versao', e.target.value)} placeholder="Ex: Jan/2026" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição</Label>
            <Input value={form.descricao} onChange={e => set('descricao', e.target.value)} placeholder="Breve descrição do conteúdo" />
          </div>
          <div className="space-y-1.5">
            <Label>Arquivo (PDF, DOCX, etc.) *</Label>
            <Input type="file" accept=".pdf,.doc,.docx,.txt,.xlsx,.csv" onChange={e => setFile(e.target.files[0])} />
            {file && <p className="text-xs text-gray-500">{file.name}</p>}
          </div>
          {uploading && (
            <div className="flex items-center gap-2 text-sm text-blue-600 bg-blue-50 p-3 rounded-lg">
              <Loader2 className="w-4 h-4 animate-spin" />
              {progress}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={uploading}>Cancelar</Button>
            <Button type="submit" className="bg-black hover:bg-gray-800 text-white" disabled={uploading}>
              {uploading ? 'Processando...' : 'Enviar e Processar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DocCard({ doc, onToggle, onDelete, onPreview }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    setDeleting(true);
    await base44.entities.KnowledgeDocument.delete(doc.id);
    toast.success('Documento removido.');
    onDelete();
  };

  return (
    <div className={`border rounded-xl p-4 transition-all ${doc.ativo ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <FileText className="w-5 h-5 text-gray-400 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <h3 className="font-medium text-black text-sm truncate">{doc.titulo}</h3>
            {doc.descricao && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{doc.descricao}</p>}
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <Badge className={`text-xs ${CAT_COLORS[doc.categoria] || 'bg-gray-100 text-gray-600'}`}>
                {doc.categoria}
              </Badge>
              {doc.versao && <span className="text-xs text-gray-400">{doc.versao}</span>}
              {doc.conteudo_extraido && (
                <span className="text-xs text-gray-400">{doc.conteudo_extraido.length.toLocaleString()} chars</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onPreview(doc)} title="Ver conteúdo extraído">
            <Eye className="w-3.5 h-3.5 text-gray-400" />
          </Button>
          <Button
            variant="ghost" size="sm"
            className={`h-7 w-7 p-0 ${doc.ativo ? 'text-green-600 hover:text-green-700' : 'text-gray-400 hover:text-gray-600'}`}
            onClick={() => onToggle(doc)}
            title={doc.ativo ? 'Desativar (remover do chat)' : 'Ativar (usar no chat)'}
          >
            {doc.ativo ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          </Button>
          {!confirmDelete ? (
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-gray-400 hover:text-red-600" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <div className="flex items-center gap-1 border border-red-200 rounded-lg px-2 py-1 bg-red-50">
              <AlertTriangle className="w-3 h-3 text-red-500" />
              <Button size="sm" variant="destructive" className="h-5 text-xs px-2" onClick={handleDelete} disabled={deleting}>
                {deleting ? '...' : 'Sim'}
              </Button>
              <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setConfirmDelete(false)}>
                <X className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PreviewDialog({ doc, onClose }) {
  if (!doc) return null;
  return (
    <Dialog open={!!doc} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4" />{doc.titulo}
          </DialogTitle>
        </DialogHeader>
        <div className="overflow-y-auto max-h-[55vh] text-sm text-gray-700 bg-gray-50 p-4 rounded-lg whitespace-pre-wrap font-mono text-xs">
          {doc.conteudo_extraido || 'Nenhum conteúdo extraído.'}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BaseConhecimentoInner() {
  const queryClient = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['knowledge-docs'],
    queryFn: () => base44.entities.KnowledgeDocument.list('-created_date', 100),
  });

  const handleToggle = async (doc) => {
    await base44.entities.KnowledgeDocument.update(doc.id, { ativo: !doc.ativo });
    queryClient.invalidateQueries({ queryKey: ['knowledge-docs'] });
    toast.success(doc.ativo ? 'Documento desativado do chat.' : 'Documento ativado no chat.');
  };

  const handleDelete = () => queryClient.invalidateQueries({ queryKey: ['knowledge-docs'] });
  const handleSaved = () => queryClient.invalidateQueries({ queryKey: ['knowledge-docs'] });

  const ativos = docs.filter(d => d.ativo);
  const inativos = docs.filter(d => !d.ativo);

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-black">Base de Conhecimento</h1>
            <p className="text-sm text-gray-500">Documentos de referência usados pelo Assistente de Ajuda</p>
          </div>
        </div>
        <Button className="bg-black hover:bg-gray-800 text-white gap-2" onClick={() => setShowUpload(true)}>
          <Plus className="w-4 h-4" />Adicionar Documento
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-8">
        <div className="border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-semibold text-black">{docs.length}</p>
          <p className="text-xs text-gray-500">Total</p>
        </div>
        <div className="border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-semibold text-green-600">{ativos.length}</p>
          <p className="text-xs text-gray-500">Ativos no chat</p>
        </div>
        <div className="border border-gray-200 rounded-xl p-4">
          <p className="text-2xl font-semibold text-gray-400">{inativos.length}</p>
          <p className="text-xs text-gray-500">Inativos</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Carregando...</div>
      ) : docs.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-gray-200 rounded-xl">
          <BookOpen className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-400">Nenhum documento cadastrado.</p>
          <Button variant="outline" className="mt-4" onClick={() => setShowUpload(true)}>
            <Plus className="w-4 h-4 mr-2" />Adicionar primeiro documento
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {ativos.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-500 mb-3 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />Ativos no Assistente ({ativos.length})
              </h2>
              <div className="space-y-2">
                {ativos.map(doc => (
                  <DocCard key={doc.id} doc={doc} onToggle={handleToggle} onDelete={handleDelete} onPreview={setPreviewDoc} />
                ))}
              </div>
            </div>
          )}
          {inativos.length > 0 && (
            <div>
              <h2 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-1.5">
                <EyeOff className="w-3.5 h-3.5" />Inativos ({inativos.length})
              </h2>
              <div className="space-y-2">
                {inativos.map(doc => (
                  <DocCard key={doc.id} doc={doc} onToggle={handleToggle} onDelete={handleDelete} onPreview={setPreviewDoc} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <UploadDialog open={showUpload} onClose={() => setShowUpload(false)} onSaved={handleSaved} />
      <PreviewDialog doc={previewDoc} onClose={() => setPreviewDoc(null)} />
    </div>
  );
}

export default function BaseConhecimento() {
  return <RequireAuth requiredRole="admin"><BaseConhecimentoInner /></RequireAuth>;
}