import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Search,
  RefreshCw,
  Pencil,
  Trash2,
  Save,
  X,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function moeda(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function normalizarTexto(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizarGrupo(value) {
  const texto = normalizarTexto(value);

  const mapa = {
    'manutencao e operacao': 'Manutenção e Operação',
    'mostras e exposicoes': 'Mostras e Exposições',
    'acoes educativas e culturais': 'Ações Educativas e Culturais',
    'publicacoes mhab': 'Publicações MHAB',
    'despesas gerais': 'Despesas Gerais',
    'diarias': 'Diárias',
    'equipe principal': 'Equipe Principal',
    'educativo': 'Educativo',
    'atividades educativas': 'Atividades Educativas',
    'consultorias': 'Consultorias',
    'exposicao mumo': 'Exposição MUMO',
    'noturno nos museus 2026': 'Noturno nos Museus 2026',
    'alimentacao, material e acoes': 'Alimentação, Material e Ações',
    'diarias e publicacoes': 'Diárias e Publicações',
    'diarias e deslocamentos': 'Diárias e Deslocamentos',
  };

  return mapa[texto] || String(value || 'Sem grupo').trim() || 'Sem grupo';
}

export default function RubricasGrid({
  rubricas = [],
  onSelectRubrica,
  onRefresh,
  isCoordenador = false,
}) {
  const [searchTerm, setSearchTerm] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [savingId, setSavingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [recalculando, setRecalculando] = useState(false);

  const [editForm, setEditForm] = useState({
    grupo: '',
    rubrica: '',
    numero_parcelas: '',
    valor_rubrica: '',
    valor_utilizado: '',
    ativo: true,
  });

  const rubricasNormalizadas = useMemo(() => {
    return (rubricas || [])
      .filter(Boolean)
      .map((r, index) => {
        const valorRubrica = toNumber(r?.valor_rubrica);
        const valorUtilizado = toNumber(r?.valor_utilizado);
        const saldo =
          r?.saldo !== undefined && r?.saldo !== null
            ? toNumber(r?.saldo)
            : valorRubrica - valorUtilizado;

        return {
          id: r?.id || `rubrica-${index}`,
          grupo: normalizarGrupo(r?.grupo || 'Sem grupo'),
          grupoOriginal: r?.grupo || 'Sem grupo',
          rubrica: r?.rubrica || 'Sem nome',
          numero_parcelas: r?.numero_parcelas || r?.parcelas || '',
          valor_rubrica: valorRubrica,
          valor_utilizado: valorUtilizado,
          saldo,
          percentual_utilizado:
            valorRubrica > 0 ? (valorUtilizado / valorRubrica) * 100 : 0,
          ativo: r?.ativo !== false,
          raw: r,
        };
      });
  }, [rubricas]);

  const grupos = useMemo(() => {
    const unicos = new Set(rubricasNormalizadas.map((r) => r.grupo));
    return Array.from(unicos).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [rubricasNormalizadas]);

  const filtradas = useMemo(() => {
    return rubricasNormalizadas.filter((r) => {
      const matchGrupo = groupFilter === 'all' || r.grupo === groupFilter;
      const busca = normalizarTexto(searchTerm);
      const texto = normalizarTexto(
        `${r.grupo} ${r.rubrica} ${r.numero_parcelas}`
      );
      const matchBusca = !busca || texto.includes(busca);
      return matchGrupo && matchBusca;
    });
  }, [rubricasNormalizadas, groupFilter, searchTerm]);

  const resumo = useMemo(() => {
    const totalRubricas = rubricasNormalizadas.filter((r) => r.ativo).length;
    const totalPrevisto = rubricasNormalizadas.reduce(
      (sum, r) => sum + toNumber(r.valor_rubrica),
      0
    );
    const totalUtilizado = rubricasNormalizadas.reduce(
      (sum, r) => sum + toNumber(r.valor_utilizado),
      0
    );
    const saldoTotal = rubricasNormalizadas.reduce(
      (sum, r) => sum + toNumber(r.saldo),
      0
    );
    const percentualGeral =
      totalPrevisto > 0 ? (totalUtilizado / totalPrevisto) * 100 : 0;

    return {
      totalRubricas,
      totalPrevisto,
      totalUtilizado,
      saldoTotal,
      percentualGeral,
    };
  }, [rubricasNormalizadas]);

  function iniciarEdicao(rubrica) {
    setEditingId(rubrica.id);
    setEditForm({
      grupo: rubrica.raw?.grupo || rubrica.grupo || '',
      rubrica: rubrica.raw?.rubrica || rubrica.rubrica || '',
      numero_parcelas:
        rubrica.raw?.numero_parcelas || rubrica.raw?.parcelas || '',
      valor_rubrica: String(toNumber(rubrica.raw?.valor_rubrica)),
      valor_utilizado: String(toNumber(rubrica.raw?.valor_utilizado)),
      ativo: rubrica.raw?.ativo !== false,
    });
  }

  function cancelarEdicao() {
    setEditingId(null);
    setSavingId(null);
    setEditForm({
      grupo: '',
      rubrica: '',
      numero_parcelas: '',
      valor_rubrica: '',
      valor_utilizado: '',
      ativo: true,
    });
  }

  async function salvarEdicao(id) {
    setSavingId(id);
    try {
      const valorRubrica = toNumber(editForm.valor_rubrica);
      const valorUtilizado = toNumber(editForm.valor_utilizado);
      const saldo = valorRubrica - valorUtilizado;
      const percentualUtilizado =
        valorRubrica > 0 ? (valorUtilizado / valorRubrica) * 100 : 0;

      await base44.entities.Rubrica.update(id, {
        grupo: editForm.grupo,
        rubrica: editForm.rubrica,
        numero_parcelas: editForm.numero_parcelas,
        valor_rubrica: valorRubrica,
        valor_utilizado: valorUtilizado,
        saldo,
        percentual_utilizado: percentualUtilizado,
        ativo: editForm.ativo,
      });

      toast.success('Rubrica atualizada com sucesso');
      cancelarEdicao();
      await onRefresh?.();
    } catch (error) {
      toast.error(`Erro ao salvar: ${error.message}`);
    } finally {
      setSavingId(null);
    }
  }

  async function excluirRubrica(id, nome) {
    const ok = window.confirm(
      `Deseja excluir a rubrica "${nome}"?\n\nEssa ação não pode ser desfeita.`
    );
    if (!ok) return;

    setDeletingId(id);
    try {
      await base44.entities.Rubrica.delete(id);
      toast.success('Rubrica excluída com sucesso');
      await onRefresh?.();
    } catch (error) {
      toast.error(`Erro ao excluir: ${error.message}`);
    } finally {
      setDeletingId(null);
    }
  }

  async function recalcularRubricas() {
    setRecalculando(true);
    try {
      const res = await base44.functions.invoke('recalcularRubricas3Aditivo', {});
      const payload = res?.data || res;

      if (!payload?.success) {
        throw new Error(payload?.error || 'Falha ao recalcular rubricas');
      }

      toast.success('Rubricas recalculadas com sucesso');
      await onRefresh?.();
    } catch (error) {
      toast.error(`Erro ao recalcular: ${error.message}`);
    } finally {
      setRecalculando(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total de Rubricas</p>
          <p className="text-2xl font-bold text-black mt-1">{resumo.totalRubricas}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Previsto</p>
          <p className="text-xl font-bold text-black mt-1">
            R$ {moeda(resumo.totalPrevisto)}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Utilizado</p>
          <p className="text-xl font-bold text-blue-700 mt-1">
            R$ {moeda(resumo.totalUtilizado)}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Saldo Total</p>
          <p
            className={`text-xl font-bold mt-1 ${
              resumo.saldoTotal < 0 ? 'text-red-700' : 'text-green-700'
            }`}
          >
            R$ {moeda(resumo.saldoTotal)}
          </p>
        </div>

        <div className="rounded-2xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">% Geral Utilizado</p>
          <p className="text-2xl font-bold text-black mt-1">
            {resumo.percentualGeral.toFixed(1)}%
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="flex flex-col md:flex-row gap-3 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
            <Input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar rubrica..."
              className="pl-9"
            />
          </div>

          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-full md:w-72">
              <SelectValue placeholder="Filtrar por grupo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os grupos</SelectItem>
              {grupos.map((grupo) => (
                <SelectItem key={grupo} value={grupo}>
                  {grupo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {isCoordenador && (
          <Button
            onClick={recalcularRubricas}
            disabled={recalculando}
            className="bg-black hover:bg-gray-800 text-white"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${recalculando ? 'animate-spin' : ''}`} />
            Recalcular rubricas
          </Button>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full min-w-[1200px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Grupo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Rubrica</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Nº Parcelas</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Valor</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Utilizado</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">Saldo</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">%</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">Ações</th>
              </tr>
            </thead>

            <tbody>
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                    Nenhuma rubrica encontrada
                  </td>
                </tr>
              ) : (
                filtradas.map((rubrica) => {
                  const percentual = toNumber(rubrica.percentual_utilizado);
                  const saldoNegativo = toNumber(rubrica.saldo) < 0;
                  const emEdicao = editingId === rubrica.id;

                  return (
                    <tr
                      key={rubrica.id}
                      className={`border-b border-gray-100 align-top ${
                        saldoNegativo ? 'bg-red-50/40' : 'bg-white'
                      }`}
                    >
                      <td className="px-4 py-3">
                        {emEdicao ? (
                          <Input
                            value={editForm.grupo}
                            onChange={(e) =>
                              setEditForm((prev) => ({ ...prev, grupo: e.target.value }))
                            }
                          />
                        ) : (
                          <span className="text-gray-700">{rubrica.grupo}</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {emEdicao ? (
                          <Input
                            value={editForm.rubrica}
                            onChange={(e) =>
                              setEditForm((prev) => ({ ...prev, rubrica: e.target.value }))
                            }
                          />
                        ) : (
                          <span className="font-medium text-black">{rubrica.rubrica}</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        {emEdicao ? (
                          <Input
                            value={editForm.numero_parcelas}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                numero_parcelas: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          <span className="text-gray-700">{rubrica.numero_parcelas || '—'}</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {emEdicao ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={editForm.valor_rubrica}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                valor_rubrica: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          <span className="font-medium">R$ {moeda(rubrica.valor_rubrica)}</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {emEdicao ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={editForm.valor_utilizado}
                            onChange={(e) =>
                              setEditForm((prev) => ({
                                ...prev,
                                valor_utilizado: e.target.value,
                              }))
                            }
                          />
                        ) : (
                          <span className="text-blue-700 font-medium">
                            R$ {moeda(rubrica.valor_utilizado)}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right">
                        {emEdicao ? (
                          <span className="text-gray-500 text-xs">
                            saldo será recalculado ao salvar
                          </span>
                        ) : (
                          <span
                            className={`font-medium ${
                              rubrica.saldo < 0 ? 'text-red-700' : 'text-green-700'
                            }`}
                          >
                            R$ {moeda(rubrica.saldo)}
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-center">
                        {emEdicao ? (
                          <span className="text-gray-500 text-xs">auto</span>
                        ) : (
                          <span
                            className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${
                              percentual >= 80
                                ? 'bg-red-100 text-red-700'
                                : percentual >= 50
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-green-100 text-green-700'
                            }`}
                          >
                            {percentual.toFixed(2)}%
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-2">
                          {emEdicao ? (
                            <>
                              <Button
                                size="sm"
                                className="bg-black text-white hover:bg-gray-800"
                                onClick={() => salvarEdicao(rubrica.id)}
                                disabled={savingId === rubrica.id}
                              >
                                <Save className="w-4 h-4 mr-1" />
                                Salvar
                              </Button>

                              <Button
                                size="sm"
                                variant="outline"
                                onClick={cancelarEdicao}
                                disabled={savingId === rubrica.id}
                              >
                                <X className="w-4 h-4 mr-1" />
                                Cancelar
                              </Button>
                            </>
                          ) : (
                            <>
                              {onSelectRubrica && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => onSelectRubrica(rubrica.raw || rubrica)}
                                >
                                  <Eye className="w-4 h-4 mr-1" />
                                  Detalhe
                                </Button>
                              )}

                              {isCoordenador && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => iniciarEdicao(rubrica)}
                                  >
                                    <Pencil className="w-4 h-4 mr-1" />
                                    Editar
                                  </Button>

                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-red-600 border-red-200 hover:bg-red-50"
                                    onClick={() =>
                                      excluirRubrica(rubrica.id, rubrica.rubrica)
                                    }
                                    disabled={deletingId === rubrica.id}
                                  >
                                    <Trash2 className="w-4 h-4 mr-1" />
                                    Excluir
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}