import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import { Button } from '@/components/ui/button';
import { PlayCircle, RotateCw, X, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

function VideoSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden border bg-white shadow-sm animate-pulse">
      <div className="aspect-video bg-slate-200" />
      <div className="p-3">
        <div className="h-4 bg-slate-200 rounded w-3/4" />
      </div>
    </div>
  );
}

function VideoCard({ video, onClick }) {
  const [imgError, setImgError] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onClick(video)}
      className="group rounded-2xl overflow-hidden border bg-white shadow-sm hover:shadow-md transition-shadow text-left w-full"
    >
      <div className="relative aspect-video bg-slate-100 overflow-hidden">
        {!imgError ? (
          <img
            src={video.thumbnail_url}
            alt={video.titulo}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-slate-200">
            <PlayCircle className="w-12 h-12 text-slate-400" />
          </div>
        )}
        {/* Overlay com ícone de play */}
        <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
          <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
            <PlayCircle className="w-8 h-8 text-slate-900" />
          </div>
        </div>
      </div>
      <div className="p-3">
        <p className="text-sm font-semibold text-slate-800 line-clamp-2">{video.titulo}</p>
      </div>
    </button>
  );
}

function VideoModal({ video, onClose }) {
  if (!video) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-white font-semibold text-lg truncate pr-4">{video.titulo}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-white hover:text-slate-300 transition-colors flex-shrink-0"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        <div className="relative aspect-video bg-black rounded-xl overflow-hidden">
          <iframe
            src={video.embed_url}
            title={video.titulo}
            allow="autoplay"
            allowFullScreen
            className="absolute inset-0 w-full h-full"
          />
        </div>
      </div>
    </div>
  );
}

export default function Tutoriais() {
  const { user } = useCurrentUser();
  const [selectedVideo, setSelectedVideo] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [autoSyncError, setAutoSyncError] = useState(null);
  const autoSyncRan = useRef(false);

  const isCoord = user?.role === 'admin' || user?.base_role === 'COORDENADOR';

  const { data: videos = [], isLoading, refetch } = useQuery({
    queryKey: ['tutorial-videos'],
    queryFn: () => base44.entities.TutorialVideo.filter({ ativo: true }, 'ordem', 100),
  });

  // Auto-sync: dispara uma vez por sessão se banco estiver vazio após carregamento
  useEffect(() => {
    if (isLoading) return;
    if (videos.length > 0) return;
    if (autoSyncRan.current) return;
    autoSyncRan.current = true;

    async function runAutoSync() {
      try {
        const res = await base44.functions.invoke('sincronizarTutoriaisDrive', {});
        const result = res?.data || res;
        if (result?.error) {
          setAutoSyncError(result.error);
        } else {
          setAutoSyncError(null);
          refetch();
        }
      } catch (err) {
        setAutoSyncError(err?.message || 'Erro ao sincronizar tutoriais com o Drive.');
      }
    }

    runAutoSync();
  }, [isLoading, videos.length]);

  const handleSync = async () => {
    setSyncing(true);
    setAutoSyncError(null);
    try {
      const res = await base44.functions.invoke('sincronizarTutoriaisDrive', {});
      const result = res?.data || res;
      if (result?.error) {
        toast.error(result.error);
        if (isCoord) setAutoSyncError(result.error);
      } else {
        toast.success(result?.message || 'Sincronização concluída');
        refetch();
      }
    } catch (err) {
      toast.error(err?.message || 'Erro ao sincronizar');
      if (isCoord) setAutoSyncError(err?.message || 'Erro ao sincronizar');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <PlayCircle className="w-6 h-6 text-slate-700" />
            Tutoriais em Vídeo
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Aprenda a usar a plataforma com os vídeos de treinamento
          </p>
        </div>
        {isCoord && (
          <Button
            onClick={handleSync}
            disabled={syncing}
            variant="outline"
            className="gap-2"
          >
            {syncing ? (
              <><RotateCw className="w-4 h-4 animate-spin" />Sincronizando...</>
            ) : (
              <><RotateCw className="w-4 h-4" />Sincronizar com Drive</>
            )}
          </Button>
        )}
      </div>

      {/* Banner de erro da sync automática — visível apenas para coordenadores */}
      {isCoord && autoSyncError && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500" />
          <div className="flex-1">
            <p className="font-semibold">Erro na sincronização automática</p>
            <p className="mt-0.5 text-red-700">{autoSyncError}</p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSync}
            disabled={syncing}
            className="flex-shrink-0 border-red-300 text-red-700 hover:bg-red-100"
          >
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Grid de vídeos */}
      {isLoading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <VideoSkeleton key={i} />)}
        </div>
      ) : videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <PlayCircle className="w-16 h-16 text-slate-300 mb-4" />
          <p className="text-lg font-semibold text-slate-500">Nenhum tutorial disponível ainda</p>
          <p className="text-sm text-slate-400 mt-1">
            {isCoord
              ? 'Clique em "Sincronizar com Drive" para importar os vídeos da pasta Tutoriais.'
              : 'Os tutoriais serão disponibilizados em breve.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} onClick={setSelectedVideo} />
          ))}
        </div>
      )}

      {/* Modal */}
      <VideoModal video={selectedVideo} onClose={() => setSelectedVideo(null)} />
    </div>
  );
}