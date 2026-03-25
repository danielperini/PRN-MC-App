import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  RefreshCw,
  Database,
  MessageCircle,
  FileText,
  Loader2,
  Upload,
  Eye,
  Trash2,
  FileSpreadsheet,
  FileImage,
  File,
} from 'lucide-react';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };

    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getDocTitle(doc, index) {
  return (
    doc?.title ||
    doc?.name ||
    doc?.file_name ||
    doc?.filename ||
    `Documento ${index + 1}`
  );
}

function getDocExtension(doc) {
  const name =
    doc?.file_name ||
    doc?.filename ||
    doc?.name ||
    doc?.title ||
    '';

  const parts = String(name).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function getDocIcon(doc) {
  const ext = getDocExtension(doc);
  const mime = String(doc?.mime_type || '').toLowerCase();

  if (
    ext === 'xlsx' ||
    ext === 'xls' ||
    ext === 'csv' ||
    mime.includes('sheet') ||
    mime.includes('excel') ||
    mime.includes('csv')
  ) {
    return <FileSpreadsheet className="w-4 h-4" />;
  }

  if (mime.includes('image') || ['png', 'jpg', 'jpeg', 'webp'].includes(ext)) {
    return <FileImage className="w-4 h-4" />;
  }

  if (ext === 'pdf') {
    return <FileText className="w-4 h-4" />;
  }

  return <File className="w-4 h-4" />;
}

function BaseConhecimentoInner() {
  const queryClient = useQueryClient();

  const [busca, setBusca] = useState('');
  const [pergunta, setPergunta] = useState('');
  const [resposta, setResposta] = useState('');
  const [loadingIA, setLoadingIA] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [deletingId, setDeletingId] = useState('');

  const {
    data: mirror,
    isLoading: loadingMirror,
    refetch: refetchMirror,
    isFetching: isFetchingMirror,
  } = useQuery({
    queryKey: ['base-conhecimento'],
    queryFn: async () => {
      const res = await base44.functions.invoke('syncBaseConhecimento');
      return res?.data || {};
    },
    refetchOnWindowFocus: true,
    staleTime: 1000 * 60 * 5,
  });

  const {
    data: docs = [],
    isLoading: loadingDocs,
    refetch: refetchDocs,
  } = useQuery({
    queryKey: ['knowledge-docs'],
    queryFn: async () => {
      const res = await base44.functions.invoke('listKnowledgeDocuments', {
        limit: 200,
      });
      return res?.data?.items || [];
    },
    staleTime: 1000 * 60 * 2,
  });

  const perguntarIA = async () => {
    if (!pergunta.trim()) return;

    setLoadingIA(true);
    setResposta('');

    try {
      const res = await base44.functions.invoke('askBaseConhecimento', {
        pergunta,
        contexto: mirror?.items || [],
        grouped_by_day: mirror?.grouped_by_day || {},
        grouped_by_month: mirror?.grouped_by_month || {},
        counts_by_museum: mirror?.counts_by_museum || {},
        documentos: docs || [],
      });

      setResposta(res?.data?.resposta || 'Sem resposta.');
    } catch (error) {
      setResposta('Erro ao consultar IA.');
    } finally {
      setLoadingIA(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Selecione um arquivo.');
      return;
    }

    setUploading(true);

    try {
      const contentBase64 = await fileToBase64(selectedFile);

      const res = await base44.functions.invoke('processDocumentUpload', {
        file_name: selectedFile.name,
        mime_type: selectedFile.type || '',
        size_bytes: selectedFile.size || 0,
        content_base64: contentBase64,
        titulo: selectedFile.name.replace(/\.[^/.]+$/, ''),
        categoria: 'Biblioteca do Conhecimento',
        descricao: `Arquivo gravado na biblioteca em ${new Date().toLocaleString('pt-BR')}`,
        tags: ['biblioteca', 'upload_manual'],
      });

      if (res?.data?.ok === false) {
        throw new Error(res?.data?.error || 'Falha no processamento do arquivo.');
      }

      toast.success('Arquivo gravado na biblioteca com sucesso.');

      setSelectedFile(null);
      setShowUpload(false);

      await Promise.all([
        refetchDocs(),
        refetchMirror(),
        queryClient.invalidateQueries({ queryKey: ['knowledge-docs'] }),
        queryClient.invalidateQueries({ queryKey: ['base-conhecimento'] }),
      ]);

      if (res?.data?.ia_processed) {
        toast.success('Análise por IA concluída.');
      } else {
        toast.success('Arquivo salvo. A análise será atualizada na biblioteca.');
      }
    } catch (error) {
      toast.error(error?.message || 'Erro ao gravar arquivo na biblioteca.');
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (doc) => {
    if (!doc?.id) return;

    try {
      setDeletingId(doc.id);
      await base44.entities.KnowledgeDocument.delete(doc.id);
      toast.success('Documento removido com sucesso.');

      await Promise.all([
        refetchDocs(),
        queryClient.invalidateQueries({ queryKey: ['knowledge-docs'] }),
      ]);
    } catch (error) {
      toast.error('Erro ao remover documento.');
    } finally {
      setDeletingId('');
    }
  };

  const itensFiltrados = useMemo(() => {
    const items = Array.isArray(mirror?.items) ? mirror.items : [];
    const termo = normalizeText(busca);

    if (!termo) return items;

    return items.filter((item) =>
      normalizeText(
        [
          item?.nome,
          item?.titulo,
          item?.sinopse,
          item?.descricao,
          item?.tipo,
          item?.tipo_atividade,
          item?.horario,
          item?.vagas,
          item?.inscricao,
          item?.inscricao_acesso,
          item?.museu,
          item?.data,
          item?.local,
          item?.endereco_completo,
          item?.material_de_divulgacao,
          item?.minibios,
          item?.resumo_ia,
        ]
          .filter(Boolean)
          .join(' ')
      ).includes(termo)
    );
  }, [mirror, busca]);

  const docsFiltrados = useMemo(() => {
    const termo = normalizeText(busca);

    if (!termo) return docs;

    return docs.filter((doc) =>
      normalizeText(
        [
          doc?.title,
          doc?.name,
          doc?.file_name,
          doc?.filename,
          doc?.mime_type,
          doc?.status,
          doc?.processing_status,
          doc?.summary,
          doc?.analysis,
          doc?.description,
          doc?.descricao,
          doc?.tipo_documento,
          doc?.categoria,
        ]
          .filter(Boolean)
          .join(' ')
      ).includes(termo)
    );
  }, [docs, busca]);

  const totalItens =
    mirror?.total_items || (Array.isArray(mirror?.items) ? mirror.items.length : 0);
  const totalDocs = Array.isArray(docs) ? docs.length : 0;

  return (
    <div className="p-6 space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Biblioteca de Conhecimento IA</h1>
          <p className="text-sm text-gray-500">
            Base da programação, documentos enviados e leitura automática por IA.
          </p>
        </div>

        <div className="flex gap-2">
          <Button onClick={() => setShowUpload(true)}>
            <Upload className="w-4 h-4 mr-2" />
            Adicionar arquivo
          </Button>

          <Button onClick={() => refetchMirror()} disabled={isFetchingMirror}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isFetchingMirror ? 'animate-spin' : ''}`} />
            Atualizar base
          </Button>

          <Button onClick={() => refetchDocs()} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Atualizar arquivos
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <Database className="w-4 h-4" />
            Base espelhada
          </div>
          <div className="text-2xl font-bold">{totalItens}</div>
          <div className="text-sm text-gray-500">registros da programação</div>
        </div>

        <div className="border rounded-lg p-4">
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
            <FileText className="w-4 h-4" />
            Documentos
          </div>
          <div className="text-2xl font-bold">{totalDocs}</div>
          <div className="text-sm text-gray-500">todos os formatos listados</div>
        </div>

        <div className="border rounded-lg p-4">
          <div className="text-xs text-gray-500 mb-1">Última sincronização</div>
          <div className="font-semibold">
            {mirror?.last_sync
              ? new Date(mirror.last_sync).toLocaleString('pt-BR')
              : 'Ainda não sincronizado'}
          </div>
          <div className="text-sm text-gray-500 truncate">
            {mirror?.source_url || 'Fonte da planilha não informada'}
          </div>
        </div>
      </div>

      <div className="border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4" />
          <h2 className="font-semibold">Consulta por IA</h2>
        </div>

        <div className="flex flex-col md:flex-row gap-2">
          <Input
            placeholder="Pergunte sobre programação, museu, mês, atividade ou documentos"
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !loadingIA) perguntarIA();
            }}
          />
          <Button onClick={perguntarIA} disabled={loadingIA || !pergunta.trim()}>
            {loadingIA ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Consultando
              </>
            ) : (
              'Perguntar'
            )}
          </Button>
        </div>

        {resposta && (
          <div className="bg-gray-50 border rounded-lg p-4 text-sm whitespace-pre-wrap">
            {resposta}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <Input
          placeholder="Buscar na base e em todos os arquivos"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary">{itensFiltrados.length} registros</Badge>
          <Badge variant="secondary">{docsFiltrados.length} arquivos</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.15fr_0.85fr] gap-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4" />
            <h2 className="font-semibold">Programação espelhada</h2>
          </div>

          {loadingMirror ? (
            <div className="border rounded-lg p-4 text-sm text-gray-500">
              Carregando base espelhada...
            </div>
          ) : itensFiltrados.length === 0 ? (
            <div className="border rounded-lg p-4 text-sm text-gray-500">
              Nenhum registro encontrado.
            </div>
          ) : (
            itensFiltrados.map((item, i) => (
              <div
                key={`${item?.id || item?.row_index || i}-${item?.titulo || item?.nome || i}`}
                className="border rounded-lg p-4"
              >
                <div className="font-semibold">
                  {item?.nome || item?.titulo || 'Sem título'}
                </div>

                <div className="text-xs text-gray-500 mt-1">
                  {[item?.data, item?.horario, item?.museu].filter(Boolean).join(' · ') || 'Sem metadados'}
                </div>

                {(item?.sinopse || item?.descricao) && (
                  <div className="text-sm text-gray-700 mt-2">
                    {item?.sinopse || item?.descricao}
                  </div>
                )}

                {item?.resumo_ia && (
                  <div className="text-sm text-gray-700 mt-2">
                    {item.resumo_ia}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <h2 className="font-semibold">Arquivos da biblioteca</h2>
          </div>

          {loadingDocs ? (
            <div className="border rounded-lg p-4 text-sm text-gray-500">
              Carregando arquivos...
            </div>
          ) : docsFiltrados.length === 0 ? (
            <div className="border rounded-lg p-4 text-sm text-gray-500">
              Nenhum arquivo encontrado.
            </div>
          ) : (
            docsFiltrados.map((doc, index) => {
              const title = getDocTitle(doc, index);
              const status = doc?.processing_status || doc?.status || '';
              const openUrl = doc?.file_url || doc?.url || doc?.document_url || '';

              return (
                <div key={doc?.id || `${title}-${index}`} className="border rounded-lg p-4">
                  <div className="flex items-center gap-2 font-semibold">
                    {getDocIcon(doc)}
                    <span>{title}</span>
                  </div>

                  <div className="text-xs text-gray-500 mt-1">
                    {[
                      getDocExtension(doc) ? `.${getDocExtension(doc)}` : '',
                      doc?.mime_type || '',
                      doc?.tipo_documento || '',
                      status,
                      doc?.created_date ? new Date(doc.created_date).toLocaleString('pt-BR') : '',
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>

                  {doc?.summary && (
                    <div className="text-sm text-gray-700 mt-2">
                      {doc.summary}
                    </div>
                  )}

                  <div className="flex gap-2 mt-3">
                    {openUrl ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(openUrl, '_blank')}
                      >
                        <Eye className="w-4 h-4 mr-2" />
                        Ver
                      </Button>
                    ) : null}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDeleteDoc(doc)}
                      disabled={deletingId === doc?.id}
                    >
                      {deletingId === doc?.id ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="w-4 h-4 mr-2" />
                      )}
                      Excluir
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar arquivo à biblioteca</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <Input
              type="file"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
            />

            <div className="text-sm text-gray-500">
              O arquivo é primeiro gravado na biblioteca. Depois disso, a IA analisa e atualiza a base automaticamente.
            </div>

            {selectedFile && (
              <div className="text-sm">
                Arquivo selecionado: <strong>{selectedFile.name}</strong>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)}>
              Cancelar
            </Button>

            <Button onClick={handleUpload} disabled={uploading || !selectedFile}>
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gravando
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Gravar na biblioteca
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
