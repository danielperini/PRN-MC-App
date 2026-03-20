import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Trash2, Plus, Save, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const CATEGORIAS = {
  equipe: 'Equipe Principal',
  comunicacao: 'Comunicação',
  manutencao: 'Manutenção de Rotina',
  educador: 'Educador',
  diarias_educador: 'Diárias de Educador',
  lanches: 'Lanches',
  alimentacao_cartao: 'Alimentação Cartão',
  material: 'Material',
  acoes_educativas: 'Ações Educativas',
  som_luz: 'Som e Luz',
  exposicao: 'Exposição',
  noturno: 'Noturno nos Museus',
  publicacoes: 'Publicações',
  consultorias: 'Consultorias',
  despesas_gerais: 'Despesas Gerais',
  outros: 'Outros',
};

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmt(v) {
  return toNumber(v).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  });
}

function normalizeString(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeMuseu(value) {
  const raw = normalizeString(value);

  if (!raw) return '';

  if (raw === 'mis') return 'MIS';
  if (raw === 'mhab') return 'MHAB';
  if (raw === 'mumo') return 'MUMO';

  if (raw.includes('museu da imagem e do som')) return 'MIS';
  if (raw.includes('imagem e som')) return 'MIS';

  if (raw.includes('historico abilio barreto')) return 'MHAB';
  if (raw.includes('abilio barreto')) return 'MHAB';

  if (raw.includes('moda')) return 'MUMO';

  return String(value || '').trim().toUpperCase();
}

function getRubricaCentroCusto(rubrica) {
  return normalizeMuseu(
    rubrica?.centro_custo ||
      rubrica?.museu ||
      rubrica?.museu_codigo ||
      rubrica?.unidade ||
      ''
  );
}

function getRubricaNome(rubrica) {
  return String(rubrica?.rubrica || rubrica?.nome || 'Rubrica').replace(
    / - (MIS|MUMO|MHAB)$/i,
    ''
  );
}

function getPct(valorUtilizado, valorOrcado) {
  const orcado = toNumber(valorOrcado);
  const utilizado = toNumber(valorUtilizado);
  if (orcado <= 0) return 0;
  return Number(((utilizado / orcado) * 100).toFixed(1));
}

export default function CardRubricaEditor({ open, onClose }) {
  const queryClient = useQueryClient();

  const [tab, setTab] = useState('listar');
  const [saving, setSaving] = useState(false);
  const [editingRubrica, setEditingRubrica] = useState(null);
  const [editValues, setEditValues] = useState({});

  const [novoCard, setNovoCard] = useState({
    museu: 'MHAB',
    rubrica: '',
    grupo: '',
    categoria_key: 'manutencao',
    valor_rubrica: '',
    observacao_uso: '',
    ativo: true,
    publica: true,
  });

  const { data: rubricas = [], isLoading } = useQuery({
    queryKey: ['rubricas-all'],
    queryFn: async () => {
      const res = await base44.entities.Rubrica.list('ordem_exibicao', 500);
      return Array.isArray(res) ? res : [];
    },
    enabled: open,
  });

  const { data: configs = [] } = useQuery({
    queryKey: ['rubrica-museu-configs'],
    queryFn: async () => {
      const res = await base44.entities.RubricaMuseuConfig.list('', 1000);
      return Array.isArray(res) ? res : [];
    },
    enabled: open,
  });

  const { data: consolidado = {} } = useQuery({
    queryKey: ['rubricas-consolidadas', 'card-editor'],
    queryFn: async () => {
      const res = await base44.functions.invoke('getRubricasConsolidadas', {});
      return res?.data || {};
    },
    enabled: open,
    staleTime: 0,
    gcTime: 0,
  });

  const rubricaById = useMemo(() => {
    const map = {};
    for (const rubrica of rubricas) {
      if (rubrica?.id) map[rubrica.id] = rubrica;
    }
    return map;
  }, [rubricas]);

  const consolidadoByMuseuRubrica = useMemo(() => {
    const map = {};

    for (const museu of MUSEUS) {
      const categorias = consolidado?.por_museu?.[museu] || {};
      Object.values(categorias).forEach((items) => {
        if (!Array.isArray(items)) return;

        items.forEach((item) => {
          if (!item?.id) return;
          map[`${museu}__${item.id}`] = item;
        });
      });
    }

    return map;
  }, [consolidado]);

  const configsByRubrica = useMemo(() => {
    const map = {};
    for (const config of configs) {
      if (!config?.rubrica_id) continue;
      if (!map[config.rubrica_id]) map[config.rubrica_id] = [];
      map[config.rubrica_id].push(config);
    }
    return map;
  }, [configs]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      predicate: (q) => {
        const k = Array.isArray(q.queryKey)
          ? q.queryKey.join('|').toLowerCase()
          : String(q.queryKey || '').toLowerCase();

        return (
          k.includes('rubrica') ||
          k.includes('museu') ||
          k.includes('budget') ||
          k.includes('compra') ||
          k.includes('purchase')
        );
      },
    });
  };

  const recalculate = async (trigger) => {
    try {
      await base44.functions.invoke('recalculateAllRubricas', { trigger });
    } catch (e) {
      console.error('Erro ao recalcular rubricas:', e);
    }
  };

  const rubricasPorMuseu = useMemo(() => {
    const result = {};

    for (const museu of MUSEUS) {
      const configsMuseu = configs.filter((c) => normalizeMuseu(c?.museu) === museu);

      result[museu] = configsMuseu
        .map((config) => {
          const rubrica = rubricaById[config.rubrica_id];
          if (!rubrica) return null;

          const consolidadoItem =
            consolidadoByMuseuRubrica[`${museu}__${rubrica.id}`] || null;

          return {
            ...rubrica,
            config,
            consolidadoItem,
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const ga = String(a?.grupo || '').toLowerCase();
          const gb = String(b?.grupo || '').toLowerCase();
          if (ga !== gb) return ga.localeCompare(gb, 'pt-BR');

          return getRubricaNome(a).localeCompare(getRubricaNome(b), 'pt-BR');
        });
    }

    return result;
  }, [configs, rubricaById, consolidadoByMuseuRubrica]);

  const handleDelete = async (rubrica, config) => {
    if (
      !window.confirm(
        `Remover o vínculo da rubrica "${getRubricaNome(rubrica)}" do museu ${config?.museu}?`
      )
    ) {
      return;
    }

    setSaving(true);

    try {
      const totalConfigsDaRubrica = (configsByRubrica[rubrica.id] || []).length;

      await base44.entities.RubricaMuseuConfig.delete(config.id);

      if (totalConfigsDaRubrica <= 1) {
        await base44.entities.Rubrica.update(rubrica.id, {
          ativo: false,
        });
      }

      await recalculate('delete_card_rubrica_editor');
      await invalidate();

      toast.success(
        totalConfigsDaRubrica <= 1
          ? 'Rubrica desativada e vínculo removido'
          : 'Vínculo removido com sucesso'
      );
    } catch (e) {
      console.error(e);
      toast.error('Erro ao excluir: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const handleEditStart = (rubrica, config) => {
    setEditingRubrica(`${rubrica.id}__${config?.museu || ''}`);
    setEditValues({
      rubrica: rubrica.rubrica ?? '',
      grupo: rubrica.grupo ?? '',
      valor_rubrica: rubrica.valor_rubrica ?? '',
      observacao_uso: rubrica.observacao_uso ?? '',
      ativo: rubrica.ativo !== false,
      publica: rubrica.publica !== false,
      categoria_key: config?.categoria_key || 'outros',
    });
  };

  const handleEditSave = async (rubrica, config) => {
    setSaving(true);

    try {
      const valor_rubrica = parseFloat(editValues.valor_rubrica);
      if (isNaN(valor_rubrica) || valor_rubrica < 0) {
        toast.error('Valor orçado inválido');
        setSaving(false);
        return;
      }

      await base44.entities.Rubrica.update(rubrica.id, {
        rubrica: String(editValues.rubrica || '').trim(),
        grupo: String(editValues.grupo || '').trim(),
        valor_rubrica,
        observacao_uso: editValues.observacao_uso || '',
        ativo: !!editValues.ativo,
        publica: !!editValues.publica,
      });

      if (config?.id) {
        await base44.entities.RubricaMuseuConfig.update(config.id, {
          categoria_key: editValues.categoria_key || config?.categoria_key || 'outros',
          divisor: (configsByRubrica[rubrica.id] || []).length > 1
            ? (configsByRubrica[rubrica.id] || []).length
            : 1,
        });
      }

      await recalculate('update_card_rubrica_editor');
      await invalidate();

      toast.success('Rubrica atualizada');
      setEditingRubrica(null);
      setEditValues({});
    } catch (e) {
      console.error(e);
      toast.error('Erro ao salvar');
    } finally {
      setSaving(false);
    }
  };

  const handleCriarCard = async () => {
    if (!String(novoCard.rubrica || '').trim()) {
      toast.error('Informe o nome da rubrica');
      return;
    }

    const valorRubrica = parseFloat(novoCard.valor_rubrica);
    if (isNaN(valorRubrica) || valorRubrica < 0) {
      toast.error('Informe um valor orçado válido');
      return;
    }

    setSaving(true);

    try {
      const museu = normalizeMuseu(novoCard.museu);

      const novaRubrica = await base44.entities.Rubrica.create({
        rubrica: String(novoCard.rubrica || '').trim(),
        grupo: String(novoCard.grupo || '').trim() || novoCard.categoria_key,
        centro_custo: museu,
        valor_rubrica: valorRubrica,
        valor_utilizado: 0,
        saldo: valorRubrica,
        percentual_utilizado: 0,
        observacao_uso: novoCard.observacao_uso || '',
        ativo: !!novoCard.ativo,
        publica: !!novoCard.publica,
        ordem_exibicao: 99,
      });

      await base44.entities.RubricaMuseuConfig.create({
        rubrica_id: novaRubrica.id,
        museu,
        categoria_key: novoCard.categoria_key,
        divisor: 1,
      });

      await recalculate('create_card_rubrica_editor');
      await invalidate();

      toast.success('Card criado com sucesso');

      setNovoCard({
        museu: 'MHAB',
        rubrica: '',
        grupo: '',
        categoria_key: 'manutencao',
        valor_rubrica: '',
        observacao_uso: '',
        ativo: true,
        publica: true,
      });
      setTab('listar');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao criar: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setSaving(false);
    }
  };

  const renderFinanceiro = (rubrica, museu) => {
    const item = consolidadoByMuseuRubrica[`${museu}__${rubrica.id}`];

    const valorOrcado = item ? toNumber(item.totalOrcado) : toNumber(rubrica.valor_rubrica);
    const valorPago = item ? toNumber(item.valorPago) : 0;
    const valorComprometido = item ? toNumber(item.valorComprometido) : 0;
    const valorLancamentos = item ? toNumber(item.valorLancamentos) : toNumber(rubrica.valor_lancamentos);
    const valorUtilizado = item ? toNumber(item.valorUtilizado) : toNumber(rubrica.valor_utilizado);
    const saldo =
      item && item.saldo !== null && item.saldo !== undefined
        ? toNumber(item.saldo)
        : Number((valorOrcado - valorUtilizado).toFixed(2));
    const pct = item ? toNumber(item.pct) : getPct(valorUtilizado, valorOrcado);

    return {
      valorOrcado,
      valorPago,
      valorComprometido,
      valorLancamentos,
      valorUtilizado,
      saldo,
      pct,
    };
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            Gerenciar Cards de Rubricas
          </DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 border-b pb-3">
          <button
            onClick={() => setTab('listar')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              tab === 'listar'
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            Cards existentes
          </button>
          <button
            onClick={() => setTab('criar')}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
              tab === 'criar'
                ? 'bg-gray-900 text-white'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            <Plus className="w-3.5 h-3.5" /> Criar novo card
          </button>
        </div>

        <div className="overflow-y-auto flex-1 pr-1">
          {tab === 'listar' && (
            <div className="space-y-6">
              {isLoading ? (
                <div className="text-center py-10 text-gray-400 text-sm">
                  Carregando...
                </div>
              ) : (
                MUSEUS.map((museu) => {
                  const items = rubricasPorMuseu[museu] || [];

                  return (
                    <div key={museu}>
                      <div className="flex items-center gap-2 mb-3">
                        <span className="font-bold text-sm text-gray-800 bg-gray-100 px-2 py-0.5 rounded">
                          {museu}
                        </span>
                        <span className="text-xs text-gray-400">
                          {items.length} rubricas
                        </span>
                      </div>

                      {items.length === 0 ? (
                        <p className="text-xs text-gray-400 pl-2">
                          Nenhuma rubrica vinculada.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {items.map((rubrica) => {
                            const config = rubrica.config;
                            const editKey = `${rubrica.id}__${config?.museu || ''}`;
                            const isEditing = editingRubrica === editKey;
                            const financeiro = renderFinanceiro(rubrica, museu);

                            return (
                              <div
                                key={editKey}
                                className="border border-gray-200 rounded-lg p-3 bg-gray-50"
                              >
                                <div className="flex items-center justify-between gap-2 mb-1">
                                  <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                                    <span className="font-medium text-sm text-gray-900 truncate">
                                      {getRubricaNome(rubrica)}
                                    </span>

                                    <Badge
                                      variant="outline"
                                      className="text-[10px] px-1.5 shrink-0"
                                    >
                                      {CATEGORIAS[config?.categoria_key] ||
                                        config?.categoria_key ||
                                        'Outros'}
                                    </Badge>

                                    {getRubricaCentroCusto(rubrica) ? (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 shrink-0"
                                      >
                                        CC: {getRubricaCentroCusto(rubrica)}
                                      </Badge>
                                    ) : null}

                                    {(configsByRubrica[rubrica.id] || []).length > 1 ? (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] px-1.5 shrink-0"
                                      >
                                        compartilhada
                                      </Badge>
                                    ) : null}

                                    {!rubrica.ativo && (
                                      <Badge className="text-[10px] px-1.5 bg-red-100 text-red-600 border-red-200 shrink-0">
                                        inativa
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="flex gap-1 shrink-0">
                                    {!isEditing && (
                                      <>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs px-2"
                                          onClick={() => handleEditStart(rubrica, config)}
                                        >
                                          Editar
                                        </Button>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 px-2 text-red-600 hover:bg-red-50 border-red-200"
                                          onClick={() => handleDelete(rubrica, config)}
                                          disabled={saving}
                                        >
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                      </>
                                    )}
                                  </div>
                                </div>

                                {!isEditing && (
                                  <>
                                    <div className="flex gap-4 text-xs text-gray-500 mt-1 flex-wrap">
                                      <span>
                                        Orçado:{' '}
                                        <b className="text-gray-800">
                                          {fmt(financeiro.valorOrcado)}
                                        </b>
                                      </span>
                                      <span>
                                        Pago:{' '}
                                        <b className="text-green-700">
                                          {fmt(financeiro.valorPago)}
                                        </b>
                                      </span>
                                      <span>
                                        Aprovado:{' '}
                                        <b className="text-orange-600">
                                          {fmt(financeiro.valorComprometido)}
                                        </b>
                                      </span>
                                      <span>
                                        Lançamentos:{' '}
                                        <b className="text-sky-700">
                                          {fmt(financeiro.valorLancamentos)}
                                        </b>
                                      </span>
                                      <span>
                                        Utilizado:{' '}
                                        <b className="text-amber-600">
                                          {fmt(financeiro.valorUtilizado)}
                                        </b>
                                      </span>
                                      <span>
                                        Saldo:{' '}
                                        <b
                                          className={
                                            financeiro.saldo < 0
                                              ? 'text-red-600'
                                              : 'text-green-600'
                                          }
                                        >
                                          {fmt(financeiro.saldo)}
                                        </b>
                                      </span>
                                      <span>
                                        %:{' '}
                                        <b
                                          className={
                                            financeiro.pct >= 100
                                              ? 'text-red-600'
                                              : financeiro.pct >= 80
                                                ? 'text-orange-600'
                                                : 'text-gray-700'
                                          }
                                        >
                                          {financeiro.pct}%
                                        </b>
                                      </span>
                                    </div>

                                    {rubrica.observacao_uso ? (
                                      <div className="mt-2 text-[11px] text-gray-500">
                                        {rubrica.observacao_uso}
                                      </div>
                                    ) : null}
                                  </>
                                )}

                                {isEditing && (
                                  <div className="mt-2 space-y-3">
                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-[11px] text-gray-500">
                                          Nome da rubrica
                                        </Label>
                                        <Input
                                          value={editValues.rubrica}
                                          onChange={(e) =>
                                            setEditValues((p) => ({
                                              ...p,
                                              rubrica: e.target.value,
                                            }))
                                          }
                                          className="h-7 text-xs mt-0.5"
                                        />
                                      </div>
                                      <div>
                                        <Label className="text-[11px] text-gray-500">
                                          Grupo
                                        </Label>
                                        <Input
                                          value={editValues.grupo}
                                          onChange={(e) =>
                                            setEditValues((p) => ({
                                              ...p,
                                              grupo: e.target.value,
                                            }))
                                          }
                                          className="h-7 text-xs mt-0.5"
                                        />
                                      </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                      <div>
                                        <Label className="text-[11px] text-gray-500">
                                          Valor orçado original (R$)
                                        </Label>
                                        <Input
                                          type="number"
                                          step="0.01"
                                          value={editValues.valor_rubrica}
                                          onChange={(e) =>
                                            setEditValues((p) => ({
                                              ...p,
                                              valor_rubrica: e.target.value,
                                            }))
                                          }
                                          className="h-7 text-xs mt-0.5"
                                        />
                                      </div>

                                      <div>
                                        <Label className="text-[11px] text-gray-500">
                                          Categoria do card
                                        </Label>
                                        <Select
                                          value={editValues.categoria_key}
                                          onValueChange={(v) =>
                                            setEditValues((p) => ({
                                              ...p,
                                              categoria_key: v,
                                            }))
                                          }
                                        >
                                          <SelectTrigger className="h-7 text-xs mt-0.5">
                                            <SelectValue />
                                          </SelectTrigger>
                                          <SelectContent>
                                            {Object.entries(CATEGORIAS).map(([k, l]) => (
                                              <SelectItem key={k} value={k}>
                                                {l}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>

                                    <div className="rounded-md border bg-white px-3 py-2 text-[11px] text-gray-600">
                                      Os campos <b>valor utilizado</b>, <b>saldo</b> e{' '}
                                      <b>percentual</b> são calculados automaticamente pelo
                                      backend e não são editáveis manualmente.
                                    </div>

                                    <div>
                                      <Label className="text-[11px] text-gray-500">
                                        Observação
                                      </Label>
                                      <Input
                                        value={editValues.observacao_uso}
                                        onChange={(e) =>
                                          setEditValues((p) => ({
                                            ...p,
                                            observacao_uso: e.target.value,
                                          }))
                                        }
                                        className="h-7 text-xs mt-0.5"
                                        placeholder="Observação de uso..."
                                      />
                                    </div>

                                    <div className="space-y-2">
                                      <div className="flex items-center gap-2">
                                        <Switch
                                          checked={!!editValues.ativo}
                                          onCheckedChange={(v) =>
                                            setEditValues((p) => ({
                                              ...p,
                                              ativo: v,
                                            }))
                                          }
                                        />
                                        <Label className="text-xs text-gray-600">
                                          Rubrica ativa
                                        </Label>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <Switch
                                          checked={!!editValues.publica}
                                          onCheckedChange={(v) =>
                                            setEditValues((p) => ({
                                              ...p,
                                              publica: v,
                                            }))
                                          }
                                        />
                                        <div className="flex items-center gap-1">
                                          {editValues.publica ? (
                                            <Eye className="w-3.5 h-3.5 text-green-600" />
                                          ) : (
                                            <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                                          )}
                                          <Label className="text-xs text-gray-700">
                                            Publicar automaticamente
                                          </Label>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="flex gap-2 justify-end">
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 text-xs"
                                        onClick={() => {
                                          setEditingRubrica(null);
                                          setEditValues({});
                                        }}
                                      >
                                        Cancelar
                                      </Button>
                                      <Button
                                        size="sm"
                                        className="h-7 text-xs bg-green-600 hover:bg-green-700"
                                        onClick={() => handleEditSave(rubrica, config)}
                                        disabled={saving}
                                      >
                                        <Save className="w-3 h-3 mr-1" />
                                        Salvar
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {tab === 'criar' && (
            <div className="space-y-4 py-2">
              <p className="text-xs text-gray-500">
                Crie um novo card de rubrica definindo o museu, a categoria e o
                valor orçado original. Os valores financeiros utilizados serão
                calculados automaticamente conforme compras e lançamentos.
              </p>

              <div className="rounded-md border bg-amber-50 px-3 py-2 text-xs text-amber-800 flex gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  A rubrica nova será criada com <b>centro_custo igual ao museu</b>{' '}
                  selecionado e o vínculo em <b>RubricaMuseuConfig</b> será criado
                  automaticamente com divisor 1.
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-gray-600">Museu *</Label>
                  <Select
                    value={novoCard.museu}
                    onValueChange={(v) => setNovoCard((p) => ({ ...p, museu: v }))}
                  >
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MUSEUS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label className="text-xs text-gray-600">Categoria *</Label>
                  <Select
                    value={novoCard.categoria_key}
                    onValueChange={(v) =>
                      setNovoCard((p) => ({ ...p, categoria_key: v }))
                    }
                  >
                    <SelectTrigger className="h-8 text-sm mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(CATEGORIAS).map(([k, l]) => (
                        <SelectItem key={k} value={k}>
                          {l}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label className="text-xs text-gray-600">Nome da Rubrica *</Label>
                <Input
                  value={novoCard.rubrica}
                  onChange={(e) =>
                    setNovoCard((p) => ({ ...p, rubrica: e.target.value }))
                  }
                  className="h-8 text-sm mt-1"
                  placeholder="Ex: Material de Consumo"
                />
              </div>

              <div>
                <Label className="text-xs text-gray-600">Grupo/Subcategoria</Label>
                <Input
                  value={novoCard.grupo}
                  onChange={(e) =>
                    setNovoCard((p) => ({ ...p, grupo: e.target.value }))
                  }
                  className="h-8 text-sm mt-1"
                  placeholder="Ex: Materiais e Insumos"
                />
              </div>

              <div>
                <Label className="text-xs text-gray-600">Observação de uso</Label>
                <Input
                  value={novoCard.observacao_uso}
                  onChange={(e) =>
                    setNovoCard((p) => ({ ...p, observacao_uso: e.target.value }))
                  }
                  className="h-8 text-sm mt-1"
                  placeholder="Observações internas da rubrica"
                />
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div>
                  <Label className="text-xs text-gray-600">Valor Orçado (R$) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={novoCard.valor_rubrica}
                    onChange={(e) =>
                      setNovoCard((p) => ({ ...p, valor_rubrica: e.target.value }))
                    }
                    className="h-8 text-sm mt-1"
                    placeholder="0,00"
                  />
                </div>
              </div>

              <div className="space-y-2 border rounded-lg p-3 bg-gray-50">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={novoCard.ativo}
                    onCheckedChange={(v) =>
                      setNovoCard((p) => ({ ...p, ativo: v }))
                    }
                  />
                  <Label className="text-xs text-gray-700">
                    Card <b>ativo</b> (visível nos dashboards)
                  </Label>
                </div>

                <div className="flex items-center gap-2">
                  <Switch
                    checked={novoCard.publica}
                    onCheckedChange={(v) =>
                      setNovoCard((p) => ({ ...p, publica: v }))
                    }
                  />
                  <div className="flex items-center gap-1">
                    {novoCard.publica ? (
                      <Eye className="w-3.5 h-3.5 text-green-600" />
                    ) : (
                      <EyeOff className="w-3.5 h-3.5 text-gray-400" />
                    )}
                    <Label className="text-xs text-gray-700">
                      <b>Publicar automaticamente</b> — rubrica autorizada a aparecer
                      nos cards públicos dos museus
                    </Label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setTab('listar')}>
                  Cancelar
                </Button>
                <Button
                  size="sm"
                  className="bg-gray-900 hover:bg-gray-800"
                  onClick={handleCriarCard}
                  disabled={saving}
                >
                  <Plus className="w-3.5 h-3.5 mr-1" />
                  {saving ? 'Criando...' : 'Criar Card'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
