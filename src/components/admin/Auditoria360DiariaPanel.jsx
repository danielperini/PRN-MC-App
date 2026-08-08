import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, RotateCw, ChevronDown, Cpu } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

function statusToBadge(status) {
  if (status === 'concluido') return { label: 'OK', className: 'bg-green-100 text-green-800 border-green-300' };
  if (status === 'em_processamento') return { label: 'Em processamento', className: 'bg-yellow-100 text-yellow-800 border-yellow-300' };
  if (status === 'erro') return { label: 'Erro', className: 'bg-red-100 text-red-800 border-red-300' };
  return { label: status || '—', className: 'bg-gray-100 text-gray-800 border-gray-300' };
}

function detalhesDoLog(log) {
  try {
    return typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
  } catch {
    return null;
  }
}

export default function Auditoria360DiariaPanel() {
  const queryClient = useQueryClient();
  const [executando, setExecutando] = useState(false);
  const [ultimoResultado, setUltimoResultado] = useState(null);
  const [logExpandido, setLogExpandido] = useState(false);

  const { data: logs = [] } = useQuery({
    queryKey: ['auditoria360-logs'],
    queryFn: () => base44.entities.BackupLog.filter({ backup_type: 'auditoria_entrada_unica' }),
  });

  const logsOrdenados = (logs || []).slice(0, 5);
  const ultimoLog = logsOrdenados.find((l) => l.status === 'concluido' || l.status === 'erro') || logsOrdenados[0] || null;
  const detalhes = ultimoLog ? detalhesDoLog(ultimoLog) : null;
  const badge = ultimoLog ? statusToBadge(ultimoLog.status) : null;

  const handleExecutar = async () => {
    setExecutando(true);
    setUltimoResultado(null);
    try {
      const res = await base44.functions.invoke('auditoria360Diaria', { triggeredBy: 'manual' });
      const data = res?.data || res;
      setUltimoResultado(data?.report || data);
      if (data?.ok) {
        const tot = data.report?.total_correcoes ?? 0;
        const enc = data.report?.total_encaminhamentos ?? 0;
        toast.success(`Auditoria concluída: ${tot} correções, ${enc} encaminhamentos à Sala de Espera.`);
        queryClient.invalidateQueries({ queryKey: ['auditoria360-logs'] });
      } else {
        toast.error('Falha na auditoria');
      }
    } catch (e) {
      toast.error(`Erro: ${e?.message || e}`);
    } finally {
      setExecutando(false);
    }
  };

  return (
    <div className="border-2 border-black rounded-xl p-6 bg-white">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2 text-black">
            <ShieldCheck className="w-5 h-5" />
            Auditoria 360° Diária
          </h2>
          <p className="text-sm text-gray-700 mt-1">
            Supervisão ativa automática (03h00 BRT) que percorre 6 superfícies — metas, totalizações financeiras,
            relatórios mensais, programações, atividades e contratos — aplicando correções determinísticas e
            encaminhando itens ambíguos ou inconsistentes à Sala de Espera.
          </p>
        </div>
        {badge && (
          <Badge className={`shrink-0 border ${badge.className}`}>{badge.label}</Badge>
        )}
      </div>

      <Button
        onClick={handleExecutar}
        disabled={executando}
        className="bg-black text-white hover:bg-gray-900 gap-2"
      >
        {executando ? (
          <>
            <RotateCw className="w-4 h-4 animate-spin" />
            Executando auditoria...
          </>
        ) : (
          <>
            <Cpu className="w-4 h-4" />
            Executar agora
          </>
        )}
      </Button>

      {(ultimoLog || ultimoResultado) && (
        <div className="mt-5">
          <button
            type="button"
            onClick={() => setLogExpandido((v) => !v)}
            className="flex items-center gap-1 text-xs font-medium text-gray-600 hover:text-black"
          >
            <ChevronDown className={`w-3 h-3 transition-transform ${logExpandido ? 'rotate-180' : ''}`} />
            Última execução
          </button>
          {logExpandido && (
            <div className="mt-2 p-4 border border-gray-200 rounded-lg bg-gray-50 text-sm">
              {ultimoResultado ? (
                <ResumoExecucao report={ultimoResultado} />
              ) : detalhes ? (
                <ResumoExecucao
                  report={{
                    fases: detalhes.fases,
                    total_correcoes: detalhes.total_correcoes,
                    total_encaminhamentos: detalhes.total_encaminhamentos,
                    has_more: detalhes.has_more,
                    started_at: ultimoLog?.processed_at,
                    triggered_by: ultimoLog?.triggered_by,
                  }}
                />
              ) : (
                <p className="text-gray-600">Sem detalhes disponíveis.</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResumoExecucao({ report }) {
  const f = report?.fases || {};
  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap gap-2 text-gray-500">
        {report?.started_at && <span>🕒 {new Date(report.started_at).toLocaleString('pt-BR')}</span>}
        {report?.triggered_by && <span>🎯 {report.triggered_by}</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <BlocoFase
          titulo="Fase 1 — Metas"
          linhas={[
            `Analisadas: ${f.metas?.analisadas ?? 0}`,
            `Corrigidas: ${f.metas?.corrigidas ?? 0}`,
            `Sem rubricas: ${f.metas?.sem_rubricas ?? 0}`,
            `Sala de Espera: ${f.metas?.encaminhadas_sala_espera ?? 0}`,
          ]}
        />
        <BlocoFase
          titulo="Fase 2 — Financeiro"
          linhas={[
            `Rubricas recalc.: ${f.financeiro?.rubricas_recalculadas ?? 0}`,
            `Sem rubrica c/ valor: ${f.financeiro?.sem_rubrica_com_valor ?? 0}`,
            `Duplicatas corrigidas: ${f.financeiro?.duplicatas_corrigidas ?? 0}`,
            `Sala de Espera: ${f.financeiro?.encaminhadas_sala_espera ?? 0}`,
          ]}
        />
        <BlocoFase
          titulo="Fase 3 — Relatórios"
          linhas={[
            `Analisados: ${f.relatorios?.analisados ?? 0}`,
            `Público corrigido: ${f.relatorios?.publico_corrigido ?? 0}`,
            `Metas sem código: ${f.relatorios?.metas_sem_codigo ?? 0}`,
            `Sem público geral: ${f.relatorios?.sem_publico_geral ?? 0}`,
            `Sem META: ${f.relatorios?.sem_meta_em_mes_obrigatorio ?? 0}`,
          ]}
        />
        <BlocoFase
          titulo="Fase 4 — Programações"
          linhas={[
            `Analisadas: ${f.programacoes?.analisadas ?? 0}`,
            `Corrigidas: ${f.programacoes?.corrigidas ?? 0}`,
            `Sem museu: ${f.programacoes?.sem_museu ?? 0}`,
            `Sem data: ${f.programacoes?.sem_data ?? 0}`,
            `Sem local: ${f.programacoes?.sem_local ?? 0}`,
            `Sala de Espera: ${f.programacoes?.encaminhadas_sala_espera ?? 0}`,
          ]}
        />
        <BlocoFase
          titulo="Fase 5 — Atividades"
          linhas={[
            `Analisadas: ${f.atividades?.analisadas ?? 0}`,
            `Público corrigido: ${f.atividades?.publico_corrigido ?? 0}`,
            `Sem classificação: ${f.atividades?.sem_classificacao ?? 0}`,
            `Meta código inválido: ${f.atividades?.meta_codigo_invalido ?? 0}`,
            `Sem programação vínc.: ${f.atividades?.sem_programacao_vinculada ?? 0}`,
            `Sala de Espera: ${f.atividades?.encaminhadas_sala_espera ?? 0}`,
          ]}
        />
        <BlocoFase
          titulo="Fase 6 — Contratos"
          linhas={[
            `Analisados: ${f.contratos?.analisados ?? 0}`,
            `Parcela recalculada: ${f.contratos?.valor_parcela_recalculado ?? 0}`,
            `Sem contrato: ${f.contratos?.sem_contrato ?? 0}`,
            `Vencido: ${f.contratos?.vencido ?? 0}`,
            `Encerrado+ativo: ${f.contratos?.encerrado_ativo ?? 0}`,
            `Sem fornecedor: ${f.contratos?.sem_fornecedor ?? 0}`,
            `Sala de Espera: ${f.contratos?.encaminhadas_sala_espera ?? 0}`,
          ]}
        />
      </div>
      <div className="flex flex-wrap gap-3 pt-1 font-semibold text-black">
        <span>✅ Correções: {report?.total_correcoes ?? 0}</span>
        <span>📤 Sala de Espera: {report?.total_encaminhamentos ?? 0}</span>
        {report?.has_more && <span className="text-amber-700">⚠ Há mais lotes — próxima execução continua.</span>}
      </div>
    </div>
  );
}

function BlocoFase({ titulo, linhas }) {
  return (
    <div className="p-2 border border-gray-200 rounded-md bg-white">
      <p className="font-semibold text-black mb-1">{titulo}</p>
      <ul className="space-y-0.5 text-gray-700">
        {linhas.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  );
}