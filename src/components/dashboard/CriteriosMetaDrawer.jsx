import React, { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, RotateCcw, Info, X, Eye } from 'lucide-react';
import { toast } from 'sonner';
import {
  DEFAULTS_CRITERIOS,
  CHAVES_DISPONIVEIS,
  contarAtividades,
  useDashboardCriterios,
} from '@/hooks/useDashboardCriterios';

const CLASSIFICACAO_OPCOES = ['META', 'ROTINA', 'EXTRA', 'cultural', 'educativa', 'parcial', 'final'];

function ChipsEditor({ items, onAdd, onRemove, placeholder }) {
  const [valor, setValor] = useState('');
  const adicionar = () => {
    const v = valor.trim();
    setValor('');
    if (!v) return;
    if (items.some(i => String(i).toLowerCase() === v.toLowerCase())) return;
    onAdd([...items, v]);
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
        {items.length === 0 && (
          <span className="text-[11px] text-slate-400 italic">Nenhum item — use padrão vazio</span>
        )}
        {items.map((item, i) => (
          <span
            key={`${item}-${i}`}
            className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200"
          >
            {item}
            <button
              type="button"
              onClick={() => onRemove(items.filter((_, idx) => idx !== i))}
              className="rounded-full hover:bg-slate-200 p-0.5"
              aria-label={`Remover ${item}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1.5">
        <Input
          value={valor}
          onChange={e => setValor(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              adicionar();
            }
          }}
          placeholder={placeholder}
          className="h-8 text-xs"
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={adicionar}
          className="h-8 px-3 text-xs"
        >
          Adicionar
        </Button>
      </div>
    </div>
  );
}

function Secao({ titulo, subtitulo, children }) {
  return (
    <div className="space-y-2 pb-4 border-b border-slate-100 last:border-b-0">
      <div>
        <h4 className="text-sm font-bold text-slate-800">{titulo}</h4>
        {subtitulo && <p className="text-[11px] text-slate-500 mt-0.5">{subtitulo}</p>}
      </div>
      {children}
    </div>
  );
}

function MultiSelectChips({ valores, opcoes, onToggle }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {opcoes.map(opt => {
        const ativo = valores.some(v => String(v).toLowerCase() === String(opt).toLowerCase());
        return (
          <button
            key={opt}
            type="button"
            onClick={() => {
              if (ativo) {
                onToggle(valores.filter(v => String(v).toLowerCase() !== String(opt).toLowerCase()));
              } else {
                onToggle([...valores, opt]);
              }
            }}
            className={`text-xs font-medium px-2.5 py-1 rounded-full border transition ${
              ativo
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
            }`}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

export default function CriteriosMetaDrawer({ open, onClose, chaveInicial, atividades = [], metaLabel }) {
  const [chave, setChave] = useState(chaveInicial);
  const [draft, setDraft] = useState(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (chaveInicial) setChave(chaveInicial);
  }, [chaveInicial]);

  const { criterios: persisted, saveCriterios } = useDashboardCriterios(chave);

  useEffect(() => {
    if (persisted) setDraft(JSON.parse(JSON.stringify(persisted)));
  }, [persisted, chave]);

  const isDirty = useMemo(() => {
    if (!draft || !persisted) return false;
    try {
      return JSON.stringify(draft) !== JSON.stringify(persisted);
    } catch {
      return false;
    }
  }, [draft, persisted]);

  const preview = useMemo(() => {
    if (!draft) return { novo: 0, atual: 0 };
    const atual = persisted ? contarAtividades(atividades, persisted) : 0;
    const novo = contarAtividades(atividades, draft);
    return { novo, atual };
  }, [atividades, draft, persisted]);

  const selectedLabel = CHAVES_DISPONIVEIS.find(c => c.chave === chave)?.label;

  const handleSave = async () => {
    if (!draft) return;
    setIsSaving(true);
    try {
      await saveCriterios(draft);
      toast.success('Critérios salvos — recálculo imediato nos cards.');
      onClose();
    } catch (e) {
      console.error(e);
      toast.error('Falha ao salvar critérios: ' + (e?.message || e));
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestaurar = () => {
    const padrao = DEFAULTS_CRITERIOS[chave] || {
      meta_codigos_aceitos: [],
      classificacoes_aceitas: [],
      palavras_chave_inclusao: [],
      palavras_chave_exclusao: [],
      geral_mode: 'apenas_geral',
    };
    setDraft(JSON.parse(JSON.stringify(padrao)));
    toast.info('Padrão restaurado — clique em Salvar para persistir.');
  };

  const setCampo = (campo, valor) => {
    setDraft(prev => prev ? { ...prev, [campo]: valor } : prev);
  };

  const mostrarToggleGeral = chave === 'dashboard_criterios_meta_20';

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-md max-w-md overflow-y-auto p-0 flex flex-col"
      >
        <SheetHeader className="px-5 py-4 border-b border-slate-100">
          <SheetTitle className="text-base font-bold text-slate-900">
            Configurar critérios — {selectedLabel || metaLabel || chave}
          </SheetTitle>
          <SheetDescription className="text-xs text-slate-500">
            Defina seletivamente como as atividades são contabilizadas nesta meta.
            Os relatórios já submetidos não são alterados — apenas o cálculo dos cards.
          </SheetDescription>
        </SheetHeader>

        {/* Seletor de meta */}
        <div className="px-5 pt-3 pb-2 border-b border-slate-50">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Meta</label>
          <select
            value={chave}
            onChange={e => setChave(e.target.value)}
            className="w-full text-xs rounded-lg border border-slate-200 bg-white px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-slate-400"
          >
            {CHAVES_DISPONIVEIS.map(opt => (
              <option key={opt.chave} value={opt.chave}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {draft && (
            <>
              <Secao
                titulo="Códigos de meta aceitos"
                subtitulo="Valores de meta_codigo/meta_id que classificam a atividade nesta meta (ex: '20', '10', 'MC3A-20')."
              >
                <ChipsEditor
                  items={draft.meta_codigos_aceitos || []}
                  onAdd={v => setCampo('meta_codigos_aceitos', v)}
                  onRemove={v => setCampo('meta_codigos_aceitos', v)}
                  placeholder="Ex: 20, MC3A-20…"
                />
              </Secao>

              <Secao
                titulo="Classificações aceitas"
                subtitulo="Valores possíveis do campo classificacao da atividade."
              >
                <MultiSelectChips
                  valores={draft.classificacoes_aceitas || []}
                  opcoes={CLASSIFICACAO_OPCOES}
                  onToggle={v => setCampo('classificacoes_aceitas', v)}
                />
              </Secao>

              <Secao
                titulo="Palavras-chave no título"
                subtitulo="Termos que, se presentes no título/nome da atividade, a incluem na meta."
              >
                <ChipsEditor
                  items={draft.palavras_chave_inclusao || []}
                  onAdd={v => setCampo('palavras_chave_inclusao', v)}
                  onRemove={v => setCampo('palavras_chave_inclusao', v)}
                  placeholder="Ex: mostra, oficina…"
                />
              </Secao>

              <Secao
                titulo="Palavras-chave de exclusão"
                subtitulo="Termos que, se encontrados no título/código, retiram a atividade do cômputo."
              >
                <ChipsEditor
                  items={draft.palavras_chave_exclusao || []}
                  onAdd={v => setCampo('palavras_chave_exclusao', v)}
                  onRemove={v => setCampo('palavras_chave_exclusao', v)}
                  placeholder="Ex: noturno, diária, pampulha…"
                />
              </Secao>

              {mostrarToggleGeral && (
                <Secao
                  titulo="Card Geral no breakdown por museu"
                  subtitulo="Determina como o valor do card 'Geral' é exibido."
                >
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="geral_mode"
                        checked={draft.geral_mode === 'consolidado'}
                        onChange={() => setCampo('geral_mode', 'consolidado')}
                      />
                      <span className="text-xs text-slate-700">
                        <strong>Consolidado</strong> — soma MHAB + MIS + MUMO + sem museu específico
                      </span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="geral_mode"
                        checked={draft.geral_mode === 'apenas_geral'}
                        onChange={() => setCampo('geral_mode', 'apenas_geral')}
                      />
                      <span className="text-xs text-slate-700">
                        <strong>Apenas Geral</strong> — só atividades marcadas como museu=Geral (legado)
                      </span>
                    </label>
                  </div>
                </Secao>
              )}

              {/* Preview de impacto */}
              <div className="flex items-start gap-2 bg-yellow-50 border border-yellow-200 rounded-xl p-3">
                <Eye className="w-4 h-4 text-yellow-700 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-yellow-800">
                  <p className="font-semibold">Preview</p>
                  <p>
                    Com estes critérios: <strong>{preview.novo}</strong> atividades seriam contadas
                    {' '}<span className="text-yellow-700">(atual: {preview.atual})</span>
                  </p>
                  {preview.novo !== preview.atual && (
                    <p className="mt-0.5 text-yellow-700">
                      Δ {preview.novo - preview.atual > 0 ? '+' : ''}
                      {preview.novo - preview.atual} atividades
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                <Info className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
                <p className="text-[11px] text-slate-500">
                  Ordem de avaliação: exclusões → código aceito → classificação aceita → palavra-chave de inclusão.
                  Salvar recalcula imediatamente os cards (sem tocar nos relatórios submetidos).
                </p>
              </div>
            </>
          )}
        </div>

        {/* Rodapé fixo */}
        <div className="border-t border-slate-100 px-5 py-3 bg-white flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleRestaurar}
            className="text-xs"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            Restaurar padrão
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            disabled={!draft || isSaving || !isDirty}
            className="text-xs h-8"
          >
            <Save className="w-3.5 h-3.5 mr-1.5" />
            {isSaving ? 'Salvando…' : 'Salvar configuração'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}