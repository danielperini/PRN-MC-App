import React, { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Search } from 'lucide-react';

/* ─── helpers numéricos ─── */
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

/* ─── getters de rubrica ─── */
function getRubricaNome(r = {}) {
  return String(r?.rubrica || r?.nome || r?.descricao || 'Rubrica sem nome');
}

function getGrupo(r = {}) {
  return String(r?.grupo || r?.grupo_nome || r?.categoria || r?.categoria_key || 'Geral');
}

function getValorOrcado(r = {}) {
  return toNumber(r?.valor_rubrica ?? r?.valor_total ?? r?.orcado ?? r?.previsto ?? 0);
}

function getValorPago(r = {}) {
  return toNumber(r?._pago ?? 0);
}

function getValorLancamentos(r = {}) {
  return toNumber(r?._lancamentos ?? 0);
}

function getValorUtilizado(r = {}) {
  return toNumber(r?._utilizado ?? r?.valor_utilizado ?? 0);
}

function getSaldo(r = {}) {
  return Number((getValorOrcado(r) - getValorUtilizado(r)).toFixed(2));
}

function getPct(r = {}) {
  const total = getValorOrcado(r);
  if (total <= 0) return 0;
  return Number(((getValorUtilizado(r) / total) * 100).toFixed(1));
}

/* ─── Normalização de centro_custo para comparação ─── */

/**
 * Normaliza um valor de centro_custo para uma chave canônica usada para comparação.
 * Lida com variações históricas (MIS BH→MIS, MAB→MHAB, MUMU→MUMO, etc.)
 * IMPORTANTE: distingue Noturno 2026 de Noturno Pampulha.
 */
function normalizeCentro(value) {
  const raw = String(value || '').trim();
  const up = raw.toUpperCase();
  if (!up) return '';

  // Museus físicos — aliases legados
  if (up === 'MIS BH' || up === 'MIS') return 'MIS';
  if (up === 'MHAB' || up === 'MAB') return 'MHAB';
  if (up === 'MUMO' || up === 'MUMU') return 'MUMO';

  // Noturno — distinguir Pampulha de Centro
  const low = raw.toLowerCase();
  if (low.includes('noturno') && (low.includes('pampulha') || low.includes('4'))) return 'NOTURNO_PAMPULHA';
  if (low.includes('noturno')) return 'NOTURNO_CENTRO';

  // Transversais
  if (up.includes('GERAL') || up.includes('TRANSVERSAL')) return 'GERAL/TRANSVERSAL';
  if (up.includes('COORDENA')) return 'COORDENAÇÃO';
  if (up.includes('COMUNICA')) return 'COMUNICAÇÃO';
  if (up.includes('EDUCA')) return 'EDUCAÇÃO';
  if (up.includes('PRODU')) return 'PRODUÇÃO';
  if (up.includes('ADMIN') || up.includes('FINANC')) return 'ADMINISTRATIVO-FINANCEIRO';
  if (up.includes('PUBLICA')) return 'PUBLICAÇÕES';
  if (up.includes('CONSULTO')) return 'CONSULTORIAS';
  if (up.includes('DESPESA')) return 'DESPESAS GERAIS';

  return up;
}

/**
 * Tabela de mapeamento: label visível na UI → chave canônica esperada nas rubricas.
 * Centraliza toda a lógica de correspondência num único lugar.
 */
const CENTRO_UI_TO_CANONICAL = {
  'MHAB':                    'MHAB',
  'MIS':                     'MIS',
  'MUMO':                    'MUMO',
  'Noturno 2026':            'NOTURNO_CENTRO',
  'Noturno Pampulha':        'NOTURNO_PAMPULHA',
  'Coordenação':             'COORDENAÇÃO',
  'Comunicação':             'COMUNICAÇÃO',
  'Educação':                'EDUCAÇÃO',
  'Produção':                'PRODUÇÃO',
  'Administrativo-financeiro': 'ADMINISTRATIVO-FINANCEIRO',
  'Publicações':             'PUBLICAÇÕES',
  'Consultorias':            'CONSULTORIAS',
  'Despesas Gerais':         'DESPESAS GERAIS',
};

function centroMatchesMuseu(centroCusto, museuAtivo) {
  const canonical = CENTRO_UI_TO_CANONICAL[museuAtivo] || normalizeCentro(museuAtivo);
  const cn = normalizeCentro(centroCusto);
  if (!canonical || canonical === 'GERAL/TRANSVERSAL') return false;
  return cn === canonical;
}

/* ─── Auditoria de inconsistências ─── */
const MUSEU_TOKENS = {
  MIS: ['mis', 'imagem e som', 'imagem'],
  MHAB: ['mhab', 'abilio barreto', 'historico'],
  MUMO: ['mumo', 'moda'],
};

function detectarInconsistencias(rubrica) {
  const nome = normalizeText(getRubricaNome(rubrica));
  const centro = normalizeCentro(rubrica?.centro_custo);
  const alertas = [];

  for (const [museu, tokens] of Object.entries(MUSEU_TOKENS)) {
    const mentionedInName = tokens.some((t) => nome.includes(t));
    if (mentionedInName && centro && centro !== museu && centro !== 'GERAL' && centro !== 'NOTURNO') {
      alertas.push(`Nome menciona ${museu} mas centro_custo é ${centro}`);
    }
  }

  return alertas;
}

/* ─── RubricaCard ─── */
function RubricaCard({ rubrica, canEdit = false }) {
  const [editingCodigo, setEditingCodigo] = React.useState(false);
  const [codigoValue, setCodigoValue] = React.useState(rubrica?.codigo || '');

  async function saveCodigo() {
    const val = codigoValue.trim();
    try {
      await import('@/api/base44Client').then(({ base44 }) =>
        base44.entities.Rubrica.update(rubrica.id, { codigo: val || null })
      );
      setEditingCodigo(false);
      import('sonner').then(({ toast }) => toast.success('Código atualizado.'));
    } catch {
      import('sonner').then(({ toast }) => toast.error('Erro ao salvar código.'));
    }
  }

  const valorOrcado = getValorOrcado(rubrica);
  const valorPago = getValorPago(rubrica);
  const valorLancamentos = getValorLancamentos(rubrica);
  const valorUtilizado = getValorUtilizado(rubrica);
  const saldo = getSaldo(rubrica);
  const pct = getPct(rubrica);
  const progressWidth = `${Math.min(Math.max(pct, 0), 100)}%`;
  const inconsistencias = detectarInconsistencias(rubrica);

  return (
    <Card className="rounded-2xl border-gray-200 bg-white shadow-sm hover:shadow-md transition-shadow">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm text-black leading-snug mb-1.5">
              {getRubricaNome(rubrica)}
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {(rubrica?.natureza_despesa || rubrica?.natureza) && (
                <Badge className="text-[11px] font-mono bg-slate-800 text-white hover:bg-slate-700 shrink-0">
                  Natureza: {rubrica.natureza_despesa || rubrica.natureza}
                </Badge>
              )}
              {/* Badge código (Nº 4 do orçamento) */}
              {editingCodigo ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    autoFocus
                    value={codigoValue}
                    onChange={(e) => setCodigoValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveCodigo(); if (e.key === 'Escape') setEditingCodigo(false); }}
                    className="w-[60px] rounded border border-amber-400 bg-white px-1.5 py-0.5 font-mono text-[11px] focus:outline-none focus:ring-1 focus:ring-amber-400"
                    placeholder="42"
                    maxLength={8}
                  />
                  <button type="button" onClick={saveCodigo} className="rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-white hover:bg-amber-600">✓</button>
                  <button type="button" onClick={() => setEditingCodigo(false)} className="rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600 hover:bg-gray-300">✕</button>
                </span>
              ) : rubrica?.codigo ? (
                <span
                  onClick={canEdit ? () => { setCodigoValue(rubrica.codigo); setEditingCodigo(true); } : undefined}
                  className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] bg-amber-100 text-amber-800 ${canEdit ? 'cursor-pointer hover:bg-amber-200' : ''}`}
                  title="Código Nº 4 do orçamento"
                >
                  {rubrica.codigo}
                </span>
              ) : canEdit ? (
                <button
                  type="button"
                  onClick={() => { setCodigoValue(''); setEditingCodigo(true); }}
                  className="text-[10px] text-gray-400 hover:text-amber-600"
                >
                  + código
                </button>
              ) : null}
              {/* Badge mostra o centro_custo REAL da rubrica, nunca inferido */}
              {rubrica?.centro_custo && (
                <Badge variant="outline" className="text-[10px]">
                  {rubrica.centro_custo}
                </Badge>
              )}
              <Badge variant="outline" className="text-[10px]">
                {getGrupo(rubrica)}
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

        {inconsistencias.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 flex items-start gap-1.5">
            <AlertTriangle className="w-3 h-3 text-amber-600 mt-0.5 shrink-0" />
            <ul className="text-[10px] text-amber-700 space-y-0.5">
              {inconsistencias.map((msg, i) => <li key={i}>{msg}</li>)}
            </ul>
          </div>
        )}

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

/* ─── Componente principal ─── */
/**
 * Props:
 *   museu       — centro de custo a exibir (ex: 'MHAB', 'MIS', 'MUMO', 'Noturno')
 *   rubricas    — lista completa de Rubrica[] já carregada pela página pai
 *   compras     — lista de PurchaseRequest aprovadas já carregada pela página pai
 */
export default function RubricasMuseuEditor({ museu = 'MIS', rubricas = [], compras = [] }) {
  const [searchTerm, setSearchTerm] = useState('');
  /* 1. Filtrar rubricas pelo centro_custo REAL — sem inferência por nome */
  const rubricasFiltradas = useMemo(() => {
    return rubricas
      .filter((r) => r?.ativo !== false)
      .filter((r) => centroMatchesMuseu(r?.centro_custo, museu));
  }, [rubricas, museu]);

  /* 2. Deduplicar por id (fonte única, sem duplicatas sintéticas) */
  const rubricasDedup = useMemo(() => {
    const seen = new Set();
    return rubricasFiltradas.filter((r) => {
      const key = r?.id || `${normalizeText(getGrupo(r))}::${normalizeText(getRubricaNome(r))}::${normalizeCentro(r?.centro_custo)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [rubricasFiltradas]);

  /* 3. Indexar compras aprovadas por rubrica_id */
  const comprasPorRubrica = useMemo(() => {
    const STATUS_APROVADOS = new Set(['APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);
    const STATUS_PAGO = new Set(['PAGO']);
    const STATUS_PENDENTES = new Set(['SOLICITADO', 'RASCUNHO', 'DEVOLVIDO']);

    const idx = {};
    for (const c of compras) {
      const rid = c?.rubrica_id;
      if (!rid) continue;
      if (!idx[rid]) idx[rid] = { utilizado: 0, pago: 0, lancamentos: 0 };
      const val = toNumber(c.valor_pago || c.valor_aprovado_admin || c.valor_aprovado || c.valor_solicitado);
      const status = String(c.status || '').toUpperCase();
      if (STATUS_APROVADOS.has(status)) {
        idx[rid].utilizado += val;
        if (STATUS_PAGO.has(status)) idx[rid].pago += val;
      } else if (STATUS_PENDENTES.has(status)) {
        idx[rid].lancamentos += val;
      }
    }
    return idx;
  }, [compras]);

  /* 4. Enriquecer rubricas com valores calculados das compras */
  const rubricasEnriquecidas = useMemo(() => {
    return rubricasDedup
      .map((r) => {
        const calc = comprasPorRubrica[r.id] || {};
        const utilizado = calc.utilizado > 0 ? calc.utilizado : toNumber(r.valor_utilizado);
        return {
          ...r,
          _utilizado: utilizado,
          _pago: calc.pago || 0,
          _lancamentos: calc.lancamentos || 0,
        };
      })
      .sort((a, b) => getRubricaNome(a).localeCompare(getRubricaNome(b), 'pt-BR'));
  }, [rubricasDedup, comprasPorRubrica]);

  /* 5. Totais */
  const totals = useMemo(() => {
    return rubricasEnriquecidas.reduce(
      (acc, r) => {
        acc.orcado += getValorOrcado(r);
        acc.utilizado += getValorUtilizado(r);
        acc.saldo += getSaldo(r);
        return acc;
      },
      { orcado: 0, utilizado: 0, saldo: 0 }
    );
  }, [rubricasEnriquecidas]);

  /* 6. Filtrar por busca e agrupar por grupo */
  const rubricasFiltradas2 = useMemo(() => {
    if (!searchTerm.trim()) return rubricasEnriquecidas;
    const busca = normalizeText(searchTerm);
    return rubricasEnriquecidas.filter((r) => {
      const texto = normalizeText(`${getRubricaNome(r)} ${getGrupo(r)} ${r?.centro_custo || ''}`);
      return texto.includes(busca);
    });
  }, [rubricasEnriquecidas, searchTerm]);

  const grouped = useMemo(() => {
    const map = new Map();
    rubricasFiltradas2.forEach((r) => {
      const key = getGrupo(r);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [rubricasFiltradas2]);

  if (rubricasEnriquecidas.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
        <p className="font-semibold text-black">Nenhuma rubrica encontrada para {museu}.</p>
        <p className="text-sm text-gray-500 mt-1">
          São exibidas apenas rubricas cujo campo <strong>centro_custo</strong> seja exatamente &quot;{museu}&quot;.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Totais do museu */}
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

      {/* Busca */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Buscar rubrica..."
          className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl bg-white focus:outline-none focus:ring-2 focus:ring-black/20"
        />
      </div>

      <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
        Exibindo {rubricasFiltradas2.length} de {rubricasEnriquecidas.length} rubrica{rubricasEnriquecidas.length !== 1 ? 's' : ''} com{' '}
        <strong>centro_custo = {museu}</strong>. Valores calculados a partir das compras aprovadas vinculadas.
      </div>

      {/* Cards por grupo */}
      <div className="space-y-6">
        {grouped.map(([grupo, items]) => (
          <section key={grupo} className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-wide text-gray-600">{grupo}</h3>
              <span className="text-xs text-gray-400">
                {items.length} {items.length === 1 ? 'rubrica' : 'rubricas'}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {items.map((r, i) => (
                <RubricaCard key={r?.id || `${grupo}-${i}`} rubrica={r} canEdit={true} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}