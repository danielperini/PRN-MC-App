import React from 'react';
import { Wallet, TrendingUp, Layers, PiggyBank, Search, X, Pencil, Check, Loader2 } from 'lucide-react';
import { isOrigemAditivo } from '@/services/canonicalMetrics';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const TOTAL_PREVISTO_OFICIAL = 1401719.85;

function n(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtBRL(value) {
  return n(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPct(value) {
  return `${n(value).toFixed(1)}%`;
}

function getRubricaTotal(rubrica) {
  return n(
    rubrica?.valor_rubrica ??
    rubrica?.valor_total ??
    rubrica?.valor_total_original ??
    rubrica?.valor_original ??
    rubrica?.total ??
    rubrica?.valor_previsto ??
    0
  );
}

function getRubricaUsed(rubrica) {
  return n(
    rubrica?.valor_utilizado ??
    rubrica?.utilizado ??
    rubrica?.valor_usado ??
    rubrica?.valor_executado ??
    0
  );
}

function getGroupName(rubrica) {
  return (
    rubrica?.grupo ||
    rubrica?.grupo_rubrica ||
    rubrica?.categoria ||
    rubrica?.eixo ||
    rubrica?.tipo ||
    'Sem grupo informado'
  );
}

function getRubricaName(rubrica) {
  return rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || 'Rubrica sem nome';
}

function BudgetKpi({ label, value, helper, icon: Icon, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-all hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20"
      title="Clique para ver memória de cálculo"
    >
      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="break-words text-xl font-bold leading-tight text-foreground tabular-nums md:text-[1.18rem]">{value}</div>
      {helper && <div className="mt-1 text-xs text-muted-foreground">{helper}</div>}
      <div className="mt-3 text-[11px] font-medium text-primary">Ver memória de cálculo</div>
    </button>
  );
}

function GrupoCell({ row, allGroups, onSave }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(row.grupo);
  const [saving, setSaving] = React.useState(false);
  const inputRef = React.useRef(null);

  // Suggestions: all existing group names
  const suggestions = React.useMemo(() => {
    const q = value.trim().toLowerCase();
    return allGroups.filter((g) => g.toLowerCase().includes(q) && g !== row.grupo);
  }, [allGroups, value, row.grupo]);

  function handleEdit() {
    setValue(row.grupo);
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 50);
  }

  function handleCancel() {
    setEditing(false);
    setValue(row.grupo);
  }

  async function handleSave() {
    const novoGrupo = value.trim();
    if (!novoGrupo || novoGrupo === row.grupo) { setEditing(false); return; }
    setSaving(true);
    try {
      await base44.entities.Rubrica.update(row.id, { grupo: novoGrupo });
      onSave(row.id, novoGrupo);
      toast.success(`Grupo atualizado para "${novoGrupo}"`);
      setEditing(false);
    } catch (err) {
      toast.error('Erro ao salvar grupo: ' + (err?.message || 'desconhecido'));
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <span className="group flex items-center gap-1">
        <span className="text-muted-foreground">{row.grupo}</span>
        <button
          type="button"
          onClick={handleEdit}
          className="invisible shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground group-hover:visible"
          title="Mover para outro grupo"
        >
          <Pencil className="h-3 w-3" />
        </button>
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      <span className="relative flex-1 min-w-[140px]">
        <input
          ref={inputRef}
          list={`grupos-${row.id}`}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
          className="w-full rounded border border-primary bg-background px-2 py-0.5 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          disabled={saving}
          autoFocus
        />
        <datalist id={`grupos-${row.id}`}>
          {suggestions.map((g) => <option key={g} value={g} />)}
        </datalist>
      </span>
      {saving ? (
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      ) : (
        <>
          <button type="button" onClick={handleSave} className="rounded p-0.5 text-green-600 hover:bg-green-50" title="Salvar"><Check className="h-4 w-4" /></button>
          <button type="button" onClick={handleCancel} className="rounded p-0.5 text-muted-foreground hover:bg-muted" title="Cancelar"><X className="h-4 w-4" /></button>
        </>
      )}
    </span>
  );
}

function DrilldownModal({ open, onOpenChange, title, description, rows = [], totals, allGroups = [], isCoordenador = false, onRubricaGroupChange }) {
  const [query, setQuery] = React.useState('');
  const [localRows, setLocalRows] = React.useState(rows);

  // Sync rows when modal opens or rows change
  React.useEffect(() => { setLocalRows(rows); }, [rows]);

  const filteredRows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return localRows;
    return localRows.filter((row) => [row.rubrica, row.grupo, row.meta].join(' ').toLowerCase().includes(q));
  }, [query, localRows]);

  function handleSave(id, novoGrupo) {
    setLocalRows((prev) => prev.map((r) => r.id === id ? { ...r, grupo: novoGrupo } : r));
    onRubricaGroupChange?.(id, novoGrupo);
  }

  // Recalculate totals from localRows
  const localTotals = React.useMemo(() => {
    const previsto = localRows.reduce((a, r) => a + r.previsto, 0);
    const utilizado = localRows.reduce((a, r) => a + r.utilizado, 0);
    const saldo = previsto - utilizado;
    const percentual = previsto > 0 ? (utilizado / previsto) * 100 : 0;
    return { previsto: previsto || totals?.previsto, utilizado: utilizado || totals?.utilizado, saldo: saldo || totals?.saldo, percentual: percentual || totals?.percentual };
  }, [localRows, totals]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{title || 'Memória de cálculo'}</DialogTitle>
          <DialogDescription>
            {description || 'Detalhamento dos valores usados no cálculo do card.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-xl border bg-muted/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Previsto</div>
            <div className="text-base font-bold leading-tight tabular-nums">{fmtBRL(localTotals?.previsto)}</div>
          </div>
          <div className="rounded-xl border bg-muted/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Utilizado</div>
            <div className="text-base font-bold leading-tight tabular-nums">{fmtBRL(localTotals?.utilizado)}</div>
          </div>
          <div className="rounded-xl border bg-muted/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Saldo</div>
            <div className="text-base font-bold leading-tight tabular-nums">{fmtBRL(localTotals?.saldo)}</div>
          </div>
          <div className="rounded-xl border bg-muted/40 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Execução</div>
            <div className="text-lg font-bold">{fmtPct(localTotals?.percentual)}</div>
          </div>
        </div>

        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar rubrica, grupo ou meta..."
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-primary/20"
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="max-h-[55vh] overflow-auto rounded-xl border">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="p-3">Rubrica</th>
                <th className="p-3">Grupo</th>
                <th className="p-3">Meta</th>
                <th className="p-3 text-right">Previsto</th>
                <th className="p-3 text-right">Utilizado</th>
                <th className="p-3 text-right">Saldo</th>
                <th className="p-3 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.id || `${row.rubrica}-${row.grupo}`} className="border-t">
                  <td className="p-3 font-medium text-foreground">{row.rubrica}</td>
                  <td className="p-3">
                    {isCoordenador && row.id ? (
                      <GrupoCell row={row} allGroups={allGroups} onSave={handleSave} />
                    ) : (
                      <span className="text-muted-foreground">{row.grupo}</span>
                    )}
                  </td>
                  <td className="p-3 text-muted-foreground">{row.meta || '—'}</td>
                  <td className="p-3 text-right tabular-nums">{fmtBRL(row.previsto)}</td>
                  <td className="p-3 text-right tabular-nums">{fmtBRL(row.utilizado)}</td>
                  <td className="p-3 text-right tabular-nums">{fmtBRL(row.saldo)}</td>
                  <td className="p-3 text-right tabular-nums font-semibold">{fmtPct(row.percentual)}</td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-muted-foreground">Nenhuma rubrica encontrada.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="text-xs text-muted-foreground">
          Fórmula: utilizado ÷ previsto × 100. Saldo = previsto − utilizado. Fonte: rubricas ativas do 3º Aditivo.
          {isCoordenador && <span className="ml-2 text-primary">· Passe o mouse sobre o grupo para mover a rubrica.</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function BudgetByGroupCards({ rubricas = [], isCoordenador = false }) {
  const [drilldown, setDrilldown] = React.useState(null);
  const queryClient = useQueryClient();

  const activeRubricas = React.useMemo(
    () => (Array.isArray(rubricas) ? rubricas : []).filter((r) => r?.ativo !== false && isOrigemAditivo(r)),
    [rubricas]
  );

  const rubricaRows = React.useMemo(() => activeRubricas.map((rubrica) => {
    const previsto = getRubricaTotal(rubrica);
    const utilizado = getRubricaUsed(rubrica);
    const saldo = previsto - utilizado;
    const percentual = previsto > 0 ? (utilizado / previsto) * 100 : 0;
    return {
      id: rubrica.id,
      rubrica: getRubricaName(rubrica),
      grupo: getGroupName(rubrica),
      meta: rubrica?.meta_titulo || rubrica?.meta || rubrica?.meta_numero || '',
      previsto,
      utilizado,
      saldo,
      percentual,
    };
  }), [activeRubricas]);

  const totals = React.useMemo(() => {
    const totalRubricas = rubricaRows.reduce((acc, r) => acc + r.previsto, 0);
    const utilizado = rubricaRows.reduce((acc, r) => acc + r.utilizado, 0);
    const previsto = totalRubricas > 0 ? totalRubricas : TOTAL_PREVISTO_OFICIAL;
    const saldo = previsto - utilizado;
    const percentual = previsto > 0 ? (utilizado / previsto) * 100 : 0;

    return { previsto, utilizado, saldo, percentual };
  }, [rubricaRows]);

  const allGroupNames = React.useMemo(() => {
    const names = new Set(rubricaRows.map((r) => r.grupo));
    return Array.from(names).sort();
  }, [rubricaRows]);

  const groups = React.useMemo(() => {
    // Usa chave normalizada (lowercase+trim) para unir grupos com variação de capitalização
    // ex: "Despesas gerais" e "Despesas Gerais" são o mesmo grupo
    const map = new Map();

    rubricaRows.forEach((rubrica) => {
      const key = rubrica.grupo.trim().toLowerCase();
      const existing = map.get(key);
      if (existing) {
        existing.total += rubrica.previsto;
        existing.utilizado += rubrica.utilizado;
        existing.rubricas += 1;
        existing.rows.push(rubrica);
      } else {
        map.set(key, {
          grupo: rubrica.grupo, // preserva o nome do primeiro encontrado
          total: rubrica.previsto,
          utilizado: rubrica.utilizado,
          rubricas: 1,
          rows: [rubrica],
        });
      }
    });

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        saldo: group.total - group.utilizado,
        percentual: group.total > 0 ? (group.utilizado / group.total) * 100 : 0,
      }))
      .sort((a, b) => b.percentual - a.percentual || b.utilizado - a.utilizado);
  }, [rubricaRows]);

  if (activeRubricas.length === 0) return null;

  function handleRubricaGroupChange(id, novoGrupo) {
    // Invalidate so cards recalculate groups
    queryClient.invalidateQueries({ queryKey: ['dashboard-rubricas'] });
    queryClient.invalidateQueries({ queryKey: ['rubricas'] });
  }

  function openAll() {
    setDrilldown({
      title: 'Memória de cálculo — Orçamento geral',
      description: 'Todas as rubricas ativas consideradas nos cards de orçamento.',
      rows: rubricaRows,
      totals,
    });
  }

  function openGroup(group) {
    setDrilldown({
      title: `Memória de cálculo — ${group.grupo}`,
      description: `${group.rubricas} rubrica${group.rubricas === 1 ? '' : 's'} vinculada${group.rubricas === 1 ? '' : 's'} ao grupo.`,
      rows: group.rows,
      totals: {
        previsto: group.total,
        utilizado: group.utilizado,
        saldo: group.saldo,
        percentual: group.percentual,
      },
    });
  }

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-card/70 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Orçamento e execução por grupo</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Percentual calculado sobre o valor original das rubricas, sem rendimentos e sem saldo comprometido.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={openAll}>
          Ver memória geral
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <BudgetKpi label="Previsto" value={fmtBRL(totals.previsto)} helper="base oficial das rubricas" icon={Wallet} onClick={openAll} />
        <BudgetKpi label="Utilizado" value={fmtBRL(totals.utilizado)} helper={fmtPct(totals.percentual)} icon={TrendingUp} onClick={openAll} />
        <BudgetKpi label="Saldo" value={fmtBRL(totals.saldo)} helper="previsto menos utilizado" icon={PiggyBank} onClick={openAll} />
        <BudgetKpi label="Rubricas ativas" value={activeRubricas.length.toLocaleString('pt-BR')} helper={`${groups.length} grupo${groups.length === 1 ? '' : 's'}`} icon={Layers} onClick={openAll} />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {groups.map((group) => {
          const width = Math.min(Math.max(group.percentual, 0), 100);
          return (
            <button key={group.grupo.trim().toLowerCase()} type="button" onClick={() => openGroup(group)} className="rounded-2xl border border-border bg-background p-4 text-left transition-all hover:border-primary/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/20">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">{group.grupo}</h3>
                  <p className="text-[11px] leading-tight text-muted-foreground">
                    {group.rubricas} rubrica{group.rubricas === 1 ? '' : 's'} · <span className="tabular-nums">{fmtBRL(group.utilizado)}</span> usado
                  </p>
                </div>
                <div className="shrink-0 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">
                  {fmtPct(group.percentual)}
                </div>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${width}%` }} />
              </div>

              <div className="mt-2 flex justify-between gap-2 text-[10.5px] leading-tight text-muted-foreground">
                <span className="min-w-0 break-words tabular-nums">Total: {fmtBRL(group.total)}</span>
                <span className="min-w-0 break-words text-right tabular-nums">Saldo: {fmtBRL(group.saldo)}</span>
              </div>
              <div className="mt-2 text-[11px] font-medium text-primary">Clique para detalhar</div>
            </button>
          );
        })}
      </div>

      <DrilldownModal
        open={!!drilldown}
        onOpenChange={(open) => !open && setDrilldown(null)}
        title={drilldown?.title}
        description={drilldown?.description}
        rows={drilldown?.rows || []}
        totals={drilldown?.totals}
        allGroups={allGroupNames}
        isCoordenador={isCoordenador}
        onRubricaGroupChange={handleRubricaGroupChange}
      />
    </section>
  );
}