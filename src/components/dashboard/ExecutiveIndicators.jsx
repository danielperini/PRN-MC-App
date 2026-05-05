import React from 'react';
import { base44 } from '@/api/base44Client';
import { Activity, Wallet, BarChart3, CalendarDays } from 'lucide-react';

const MONTH_ORDER = [
  'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
  'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];

const MUSEUS = ['MIS', 'MHAB', 'MUMO'];

function toInt(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? Math.round(n) : 0;
}

function fmtInt(value) {
  return toInt(value).toLocaleString('pt-BR');
}

function getProgramacaoDate(item) {
  const raw =
    item?.data_realizacao ||
    item?.data_programacao ||
    item?.data_inicio ||
    item?.data ||
    item?.inicio ||
    '';

  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}/.test(String(raw))) {
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const br = String(raw).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) {
    const d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function MiniBar({ label, value, max, color = 'bg-black' }) {
  const safeValue = toInt(value);
  const safeMax = Math.max(toInt(max), 1);
  const pct = Math.min((safeValue / safeMax) * 100, 100);

  return (
    <div className="mb-2.5">
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span className="truncate max-w-[60%]">{label}</span>
        <span className="font-semibold text-black">{fmtInt(safeValue)}</span>
      </div>
      <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-1 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function CardSection({ title, children, empty, className = '' }) {
  return (
    <div className={`border border-gray-200 rounded-2xl p-4 bg-white shadow-sm ${className}`}>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</p>
      {empty ? (
        <p className="text-xs text-gray-400">Sem dados disponíveis</p>
      ) : children}
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, highlight = false, helper }) {
  return (
    <div className={`p-5 border rounded-2xl transition-all shadow-sm min-w-0 ${
      highlight
        ? 'border-black bg-black text-white shadow-md'
        : 'border-gray-200 bg-white hover:shadow-md'
    }`}>
      <div className="flex items-center gap-2 mb-3 min-w-0">
        {Icon && <Icon className={`w-4 h-4 flex-shrink-0 ${highlight ? 'text-white' : 'text-gray-500'}`} />}
        <span className={`text-[11px] font-semibold uppercase tracking-wide truncate ${highlight ? 'text-gray-300' : 'text-gray-500'}`}>
          {label}
        </span>
      </div>
      <p className={`text-3xl font-bold leading-tight truncate ${highlight ? 'text-white' : 'text-black'}`}>
        {value}
      </p>
      {helper && (
        <p className={`text-xs mt-1 truncate ${highlight ? 'text-gray-300' : 'text-gray-500'}`}>
          {helper}
        </p>
      )}
    </div>
  );
}

export default function ExecutiveIndicators({ reports = [], rubricas = [] }) {
  const TOTAL_PREVISTO = 1320000;
  const [atividadesPrevistasMes, setAtividadesPrevistasMes] = React.useState(0);

  React.useEffect(() => {
    let mounted = true;

    async function carregarProgramacaoMesAtual() {
      try {
        const hoje = new Date();
        const mesAtual = hoje.getMonth();
        const anoAtual = hoje.getFullYear();

        const lista = await base44.entities.Programacao.list('-data_realizacao', 1000).catch(() => []);

        const total = (lista || []).filter((item) => {
          const d = getProgramacaoDate(item);
          if (!d) return false;

          return d.getMonth() === mesAtual && d.getFullYear() === anoAtual;
        }).length;

        if (mounted) setAtividadesPrevistasMes(total);
      } catch {
        if (mounted) setAtividadesPrevistasMes(0);
      }
    }

    carregarProgramacaoMesAtual();

    return () => { mounted = false; };
  }, []);

  const orcamento = React.useMemo(() => {
    const totalUtilizado = rubricas.reduce((acc, r) => acc + Number(r.valor_utilizado || 0), 0);
    const percentual = (totalUtilizado / TOTAL_PREVISTO) * 100;
    return { totalUtilizado, percentual };
  }, [rubricas]);

  const fmtBRL = (v) => Number(v || 0).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });

  return (
    <div className="mt-8 space-y-5">

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">

        <KpiCard
          label="Atividades previstas"
          value={fmtInt(atividadesPrevistasMes)}
          icon={CalendarDays}
          highlight
        />

        <KpiCard
          label="Execução"
          value={`${orcamento.percentual.toFixed(1)}%`}
          icon={BarChart3}
        />

        <KpiCard
          label="Utilizado"
          value={fmtBRL(orcamento.totalUtilizado)}
          icon={Wallet}
        />

      </div>

    </div>
  );
}
