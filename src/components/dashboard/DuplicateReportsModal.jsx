import React, { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Copy, AlertTriangle, Loader2, Pencil, Trash2, Save, X, ChevronDown, ChevronUp, CheckCircle2
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const STATUS_OPTIONS = [
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'SUBMITTED', label: 'Enviado' },
  { value: 'IN_REVIEW', label: 'Em Revisão' },
  { value: 'RETURNED', label: 'Devolvido' },
  { value: 'APPROVED', label: 'Aprovado' },
  { value: 'ARCHIVED', label: 'Arquivado' },
];

const STATUS_COLOR = {
  APPROVED: 'bg-black text-white',
  SUBMITTED: 'bg-gray-700 text-white',
  IN_REVIEW: 'bg-gray-700 text-white',
  RETURNED: 'bg-red-100 text-red-700',
  DRAFT: 'bg-gray-100 text-gray-700',
  ARCHIVED: 'bg-gray-200 text-gray-500',
};

function ReportRow({ report, onDeleted, onUpdated }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    status: report.status || 'DRAFT',
    mes_referencia: report.mes_referencia || '',
    ano: report.ano || new Date().getFullYear(),
    author_name: report.author_name || '',
    museu: report.museu || '',
    resumo_periodo: report.resumo_periodo || '',
  });

  async function handleSave() {
    setSaving(true);
    try {
      await base44.entities.Report.update(report.id, form);
      toast({ title: 'Relatório atualizado.' });
      onUpdated({ ...report, ...form });
      setEditing(false);
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await base44.entities.Report.delete(report.id);
      toast({ title: 'Relatório excluído com sucesso.' });
      onDeleted(report.id);
    } catch (e) {
      toast({ title: 'Erro ao excluir', description: e.message, variant: 'destructive' });
      setDeleting(false);
    }
  }

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      {/* Cabeçalho da linha */}
      <div className="px-4 py-3 flex items-center justify-between gap-3 bg-white">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-xs text-gray-400 flex-shrink-0">{report.id.slice(0, 8)}…</span>
          <Badge className={`text-xs flex-shrink-0 ${STATUS_COLOR[report.status] || 'bg-gray-100 text-gray-700'}`}>
            {STATUS_OPTIONS.find(s => s.value === report.status)?.label || report.status}
          </Badge>
          <span className="text-xs text-gray-500 truncate">
            {report.mes_referencia} {report.ano} — {report.author_name || report.created_by}
          </span>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-xs text-gray-400 mr-2">
            {report.created_date ? new Date(report.created_date).toLocaleDateString('pt-BR') : '—'}
          </span>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-gray-400 hover:text-blue-600"
            onClick={() => { setEditing(e => !e); setConfirming(false); }}
            title="Editar"
          >
            {editing ? <ChevronUp className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-gray-400 hover:text-red-600"
            onClick={() => { setConfirming(c => !c); setEditing(false); }}
            title="Excluir"
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Painel de edição */}
      {editing && (
        <div className="border-t border-gray-100 px-4 py-4 bg-gray-50 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(o => (
                    <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Ano</Label>
              <Input
                type="number"
                className="h-8 text-xs"
                value={form.ano}
                onChange={e => setForm(f => ({ ...f, ano: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Mês de Referência</Label>
              <Select value={form.mes_referencia} onValueChange={v => setForm(f => ({ ...f, mes_referencia: v }))}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'].map(m => (
                    <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Museu</Label>
              <Input
                className="h-8 text-xs"
                value={form.museu}
                onChange={e => setForm(f => ({ ...f, museu: e.target.value }))}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Nome do Autor</Label>
              <Input
                className="h-8 text-xs"
                value={form.author_name}
                onChange={e => setForm(f => ({ ...f, author_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label className="text-xs">Resumo do Período</Label>
              <Input
                className="h-8 text-xs"
                value={form.resumo_periodo}
                onChange={e => setForm(f => ({ ...f, resumo_periodo: e.target.value }))}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditing(false)}>
              <X className="w-3 h-3 mr-1" />Cancelar
            </Button>
            <Button size="sm" className="h-7 text-xs bg-black hover:bg-gray-800" onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Save className="w-3 h-3 mr-1" />}
              Salvar
            </Button>
          </div>
        </div>
      )}

      {/* Painel de confirmação de exclusão */}
      {confirming && (
        <div className="border-t border-red-100 px-4 py-3 bg-red-50 flex items-center justify-between gap-3">
          <p className="text-xs text-red-700 font-medium">
            Confirma a exclusão permanente deste relatório? Esta ação não pode ser desfeita.
          </p>
          <div className="flex gap-2 flex-shrink-0">
            <Button size="sm" variant="outline" className="h-7 text-xs border-red-200" onClick={() => setConfirming(false)}>
              Cancelar
            </Button>
            <Button size="sm" className="h-7 text-xs bg-red-600 hover:bg-red-700 text-white" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Trash2 className="w-3 h-3 mr-1" />}
              Excluir
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DuplicateReportsModal({ open, onClose }) {
  const queryClient = useQueryClient();
  const { data: allReports = [], isLoading } = useQuery({
    queryKey: ['all-reports-duplicates'],
    queryFn: () => base44.entities.Report.list('-created_date', 500),
    enabled: open,
  });

  const [localReports, setLocalReports] = useState([]);
  useEffect(() => {
    if (allReports.length) setLocalReports(allReports);
  }, [allReports]);

  const duplicates = useMemo(() => {
    const groups = {};
    localReports.forEach(r => {
      const key = `${r.created_by}__${r.mes_referencia}__${r.ano}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(r);
    });
    return Object.values(groups).filter(g => g.length > 1);
  }, [localReports]);

  function handleDeleted(deletedId) {
    setLocalReports(prev => prev.filter(r => r.id !== deletedId));
    queryClient.invalidateQueries({ queryKey: ['all-reports'] });
    queryClient.invalidateQueries({ queryKey: ['my-reports'] });
  }

  function handleUpdated(updatedReport) {
    setLocalReports(prev => prev.map(r => r.id === updatedReport.id ? updatedReport : r));
    queryClient.invalidateQueries({ queryKey: ['all-reports'] });
    queryClient.invalidateQueries({ queryKey: ['my-reports'] });
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="w-5 h-5 text-orange-500" />
            Relatórios Duplicados
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12 gap-2 text-gray-500">
            <Loader2 className="w-5 h-5 animate-spin" />
            Analisando relatórios...
          </div>
        ) : duplicates.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-green-400" />
            <p className="font-medium">Nenhum duplicado encontrado</p>
            <p className="text-sm mt-1 text-gray-400">Todos os relatórios parecem únicos por autor e período.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {duplicates.length} grupo{duplicates.length > 1 ? 's' : ''} com relatórios duplicados.
              Edite ou exclua os que não são necessários.
            </p>

            {duplicates.map((group, idx) => (
              <div key={idx} className="border border-orange-200 rounded-xl overflow-hidden">
                <div className="bg-orange-50 px-4 py-2 text-xs font-semibold text-orange-800">
                  {group[0].author_name || group[0].created_by} — {group[0].mes_referencia} {group[0].ano}
                  <span className="ml-2 font-normal text-orange-600">({group.length} relatórios)</span>
                </div>
                <div className="divide-y divide-gray-100 p-3 space-y-2">
                  {group.map(r => (
                    <ReportRow
                      key={r.id}
                      report={r}
                      onDeleted={handleDeleted}
                      onUpdated={handleUpdated}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}