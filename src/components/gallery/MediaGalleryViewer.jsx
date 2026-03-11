import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Play, Image as ImageIcon, Trash2, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogClose } from '@/components/ui/dialog';
import { toast } from 'sonner';

export default function MediaGalleryViewer({ reportId }) {
  const [selectedMedia, setSelectedMedia] = useState(null);

  const { data: attachments, refetch } = useQuery({
    queryKey: ['report-media', reportId],
    queryFn: async () => {
      if (!reportId) return { photos: [], videos: [] };
      const attachs = await base44.entities.Attachment.filter(
        { report_id: reportId },
        '-created_date',
        100
      );

      const photos = attachs.filter(a =>
        a.file_type && a.file_type.includes('image/')
      );
      const videos = attachs.filter(a =>
        a.file_type && (a.file_type.includes('video/') || /\.(mp4|webm|mov)$/i.test(a.file_name))
      );

      return { photos, videos };
    },
    enabled: !!reportId,
  });

  const handleDelete = async (attachmentId) => {
    if (confirm('Tem certeza que deseja remover este arquivo?')) {
      try {
        await base44.entities.Attachment.delete(attachmentId);
        refetch();
        toast.success('Arquivo removido');
      } catch (error) {
        toast.error('Erro ao remover arquivo');
      }
    }
  };

  const handleDownload = (fileUrl, fileName) => {
    const link = document.createElement('a');
    link.href = fileUrl;
    link.download = fileName;
    link.click();
    toast.success('Download iniciado');
  };

  if (!attachments || (attachments.photos.length === 0 && attachments.videos.length === 0)) {
    return (
      <div className="text-center py-8 text-gray-400">
        <ImageIcon className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">Nenhuma foto ou vídeo anexado</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* FOTOS */}
      {attachments.photos.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <ImageIcon className="w-4 h-4" />
            Fotos ({attachments.photos.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {attachments.photos.map(photo => (
              <div
                key={photo.id}
                className="relative group rounded-lg overflow-hidden bg-gray-100 border border-gray-200 cursor-pointer hover:border-gray-300"
                onClick={() => setSelectedMedia(photo)}
              >
                <img
                  src={photo.file_url}
                  alt={photo.file_name}
                  className="w-full h-32 object-cover group-hover:scale-105 transition-transform"
                />
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 bg-white hover:bg-gray-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(photo.file_url, photo.file_name);
                      }}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 bg-red-500 hover:bg-red-600 text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(photo.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* VÍDEOS */}
      {attachments.videos.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Play className="w-4 h-4" />
            Vídeos ({attachments.videos.length})
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {attachments.videos.map(video => (
              <div
                key={video.id}
                className="relative group rounded-lg overflow-hidden bg-gray-900 border border-gray-300 cursor-pointer hover:border-gray-400"
                onClick={() => setSelectedMedia(video)}
              >
                <div className="w-full h-32 flex items-center justify-center bg-gray-800">
                  <Play className="w-8 h-8 text-white" />
                </div>
                <p className="text-xs text-white p-2 bg-black bg-opacity-50 truncate">
                  {video.file_name}
                </p>
                <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center">
                  <div className="opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 bg-white hover:bg-gray-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(video.file_url, video.file_name);
                      }}
                    >
                      <Download className="w-3 h-3" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 bg-red-500 hover:bg-red-600 text-white"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(video.id);
                      }}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Modal de visualização */}
      <Dialog open={!!selectedMedia} onOpenChange={() => setSelectedMedia(null)}>
        <DialogContent className="max-w-4xl">
          <DialogClose />
          {selectedMedia?.file_type?.includes('video') ? (
            <video
              src={selectedMedia.file_url}
              controls
              className="w-full rounded-lg"
            />
          ) : (
            <img
              src={selectedMedia?.file_url}
              alt={selectedMedia?.file_name}
              className="w-full rounded-lg"
            />
          )}
          <p className="text-xs text-gray-500 mt-2">{selectedMedia?.file_name}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}