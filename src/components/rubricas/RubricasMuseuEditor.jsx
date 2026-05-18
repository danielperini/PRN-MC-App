import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle } from 'lucide-react';
import RubricasCompartilhadasRateio from './RubricasCompartilhadasRateio';

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  if (text.includes('noturno')) return 'NOTURNO';

  return String(value || '').trim().toUpperCase();
}

function getRubricaNome(rubrica = {}) {
  return String(rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || 'Rubrica sem nome');
}

function getCategoria(rubrica = {}, fallback = 'geral') {
  return String(
    rubrica?.categoria_key ||
      rubrica?.categoria ||
      rubrica?.grupo ||
      rubrica?.grupo_nome ||
      fallback ||
      'geral'
  );
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

function getValorPago(rubrica = {}) {
  return toNumber(rubrica?.valorPago ?? rubrica?.valor_pago ?? rubrica?.pago);
}

function getValorLancamentos(rubrica = {}) {
  return toNumber(rubrica?.valorLancamentos ?? rubrica?.valor_lancamentos ?? rubrica?.lancamentos);
}

function getValorEstorno(rubrica = {}) {
  return toNumber(
    rubrica?.valorEstorno ??
      rubrica?.valor_estorno ??
      rubrica?.valorEstornado ??
      rubrica?.valor_estornado ??
      rubrica?.estorno ??
      rubrica?.estornado ??
      rubrica?.valor_devolvido ??
      rubrica?.devolvido
  );
}

function getValorUtilizado(rubrica = {}) {
  const utilizado = toNumber(
    rubrica?.valorUtilizado ??
      rubrica?.valor_utilizado ??
      rubrica?.utilizado ??
      rubrica?.realizado
  );
  const estorno = getValorEstorno(rubrica);
  return Number(Math.max(0, utilizado - estorno).toFixed(2));
}

function getSaldo(rubrica = {}) {
  return Number((getValorOrcado(rubrica) - getValorUtilizado(rubrica)).toFixed(2));
}

function getPct(rubrica = {}) {
  const total = getValorOrcado(rubrica);
  if (total <= 0) return 0;
  return Number(((getValorUtilizado(rubrica) / total) * 100).toFixed(1));
}

function getSearchText(rubrica = {}, includeGeneratedOrigin = false) {
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
    includeGeneratedOrigin ? rubrica?.museu_origem : '',
    rubrica?.observacao_uso,
  ].filter(Boolean).join(' '));
}

function isHiddenRubrica(text = '') {
  return (
    text.includes('transporte') ||
    text.includes('assessoria juridica') ||
    text.includes('assessor juridico') ||
    text.includes('juridico') ||
    text.includes('contador') ||
    text.includes('contabilidade') ||
    text.includes('energia eletrica') ||
    text.includes('formacao sobre ambiente seguro') ||
    text.includes('ambiente seguro') ||
    text.includes('diversidade') ||
    text.includes('inclusao') ||
    text.includes('material escritorio') ||
    text.includes('material de escritorio') ||
    text.includes('fornecimento de som e iluminacao') ||
    text.includes('fornecimento de som')
  );
}

function isNoturnoRubrica(rubrica = {}) {
  return getSearchText(rubrica, true).includes('noturno');
}

function isNoturnoGrupoRubrica(rubrica = {}) {
  return normalizeText([
    rubrica?.grupo,
    rubrica?.grupo_nome,
    rubrica?.categoria,
    rubrica?.categoria_key,
  ].filter(Boolean).join(' ')).includes('noturno');
}

function hasMuseuToken(text = '', museu = '') {
  if (museu === 'MIS') return text.includes('mis') || text.includes('imagem') || text.includes('som');
  if (museu === 'MHAB') return text.includes('mhab') || text.includes('abilio') || text.includes('historico');
  if (museu === 'MUMO') return text.includes('mumo') || text.includes('moda');
  return false;
}

function countMuseuTokens(text = '') {
  return ['MIS', 'MHAB', 'MUMO'].filter((museu) => hasMuseuToken(text, museu)).length;
}

function matchRubricaMuseu(rubrica = {}, museu = '') {
  const normalizedMuseu = normalizeMuseu(museu);
  const explicitText = getSearchText(rubrica, false);

  if (!normalizedMuseu || normalizedMuseu === 'GERAL') return false;
  if (isHiddenRubrica(explicitText)) return false;
  if (normalizedMuseu === 'NOTURNO') return isNoturnoRubrica(rubrica) && !isHiddenRubrica(explicitText);
  if (isNoturnoRubrica(rubrica)) return false;

  const tokenCount = countMuseuTokens(explicitText);
  if (tokenCount !== 1) return false;

  return hasMuseuToken(explicitText, normalizedMuseu);
}

function flattenConsolidado(consolidado = {}, museu = '') {
  const rows = [];
  const normalizedMuseu = normalizeMuseu(museu);

  if (consolidado?.por_museu && typeof consolidado.por_museu === 'object') {
    Object.entries(consolidado.por_museu).forEach(([museuKey, categorias]) => {
      Object.entries(categorias || {}).forEach(([categoriaKey, items]) => {
        (Array.isArray(items) ? items : []).forEach((item) => {
          rows.push({
            ...item,
            categoria_key: item?.categoria_key || categoriaKey,
            museu_origem: normalizeMuseu(museuKey),
          });
        });
      });
    });
  }

  return rows.filter((rubrica) => matchRubricaMuseu(rubrica, normalizedMuseu));
}

function dedupeRows(rows = []) {
  const seen = new Set();
  return rows.filter((rubrica) => {
    const key = rubrica?.id || `${normalizeText(getCategoria(rubrica))}::${normalizeText(getRubricaNome(rubrica))}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function groupByCategory(rows = []) {
  const grouped = new Map();

  rows.forEach((rubrica) => {
    const key = getCategoria(rubrica, 'geral');
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(rubrica);
  });

  return Array.from(grouped.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
}

function RubricaCard({ rubrica }) {
  const valorOrcado = getValorOrcado(rubrica);
  const valorPago = getValorPago(rubrica);
  const valorLancamentos = getValorLancamentos(rubrica);
  const valorEstorno = getValorEstorno(rubrica);
  const valorUtilizado = getValorUtilizado(rubrica);
  const saldo = getSaldo(rubrica);
  const pct = getPct(rubrica);
  const progressWidth = `${Math.min(Math.max(pct, 0), 100)}%`;

  return (
    <Card className="rounded-2xl border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-black leading-snug">
              {getRubricaNome(rubrica)}
            </h3>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {rubrica?.museu_origem && (
                <Badge variant="outline" className="text-[10px]">
                  {rubrica.museu_origem}
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

        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <div
            className={`h-1.5 rounded-full ${pct >= 100 ? 'bg-red-600' : pct >= 80 ? 'bg-orange-500' : 'bg-black'}`}
            style={{ width: progressWidth }}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-gray-500">Previsto</p>
            <p className="font-semibold text-black">{formatCurrency(valorOrcado)}</p>
          </div>

          <div>
            <p className="text-gray-500">Utilizado</p>
            <p className="font-semibold text-black">{formatCurrency(valorUtilizado)}</p>
            {valorEstorno > 0 && (
              <p className="text-[10px] text-amber-600">
                estorno: {formatCurrency(valorEstorno)}
              </p>
            )}
          </div>

          <div>
            <p className="text-gray-500">Pago</p>
            <p className="font-semibold text-green-700">{formatCurrency(valorPago)}</p>
          </div>

          <div>
            <p className="text-gray-500">Lançamentos</p>
            <p className="font-semibold text-sky-700">{formatCurrency(valorLancamentos)}</p>
          </div>
        </div>

        <div className="border-t border-gray-100 pt-3 flex justify-between text-sm">
          <span className="text-gray-500">Saldo</span>
          <span className={`font-bold ${saldo < 0 ? 'text-red-600' : 'text-black'}`}>
            {formatCurrency(saldo)}
          </span>
        </div>

        {rubrica?.observacao_uso && (
          <p className="text-[11px] text-gray-500 border-t border-gray-100 pt-2">
            {rubrica.observacao_uso}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export default function RubricasMuseuEditor({
  museu = 'MIS',
  canEdit = false,
  refreshKey = 0,
  rubricaFilter,
}) {
  const normalizedMuseu = normalizeMuseu(museu);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['rubricas-museu-editor', normalizedMuseu, refreshKey],
    queryFn: async () => {
      if (normalizedMuseu === 'NOTURNO') {
        const rubricas = await base44.entities.Rubrica.list('ordem_exibicao', 1000);
        return (Array.isArray(rubricas) ? rubricas : []).filter(isNoturnoGrupoRubrica);
      }

      try {
        const res = await base44.functions.invoke('getRubricasConsolidadas', {});
        const rows = flattenConsolidado(res?.data || {}, normalizedMuseu);
        if (rows.length > 0) return rows;
      } catch (err) {
        console.warn('getRubricasConsolidadas indisponível no editor de rubricas:', err);
      }

      const rubricas = await base44.entities.Rubrica.list('ordem_exibicao', 1000);
      return (Array.isArray(rubricas) ? rubricas : []).filter((rubrica) => matchRubricaMuseu(rubrica, normalizedMuseu));
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  const rows = useMemo(() => {
    const baseRows = Array.isArray(data) ? data : [];
    const scopedRows = normalizedMuseu === 'NOTURNO'
      ? dedupeRows(baseRows).filter(isNoturnoGrupoRubrica)
      : baseRows.filter((rubrica) => matchRubricaMuseu(rubrica, normalizedMuseu));
    const filtered = typeof rubricaFilter === 'function'
      ? scopedRows.filter((rubrica) => {
          try {
            return rubricaFilter(rubrica);
          } catch {
            return true;
          }
        })
      : scopedRows;

    return filtered
      .filter((rubrica) => rubrica?.ativo !== false)
      .sort((a, b) => getRubricaNome(a).localeCompare(getRubricaNome(b), 'pt-BR'));
  }, [data, rubricaFilter, normalizedMuseu]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, rubrica) => {
        acc.orcado += getValorOrcado(rubrica);
        acc.utilizado += getValorUtilizado(rubrica);
        acc.saldo += getSaldo(rubrica);
        return acc;
      },
      { orcado: 0, utilizado: 0, saldo: 0 }
    );
  }, [rows]);

  const grouped = useMemo(() => groupByCategory(rows), [rows]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-500">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />
        Carregando rubricas específicas...
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-800">
        <div className="flex gap-3">
          <AlertTriangle className="w-5 h-5 mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Erro ao carregar rubricas.</p>
            <p className="text-sm mt-1">{error?.message || 'Falha na consulta de rubricas.'}</p>
          </div>
        </div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
        <p className="font-semibold text-black">Nenhuma rubrica específica encontrada.</p>
        <p className="text-sm text-gray-500 mt-1">
          {normalizedMuseu === 'NOTURNO'
            ? 'Esta aba mostra somente rubricas cadastradas no grupo Noturno nos Museus 2026, sem rateio por museu.'
            : `Esta aba mostra somente rubricas que mencionam exclusivamente ${normalizedMuseu}. Rubricas gerais, compartilhadas ou multi-museu ficam fora desta visão.`}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Previsto</p>
          <p className="text-2xl font-bold text-black mt-1">{formatCurrency(totals.orcado)}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Utilizado</p>
          <p className="text-2xl font-bold text-black mt-1">{formatCurrency(totals.utilizado)}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-semibold">Saldo</p>
          <p className={`text-2xl font-bold mt-1 ${totals.saldo < 0 ? 'text-red-600' : 'text-black'}`}>
            {formatCurrency(totals.saldo)}
          </p>
        </div>
      </div>

      {!canEdit && (
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
          {normalizedMuseu === 'NOTURNO'
            ? 'Filtro restaurado: esta visão exibe apenas rubricas do grupo Noturno nos Museus 2026, com valores integrais e estornos aplicados quando informados.'
            : 'Filtro restaurado: esta visão exibe apenas rubricas específicas da aba selecionada.'}
        </div>
      )}

      <div className="space-y-6">
        {grouped.map(([categoria, items]) => (
          <section key={categoria} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-600">
                {categoria}
              </h3>
              <span className="text-xs text-gray-400">
                {items.length} {items.length === 1 ? 'rubrica específica' : 'rubricas específicas'}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {items.map((rubrica, index) => (
                <RubricaCard key={rubrica?.id || `${categoria}-${index}`} rubrica={rubrica} />
              ))}
            </div>
          </section>
        ))}
      </div>

      {normalizedMuseu !== 'NOTURNO' && (
        <div className="border-t border-gray-100 pt-6">
          <RubricasCompartilhadasRateio museu={normalizedMuseu} refreshKey={refreshKey} />
        </div>
      )}
    </div>
  );
}
