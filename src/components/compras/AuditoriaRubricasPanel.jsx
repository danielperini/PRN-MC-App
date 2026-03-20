import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Building2,
  Link2Off,
  FileWarning,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

function normalizeList(value) {
  return Array.isArray(value) ? value : [];
}

function getAllIssues(auditoria) {
  if (!auditoria) return [];

  const inconsistencias = auditoria?.inconsistencias || {};

  const pagasNaoVinculadas = normalizeList(
    inconsistencias?.compras_pagas_nao_vinculadas
  ).map((item) => ({
    ...item,
    tipo: 'compra_paga_sem_vinculo',
    titulo_tipo: 'Compra paga sem vínculo de rubrica',
    severidade: 'alta',
  }));

  const inconsistentesMuseu = normalizeList(
    inconsistencias?.compras_inconsistentes_museu
  ).map((item) => ({
    ...item,
    tipo: 'compra_inconsistente_museu',
    titulo_tipo: 'Compra incompatível com centro de custo',
    severidade: 'alta',
  }));

  return [...pagasNaoVinculadas, ...inconsistentesMuseu];
}

function resumoIssues(issues) {
  return {
    total: issues.length,
    altas: issues.filter((i) => i.severidade === 'alta').length,
    semCentro: issues.filter(
      (i) =>
        !i?.centro_custo ||
        String(i.centro_custo).trim() === ''
    ).length,
    semRubrica: issues.filter(
      (i) =>
        !i?.rubrica_id &&
        !i?.budgetline_id
    ).length,
  };
}

export default function AuditoriaRubricasPanel({
  auditoria = null,
  onRefresh,
  isCoordenador = false,
}) {
  const [expanded, setExpanded] = useState(false);
  const [recalculando, setRecalculando] = useState(false);

  const issues = useMemo(() => getAllIssues(auditoria), [auditoria]);
  const resumo = useMemo(() => resumoIssues(issues), [issues]);

  async function handleRecalcular() {
    setRecalculando(true);
    try {
      const res = await base44.functions.invoke('recalculateAllRubricas', {
        trigger: 'manual_auditoria',
      });

      const payload = res?.data || res;

      if (!payload?.success) {
        throw new Error(payload?.error || 'Falha ao recalcular auditoria');
      }

      toast.success('Auditoria e rubricas recalculadas com sucesso.');
      await onRefresh?.();
    } catch (error) {
      toast.error(`Erro ao recalcular: ${error.message}`);
    } finally {
      setRecalculando(false);
    }
  }

  const semProblemas = issues.length === 0;

  return (
    <Card
      className={`rounded-2xl border ${
        semProblemas
          ? 'border-green-200 bg-green-50/40'
          : 'border-red-200 bg-red-50/30'
      }`}
    >
      <CardContent className="p-5 space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-3">
            <div
              className={`rounded-xl p-2 ${
                semProblemas ? 'bg-green-100' : 'bg-red-100'
              }`}
            >
              {semProblemas ? (
                <CheckCircle2 className="w-5 h-5 text-green-700" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-red-700" />
              )}
            </div>

            <div>
              <h3 className="text-base font-bold text-black">
                Auditoria de Rubricas e Centros de Custo
              </h3>
              <p className="text-sm text-gray-600 mt-1">
                {semProblemas
                  ? 'Nenhuma inconsistência crítica encontrada no vínculo entre compras, rubricas e museus.'
                  : 'Foram encontradas inconsistências que podem afetar o débito correto das rubricas por museu.'}
              </p>
            </div>
          </div>

          {isCoordenador && (
            <Button
              onClick={handleRecalcular}
              disabled={recalculando}
              className="bg-black hover:bg-gray-800 text-white"
            >
              <RefreshCw
                className={`w-4 h-4 mr-2 ${recalculando ? 'animate-spin' : ''}`}
              />
              Recalcular auditoria
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs text-gray-500">Total de alertas</p>
            <p className="text-2xl font-bold text-black mt-1">{resumo.total}</p>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs text-red-600">Alta severidade</p>
            <p className="text-2xl font-bold text-red-700 mt-1">{resumo.altas}</p>
          </div>

          <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-4">
            <p className="text-xs text-yellow-700">Sem centro de custo</p>
            <p className="text-2xl font-bold text-yellow-800 mt-1">{resumo.semCentro}</p>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <p className="text-xs text-blue-700">Sem rubrica/budget line</p>
            <p className="text-2xl font-bold text-blue-800 mt-1">{resumo.semRubrica}</p>
          </div>
        </div>

        {!semProblemas && (
          <div className="rounded-xl border border-red-200 bg-white p-4">
            <button
              type="button"
              className="w-full flex items-center justify-between text-left"
              onClick={() => setExpanded((v) => !v)}
            >
              <div>
                <p className="text-sm font-semibold text-black">
                  Ver inconsistências detalhadas
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Expanda para identificar compras com erro de centro de custo ou vínculo orçamentário.
                </p>
              </div>

              {expanded ? (
                <ChevronUp className="w-4 h-4 text-gray-500" />
              ) : (
                <ChevronDown className="w-4 h-4 text-gray-500" />
              )}
            </button>

            {expanded && (
              <div className="mt-4 space-y-3">
                {issues.map((issue, idx) => (
                  <div
                    key={`${issue.tipo}-${issue.purchase_id || idx}`}
                    className="rounded-xl border border-gray-200 bg-gray-50 p-4"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-black">
                          {issue.titulo_tipo}
                        </p>

                        <p className="text-sm text-gray-700">
                          {issue.titulo || issue.descricao_item || 'Compra sem título'}
                        </p>

                        <p className="text-xs text-gray-500">
                          ID compra: {issue.purchase_id || '—'}
                        </p>
                      </div>

                      <span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-bold text-red-700">
                        {issue.severidade}
                      </span>
                    </div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex items-center gap-2 text-gray-600 mb-1">
                          <Building2 className="w-3.5 h-3.5" />
                          <span className="font-medium">Centro de custo</span>
                        </div>
                        <p className="font-bold text-black">
                          {issue.centro_custo || 'Não informado'}
                        </p>
                      </div>

                      <div className="rounded-lg border border-gray-200 bg-white p-3">
                        <div className="flex items-center gap-2 text-gray-600 mb-1">
                          <Link2Off className="w-3.5 h-3.5" />
                          <span className="font-medium">Vínculo orçamentário</span>
                        </div>
                        <p className="font-bold text-black">
                          Rubrica: {issue.rubrica_id || '—'} | BudgetLine: {issue.budgetline_id || '—'}
                        </p>
                      </div>

                      <div className="rounded-lg border border-gray-200 bg-white p-3 md:col-span-2">
                        <div className="flex items-center gap-2 text-gray-600 mb-1">
                          <FileWarning className="w-3.5 h-3.5" />
                          <span className="font-medium">Motivo</span>
                        </div>
                        <p className="font-bold text-red-700">
                          {issue.motivo || 'Inconsistência não especificada'}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
