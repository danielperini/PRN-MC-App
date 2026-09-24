import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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
import { calculateRubricaBalance, classifyRubricaBucket, isArchivedRubrica, isCreditRubrica } from '@/utils/finance/exceptionalRubricas';
import { CENTROS_CUSTO } from '@/lib/centroCustoRubrica';
import { classificarItemDespesaPBH } from '@/lib/classificadorDespesaPBH';
import ValorUtilizadoDialog from './ValorUtilizadoDialog';

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

async function logRubricaAudit(payload) {
  try {
    if (base44.entities.RubricaAuditLog?.create) {
      await base44.entities.RubricaAuditLog.create(payload);
      return;
    }
    await base44.entities.AuditLog?.create?.({
      action: payload.acao,
      entity_type: 'Rubrica',
      entity_id: payload.rubrica_id,
      details: payload.justificativa || payload.acao,
      metadata: payload,
    });
  } catch (error) {
    console.warn('Auditoria de rubrica não registrada:', error);
  }
}

export default function RubricasGrid({
  rubricas = [],
  purchases = [],
  onSelectRubrica,
  onRefresh,
  isCoordenador = false,
  totalPrevisto = 1320000,
}) {
  const [searchTerm,   setSearchTerm]   = useState('');
  const [groupFilter,  setGroupFilter]  = useState('all');
  const [typeFilter,   setTypeFilter]   = useState('ativas');
  const [editingId,    setEditingId]    = useState(null);
  const [savingId,     setSavingId]     = useState(null);
  const [deletingId,   setDeletingId]   = useState(null);
  const [recalculando, setRecalculando] = useState(false);
  const [conciliandoItens, setConciliandoItens] = useState(false);
  const [compositionRubrica, setCompositionRubrica] = useState(null);
  const { data: composition, isLoading: compositionLoading, isError: compositionError } = useQuery({
    queryKey: ['rubrica-composition'],
    queryFn: async () => {
      const response = await fetch('/api/finance/rubrica-composition', { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error(`Falha ao consultar composição (${response.status})`);
      return response.json();
    },
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
  });

  const [editForm, setEditForm] = useState({
    grupo: '',
    rubrica: '',
    numero_parcelas: '',
    valor_rubrica: '',
    centro_custo: 'Geral/Transversal',
    codigo_item_pbh: '',
    ativo: true,
  });

  const rubricasNormalizadas = useMemo(() => {
    return (rubricas || [])
      .filter(Boolean)
      .map((r, index) => {
        const valorRubrica = toNumber(composition?.rubricas?.[String(r?.id)]?.orcado ?? r?.valor_total ?? r?.valor_rubrica);
        const valorUtilizado = toNumber(composition?.rubricas?.[String(r?.id)]?.utilizado);
        const balance = calculateRubricaBalance({ ...r, valor_rubrica: valorRubrica, valor_total: valorRubrica, valor_utilizado: valorUtilizado });
        return {
          id:              r?.id || `rubrica-${index}`,
          grupo:           normalizarGrupo(r?.grupo || 'Sem grupo'),
          grupoOriginal:   r?.grupo || 'Sem grupo',
          rubrica:         r?.rubrica || 'Sem nome',
          numero_parcelas: r?.numero_parcelas || r?.parcelas || '',
          valor_rubrica:   valorRubrica,
          valor_utilizado: valorUtilizado,
          saldo:           balance.saldo,
          percentual:      balance.percentual,
          ativo:           r?.ativo !== false && !isArchivedRubrica(r),
          bucket:          classifyRubricaBucket(r),
          isCredit:        isCreditRubrica(r),
          semMeta:         !r?.meta && !r?.meta_id && !r?.meta_nome,
          classificacaoItem: r?.codigo_item_pbh ? {
            codigo_item_pbh: r.codigo_item_pbh,
            item_pbh: r.item_pbh,
            descricao_item_pbh: r.descricao_item_pbh,
            classificacao_item_origem: r.classificacao_item_origem,
          } : classificarItemDespesaPBH(r),
          raw:             r,
        };
      });
  }, [rubricas, composition]);

  const grupos = useMemo(() => {
    const unicos = new Set(rubricasNormalizadas.map((r) => r.grupo));
    return Array.from(unicos).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [rubricasNormalizadas]);

  const filtradas = useMemo(() => {
    return rubricasNormalizadas.filter((r) => {
      const matchGrupo = groupFilter === 'all' || r.grupo === groupFilter;
      const matchTipo =
        typeFilter === 'all' ||
        (typeFilter === 'ativas' && r.ativo) ||
        (typeFilter === 'arquivadas' && !r.ativo) ||
        (typeFilter === 'extraordinarias' && r.bucket === 'Rubricas Extraordinárias') ||
        (typeFilter === 'creditos' && r.bucket === 'Créditos do Projeto') ||
        (typeFilter === 'reposicoes' && r.bucket === 'Reposições Financeiras') ||
        (typeFilter === 'sem_meta' && r.semMeta);
      const busca = normalizarTexto(searchTerm);
      const texto = normalizarTexto(`${r.grupo} ${r.rubrica} ${r.numero_parcelas}`);
      return matchGrupo && matchTipo && (!busca || texto.includes(busca));
    });
  }, [rubricasNormalizadas, groupFilter, typeFilter, searchTerm]);

  const resumo = useMemo(() => {
    const ativas        = rubricasNormalizadas.filter((r) => r.ativo);
    const somaUtilizado = ativas.reduce((s, r) => s + r.valor_utilizado, 0);
    const creditos      = ativas.filter((r) => r.isCredit).reduce((s, r) => s + toNumber(r.raw?.valor_creditado || r.raw?.valor_reposto || r.valor_rubrica), 0);
    return {
      totalRubricas:   ativas.length,
      totalPrevisto:   totalPrevisto,
      totalUtilizado:  somaUtilizado,
      creditos,
      saldoTotal:      totalPrevisto + creditos - somaUtilizado,
      percentualGeral: totalPrevisto > 0 ? (somaUtilizado / totalPrevisto) * 100 : 0,
    };
  }, [rubricasNormalizadas, totalPrevisto]);

  function iniciarEdicao(rubrica) {
    setEditingId(rubrica.id);
    setEditForm({
      grupo:           rubrica.raw?.grupo           || rubrica.grupo   || '',
      rubrica:         rubrica.raw?.rubrica         || rubrica.rubrica || '',
      numero_parcelas: rubrica.raw?.numero_parcelas || rubrica.raw?.parcelas || '',
      valor_rubrica:   String(toNumber(rubrica.raw?.valor_rubrica)),
      centro_custo:    rubrica.raw?.centro_custo    || 'Geral/Transversal',
      codigo_item_pbh: rubrica.raw?.codigo_item_pbh || rubrica.classificacaoItem?.codigo_item_pbh || '',
      ativo:           rubrica.raw?.ativo !== false,
    });
  }

  function cancelarEdicao() {
    setEditingId(null);
    setSavingId(null);
    setEditForm({ grupo: '', rubrica: '', numero_parcelas: '', valor_rubrica: '', centro_custo: 'Geral/Transversal', codigo_item_pbh: '', ativo: true });
  }

  async function salvarEdicao(id) {
    setSavingId(id);
    try {
      const codigoItemPbh = editForm.codigo_item_pbh.trim() || null;
      await base44.entities.Rubrica.update(id, {
        grupo:           editForm.grupo,
        rubrica:         editForm.rubrica,
        numero_parcelas: editForm.numero_parcelas,
        valor_rubrica:   toNumber(editForm.valor_rubrica),
        valor_total:     toNumber(editForm.valor_rubrica),
        centro_custo:    editForm.centro_custo,
        codigo_item_pbh: codigoItemPbh,
        item_pbh: codigoItemPbh ? codigoItemPbh.split('.').pop() : null,
        classificacao_item_origem: codigoItemPbh ? 'MANUAL' : null,
        classificacao_item_confianca: codigoItemPbh ? 1 : 0,
        classificacao_item_em: codigoItemPbh ? new Date().toISOString() : null,
        ativo:           editForm.ativo,
        data_ultima_alteracao: new Date().toISOString(),
      });
      await logRubricaAudit({
        rubrica_id: id,
        acao: 'RUBRICA_EDITADA_INLINE',
        data: new Date().toISOString(),
        valor_total: toNumber(editForm.valor_rubrica),
        justificativa: 'Edição rápida na grade de rubricas',
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
    const ok = window.confirm(`Deseja arquivar a rubrica "${nome}"?\n\nRubricas com histórico serão preservadas para auditoria.`);
    if (!ok) return;
    setDeletingId(id);
    try {
      const temMovimento = purchases.some((p) => (p.rubrica_id || p.budgetline_id) === id) || toNumber(rubricas.find((r) => r.id === id)?.valor_utilizado) > 0;
      if (temMovimento) {
        await base44.entities.Rubrica.update(id, {
          ativo: false,
          status_rubrica: 'ARQUIVADA',
          arquivada_em: new Date().toISOString(),
        });
        await logRubricaAudit({ rubrica_id: id, acao: 'RUBRICA_ARQUIVADA', data: new Date().toISOString(), justificativa: 'Arquivamento lógico com movimentação preservada' });
        toast.success('Rubrica arquivada para preservar histórico');
      } else {
        await base44.entities.Rubrica.update(id, {
          ativo: false,
          status_rubrica: 'INATIVA',
          arquivada_em: new Date().toISOString(),
        });
        await logRubricaAudit({ rubrica_id: id, acao: 'RUBRICA_INATIVADA', data: new Date().toISOString(), justificativa: 'Exclusão lógica sem apagar histórico' });
        toast.success('Rubrica desativada');
      }
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
      const res     = await base44.functions.invoke('recalcularRubricas3Aditivo', {});
      const payload = res?.data || res;
      if (!payload?.success) throw new Error(payload?.error || 'Falha ao recalcular rubricas');
      toast.success('Rubricas recalculadas com sucesso');
      await onRefresh?.();
    } catch (error) {
      toast.error(`Erro ao recalcular: ${error.message}`);
    } finally {
      setRecalculando(false);
    }
  }

  async function conciliarItensPBH() {
    setConciliandoItens(true);
    try {
      const atualizacoes = (rubricas || [])
        .map((rubrica) => ({ rubrica, classificacao: classificarItemDespesaPBH(rubrica) }))
        // Nunca substitui um código que já foi salvo manualmente.
        .filter(({ rubrica, classificacao }) => classificacao && !rubrica.codigo_item_pbh);

      for (let i = 0; i < atualizacoes.length; i += 15) {
        await Promise.all(atualizacoes.slice(i, i + 15).map(({ rubrica, classificacao }) =>
          base44.entities.Rubrica.update(rubrica.id, {
            ...classificacao,
            classificacao_item_em: new Date().toISOString(),
          })
        ));
      }
      const pendentes = (rubricas || []).filter((rubrica) => !classificarItemDespesaPBH(rubrica) && !rubrica.codigo_item_pbh).length;
      toast.success(`${atualizacoes.length} código(s) PBH conciliado(s).${pendentes ? ` ${pendentes} aguardam classificação por IA.` : ''}`);
      await onRefresh?.();
    } catch (error) {
      toast.error(`Erro ao conciliar itens PBH: ${error.message}`);
    } finally {
      setConciliandoItens(false);
    }
  }

  function ProgressBar({ pct }) {
    const capped = Math.min(100, Math.max(0, pct));
    const cor    = pct > 100 ? '#b91c1c' : pct >= 80 ? '#b45309' : '#15803d';
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
        <div style={{ width: 48, height: 5, background: '#e5e7eb', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ width: `${capped}%`, height: '100%', background: cor, borderRadius: 99 }} />
        </div>
        <span style={{ fontSize: 12, fontWeight: 600, color: cor, minWidth: 40, textAlign: 'right' }}>
          {pct.toFixed(1)}%
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {compositionError && <p role="alert" className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">Não foi possível consultar as solicitações aprovadas. Valores de execução não serão exibidos até a conexão voltar.</p>}

      {/* Cards resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="rounded-2xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total de Rubricas</p>
          <p className="text-2xl font-bold text-black mt-1">{resumo.totalRubricas}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Previsto</p>
          <p className="mt-1 break-words text-lg font-bold leading-tight text-black tabular-nums">R$ {moeda(resumo.totalPrevisto)}</p>
          <p className="text-xs text-gray-400 mt-0.5">3º Termo Aditivo</p>
        </div>
        <div className="rounded-2xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total Utilizado</p>
          <p className="mt-1 break-words text-lg font-bold leading-tight text-blue-700 tabular-nums">{compositionLoading || compositionError ? '—' : `R$ ${moeda(resumo.totalUtilizado)}`}</p>
          <p className="text-xs text-gray-400 mt-0.5">Aprovado coord. + admin + pago</p>
        </div>
        <div className="rounded-2xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Saldo Disponível</p>
          <p className={`mt-1 break-words text-lg font-bold leading-tight tabular-nums ${resumo.saldoTotal < 0 ? 'text-red-700' : 'text-green-700'}`}>
            {compositionLoading || compositionError ? '—' : `R$ ${moeda(resumo.saldoTotal)}`}
          </p>
          {resumo.creditos > 0 && <p className="text-xs text-green-700 mt-0.5">Inclui créditos: R$ {moeda(resumo.creditos)}</p>}
        </div>
        <div className="rounded-2xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">% Utilizado</p>
          <p className="text-2xl font-bold text-black mt-1">{compositionLoading || compositionError ? '—' : `${resumo.percentualGeral.toFixed(1)}%`}</p>
          <div className="mt-2 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${resumo.percentualGeral >= 80 ? 'bg-red-500' : 'bg-green-500'}`}
              style={{ width: `${Math.min(resumo.percentualGeral, 100)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
        <div className="flex flex-col md:flex-row gap-3 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar rubrica..."
              className="flex h-9 w-full rounded-md border border-input bg-transparent pl-9 pr-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
          </div>
          <Select value={groupFilter} onValueChange={setGroupFilter}>
            <SelectTrigger className="w-full md:w-72">
              <SelectValue placeholder="Filtrar por grupo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os grupos</SelectItem>
              {grupos.map((grupo) => (
                <SelectItem key={grupo} value={grupo}>{grupo}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-full md:w-56">
              <SelectValue placeholder="Filtrar por tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ativas">Ativas</SelectItem>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="extraordinarias">Extraordinárias</SelectItem>
              <SelectItem value="creditos">Créditos</SelectItem>
              <SelectItem value="reposicoes">Reposições</SelectItem>
              <SelectItem value="sem_meta">Sem meta</SelectItem>
              <SelectItem value="arquivadas">Arquivadas/Inativas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isCoordenador && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={conciliarItensPBH}
              disabled={conciliandoItens}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${conciliandoItens ? 'animate-spin' : ''}`} />
              Conciliar itens PBH
            </Button>
            <Button
              onClick={recalcularRubricas}
              disabled={recalculando}
              className="bg-black hover:bg-gray-800 text-white"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${recalculando ? 'animate-spin' : ''}`} />
              Recalcular rubricas
            </Button>
          </div>
        )}
      </div>

      {/* Tabela */}
      <div className="rounded-2xl border border-gray-200 overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full min-w-[1050px] text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Grupo</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Rubrica</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Centro de Custo</th>
                <th className="text-center px-4 py-3 font-semibold text-gray-700">Nº Parcelas</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Item / conciliação</th>
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
                  <td colSpan={10} className="px-4 py-10 text-center text-gray-400">
                    Nenhuma rubrica encontrada
                  </td>
                </tr>
              ) : (
                filtradas.map((rubrica, i) => {
                  const saldoNeg = rubrica.saldo < 0;
                  const emEdicao = editingId === rubrica.id;
                  return (
                    <tr
                      key={rubrica.id}
                      className={`border-b border-gray-100 align-middle transition-colors hover:bg-gray-50/60 ${
                        saldoNeg ? 'bg-red-50/40' : i % 2 === 0 ? 'bg-white' : 'bg-gray-50/30'
                      }`}
                    >
                      <td className="px-4 py-2.5">
                        {emEdicao ? (
                          <Input value={editForm.grupo} onChange={(e) => setEditForm((f) => ({ ...f, grupo: e.target.value }))} />
                        ) : (
                          <span className="text-gray-600 text-xs">{rubrica.grupo}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {emEdicao ? (
                          <Input value={editForm.rubrica} onChange={(e) => setEditForm((f) => ({ ...f, rubrica: e.target.value }))} />
                        ) : (
                          <div>
                            <span className="font-medium text-black">{rubrica.rubrica}</span>
                            <p className="text-[11px] text-gray-500 mt-0.5">{rubrica.bucket}{rubrica.semMeta ? ' · sem meta' : ''}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {emEdicao ? (
                          <select
                            value={editForm.centro_custo}
                            onChange={(e) => setEditForm((f) => ({ ...f, centro_custo: e.target.value }))}
                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-black bg-white"
                          >
                            {CENTROS_CUSTO.map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                            {rubrica.raw?.centro_custo || '—'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {emEdicao ? (
                          <Input value={editForm.numero_parcelas} onChange={(e) => setEditForm((f) => ({ ...f, numero_parcelas: e.target.value }))} className="text-center" />
                        ) : (
                          <span className="text-gray-600">{rubrica.numero_parcelas || '—'}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {emEdicao ? (
                          <Input
                            value={editForm.codigo_item_pbh}
                            onChange={(e) => setEditForm((f) => ({ ...f, codigo_item_pbh: e.target.value }))}
                            placeholder="3.3.90.39.12"
                            className="min-w-36 font-mono text-xs"
                          />
                        ) : rubrica.classificacaoItem?.codigo_item_pbh ? (
                          <div>
                            <span title={rubrica.classificacaoItem.descricao_item_pbh || 'Classificação PBH'} className="inline-flex rounded bg-violet-100 px-2 py-0.5 font-mono text-xs text-violet-800">
                              {rubrica.classificacaoItem.codigo_item_pbh}
                            </span>
                            <p className="mt-0.5 max-w-48 text-[10px] leading-tight text-gray-500">{rubrica.classificacaoItem.descricao_item_pbh || 'Código manual'}</p>
                          </div>
                        ) : (
                          <span className="text-xs text-amber-600">Pendente de IA</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {emEdicao ? (
                          <Input type="number" step="0.01" value={editForm.valor_rubrica} onChange={(e) => setEditForm((f) => ({ ...f, valor_rubrica: e.target.value }))} className="text-right" />
                        ) : (
                          <span className="font-medium tabular-nums">R$ {moeda(rubrica.valor_rubrica)}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button type="button" onClick={() => setCompositionRubrica(rubrica)} disabled={compositionLoading || compositionError}
                          className="text-blue-700 font-medium tabular-nums underline underline-offset-2 hover:text-blue-900 disabled:text-gray-500"
                          aria-label={`Ver composição do valor utilizado da rubrica ${rubrica.rubrica}`}>
                          {compositionError ? 'Indisponível' : compositionLoading ? 'Carregando…' : `R$ ${moeda(rubrica.valor_utilizado)}`}
                        </button>
                        {!compositionLoading && !compositionError && rubrica.valor_utilizado === 0 && (
                          <p className="text-xs text-gray-400 mt-0.5">sem compras aprovadas</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-medium tabular-nums ${saldoNeg ? 'text-red-700' : 'text-green-700'}`}>
                          {compositionLoading || compositionError ? '—' : `R$ ${moeda(rubrica.saldo)}`}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        {compositionLoading || compositionError ? '—' : <ProgressBar pct={rubrica.percentual} />}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-center gap-1.5">
                          {emEdicao ? (
                            <>
                              <Button size="sm" className="bg-black text-white hover:bg-gray-800" onClick={() => salvarEdicao(rubrica.id)} disabled={savingId === rubrica.id}>
                                <Save className="w-3.5 h-3.5 mr-1" />Salvar
                              </Button>
                              <Button size="sm" variant="outline" onClick={cancelarEdicao} disabled={savingId === rubrica.id}>
                                <X className="w-3.5 h-3.5 mr-1" />Cancelar
                              </Button>
                            </>
                          ) : (
                            <>
                              {onSelectRubrica && (
                                <Button size="sm" variant="outline" onClick={() => onSelectRubrica(rubrica.raw || rubrica)}>
                                  <Eye className="w-3.5 h-3.5 mr-1" />Detalhe
                                </Button>
                              )}
                              {isCoordenador && (
                                <>
                                  <Button size="sm" variant="outline" onClick={() => iniciarEdicao(rubrica)}>
                                    <Pencil className="w-3.5 h-3.5 mr-1" />Editar
                                  </Button>
                                  <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50" onClick={() => excluirRubrica(rubrica.id, rubrica.rubrica)} disabled={deletingId === rubrica.id}>
                                    <Trash2 className="w-3.5 h-3.5 mr-1" />Excluir
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
            {filtradas.length > 0 && (
              <tfoot className="border-t-2 border-gray-300 bg-gray-50">
                <tr>
                  <td colSpan={5} className="px-4 py-3 font-semibold text-gray-700 text-sm">
                    TOTAL ({filtradas.length} rubrica{filtradas.length !== 1 ? 's' : ''})
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    R$ {moeda(filtradas.reduce((s, r) => s + r.valor_rubrica, 0))}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-blue-700">
                    {compositionLoading || compositionError ? '—' : `R$ ${moeda(filtradas.reduce((s, r) => s + r.valor_utilizado, 0))}`}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {(() => {
                      const s = filtradas.reduce((acc, r) => acc + r.saldo, 0);
                      return <span className={s < 0 ? 'text-red-700' : 'text-green-700'}>{compositionLoading || compositionError ? '—' : `R$ ${moeda(s)}`}</span>;
                    })()}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      {compositionRubrica && (
        <ValorUtilizadoDialog rubrica={compositionRubrica.raw || compositionRubrica}
          composition={composition?.rubricas?.[String(compositionRubrica.id)]}
          onClose={() => setCompositionRubrica(null)} />
      )}
    </div>
  );
}
