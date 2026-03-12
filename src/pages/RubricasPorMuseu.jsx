import React, { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Building2, Wrench, BookOpen, Coffee, CreditCard, Package, Zap, Star, TrendingUp, AlertTriangle, CheckCircle, Settings } from 'lucide-react';
import GerenciarRubricasMuseuDialog from '@/components/rubricas/GerenciarRubricasMuseuDialog';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

const MUSEU_COLORS = {
  MHAB: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-800', accent: 'text-blue-700' },
  MIS:  { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-800', accent: 'text-emerald-700' },
  MUMO: { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-800', accent: 'text-purple-700' },
};

const CATEGORIAS = [
  { key: 'manutencao', label: 'Manutenção de Rotina', icon: Wrench, color: 'text-orange-600' },
  { key: 'diarias_educador', label: 'Diárias de Educador', icon: BookOpen, color: 'text-blue-600' },
  { key: 'lanches', label: 'Lanches', icon: Coffee, color: 'text-yellow-600' },
  { key: 'alimentacao_cartao', label: 'Alimentação Cartão', icon: CreditCard, color: 'text-green-600' },
  { key: 'material', label: 'Material', icon: Package, color: 'text-indigo-600' },
  { key: 'acoes_educativas', label: 'Ações Educativas', icon: Star, color: 'text-pink-600' },
  { key: 'som_luz', label: 'Som e Luz', icon: Zap, color: 'text-yellow-500' },
  { key: 'exposicao', label: 'Exposição', icon: Building2, color: 'text-purple-600' },
];

function mapearPorConfig(rubricas, configs) {
  const rubricaById = Object.fromEntries(rubricas.map(r => [r.id, r]));

  const mapa = {};
  for (const m of MUSEUS) {
    mapa[m] = {};
    for (const c of CATEGORIAS) {
      mapa[m][c.key] = { valor_total: 0, valor_utilizado: 0, saldo: 0, percentual: 0, rubricas: [] };
    }
  }

  for (const cfg of configs) {
    const r = rubricaById[cfg.rubrica_id];
    if (!r || r.ativo === false) continue;
    const cat = mapa[cfg.museu]?.[cfg.categoria_key];
    if (!cat) continue;
    const divisor = cfg.divisor || 1;
    cat.rubricas.push({ ...r, divisor, museu: cfg.museu });
  }

  for (const m of MUSEUS) {
    for (const c of CATEGORIAS) {
      const cat = mapa[m][c.key];
      cat.valor_total = cat.rubricas.reduce((s, r) => s + (r.valor_rubrica || 0) / r.divisor, 0);
      cat.valor_utilizado = cat.rubricas.reduce((s, r) => s + (r.valor_utilizado || 0) / r.divisor, 0);
      cat.saldo = cat.valor_total - cat.valor_utilizado;
      cat.percentual = cat.valor_total > 0 ? (cat.valor_utilizado / cat.valor_total) * 100 : 0;
    }
  }

  return mapa;
}

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v || 0);
}

function StatusBadge({ percentual }) {
  if (percentual >= 90) return <Badge className="bg-red-100 text-red-700 text-xs"><AlertTriangle className="w-3 h-3 mr-1" />Crítico</Badge>;
  if (percentual >= 70) return <Badge className="bg-yellow-100 text-yellow-700 text-xs">Atenção</Badge>;
  return <Badge className="bg-green-100 text-green-700 text-xs"><CheckCircle className="w-3 h-3 mr-1" />OK</Badge>;
}

function CategoriaCard({ categoria, dados, museu }) {
  const CatIcon = categoria.icon;
  const colors = MUSEU_COLORS[museu];
  const temDados = dados.valor_total > 0;

  return (
    <Card className={`border ${colors.border} transition-shadow hover:shadow-md`}>
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CatIcon className={`w-4 h-4 ${categoria.color}`} />
            <CardTitle className="text-sm font-semibold text-gray-800">{categoria.label}</CardTitle>
          </div>
          {temDados && <StatusBadge percentual={dados.percentual} />}
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        {!temDados ? (
          <p className="text-xs text-gray-400 italic">Sem rubricas configuradas</p>
        ) : (
          <div className="space-y-2">
            <div className="flex justify-between text-xs text-gray-500">
              <span>Orçado</span>
              <span className="font-medium text-gray-800">{fmt(dados.valor_total)}</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Utilizado</span>
              <span className={`font-medium ${dados.percentual >= 90 ? 'text-red-600' : 'text-gray-800'}`}>{fmt(dados.valor_utilizado)}</span>
            </div>
            <Progress value={Math.min(dados.percentual, 100)} className="h-1.5" />
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">{dados.percentual.toFixed(1)}% utilizado</span>
              <span className="text-xs font-semibold text-gray-700">Saldo: {fmt(dados.saldo)}</span>
            </div>
            {dados.rubricas.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100 space-y-1">
                {dados.rubricas.map((r, i) => (
                  <div key={i} className="flex items-center gap-1">
                    <span className="text-xs text-gray-400 truncate flex-1">{r.rubrica}</span>
                    {r.divisor > 1 && <Badge variant="outline" className="text-xs px-1 py-0 shrink-0">÷{r.divisor}</Badge>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MuseuPanel({ museu, mapa }) {
  const colors = MUSEU_COLORS[museu];
  const dados = mapa[museu];

  const totalOrcado = Object.values(dados).reduce((s, c) => s + c.valor_total, 0);
  const totalUtilizado = Object.values(dados).reduce((s, c) => s + c.valor_utilizado, 0);
  const totalSaldo = totalOrcado - totalUtilizado;
  const percentualGeral = totalOrcado > 0 ? (totalUtilizado / totalOrcado) * 100 : 0;

  return (
    <div className="space-y-4">
      <div className={`rounded-xl border-2 ${colors.border} ${colors.bg} p-4`}>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors.badge}`}>
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className={`text-xl font-bold ${colors.accent}`}>{museu}</h2>
              <p className="text-xs text-gray-500">Acompanhamento orçamentário por rubrica</p>
            </div>
          </div>
          <div className="flex gap-6 text-center">
            <div>
              <p className="text-xs text-gray-500">Total Orçado</p>
              <p className={`text-base font-bold ${colors.accent}`}>{fmt(totalOrcado)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Utilizado</p>
              <p className="text-base font-bold text-gray-800">{fmt(totalUtilizado)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Saldo</p>
              <p className={`text-base font-bold ${totalSaldo < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmt(totalSaldo)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">% Uso</p>
              <p className={`text-base font-bold ${percentualGeral >= 90 ? 'text-red-600' : percentualGeral >= 70 ? 'text-yellow-600' : 'text-green-600'}`}>{percentualGeral.toFixed(1)}%</p>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <Progress value={Math.min(percentualGeral, 100)} className="h-2" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {CATEGORIAS.map(cat => (
          <CategoriaCard key={cat.key} categoria={cat} dados={dados[cat.key]} museu={museu} />
        ))}
      </div>
    </div>
  );
}

function ResumoGeral({ mapa }) {
  const resumo = MUSEUS.map(m => {
    const dados = mapa[m];
    const totalOrcado = Object.values(dados).reduce((s, c) => s + c.valor_total, 0);
    const totalUtilizado = Object.values(dados).reduce((s, c) => s + c.valor_utilizado, 0);
    const percentual = totalOrcado > 0 ? (totalUtilizado / totalOrcado) * 100 : 0;
    return { museu: m, totalOrcado, totalUtilizado, saldo: totalOrcado - totalUtilizado, percentual };
  });

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
      {resumo.map(({ museu, totalOrcado, totalUtilizado, saldo, percentual }) => {
        const colors = MUSEU_COLORS[museu];
        return (
          <Card key={museu} className={`border-2 ${colors.border} ${colors.bg}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className={`text-lg font-bold ${colors.accent}`}>{museu}</span>
                <StatusBadge percentual={percentual} />
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Orçado</span>
                  <span className="font-semibold">{fmt(totalOrcado)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Utilizado</span>
                  <span className="font-semibold">{fmt(totalUtilizado)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Saldo</span>
                  <span className={`font-bold ${saldo < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmt(saldo)}</span>
                </div>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>Execução</span>
                  <span>{percentual.toFixed(1)}%</span>
                </div>
                <Progress value={Math.min(percentual, 100)} className="h-2" />
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function RubricasPorMuseu() {
  const [museuAtivo, setMuseuAtivo] = useState('MHAB');
  const [showGerenciar, setShowGerenciar] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  React.useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
  }, []);

  const isCoordenador = currentUser && ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);

  const { data: rubricas = [], isLoading: loadingRubricas } = useQuery({
    queryKey: ['rubricas-all'],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 200),
  });

  const { data: configs = [], isLoading: loadingConfigs } = useQuery({
    queryKey: ['rubrica-museu-configs'],
    queryFn: () => base44.entities.RubricaMuseuConfig.list(),
  });

  const isLoading = loadingRubricas || loadingConfigs;

  const mapa = useMemo(() => {
    const rubricasAtivas = rubricas.filter(r => r.ativo !== false);
    if (!rubricasAtivas.length) return null;
    return mapearPorConfig(rubricasAtivas, configs);
  }, [rubricas, configs]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-gray-800 rounded-full animate-spin" />
      </div>
    );
  }

  if (!mapa) return null;

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-10">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-gray-600" />
            Rubricas por Museu
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Acompanhamento orçamentário por museu
            {configs.length > 0 && <span className="ml-2 text-gray-400">· {configs.length} rubrica(s) configurada(s)</span>}
          </p>
        </div>
        {isCoordenador && (
          <Button variant="outline" className="gap-2" onClick={() => setShowGerenciar(true)}>
            <Settings className="w-4 h-4" />
            Gerenciar Rubricas
          </Button>
        )}
      </div>

      <ResumoGeral mapa={mapa} />

      <Tabs value={museuAtivo} onValueChange={setMuseuAtivo}>
        <TabsList className="grid grid-cols-3 w-full max-w-sm">
          {MUSEUS.map(m => (
            <TabsTrigger key={m} value={m} className="font-semibold">{m}</TabsTrigger>
          ))}
        </TabsList>

        {MUSEUS.map(m => (
          <TabsContent key={m} value={m} className="mt-4">
            <MuseuPanel museu={m} mapa={mapa} />
          </TabsContent>
        ))}
      </Tabs>

      {showGerenciar && (
        <GerenciarRubricasMuseuDialog
          open={showGerenciar}
          onClose={() => setShowGerenciar(false)}
        />
      )}
    </div>
  );
}