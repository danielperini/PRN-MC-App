import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle, Archive, Trash2, RefreshCw, ExternalLink, Newspaper,
  Eye, Clock, Tag, Loader2, Search, Wand2
} from 'lucide-react';

const TAG_OPTIONS = ['Museuologia', 'Cinema', 'Moda', 'História de BH', 'Patrimônio Cultural', 'Curadoria', 'Educação'];

const FONTE_LABELS = {
  portal_museus_centro: 'Portal MC',
  culturadoria_museus: 'Culturadoria',
  web_search: 'Web',
  internal: 'Interno',
};

const FONTE_COLORS = {
  portal_museus_centro: 'bg-emerald-100 text-emerald-700',
  culturadoria_museus: 'bg-purple-100 text-purple-700',
  web_search: 'bg-blue-100 text-blue-700',
  internal: 'bg-amber-100 text-amber-700',
};

function NewsCard({ news, onApprove, onArchive, onDelete, onTagChange, processingId }) {
  const [localTags, setLocalTags] = useState(news.tags || []);
  const [classifying, setClassifying] = useState(false);
  const isProcessing = processingId === news.id;

  const toggleTag = (tag) => {
    const updated = localTags.includes(tag) ? localTags.filter(t => t !== tag) : [...localTags, tag];
    setLocalTags(updated);
    onTagChange(news.id, updated);
  };

  const classifyWithAI = async () => {
    setClassifying(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Classifique esta notícia com as tags mais adequadas da lista:
Tags disponíveis: Museuologia, Cinema, Moda, História de BH, Patrimônio Cultural, Curadoria, Educação

Título: "${news.titulo}"
Resumo: "${news.resumo}"

Retorne JSON com as tags mais relevantes (máximo 3).`,
        response_json_schema: {
          type: 'object',
          properties: { tags: { type: 'array', items: { type: 'string' } } }
        }
      });
      const aiTags = (result?.tags || []).filter(t => TAG_OPTIONS.includes(t));
      setLocalTags(aiTags);
      onTagChange(news.id, aiTags);
    } catch (e) {
      console.error('Erro ao classificar:', e);
    } finally {
      setClassifying(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl p-4 bg-white hover:border-gray-300 transition-all">
      <div className="flex gap-4">
        {news.imagem_url && (
          <img
            src={news.imagem_url}
            alt=""
            className="w-20 h-20 object-cover rounded-lg flex-shrink-0"
            onError={e => e.target.style.display = 'none'}
          />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${FONTE_COLORS[news.fonte] || 'bg-gray-100 text-gray-600'}`}>
                {FONTE_LABELS[news.fonte] || news.fonte}
              </span>
              {news.data_publicacao && (
                <span className="text-[10px] text-gray-400 font-mono">{news.data_publicacao}</span>
              )}
            </div>
            {news.link && (
              <a href={news.link} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-black flex-shrink-0">
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
          <h3 className="text-sm font-bold text-gray-900 line-clamp-2 mb-1">{news.titulo}</h3>
          <p className="text-xs text-gray-500 line-clamp-2">{news.resumo}</p>
        </div>
      </div>

      {/* Tags */}
      <div className="mt-3">
        <div className="flex items-center gap-1.5 mb-2">
          <Tag className="w-3 h-3 text-gray-400" />
          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Classificar:</span>
          <button
            onClick={classifyWithAI}
            disabled={classifying}
            className="flex items-center gap-1 text-[10px] text-purple-600 font-semibold hover:text-purple-800 ml-1"
          >
            {classifying ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
            IA
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {TAG_OPTIONS.map(tag => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-all ${
                localTags.includes(tag)
                  ? 'bg-black text-white border-black'
                  : 'bg-gray-50 text-gray-500 border-gray-200 hover:border-gray-400'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 mt-3 pt-3 border-t border-gray-100">
        <Button
          size="sm"
          onClick={() => onApprove(news.id, localTags)}
          disabled={isProcessing}
          className="bg-black text-white hover:bg-gray-800 h-7 text-xs gap-1"
        >
          {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
          Publicar
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onArchive(news.id)}
          disabled={isProcessing}
          className="h-7 text-xs gap-1"
        >
          <Archive className="w-3 h-3" /> Arquivar
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(news.id)}
          disabled={isProcessing}
          className="h-7 text-xs gap-1 text-red-500 hover:text-red-700 hover:bg-red-50 ml-auto"
        >
          <Trash2 className="w-3 h-3" /> Excluir
        </Button>
      </div>
    </div>
  );
}

export default function LeitorNoticias() {
  const [tab, setTab] = useState('pendentes');
  const [processingId, setProcessingId] = useState(null);
  const [tagUpdates, setTagUpdates] = useState({});
  const [fetching, setFetching] = useState(false);
  const queryClient = useQueryClient();

  const { data: pending = [], isLoading: loadingPending } = useQuery({
    queryKey: ['news-pending'],
    queryFn: () => base44.entities.NewsHighlight.filter({ ativo: false }, '-created_date', 50),
    refetchInterval: 30000,
  });

  const { data: published = [], isLoading: loadingPublished } = useQuery({
    queryKey: ['news-published'],
    queryFn: async () => {
      const all = await base44.entities.NewsHighlight.filter({ ativo: true }, '-created_date', 100);
      return all.filter(n => n.fonte !== 'internal'); // exclude internal momentos
    },
    refetchInterval: 30000,
  });

  const { data: archived = [], isLoading: loadingArchived } = useQuery({
    queryKey: ['news-archived'],
    queryFn: () => base44.entities.NewsHighlight.filter({ ativo: false }, '-created_date', 100),
    enabled: tab === 'arquivo',
  });

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ['news-pending'] });
    queryClient.invalidateQueries({ queryKey: ['news-published'] });
    queryClient.invalidateQueries({ queryKey: ['news-archived'] });
    queryClient.invalidateQueries({ queryKey: ['today-news'] });
  };

  const handleApprove = async (id, tags) => {
    setProcessingId(id);
    try {
      await base44.entities.NewsHighlight.update(id, {
        ativo: true,
        tags: tags || [],
        data_selecao: new Date().toISOString().split('T')[0]
      });
      invalidateAll();
    } finally {
      setProcessingId(null);
    }
  };

  const handleArchive = async (id) => {
    setProcessingId(id);
    try {
      await base44.entities.NewsHighlight.update(id, { ativo: false });
      invalidateAll();
    } finally {
      setProcessingId(null);
    }
  };

  const handleDelete = async (id) => {
    setProcessingId(id);
    try {
      await base44.entities.NewsHighlight.delete(id);
      invalidateAll();
    } finally {
      setProcessingId(null);
    }
  };

  const handleTagChange = (id, tags) => {
    setTagUpdates(prev => ({ ...prev, [id]: tags }));
  };

  const handleFetchNews = async () => {
    setFetching(true);
    try {
      await base44.functions.invoke('searchAndIndexNews', {});
      setTimeout(invalidateAll, 1000);
    } catch (e) {
      console.error('Erro ao buscar notícias:', e);
    } finally {
      setFetching(false);
    }
  };

  const tabs = [
    { id: 'pendentes', label: 'Pendentes', count: pending.length, icon: Clock },
    { id: 'publicadas', label: 'Publicadas', count: published.length, icon: Eye },
    { id: 'arquivo', label: 'Arquivo', count: null, icon: Archive },
  ];

  const currentList = tab === 'pendentes' ? pending : tab === 'publicadas' ? published : archived;
  const isLoading = tab === 'pendentes' ? loadingPending : tab === 'publicadas' ? loadingPublished : loadingArchived;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Newspaper className="w-6 h-6" /> Leitor de Notícias
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Curadoria e classificação antes de publicar no painel</p>
        </div>
        <Button
          onClick={handleFetchNews}
          disabled={fetching}
          className="bg-black text-white hover:bg-gray-800 gap-2"
        >
          {fetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          {fetching ? 'Buscando...' : 'Buscar Notícias'}
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-xl w-fit">
        {tabs.map(t => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.id ? 'bg-white text-black shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
              {t.count !== null && t.count > 0 && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                  t.id === 'pendentes' ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-600'
                }`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 gap-2 text-gray-400">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </div>
      ) : currentList.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <Newspaper className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">
            {tab === 'pendentes' ? 'Nenhuma notícia aguardando revisão' :
             tab === 'publicadas' ? 'Nenhuma notícia publicada' : 'Arquivo vazio'}
          </p>
          {tab === 'pendentes' && (
            <p className="text-sm mt-1">Clique em "Buscar Notícias" para trazer novos conteúdos</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {tab === 'publicadas' && (
            <p className="text-xs text-gray-400 mb-4">
              Notícias publicadas aparecem no carrossel do painel. Arquive as que não são mais relevantes.
            </p>
          )}
          {currentList.map(news => (
            <NewsCard
              key={news.id}
              news={{ ...news, tags: tagUpdates[news.id] || news.tags || [] }}
              onApprove={handleApprove}
              onArchive={handleArchive}
              onDelete={handleDelete}
              onTagChange={handleTagChange}
              processingId={processingId}
            />
          ))}
        </div>
      )}
    </div>
  );
}