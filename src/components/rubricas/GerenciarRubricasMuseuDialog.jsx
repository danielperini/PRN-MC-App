import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Settings, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

const KEYWORD_TO_CATEGORIA = [
  ['exposi', 'exposicao'],
  ['expograf', 'exposicao'],
  ['som e luz', 'som_luz'],
  ['som/luz', 'som_luz'],
  ['acao educativa', 'acoes_educativas'],
  ['ações educativas', 'acoes_educativas'],
  ['acoes educativas', 'acoes_educativas'],
  ['diaria', 'diarias_educador'],
  ['diária', 'diarias_educador'],
  ['lanche', 'lanches'],
  ['buffet', 'lanches'],
  ['alimentac', 'alimentacao_cartao'],
  ['cartao', 'alimentacao_cartao'],
  ['cartão', 'alimentacao_cartao'],
  ['material', 'material'],
  ['manutenc', 'manutencao'],
  ['manuten', 'manutencao'],
  ['educador', 'educador'],
  ['noturno', 'noturno'],
  ['publicac', 'publicacoes'],
  ['publicaç', 'publicacoes'],
  ['consult', 'consultorias'],
  ['formac', 'consultorias'],
  ['despesa geral', 'despesas_gerais'],
  ['despesas gerais', 'despesas_gerais'],
  ['equipe', 'equipe'],
  ['coordenador', 'equipe'],
  ['produc', 'equipe'],
  ['designer', 'comunicacao'],
  ['comunic', 'comunicacao'],
  ['imprensa', 'comunicacao'],
  ['fotograf', 'comunicacao'],
];

const CATEGORIAS_LABEL = {
  equipe: 'Equipe Principal',
  comunicacao: 'Comunicação',
  manutencao: 'Manutenção',
  educador: 'Educador',
  diarias_educador: 'Diárias',
  lanches: 'Lanches',
  alimentacao_cartao: 'Alimentação',
  material: 'Material',
  acoes_educativas: 'Ações Educativas',
  som_luz: 'Som e Luz',
  exposicao: 'Exposição',
  noturno: 'Noturno',
  publicacoes: 'Publicações',
  consultorias: 'Consultorias',
  despesas_gerais: 'Despesas Gerais',
  outros: 'Outros',
  geral: 'Geral',
};

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

function inferirCategoria(rubrica) {
  const texto = normalizeString(
    (rubrica?.grupo || '') +
      ' ' +
      (rubrica?.rubrica || rubrica?.nome || '') +
      ' ' +
      (rubrica?.observacao_uso || '')
  );

  for (const [keyword, cat] of KEYWORD_TO_CATEGORIA) {
    if (texto.includes(keyword)) return cat;
  }

  return 'outros';
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
  return String(rubrica?.rubrica || rubrica?.nome || 'Rubrica sem nome');
}

export default function GerenciarRubricasMuseuDialog({ open, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ rubrica_id: '', museu: '' });
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    if (open) {
      base44.auth.me().then(setCurrentUser).catch(() => {});
    }
  }, [open]);

  const isCoordenador =
    currentUser && ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-all'],
    queryFn: async () => {
      const all = await base44.entities.Rubrica.list('ordem_exibicao', 500);
      return Array.isArray(all) ? all : [];
    },
    enabled: open,
  });

  const { data: configs = [], refetch } = useQuery({
    queryKey: ['rubrica-museu-configs'],
    queryFn: async () => {
      const all = await base44.entities.RubricaMuseuConfig.list();
      return Array.isArray(all) ? all : [];
    },
    enabled: open,
  });

  const rubricasAtivas = useMemo(
    () => rubricas.filter((r) => r?.ativo !== false),
    [rubricas]
  );

  const rubricaById = useMemo(() => {
    const map = {};
    for (const rubrica of rubricasAtivas) {
      if (rubrica?.id) map[rubrica.id] = rubrica;
    }
    return map;
  }, [rubricasAtivas]);

  const selectedRubrica = useMemo(() => {
    return rubricaById[form.rubrica_id] || null;
  }, [rubricaById, form.rubrica_id]);

  const existingKeys = useMemo(() => {
    return new Set(
      configs
        .filter((c) => c?.rubrica_id && c?.museu)
        .map((c) => `${c.rubrica_id}__${normalizeMuseu(c.museu)}`)
    );
  }, [configs]);

  const formValidation = useMemo(() => {
    if (!form.rubrica_id || !form.museu) {
      return {
        canAdd: false,
        message: 'Selecione a rubrica e o museu.',
      };
    }

    const rubrica = selectedRubrica;
    if (!rubrica) {
      return {
        canAdd: false,
        message: 'Rubrica não encontrada.',
      };
    }

    const museuSelecionado = normalizeMuseu(form.museu);
    const rubricaMuseu = getRubricaCentroCusto(rubrica);

    if (!MUSEUS.includes(museuSelecionado)) {
      return {
        canAdd: false,
        message: 'Museu inválido.',
      };
    }

    if (rubricaMuseu && rubricaMuseu !== museuSelecionado) {
      return {
        canAdd: false,
        message: `Esta rubrica pertence ao centro de custo ${rubricaMuseu} e não pode ser vinculada manualmente ao museu ${museuSelecionado}.`,
      };
    }

    const key = `${form.rubrica_id}__${museuSelecionado}`;
    if (existingKeys.has(key)) {
      return {
        canAdd: false,
        message: 'Esse vínculo já existe.',
      };
    }

    return {
      canAdd: true,
      message: null,
    };
  }, [form, selectedRubrica, existingKeys]);

  async function handleAdd() {
    if (!formValidation.canAdd || !selectedRubrica) return;

    setSaving(true);

    try {
      const museu = normalizeMuseu(form.museu);
      const categoria_key = inferirCategoria(selectedRubrica);
      const rubricaMuseu = getRubricaCentroCusto(selectedRubrica);
      const divisor = rubricaMuseu ? 1 : 1;

      await base44.entities.RubricaMuseuConfig.create({
        rubrica_id: form.rubrica_id,
        museu,
        categoria_key,
        divisor,
      });

      await refetch();

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

      setForm({ rubrica_id: '', museu: '' });
      toast.success('Vínculo criado com sucesso');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao criar vínculo');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove(config) {
    try {
      await base44.entities.RubricaMuseuConfig.delete(config.id);
      await refetch();

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

      toast.success('Vínculo removido');
    } catch (e) {
      console.error(e);
      toast.error('Erro ao remover vínculo');
    }
  }

  const porMuseu = useMemo(() => {
    return MUSEUS.map((museu) => ({
      museu,
      items: configs
        .filter((c) => normalizeMuseu(c?.museu) === museu)
        .sort((a, b) => {
          const ra = getRubricaNome(rubricaById[a.rubrica_id]);
          const rb = getRubricaNome(rubricaById[b.rubrica_id]);
          return ra.localeCompare(rb, 'pt-BR');
        }),
    }));
  }, [configs, rubricaById]);

  if (!isCoordenador) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Acesso Restrito
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Apenas coordenadores podem gerenciar rubricas por museu.
          </p>
          <Button onClick={onClose} className="mt-4 w-full">
            Fechar
          </Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Gerenciar Rubricas por Museu
          </DialogTitle>
        </DialogHeader>

        <div className="bg-gray-50 rounded-lg p-4 space-y-3 border">
          <p className="text-sm font-semibold text-gray-700">
            Adicionar vínculo manual
          </p>

          <div className="grid grid-cols-1 md:grid-cols-[1fr_140px] gap-2">
            <Select
              value={form.rubrica_id}
              onValueChange={(v) => setForm((f) => ({ ...f, rubrica_id: v }))}
            >
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Selecionar rubrica..." />
              </SelectTrigger>
              <SelectContent>
                {rubricasAtivas.map((r) => {
                  const nome = getRubricaNome(r);
                  const centroCusto = getRubricaCentroCusto(r);

                  return (
                    <SelectItem key={r.id} value={r.id}>
                      {centroCusto ? `${nome} — ${centroCusto}` : nome}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>

            <Select
              value={form.museu}
              onValueChange={(v) => setForm((f) => ({ ...f, museu: v }))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Museu..." />
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

          {selectedRubrica ? (
            <div className="rounded-md border bg-white px-3 py-2 text-xs text-gray-600 space-y-1">
              <div className="font-medium text-gray-800">{getRubricaNome(selectedRubrica)}</div>
              <div className="flex flex-wrap gap-3">
                <span>
                  Grupo: <span className="font-medium">{selectedRubrica?.grupo || '—'}</span>
                </span>
                <span>
                  Centro de custo:{' '}
                  <span className="font-medium">
                    {getRubricaCentroCusto(selectedRubrica) || 'não definido'}
                  </span>
                </span>
                <span>
                  Categoria sugerida:{' '}
                  <span className="font-medium">
                    {CATEGORIAS_LABEL[inferirCategoria(selectedRubrica)] ||
                      inferirCategoria(selectedRubrica)}
                  </span>
                </span>
              </div>
            </div>
          ) : null}

          {formValidation.message ? (
            <div
              className={`text-xs rounded-md px-3 py-2 ${
                formValidation.canAdd
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {formValidation.message}
            </div>
          ) : null}

          <Button
            onClick={handleAdd}
            disabled={saving || !formValidation.canAdd}
            className="w-full gap-2"
          >
            <Plus className="w-4 h-4" />
            Adicionar
          </Button>
        </div>

        <div className="space-y-4">
          {porMuseu.map(({ museu, items }) => (
            <div key={museu}>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                {museu}
              </p>

              {items.length === 0 ? (
                <p className="text-xs text-gray-400 italic pl-2">
                  Nenhuma rubrica configurada
                </p>
              ) : (
                <div className="space-y-1">
                  {items.map((c) => {
                    const rubrica = rubricaById[c.rubrica_id];
                    const rubricaNome = getRubricaNome(rubrica);
                    const centroCusto = getRubricaCentroCusto(rubrica);
                    const categoria = c?.categoria_key || 'geral';

                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 bg-white border rounded-lg px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-gray-800 truncate">
                            {rubricaNome}
                          </div>

                          <div className="flex flex-wrap gap-2 mt-1">
                            <Badge variant="outline" className="text-[10px]">
                              {CATEGORIAS_LABEL[categoria] || categoria}
                            </Badge>

                            {centroCusto ? (
                              <Badge variant="outline" className="text-[10px]">
                                CC: {centroCusto}
                              </Badge>
                            ) : null}

                            {c?.divisor > 1 ? (
                              <Badge variant="outline" className="text-[10px]">
                                ÷{c.divisor}
                              </Badge>
                            ) : null}
                          </div>
                        </div>

                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                          onClick={() => handleRemove(c)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
