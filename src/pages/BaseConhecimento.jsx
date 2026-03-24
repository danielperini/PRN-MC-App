import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import RequireAuth from '../components/auth/RequireAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  RefreshCw,
  Database,
  MessageCircle,
  FileText,
  Loader2,
  Eye,
  Trash2,
} from 'lucide-react';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function BaseConhecimentoInner() {
  const queryClient = useQueryClient();

  const [busca, setBusca] = useState('');
  const [pergunta, setPergunta] = useState('');
  const [resposta, setResposta] = useState('');
  const [loadingIA, setLoadingIA] = useState(false);
  const [deletingId, setDeletingId] = useState('');

  const {
    data: mirror,
    isLoading: loadingMirror,
    refetch,
    isFetching,
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
  } = useQuery({
    queryKey: ['knowledge-docs'],
    queryFn: () => base44.entities.KnowledgeDocument.list('-created_date', 100),
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
          item?.endereco,
          item?.equipe,
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
          doc?.status,
          doc?.processing_status,
          doc?.summary,
          doc?.analysis,
          doc?.description,
        ]
          .filter(Boolean)
          .join(' ')
      ).includes(termo)
    );
  }, [docs, busca]);

  const handleDeleteDoc = async (doc) => {
    const id = doc?.id;
    if (!id) return;

    try {
      setDeletingId(id);
      await base44.entities.KnowledgeDocument.delete(id);
      toast.success('Documento removido com sucesso.');
      queryClient.invalidateQueries({ queryKey: ['knowledge-docs'] });
    } catch (error) {
      toast.error('Erro ao remover documento.');
    } finally {
      setDeletingId('');
    }
  };

  const totalItens = mirror?.total_items || 0;
  const totalDocs = Array.isArray(docs) ? docs.length : 0;
  const loading = loadingMirror || loadingDocs;

  return (
    <div className="p-6 space-y-8">

      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Biblioteca de Conhecimento IA</h1>
          <p className="text-sm text-gray-500">
            Base única da programação, consulta por IA e documentos analisados.
          </p>
        </div>

        <Button onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar base
        </Button>
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
          <div className="text-sm text-gray-500">arquivos cadastrados</div>
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
              if (e.key === 'Enter' && !loadingIA) {
                perguntarIA();
              }
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
          placeholder="Buscar na base e nos documentos"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        <div className="flex gap-2 flex-wrap">
          <Badge variant="secondary">{itensFiltrados.length} registros</Badge>
          <Badge variant="secondary">{docsFiltrados.length} documentos</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-6">

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
              <div key={`${item?.id || item?.row_index || i}-${item?.titulo || item?.nome || i}`} className="border rounded-lg p-4">
                <div className="flex flex-col gap-1">
                  <div className="font-semibold">
                    {item?.nome || item?.titulo || 'Sem título'}
                  </div>

                  <div className="text-xs text-gray-500">
                    {[item?.data, item?.horario, item?.museu].filter(Boolean).join(' · ') || 'Sem metadados'}
                  </div>

                  {(item?.tipo || item?.tipo_atividade) && (
                    <div className="text-xs text-gray-600">
                      Tipo: {item?.tipo || item?.tipo_atividade}
                    </div>
                  )}

                  {item?.sinopse || item?.descricao ? (
                    <div className="text-sm text-gray-700 mt-1">
                      {item?.sinopse || item?.descricao}
                    </div>
                  ) : null}

                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 mt-2">
                    {item?.vagas ? <span>Vagas: {item.vagas}</span> : null}
                    {item?.inscricao || item?.inscricao_acesso ? (
                      <span>{item?.inscricao || item?.inscricao_acesso}</span>
                    ) : null}
                    {item?.local ? <span>Local: {item.local}</span> : null}
                    {item?.equipe ? <span>Equipe: {item.equipe}</span> : null}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            <h2 className="font-semibold">Documentos enviados</h2>
          </div>

          {loadingDocs ? (
            <div className="border rounded-lg p-4 text-sm text-gray-500">
              Carregando documentos...
            </div>
          ) : docsFiltrados.length === 0 ? (
            <div className="border rounded-lg p-4 text-sm text-gray-500">
              Nenhum documento encontrado.
            </div>
          ) : (
            docsFiltrados.map((doc, index) => {
              const title =
                doc?.title ||
                doc?.name ||
                doc?.file_name ||
                `Documento ${index + 1}`;

              const status = doc?.processing_status || doc?.status || '';
              const openUrl = doc?.file_url || doc?.url || doc?.document_url || '';

              return (
                <div key={doc?.id || `${title}-${index}`} className="border rounded-lg p-4">
                  <div className="font-semibold">{title}</div>

                  <div className="text-xs text-gray-500 mt-1">
                    {[status, doc?.created_date ? new Date(doc.created_date).toLocaleString('pt-BR') : '']
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
