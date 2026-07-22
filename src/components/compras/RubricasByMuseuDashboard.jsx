import React, { useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building2, TrendingUp, AlertCircle, Layers } from 'lucide-react';
import EditarRubricasEmLoteModal from '@/components/rubricas/EditarRubricasEmLoteModal';

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// ─── Tokens de museu para classificação por nome ───
const MUSEU_TOKENS = {
  MHAB: ['mhab', 'abilio barreto', 'histórico municipal', 'museu histórico'],
  MIS: ['mis', 'imagem e som', 'imagem do som', 'mis bh'],
  MUMO: ['mumo', 'moda', 'museu da moda', 'mumu'],
};

function hasMuseuToken(texto, museu) {
  const tokens = MUSEU_TOKENS[museu] || [];
  return tokens.some(t => texto.includes(t));
}

function isNoturno(texto) {
  return texto.includes('noturno');
}

function isNoturnoPampulha(texto) {
  return texto.includes('noturno') && (texto.includes('pampulha') || texto.includes('4º') || texto.includes('4 aditivo'));
}

// ─── Normalização de centro_custo ───
function normalizarCentro(cc) {
  const raw = String(cc || '').trim();
  const up = raw.toUpperCase();
  if (!up) return null;

  if (up === 'MIS BH' || up === 'MIS') return 'MIS';
  if (up === 'MHAB' || up === 'MAB') return 'MHAB';
  if (up === 'MUMO' || up === 'MUMU') return 'MUMO';

  const low = raw.toLowerCase();
  if (low.includes('noturno') && (low.includes('pampulha') || low.includes('4'))) return 'Noturno Pampulha';
  if (low.includes('noturno')) return 'Noturno 2026';

  if (up.includes('GERAL') || up.includes('TRANSVERSAL')) return 'Geral';
  if (up.includes('COORDENA')) return 'Coordenação';
  if (up.includes('COMUNICA')) return 'Comunicação';
  if (up.includes('EDUCA')) return 'Educação';
  if (up.includes('PRODU')) return 'Produção';
  if (up.includes('ADMIN') || up.includes('FINANC')) return 'Administrativo-financeiro';
  if (up.includes('PUBLICA')) return 'Publicações';
  if (up.includes('CONSULTO')) return 'Consultorias';
  if (up.includes('DESPESA')) return 'Despesas Gerais';

  return up;
}

/**
 * Classifica rubrica em um museu principal para exibição no dashboard.
 * Prioridade: centro_custo → nome → grupo → meta → descrição.
 * Nunca retorna null — sempre cai em 'Geral' como fallback.
 */
function classificarRubrica(rubrica) {
  // 1. centro_custo — se for museu físico ou noturno, usar direto
  const cc = normalizarCentro(rubrica.centro_custo);
  if (cc && ['MHAB', 'MIS', 'MUMO', 'Noturno 2026', 'Noturno Pampulha'].includes(cc)) return cc;

  // 2. Nome da rubrica
  const nome = normalizeText(rubrica.rubrica || rubrica.nome || '');

  // 3. Grupo
  const grupo = normalizeText(rubrica.grupo || '');

  // 4. Meta
  const meta = normalizeText(rubrica.meta || '');

  // 5. Descrição
  const desc = normalizeText(rubrica.descricao || '');

  const texto = [nome, grupo, meta, desc].join(' ');

  // Verificar tokens de museu no texto combinado
  if (isNoturnoPampulha(texto)) return 'Noturno Pampulha';
  if (isNoturno(texto)) return 'Noturno 2026';
  if (hasMuseuToken(texto, 'MHAB')) return 'MHAB';
  if (hasMuseuToken(texto, 'MIS')) return 'MIS';
  if (hasMuseuToken(texto, 'MUMO')) return 'MUMO';

  // Se tem centro_custo válido (ex: Coordenação), retornar ele
  if (cc) return cc;

  // Fallback: não deixar rubrica sumir
  return cc || 'Geral';
}

const CENTROS_CUSTO = [
  'MHAB',
  'MIS',
  'MUMO',
  'Noturno 2026',
  'Noturno Pampulha',
  'Geral',
  'Coordenação',
  'Comunicação',
  'Educação',
  'Produção',
  'Administrativo-financeiro',
  'Publicações',
  'Consultorias',
  'Despesas Gerais',
];

export default function RubricasByMuseuDashboard({ rubricas = [], purchases = [], onRefresh }) {
  const [editingMuseu, setEditingMuseu] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [savingMuseu, setSavingMuseu] = useState(null);
  const [showLoteModal, setShowLoteModal] = useState(false);
  const [loteQuery, setLoteQuery] = useState('');

  // Calcular dados por centro de custo — usando classificação híbrida
  const dadosPorMuseu = useMemo(() => {
    const map = {};

    CENTROS_CUSTO.forEach((centro) => {
      map[centro] = {
        museu: centro,
        rubricas: [],
        totalPrevisto: 0,
        totalUtilizado: 0,
        totalDisponivel: 0
      };
    });

    // Deduplicar rubricas por id
    const seen = new Set();
    const unicas = (rubricas || []).filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });

    unicas.forEach((r) => {
      const centro = classificarRubrica(r);
      if (!centro || !map[centro]) {
        // Garantir que centro existe (criar dinamicamente se necessário)
        if (centro && !map[centro]) map[centro] = { museu: centro, rubricas: [], totalPrevisto: 0, totalUtilizado: 0, totalDisponivel: 0 };
        if (!centro || !map[centro]) return;
      }

      const valor = toNumber(r?.valor_rubrica || r?.valor_total);
      const utilizado = toNumber(r?.valor_utilizado);
      const disponivel = valor - utilizado;

      map[centro].rubricas.push({
        ...r,
        valor,
        utilizado,
        disponivel,
        percentual: valor > 0 ? (utilizado / valor) * 100 : 0
      });

      map[centro].totalPrevisto += valor;
      map[centro].totalUtilizado += utilizado;
      map[centro].totalDisponivel += disponivel;
    });

    // Sobrescrever previstos com valores contratuais oficiais
    const PREVISTOS_OFICIAIS = {
      'Noturno 2026': 1320000,
      'Noturno Pampulha': 81719.85,
    };
    Object.entries(PREVISTOS_OFICIAIS).forEach(([centro, previsto]) => {
      if (map[centro] && map[centro].rubricas.length > 0) {
        map[centro].totalPrevisto = previsto;
        map[centro].totalDisponivel = previsto - map[centro].totalUtilizado;
      }
    });

    // Retorna apenas centros que têm rubricas
    return Object.values(map).filter((d) => d.rubricas.length > 0);
  }, [rubricas]);

  // Calcular status por centro de custo
  const statusPorMuseu = useMemo(() => {
    const map = {};

    CENTROS_CUSTO.forEach((centro) => {
      const purchasesMuseu = (purchases || []).filter((p) => {
        const centroPurchase = normalizarCentro(p?.centro_custo);
        return centroPurchase === centro;
      });

      const aprovados = purchasesMuseu.filter((p) => {
        const status = String(p?.status || '').toUpperCase();
        return ['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO'].includes(status);
      });

      const pagos = purchasesMuseu.filter((p) => String(p?.status || '').toUpperCase() === 'PAGO');

      map[centro] = {
        museu: centro,
        totalCompras: purchasesMuseu.length,
        aprovadas: aprovados.length,
        pagas: pagos.length,
        percentualAprovacao: purchasesMuseu.length > 0 ? (aprovados.length / purchasesMuseu.length) * 100 : 0,
        percentualPagamento: aprovados.length > 0 ? (pagos.length / aprovados.length) * 100 : 0
      };
    });

    return map;
  }, [purchases]);

  async function handleEditOrcamento(museu, rubricaId, currentValue) {
    setEditingMuseu(`${museu}-${rubricaId}`);
    setEditValue(String(currentValue));
  }

  async function handleSaveOrcamento(museu, rubricaId) {
    setSavingMuseu(`${museu}-${rubricaId}`);

    try {
      const newValue = parseFloat(String(editValue).replace(/\./g, '').replace(',', '.'));

      if (!Number.isFinite(newValue) || newValue < 0) {
        toast.error('Informe um valor válido');
        return;
      }

      await base44.entities.Rubrica.update(rubricaId, {
        valor_rubrica: newValue
      });

      toast.success('Valor atualizado');
      setEditingMuseu(null);
      if (onRefresh) onRefresh();
    } catch (e) {
      toast.error('Erro ao salvar');
    } finally {
      setSavingMuseu(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Botão edição em lote */}
      <div className="flex justify-end">
        <button
          onClick={() => { setLoteQuery(''); setShowLoteModal(true); }}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-neutral-300 bg-white text-sm font-semibold text-neutral-700 hover:bg-neutral-50 transition"
        >
          <Layers className="h-4 w-4" /> Editar Rubricas em Lote
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {dadosPorMuseu.map((dados) => {
          const status = statusPorMuseu[dados.museu] || {};
          const percentualUso = dados.totalPrevisto > 0 ? (dados.totalUtilizado / dados.totalPrevisto) * 100 : 0;
          const statusColor =
            percentualUso > 90 ? 'text-red-600' : percentualUso > 70 ? 'text-amber-600' : 'text-green-700';

          return (
            <Card key={dados.museu} className="p-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Building2 className="h-5 w-5 text-gray-600" />
                  <h3 className="font-semibold text-gray-900">{dados.museu}</h3>
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <p className="text-xs text-gray-500">Orçamento Previsto</p>
                  <p className="text-lg font-bold text-gray-900">{fmtBRL(dados.totalPrevisto)}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Utilizado</p>
                  <p className="text-lg font-bold text-blue-700">{fmtBRL(dados.totalUtilizado)}</p>
                </div>

                <div>
                  <p className="text-xs text-gray-500">Saldo Disponível</p>
                  <p className={`text-lg font-bold ${dados.totalDisponivel < 0 ? 'text-red-600' : 'text-green-700'}`}>
                    {fmtBRL(dados.totalDisponivel)}
                  </p>
                </div>

                <div className="pt-2 border-t border-gray-200">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-medium text-gray-600">Execução</p>
                    <p className={`text-xs font-bold ${statusColor}`}>{percentualUso.toFixed(1)}%</p>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        percentualUso > 90 ? 'bg-red-600' : percentualUso > 70 ? 'bg-amber-500' : 'bg-green-600'
                      }`}
                      style={{ width: `${Math.min(percentualUso, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-200 space-y-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Solicitações</span>
                    <span className="font-semibold text-gray-900">{status.totalCompras}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Aprovadas</span>
                    <span className="font-semibold text-green-700">
                      {status.aprovadas} ({status.percentualAprovacao?.toFixed(0)}%)
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Pagas</span>
                    <span className="font-semibold text-blue-700">
                      {status.pagas} ({status.percentualPagamento?.toFixed(0)}%)
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Tabela detalhada por museu */}
      <div className="space-y-6">
      {dadosPorMuseu.map((museuDados) => (
        <div key={museuDados.museu} className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-3 border-b border-gray-200 flex items-center justify-between">
            <h4 className="font-semibold text-gray-900 flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Rubricas — {museuDados.museu}
            </h4>
            <button
              onClick={() => { setLoteQuery(museuDados.museu); setShowLoteModal(true); }}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-neutral-200 bg-white text-xs font-semibold text-neutral-600 hover:bg-neutral-50 transition"
            >
              <Layers className="h-3 w-3" /> Editar em Lote
            </button>
          </div>

            {museuDados.rubricas.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">Nenhuma rubrica vinculada</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-gray-600">Rubrica</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Orçamento</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Utilizado</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">Saldo</th>
                      <th className="px-3 py-2 text-right font-medium text-gray-600">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {museuDados.rubricas.map((r) => (
                      <tr key={r.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-2 text-gray-700">{r.rubrica || r.nome}</td>
                        <td
                          className="px-3 py-2 text-right cursor-pointer hover:bg-yellow-100 font-medium text-gray-900"
                          onClick={() => handleEditOrcamento(museuDados.museu, r.id, r.valor)}
                        >
                          {editingMuseu === `${museuDados.museu}-${r.id}` ? (
                            <input
                              autoFocus
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={() => handleSaveOrcamento(museuDados.museu, r.id)}
                              className="w-full border rounded px-1 text-right"
                              disabled={savingMuseu === `${museuDados.museu}-${r.id}`}
                            />
                          ) : (
                            fmtBRL(r.valor)
                          )}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-blue-700">{fmtBRL(r.utilizado)}</td>
                        <td
                          className={`px-3 py-2 text-right font-medium ${
                            r.disponivel < 0 ? 'text-red-600' : 'text-green-700'
                          }`}
                        >
                          {fmtBRL(r.disponivel)}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-600">{r.percentual.toFixed(1)}%</td>
                      </tr>
                    ))}
                    <tr className="bg-gray-50 font-bold border-t border-gray-200">
                      <td className="px-3 py-2">TOTAL</td>
                      <td className="px-3 py-2 text-right text-gray-900">{fmtBRL(museuDados.totalPrevisto)}</td>
                      <td className="px-3 py-2 text-right text-blue-700">{fmtBRL(museuDados.totalUtilizado)}</td>
                      <td
                        className={`px-3 py-2 text-right ${
                          museuDados.totalDisponivel < 0 ? 'text-red-600' : 'text-green-700'
                        }`}
                      >
                        {fmtBRL(museuDados.totalDisponivel)}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-600">
                        {museuDados.totalPrevisto > 0
                          ? ((museuDados.totalUtilizado / museuDados.totalPrevisto) * 100).toFixed(1)
                          : 0}
                        %
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {showLoteModal && (
        <EditarRubricasEmLoteModal
          rubricas={rubricas}
          initialQuery={loteQuery}
          onClose={() => setShowLoteModal(false)}
          onUpdated={async () => { if (onRefresh) await onRefresh(); setShowLoteModal(false); }}
        />
      )}
    </div>
  );
}