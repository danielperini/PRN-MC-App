import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';
import { buildAttendanceFolderPath } from '@/utils/presenca/attendanceBackup';

function getActivityTitle(item) {
  return item?.nome_acao || item?.titulo || item?.atividade || item?.nome || 'Atividade';
}

function getActivityMuseum(item) {
  return item?.museu || item?.centro_custo || 'Museus Centro';
}

export default function QuickClassForm({ activities = [], onCreated }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    nome_turma: '',
    activity_id: '',
    educador_responsavel: '',
    datas: '',
    horario: '',
    local: '',
    max_participantes: '',
    observacoes: '',
  });
  const setF = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const selectedActivity = activities.find((item) => String(item.id) === String(form.activity_id));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.nome_turma.trim()) {
      toast.error('Informe o nome da turma.');
      return;
    }
    if (!form.activity_id) {
      toast.error('Selecione a atividade vinculada.');
      return;
    }
    setSaving(true);
    try {
      const datas = form.datas
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean);
      const payload = {
        nome_turma: form.nome_turma.trim(),
        activity_id: form.activity_id,
        atividade_id: form.activity_id,
        atividade_nome: getActivityTitle(selectedActivity),
        museu: getActivityMuseum(selectedActivity),
        educador_responsavel: form.educador_responsavel || selectedActivity?.educador_responsavel || selectedActivity?.responsavel || '',
        datas,
        horario: form.horario,
        local: form.local || selectedActivity?.local || selectedActivity?.local_museu || '',
        max_participantes: Number(form.max_participantes) || 0,
        observacoes: form.observacoes,
        status: 'ABERTA',
        drive_root_folder_id: '1x5VMhvXXIWU-HiBd8B8k_i5B0WnGbp1b',
        drive_folder_path: buildAttendanceFolderPath({
          museu: getActivityMuseum(selectedActivity),
          atividade: getActivityTitle(selectedActivity),
          turma: form.nome_turma,
        }),
        created_at: new Date().toISOString(),
      };
      const created = await base44.entities.ActivityClass.create(payload);
      await base44.entities.AttendanceAuditLog?.create?.({
        action: 'ACTIVITY_CLASS_CREATED',
        entity_type: 'ActivityClass',
        entity_id: created?.id || '',
        class_id: created?.id || '',
        details: `Turma criada: ${payload.nome_turma}`,
        metadata: payload,
        created_at: new Date().toISOString(),
      }).catch(() => null);
      toast.success('Turma criada.');
      setForm({ nome_turma: '', activity_id: '', educador_responsavel: '', datas: '', horario: '', local: '', max_participantes: '', observacoes: '' });
      await onCreated?.(created || payload);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao criar turma.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
        <p className="font-semibold">Criar turma</p>
        <p className="text-xs">Use este formulário para abrir um grupo dentro de uma atividade já criada, com datas, horário, local e educador.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Nome da turma dentro da atividade *</Label>
          <Input value={form.nome_turma} onChange={(e) => setF('nome_turma', e.target.value)} disabled={saving} placeholder="Ex.: Turma A manhã" />
        </div>
        <div className="space-y-1">
          <Label>Atividade principal vinculada *</Label>
          <Select value={form.activity_id || '__none__'} onValueChange={(value) => setF('activity_id', value === '__none__' ? '' : value)} disabled={saving}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">Selecione a atividade</SelectItem>
              {activities.map((activity) => <SelectItem key={activity.id} value={String(activity.id)}>{getActivityTitle(activity)}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Educador responsável</Label>
          <Input value={form.educador_responsavel} onChange={(e) => setF('educador_responsavel', e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-1">
          <Label>Horário</Label>
          <Input value={form.horario} onChange={(e) => setF('horario', e.target.value)} disabled={saving} placeholder="Ex.: 14h às 17h" />
        </div>
        <div className="space-y-1">
          <Label>Local</Label>
          <Input value={form.local} onChange={(e) => setF('local', e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-1">
          <Label>Número máximo</Label>
          <Input type="number" min="0" value={form.max_participantes} onChange={(e) => setF('max_participantes', e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>Datas</Label>
          <Textarea value={form.datas} onChange={(e) => setF('datas', e.target.value)} disabled={saving} rows={2} className="resize-none" placeholder="Uma data por linha, ou separadas por vírgula" />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>Observações</Label>
          <Textarea value={form.observacoes} onChange={(e) => setF('observacoes', e.target.value)} disabled={saving} rows={2} className="resize-none" />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        Criar turma
      </Button>
    </form>
  );
}
