import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { TrendingUp, Pencil, X, Check } from 'lucide-react';
import { toast } from 'sonner';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v ?? 0);
}

const CENTROS_TRANSVERSAIS = [
  'Coordenação',
  'Comunicação',
  'Educação',
  'Produção',
  'Administrativo-financeiro',
  'Publicações',
  'Consultorias',
  'Despesas Gerais',
  'Geral/Transversal',
];

const MUSEUS = ['MUMO', 'MIS', 'MHAB'];

const METAS_MC3A = [
  'MC3A-20', 'MC3A-21', 'MC3A-22', 'MC3A-23', 'MC3A-24', 'MC3A-25', 'MC3A-EXTRA',
];

function normalizeCentro(centroUI) {
  return CENTROS_TRANSVERSAIS.find(c =>
    c.toUpperCase() === centroUI.toUpperCase() ||
    (c.includes('Coord') && centroUI.includes('Coord')) ||
    (c.includes('Comunica') && centroUI.includes('Comunica')) ||
    (c.includes('Educ') && centroUI.includes('Educ')) ||
    (c.includes('Prod') && centroUI.includes('Prod')) ||
    (c.includes('Admin') && centroUI.includes('Admin')) ||
    (c.includes('Public') && centroUI.includes('Public')) ||
    (c.includes('Consult') && centroUI.includes('Consult')) ||
    (c.includes('Despesa') && centroUI.includes('Despesa')) ||
    (c.includes('Geral') && centroUI.includes('Geral'))
  );
}

// Mini-formulário inline de edição de rubrica
function RubricaEditForm({ rubrica, onClose, onSaved }) {
  const [valorUtilizado, setValorUtilizado] = useState(String(toNumber(rubrica.valor_utilizado)));
  const [museusRateio, setMuseusRateio] = useState([]);
  const [metasSelecionadas, setMetasSelecionadas] = useState(Array.isArray(rubrica.meta_manual_ids) ? rubrica.meta_manual_ids : []);
  const [saving, setSaving] = useState(false);

  function toggleMuseu(m) {
    setMuseusRateio(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }

  function toggleMeta(m) {
    setMetasSelecionadas(prev => prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m]);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await base44.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: toNumber(valorUtilizado),
        meta_manual_ids: metasSelecionadas,
      });
      toast.success('Rubrica atualizada com sucesso!');
      onSaved();
    } catch (e) {
      toast.error('Erro ao salvar rubrica');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-3 p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-3">
      {/* Valor utilizado */}
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1">Valor Utilizado (R$)</label>
        <input
          type="number"
          value={valorUtilizado}
          onChange={e => setValorUtilizado(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          min={0}
          step={0.01}
        />
      </div>

      {/* Museu de rateio */}
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1">Rateio por Museu</label>
        <div className="flex gap-2 flex-wrap">
          {MUSEUS.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMuseu(m)}
              className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                museusRateio.includes(m)
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Metas */}
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1">Vincular a Metas (MC3A)</label>
        <div className="flex gap-1.5 flex-wrap">
          {METAS_MC3A.map(m => (
            <button
              key={m}
              type="button"
              onClick={() => toggleMeta(m)}
              className={`text-xs px-2 py-0.5 rounded border font-medium transition-colors ${
                metasSelecionadas.includes(m)
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-indigo-400'
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
          onClick={handleSave}
          disabled={saving}
          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          <Check className="w-3 h-3" />
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
        <button
          onClick={onClose}
          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-white text-gray-600 border border-gray-200 rounded-lg font-medium hover:bg-gray-50"
        >
          <X className="w-3 h-3" />
          Cancelar
        </button>
      </div>
    </div>
  );
}

// Card de rubrica dentro do drawer
function RubricaDrawerCard({ rubrica, utilizadoPorRubricaId, onSaved }) {
  const [editando, setEditando] = useState(false);

  const previsto = toNumber(rubrica.valor_rubrica || rubrica.valor_total);
  const utilCompras = utilizadoPorRubricaId[rubrica.id];
  const utilizado = utilCompras !== undefined && utilCompras > 0 ? utilCompras : toNumber(rubrica.valor_utilizado);
  const saldo = previsto - utilizado;
  const borderColor = saldo < 0 ? 'border-l-red-500' : 'border-l-blue-500';

  return (
    <div className={`bg-white border border-gray-200 border-l-4 ${borderColor} rounded-xl p-3 space-y-1`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 leading-tight">{rubrica.rubrica || rubrica.nome}</p>
          {rubrica.grupo && <p className="text-xs text-gray-500 mt-0.5">{rubrica.grupo}</p>}
          {Array.isArray(rubrica.meta_manual_ids) && rubrica.meta_manual_ids.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {rubrica.meta_manual_ids.map(m => (
                <span key={m} className="text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">{m}</span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => setEditando(v => !v)}
          className="flex-shrink-0 p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
          title="Editar rubrica"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-xs pt-1">
        <div>
          <p className="text-gray-400">Previsto</p>
          <p className="font-semibold text-gray-800">{fmtBRL(previsto)}</p>
        </div>
        <div>
          <p className="text-gray-400">Utilizado</p>
          <p className="font-semibold text-gray-800">{fmtBRL(utilizado)}</p>
        </div>
        <div>
          <p className="text-gray-400">Saldo</p>
          <p className={`font-bold ${saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>{fmtBRL(saldo)}</p>
        </div>
      </div>

      {editando && (
        <RubricaEditForm
          rubrica={rubrica}
          onClose={() => setEditando(false)}
          onSaved={() => { setEditando(false); onSaved(); }}
        />
      )}
    </div>
  );
}

export default function CentrosCustoCards() {
  const [drawerCentro, setDrawerCentro] = useState(null);
  const queryClient = useQueryClient();

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-centros-transversais'],
    queryFn: async () => {
      const all = await base44.entities.Rubrica.list('ordem_exibicao', 1000);
      return all.filter(r => r?.ativo !== false);
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: compras = [] } = useQuery({
    queryKey: ['compras-aprovadas-centros'],
    queryFn: () => base44.entities.PurchaseRequest.filter({
      status: { $in: ['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'] }
    }, '-created_date', 2000),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });

  const { utilizadoPorRubricaId, rubricasUnicas } = useMemo(() => {
    const STATUS_APROVADOS = new Set(['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
    const utilMap = {};
    for (const c of compras) {
      const rid = c.rubrica_id;
      if (!rid) continue;
      if (!STATUS_APROVADOS.has(String(c.status || '').toUpperCase())) continue;
      const val = toNumber(c.valor_pago || c.valor_aprovado_admin || c.valor_aprovado || c.valor_solicitado);
      utilMap[rid] = (utilMap[rid] || 0) + val;
    }

    const seen = new Set();
    const unicas = rubricas.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    return { utilizadoPorRubricaId: utilMap, rubricasUnicas: unicas };
  }, [rubricas, compras]);

  const resumoPorCentro = useMemo(() => {
    const STATUS_PAGO = new Set(['PAGO']);
    const pagoPorRubricaId = {};
    for (const c of compras) {
      const rid = c.rubrica_id;
      if (!rid || !STATUS_PAGO.has(String(c.status || '').toUpperCase())) continue;
      const val = toNumber(c.valor_pago || c.valor_aprovado_admin || c.valor_aprovado || c.valor_solicitado);
      pagoPorRubricaId[rid] = (pagoPorRubricaId[rid] || 0) + val;
    }

    const mapa = {};
    for (const centro of CENTROS_TRANSVERSAIS) {
      mapa[centro] = { centro, totalOrcado: 0, totalUtilizado: 0, totalSaldo: 0, pct: 0, totalPago: 0, rubricasCount: 0 };
    }

    for (const r of rubricasUnicas) {
      const centroNorm = normalizeCentro(String(r.centro_custo || '').trim());
      if (!centroNorm) continue;

      const previsto = toNumber(r.valor_rubrica || r.valor_total);
      const utilCompras = utilizadoPorRubricaId[r.id];
      const utilizado = utilCompras !== undefined && utilCompras > 0 ? utilCompras : toNumber(r.valor_utilizado);
      const pago = pagoPorRubricaId[r.id] || 0;

      mapa[centroNorm].totalOrcado += previsto;
      mapa[centroNorm].totalUtilizado += utilizado;
      mapa[centroNorm].totalPago += pago;
      mapa[centroNorm].rubricasCount += 1;
    }

    return CENTROS_TRANSVERSAIS
      .map((centro) => {
        const d = mapa[centro];
        if (d.totalOrcado === 0 && d.totalUtilizado === 0) return null;
        const totalOrcado = Number(d.totalOrcado.toFixed(2));
        const totalUtilizado = Number(d.totalUtilizado.toFixed(2));
        const totalPago = Number(d.totalPago.toFixed(2));
        const totalSaldo = Number((totalOrcado - totalUtilizado).toFixed(2));
        const pct = totalOrcado > 0 ? Number(((totalUtilizado / totalOrcado) * 100).toFixed(2)) : 0;
        return { ...d, totalOrcado, totalUtilizado, totalPago, totalSaldo, pct };
      })
      .filter(d => d !== null);
  }, [rubricasUnicas, compras, utilizadoPorRubricaId]);

  // Rubricas do centro selecionado no drawer
  const rubricasDrawer = useMemo(() => {
    if (!drawerCentro) return [];
    return rubricasUnicas.filter(r => normalizeCentro(String(r.centro_custo || '').trim()) === drawerCentro);
  }, [rubricasUnicas, drawerCentro]);

  const drawerItem = resumoPorCentro.find(i => i.centro === drawerCentro);

  function handleSaved() {
    queryClient.invalidateQueries({ queryKey: ['rubricas-centros-transversais'] });
  }

  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-gray-700" />
          <h2 className="text-lg font-semibold text-gray-900">Centros de Custo Transversais</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {resumoPorCentro.map((item) => {
            const progressWidth = `${Math.min(toNumber(item.pct), 100)}%`;
            const barColor = item.pct > 90 ? 'bg-red-500' : item.pct > 70 ? 'bg-amber-500' : 'bg-blue-600';

            return (
              <Card
                key={item.centro}
                onClick={() => setDrawerCentro(item.centro)}
                className="cursor-pointer transition-all rounded-2xl shadow-sm border-gray-200 bg-white hover:shadow-md hover:border-blue-300 hover:-translate-y-0.5"
              >
                <CardContent className="p-4">
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{item.centro}</h3>
                    <p className="text-xs text-gray-500">{item.rubricasCount} rubrica(s) · clique para detalhar</p>
                  </div>

                  <div className="w-full h-1.5 rounded-full overflow-hidden mb-3 bg-gray-100">
                    <div className={`h-1.5 rounded-full transition-all ${barColor}`} style={{ width: progressWidth }} />
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-gray-500">
                      <span>Previsto</span>
                      <span className="font-semibold text-gray-900">{fmtBRL(item.totalOrcado)}</span>
                    </div>
                    <div className="flex justify-between text-gray-500">
                      <span>Utilizado</span>
                      <span className="font-semibold text-gray-900">{fmtBRL(item.totalUtilizado)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 mt-2 text-gray-500">
                      <span className="font-semibold">Saldo</span>
                      <span className={`font-bold ${item.totalSaldo < 0 ? 'text-red-600' : 'text-green-700'}`}>
                        {fmtBRL(item.totalSaldo)}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Drawer lateral */}
      <Sheet open={!!drawerCentro} onOpenChange={open => { if (!open) setDrawerCentro(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-[480px] overflow-y-auto p-0">
          {/* Cabeçalho */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 z-10">
            <SheetHeader>
              <SheetTitle className="text-base font-bold text-gray-900">{drawerCentro}</SheetTitle>
            </SheetHeader>
            {drawerItem && (
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-center">
                  <p className="text-xs text-gray-500">Previsto</p>
                  <p className="text-sm font-bold text-gray-900">{fmtBRL(drawerItem.totalOrcado)}</p>
                </div>
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-center">
                  <p className="text-xs text-gray-500">Utilizado</p>
                  <p className="text-sm font-bold text-gray-900">{fmtBRL(drawerItem.totalUtilizado)}</p>
                </div>
                <div className={`rounded-lg px-3 py-2 text-center border ${drawerItem.totalSaldo < 0 ? 'bg-red-50 border-red-200' : 'bg-emerald-50 border-emerald-200'}`}>
                  <p className="text-xs text-gray-500">Saldo</p>
                  <p className={`text-sm font-bold ${drawerItem.totalSaldo < 0 ? 'text-red-700' : 'text-emerald-700'}`}>{fmtBRL(drawerItem.totalSaldo)}</p>
                </div>
              </div>
            )}
          </div>

          {/* Lista de rubricas */}
          <div className="px-5 py-4 space-y-3">
            {rubricasDrawer.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhuma rubrica encontrada para este centro.</p>
            ) : rubricasDrawer.map(r => (
              <RubricaDrawerCard
                key={r.id}
                rubrica={r}
                utilizadoPorRubricaId={utilizadoPorRubricaId}
                onSaved={handleSaved}
              />
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}