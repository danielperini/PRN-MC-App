import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  CheckCircle,
  Trash2,
  RefreshCw,
  ExternalLink,
  Newspaper,
  Eye,
  Loader2,
  Wand2,
  AlertCircle,
  ChevronDown,
  Plus,
  Link,
} from 'lucide-react';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import { toast } from 'sonner';

const FONTE_COLORS = {
  web: 'bg-blue-100 text-blue-700',
  culturadoria_museus: 'bg-purple-100 text-purple-700',
  portal_museus_centro: 'bg-emerald-100 text-emerald-700',
  oportunidades: 'bg-amber-100 text-amber-700',
  internal: 'bg-gray-100 text-gray-600',
  web_search: 'bg-slate-100 text-slate-700',
};

function NewsCardCurated({
  news,
  onApprove,
  onReject,
  onDelete,
  processingId,
  isPublished,
}) {
  const isProcessing = processingId === news.id;
  const canApprove = typeof onApprove === 'function';
  const canReject = typeof onReject === 'function';
  const canDelete = typeof onDelete === 'function';

  const score = Number(news?.score_pertinencia || 0);
  const scoreColor =
    score >= 80
      ? 'text-green-600'
      : score >= 60
        ? 'text-amber-600'
        : 'text-red-600';

  const isPending = news?.status_curadoria === 'PENDENTE';
  const showPendingActions = isPending && (canApprove || canReject || canDelete);

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white hover:border-gray-300 transition-all">
      <div className="flex gap-4">
        {news?.imagem_url && (
          <img
            src={news.imagem_url}
            alt=""
            className="w-24 h-24 object-cover rounded-lg flex-shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex flex-wrap gap-2 items-center">
              <span
                className={`text-xs font-bold px-2 py-1 rounded-full ${
                  FONTE_COLORS[news?.fonte] || 'bg-gray-100 text-gray-700'
                }`}
              >
                {String(news?.fonte || 'fonte').toUpperCase()}
              </span>

              {news?.tipo_conteudo && (
                <Badge variant="outline" className="text-xs">
                  {news.tipo_conteudo}
                </Badge>
              )}

              <span className={`text-xs font-bold ${scoreColor}`}>
                Score: {score}%
              </span>

              {isPublished && (
                <Badge variant="secondary" className="text-xs">
                  Publicado
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              {news?.link && (
                <a
                  href={news.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-400 hover:text-black flex-shrink-0"
                  title="Abrir link"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}

              {canDelete && (
                <button
                  onClick={() => onDelete(news.id)}
                  disabled={isProcessing}
                  className="text-gray-400 hover:text-red-600 flex-shrink-0"
                  title="Deletar"
                  type="button"
                >
                  {isProcessing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </button>
              )}
            </div>
          </div>

          <h3 className="font-semibold text-gray-900 line-clamp-2 mb-1">
            {news?.titulo || 'Sem título'}
          </h3>

          <p className="text-sm text-gray-600 line-clamp-2 mb-2">
            {news?.resumo || ''}
          </p>

          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2 flex-wrap">
            {news?.data_publicacao && <span>{news.data_publicacao}</span>}
            {news?.palavra_chave_geradora && <span>•</span>}
            {news?.palavra_chave_geradora && (
              <span className="italic">"{news.palavra_chave_geradora}"</span>
            )}
          </div>

          {news?.motivo_curadoria && (
            <p className="text-xs bg-blue-50 border border-blue-200 rounded p-2 text-blue-800 mb-2">
              <strong>Motivo:</strong> {news.motivo_curadoria}
            </p>
          )}

          {Array.isArray(news?.tags) && news.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {news.tags.map((tag, index) => (
                <Badge key={`${tag}-${index}`} variant="secondary" className="text-xs">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {showPendingActions && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
          {canApprove && (
            <Button
              size="sm"
              onClick={() => onApprove(news.id)}
              disabled={isProcessing}
              className="bg-green-600 text-white hover:bg-green-700 text-xs flex-1 sm:flex-none"
              type="button"
            >
              {isProcessing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <CheckCircle className="w-3 h-3" />
              )}
              Publicar
            </Button>
          )}

          {canReject ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onReject(news.id)}
              disabled={isProcessing}
              className="text-xs text-red-600 border-red-200 hover:bg-red-50 flex-1 sm:flex-none"
              type="button"
            >
              <Trash2 className="w-3 h-3" /> Rejeitar
            </Button>
          ) : canDelete && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onDelete(news.id)}
              disabled={isProcessing}
              className="text-xs text-red-600 border-red-200 hover:bg-red-50 flex-1 sm:flex-none"
              type="button"
            >
              <Trash2 className="w-3 h-3" /> Rejeitar
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export default function CurationDashboard() {
  const [processingId, setProcessingId] = useState(null);
  const [curatingNow, setCuratingNow] = useState(false);
  const [, setShuffleSeed] = useState(0);
  const [expandedHelp, setExpandedHelp] = useState(null);
  const [manualUrl, setManualUrl] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualResumo, setManualResumo] = useState('');
  const [addingManual, setAddingManual] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const queryClient = useQueryClient();
  const { isCoordenador } = useCurrentUser();

  const { data: published = [], isLoading: loadingPublished } = useQuery({
    queryKey: ['news-published-curated'],
    queryFn: async () => {
      const all = await base44.entities.NewsHighlight.filter(
        { ativo: true },
        '-created_date',
        100
      );

      const safeList = Array.isArray(all) ? all : [];

      return safeList
        .filter((item) => item?.status_curadoria !== 'PENDENTE')
        .sort((a, b) => {
          const statusOrder = { PUBLICADO_AUTO: 0, APROVADO_MANUAL: 1 };
          return (statusOrder[a?.status_curadoria] ?? 2) - (statusOrder[b?.status_curadoria] ?? 2);
        });
    },
    refetchInterval: 30000,
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setShuffleSeed((prev) => prev + 1);
      queryClient.invalidateQueries({ queryKey: ['news-published-curated'] });
    }, 3600000);

    return () => clearInterval(interval);
  }, [queryClient]);

  const { data: pending = [], isLoading: loadingPending } = useQuery({
    queryKey: ['news-pending-curated'],
    queryFn: async () => {
      const list = await base44.entities.NewsHighlight.filter(
        { status_curadoria: 'PENDENTE' },
        '-created_date',
        100
      );
      return Array.isArray(list) ? list : [];
    },
    refetchInterval: 15000,
  });

  const countByType = (list, type) =>
    (Array.isArray(list) ? list : []).filter((n) => n?.tipo_conteudo === type).length;

  const countByStatus = (list, status) =>
    (Array.isArray(list) ? list : []).filter((n) => n?.status_curadoria === status).length;

  const handleApprove = async (id) => {
    setProcessingId(id);
    try {
      await base44.functions.invoke('approveCuratedNews', { newsId: id });

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['news-pending-curated'] }),
        queryClient.invalidateQueries({ queryKey: ['news-published-curated'] }),
        queryClient.invalidateQueries({ queryKey: ['today-news-v2'] }),
      ]);

      toast.success('Notícia publicada com sucesso!');
    } catch (e) {
      toast.error(`Erro ao publicar notícia: ${e?.message || 'tente novamente'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id) => {
    setProcessingId(id);
    try {
      await base44.entities.NewsHighlight.delete(id);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['news-pending-curated'] }),
        queryClient.invalidateQueries({ queryKey: ['today-news-v2'] }),
        queryClient.invalidateQueries({ queryKey: ['news-published-curated'] }),
      ]);

      toast.success('Notícia rejeitada.');
    } catch (e) {
      toast.error(`Erro ao rejeitar notícia: ${e?.message || 'tente novamente'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (id) => {
    setProcessingId(id);
    try {
      await base44.entities.NewsHighlight.delete(id);

      const pendingList = await base44.entities.NewsHighlight.filter(
        { status_curadoria: 'PENDENTE' },
        '-created_date',
        1
      );

      if (Array.isArray(pendingList) && pendingList.length > 0) {
        await base44.entities.NewsHighlight.update(pendingList[0].id, {
          ativo: true,
          status_curadoria: 'APROVADO_MANUAL',
        });
      }

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['news-published-curated'] }),
        queryClient.invalidateQueries({ queryKey: ['news-pending-curated'] }),
        queryClient.invalidateQueries({ queryKey: ['today-news-v2'] }),
      ]);

      toast.success('Notícia deletada.');
    } catch (e) {
      toast.error(`Erro ao deletar notícia: ${e?.message || 'tente novamente'}`);
    } finally {
      setProcessingId(null);
    }
  };

  const handleAddManual = async () => {
    if (!manualUrl.trim() || !manualTitle.trim()) return;

    setAddingManual(true);
    try {
      const today = new Date().toISOString().split('T')[0];

      await base44.entities.NewsHighlight.create({
        titulo: manualTitle.trim(),
        resumo: manualResumo.trim() || '',
        link: manualUrl.trim(),
        fonte: 'web_search',
        tipo_conteudo: 'NOTICIA',
        ativo: true,
        status_curadoria: 'APROVADO_MANUAL',
        score_pertinencia: 100,
        data_publicacao: today,
        tags: [],
      });

      setManualUrl('');
      setManualTitle('');
      setManualResumo('');
      setShowAddForm(false);

      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['news-published-curated'] }),
        queryClient.invalidateQueries({ queryKey: ['today-news-v2'] }),
      ]);

      toast.success('Notícia adicionada e publicada!');
    } catch (e) {
      toast.error(`Erro ao adicionar notícia: ${e?.message || 'tente novamente'}`);
    } finally {
      setAddingManual(false);
    }
  };

  const handleRunCuration = async () => {
    setCuratingNow(true);
    try {
      await base44.functions.invoke('runDailyCuration', {});

      const publishedNews = await base44.entities.NewsHighlight.filter(
        { ativo: true },
        '-created_date',
        100
      );

      const publishedList = Array.isArray(publishedNews)
        ? publishedNews.filter((item) => item?.status_curadoria !== 'PENDENTE')
        : [];

      const toDelete = Math.ceil(publishedList.length * 0.5);
      const idsToDelete = publishedList.slice(0, toDelete).map((n) => n.id);

      const pendingList = await base44.entities.NewsHighlight.filter(
        { status_curadoria: 'PENDENTE' },
        '-created_date',
        toDelete
      );

      for (const id of idsToDelete) {
        await base44.entities.NewsHighlight.delete(id);
      }

      for (const news of Array.isArray(pendingList) ? pendingList : []) {
        await base44.entities.NewsHighlight.update(news.id, {
          ativo: true,
          status_curadoria: 'APROVADO_MANUAL',
        });
      }

      setShuffleSeed((prev) => prev + 1);

      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['news-published-curated'] });
        queryClient.invalidateQueries({ queryKey: ['news-pending-curated'] });
        queryClient.invalidateQueries({ queryKey: ['today-news-v2'] });
      }, 2000);

      toast.success('Curadoria executada com sucesso!');
    } catch (e) {
      toast.error(`Erro ao rodar curadoria: ${e?.message || 'tente novamente'}`);
    } finally {
      setCuratingNow(false);
    }
  };

  const publishedShuffled = [...published].sort(() => Math.random() - 0.5);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Wand2 className="w-8 h-8" /> Curadoria IA - Claude
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Sistema automático de seleção e análise editorial
            </p>
          </div>

          <Button
            onClick={handleRunCuration}
            disabled={curatingNow}
            className="bg-black text-white hover:bg-gray-800 gap-2"
          >
            {curatingNow ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {curatingNow ? 'Curando...' : 'Rodar Curadoria Agora'}
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3">
            <div className="text-xs text-blue-600 font-semibold mb-1">Publicados (IA)</div>
            <div className="text-2xl font-bold text-blue-900">
              {countByStatus(published, 'PUBLICADO_AUTO')}
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-3">
            <div className="text-xs text-green-600 font-semibold mb-1">Publicados (Manual)</div>
            <div className="text-2xl font-bold text-green-900">
              {countByStatus(published, 'APROVADO_MANUAL')}
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-3">
            <div className="text-xs text-amber-600 font-semibold mb-1">Pendentes</div>
            <div className="text-2xl font-bold text-amber-900">{pending.length}</div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-3">
            <div className="text-xs text-purple-600 font-semibold mb-1">Notícias</div>
            <div className="text-2xl font-bold text-purple-900">
              {countByType(published, 'NOTICIA')}
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-3">
            <div className="text-xs text-orange-600 font-semibold mb-1">Artigos Densos</div>
            <div className="text-2xl font-bold text-orange-900">
              {countByType(published, 'ARTIGO_DENSO')}
            </div>
          </div>
        </div>
      </div>

      {isCoordenador && (
        <div className="mb-6">
          {!showAddForm ? (
            <button
              onClick={() => setShowAddForm(true)}
              className="flex items-center gap-2 text-sm font-semibold text-black border-2 border-dashed border-gray-300 hover:border-black rounded-lg px-4 py-3 w-full transition-all"
              type="button"
            >
              <Plus className="w-4 h-4" /> Adicionar link manualmente
            </button>
          ) : (
            <div className="border-2 border-black rounded-lg p-4 bg-white">
              <div className="flex items-center gap-2 mb-3">
                <Link className="w-4 h-4" />
                <span className="font-bold text-sm">Adicionar notícia manualmente</span>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">
                    URL da notícia *
                  </label>
                  <Input
                    placeholder="https://..."
                    value={manualUrl}
                    onChange={(e) => setManualUrl(e.target.value)}
                    className="text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">
                    Título *
                  </label>
                  <Input
                    placeholder="Título da notícia"
                    value={manualTitle}
                    onChange={(e) => setManualTitle(e.target.value)}
                    className="text-sm"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-600 mb-1 block">
                    Resumo (opcional)
                  </label>
                  <Input
                    placeholder="Breve descrição..."
                    value={manualResumo}
                    onChange={(e) => setManualResumo(e.target.value)}
                    className="text-sm"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAddManual}
                    disabled={addingManual || !manualUrl.trim() || !manualTitle.trim()}
                    className="bg-black text-white hover:bg-gray-800 gap-1"
                  >
                    {addingManual ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <CheckCircle className="w-3 h-3" />
                    )}
                    Publicar
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowAddForm(false);
                      setManualUrl('');
                      setManualTitle('');
                      setManualResumo('');
                    }}
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Eye className="w-5 h-5" /> Publicados ({published.length})
          </h2>

          <button
            onClick={() => setExpandedHelp(expandedHelp === 'published' ? null : 'published')}
            className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1"
            type="button"
          >
            <ChevronDown
              className={`w-4 h-4 transition-transform ${
                expandedHelp === 'published' ? 'rotate-180' : ''
              }`}
            />
            Sobre
          </button>
        </div>

        {expandedHelp === 'published' && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
            Conteúdo aprovado manualmente ou publicado automaticamente. Clique no lixo para
            deletar e substituir por pendente.
          </div>
        )}

        {loadingPublished ? (
          <div className="flex items-center justify-center h-32 gap-2 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
          </div>
        ) : published.length === 0 ? (
          <div className="text-center py-8 text-gray-400 border border-dashed rounded-lg">
            <Newspaper className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p>Nenhum conteúdo publicado ainda</p>
          </div>
        ) : (
          <div className="space-y-3">
            {publishedShuffled.map((news) => (
              <NewsCardCurated
                key={news.id}
                news={news}
                onDelete={handleDelete}
                processingId={processingId}
                isPublished={true}
              />
            ))}
          </div>
        )}
      </div>

      {loadingPending ? (
        <div className="flex items-center justify-center h-24 gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando pendentes...
        </div>
      ) : pending.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" /> Pendentes de Curadoria (
              {pending.length})
            </h2>

            <button
              onClick={() => setExpandedHelp(expandedHelp === 'pending' ? null : 'pending')}
              className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1"
              type="button"
            >
              <ChevronDown
                className={`w-4 h-4 transition-transform ${
                  expandedHelp === 'pending' ? 'rotate-180' : ''
                }`}
              />
              Sobre
            </button>
          </div>

          {expandedHelp === 'pending' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
              Score 60-79%: conteúdo relevante mas requer validação. Publicar ou rejeitar
              manualmente.
            </div>
          )}

          <div className="space-y-3">
            {pending.map((news) => (
              <NewsCardCurated
                key={news.id}
                news={news}
                onApprove={handleApprove}
                onReject={handleReject}
                onDelete={handleDelete}
                processingId={processingId}
                isPublished={false}
              />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
