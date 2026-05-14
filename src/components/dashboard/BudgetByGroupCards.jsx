import React from 'react';
import { Wallet, TrendingUp, Layers, PiggyBank } from 'lucide-react';

const TOTAL_PREVISTO_OFICIAL = 1320000;

function n(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtBRL(value) {
  return n(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

function fmtPct(value) {
  return `${n(value).toFixed(1)}%`;
}

function getRubricaTotal(rubrica) {
  return n(
    rubrica?.valor_total_original ??
    rubrica?.valor_original ??
    rubrica?.valor_total ??
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

function BudgetKpi({ label, value, helper, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-all hover:shadow-md">
      <div className="mb-3 flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      {helper && <div className="mt-1 text-xs text-muted-foreground">{helper}</div>}
    </div>
  );
}

export default function BudgetByGroupCards({ rubricas = [] }) {
  const activeRubricas = React.useMemo(
    () => (Array.isArray(rubricas) ? rubricas : []).filter((r) => r?.ativo !== false),
    [rubricas]
  );

  const totals = React.useMemo(() => {
    const totalRubricas = activeRubricas.reduce((acc, r) => acc + getRubricaTotal(r), 0);
    const utilizado = activeRubricas.reduce((acc, r) => acc + getRubricaUsed(r), 0);
    const previsto = totalRubricas > 0 ? totalRubricas : TOTAL_PREVISTO_OFICIAL;
    const saldo = previsto - utilizado;
    const percentual = previsto > 0 ? (utilizado / previsto) * 100 : 0;

    return { previsto, utilizado, saldo, percentual };
  }, [activeRubricas]);

  const groups = React.useMemo(() => {
    const map = new Map();

    activeRubricas.forEach((rubrica) => {
      const groupName = getGroupName(rubrica);
      const current = map.get(groupName) || {
        grupo: groupName,
        total: 0,
        utilizado: 0,
        rubricas: 0,
      };

      current.total += getRubricaTotal(rubrica);
      current.utilizado += getRubricaUsed(rubrica);
      current.rubricas += 1;
      map.set(groupName, current);
    });

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        saldo: group.total - group.utilizado,
        percentual: group.total > 0 ? (group.utilizado / group.total) * 100 : 0,
      }))
      .sort((a, b) => b.percentual - a.percentual || b.utilizado - a.utilizado);
  }, [activeRubricas]);

  if (activeRubricas.length === 0) return null;

  return (
    <section className="space-y-4 rounded-3xl border border-border bg-card/70 p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Orçamento e execução por grupo</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Percentual calculado sobre o valor original das rubricas, sem rendimentos e sem saldo comprometido.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <BudgetKpi
          label="Previsto"
          value={fmtBRL(totals.previsto)}
          helper="base oficial das rubricas"
          icon={Wallet}
        />
        <BudgetKpi
          label="Utilizado"
          value={fmtBRL(totals.utilizado)}
          helper={fmtPct(totals.percentual)}
          icon={TrendingUp}
        />
        <BudgetKpi
          label="Saldo"
          value={fmtBRL(totals.saldo)}
          helper="previsto menos utilizado"
          icon={PiggyBank}
        />
        <BudgetKpi
          label="Rubricas ativas"
          value={activeRubricas.length.toLocaleString('pt-BR')}
          helper={`${groups.length} grupo${groups.length === 1 ? '' : 's'}`}
          icon={Layers}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {groups.map((group) => {
          const width = Math.min(Math.max(group.percentual, 0), 100);
          return (
            <div key={group.grupo} className="rounded-2xl border border-border bg-background p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-semibold text-foreground">{group.grupo}</h3>
                  <p className="text-xs text-muted-foreground">
                    {group.rubricas} rubrica{group.rubricas === 1 ? '' : 's'} · {fmtBRL(group.utilizado)} usado
                  </p>
                </div>
                <div className="shrink-0 rounded-full border border-border bg-secondary px-2.5 py-1 text-xs font-bold text-secondary-foreground">
                  {fmtPct(group.percentual)}
                </div>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-2 rounded-full bg-primary transition-all" style={{ width: `${width}%` }} />
              </div>

              <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
                <span>Total: {fmtBRL(group.total)}</span>
                <span>Saldo: {fmtBRL(group.saldo)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
