import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { ImagePlus, Trash2, Edit2, Save, CheckCircle2, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PhotoGallerySelector from './PhotoGallerySelector';
import PhotoCaptionSuggester from './PhotoCaptionSuggester';
import { gerarLegendaFoto } from '@/utils/captionUtils';
import { toast } from 'sonner';

const TAMANHO_BLOCO = 10;

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
function chaveFoto(photo) {
  return String(photo?.drive_file_id || photo?.attachmentId || photo?.sourceAttachmentId || photo?.importFingerprint || photo?.id || photo?.url || '').trim();
}
function fotoPersistivel(photo) {
  return {
    id: photo.id,
    url: photo.url,
    fileName: photo.fileName || photo.file_name || 'foto',
    caption: photo.caption || '',
    author: photo.author || '',
    activityId: photo.activityId || null,
    title: photo.title || '',
    location: photo.location || '',
    dateTaken: photo.dateTaken || '',
    albumTitle: photo.activityId ? (photo.albumTitle || '') : 'Sem Vínculo',
    albumMuseum: photo.albumMuseum || photo.museum || photo.museu || '',
    museum: photo.museum || photo.museu || '',
    museu: photo.museu || photo.museum || '',
    drive_file_id: photo.drive_file_id || '',
    attachmentId: photo.attachmentId || photo.sourceAttachmentId || '',
    sourceAttachmentId: photo.sourceAttachmentId || photo.attachmentId || '',
    importFingerprint: chaveFoto(photo),
  };
}
function auditarFotos(lista = [], esperadas = []) {
  const chaves = lista.map(chaveFoto).filter(Boolean);
  const contagem = new Map();
  chaves.forEach((chave) => contagem.set(chave, (contagem.get(chave) || 0) + 1));
  const duplicadas = [...contagem.entries()].filter(([, quantidade]) => quantidade > 1).map(([chave]) => chave);
  const persistidas = new Set(chaves);
  const ausentes = esperadas.map(chaveFoto).filter((chave) => chave && !persistidas.has(chave));
  const semVinculo = lista.filter((foto) => !foto?.activityId).length;
  const semUrl = lista.filter((foto) => !foto?.url).length;
  const semLegenda = lista.filter((foto) => !foto?.caption).length;
  return {
    total: lista.length,
    duplicadas: duplicadas.length,
    ausentes: ausentes.length,
    semVinculo,
    semUrl,
    semLegenda,
    ok: ausentes.length === 0 && duplicadas.length === 0 && semUrl === 0,
  };
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
  const [verificando, setVerificando] = useState(false);
  const [auditoria, setAuditoria] = useState(null);
  const atividadePorId = useMemo(() => new Map(atividades.map((atividade) => [atividade.id, atividade])), [atividades]);
  const chavesExistentes = useMemo(() => new Set(photos.map(chaveFoto).filter(Boolean)), [photos]);

  const lerRelatorioPersistido = async () => {
    if (!reportId) throw new Error('Relatório sem ID. Salve o relatório antes de importar fotos.');
    const encontrados = await base44.entities.Report.filter({ id: reportId });
    const relatorio = Array.isArray(encontrados) ? encontrados[0] : null;
    if (!relatorio) throw new Error('Relatório não encontrado após a gravação.');
    return Array.isArray(relatorio.fotos) ? relatorio.fotos : [];
  };

  const verificarPersistencia = async (esperadas = photos, mostrarToast = true) => {
    setVerificando(true);
    try {
      const persistidas = await lerRelatorioPersistido();
      const resultado = auditarFotos(persistidas, esperadas);
      setAuditoria(resultado);
      if (mostrarToast) {
        if (resultado.ok) toast.success(`${resultado.total} foto(s) confirmadas no relatório, sem duplicidade.`);
        else toast.warning(`Verificação: ${resultado.ausentes} ausente(s), ${resultado.duplicadas} duplicada(s) e ${resultado.semUrl} sem URL.`);
      }
      return { persistidas, resultado };
    } finally {
      setVerificando(false);
    }
  };

  const persistirLista = async (lista) => {
    if (!reportId) throw new Error('Relatório sem ID. Salve o relatório antes de importar fotos.');
    const normalizadas = lista.map(fotoPersistivel);
    await base44.entities.Report.update(reportId, { fotos: normalizadas });
    const { resultado } = await verificarPersistencia(normalizadas, false);
    if (!resultado.ok) {
      throw new Error(`A gravação não foi confirmada: ${resultado.ausentes} ausente(s), ${resultado.duplicadas} duplicada(s) e ${resultado.semUrl} sem URL.`);
    }
    return resultado;
  };

  const persistirFoto = (photo, dados) => {
    Object.assign(photo, dados);
    onUpdatePhoto?.(photo.id, dados.caption ?? photo.caption ?? '', dados);
  };

  const prepararParaSalvar = (photo) => {
    const atividade = atividades.find((item) => item.id === photo.activityId);
    const dataFoto = photo.dateTaken || photo.capturedAt || photo.metadataDate || atividade?.data_realizacao || atividade?.data_inicio || '';
    const localFoto = photo.location || atividade?.local || atividade?.local_realizacao || museuGaleria || museu || '';
    const tituloFoto = photo.title || nomeAtividade(atividade) || (photo.activityId ? 'Registro da atividade' : 'Registro sem vínculo');
    const museum = photo.museum || photo.museu || museuGaleria || museu || atividade?.museu || '';
    const albumTitle = photo.activityId ? (photo.albumTitle || nomeAtividade(atividade) || tituloLocal) : 'Sem Vínculo';
    const caption = photo.caption || [nomeAtividade(atividade) || 'Sem vínculo', localFoto, dataFoto].filter(Boolean).join(' — ') || gerarLegendaFoto({ atividadeNome: nomeAtividade(atividade), atividadeLocal: localFoto, atividadeMuseus: museum ? [museum] : [], atividadeData: dataFoto, museu: museum, mes, ano, fileName: '' });
    return fotoPersistivel({ ...photo, title: tituloFoto, caption, location: localFoto, dateTaken: dataFoto, albumTitle, albumMuseum: museum, museum, museu: museum, activityId: photo.activityId || null, importFingerprint: chaveFoto(photo) });
  };

  const handleAddPhoto = async (photo, options = {}) => {
    if (!onAddPhoto) return;
    const preparada = prepararParaSalvar(photo);
    const chave = chaveFoto(preparada);
    if (chave && chavesExistentes.has(chave)) return;
    const novaLista = [...photos, preparada];
    await persistirLista(novaLista);
    await onAddPhoto(preparada);
    toast.success('Foto importada e confirmada no relatório.');
    if (!options.keepOpen) setSelectorOpen(false);
  };

  const handleAddPhotos = async (lista, onProgress) => {
    let ignoradas = 0;
    let importadas = 0;
    let erros = 0;
    const vistas = new Set(chavesExistentes);
    const novas = [];

    for (const item of lista) {
      const preparada = prepararParaSalvar(item);
      const chave = chaveFoto(preparada);
      if (chave && vistas.has(chave)) {
        ignoradas += 1;
      } else {
        novas.push(preparada);
        if (chave) vistas.add(chave);
      }
    }

    const totalBlocos = Math.max(1, Math.ceil(novas.length / TAMANHO_BLOCO));
    let acumuladas = [...photos];

    for (let inicio = 0; inicio < novas.length; inicio += TAMANHO_BLOCO) {
      const bloco = novas.slice(inicio, inicio + TAMANHO_BLOCO);
      const blocoAtual = Math.floor(inicio / TAMANHO_BLOCO) + 1;
      onProgress?.({
        atual: importadas + ignoradas,
        importadas,
        ignoradas,
        erros,
        blocoAtual,
        totalBlocos,
        etapa: `Importando bloco ${blocoAtual} de ${totalBlocos}`,
      });

      try {
        const listaDoBloco = [...acumuladas, ...bloco];
        await persistirLista(listaDoBloco);
        for (const foto of bloco) await onAddPhoto?.(foto);
        acumuladas = listaDoBloco;
        importadas += bloco.length;
        onProgress?.({
          atual: Math.min(lista.length, importadas + ignoradas),
          importadas,
          ignoradas,
          erros,
          blocoAtual,
          totalBlocos,
          etapa: `Bloco ${blocoAtual} de ${totalBlocos} concluído`,
        });
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (error) {
        erros += bloco.length;
        onProgress?.({
          atual: Math.min(lista.length, importadas + ignoradas + erros),
          importadas,
          ignoradas,
          erros,
          blocoAtual,
          totalBlocos,
          etapa: `Falha no bloco ${blocoAtual} de ${totalBlocos}`,
        });
        throw error;
      }
    }

    if (!novas.length) {
      onProgress?.({ atual: lista.length, importadas: 0, ignoradas, erros: 0, blocoAtual: 0, totalBlocos: 0, etapa: 'Nenhuma foto nova para importar' });
    } else {
      toast.success(`${importadas} foto(s) importadas em ${totalBlocos} bloco(s) de até 10 e confirmadas no relatório.`);
    }
    setSelectorOpen(false);
  };

  const handleEditClick = (photo) => {
    const atividade = atividadePorId.get(photo.activityId);
    setEditingPhotoId(photo.id);
    setEditData({ caption: photo.caption || '', title: photo.title || '', location: photo.location || '', dateTaken: photo.dateTaken || photo.capturedAt || photo.metadataDate || '', activityId: photo.activityId || '', museum: identificacaoMuseu(photo, atividade, museuGaleria || museu) });
  };

  const handleSavePhoto = async () => {
    const photo = photos.find((item) => item.id === editingPhotoId);
    if (photo) {
      const museum = editData.museum.trim();
      const dados = { caption: editData.caption.trim(), title: editData.title.trim(), location: editData.location.trim(), dateTaken: editData.dateTaken, activityId: editData.activityId || null, albumTitle: editData.activityId ? tituloLocal : 'Sem Vínculo', albumMuseum: museum, museum, museu: museum };
      const atualizadas = photos.map((item) => item.id === photo.id ? { ...item, ...dados } : item);
      await persistirLista(atualizadas);
      persistirFoto(photo, dados);
    }
    setEditingPhotoId(null);
  };

  const salvarDadosGaleria = async () => {
    const titulo = tituloLocal.trim() || 'Galeria de Fotos';
    const museum = museuGaleria.trim();
    const atualizadas = photos.map((photo) => {
      const atual = identificacaoMuseu(photo, atividadePorId.get(photo.activityId), '');
      return { ...photo, albumTitle: photo.activityId ? titulo : 'Sem Vínculo', albumMuseum: museum, museum: atual || museum, museu: atual || museum, caption: photo.caption || '' };
    });
    await persistirLista(atualizadas);
    setTituloLocal(titulo);
    setMuseuGaleria(museum);
    atualizadas.forEach((photo) => persistirFoto(photo, photo));
    onGalleryTitleChange?.(titulo);
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-gray-200 bg-gray-50 p-4 md:grid-cols-2">
        <div><Label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Título do álbum</Label><Input value={tituloLocal} onChange={(e) => setTituloLocal(e.target.value)} placeholder="Título da galeria" /></div>
        <div><Label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Museu/identificação do bloco</Label><Input value={museuGaleria} onChange={(e) => setMuseuGaleria(e.target.value)} placeholder="Ex.: MIS BH, MUMO, MHAB" /></div>
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button type="button" variant="outline" onClick={salvarDadosGaleria} className="gap-2"><Save className="h-4 w-4" /> Salvar título e museu</Button>
          <Button type="button" variant="outline" onClick={() => verificarPersistencia(photos)} disabled={verificando || !reportId} className="gap-2">{verificando ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Verificar importação</Button>
          <Button onClick={() => setSelectorOpen(true)} className="gap-2 bg-green-600 text-white hover:bg-green-700" size="sm"><ImagePlus className="h-4 w-4" /> Pré-visualizar e importar fotos</Button>
        </div>
      </div>

      {auditoria && (
        <div className={`rounded-xl border p-4 ${auditoria.ok ? 'border-green-200 bg-green-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-start gap-2">
            {auditoria.ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-green-700" /> : <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />}
            <div>
              <p className={`text-sm font-bold ${auditoria.ok ? 'text-green-800' : 'text-amber-800'}`}>{auditoria.ok ? 'Importação confirmada no Base44' : 'Importação requer revisão'}</p>
              <p className="mt-1 text-xs text-gray-700">{auditoria.total} persistidas · {auditoria.semVinculo} sem vínculo · {auditoria.semLegenda} sem legenda · {auditoria.duplicadas} duplicadas · {auditoria.ausentes} ausentes · {auditoria.semUrl} sem URL</p>
            </div>
          </div>
        </div>
      )}

      {photos.length === 0 ? <div className="rounded-lg border-2 border-dashed border-gray-300 py-8 text-center"><ImagePlus className="mx-auto mb-2 h-12 w-12 text-gray-300" /><p className="text-sm text-gray-600">Nenhuma foto adicionada</p></div> : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{photos.map((photo) => {
          const atividade = atividadePorId.get(photo.activityId);
          const atividadeNome = nomeAtividade(atividade);
          const museum = identificacaoMuseu(photo, atividade, museuGaleria || museu);
          return <div key={photo.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white"><div className="group relative aspect-video overflow-hidden bg-gray-100"><img src={photo.url} alt={photo.title || photo.caption || 'Foto da atividade'} className="h-full w-full object-cover" onError={(e) => { e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="225"%3E%3Crect fill="%23f0f0f0" width="400" height="225"/%3E%3C/svg%3E'; }} />{!photo.caption && <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100"><PhotoCaptionSuggester photoUrl={photo.url} activityId={photo.activityId || activityId} reportId={reportId} onCaptionSuggested={(caption) => onUpdatePhoto?.(photo.id, caption)} /></div>}</div><div className="space-y-2 p-3">{photo.title && <h4 className="text-sm font-semibold">{photo.title}</h4>}<div className="flex flex-wrap gap-2 text-xs text-gray-500"><span className={photo.activityId ? 'text-green-700' : 'font-semibold text-amber-700'}>{photo.activityId ? `Atividade: ${atividadeNome || photo.activityId}` : 'Álbum: Sem Vínculo'}</span><span>Museu: {museum || 'Sem identificação'}</span>{photo.location && <span>Local: {photo.location}</span>}{photo.dateTaken && <span>Data: {formatarData(photo.dateTaken)}</span>}</div>{photo.caption && <p className="rounded bg-gray-50 p-2 text-xs">{photo.caption}</p>}<div className="flex gap-2"><Button onClick={() => handleEditClick(photo)} variant="outline" size="sm" className="flex-1 gap-2"><Edit2 className="h-3 w-3" /> Editar vínculo e dados</Button><Button onClick={() => onDeletePhoto(photo.id)} variant="destructive" size="sm"><Trash2 className="h-3 w-3" /></Button></div></div></div>;
        })}</div>
      )}

      <PhotoGallerySelector isOpen={selectorOpen} onClose={() => setSelectorOpen(false)} onSelectPhoto={handleAddPhoto} onSelectPhotos={handleAddPhotos} atividades={atividades} existingPhotos={photos} museu={museuGaleria || museu} mes={mes} ano={ano} />

      <Dialog open={!!editingPhotoId} onOpenChange={(open) => !open && setEditingPhotoId(null)}><DialogContent className="max-w-xl"><DialogHeader><DialogTitle>Editar dados da foto</DialogTitle></DialogHeader><div className="space-y-4"><div><Label>Título</Label><Input value={editData.title} onChange={(e) => setEditData((prev) => ({ ...prev, title: e.target.value }))} /></div><div><Label>Legenda</Label><Textarea value={editData.caption} onChange={(e) => setEditData((prev) => ({ ...prev, caption: e.target.value }))} /></div><div><Label>Museu/identificação</Label><Input value={editData.museum} onChange={(e) => setEditData((prev) => ({ ...prev, museum: e.target.value }))} /></div><div className="grid gap-4 sm:grid-cols-2"><div><Label>Local</Label><Input value={editData.location} onChange={(e) => setEditData((prev) => ({ ...prev, location: e.target.value }))} /></div><div><Label>Data da foto</Label><Input type="date" value={editData.dateTaken} onChange={(e) => setEditData((prev) => ({ ...prev, dateTaken: e.target.value }))} /></div></div><div><Label>Atividade vinculada</Label><Select value={editData.activityId || 'nenhuma'} onValueChange={(value) => setEditData((prev) => ({ ...prev, activityId: value === 'nenhuma' ? '' : value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="nenhuma">Sem Vínculo</SelectItem>{atividades.map((atividade) => <SelectItem key={atividade.id} value={atividade.id}>{nomeAtividade(atividade) || atividade.id}</SelectItem>)}</SelectContent></Select></div></div><DialogFooter><Button variant="outline" onClick={() => setEditingPhotoId(null)}>Cancelar</Button><Button onClick={handleSavePhoto}>Salvar alterações</Button></DialogFooter></DialogContent></Dialog>
    </div>
  );
}
