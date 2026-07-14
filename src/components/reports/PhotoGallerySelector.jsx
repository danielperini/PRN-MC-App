import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Image as ImageIcon, Loader2, Sparkles, Link2, Unlink, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { gerarLegendaFoto } from '@/utils/captionUtils';

function normalizar(valor) {
  return String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
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
  return atividade?.nome || atividade?.titulo || atividade?.descricao || atividade?.atividade || '';
}
function idAtividade(atividade, indice = 0) {
  return String(atividade?.id || atividade?._id || atividade?.activity_id || `atividade-${indice}`);
}
function listaAtividadesRelatorio(report) {
  const listas = [report?.atividades, report?.activities, report?.atividades_realizadas];
  return listas.find(Array.isArray) || [];
}
function chaveFoto(foto) {
  return String(foto?.drive_file_id || foto?.attachmentId || foto?.sourceAttachmentId || foto?.id || foto?.url || foto?.file_url || '').trim();
}
function legendaPadrao(atividade, local, data, fallback = 'Sem vínculo') {
  const nome = nomeAtividade(atividade) || fallback;
  return [nome, local, data].filter(Boolean).join(' — ');
}
function melhorAtividade(foto, atividades) {
  const idDireto = String(foto.activityId || foto.atividade_id || foto.activity_id || '');
  if (idDireto) return atividades.find((atividade) => idAtividade(atividade) === idDireto) || null;
  const data = foto.dateTaken;
  const museu = normalizar(foto.museu);
  const texto = normalizar([foto.description, foto.title, foto.fileName].join(' '));
  const candidatos = atividades.map((atividade) => {
    const dataAtividade = String(atividade?.data_realizacao || atividade?.data_inicio || atividade?.data || '').slice(0, 10);
    const museuAtividade = normalizar(atividade?.museu || atividade?.local || atividade?.local_realizacao);
    const nome = normalizar(nomeAtividade(atividade));
    let score = 0;
    if (data && dataAtividade && data === dataAtividade) score += 6;
    if (museu && museuAtividade && (museu.includes(museuAtividade) || museuAtividade.includes(museu))) score += 3;
    if (nome && texto && (texto.includes(nome) || nome.includes(texto))) score += 5;
    return { atividade, score };
  }).filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  return candidatos[0]?.score >= 6 && candidatos[0]?.score > (candidatos[1]?.score || 0) ? candidatos[0].atividade : null;
}

export default function PhotoGallerySelector({
  isOpen, onClose, onSelectPhoto, onSelectPhotos,
  atividades = [], existingPhotos = [], museu = '', mes = '', ano = '',
}) {
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [caption, setCaption] = useState('');
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [dateTaken, setDateTaken] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [atividadeVinculadaId, setAtividadeVinculadaId] = useState('');
  const [vinculosManuais, setVinculosManuais] = useState({});
  const [importando, setImportando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0, importadas: 0, ignoradas: 0, erros: 0 });

  const { data = { images: [], atividadesGlobais: [] }, isLoading } = useQuery({
    queryKey: ['galeria-fotos-selector-global'],
    queryFn: async () => {
      const [reportsRaw, attachmentsRaw] = await Promise.all([
        base44.entities.Report.list('-created_date', 3000),
        base44.entities.Attachment.list('-created_date', 5000),
      ]);
      const reports = Array.isArray(reportsRaw) ? reportsRaw : [];
      const attachments = Array.isArray(attachmentsRaw) ? attachmentsRaw : [];
      const reportsById = new Map(reports.map((report) => [report.id, report]));
      const atividadesGlobais = [];
      const atividadesVistas = new Set();
      reports.forEach((report) => listaAtividadesRelatorio(report).forEach((atividade, indice) => {
        const normalizada = { ...atividade, id: idAtividade(atividade, indice), report_id: report.id, author_name: report.author_name || '' };
        if (!atividadesVistas.has(normalizada.id)) {
          atividadesVistas.add(normalizada.id);
          atividadesGlobais.push(normalizada);
        }
      }));
      atividades.forEach((atividade, indice) => {
        const normalizada = { ...atividade, id: idAtividade(atividade, indice) };
        if (!atividadesVistas.has(normalizada.id)) {
          atividadesVistas.add(normalizada.id);
          atividadesGlobais.push(normalizada);
        }
      });
      const imageExtensions = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic']);
      const images = attachments.filter((att) => imageExtensions.has(String(att.file_name || '').split('.').pop().toLowerCase())).map((att) => {
        const report = reportsById.get(att.report_id) || {};
        const foto = {
          id: att.id,
          attachmentId: att.id,
          sourceAttachmentId: att.id,
          drive_file_id: att.drive_file_id || att.google_drive_file_id || '',
          fileName: att.file_name || '',
          url: att.file_url,
          description: att.description || '',
          author: report.author_name || '',
          mes: report.mes_referencia || '',
          ano: report.ano || '',
          museu: att.museu || report.museu || '',
          dateTaken: dataFoto(att),
          location: att.location || att.local || report.museu || '',
          title: att.title || att.titulo || '',
          activityId: att.activity_id || att.atividade_id || '',
          reportId: att.report_id || '',
        };
        const atividade = melhorAtividade(foto, atividadesGlobais);
        return { ...foto, activityId: atividade ? idAtividade(atividade) : foto.activityId || null };
      });
      return { images, atividadesGlobais };
    },
    enabled: isOpen,
    staleTime: 60000,
  });

  const atividadesDisponiveis = data.atividadesGlobais || [];
  const existentes = useMemo(() => new Set(existingPhotos.map(chaveFoto).filter(Boolean)), [existingPhotos]);
  const candidatas = useMemo(() => (data.images || []).filter((foto) => !existentes.has(chaveFoto(foto))), [data.images, existentes]);
  const filtradas = useMemo(() => {
    if (!searchTerm.trim()) return candidatas;
    const termo = normalizar(searchTerm);
    return candidatas.filter((foto) => normalizar([foto.title, foto.description, foto.museu, foto.fileName].join(' ')).includes(termo));
  }, [candidatas, searchTerm]);

  const prepararFoto = (foto) => {
    const activityId = vinculosManuais[foto.id] !== undefined ? vinculosManuais[foto.id] : foto.activityId;
    const atividade = atividadesDisponiveis.find((item) => idAtividade(item) === String(activityId || ''));
    const data = foto.dateTaken || atividade?.data_realizacao || atividade?.data_inicio || atividade?.data || '';
    const local = foto.location || atividade?.local || atividade?.local_realizacao || foto.museu || museu || '';
    return {
      ...foto,
      activityId: atividade ? idAtividade(atividade) : null,
      albumTitle: atividade ? (nomeAtividade(atividade) || 'Atividade') : 'Sem Vínculo',
      title: foto.title || (atividade ? nomeAtividade(atividade) : 'Registro sem vínculo'),
      location: local,
      dateTaken: data,
      caption: legendaPadrao(atividade, local, data),
      importFingerprint: chaveFoto(foto),
    };
  };

  useEffect(() => {
    if (!selectedPhoto) return;
    const preparada = prepararFoto({ ...selectedPhoto, activityId: atividadeVinculadaId || selectedPhoto.activityId });
    setAtividadeVinculadaId(preparada.activityId || '');
    setTitle(preparada.title);
    setLocation(preparada.location);
    setDateTaken(preparada.dateTaken);
    setCaption(preparada.caption);
  }, [selectedPhoto]);

  const importarTodas = async () => {
    const fotos = candidatas.map(prepararFoto);
    if (!fotos.length) return toast.info('Não há fotos novas para importar.');
    setImportando(true);
    setProgresso({ atual: 0, total: fotos.length, importadas: 0, ignoradas: existentes.size, erros: 0 });
    try {
      if (onSelectPhotos) {
        await onSelectPhotos(fotos, (estado) => setProgresso((anterior) => ({ ...anterior, ...estado, total: fotos.length })));
      } else {
        let importadas = 0;
        let erros = 0;
        for (let indice = 0; indice < fotos.length; indice += 1) {
          try {
            await onSelectPhoto(fotos[indice], { keepOpen: true, bulk: true });
            importadas += 1;
          } catch {
            erros += 1;
          }
          setProgresso({ atual: indice + 1, total: fotos.length, importadas, ignoradas: existentes.size, erros });
          if ((indice + 1) % 20 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }
      toast.success('Importação concluída sem duplicar fotos já existentes.');
      onClose();
    } catch (error) {
      toast.error(`Erro na importação: ${error?.message || error}`);
    } finally {
      setImportando(false);
    }
  };

  const handleAddPhoto = async () => {
    if (!selectedPhoto) return toast.error('Selecione uma foto');
    await onSelectPhoto({ ...prepararFoto(selectedPhoto), caption, title, location, dateTaken, activityId: atividadeVinculadaId || null });
    onClose();
  };

  const percent = progresso.total ? Math.round((progresso.atual / progresso.total) * 100) : 0;

  return (
    <Dialog open={isOpen} onOpenChange={() => !importando && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
        <DialogHeader><DialogTitle>Importar e vincular fotos</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border bg-green-50 p-3"><p className="text-xs text-green-700">Fotos novas</p><p className="text-xl font-bold text-green-800">{candidatas.length}</p></div>
            <div className="rounded-xl border bg-blue-50 p-3"><p className="text-xs text-blue-700">Com vínculo automático</p><p className="text-xl font-bold text-blue-800">{candidatas.filter((foto) => foto.activityId).length}</p></div>
            <div className="rounded-xl border bg-amber-50 p-3"><p className="text-xs text-amber-700">Álbum Sem Vínculo</p><p className="text-xl font-bold text-amber-800">{candidatas.filter((foto) => !foto.activityId).length}</p></div>
          </div>

          <div className="rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
            <p>🔗 Vincula cada foto à atividade correspondente no relatório.</p>
            <p>📝 Gera legenda no formato: Atividade — Local — Data.</p>
            <p>🔁 Não duplica fotos já importadas anteriormente.</p>
          </div>

          <Input placeholder="Buscar por título, descrição, museu ou arquivo…" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />

          {isLoading ? <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin" /></div> : (
            <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-xl border p-3">
              {filtradas.map((foto) => {
                const vinculo = vinculosManuais[foto.id] !== undefined ? vinculosManuais[foto.id] : foto.activityId || '';
                return <div key={foto.id} className="grid gap-3 rounded-lg border bg-white p-2 md:grid-cols-[72px_1fr_340px] md:items-center">
                  <img src={foto.url} alt="Pré-visualização" className="h-16 w-16 rounded object-cover" />
                  <div className="min-w-0"><p className="truncate text-sm font-semibold">{foto.title || foto.description || 'Foto sem título'}</p><p className="text-xs text-gray-500">{foto.dateTaken || 'Data não identificada'} · {foto.museu || 'Museu não identificado'}</p></div>
                  <Select value={vinculo || 'sem-vinculo'} onValueChange={(value) => setVinculosManuais((anterior) => ({ ...anterior, [foto.id]: value === 'sem-vinculo' ? '' : value }))}>
                    <SelectTrigger className={vinculo ? '' : 'border-amber-300 bg-amber-50'}><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="sem-vinculo"><span className="flex items-center gap-2"><Unlink className="h-3 w-3" /> Sem Vínculo</span></SelectItem>{atividadesDisponiveis.map((atividade) => <SelectItem key={idAtividade(atividade)} value={idAtividade(atividade)}>{nomeAtividade(atividade) || idAtividade(atividade)}{atividade.author_name ? ` — ${atividade.author_name}` : ''}</SelectItem>)}</SelectContent>
                  </Select>
                </div>;
              })}
              {!filtradas.length && <div className="py-10 text-center text-gray-500"><ImageIcon className="mx-auto mb-2 h-10 w-10" />Nenhuma foto nova encontrada.</div>}
            </div>
          )}

          {(importando || progresso.total > 0) && <div className="space-y-2 rounded-xl border bg-slate-50 p-4"><div className="flex justify-between text-sm"><span>{importando ? 'Importando fotos e vinculando atividades…' : 'Importação concluída'}</span><strong>{percent}%</strong></div><div className="h-3 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-slate-800 transition-all" style={{ width: `${percent}%` }} /></div><p className="text-xs text-gray-500">{progresso.atual}/{progresso.total} processadas · {progresso.importadas} importadas · {progresso.ignoradas} já existentes · {progresso.erros} erros</p></div>}

          {selectedPhoto && <div className="space-y-3 rounded-xl border bg-gray-50 p-4"><div><Label>Atividade</Label><Select value={atividadeVinculadaId || 'sem-vinculo'} onValueChange={(value) => setAtividadeVinculadaId(value === 'sem-vinculo' ? '' : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="sem-vinculo">Sem Vínculo</SelectItem>{atividadesDisponiveis.map((atividade) => <SelectItem key={idAtividade(atividade)} value={idAtividade(atividade)}>{nomeAtividade(atividade)}</SelectItem>)}</SelectContent></Select></div><div><Label>Título</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div><div className="grid gap-3 sm:grid-cols-2"><div><Label>Local</Label><Input value={location} onChange={(e) => setLocation(e.target.value)} /></div><div><Label>Data</Label><Input type="date" value={dateTaken} onChange={(e) => setDateTaken(e.target.value)} /></div></div><div><Label className="flex items-center gap-1"><Sparkles className="h-4 w-4" /> Legenda</Label><Textarea value={caption} onChange={(e) => setCaption(e.target.value)} /></div></div>}
        </div>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose} disabled={importando}>Cancelar</Button><Button variant="outline" onClick={handleAddPhoto} disabled={!selectedPhoto || importando}><Link2 className="mr-2 h-4 w-4" /> Importar selecionada</Button><Button onClick={importarTodas} disabled={isLoading || importando || !candidatas.length} className="bg-green-600 hover:bg-green-700">{importando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />} Importar {candidatas.length} foto(s)</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
