import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  CheckCircle, Archive, Trash2, RefreshCw, ExternalLink, Newspaper,
  Eye, Clock, Tag, Loader2, Search, Wand2, TrendingUp, AlertCircle, ChevronDown, Plus, Link
} from 'lucide-react';
import { useCurrentUser } from '@/components/auth/useCurrentUser';

const FONTE_COLORS = {
  web: 'bg-blue-100 text-blue-700',
  culturadoria_museus: 'bg-purple-100 text-purple-700',
  portal_museus_centro: 'bg-emerald-100 text-emerald-700',
  oportunidades: 'bg-amber-100 text-amber-700',
  internal: 'bg-gray-100 text-gray-600',
};

function NewsCardCurated({ news, onApprove, onReject, onDelete, processingId, isPublished }) {
  const isProcessing = processingId === news.id;
  const scoreColor = news.score_pertinencia >= 80 ? 'text-green-600' : news.score_pertinencia >= 60 ? 'text-amber-600' : 'text-red-600';

  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white hover:border-gray-300 transition-all">
      <div className="flex gap-4">
        {news.imagem_url && (
          <img
            src={news.imagem_url}
            alt=""
            className="w-24 h-24 object-cover rounded-lg flex-shrink-0"
            onError={e => e.target.style.display = 'none'}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex flex-wrap gap-2 items-center">
              <span className={`text-xs font-bold px-2 py-1 rounded-full ${FONTE_COLORS[news.fonte] || 'bg-gray-100'}`}>
                {news.fonte.toUpperCase()}
              </span>
              <Badge variant="outline" className="text-xs">{news.tipo_conteudo}</Badge>
              <span className={`text-xs font-bold ${scoreColor}`}>
                Score: {news.score_pertinencia}%
              </span>
            </div>
            <div className="flex items-center gap-2">
              {news.link && (
                <a href={news.link} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-black flex-shrink-0">
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              {isPublished && (
                <button
                  onClick={() => onDelete(news.id)}
                  disabled={isProcessing}
                  className="text-gray-400 hover:text-red-600 flex-shrink-0"
                  title="Deletar e substituir"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
          <h3 className="font-semibold text-gray-900 line-clamp-2 mb-1">{news.titulo}</h3>
          <p className="text-sm text-gray-600 line-clamp-2 mb-2">{news.resumo}</p>
          <div className="flex items-center gap-2 text-xs text-gray-500 mb-2">
            {news.data_publicacao && <span>{news.data_publicacao}</span>}
            {news.palavra_chave_geradora && <span>•</span>}
            {news.palavra_chave_geradora && <span className="italic">"{news.palavra_chave_geradora}"</span>}
          </div>
          {news.motivo_curadoria && (
            <p className="text-xs bg-blue-50 border border-blue-200 rounded p-2 text-blue-800 mb-2">
              <strong>Motivo:</strong> {news.motivo_curadoria}
            </p>
          )}
          <div className="flex flex-wrap gap-1">
            {news.tags?.map(tag => (
              <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
            ))}
          </div>
        </div>
      </div>

      {news.status_curadoria === 'PENDENTE' && (
        <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100 flex-wrap">
          <Button
            size="sm"
            onClick={() => onApprove(news.id)}
            disabled={isProcessing}
            className="bg-green-600 text-white hover:bg-green-700 text-xs flex-1 sm:flex-none"
          >
            {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
            Publicar
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onReject(news.id)}
            disabled={isProcessing}
            className="text-xs text-red-600 flex-1 sm:flex-none"
          >
            <Trash2 className="w-3 h-3" /> Rejeitar
          </Button>
        </div>
      )}
    </div>
  );
}

export default function CurationDashboard() {
  const [processingId, setProcessingId] = useState(null);
  const [curatingNow, setCuratingNow] = useState(false);
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [expandedHelp, setExpandedHelp] = useState(null);
  const [manualUrl, setManualUrl] = useState('');
  const [manualTitle, setManualTitle] = useState('');
  const [manualResumo, setManualResumo] = useState('');
  const [addingManual, setAddingManual] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const queryClient = useQueryClient();
  const { user, isCoordenador } = useCurrentUser();

  const { data: published = [], isLoading: loadingPublished } = useQuery({
    queryKey: ['news-published-curated'],
    queryFn: async () => {
      const all = await base44.entities.NewsHighlight.filter({ ativo: true }, '-created_date', 100);
      return all.sort((a, b) => {
        const statusOrder = { PUBLICADO_AUTO: 0, APROVADO_MANUAL: 1 };
        return (statusOrder[a.status_curadoria] || 2) - (statusOrder[b.status_curadoria] || 2);
      });
    },
    refetchInterval: 30000,
  });

  // Rotação aleatória a cada hora
  useEffect(() => {
    const interval = setInterval(() => {
      setShuffleSeed(prev => prev + 1);
      queryClient.invalidateQueries({ queryKey: ['news-published-curated'] });
    }, 3600000); // 1 hora
    return () => clearInterval(interval);
  }, [queryClient]);

  const { data: pending = [], isLoading: loadingPending } = useQuery({
    queryKey: ['news-pending-curated'],
    queryFn: () => base44.entities.NewsHighlight.filter({ status_curadoria: 'PENDENTE' }, '-created_date', 100),
    refetchInterval: 15000,
  });

  const countByType = (list, type) => list.filter(n => n.tipo_conteudo === type).length;
  const countByStatus = (list, status) => list.filter(n => n.status_curadoria === status).length;

  const handleApprove = async (id) => {
    setProcessingId(id);
    try {
      await base44.functions.invoke('approveCuratedNews', { newsId: id });
      queryClient.invalidateQueries({ queryKey: ['news-pending-curated'] });
      queryClient.invalidateQueries({ queryKey: ['news-published-curated'] });
      queryClient.invalidateQueries({ queryKey: ['today-news-v2'] });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id) => {
    setProcessingId(id);
    try {
      await base44.functions.invoke('rejectCuratedNews', { newsId: id });
      queryClient.invalidateQueries({ queryKey: ['news-pending-curated'] });
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (id) => {
    setProcessingId(id);
    try {
      await base44.entities.NewsHighlight.delete(id);
      // Buscar notícia pendente para substituir
      const pending = await base44.entities.NewsHighlight.filter({ status_curadoria: 'PENDENTE' }, '-created_date', 1);
      if (pending.length > 0) {
        // Substituir com primeira pendente
        await base44.entities.NewsHighlight.update(pending[0].id, { ativo: true, status_curadoria: 'APROVADO_MANUAL' });
      }
      queryClient.invalidateQueries({ queryKey: ['news-published-curated'] });
      queryClient.invalidateQueries({ queryKey: ['news-pending-curated'] });
    } finally {
      setProcessingId(null);
    }
  };

  const handleRunCuration = async () => {
    setCuratingNow(true);
    try {
      // Rodar curadoria IA
      await base44.functions.invoke('runDailyCuration', {});
      
      // Substituir 50% das notícias publicadas por pendentes
      const publishedNews = await base44.entities.NewsHighlight.filter({ ativo: true }, '-created_date', 100);
      const toDelete = Math.ceil(publishedNews.length * 0.5);
      const idsToDelete = publishedNews.slice(0, toDelete).map(n => n.id);
      
      const pending = await base44.entities.NewsHighlight.filter({ status_curadoria: 'PENDENTE' }, '-created_date', toDelete);
      
      // Deletar 50% aleatoriamente
      for (const id of idsToDelete) {
        await base44.entities.NewsHighlight.delete(id);
      }
      
      // Substituir com pendentes e publicar
      for (const news of pending) {
        await base44.entities.NewsHighlight.update(news.id, { ativo: true, status_curadoria: 'APROVADO_MANUAL' });
      }
      
      setShuffleSeed(prev => prev + 1);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['news-published-curated'] });
        queryClient.invalidateQueries({ queryKey: ['news-pending-curated'] });
      }, 2000);
    } catch (e) {
      console.error('Erro ao rodar curadoria:', e);
    } finally {
      setCuratingNow(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Wand2 className="w-8 h-8" /> Curadoria IA - Claude
            </h1>
            <p className="text-sm text-gray-500 mt-1">Sistema automático de seleção e análise editorial</p>
          </div>
          <Button
            onClick={handleRunCuration}
            disabled={curatingNow}
            className="bg-black text-white hover:bg-gray-800 gap-2"
          >
            {curatingNow ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            {curatingNow ? 'Curando...' : 'Rodar Curadoria Agora'}
          </Button>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 border border-blue-200 rounded-lg p-3">
            <div className="text-xs text-blue-600 font-semibold mb-1">Publicados (IA)</div>
            <div className="text-2xl font-bold text-blue-900">{countByStatus(published, 'PUBLICADO_AUTO')}</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 border border-green-200 rounded-lg p-3">
            <div className="text-xs text-green-600 font-semibold mb-1">Publicados (Manual)</div>
            <div className="text-2xl font-bold text-green-900">{countByStatus(published, 'APROVADO_MANUAL')}</div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100 border border-amber-200 rounded-lg p-3">
            <div className="text-xs text-amber-600 font-semibold mb-1">Pendentes</div>
            <div className="text-2xl font-bold text-amber-900">{pending.length}</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 border border-purple-200 rounded-lg p-3">
            <div className="text-xs text-purple-600 font-semibold mb-1">Notícias</div>
            <div className="text-2xl font-bold text-purple-900">{countByType(published, 'NOTICIA')}</div>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 border border-orange-200 rounded-lg p-3">
            <div className="text-xs text-orange-600 font-semibold mb-1">Artigos Densos</div>
            <div className="text-2xl font-bold text-orange-900">{countByType(published, 'ARTIGO_DENSO')}</div>
          </div>
        </div>
      </div>

      {/* Published Section */}
       <div className="mb-8">
         <div className="flex items-center justify-between mb-4">
           <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
             <Eye className="w-5 h-5" /> Publicados ({published.length})
           </h2>
           <button
             onClick={() => setExpandedHelp(expandedHelp === 'published' ? null : 'published')}
             className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1"
           >
             <ChevronDown className={`w-4 h-4 transition-transform ${expandedHelp === 'published' ? 'rotate-180' : ''}`} />
             Sobre
           </button>
         </div>
         {expandedHelp === 'published' && (
           <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4 text-sm text-blue-800">
             Conteúdo aprovado manualmente ou publicado automaticamente. Clique no lixo para deletar e substituir por pendente.
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
             {([...published].sort(() => Math.random() - 0.5)).map(news => (
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

      {/* Pending Section */}
      {pending.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" /> Pendentes de Curadoria ({pending.length})
            </h2>
            <button
              onClick={() => setExpandedHelp(expandedHelp === 'pending' ? null : 'pending')}
              className="text-xs text-gray-500 hover:text-gray-900 flex items-center gap-1"
            >
              <ChevronDown className={`w-4 h-4 transition-transform ${expandedHelp === 'pending' ? 'rotate-180' : ''}`} />
              Sobre
            </button>
          </div>
          {expandedHelp === 'pending' && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 text-sm text-amber-800">
              Score 60-79%: conteúdo relevante mas requer validação. Publicar ou rejeitar manualmente.
            </div>
          )}
          <div className="space-y-3">
            {pending.map(news => (
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
      )}
    </div>
  );
}