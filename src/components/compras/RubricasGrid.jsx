import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  AlertCircle,
  AlertTriangle,
  Search,
  Plus,
  Pencil,
  Trash2,
  RefreshCw
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import RubricaFormDialog from './RubricaFormDialog';
import { toast } from 'sonner';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeString(value) {
  return String(value || '').trim().toLowerCase();
}

export default function RubricasGrid({
  rubricas = [],
  onSelectRubrica,
  onRefresh,
  isCoordenador
}) {
  const [showForm, setShowForm] = useState(false);
  const [editingRubrica, setEditingRubrica] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroGrupo, setFiltroGrupo] = useState('all');
  const [filtroStatus, setFiltroStatus] = useState('all');

  const grupos = useMemo(() => {
    return [...new Set((rubricas || []).map(r => r?.grupo).filter(Boolean))].sort();
  }, [rubricas]);

  const filtradas = useMemo(() => {
    return (rubricas || []).filter(r => {
      const nomeRubrica = normalizeString(r?.rubrica || r?.nome || '');
      const searchTerm = normalizeString(search);

      const matchSearch = !searchTerm || nomeRubrica.includes(searchTerm);
      const matchGrupo = filtroGrupo === 'all' || r?.grupo === filtroGrupo;

      const percentual = toNumber(r?.percentual_utilizado);

      let matchStatus = true;
      if (filtroStatus !== 'all') {
        if (filtroStatus === 'sem_uso') matchStatus = percentual === 0;
        if (filtroStatus === 'em_uso') matchStatus = percentual > 0 && percentual < 80;
        if (filtroStatus === 'acima_80') matchStatus = percentual >= 80 && percentual < 100;
        if (filtroStatus === 'excedida') matchStatus = percentual >= 100;
      }

      return matchSearch && matchGrupo && matchStatus;
    });
  }, [rubricas, search, filtroGrupo, filtroStatus]);

  const totais = useMemo(() => {
    const totalRubricas = (rubricas || []).length;

    const totalPrevisto = (rubricas || []).reduce(
      (sum, r) => sum + toNumber(r?.valor_rubrica),
      0
    );

    const totalUtilizado = (rubricas || []).reduce(
      (sum, r) => sum + toNumber(r?.valor_utilizado),
      0
    );

    const saldoTotal = (rubricas || []).reduce(
      (sum, r) => sum + toNumber(r?.saldo),
      0
    );

    return {
      total_rubricas: totalRubricas,
      total_previsto: totalPrevisto,
      total_utilizado: totalUtilizado,
      saldo_total: saldoTotal
    };
  }, [rubricas]);

  const percentualGeral =
    totais.total_previsto > 0
      ? Math.round((totais.total_utilizado / totais.total_previsto) * 100)
      : 0;

  const getStatusColor = (percentual) => {
    const p = toNumber(percentual);
    if (p >= 100) return 'bg-red-50 border-red-200';
    if (p >= 80) return 'bg-yellow-50 border-yellow-200';
    return 'bg-white';
  };

  const getStatusIcon = (percentual) => {
    const p = toNumber(percentual);
    if (p >= 100) return <AlertCircle className="w-4 h-4 text-red-600" />;
    if (p >= 80) return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
    return null;
  };

  const handleSaveAlteracoes = async () => {
    setRefreshing(true);
    try {
      await onRefresh?.();
      toast.success('Dados atualizados! Totais recalculados.');
    } catch (e) {
      toast.error('Erro ao atualizar: ' + (e?.message || 'tente novamente'));
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async (rubrica) => {
    if (!window.confirm(`Deletar rubrica "${rubrica.rubrica}"? Esta ação não pode ser desfeita.`)) {
      return;
    }

    setDeletingId(rubrica.id);

    try {
      await base44.entities.Rubrica.delete(rubrica.id);
      toast.success(`Rubrica "${rubrica.rubrica}" deletada.`);
      await onRefresh?.();
    } catch (e) {
      toast.error('Erro ao deletar rubrica: ' + (e?.message || 'tente novamente'));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <div className="space-y-6">
        {isCoordenador && (
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={handleSaveAlteracoes}
              disabled={refreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Atualizando...' : 'Salvar alterações'}
            </Button>

            <Button
              className="bg-black text-white"
              onClick={() => {
                setEditingRubrica(null);
                setShowForm(true);
              }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Nova Rubrica
            </Button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
          <div className="border border-gray-200 rounded-lg p-4 bg-blue-50">
            <span className="text-xs text-gray-600 font-semibold">Total de Rubricas</span>
            <p className="text-2xl font-bold text-blue-700 mt-2">
              {totais.total_rubricas}
            </p>
          </div>

          <div className="border border-gray-200 rounded-lg p-4">
            <span className="text-xs text-gray-600 font-semibold">Total Previsto</span>
            <p className="text-lg font-bold text-black mt-2">
              R$ {totais.total_previsto.toLocaleString('pt-BR', {
                maximumFractionDigits: 0
              })}
            </p>
          </div>

          <div className="border border-orange-200 rounded-lg p-4 bg-orange-50">
            <span className="text-xs text-gray-600 font-semibold">Total Utilizado</span>
            <p className="text-lg font-bold text-orange-700 mt-2">
              R$ {totais.total_utilizado.toLocaleString('pt-BR', {
                maximumFractionDigits: 0
              })}
            </p>
          </div>

          <div className="border border-green-200 rounded-lg p-4 bg-green-50">
            <span className="text-xs text-gray-600 font-semibold">Saldo Total</span>
            <p className="text-lg font-bold text-green-700 mt-2">
              R$ {totais.saldo_total.toLocaleString('pt-BR', {
                maximumFractionDigits: 0
              })}
            </p>
          </div>

          <div className="border border-purple-200 rounded-lg p-4 bg-purple-50">
            <span className="text-xs text-gray-600 font-semibold">% Geral Utilizado</span>
            <p className="text-lg font-bold text-purple-700 mt-2">
              {percentualGeral}%
            </p>
          </div>
        </div>

        <div className="flex gap-4 flex-wrap">
          <div className="flex-1 min-w-48">
            <div className="relative">
              <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Buscar por nome..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          <Select value={filtroGrupo} onValueChange={setFiltroGrupo}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os grupos</SelectItem>
              {grupos.map(g => (
                <SelectItem key={g} value={g}>
                  {g}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="sem_uso">Sem uso (0%)</SelectItem>
              <SelectItem value="em_uso">Em uso (0% - 80%)</SelectItem>
              <SelectItem value="acima_80">Acima de 80%</SelectItem>
              <SelectItem value="excedida">Excedida (100%+)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-semibold text-black text-sm">Grupo</th>
                <th className="text-left py-3 px-4 font-semibold text-black text-sm">Rubrica</th>
                <th className="text-left py-3 px-4 font-semibold text-black text-sm">Nº Parcelas</th>
                <th className="text-right py-3 px-4 font-semibold text-black text-sm">Valor</th>
                <th className="text-right py-3 px-4 font-semibold text-black text-sm">Utilizado</th>
                <th className="text-right py-3 px-4 font-semibold text-black text-sm">Saldo</th>
                <th className="text-center py-3 px-4 font-semibold text-black text-sm">%</th>
                <th className="text-left py-3 px-4 font-semibold text-black text-sm">Ações</th>
              </tr>
            </thead>

            <tbody>
              {filtradas.map(rubrica => {
                const valorRubrica = toNumber(rubrica?.valor_rubrica);
                const valorUtilizado = toNumber(rubrica?.valor_utilizado);
                const saldo = toNumber(rubrica?.saldo);
                const percentual = toNumber(rubrica?.percentual_utilizado);

                return (
                  <tr
                    key={rubrica.id}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition ${getStatusColor(percentual)}`}
                  >
                    <td className="py-3 px-4 text-sm text-gray-600">
                      {rubrica.grupo}
                    </td>

                    <td className="py-3 px-4 text-sm font-semibold text-black">
                      {rubrica.rubrica}
                      {rubrica.ativo === false && (
                        <span className="ml-2 text-xs text-red-600">(inativa)</span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-sm text-gray-600">
                      {rubrica.numero_parcelas_unidades}
                    </td>

                    <td className="py-3 px-4 text-sm text-right font-semibold">
                      R$ {valorRubrica.toLocaleString('pt-BR')}
                    </td>

                    <td className="py-3 px-4 text-sm text-right text-blue-600 font-semibold">
                      R$ {valorUtilizado.toLocaleString('pt-BR')}
                    </td>

                    <td className="py-3 px-4 text-sm text-right font-semibold">
                      R$ {saldo.toLocaleString('pt-BR')}
                    </td>

                    <td className="py-3 px-4 text-sm text-center font-semibold">
                      <div className="flex items-center justify-center gap-1">
                        {getStatusIcon(percentual)}
                        {percentual.toFixed(2)}%
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs"
                          onClick={() => onSelectRubrica?.(rubrica)}
                        >
                          Detalhe
                        </Button>

                        {isCoordenador && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditingRubrica(rubrica);
                                setShowForm(true);
                              }}
                            >
                              <Pencil className="w-3 h-3" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-700"
                              onClick={() => handleDelete(rubrica)}
                              disabled={deletingId === rubrica.id}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && (
        <RubricaFormDialog
          rubrica={editingRubrica}
          onClose={() => {
            setShowForm(false);
            setEditingRubrica(null);
          }}
          onSuccess={async () => {
            setShowForm(false);
            setEditingRubrica(null);
            await onRefresh?.();
          }}
        />
      )}
    </>
  );
}