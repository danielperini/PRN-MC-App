import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ExternalLink, Calendar } from 'lucide-react';

export default function DailyNewsHighlight() {
  const [news, setNews] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDailyNews = async () => {
      try {
        // Buscar notícia curada mais recente (com data_selecao)
        const selectedNews = await base44.entities.NewsHighlight.filter(
          { ativo: true },
          '-data_selecao',
          1
        );

        if (selectedNews.length > 0 && selectedNews[0].data_selecao) {
          setNews(selectedNews[0]);
        }
      } catch (error) {
        console.error('Erro ao buscar notícia do dia:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDailyNews();
  }, []);

  if (loading) {
    return (
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200 animate-pulse">
        <div className="h-6 bg-blue-200 rounded w-1/3 mb-4" />
        <div className="h-4 bg-blue-100 rounded w-full mb-3" />
        <div className="h-4 bg-blue-100 rounded w-5/6" />
      </div>
    );
  }

  if (!news) {
    return null;
  }

  const handleViewNews = () => {
    if (news.link) {
      window.open(news.link, '_blank');
      // Registrar visualização
      base44.entities.NewsHighlight.update(news.id, {
        visualizacoes: (news.visualizacoes || 0) + 1
      });
    }
  };

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-6 border-2 border-blue-300 hover:border-blue-400 transition-all cursor-pointer group"
         onClick={handleViewNews}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide mb-2">
            📰 Notícia do Dia
          </p>
          <h3 className="text-lg font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
            {news.titulo}
          </h3>
          <p className="text-sm text-gray-700 mb-3 leading-relaxed">
            {news.resumo}
          </p>
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              <span>{news.data_publicacao || new Date(news.data_encontrada).toLocaleDateString('pt-BR')}</span>
            </div>
            {news.fonte && (
              <span className="px-2 py-1 bg-white rounded text-gray-700 font-medium">
                {news.fonte === 'web_search' ? '🔍 Web' : '📌 ' + news.fonte}
              </span>
            )}
          </div>
        </div>
        {news.link && (
          <div className="flex-shrink-0 pt-1">
            <ExternalLink className="w-5 h-5 text-blue-600 group-hover:scale-110 transition-transform" />
          </div>
        )}
      </div>
    </div>
  );
}