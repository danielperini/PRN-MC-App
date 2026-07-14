import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ImagePlus, Trash2, Edit2, Save } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PhotoGallerySelector from './PhotoGallerySelector';
import PhotoCaptionSuggester from './PhotoCaptionSuggester';
import { gerarLegendaFoto } from '@/utils/captionUtils';

function formatarData(valor) {
  if (!valor) return '';
  const texto = String(valor).trim();
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  return texto;
}
function nomeAtividade(atividade) {
  return atividade?.nome || atividade?.titulo || atividade?.descricao || '';
}
function identificacaoMuseu(photo, atividade, fallback = '') {
  return photo?.museum || photo?.museu || photo?.albumMuseum || atividade?.museu || fallback || '';
}

export default function ReportPhotoSection({
  photos = [], onAddPhoto, onUpdatePhoto, onDeletePhoto, activityId, reportId,
  museu = '', mes = '', ano = '', atividades = [], galleryTitle = '', onGalleryTitleChange,
}) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [editingPhotoId, setEditingPhotoId] = useState(null);
  const [editData, setEditData] = useState({ caption: '', title: '', location: '', dateTaken: '', activityId: '', museum: '' });
  const [tituloLocal, setTituloLocal] = useState(galleryTitle || photos[0]?.albumTitle || 'Galeria de Fotos');
  const [museuGaleria, setMuseuGaleria] = useState(photos[0]?.albumMuseum || photos[0]?.museum || photos[0]?.museu || museu || '');
  const atividadePorId = useMemo(() => new Map(atividades.map((atividade) => [atividade.id, atividade])), [atividades]);

  const persistirFoto = (photo, dados) => {
    Object.assign(photo, dados);
    onUpdatePhoto?.(photo.id, dados.caption ?? photo.caption ?? '', dados);
  };

  const handleAddPhoto = async (photo) => {
    if (!onAddPhoto) return;
    const atividade = atividades.find((item) => item.id === photo.activityId);
    const dataFoto = photo.dateTaken || photo.capturedAt || photo.metadataDate || atividade?.data_realizacao || atividade?.data_inicio || '';
    const localFoto = photo.location || atividade?.local || atividade?.local_realizacao || museuGaleria || museu || '';
    const tituloFoto = photo.title || nomeAtividade(atividade) || 'Registro da atividade';
    const museum = photo.museum || photo.museu || museuGaleria || museu || atividade?.museu || '';
    let caption = photo.caption || '';
    if (!caption) caption = gerarLegendaFoto({ atividadeNome: nomeAtividade(atividade), atividadeLocal: localFoto, atividadeMuseus: museum ? [museum] : [], atividadeData: dataFoto, museu: museum, mes, ano, fileName: '' });
    await onAddPhoto({ ...photo, title: tituloFoto, caption, location: localFoto, dateTaken: dataFoto, albumTitle: tituloLocal, albumMuseum: museum, museum, museu: museum, activityId: photo.activityId || null });
    setSelectorOpen(false);
  };

  const handleEditClick = (photo) => {
    const atividade = atividadePorId.get(photo.activityId);
    setEditingPhotoId(photo.id);
    setEditData({
      caption: photo.caption || '', title: photo.title || '', location: photo.location || '',
      dateTaken: photo.dateTaken || photo.capturedAt || photo.metadataDate || '', activityId: photo.activityId || '',
      museum: identificacaoMuseu(photo, atividade, museuGaleria || museu),
    });
  };

  const handleSavePhoto = () => {
    const photo = photos.find((item) => item.id === editingPhotoId);
    if (photo) {
      const museum = editData.museum.trim();
      persistirFoto(photo, {
        caption: editData.caption.trim(), title: editData.title.trim(), location: editData.location.trim(),
        dateTaken: editData.dateTaken, activityId: editData.activityId || null, albumTitle: tituloLocal,
        albumMuseum: museum, museum, museu: museum,
      });
    }
    setEditingPhotoId(null);
  };

  const salvarDadosGaleria = () => {
    const titulo = tituloLocal.trim() || 'Galeria de Fotos';
    const museum = museuGaleria.trim();
    setTituloLocal(titulo);
    setMuseuGaleria(museum);
    photos.forEach((photo) => {
      const atual = identificacaoMuseu(photo, atividadePorId.get(photo.activityId), '');
      persistirFoto(photo, {
        albumTitle: titulo,
        albumMuseum: museum,
        museum: atual || museum,
        museu: atual || museum,
        caption: photo.caption || '',
      });
    });
    onGalleryTitleChange?.(titulo);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-2">
        <div>
          <Label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Título do álbum</Label>
          <Input value={tituloLocal} onChange={(e) => setTituloLocal(e.target.value)} placeholder="Título da galeria" />
        </div>
        <div>
          <Label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Museu/identificação do bloco</Label>
          <Input value={museuGaleria} onChange={(e) => setMuseuGaleria(e.target.value)} placeholder="Ex.: MIS BH, MUMO, MHAB" />
        </div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button type="button" variant="outline" onClick={salvarDadosGaleria} className="gap-2"><Save className="h-4 w-4" /> Salvar título e museu</Button>
          <Button onClick={() => setSelectorOpen(true)} className="gap-2 bg-green-600 text-white hover:bg-green-700" size="sm"><ImagePlus className="h-4 w-4" /> Adicionar foto</Button>
        </div>
        {!museuGaleria.trim() && <p className="text-xs text-amber-700 md:col-span-2">Preencha o museu para substituir “Sem identificação de museu” neste bloco.</p>}
      </div>

      {photos.length === 0 ? (
        <div className="rounded-lg border-2 border-dashed border-gray-300 py-8 text-center"><ImagePlus className="mx-auto mb-2 h-12 w-12 text-gray-300" /><p className="text-sm text-gray-600">Nenhuma foto adicionada</p></div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {photos.map((photo) => {
            const atividade = atividadePorId.get(photo.activityId);
            const atividadeNome = nomeAtividade(atividade);
            const museum = identificacaoMuseu(photo, atividade, museuGaleria || museu);
            return <div key={photo.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="group relative aspect-video overflow-hidden bg-gray-100">
                <img src={photo.url} alt={photo.title || photo.caption || 'Foto da atividade'} className="h-full w-full object-cover" onError={(e) => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="225"%3E%3Crect fill="%23f0f0f0" width="400" height="225"/%3E%3C/svg%3E'; }} />
                {!photo.caption && <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 opacity-0 transition-all group-hover:bg-opacity-40 group-hover:opacity-100"><PhotoCaptionSuggester photoUrl={photo.url} activityId={photo.activityId || activityId} reportId={reportId} onCaptionSuggested={(caption) => onUpdatePhoto?.(photo.id, caption)} /></div>}
              </div>
              <div className="space-y-2 p-3">
                {photo.title && <h4 className="text-sm font-semibold text-gray-900">{photo.title}</h4>}
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                  <span className={museum ? '' : 'font-semibold text-amber-700'}>Museu: {museum || 'Sem identificação de museu'}</span>
                  {(photo.location || atividade?.local || atividade?.local_realizacao) && <span>Local: {photo.location || atividade?.local || atividade?.local_realizacao}</span>}
                  {(photo.dateTaken || atividade?.data_realizacao || atividade?.data_inicio) && <span>Data: {formatarData(photo.dateTaken || atividade?.data_realizacao || atividade?.data_inicio)}</span>}
                  {atividadeNome && <span>Atividade: {atividadeNome}</span>}
                </div>
                {photo.caption && <p className="rounded bg-gray-50 p-2 text-xs text-gray-700">{photo.caption}</p>}
                <div className="flex gap-2 pt-2"><Button onClick={() => handleEditClick(photo)} variant="outline" size="sm" className="flex-1 gap-2"><Edit2 className="h-3 w-3" /> Editar dados</Button><Button onClick={() => onDeletePhoto(photo.id)} variant="destructive" size="sm"><Trash2 className="h-3 w-3" /></Button></div>
              </div>
            </div>;
          })}
        </div>
      )}

      <PhotoGallerySelector isOpen={selectorOpen} onClose={() => setSelectorOpen(false)} onSelectPhoto={handleAddPhoto} atividades={atividades} museu={museuGaleria || museu} mes={mes} ano={ano} />

      <Dialog open={!!editingPhotoId} onOpenChange={(open) => !open && setEditingPhotoId(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>Editar dados da foto</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Título</Label><Input value={editData.title} onChange={(e) => setEditData((prev) => ({ ...prev, title: e.target.value }))} /></div>
            <div><Label>Legenda</Label><Textarea value={editData.caption} onChange={(e) => setEditData((prev) => ({ ...prev, caption: e.target.value }))} className="h-20 resize-none" /></div>
            <div><Label>Museu/identificação</Label><Input value={editData.museum} onChange={(e) => setEditData((prev) => ({ ...prev, museum: e.target.value }))} placeholder="Ex.: MIS BH" /></div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><div><Label>Local</Label><Input value={editData.location} onChange={(e) => setEditData((prev) => ({ ...prev, location: e.target.value }))} /></div><div><Label>Data da foto</Label><Input type="date" value={editData.dateTaken} onChange={(e) => setEditData((prev) => ({ ...prev, dateTaken: e.target.value }))} /></div></div>
            <div><Label>Atividade vinculada</Label><Select value={editData.activityId || 'nenhuma'} onValueChange={(value) => setEditData((prev) => ({ ...prev, activityId: value === 'nenhuma' ? '' : value }))}><SelectTrigger><SelectValue placeholder="Selecione a atividade" /></SelectTrigger><SelectContent><SelectItem value="nenhuma">Nenhuma atividade</SelectItem>{atividades.map((atividade) => <SelectItem key={atividade.id} value={atividade.id}>{nomeAtividade(atividade) || atividade.id}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setEditingPhotoId(null)}>Cancelar</Button><Button onClick={handleSavePhoto} className="bg-blue-600 hover:bg-blue-700">Salvar alterações</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
