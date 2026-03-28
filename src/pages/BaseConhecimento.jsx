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
  ToggleLeft,
  ToggleRight,
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

  if (mime.includes('image') || ['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) {
    return <FileImage className="w-4 h-4" />;
  }

  if (mime.includes('pdf') || ext === 'pdf') {
    return <FileText className="w-4 h-4" />;
  }

  return <File className="w-4 h-4" />;
}

function formatDate(value) {
  if (!value) return '—';

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleString('pt-BR');
  }

  return String(value);
}

function formatProgramacaoDate(item) {
  if (item?.data) return item.data;

  if (item?.data_inicio) {
    const date = new Date(item.data_inicio);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('pt-BR');
    }
    return item.data_inicio;
  }

  return 'Sem data';
}

function extractEntityList(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.items)) return res.items;
  return [];
}

function BaseConhecimentoInner() {
  const queryClient = useQueryClient();

  const [pergunta, setPergunta] = useState('');
  const [resposta, setResposta] = useState('');
  const [loadingIA, setLoadingIA] = useState(false);

  const [showUpload, setShowUpload] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [deletingId, setDeletingId] = useState('');
  const [togglingId, setTogglingId] = useState('');
  const [syncingProgramacao, setSyncingProgramacao] = useState(false);
  const [previewDoc, setPreviewDoc] = useState(null);

  const {
    data: docs = [],
    isLoading: loadingDocs,
    refetch: refetchDocs,
    isFetching: isFetchingDocs,
  } = useQuery({
    queryKey: ['knowledge-docs'],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('listKnowledgeDocuments');
        if (Array.isArray(res?.data?.items)) return res.data.items;
        if (Array.isArray(res?.items)) return res.items;
      } catch (error) {
        console.error('Erro ao listar por function listKnowledgeDocuments:', error);
      }

      try {
        const entityDocs = await base44.entities.KnowledgeDocument.list('-created_date', 200);
        return extractEntityList(entityDocs);
      } catch (error) {
        console.error('Erro ao listar KnowledgeDocument diretamente:', error);
        return [];
      }
    },
    staleTime: 1000 * 60 * 2,
  });

  const {
    data: programacao = [],
    isLoading: loadingProgramacao,
    refetch: refetchProgramacao,
    isFetching: isFetchingProgramacao,
  } = useQuery({
    queryKey: ['programacao-preview'],
    queryFn: async () => {
      try {
        const res = await base44.entities.Programacao.list('-data_inicio', 150);
        return extractEntityList(res);
      } catch (error) {
        console.error('Erro ao listar Programacao:', error);
        return [];
      }
    },
    staleTime: 1000 * 60 * 2,
  });

  const refreshAll = async () => {
    await Promise.all([
      refetchDocs(),
      refetchProgramacao(),
      queryClient.invalidateQueries({ queryKey: ['knowledge-docs'] }),
      queryClient.invalidateQueries({ queryKey: ['programacao-preview'] }),
      queryClient.invalidateQueries({ queryKey: ['programacao-clean'] }),
    ]);
  };

  const perguntarIA = async () => {
    if (!pergunta.trim()) return;

    setLoadingIA(true);
    setResposta('');

    try {
      const res = await base44.functions.invoke('askBaseConhecimento', {
        pergunta,
        documentos: docs || [],
        programacao: programacao || [],
      });

      setResposta(
        res?.data?.resposta ||
          res?.resposta ||
          'Sem resposta.'
      );
    } catch (error) {
      console.error('Erro ao consultar IA:', error);
      setResposta('Erro ao consultar IA.');
    } finally {
      setLoadingIA(false);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      toast.error('Selecione um arquivo antes de enviar.');
      return;
    }

    setUploading(true);

    try {
      const contentBase64 = await fileToBase64(selectedFile);

      const res = await base44.functions.invoke('processDocumentUpload', {
        file_name: selectedFile.name,
        mime_type: selectedFile.type || 'application/octet-stream',
        content_base64: contentBase64,
        titulo: selectedFile.name.replace(/\.[^/.]+$/, ''),
        categoria: '',
        descricao: `Arquivo enviado para a biblioteca em ${new Date().toLocaleString('pt-BR')}`,
        tags: ['biblioteca', 'upload_manual'],
      });

      const result = res?.data || res || {};

      if (!result?.ok || !result?.saved || !result?.knowledge_document_id) {
        throw new Error(result?.error || 'Falha ao persistir documento.');
      }

      await refreshAll();
      setSelectedFile(null);
      setShowUpload(false);

      if (result?.ia_processed) {
        toast.success('Arquivo gravado e analisado com sucesso.');
      } else {
        toast.success('Arquivo gravado com sucesso.', {
          description: 'A análise automática não foi concluída, mas o documento foi salvo.',
        });
      }
    } catch (error) {
      console.error('Erro no upload:', error);
      toast.error('Erro ao enviar arquivo.', {
        description: error?.message || 'Tente novamente.',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteDoc = async (doc) => {
    if (!doc?.id) return;

    const ok = window.confirm(`Excluir "${getDocTitle(doc, 0)}"?`);
    if (!ok) return;

    setDeletingId(doc.id);

    try {
      await base44.entities.KnowledgeDocument.delete(doc.id);
      await refreshAll();
      toast.success('Documento removido com sucesso.');
    } catch (error) {
      console.error('Erro ao remover documento:', error);
      toast.error('Erro ao remover documento.');
    } finally {
      setDeletingId('');
    }
  };

  const handleToggleDoc = async (doc) => {
    if (!doc?.id) return;

    setTogglingId(doc.id);

    try {
      const ativoAtual = doc?.ativo ?? doc?.active ?? true;

      await base44.entities.KnowledgeDocument.update(doc.id, {
        ativo: !ativoAtual,
      });

      await refreshAll();
      toast.success(`Documento ${ativoAtual ? 'desativado' : 'ativado'} com sucesso.`);
    } catch (error) {
      console.error('Erro ao alternar status do documento:', error);
      toast.error('Erro ao alternar status do documento.');
    } finally {
      setTogglingId('');
    }
  };

  const handleSyncProgramacao = async () => {
    setSyncingProgramacao(true);

    try {
      const res = await base44.functions.invoke('syncProgramacao', {});
      const data = res?.data || res || {};

      await refreshAll();

      if (data?.ok) {
        toast.success('Programação sincronizada com sucesso.', {
          description: `Itens: ${data?.total_items ?? 0} | Criados: ${data?.created ?? 0} | Removidos anteriores: ${data?.deleted_previous ?? 0}`,
        });
      } else {
        toast.error('Sync da programação retornou erro.', {
          description: data?.error || 'Verifique o backend.',
        });
      }
    } catch (error) {
      console.error('Erro no syncProgramacao:', error);
      toast.error('Erro ao sincronizar programação.', {
        description: error?.message || 'Tente novamente.',
      });
    } finally {
      setSyncingProgramacao(false);
    }
  };

  const filteredDocs = useMemo(() => {
    return [...docs].sort((a, b) => {
      const da = new Date(a?.created_date || 0).getTime();
      const db = new Date(b?.created_date || 0).getTime();
      return db - da;
    });
  }, [docs]);

  const groupedByCategory = useMemo(() => {
    const groups = new Map();

    filteredDocs.forEach((doc) => {
      const categoria = doc?.categoria || 'Sem categoria';
      if (!groups.has(categoria)) groups.set(categoria, []);
      groups.get(categoria).push(doc);
    });

    return Array.from(groups.entries()).sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [filteredDocs]);

  const activeCount = filteredDocs.filter((doc) => (doc?.ativo ?? doc?.active ?? true)).length;

  const programacaoPreview = useMemo(() => {
    return [...programacao]
      .sort((a, b) => {
        const da = new Date(a?.data_inicio || a?.data || 0).getTime();
        const db = new Date(b?.data_inicio || b?.data || 0).getTime();
        return db - da;
      })
      .slice(0, 12);
  }, [programacao]);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="bg-white border rounded-2xl p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-5 h-5 text-slate-600" />
                <h1 className="text-2xl font-semibold text-slate-900">Base de Conhecimento</h1>
              </div>
              <p className="text-slate-600">
                Biblioteca de documentos e consulta assistida por IA, sem sincronização automática ao abrir a página.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={refreshAll}
                disabled={isFetchingDocs || isFetchingProgramacao}
                className="gap-2"
              >
                {isFetchingDocs || isFetchingProgramacao ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Atualizar
              </Button>

              <Button
                variant="outline"
                onClick={handleSyncProgramacao}
                disabled={syncingProgramacao}
                className="gap-2"
              >
                {syncingProgramacao ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Sync Programação
              </Button>

              <Button onClick={() => setShowUpload(true)} className="gap-2">
                <Upload className="w-4 h-4" />
                Enviar arquivo
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div className="bg-white border rounded-2xl p-5 shadow-sm">
            <p className="text-sm text-slate-500">Documentos</p>
            <p className="text-3xl font-semibold text-slate-900 mt-2">{filteredDocs.length}</p>
          </div>

          <div className="bg-white border rounded-2xl p-5 shadow-sm">
            <p className="text-sm text-slate-500">Ativos</p>
            <p className="text-3xl font-semibold text-slate-900 mt-2">{activeCount}</p>
          </div>

          <div className="bg-white border rounded-2xl p-5 shadow-sm">
            <p className="text-sm text-slate-500">Categorias</p>
            <p className="text-3xl font-semibold text-slate-900 mt-2">{groupedByCategory.length}</p>
          </div>

          <div className="bg-white border rounded-2xl p-5 shadow-sm">
            <p className="text-sm text-slate-500">Programação carregada</p>
            <p className="text-3xl font-semibold text-slate-900 mt-2">{programacao.length}</p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr,0.8fr]">
          <div className="space-y-6">
            <div className="bg-white border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <MessageCircle className="w-5 h-5 text-slate-600" />
                <h2 className="text-lg font-semibold text-slate-900">Consulta com IA</h2>
              </div>

              <div className="flex flex-col gap-3">
                <Input
                  placeholder="Faça uma pergunta sobre os documentos ou a programação..."
                  value={pergunta}
                  onChange={(e) => setPergunta(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !loadingIA) {
                      perguntarIA();
                    }
                  }}
                />

                <div className="flex justify-end">
                  <Button onClick={perguntarIA} disabled={loadingIA || !pergunta.trim()} className="gap-2">
                    {loadingIA ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <MessageCircle className="w-4 h-4" />
                    )}
                    Perguntar à IA
                  </Button>
                </div>

                <div className="min-h-[120px] rounded-xl border bg-slate-50 p-4 text-sm text-slate-700 whitespace-pre-wrap">
                  {loadingIA ? 'Consultando IA...' : resposta || 'A resposta aparecerá aqui.'}
                </div>
              </div>
            </div>

            <div className="bg-white border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Biblioteca</h2>
                  <p className="text-sm text-slate-500">
                    Listagem principal via function <code>listKnowledgeDocuments</code>.
                  </p>
                </div>

                {(loadingDocs || isFetchingDocs) && <Loader2 className="w-4 h-4 animate-spin text-slate-500" />}
              </div>

              {loadingDocs ? (
                <div className="py-10 flex items-center justify-center text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Carregando documentos...
                </div>
              ) : filteredDocs.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-slate-500">
                  Nenhum documento encontrado.
                </div>
              ) : (
                <div className="space-y-6">
                  {groupedByCategory.map(([categoria, items]) => (
                    <div key={categoria} className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{categoria}</Badge>
                        <span className="text-sm text-slate-500">{items.length} item(ns)</span>
                      </div>

                      <div className="space-y-3">
                        {items.map((doc, index) => {
                          const ativo = doc?.ativo ?? doc?.active ?? true;

                          return (
                            <div
                              key={doc?.id || `${categoria}-${index}`}
                              className="border rounded-xl p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  {getDocIcon(doc)}
                                  <p className="font-medium text-slate-900 truncate">
                                    {getDocTitle(doc, index)}
                                  </p>
                                  <Badge variant={ativo ? 'default' : 'outline'}>
                                    {ativo ? 'Ativo' : 'Inativo'}
                                  </Badge>
                                </div>

                                <div className="text-sm text-slate-500 space-y-1">
                                  <p>Enviado em: {formatDate(doc?.created_date)}</p>
                                  <p>Arquivo: {doc?.file_name || doc?.filename || '—'}</p>
                                  <p>Tipo: {doc?.mime_type || getDocExtension(doc) || '—'}</p>
                                </div>
                              </div>

                              <div className="flex flex-wrap gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setPreviewDoc(doc)}
                                  className="gap-2"
                                >
                                  <Eye className="w-4 h-4" />
                                  Ver
                                </Button>

                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleToggleDoc(doc)}
                                  disabled={togglingId === doc?.id}
                                  className="gap-2"
                                >
                                  {togglingId === doc?.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : ativo ? (
                                    <ToggleRight className="w-4 h-4" />
                                  ) : (
                                    <ToggleLeft className="w-4 h-4" />
                                  )}
                                  {ativo ? 'Desativar' : 'Ativar'}
                                </Button>

                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => handleDeleteDoc(doc)}
                                  disabled={deletingId === doc?.id}
                                  className="gap-2"
                                >
                                  {deletingId === doc?.id ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    <Trash2 className="w-4 h-4" />
                                  )}
                                  Excluir
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white border rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Prévia da Programação</h2>
                  <p className="text-sm text-slate-500">
                    Leitura direta da entity <code>Programacao</code>.
                  </p>
                </div>

                {(loadingProgramacao || isFetchingProgramacao) && (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                )}
              </div>

              {loadingProgramacao ? (
                <div className="py-10 flex items-center justify-center text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  Carregando programação...
                </div>
              ) : programacaoPreview.length === 0 ? (
                <div className="rounded-xl border border-dashed p-8 text-center text-slate-500">
                  Nenhum item encontrado em Programacao.
                </div>
              ) : (
                <div className="space-y-3">
                  {programacaoPreview.map((item, index) => (
                    <div key={item?.id || index} className="border rounded-xl p-4">
                      <p className="font-medium text-slate-900">
                        {item?.titulo || item?.nome || 'Sem título'}
                      </p>
                      <div className="mt-2 text-sm text-slate-500 space-y-1">
                        <p>Data: {formatProgramacaoDate(item)}</p>
                        <p>Museu: {item?.museu || '—'}</p>
                        <p>Horário: {item?.horario || '—'}</p>
                        <p>Local: {item?.local || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border rounded-2xl p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900 mb-3">Regras aplicadas</h2>
              <div className="space-y-2 text-sm text-slate-600">
                <p>• Esta tela não executa sync automático ao montar.</p>
                <p>• Upload grava <code>KnowledgeDocument</code> e atualiza a listagem imediatamente.</p>
                <p>• O botão <code>Sync Programação</code> dispara a sincronização apenas manualmente.</p>
                <p>• O toggle ativo/inativo atua diretamente no documento salvo.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showUpload} onOpenChange={setShowUpload}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Enviar documento</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-xl border border-dashed p-4">
              <Input
                type="file"
                onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              />
            </div>

            {selectedFile && (
              <div className="text-sm text-slate-600">
                <p><strong>Arquivo:</strong> {selectedFile.name}</p>
                <p><strong>Tamanho:</strong> {(selectedFile.size / 1024).toFixed(1)} KB</p>
                <p><strong>Tipo:</strong> {selectedFile.type || 'desconhecido'}</p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUpload(false)} disabled={uploading}>
              Cancelar
            </Button>
            <Button onClick={handleUpload} disabled={uploading || !selectedFile} className="gap-2">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewDoc} onOpenChange={(open) => !open && setPreviewDoc(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{previewDoc ? getDocTitle(previewDoc, 0) : 'Documento'}</DialogTitle>
          </DialogHeader>

          {previewDoc && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2 text-sm">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-slate-500 mb-1">Arquivo</p>
                  <p className="text-slate-900 break-all">
                    {previewDoc?.file_name || previewDoc?.filename || '—'}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-slate-500 mb-1">Status</p>
                  <p className="text-slate-900">
                    {(previewDoc?.ativo ?? previewDoc?.active ?? true) ? 'Ativo' : 'Inativo'}
                  </p>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-slate-500 mb-1">Criado em</p>
                  <p className="text-slate-900">{formatDate(previewDoc?.created_date)}</p>
                </div>

                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="text-slate-500 mb-1">Categoria</p>
                  <p className="text-slate-900">{previewDoc?.categoria || 'Sem categoria'}</p>
                </div>
              </div>

              <div className="rounded-xl border p-4 max-h-[420px] overflow-auto">
                <p className="text-sm text-slate-500 mb-2">Texto extraído</p>
                <div className="text-sm text-slate-700 whitespace-pre-wrap">
                  {previewDoc?.extracted_text ||
                    previewDoc?.conteudo_extraido ||
                    previewDoc?.description ||
                    'Nenhum conteúdo textual disponível para prévia.'}
                </div>
              </div>
            </div>
          )}
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
