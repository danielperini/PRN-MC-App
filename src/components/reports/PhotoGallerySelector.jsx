import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Image as ImageIcon, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { gerarLegendaFoto } from '@/utils/captionUtils';

function dataFoto(att) {
  const metadata = att?.metadata || att?.metadados || att?.exif || {};
  const valor = att?.date_taken || att?.captured_at || att?.data_captura || metadata?.DateTimeOriginal || metadata?.dateTaken || metadata?.created || '';
  if (!valor) return '';
  const texto = String(valor).trim();
  const exif = texto.match(/^(\d{4}):(\d{2}):(\d{2})/);
  if (exif) return `${exif[1]}-${exif[2]}-${exif[3]}`;
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : '';
}

function nomeAtividade(atividade) {
  return atividade?.nome || atividade?.titulo || atividade?.descricao || '';
}

export default function PhotoGallerySelector({ isOpen, onClose, onSelectPhoto, atividades = [], museu = '', mes = '', ano = '' }) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [caption, setCaption] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [dateTaken, setDateTaken] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [atividadeVinculadaId, setAtividadeVinculadaId] = useState('');

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['galeria-fotos-selector', searchTerm],
    queryFn: async () => {
      try {
        const approvedReports = await base44.entities.Report.filter({ status: 'APPROVED' });
        const approvedReportIds = new Set((approvedReports || []).map((r) => r.id));
        const allAttachments = await base44.entities.Attachment.list();
        const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'];
        const imageData = (Array.isArray(allAttachments) ? allAttachments : [])
          .filter((att) => {
            const ext = String(att.file_name || '').split('.').pop().toLowerCase();
            return approvedReportIds.has(att.report_id) && imageExtensions.includes(ext);
          })
          .map((att) => {
            const report = (approvedReports || []).find((r) => r.id === att.report_id);
            return {
              id: att.id,
              fileName: att.file_name,
              url: att.file_url,
              description: att.description || '',
              author: report?.author_name || '',
              mes: report?.mes_referencia || '',
              ano: report?.ano || '',
              museu: report?.museu || '',
              dateTaken: dataFoto(att),
              location: att.location || att.local || report?.museu || '',
              title: att.title || att.titulo || '',
            };
          });

        if (searchTerm.trim()) {
          const term = searchTerm.toLowerCase();
          return imageData.filter((img) => [img.title, img.description, img.museu].some((valor) => String(valor || '').toLowerCase().includes(term)));
        }
        return imageData;
      } catch {
        toast.error('Erro ao carregar fotos');
        return [];
      }
    },
    enabled: isOpen,
  });

  useEffect(() => {
    if (!selectedPhoto) return;
    const atividade = atividades.find((a) => a.id === atividadeVinculadaId);
    const data = selectedPhoto.dateTaken || atividade?.data_realizacao || atividade?.data_inicio || atividade?.data || '';
    const local = selectedPhoto.location || atividade?.local || atividade?.local_realizacao || museu || '';
    const titulo = selectedPhoto.title || nomeAtividade(atividade) || 'Registro da atividade';
    const legenda = gerarLegendaFoto({
      atividadeNome: nomeAtividade(atividade),
      atividadeLocal: local,
      atividadeMuseus: Array.isArray(atividade?.museu_lista) ? atividade.museu_lista : [],
      atividadeData: data,
      museu,
      mes,
      ano,
      fileName: '',
    });
    setTitle(titulo);
    setLocation(local);
    setDateTaken(data);
    setCaption(legenda || selectedPhoto.description || '');
  }, [selectedPhoto, atividadeVinculadaId, atividades, museu, mes, ano]);

  const reset = () => {
    setSelectedPhoto(null);
    setCaption('');
    setTitle('');
    setLocation('');
    setDateTaken('');
    setSearchTerm('');
    setAtividadeVinculadaId('');
  };

  const handleAddPhoto = () => {
    if (!selectedPhoto) return toast.error('Selecione uma foto');
    onSelectPhoto({
      ...selectedPhoto,
      caption,
      title,
      location,
      dateTaken,
      activityId: atividadeVinculadaId || null,
    });
    reset();
    onClose();
    toast.success('Foto adicionada ao relatório');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle>Adicionar foto ao relatório</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="mb-1 block text-sm font-medium">Buscar fotos</Label>
            <Input placeholder="Por título, descrição ou museu..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>

          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
          ) : images.length === 0 ? (
            <div className="py-8 text-center"><ImageIcon className="mx-auto mb-2 h-12 w-12 text-gray-300" /><p className="text-sm text-gray-600">Nenhuma foto encontrada</p></div>
          ) : (
            <div className="grid max-h-52 grid-cols-3 gap-3 overflow-y-auto rounded-lg border border-gray-200 p-3">
              {images.map((img) => (
                <button
                  type="button"
                  key={img.id}
                  onClick={() => setSelectedPhoto(img)}
                  className={`overflow-hidden rounded-lg border-2 text-left transition-all ${selectedPhoto?.id === img.id ? 'border-blue-600 ring-2 ring-blue-300' : 'border-gray-200 hover:border-gray-300'}`}
                >
                  <div className="aspect-square bg-gray-100"><img src={img.url} alt={img.title || 'Foto'} className="h-full w-full object-cover" /></div>
                  <div className="p-1.5 text-xs text-gray-600">
                    <p className="truncate font-medium">{img.title || img.description || 'Foto sem título'}</p>
                    {img.dateTaken && <p className="text-[10px] text-gray-400">{img.dateTaken}</p>}
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedPhoto && (
            <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div>
                <Label>Atividade vinculada</Label>
                <Select value={atividadeVinculadaId || 'nenhuma'} onValueChange={(value) => setAtividadeVinculadaId(value === 'nenhuma' ? '' : value)}>
                  <SelectTrigger><SelectValue placeholder="Selecione a atividade" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhuma">Nenhuma atividade</SelectItem>
                    {atividades.map((a) => <SelectItem key={a.id} value={a.id}>{nomeAtividade(a) || a.id}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Título da foto</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div><Label>Local</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} /></div>
                <div><Label>Data em que a foto foi feita</Label><Input type="date" value={dateTaken} onChange={(e) => setDateTaken(e.target.value)} /></div>
              </div>
              <div>
                <Label className="flex items-center gap-1"><Sparkles className="h-3.5 w-3.5 text-yellow-500" /> Legenda editável</Label>
                <Textarea value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Atividade — Local — Data" className="h-20 resize-none" />
                <p className="mt-1 text-xs text-gray-400">O nome do arquivo não será exibido na legenda.</p>
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>Cancelar</Button>
          <Button onClick={handleAddPhoto} disabled={!selectedPhoto} className="bg-blue-600 hover:bg-blue-700">Adicionar foto</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
