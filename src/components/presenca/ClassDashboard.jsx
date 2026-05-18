import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FolderOpen, Printer, Users, CalendarDays, Percent } from 'lucide-react';
import { ATTENDANCE_DRIVE_ROOT_URL, buildAttendanceFileName } from '@/utils/presenca/attendanceBackup';

export default function ClassDashboard({
  turma,
  participants = [],
  attendanceRecords = [],
  onOpen,
  onPrint,
}) {
  const stats = useMemo(() => {
    if (!turma?.id) return { inscritos: 0, presencas: 0, datas: 0, frequencia: 0 };
    const classRecords = attendanceRecords.filter((record) => String(record.class_id || record.activity_class_id || '') === String(turma.id));
    const participantIds = new Set(classRecords.map((record) => record.participant_id).filter(Boolean));
    const dates = new Set(classRecords.map((record) => String(record.data || record.data_presenca || '').slice(0, 10)).filter(Boolean));
    const presencas = classRecords.filter((record) => String(record.status_presenca || record.status || 'presente').toLowerCase() === 'presente').length;
    const possible = Math.max(participantIds.size * dates.size, 1);
    return {
      inscritos: Math.max(participantIds.size, participants.length),
      presencas,
      datas: dates.size || (Array.isArray(turma.datas) ? turma.datas.length : 0),
      frequencia: Math.round((presencas / possible) * 100),
    };
  }, [turma, participants, attendanceRecords]);

  if (!turma) {
    return (
      <Card className="shadow-sm">
        <CardContent className="py-8 text-center text-sm text-slate-500">
          Selecione ou crie uma turma para abrir a gestão pedagógica.
        </CardContent>
      </Card>
    );
  }

  const fileName = buildAttendanceFileName({
    museu: turma.museu,
    atividade: turma.atividade_nome,
    turma: turma.nome_turma,
    data: new Date().toISOString().slice(0, 10),
  });

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>{turma.nome_turma}</CardTitle>
            <p className="mt-1 text-sm text-slate-500">{turma.atividade_nome}</p>
          </div>
          <Badge>{turma.status || 'ABERTA'}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3">
            <Users className="mb-2 h-4 w-4 text-slate-500" />
            <p className="text-2xl font-semibold">{stats.inscritos}</p>
            <p className="text-xs text-slate-500">participantes</p>
          </div>
          <div className="rounded-lg border p-3">
            <CalendarDays className="mb-2 h-4 w-4 text-slate-500" />
            <p className="text-2xl font-semibold">{stats.datas}</p>
            <p className="text-xs text-slate-500">datas</p>
          </div>
          <div className="rounded-lg border p-3">
            <Users className="mb-2 h-4 w-4 text-slate-500" />
            <p className="text-2xl font-semibold">{stats.presencas}</p>
            <p className="text-xs text-slate-500">presenças</p>
          </div>
          <div className="rounded-lg border p-3">
            <Percent className="mb-2 h-4 w-4 text-slate-500" />
            <p className="text-2xl font-semibold">{stats.frequencia}%</p>
            <p className="text-xs text-slate-500">frequência</p>
          </div>
        </div>

        <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <p><strong>Museu:</strong> {turma.museu || 'Museus Centro'}</p>
          {turma.educador_responsavel && <p><strong>Educador:</strong> {turma.educador_responsavel}</p>}
          {turma.horario && <p><strong>Horário:</strong> {turma.horario}</p>}
          {turma.local && <p><strong>Local:</strong> {turma.local}</p>}
          <p><strong>Arquivo padrão:</strong> {fileName}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={() => onOpen?.(turma)}>
            Abrir turma
          </Button>
          <Button type="button" variant="outline" onClick={() => onPrint?.(turma)}>
            <Printer className="mr-2 h-4 w-4" />
            Gerar PDF / imprimir
          </Button>
          <Button type="button" variant="outline" asChild>
            <a href={ATTENDANCE_DRIVE_ROOT_URL} target="_blank" rel="noreferrer">
              <FolderOpen className="mr-2 h-4 w-4" />
              Drive da turma
            </a>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
