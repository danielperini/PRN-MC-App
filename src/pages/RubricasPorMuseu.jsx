import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Building2, Wrench, BookOpen, Coffee, CreditCard, Package, Zap, Star, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

const MUSEU_COLORS = {
  MHAB: { bg: 'bg-blue-50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-800', accent: 'text-blue-700', progress: 'bg-blue-500' },
  MIS:  { bg: 'bg-emerald-50', border: 'border-emerald-200', badge: 'bg-emerald-100 text-emerald-800', accent: 'text-emerald-700', progress: 'bg-emerald-500' },
  MUMO: { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-800', accent: 'text-purple-700', progress: 'bg-purple-500' },
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

/**
 * Regras de mapeamento:
 * - Se a rubrica contém o museu explicitamente no nome → atribuir só a ele
 * - Se é compartilhada (MIS/MUMO/MHAB) → dividir por 3
 * - Exposição MUMO → só MUMO (não divide)
 */
function mapearRubricas(rubricas) {
  // Resultado: { museu: { categoria: { valor_total, valor_utilizado, saldo, percentual, rubrica_nome, rubrica_id, divisor } } }
  const mapa = {};
  for (const m of MUSEUS) {
    mapa[m] = {};
    for (const c of CATEGORIAS) {
      mapa[m][c.key] = { valor_total: 0, valor_utilizado: 0, saldo: 0, rubricas: [] };
    }
  }

  for (const r of rubricas) {
    const nome = r.rubrica?.toLowerCase() || '';
    const grupo = r.grupo?.toLowerCase() || '';

    // ---- MANUTENÇÃO DE ROTINA ----
    if (nome.includes('manutenção')) {
      if (nome.includes('mis')) {
        mapa['MIS']['manutencao'].rubricas.push({ ...r, divisor: 1, museu: 'MIS' });
      } else if (nome.includes('mumo')) {
        mapa['MUMO']['manutencao'].rubricas.push({ ...r, divisor: 1, museu: 'MUMO' });
      } else if (nome.includes('mhab')) {
        mapa['MHAB']['manutencao'].rubricas.push({ ...r, divisor: 1, museu: 'MHAB' });
      } else if (nome.includes('mis') && nome.includes('mumo') && nome.includes('mhab')) {
        for (const m of MUSEUS) mapa[m]['manutencao'].rubricas.push({ ...r, divisor: 3, museu: m });
      }
    }

    // ---- DIÁRIAS DE EDUCADOR ----
    else if (nome.includes('diária') || nome.includes('diaria')) {
      for (const m of MUSEUS) mapa[m]['diarias_educador'].rubricas.push({ ...r, divisor: 3, museu: m });
    }

    // ---- LANCHES ----
    else if (nome.includes('lanche')) {
      if (nome.includes('mis')) mapa['MIS']['lanches'].rubricas.push({ ...r, divisor: 1, museu: 'MIS' });
      else if (nome.includes('mumo')) mapa['MUMO']['lanches'].rubricas.push({ ...r, divisor: 1, museu: 'MUMO' });
      else if (nome.includes('mhab')) mapa['MHAB']['lanches'].rubricas.push({ ...r, divisor: 1, museu: 'MHAB' });
      else for (const m of MUSEUS) mapa[m]['lanches'].rubricas.push({ ...r, divisor: 3, museu: m });
    }

    // ---- ALIMENTAÇÃO CARTÃO ----
    else if (nome.includes('alimentação') || nome.includes('cartão') || nome.includes('cartao')) {
      if (nome.includes('mis')) mapa['MIS']['alimentacao_cartao'].rubricas.push({ ...r, divisor: 1, museu: 'MIS' });
      else if (nome.includes('mumo')) mapa['MUMO']['alimentacao_cartao'].rubricas.push({ ...r, divisor: 1, museu: 'MUMO' });
      else if (nome.includes('mhab')) mapa['MHAB']['alimentacao_cartao'].rubricas.push({ ...r, divisor: 1, museu: 'MHAB' });
      else for (const m of MUSEUS) mapa[m]['alimentacao_cartao'].rubricas.push({ ...r, divisor: 3, museu: m });
    }

    // ---- MATERIAL ----
    else if ((nome.includes('material') && (nome.includes('educativo') || nome.includes('ativ') || nome.includes('mis') || nome.includes('mumo') || nome.includes('mhab') || grupo.includes('alimentação'))) ) {
      if (nome.includes('mis')) mapa['MIS']['material'].rubricas.push({ ...r, divisor: 1, museu: 'MIS' });
      else if (nome.includes('mumo')) mapa['MUMO']['material'].rubricas.push({ ...r, divisor: 1, museu: 'MUMO' });
      else if (nome.includes('mhab')) mapa['MHAB']['material'].rubricas.push({ ...r, divisor: 1, museu: 'MHAB' });
      else for (const m of MUSEUS) mapa[m]['material'].rubricas.push({ ...r, divisor: 3, museu: m });
    }

    // ---- AÇÕES EDUCATIVAS ----
    else if (nome.includes('ação educativa') || nome.includes('ações educativas') || nome.includes('acoes educativas') || nome.includes('acao educativa') || (nome.includes('ação') && grupo.includes('alimentação'))) {
      if (nome.includes('mis')) mapa['MIS']['acoes_educativas'].rubricas.push({ ...r, divisor: 1, museu: 'MIS' });
      else if (nome.includes('mumo')) mapa['MUMO']['acoes_educativas'].rubricas.push({ ...r, divisor: 1, museu: 'MUMO' });
      else if (nome.includes('mhab')) mapa['MHAB']['acoes_educativas'].rubricas.push({ ...r, divisor: 1, museu: 'MHAB' });
      else for (const m of MUSEUS) mapa[m]['acoes_educativas'].rubricas.push({ ...r, divisor: 3, museu: m });
    }

    // ---- SOM E LUZ ----
    else if (nome.includes('som') || nome.includes('iluminação') || nome.includes('iluminacao')) {
      for (const m of MUSEUS) mapa[m]['som_luz'].rubricas.push({ ...r, divisor: 3, museu: m });
    }

    // ---- EXPOSIÇÃO ----
    else if (nome.includes('exposição') || nome.includes('exposicao')) {
      // Só MUMO, não divide
      mapa['MUMO']['exposicao'].rubricas.push({ ...r, divisor: 1, museu: 'MUMO' });
    }
  }

  // Calcular totais por categoria/museu
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
          <p className="text-xs text-gray-400 italic">Não aplicável a este museu</p>
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
      {/* Header resumo do museu */}
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

      {/* Grid de categorias */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {CATEGORIAS.map(cat => (
          <CategoriaCard
            key={cat.key}
            categoria={cat}
            dados={dados[cat.key]}
            museu={museu}
          />
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

  const { data: rubricas = [], isLoading } = useQuery({
    queryKey: ['rubricas-all'],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 200),
  });

  const mapa = useMemo(() => {
    if (!rubricas.length) return null;
    return mapearRubricas(rubricas.filter(r => r.ativo !== false));
  }, [rubricas]);

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
          <p className="text-sm text-gray-500 mt-1">Acompanhamento orçamentário dividido por museu (1/3 por museu para rubricas compartilhadas)</p>
        </div>
      </div>

      {/* Resumo geral dos 3 museus */}
      <ResumoGeral mapa={mapa} />

      {/* Tabs por museu */}
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
    </div>
  );
}