import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle2, ImageOff, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

const PAGE_SIZE = 20;
const NONE = '__none__';

function text(value) {
  return String(value || '').trim();
}

function reportLabel(report) {
  const month = text(report.mes_referencia || report.mes || 'Mês não informado');
  const year = text(report.ano || report.ano_referencia || '');
  return [month, year, text(report.museu || 'Museu não informado'), text(report.author_name || report.nome_profissional || report.created_by || 'Sem autor')]
    .filter(Boolean).join(' · ');
}

function activityLabel(activity) {
  return text(activity.nome || activity.titulo || activity.descricao || activity.id || 'Atividade sem título');
}

function photoLabel(photo) {
  return text(photo.file_name || photo.fileName || photo.raw_data?.fileName || photo.raw_data?.name || photo.drive_file_id || photo.id || 'Foto sem nome');
}

function photoUrl(photo) {
  return text(photo.file_url || photo.url || photo.raw_data?.url || '');
}

function reportActivities(reports, activities) {
  const byReport = new Map();
  for (const activity of activities) {
    const reportId = text(activity.report_id);
    const id = text(activity.base44_activity_id || activity.id);
    if (!reportId || !id) continue;
    const list = byReport.get(reportId) || [];
    list.push({ ...activity, id });
    byReport.set(reportId, list);
  }
  // A report created before the normalized table existed can still expose its
  // activities in raw_data. Include them as a fallback, never as duplicates.
  for (const report of reports) {
    const reportId = text(report.id);
    const list = byReport.get(reportId) || [];
    const ids = new Set(list.map((item) => text(item.id)));
    const legacy = Array.isArray(report?.raw_data?.atividades) ? report.raw_data.atividades : Array.isArray(report?.atividades) ? report.atividades : [];
    for (const item of legacy) {
      const id = text(item?.id || item?.base44_activity_id);
      if (id && !ids.has(id)) {
        list.push({ ...item, id, report_id: reportId });
        ids.add(id);
      }
    }
    byReport.set(reportId, list);
  }
  return byReport;
}

export default function VincularFotosSemRelatorio({ open, onClose, onSaved }) {
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState('');
  const [photos, setPhotos] = useState([]);
  const [reports, setReports] = useState([]);
  const [activities, setActivities] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  const load = async () => {
    setLoading(true);
    try {
      const [photoList, reportList, activityList] = await Promise.all([
        base44.entities.ReportPhoto.list('-created_date', 5000),
        base44.entities.Report.list('-updated_date', 5000),
        base44.entities.ReportActivity.list('-created_date', 5000),
      ]);
      const validReports = Array.isArray(reportList) ? reportList : [];
      const unresolved = (Array.isArray(photoList) ? photoList : []).filter((photo) => !text(photo.report_id) || !text(photo.activity_id));
      setPhotos(unresolved);
      setReports(validReports);
      setActivities(Array.isArray(activityList) ? activityList : []);
      setDrafts(Object.fromEntries(unresolved.map((photo) => [text(photo.id), {
        reportId: text(photo.report_id), activityId: text(photo.activity_id),
      }])));
      setPage(0);
    } catch (error) {
      toast.error(`Não foi possível carregar as fotos sem vínculo: ${error?.message || 'erro de consulta'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  const activitiesByReport = useMemo(() => reportActivities(reports, activities), [reports, activities]);
  const filtered = useMemo(() => {
    const query = text(search).toLocaleLowerCase('pt-BR');
    if (!query) return photos;
    return photos.filter((photo) => [photoLabel(photo), text(photo.author), text(photo.museu), text(photo.mes_referencia), text(photo.ano)]
      .some((value) => value.toLocaleLowerCase('pt-BR').includes(query)));
  }, [photos, search]);
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);

  const updateDraft = (id, patch) => setDrafts((current) => ({ ...current, [id]: { ...current[id], ...patch } }));

  const save = async (photo) => {
    const id = text(photo.id);
    const draft = drafts[id] || {};
    if (!draft.reportId || !draft.activityId) {
      toast.error('Selecione o relatório e a atividade antes de gravar.');
      return;
    }
    const report = reports.find((item) => text(item.id) === draft.reportId);
    if (!report) {
      toast.error('O relatório selecionado não foi encontrado. Atualize a lista.');
      return;
    }
    setSavingId(id);
    try {
      await base44.entities.ReportPhoto.update(id, {
        report_id: draft.reportId,
        activity_id: draft.activityId,
        author: report.author_name || report.nome_profissional || photo.author || '',
        museu: report.museu || photo.museu || '',
        mes_referencia: report.mes_referencia || photo.mes_referencia || '',
        ano: report.ano || report.ano_referencia || photo.ano || null,
      });
      setPhotos((current) => current.filter((item) => text(item.id) !== id));
      toast.success('Foto vinculada ao relatório e à atividade. A galeria e as evidências foram atualizadas.');
      onSaved?.();
    } catch (error) {
      toast.error(`Não foi possível gravar o vínculo: ${error?.message || 'erro desconhecido'}`);
    } finally {
      setSavingId('');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-6xl overflow-hidden p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle className="flex items-center gap-2"><ImageOff className="h-5 w-5 text-amber-600" /> Vincular fotos sem atividade</DialogTitle>
          <DialogDescription>Escolha o relatório mensal e a atividade correspondente. A associação é gravada na tabela de fotos e refletida na atividade e na galeria do relatório.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="w-full sm:max-w-md"><Label htmlFor="buscar-foto-sem-vinculo">Buscar foto</Label><div className="relative mt-1"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><Input id="buscar-foto-sem-vinculo" className="pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Arquivo, autor, museu ou período" /></div></div>
            <Button variant="outline" onClick={load} disabled={loading}>{loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Atualizar lista</Button>
          </div>
          <p className="text-sm text-gray-600">{filtered.length} foto(s) aguardando vínculo. As opções de atividade são filtradas pelo relatório selecionado.</p>
          {loading ? <div className="py-16 text-center text-sm text-gray-500"><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />Carregando relações canônicas…</div> : pageItems.length === 0 ? <div className="py-16 text-center text-sm text-green-700"><CheckCircle2 className="mx-auto mb-2 h-6 w-6" />Não há fotos sem vínculo neste filtro.</div> : <div className="space-y-3">{pageItems.map((photo) => {
            const id = text(photo.id);
            const draft = drafts[id] || {};
            const selectedActivities = activitiesByReport.get(draft.reportId) || [];
            const url = photoUrl(photo);
            return <div key={id} className="grid gap-3 rounded-xl border border-gray-200 bg-white p-3 md:grid-cols-[96px_1fr_1fr_1fr_auto] md:items-end">
              <div className="aspect-square overflow-hidden rounded-lg bg-gray-100">{url ? <img src={url} alt="" className="h-full w-full object-cover" /> : <ImageOff className="m-8 h-8 w-8 text-gray-300" />}</div>
              <div className="min-w-0"><p className="truncate text-sm font-medium" title={photoLabel(photo)}>{photoLabel(photo)}</p><p className="mt-1 text-xs text-gray-500">{[text(photo.author), text(photo.museu), text(photo.mes_referencia), text(photo.ano)].filter(Boolean).join(' · ') || 'Sem metadados'}</p></div>
              <div><Label>Relatório mensal</Label><Select value={draft.reportId || NONE} onValueChange={(value) => updateDraft(id, { reportId: value === NONE ? '' : value, activityId: '' })}><SelectTrigger className="mt-1"><SelectValue placeholder="Selecione o relatório" /></SelectTrigger><SelectContent><SelectItem value={NONE}>Selecionar relatório</SelectItem>{reports.map((report) => <SelectItem key={report.id} value={text(report.id)}>{reportLabel(report)}</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Atividade</Label><Select disabled={!draft.reportId} value={draft.activityId || NONE} onValueChange={(value) => updateDraft(id, { activityId: value === NONE ? '' : value })}><SelectTrigger className="mt-1"><SelectValue placeholder={draft.reportId ? 'Selecione a atividade' : 'Escolha o relatório primeiro'} /></SelectTrigger><SelectContent><SelectItem value={NONE}>Selecionar atividade</SelectItem>{selectedActivities.map((activity) => <SelectItem key={activity.id} value={text(activity.id)}>{activityLabel(activity)}</SelectItem>)}</SelectContent></Select></div>
              <Button onClick={() => save(photo)} disabled={savingId === id || !draft.reportId || !draft.activityId} className="bg-emerald-700 hover:bg-emerald-800">{savingId === id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Vincular'}</Button>
            </div>;
          })}</div>}
          {pages > 1 && <div className="flex items-center justify-between border-t pt-4"><Button variant="outline" disabled={page === 0} onClick={() => setPage((current) => Math.max(0, current - 1))}>Anterior</Button><span className="text-sm text-gray-500">Página {page + 1} de {pages}</span><Button variant="outline" disabled={page >= pages - 1} onClick={() => setPage((current) => Math.min(pages - 1, current + 1))}>Próxima</Button></div>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
