import React, { useState, useEffect, useMemo } from 'react';
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

const CATEGORIAS = ['Contrato', 'Plano de Trabalho', 'Manual', 'Meta', 'Relatório', 'Financeiro', 'RH', 'Outro'];
const CARGOS = ['Coordenador', 'Educador', 'Produtor', 'Designer', 'Administrativo', 'Assistente'];

function UploadDialog({ open, onClose, onSaved }) {
  const [form, setForm] = useState({
    titulo: '',
    categoria: '',
    cargo_relacionado: '',
    tags: '',
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

      if (!res?.data?.success) {
        throw new Error(res?.data?.error || 'Documento não foi salvo');
      }

      toast.success('Documento salvo e analisado pela IA');
      await onSaved();
      onClose();
    } catch (err) {
      toast.error(err?.message || 'Erro ao salvar documento');
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
          <Input
            placeholder="Título"
            value={form.titulo}
            onChange={(e) => set('titulo', e.target.value)}
          />

          <Input
            placeholder="Categoria"
            list="categorias-base-conhecimento"
            value={form.categoria}
            onChange={(e) => set('categoria', e.target.value)}
          />
          <datalist id="categorias-base-conhecimento">
            {CATEGORIAS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <Input
            placeholder="Cargo relacionado"
            list="cargos-base-conhecimento"
            value={form.cargo_relacionado}
            onChange={(e) => set('cargo_relacionado', e.target.value)}
          />
          <datalist id="cargos-base-conhecimento">
            {CARGOS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>

          <Input
            placeholder="Tags"
            value={form.tags}
            onChange={(e) => set('tags', e.target.value)}
          />

          <Input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />

          {uploading && (
            <div className="text-sm text-blue-600 flex gap-2 items-center">
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

function DocCard({ doc, onToggle, onDelete }) {
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="flex justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold truncate">{doc.titulo}</p>

          <div className="flex gap-2 mt-1 flex-wrap">
            {doc.categoria ? <Badge>{doc.categoria}</Badge> : null}
            {doc.cargo_relacionado ? <Badge variant="outline">{doc.cargo_relacionado}</Badge> : null}
            {doc.processado_por_ia ? <Badge className="bg-green-100 text-green-700">IA</Badge> : null}
            {doc.ativo ? <Badge variant="outline">Ativo</Badge> : <Badge variant="outline">Inativo</Badge>}
          </div>
        </div>

        <div className="flex gap-2 shrink-0">
          {doc.file_url ? (
            <Button size="sm" asChild>
              <a href={doc.file_url} target="_blank" rel="noreferrer">
                <Eye className="w-4 h-4" />
              </a>
            </Button>
          ) : null}

          <Button size="sm" onClick={() => onToggle(doc)}>
            {doc.ativo ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          </Button>

          <Button size="sm" onClick={() => onDelete(doc)}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {doc.resumo_ia ? (
        <div className="text-sm text-gray-600">
          <b>Resumo IA:</b> {doc.resumo_ia}
        </div>
      ) : null}
    </div>
  );
}

function MirrorItemCard({ item, index }) {
  return (
    <div className="border rounded-lg p-4 space-y-2">
      <div className="font-semibold">
        {item?.titulo || item?.first_text || `Linha ${index + 1}`}
      </div>

      <div className="text-xs text-gray-600 flex gap-2 flex-wrap">
        {item?.data ? <span>{item.data}</span> : null}
        {item?.museu ? <span>· {item.museu}</span> : null}
        {item?.equipe ? <span>· {item.equipe}</span> : null}
        {item?.classificacao ? <span>· {item.classificacao}</span> : null}
      </div>

      {item?.descricao ? (
        <div className="text-sm text-gray-600">{item.descricao}</div>
      ) : null}
    </div>
  );
}

function BaseConhecimentoInner() {
  const queryClient = useQueryClient();

  const [showUpload, setShowUpload] = useState(false);
  const [mirror, setMirror] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [busca, setBusca] = useState('');
  const [pergunta, setPergunta] = useState('');
  const [resposta, setResposta] = useState('');
  const [loadingIA, setLoadingIA] = useState(false);

  const { data: docs = [], refetch } = useQuery({
    queryKey: ['knowledge-docs'],
    queryFn: () => base44.entities.KnowledgeDocument.list('-created_date', 100),
  });

  const refreshDocs = async () => {
    await queryClient.invalidateQueries({ queryKey: ['knowledge-docs'] });
    await refetch();
  };

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
    if (!pergunta.trim()) return;

    setLoadingIA(true);
    setResposta('');

    try {
      const documentosContexto = docs.map((doc) => ({
        titulo: doc?.titulo || '',
        categoria: doc?.categoria || '',
        cargo_relacionado: doc?.cargo_relacionado || '',
        resumo_ia: doc?.resumo_ia || '',
        tags: doc?.tags || '',
        conteudo_extraido: doc?.texto_extraido || doc?.conteudo_extraido || '',
      }));

      const res = await base44.functions.invoke('askBaseConhecimento', {
        pergunta,
        contexto: mirror?.items || [],
        grouped_by_day: mirror?.grouped_by_day || {},
        grouped_by_month: mirror?.grouped_by_month || {},
        counts_by_museum: mirror?.counts_by_museum || {},
        documentos: documentosContexto,
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
    const termo = busca.trim().toLowerCase();

    if (!termo) return items;

    return items.filter((item) =>
      JSON.stringify(item || {}).toLowerCase().includes(termo)
    );
  }, [mirror, busca]);

  return (
    <div className="p-6 space-y-8">

      <div className="flex justify-between items-center gap-3">
        <div>
          <h1 className="text-xl font-bold">Biblioteca de Conhecimento IA</h1>
          <div className="text-sm text-gray-500">
            Documentos inteligentes + base espelhada da programação
          </div>
        </div>

        <div className="flex gap-2">
          <Button onClick={syncMirror} disabled={syncing}>
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          </Button>

          <Button onClick={() => setShowUpload(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Adicionar Documento
          </Button>
        </div>
      </div>

      <div className="border rounded-lg p-4 flex justify-between items-center gap-4">
        <div>
          <div className="text-xs text-gray-500">Base espelhada da planilha</div>
          <div className="font-medium flex items-center gap-2">
            <Database className="w-4 h-4" />
            {mirror?.total_items || 0} registros
          </div>
        </div>

        <div className="text-sm text-gray-500 text-right">
          {mirror?.last_sync
            ? `Atualizado em ${new Date(mirror.last_sync).toLocaleString('pt-BR')}`
            : 'Carregando...'}
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <MessageCircle className="w-4 h-4" />
          Consultar base e documentos com IA
        </div>

        <Input
          placeholder="Ex: programação do MIS em março, minibio, atividades da semana, conteúdo dos relatórios"
          value={pergunta}
          onChange={(e) => setPergunta(e.target.value)}
        />

        <Button onClick={perguntarIA} disabled={loadingIA}>
          {loadingIA ? 'Consultando...' : 'Perguntar'}
        </Button>

        {resposta ? (
          <div className="bg-gray-50 p-3 rounded text-sm whitespace-pre-wrap">
            {resposta}
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <Database className="w-4 h-4" />
          Espelho da planilha
        </div>

        <Input
          placeholder="Buscar direto na planilha espelhada"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        <div className="space-y-3">
          {itensFiltrados.map((item, i) => (
            <MirrorItemCard key={`${item?.row_index || i}-${i}`} item={item} index={i} />
          ))}

          {!itensFiltrados.length ? (
            <div className="border rounded-lg p-4 text-sm text-gray-500">
              Nenhum item encontrado na planilha espelhada.
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2 font-semibold">
          <FileText className="w-4 h-4" />
          Documentos analisados pela IA
        </div>

        <div className="space-y-3">
          {docs.map((doc) => (
            <DocCard
              key={doc.id}
              doc={doc}
              onToggle={async (d) => {
                await base44.entities.KnowledgeDocument.update(d.id, { ativo: !d.ativo });
                await refreshDocs();
              }}
              onDelete={async (d) => {
                await base44.entities.KnowledgeDocument.delete(d.id);
                await refreshDocs();
              }}
            />
          ))}

          {!docs.length ? (
            <div className="border rounded-lg p-4 text-sm text-gray-500">
              Nenhum documento carregado ainda.
            </div>
          ) : null}
        </div>
      </div>

      <UploadDialog
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onSaved={refreshDocs}
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
