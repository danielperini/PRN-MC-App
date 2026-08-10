import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { CheckCircle2, XCircle, Clock, CalendarClock, Play, Loader2 } from 'lucide-react';

const AUTOMACOES = [
  { nome: 'Auditoria 360° Diária', funcao: 'auditoria360Diaria', horario: '03h00 — diário', backupType: 'auditoria_entrada_unica' },
  { nome: 'Corrigir & Sincronizar Metas + Rubricas', funcao: 'corrigirMetasDashboardSalaEspera', horario: '03h30 — diário' },
  { nome: 'Corrigir Datas de Emissão NFs', funcao: 'corrigirDataEmissaoNFsDrive', horario: '06h00 — diário' },
  { nome: 'Sala de Espera — Pipeline', funcao: 'processarSalaDeEspera', horario: '06h00 — diário' },
  { nome: 'Sincronização Diária NFs Drive', funcao: 'normalizarPastasDriveNFs', horario: '05h00 — diário' },
  { nome: 'Sync Drive NFs Histórico', funcao: 'syncDriveNotasFiscaisDesdeMarco2026', horario: '09h00 — diário' },
  { nome: 'Sync Drive Contratos', funcao: 'sincronizarContratosCompleto', horario: '07h40 — diário' },
  { nome: 'Sync Drive Documentos Admin', funcao: 'sincronizarDocumentosDrive', horario: '08h00 — diário' },
  { nome: 'Conciliar e Enviar NFs', funcao: 'conciliarEEnviarNFsPipeline', horario: '23h00 — diário' },
  { nome: 'Backup NFs Sem Backup', funcao: 'backupDiarioNFsDrive', horario: 'a cada 4h', manual: true, backupType: 'drive_folders' },
  { nome: 'Backup de Relatórios Aprovados', funcao: 'backupRelatoriosAprovadosDrive', horario: 'conforme aprovação', manual: true, backupType: 'reports' },
  { nome: 'Organizar NFs com IA', funcao: 'organizarNFsComIA', horario: '04h00 — domingo' },
  { nome: 'Higienização Entrada Única', funcao: 'higienizarEntradaUnicaNFs', horario: '04h30 — domingo' },
];

function statusFor(log) {
  if (!log) return { icon: Clock, label: 'Agendada', tone: 'text-gray-400' };
  const s = String(log.status || '').toLowerCase();
  if (['success', 'concluido', 'concluído'].includes(s)) return { icon: CheckCircle2, label: 'Concluída', tone: 'text-emerald-600' };
  if (['failure', 'erro', 'erro_ia', 'sem_autor'].includes(s)) return { icon: XCircle, label: 'Falhou', tone: 'text-rose-600' };
  if (s === 'em_processamento') return { icon: Clock, label: 'Em execução', tone: 'text-amber-600' };
  return { icon: Clock, label: 'Agendada', tone: 'text-gray-400' };
}

function formatDate(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function extractCount(res) {
  if (!res || typeof res !== 'object') return null;
  return res.files_copied ?? res.total_files ?? res.totalCopied ?? res.copied ?? null;
}

export default function AutomacoesManutencaoCard() {
  const queryClient = useQueryClient();
  const [loadingMap, setLoadingMap] = useState({});
  const { data: logs = [] } = useQuery({
    queryKey: ['automacoes-backup-logs'],
    queryFn: () => base44.entities.BackupLog.list('-processed_at', 50),
    staleTime: 1000 * 60 * 2,
    refetchOnWindowFocus: false,
  });

  const latestByType = {};
  (logs || []).forEach((l) => {
    if (l?.backup_type && !latestByType[l.backup_type]) latestByType[l.backup_type] = l;
  });

  const runManual = async (a) => {
    setLoadingMap((m) => ({ ...m, [a.funcao]: true }));
    try {
      const res = await base44.functions.invoke(a.funcao, {});
      const count = extractCount(res);
      const label = a.funcao === 'backupDiarioNFsDrive' ? 'NFs' : 'Relatórios';
      const msg = count != null
        ? `${count} ${label.toLowerCase()} enviados ao Drive`
        : `${label} sincronizados com sucesso`;
      toast.success(msg);
      await queryClient.invalidateQueries({ queryKey: ['automacoes-backup-logs'] });
    } catch (err) {
      console.error(`[AutomacoesManutencaoCard] erro ao executar ${a.funcao}:`, err);
      toast.error(`Falha ao executar backup: ${err?.message || 'erro inesperado'}`);
    } finally {
      setLoadingMap((m) => ({ ...m, [a.funcao]: false }));
    }
  };

  return (
    <div className="border border-gray-200 bg-gray-50 rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-1">
        <CalendarClock className="w-5 h-5 text-gray-600" />
        <h2 className="text-lg font-semibold text-gray-800">Automações de manutenção</h2>
      </div>
      <p className="text-sm text-gray-500 mb-4 max-w-2xl">
        Os backups de NFs e Relatórios podem ser executados manualmente abaixo. As demais rotinas rodam automaticamente em horários de baixo uso.
      </p>
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="text-left font-medium px-4 py-2.5">Automação</th>
              <th className="text-left font-medium px-4 py-2.5 hidden sm:table-cell">Função</th>
              <th className="text-left font-medium px-4 py-2.5">Horário (BRT)</th>
              <th className="text-left font-medium px-4 py-2.5">Último status</th>
              <th className="text-left font-medium px-4 py-2.5 hidden md:table-cell">Última execução</th>
              <th className="text-right font-medium px-4 py-2.5">Ação</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {AUTOMACOES.map((a) => {
              const log = a.backupType ? latestByType[a.backupType] : null;
              const st = statusFor(log);
              const Icon = st.icon;
              const loading = !!loadingMap[a.funcao];
              return (
                <tr key={a.funcao} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">{a.nome}</td>
                  <td className="px-4 py-2.5 hidden sm:table-cell text-gray-500 font-mono text-xs">{a.funcao}</td>
                  <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{a.horario}</td>
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center gap-1.5 ${st.tone}`}>
                      <Icon className="w-3.5 h-3.5" />
                      {st.label}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 hidden md:table-cell text-gray-500 whitespace-nowrap">
                    {log?.processed_at ? formatDate(log.processed_at) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {a.manual ? (
                      <button
                        type="button"
                        disabled={loading}
                        onClick={() => runManual(a)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-gray-300 text-gray-700 text-xs font-medium hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {loading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Play className="w-3.5 h-3.5" />
                        )}
                        {loading ? 'Executando...' : 'Executar agora'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}