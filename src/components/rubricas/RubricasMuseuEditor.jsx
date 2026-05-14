import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Edit2, AlertCircle } from 'lucide-react';
import EditRubricaDialog from './EditRubricaDialog';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

const MUSEU_TOKENS = {
  MIS: ['mis', 'imagem e som'],
  MHAB: ['mhab', 'abilio', 'abílio', 'historico', 'histórico'],
  MUMO: ['mumo', 'moda'],
};

const TERMOS_NOTURNO = [
  'noturno',
  'limpeza',
  'van',
  'vans',
  'transporte noturno',
  'noturno nos museus',
];

const TERMOS_ADMINISTRATIVOS_GERAIS = [
  'coordenador geral',
  'coordenador de comunicacao',
  'coordenador de comunicação',
  'assistente administrativo',
  'assistente de coordenacao',
  'assistente de coordenação',
  'analista adm',
  'analista administrativo',
  'assessor de imprensa',
  'rede social',
  'marketing cultural',
  'consultoria',
  'consultorias',
  'contador',
  'contabilidade',
  'juridico',
  'jurídico',
  'energia eletrica',
  'energia elétrica',
  'transporte',
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

function normalizeMuseu(value) {
  const text = normalizeText(value);
  if (!text) return '';
  if (text === 'mis' || text.includes('museu da imagem e do som') || text.includes('imagem e som')) return 'MIS';
  if (text === 'mhab' || text.includes('abilio') || text.includes('historico')) return 'MHAB';
  if (text === 'mumo' || text.includes('museu da moda') || text.includes('moda')) return 'MUMO';
  if (text.includes('noturno')) return 'NOTURNO';
  return String(value || '').trim().toUpperCase();
}

function getRubricaNome(rubrica = {}) {
  return String(rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || 'Rubrica sem nome');
}

function getCategoria(rubrica = {}) {
  return String(rubrica?.categoria || rubrica?.categoria_key || rubrica?.grupo || rubrica?.grupo_nome || 'geral');
}

function getTextFields(rubrica = {}) {
  return [
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
  ].filter(Boolean).join(' ');
}

function getSearchText(rubrica = {}) {
  return normalizeText(getTextFields(rubrica));
}

function hasMuseuToken(text = '', museu = '') {
  return (MUSEU_TOKENS[museu] || []).some((token) => text.includes(normalizeText(token)));
}

function getMuseusMencionados(text = '') {
  return MUSEUS.filter((museu) => hasMuseuToken(text, museu));
}

function isNoturnoOuOperacaoNoturno(rubrica = {}) {
  const text = getSearchText(rubrica);
  const categoria = normalizeText(getCategoria(rubrica));

  if (categoria.includes('noturno')) return true;
  return TERMOS_NOTURNO.some((termo) => text.includes(normalizeText(termo)));
}

function isAdministrativoGeral(rubrica = {}) {
  const text = getSearchText(rubrica);
  const categoria = normalizeText(getCategoria(rubrica));

  if (categoria === 'equipe' || categoria === 'despesas_gerais' || categoria === 'consultorias') return true;

  return TERMOS_ADMINISTRATIVOS_GERAIS.some((termo) => text.includes(normalizeText(termo)));
}

function isNomeCompartilhadoTresMuseus(rubrica = {}) {
  const text = getSearchText(rubrica);
  const mencionados = getMuseusMencionados(text);

  return (
    text.includes('mis / mumo / mhab') ||
    text.includes('mis/mumo/mhab') ||
    text.includes('mhab / mis / mumo') ||
    text.includes('mhab/mis/mumo') ||
    text.includes('mis mumo mhab') ||
    mencionados.length >= 2
  );
}

function isEspecificaDoMuseu(rubrica = {}, museu = '') {
  const text = getSearchText(rubrica);
  const mencionados = getMuseusMencionados(text);
  const centro = normalizeMuseu(rubrica?.centro_custo || rubrica?.museu || rubrica?.museu_codigo || rubrica?.unidade || '');

  if (centro && MUSEUS.includes(centro) && centro !== museu) return false;
  if (centro === museu && mencionados.length <= 1) return true;

  return mencionados.length === 1 && mencionados[0] === museu;
}

function deveExibirRubricaNoMuseu(rubrica = {}, museu = '') {
  const normalizedMuseu = normalizeMuseu(museu);
  if (!MUSEUS.includes(normalizedMuseu)) return false;
  if (rubrica?.ativo === false) return false;

  if (isNoturnoOuOperacaoNoturno(rubrica)) return false;
  if (isAdministrativoGeral(rubrica)) return false;

  // Só é compartilhada se o NOME/TEXTO mencionar mais de um museu.
  // Não confiar em divisor=3 isolado, porque backend pode ratear itens específicos por fallback.
  if (isNomeCompartilhadoTresMuseus(rubrica)) return true;

  return isEspecificaDoMuseu(rubrica, normalizedMuseu);
}

function formatCurrency(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

function RubricasMuseuEditor({ museu, canEdit, refreshKey }) {
  const [editingRubrica, setEditingRubrica] = React.useState(null);
  const normalizedMuseu = normalizeMuseu(museu);

  const { data: consolidado, isLoading } = useQuery({
    queryKey: ['rubricas-consolidadas-editor', normalizedMuseu, refreshKey],
    queryFn: async () => {
      const res = await base44.functions.invoke('getRubricasConsolidadas', {});
      return res?.data || {};
    },
    staleTime: 0,
    gcTime: 0,
  });

  const rubricas = useMemo(() => {
    if (!consolidado?.por_museu?.[normalizedMuseu]) return [];

    const categorias = consolidado.por_museu[normalizedMuseu];
    const result = [];
    const seen = new Set();

    Object.entries(categorias).forEach(([catKey, items]) => {
      (Array.isArray(items) ? items : [])
        .map((rubrica) => ({ ...rubrica, categoria: rubrica?.categoria || catKey }))
        .filter((rubrica) => deveExibirRubricaNoMuseu(rubrica, normalizedMuseu))
        .forEach((rubrica) => {
          const categoria = rubrica?.categoria || catKey;
          const key = `${rubrica?.id || getRubricaNome(rubrica)}-${categoria}-${normalizedMuseu}`;
          if (seen.has(key)) return;
          seen.add(key);

          result.push({
            ...rubrica,
            categoria,
          });
        });
    });

    return result.sort((a, b) => {
      const catCompare = getCategoria(a).localeCompare(getCategoria(b), 'pt-BR');
      if (catCompare !== 0) return catCompare;
      return getRubricaNome(a).localeCompare(getRubricaNome(b), 'pt-BR');
    });
  }, [consolidado, normalizedMuseu]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin" />
      </div>
    );
  }

  if (rubricas.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <AlertCircle className="w-8 h-8 text-gray-400 mb-2" />
        <p className="text-gray-500 text-sm">Nenhuma rubrica específica ou compartilhada disponível para este museu</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {rubricas.map((rubrica) => {
        const totalOrcado = toNumber(rubrica.totalOrcado ?? rubrica.valor_rubrica);
        const totalUtilizado = toNumber(rubrica.valorUtilizado ?? rubrica.valor_utilizado);
        const totalPago = toNumber(rubrica.valorPago ?? rubrica.valor_pago);
        const totalLancamentos = toNumber(rubrica.valorLancamentos ?? rubrica.valor_lancamentos);
        const totalSaldo = rubrica?.saldo !== undefined && rubrica?.saldo !== null
          ? toNumber(rubrica.saldo)
          : totalOrcado - totalUtilizado;
        const pct = totalOrcado > 0 ? (totalUtilizado / totalOrcado) * 100 : 0;
        const compartilhada = isNomeCompartilhadoTresMuseus(rubrica);

        return (
          <Card key={`${rubrica.id || getRubricaNome(rubrica)}-${rubrica.categoria}-${normalizedMuseu}`} className="border-gray-200 bg-white hover:shadow-sm transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-black truncate">
                      {getRubricaNome(rubrica)}
                    </h3>
                    {compartilhada && (
                      <span className="text-[10px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-full px-2 py-0.5">
                        ÷ 3 por museu
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {rubrica.categoria}
                  </p>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-xs">
                    <div>
                      <p className="text-gray-500">Previsto</p>
                      <p className="font-semibold text-black">{formatCurrency(totalOrcado)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Utilizado</p>
                      <p className="font-semibold text-black">{formatCurrency(totalUtilizado)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Pago</p>
                      <p className="font-semibold text-green-700">{formatCurrency(totalPago)}</p>
                    </div>
                    <div>
                      <p className="text-gray-500">Lançamentos</p>
                      <p className="font-semibold text-sky-700">{formatCurrency(totalLancamentos)}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : compartilhada ? 'bg-blue-600' : 'bg-green-600'
                        }`}
                        style={{ width: `${Math.min(Math.max(pct, 0), 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-semibold text-gray-500 w-10 text-right">
                      {pct.toFixed(0)}%
                    </span>
                  </div>

                  <div className="border-t border-gray-100 mt-3 pt-3 flex justify-between text-sm">
                    <span className="text-gray-500">Saldo</span>
                    <span className={`font-semibold ${totalSaldo < 0 ? 'text-red-600' : 'text-black'}`}>
                      {formatCurrency(totalSaldo)}
                    </span>
                  </div>
                </div>

                {canEdit && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-500 hover:text-black hover:bg-gray-50"
                    onClick={() => setEditingRubrica(rubrica)}
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {editingRubrica && (
        <EditRubricaDialog
          rubrica={editingRubrica}
          open={!!editingRubrica}
          onClose={() => setEditingRubrica(null)}
        />
      )}
    </div>
  );
}

export default RubricasMuseuEditor;
