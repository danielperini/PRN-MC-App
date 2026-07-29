import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp } from 'lucide-react';
import CentrosCustoDrawer from './CentrosCustoDrawer';

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

// Centros de custo transversais (exclui museus físicos e noturno)
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

export default function CentrosCustoCards() {
  const [drawerCentro, setDrawerCentro] = useState(null);
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

  const resumoPorCentro = useMemo(() => {
    const STATUS_APROVADOS = new Set(['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
    const STATUS_PAGO = new Set(['PAGO']);
    
    const utilizadoPorRubricaId = {};
    const pagoPorRubricaId = {};
    for (const c of compras) {
      const rid = c.rubrica_id;
      if (!rid) continue;
      const status = String(c.status || '').toUpperCase();
      if (!STATUS_APROVADOS.has(status)) continue;
      const val = toNumber(c.valor_pago || c.valor_aprovado_admin || c.valor_aprovado || c.valor_solicitado);
      utilizadoPorRubricaId[rid] = (utilizadoPorRubricaId[rid] || 0) + val;
      if (STATUS_PAGO.has(status)) pagoPorRubricaId[rid] = (pagoPorRubricaId[rid] || 0) + val;
    }

    const mapa = {};
    for (const centro of CENTROS_TRANSVERSAIS) {
      mapa[centro] = { centro, totalOrcado: 0, totalUtilizado: 0, totalSaldo: 0, pct: 0, totalPago: 0, rubricasCount: 0 };
    }

    const seen = new Set();
    const rubricasUnicas = rubricas.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    for (const r of rubricasUnicas) {
      const centroUI = String(r.centro_custo || '').trim();
      const centroNormalizado = CENTROS_TRANSVERSAIS.find(c => 
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

      if (!centroNormalizado) continue;

      const previsto = toNumber(r.valor_rubrica || r.valor_total);
      const utilCompras = utilizadoPorRubricaId[r.id];
      const utilizado = utilCompras !== undefined && utilCompras > 0 ? utilCompras : toNumber(r.valor_utilizado);
      const pago = pagoPorRubricaId[r.id] || 0;

      mapa[centroNormalizado].totalOrcado += previsto;
      mapa[centroNormalizado].totalUtilizado += utilizado;
      mapa[centroNormalizado].totalPago += pago;
      mapa[centroNormalizado].rubricasCount += 1;
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
  }, [rubricas, compras]);

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
                onClick={() => setDrawerCentro(item)}
                className="cursor-pointer transition-all rounded-2xl shadow-sm border-gray-200 bg-white hover:shadow-md hover:ring-2 hover:ring-blue-200"
              >
                <CardContent className="p-4">
                  <div className="mb-3">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{item.centro}</h3>
                    <p className="text-xs text-gray-500">{item.rubricasCount} rubrica(s)</p>
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

      <CentrosCustoDrawer
        centro={drawerCentro}
        rubricas={rubricas}
        compras={compras}
        open={!!drawerCentro}
        onClose={() => setDrawerCentro(null)}
      />
    </>
  );
}