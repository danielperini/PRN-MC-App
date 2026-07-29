import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Pencil, X, Check, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

function toNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v ?? 0);
}

const MUSEUS = ['MUMO', 'MIS', 'MHAB'];

const METAS_MC3A = [
  'MC3A-20', 'MC3A-21', 'MC3A-22', 'MC3A-23', 'MC3A-24', 'MC3A-25', 'MC3A-EXTRA',
];

function RubricaRow({ rubrica, comprasUtilizadas }) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [localValor, setLocalValor] = useState('');
  const [localMuseus, setLocalMuseus] = useState([]);
  const [localMetas, setLocalMetas] = useState([]);
  const queryClient = useQueryClient();

  const previsto = toNumber(rubrica.valor_rubrica || rubrica.valor_total);
  const utilCompras = comprasUtilizadas[rubrica.id];
  const utilizado = utilCompras !== undefined && utilCompras > 0 ? utilCompras : toNumber(rubrica.valor_utilizado);
  const saldo = previsto - utilizado;
  const borderColor = saldo < 0 ? 'border-l-red-500' : 'border-l-blue-500';

  function startEdit() {
    setLocalValor(String(rubrica.valor_utilizado ?? ''));
    setLocalMuseus(Array.isArray(rubrica.meta_manual_ids)
      ? rubrica.meta_manual_ids.filter(id => MUSEUS.includes(id))
      : []);
    setLocalMetas(Array.isArray(rubrica.meta_manual_ids)
      ? rubrica.meta_manual_ids.filter(id => METAS_MC3A.includes(id))
      : []);
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      const novoUtilizado = localValor !== '' ? toNumber(localValor) : rubrica.valor_utilizado;
      const novasMetas = [...localMuseus, ...localMetas];
      await base44.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: novoUtilizado,
        meta_manual_ids: novasMetas,
      });
      queryClient.invalidateQueries({ queryKey: ['rubricas-centros-transversais'] });
      toast.success('Rubrica atualizada!');
      setEditing(false);
    } catch (e) {
      toast.error('Erro ao salvar rubrica');
    } finally {
      setSaving(false);
    }
  }

  function toggleMuseu(m) {
    setLocalMuseus(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }

  function toggleMeta(m) {
    setLocalMetas(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }

  return (
    <div className={`rounded-xl border border-gray-200 border-l-4 ${borderColor} bg-white shadow-sm mb-2`}>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 leading-tight truncate">{rubrica.rubrica || rubrica.nome || '—'}</p>
            {rubrica.grupo && <p className="text-xs text-gray-400 mt-0.5 truncate">{rubrica.grupo}</p>}
          </div>
          <button
            onClick={editing ? cancelEdit : startEdit}
            className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors"
          >
            {editing ? <X className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
          </button>
        </div>

        <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <div>
            <span className="text-gray-400 block">Previsto</span>
            <span className="font-medium text-gray-900">{fmtBRL(previsto)}</span>
          </div>
          <div>
            <span className="text-gray-400 block">Utilizado</span>
            <span className="font-medium text-gray-900">{fmtBRL(utilizado)}</span>
          </div>
          <div>
            <span className="text-gray-400 block">Saldo</span>
            <span className={`font-bold ${saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtBRL(saldo)}</span>
          </div>
        </div>

        {/* Vínculos existentes */}
        {Array.isArray(rubrica.meta_manual_ids) && rubrica.meta_manual_ids.length > 0 && !editing && (
          <div className="mt-2 flex flex-wrap gap-1">
            {rubrica.meta_manual_ids.map(id => (
              <Badge key={id} variant="outline" className="text-xs py-0 px-1.5 border-blue-200 text-blue-700 bg-blue-50">{id}</Badge>
            ))}
          </div>
        )}
      </div>

      {/* Formulário de edição */}
      {editing && (
        <div className="border-t border-gray-100 px-3 pb-3 pt-2 space-y-3">
          {/* Valor utilizado */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Valor Utilizado (R$)</label>
            <input
              type="number"
              step="0.01"
              value={localValor}
              onChange={e => setLocalValor(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Rateio por Museu */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Vincular a Museu (rateio)</label>
            <div className="flex gap-2 flex-wrap">
              {MUSEUS.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMuseu(m)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                    localMuseus.includes(m)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-blue-400'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Vincular a Meta */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Vincular a Meta (MC3A)</label>
            <div className="flex gap-1.5 flex-wrap">
              {METAS_MC3A.map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMeta(m)}
                  className={`px-2 py-0.5 rounded-md text-xs font-medium border transition-all ${
                    localMetas.includes(m)
                      ? 'bg-purple-600 text-white border-purple-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-purple-400'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Botões */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={saveEdit}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
            <button
              onClick={cancelEdit}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-xs font-medium hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CentrosCustoDrawer({ centro, rubricas, compras, open, onClose }) {
  const rubricasDoCentro = useMemo(() => {
    if (!centro) return [];
    return rubricas.filter(r => {
      const c = String(r.centro_custo || '').trim().toUpperCase();
      return c === centro.centro.toUpperCase() ||
        c.includes(centro.centro.substring(0, 5).toUpperCase());
    });
  }, [centro, rubricas]);

  const comprasUtilizadas = useMemo(() => {
    const STATUS_APROVADOS = new Set(['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
    const mapa = {};
    for (const c of compras) {
      if (!c.rubrica_id) continue;
      if (!STATUS_APROVADOS.has(String(c.status || '').toUpperCase())) continue;
      const val = toNumber(c.valor_pago || c.valor_aprovado_admin || c.valor_aprovado || c.valor_solicitado);
      mapa[c.rubrica_id] = (mapa[c.rubrica_id] || 0) + val;
    }
    return mapa;
  }, [compras]);

  if (!centro) return null;

  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 flex flex-col overflow-hidden">
        {/* Cabeçalho */}
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-gray-100">
          <SheetTitle className="text-base font-bold text-gray-900">{centro.centro}</SheetTitle>
          <div className="flex gap-4 mt-1 text-sm">
            <span className="text-gray-500">Previsto: <strong className="text-gray-900">{fmtBRL(centro.totalOrcado)}</strong></span>
            <span className={centro.totalSaldo < 0 ? 'text-red-600' : 'text-green-700'}>
              Saldo: <strong>{fmtBRL(centro.totalSaldo)}</strong>
            </span>
          </div>
          <p className="text-xs text-gray-400">{rubricasDoCentro.length} rubrica(s)</p>
        </SheetHeader>

        {/* Lista de rubricas */}
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {rubricasDoCentro.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma rubrica encontrada neste centro.</p>
          ) : (
            rubricasDoCentro.map(r => (
              <RubricaRow key={r.id} rubrica={r} comprasUtilizadas={comprasUtilizadas} />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}