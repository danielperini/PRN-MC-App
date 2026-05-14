/**
 * RubricasCompartilhadasRateio
 *
 * Exibe, em cada aba de museu, somente rubricas compartilhadas entre MIS / MUMO / MHAB.
 * Quando os dados vêm de getRubricasConsolidadas, o backend já entrega:
 * - valor previsto em 1/3 por museu;
 * - utilizado/pago/lançamentos abatidos pelo centro de custo do museu quando informado;
 * - fallback dividido por 3 quando não há centro de custo detectado.
 *
 * Portanto, este componente NÃO divide novamente os dados consolidados.
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

function normalizeMuseu(value) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text === 'mis' || text.includes('imagem') || text.includes('som')) return 'MIS';
  if (text === 'mhab' || text.includes('abilio') || text.includes('historico')) return 'MHAB';
  if (text === 'mumo' || text.includes('moda')) return 'MUMO';
  return String(value || '').trim().toUpperCase();
}

function getRubricaNome(rubrica = {}) {
  return String(rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || 'Rubrica sem nome');
}

function getCategoria(rubrica = {}) {
  return String(rubrica?.categoria_key || rubrica?.categoria || rubrica?.grupo || rubrica?.grupo_nome || 'geral');
}

function getValorOrcado(rubrica = {}) {
  return toNumber(
    rubrica?.totalOrcado ??
      rubrica?.valorOrcado ??
      rubrica?.valor_rubrica ??
      rubrica?.valor_total ??
      rubrica?.orcado ??
      rubrica?.previsto
  );
}

function getValorUtilizado(rubrica = {}) {
  return toNumber(
    rubrica?.valorUtilizado ??
      rubrica?.valor_utilizado ??
      rubrica?.utilizado ??
      rubrica?.realizado
  );
}

function getValorPago(rubrica = {}) {
  return toNumber(rubrica?.valorPago ?? rubrica?.valor_pago ?? rubrica?.pago);
}

function getValorLancamentos(rubrica = {}) {
  return toNumber(rubrica?.valorLancamentos ?? rubrica?.valor_lancamentos ?? rubrica?.lancamentos);
}

function formatCurrency(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

function getSearchText(rubrica = {}) {
  return normalizeText([
    rubrica?.rubrica,
    rubrica?.nome,
    rubrica?.descricao,
    rubrica?.grupo,
    rubrica?.categoria,
    rubrica?.categoria_key,
    rubrica?.centro_custo,
    rubrica?.museu,
    rubrica?.museu_codigo,
    rubrica?.unidade,
    rubrica?.observacao_uso,
  ].filter(Boolean).join(' '));
}

function hasMuseuToken(text = '', museu = '') {
  return (MUSEUS_TOKENS[museu] || []).some((token) => text.includes(token));
}

function countMuseuTokens(text = '') {
  return MUSEUS.filter((museu) => hasMuseuToken(text, museu)).length;
}

function isNoturno(rubrica = {}) {
  return getSearchText(rubrica).includes('noturno');
}

function isAdministrativeOrGeneral(rubrica = {}) {
  const text = getSearchText(rubrica);
  const categoria = normalizeText(getCategoria(rubrica));

  if (categoria === 'despesas_gerais' || categoria === 'consultorias' || categoria === 'equipe') return true;

  return (
    text.includes('consultoria') ||
    text.includes('consultorias') ||
    text.includes('coordenador') ||
    text.includes('coordenacao') ||
    text.includes('assistente') ||
    text.includes('analista') ||
    text.includes('administrativo') ||
    text.includes('juridico') ||
    text.includes('contador') ||
    text.includes('contabilidade') ||
    text.includes('energia eletrica') ||
    text.includes('transporte') ||
    text.includes('assessor de imprensa') ||
    text.includes('rede social') ||
    text.includes('marketing cultural')
  );
}

function isExplicitSharedRubrica(rubrica = {}) {
  if (rubrica?.divisor === 3 || rubrica?.distribuicao_mode === 'compartilhada_div3') return true;

  const text = getSearchText(rubrica);
  return (
    text.includes('mis / mumo / mhab') ||
    text.includes('mis/mumo/mhab') ||
    text.includes('mhab / mis / mumo') ||
    text.includes('mhab/mis/mumo') ||
    text.includes('mis mumo mhab') ||
    countMuseuTokens(text) >= 2
  );
}

function isRubricaCompartilhadaPermitida(rubrica = {}) {
  if (rubrica?.ativo === false) return false;
  if (isNoturno(rubrica)) return false;
  if (!isExplicitSharedRubrica(rubrica)) return false;
  if (isAdministrativeOrGeneral(rubrica)) return false;

  return true;
}

function flattenRubricasConsolidadasPorMuseu(consolidado = {}, museu = '') {
  const rows = [];
  const normalizedMuseu = normalizeMuseu(museu);
  const categorias = consolidado?.por_museu?.[normalizedMuseu];

  if (!categorias || typeof categorias !== 'object') return rows;

  Object.entries(categorias).forEach(([categoriaKey, items]) => {
    (Array.isArray(items) ? items : []).forEach((item) => {
      rows.push({
        ...item,
        categoria_key: item?.categoria_key || categoriaKey,
        museu_origem: normalizedMuseu,
        __consolidadoPorMuseu: true,
      });
    });
  });

  return rows;
}

function deduplicateRubricas(rows = []) {
  const seen = new Set();

  return rows.filter((rubrica) => {
    const key = rubrica?.id || normalizeText(`${getCategoria(rubrica)}-${getRubricaNome(rubrica)}`);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function getCardValues(rubrica = {}) {
  const divisor = rubrica?.__consolidadoPorMuseu ? 1 : 3;
  const orcado = Number((getValorOrcado(rubrica) / divisor).toFixed(2));
  const utilizado = Number((getValorUtilizado(rubrica) / divisor).toFixed(2));
  const pago = Number((getValorPago(rubrica) / divisor).toFixed(2));
  const lancamentos = Number((getValorLancamentos(rubrica) / divisor).toFixed(2));
  const saldo = rubrica?.saldo !== undefined && rubrica?.saldo !== null && rubrica?.__consolidadoPorMuseu
    ? toNumber(rubrica.saldo)
    : Number((orcado - utilizado).toFixed(2));
  const pct = orcado > 0 ? Number(((utilizado / orcado) * 100).toFixed(1)) : 0;

  return { orcado, utilizado, pago, lancamentos, saldo, pct };
}

function RubricaRateioCard({ rubrica }) {
  const { orcado, utilizado, pago, lancamentos, saldo, pct } = getCardValues(rubrica);
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
                ÷ 3 por museu
              </Badge>
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
            <p className="text-gray-500">Previsto (museu)</p>
            <p className="font-semibold text-black">{formatCurrency(orcado)}</p>
          </div>
          <div>
            <p className="text-gray-500">Utilizado (centro)</p>
            <p className="font-semibold text-black">{formatCurrency(utilizado)}</p>
          </div>
          <div>
            <p className="text-gray-500">Pago (centro)</p>
            <p className="font-semibold text-green-700">{formatCurrency(pago)}</p>
          </div>
          <div>
            <p className="text-gray-500">Lançamentos</p>
            <p className="font-semibold text-sky-700">{formatCurrency(lancamentos)}</p>
          </div>
        </div>

        <div className="border-t border-blue-100 pt-3 flex justify-between text-sm">
          <span className="text-gray-500">Saldo do museu</span>
          <span className={`font-bold ${saldo < 0 ? 'text-red-600' : 'text-black'}`}>
            {formatCurrency(saldo)}
          </span>
        </div>

        <p className="text-[10px] text-blue-500 border-t border-blue-100 pt-2">
          Rubrica compartilhada: previsto dividido por 3; utilização abatida pelo centro de custo do museu quando informado.
        </p>
      </CardContent>
    </Card>
  );
}

export default function RubricasCompartilhadasRateio({ museu = 'MIS', refreshKey = 0 }) {
  const normalizedMuseu = normalizeMuseu(museu);

  const { data, isLoading } = useQuery({
    queryKey: ['rubricas-compartilhadas', normalizedMuseu, refreshKey],
    queryFn: async () => {
      try {
        const res = await base44.functions.invoke('getRubricasConsolidadas', {});
        const rows = flattenRubricasConsolidadasPorMuseu(res?.data || {}, normalizedMuseu);
        if (rows.length > 0) return rows;
      } catch (error) {
        console.warn('getRubricasConsolidadas indisponível no rateio:', error);
      }

      const rubricas = await base44.entities.Rubrica.list('ordem_exibicao', 1000);
      return (Array.isArray(rubricas) ? rubricas : []).map((rubrica) => ({
        ...rubrica,
        __consolidadoPorMuseu: false,
      }));
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  const compartilhadas = useMemo(() => {
    const all = Array.isArray(data) ? data : [];
    const unique = deduplicateRubricas(all);

    return unique
      .filter(isRubricaCompartilhadaPermitida)
      .sort((a, b) => getRubricaNome(a).localeCompare(getRubricaNome(b), 'pt-BR'));
  }, [data]);

  const totais = useMemo(() => {
    return compartilhadas.reduce(
      (acc, rubrica) => {
        const values = getCardValues(rubrica);
        acc.orcado += values.orcado;
        acc.utilizado += values.utilizado;
        acc.pago += values.pago;
        acc.lancamentos += values.lancamentos;
        acc.saldo += values.saldo;
        return acc;
      },
      { orcado: 0, utilizado: 0, pago: 0, lancamentos: 0, saldo: 0 }
    );
  }, [compartilhadas]);

  const grouped = useMemo(() => {
    const map = new Map();

    compartilhadas.forEach((rubrica) => {
      const key = getCategoria(rubrica);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(rubrica);
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

  if (compartilhadas.length === 0) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 mb-1">
        <SplitSquareHorizontal className="w-4 h-4 text-blue-600" />
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-blue-700">
            Rubricas compartilhadas — {normalizedMuseu}
          </h3>
          <p className="text-xs text-blue-500">
            Somente rubricas multi-museu, com previsto em 1/3 e débito por centro de custo.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Previsto (museu)', value: totais.orcado, color: 'text-black' },
          { label: 'Utilizado (centro)', value: totais.utilizado, color: 'text-black' },
          { label: 'Pago (centro)', value: totais.pago, color: 'text-green-700' },
          { label: 'Saldo', value: totais.saldo, color: totais.saldo < 0 ? 'text-red-600' : 'text-black' },
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
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-600">
                {categoria}
              </h3>
              <span className="text-xs text-gray-400">
                {items.length} {items.length === 1 ? 'rubrica compartilhada' : 'rubricas compartilhadas'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {items.map((rubrica, index) => (
                <RubricaRateioCard key={rubrica?.id || `${categoria}-${index}`} rubrica={rubrica} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
