/**
 * RubricasCompartilhadasRateio
 *
 * Exibe, por museu, as rubricas compartilhadas elegíveis ao rateio ÷ 3.
 * Mantém o padrão visual existente e remove rubricas operacionais que não devem
 * aparecer na página Rubricas por Museu.
 */
import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, SplitSquareHorizontal } from 'lucide-react';

const MUSEUS_TOKENS = {
  MIS: ['mis', 'imagem', 'som'],
  MHAB: ['mhab', 'abilio', 'historico'],
  MUMO: ['mumo', 'moda'],
};
const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

const RUBRICAS_RATEIO_FIXAS = [
  {
    id: 'rateio-fixo-alimentacao-acoes-educativas',
    rubrica: 'Alimentação',
    categoria_key: 'Ações educativas',
    categoria: 'Ações educativas',
    valor_rubrica: 3000,
    valor_total: 3000,
    valor_utilizado: 0,
    valor_pago: 0,
    valor_lancamentos: 0,
    observacao_uso: 'Rubrica rateada automaticamente: R$ 3.000,00 ÷ 3 museus = R$ 1.000,00 por museu.',
    ativo: true,
    __synthetic: true,
  },
];

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getRubricaNome(r = {}) {
  return String(r?.rubrica || r?.nome || r?.descricao || 'Rubrica sem nome');
}

function getCategoria(r = {}) {
  return String(r?.categoria_key || r?.categoria || r?.grupo || r?.grupo_nome || 'geral');
}

function getValorOrcado(r = {}) {
  return toNumber(r?.totalOrcado ?? r?.valorOrcado ?? r?.valor_rubrica ?? r?.valor_total ?? r?.orcado ?? r?.previsto ?? 0);
}

function getValorUtilizado(r = {}) {
  return toNumber(r?.valorUtilizado ?? r?.valor_utilizado ?? r?.utilizado ?? r?.realizado ?? 0);
}

function getValorPago(r = {}) {
  return toNumber(r?.valorPago ?? r?.valor_pago ?? r?.pago ?? 0);
}

function getValorLancamentos(r = {}) {
  return toNumber(r?.valorLancamentos ?? r?.valor_lancamentos ?? r?.lancamentos ?? 0);
}

function formatCurrency(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getSearchText(r = {}) {
  return normalizeText([
    r?.rubrica,
    r?.nome,
    r?.descricao,
    r?.grupo,
    r?.categoria,
    r?.categoria_key,
    r?.centro_custo,
    r?.observacao_uso,
  ].filter(Boolean).join(' '));
}

function countMuseuTokens(text = '') {
  return MUSEUS.filter((museu) => MUSEUS_TOKENS[museu].some((tok) => text.includes(tok))).length;
}

function isNoturno(r = {}) {
  return getSearchText(r).includes('noturno');
}

function isLanches(r = {}) {
  const text = getSearchText(r);
  return text.includes('lanche') || text.includes('lanches');
}

function isAlimentacao(r = {}) {
  const text = getSearchText(r);
  return text.includes('alimentacao') || text.includes('alimentacoes');
}

function isMaterialEscritorio(r = {}) {
  const text = getSearchText(r);
  return text.includes('material de escritorio') || text.includes('material escritorio');
}

function isExcludedFromRateio(r = {}) {
  const text = getSearchText(r);

  if (isLanches(r) || isAlimentacao(r)) return false;

  return (
    text.includes('producao') ||
    text.includes('producoes') ||
    text.includes('educador') ||
    text.includes('educadores') ||
    text.includes('diaria educador') ||
    text.includes('diarias educador') ||
    text.includes('consultoria') ||
    text.includes('consultorias') ||
    text.includes('transversal') ||
    text.includes('despesas gerais') ||
    text.includes('despesa geral') ||
    text.includes('equipe') ||
    text.includes('transporte') ||
    text.includes('assessoria juridica') ||
    text.includes('assessor juridico') ||
    text.includes('juridico') ||
    text.includes('contador') ||
    text.includes('contabilidade') ||
    text.includes('energia eletrica') ||
    text.includes('ambiente seguro') ||
    text.includes('diversidade') ||
    text.includes('inclusao') ||
    text.includes('fornecimento de som') ||
    text.includes('fornecimento de som e iluminacao') ||
    isMaterialEscritorio(r)
  );
}

function isRubricaCompartilhada(r = {}) {
  if (isNoturno(r)) return false;
  const text = getSearchText(r);
  const count = countMuseuTokens(text);
  return count === 0 || count >= 2;
}

function flattenAllRubricas(consolidado = {}) {
  const rows = [];
  if (consolidado?.por_museu && typeof consolidado.por_museu === 'object') {
    Object.entries(consolidado.por_museu).forEach(([museuKey, categorias]) => {
      Object.entries(categorias || {}).forEach(([categoriaKey, items]) => {
        (Array.isArray(items) ? items : []).forEach((item) => {
          rows.push({ ...item, categoria_key: item?.categoria_key || categoriaKey, museu_origem: museuKey });
        });
      });
    });
  }
  return rows;
}

function deduplicateRubricas(rows = []) {
  const seen = new Set();
  return rows.filter((r) => {
    const key = r?.id || normalizeText(getRubricaNome(r));
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ensureRubricasFixas(rows = []) {
  const result = [...rows];
  const hasAlimentacao = result.some(isAlimentacao);

  if (!hasAlimentacao) {
    result.push(...RUBRICAS_RATEIO_FIXAS);
  }

  return result;
}

function RubricaRateioCard({ rubrica }) {
  const fator = 1 / 3;

  const orcado = Number((getValorOrcado(rubrica) * fator).toFixed(2));
  const utilizado = Number((getValorUtilizado(rubrica) * fator).toFixed(2));
  const pago = Number((getValorPago(rubrica) * fator).toFixed(2));
  const lancamentos = Number((getValorLancamentos(rubrica) * fator).toFixed(2));
  const saldo = Number((orcado - utilizado).toFixed(2));
  const pct = orcado > 0 ? Number(((utilizado / orcado) * 100).toFixed(1)) : 0;
  const progressWidth = `${Math.min(Math.max(pct, 0), 100)}%`;

  return (
    <Card className="rounded-2xl border-blue-100 bg-blue-50/30 shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-black leading-snug">
              {getRubricaNome(rubrica)}
            </h3>
            <div className="flex flex-wrap gap-1.5 mt-2">
              <Badge className="text-[10px] bg-blue-100 text-blue-700 border-0">
                ÷ 3 rateado
              </Badge>
              {rubrica?.__synthetic && (
                <Badge className="text-[10px] bg-white text-blue-700 border border-blue-100">
                  card fixo
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {getCategoria(rubrica)}
              </Badge>
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-xs text-gray-500">Execução</p>
            <p className={`text-sm font-bold ${pct >= 100 ? 'text-red-600' : pct >= 80 ? 'text-orange-600' : 'text-black'}`}>
              {pct.toFixed(1)}%
            </p>
          </div>
        </div>

        <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
          <div
            className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-red-600' : pct >= 80 ? 'bg-orange-500' : 'bg-blue-600'}`}
            style={{ width: progressWidth }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-gray-500">Previsto (1/3)</p>
            <p className="font-semibold text-black">{formatCurrency(orcado)}</p>
          </div>
          <div>
            <p className="text-gray-500">Utilizado (1/3)</p>
            <p className="font-semibold text-black">{formatCurrency(utilizado)}</p>
          </div>
          <div>
            <p className="text-gray-500">Pago (1/3)</p>
            <p className="font-semibold text-green-700">{formatCurrency(pago)}</p>
          </div>
          <div>
            <p className="text-gray-500">Lançamentos (1/3)</p>
            <p className="font-semibold text-sky-700">{formatCurrency(lancamentos)}</p>
          </div>
        </div>

        <div className="border-t border-blue-100 pt-3 flex justify-between text-sm">
          <span className="text-gray-500">Saldo (1/3)</span>
          <span className={`font-bold ${saldo < 0 ? 'text-red-600' : 'text-black'}`}>
            {formatCurrency(saldo)}
          </span>
        </div>

        <p className="text-[10px] text-blue-500 border-t border-blue-100 pt-2">
          Valor total da rubrica: {formatCurrency(getValorOrcado(rubrica))} · dividido igualmente entre MHAB, MIS e MUMO
        </p>
      </CardContent>
    </Card>
  );
}

export default function RubricasCompartilhadasRateio({ museu = 'MIS', refreshKey = 0 }) {
  const { data, isLoading } = useQuery({
    queryKey: ['rubricas-compartilhadas', refreshKey],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('getRubricasConsolidadas', {});
        const rows = flattenAllRubricas(res?.data || {});
        if (rows.length > 0) return rows;
      } catch {
        // fallback
      }
      const rubricas = await base44.entities.Rubrica.list('ordem_exibicao', 1000);
      return Array.isArray(rubricas) ? rubricas : [];
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  const compartilhadas = useMemo(() => {
    const all = Array.isArray(data) ? data : [];
    const unique = deduplicateRubricas(all);
    return ensureRubricasFixas(unique)
      .filter((r) => r?.ativo !== false)
      .filter(isRubricaCompartilhada)
      .filter((r) => !isExcludedFromRateio(r))
      .sort((a, b) => getRubricaNome(a).localeCompare(getRubricaNome(b), 'pt-BR'));
  }, [data]);

  const totais = useMemo(() => {
    return compartilhadas.reduce(
      (acc, r) => {
        acc.orcado += getValorOrcado(r) / 3;
        acc.utilizado += getValorUtilizado(r) / 3;
        acc.pago += getValorPago(r) / 3;
        acc.saldo += (getValorOrcado(r) - getValorUtilizado(r)) / 3;
        return acc;
      },
      { orcado: 0, utilizado: 0, pago: 0, saldo: 0 }
    );
  }, [compartilhadas]);

  const grouped = useMemo(() => {
    const map = new Map();
    compartilhadas.forEach((r) => {
      const key = getCategoria(r);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [compartilhadas]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-6 text-gray-400 text-sm">
        <Loader2 className="w-4 h-4 animate-spin" />
        Carregando rubricas compartilhadas...
      </div>
    );
  }

  if (compartilhadas.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-400">
        Nenhuma rubrica compartilhada elegível para rateio.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <SplitSquareHorizontal className="w-4 h-4 text-blue-600" />
        <h3 className="text-sm font-bold text-blue-700 uppercase tracking-wide">
          Rubricas Compartilhadas — Rateio ÷ 3 — {museu}
        </h3>
      </div>
      <p className="text-xs text-gray-500 -mt-3">
        Rubricas sem museu específico ou compartilhadas entre museus, divididas igualmente. Lanches e Alimentação permanecem rateados por museu.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Previsto (1/3)', value: totais.orcado, color: 'text-black' },
          { label: 'Utilizado (1/3)', value: totais.utilizado, color: 'text-black' },
          { label: 'Pago (1/3)', value: totais.pago, color: 'text-green-700' },
          { label: 'Saldo (1/3)', value: totais.saldo, color: totais.saldo < 0 ? 'text-red-600' : 'text-black' },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-blue-100 bg-blue-50 p-3">
            <p className="text-[10px] uppercase tracking-wide text-blue-500 font-semibold">{label}</p>
            <p className={`text-lg font-bold mt-1 ${color}`}>{formatCurrency(value)}</p>
          </div>
        ))}
      </div>

      <div className="space-y-5">
        {grouped.map(([categoria, items]) => (
          <section key={categoria} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-xs font-bold uppercase tracking-wide text-blue-600">
                {categoria}
              </h4>
              <span className="text-xs text-gray-400">
                {items.length} {items.length === 1 ? 'rubrica' : 'rubricas'} compartilhadas
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {items.map((rubrica, index) => (
                <RubricaRateioCard key={rubrica?.id || `shared-${index}`} rubrica={rubrica} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
