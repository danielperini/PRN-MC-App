import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { AlertTriangle, ExternalLink, Wand2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

const DRIVE_PASTA_NFS = 'https://drive.google.com/drive/u/0/folders/1Ov9ci6Dwg297mm7QiqX1wfLIb92EZSGf';
const TOTAL_PREVISTO_PAMPULHA = 81719.85;
const PAMPULHA_CENTRO_ALIASES = ['Noturno Pampulha', 'Noturno nos Museus Pampulha'];
const PAMPULHA_CENTROS_NORMALIZADOS = new Set(PAMPULHA_CENTRO_ALIASES.map(normalizeText));
const STATUS_CONTABILIZADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

function toNumber(v) {
  const n = Number(v ?? 0);
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

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

function isPampulha(value) {
  const texto = normalizeText(value);
  return PAMPULHA_CENTROS_NORMALIZADOS.has(texto)
    || (texto.includes('noturno') && texto.includes('pampulha'))
    || (texto.includes('noturno') && texto.includes('4') && texto.includes('aditivo'));
}

function valorCompra(compra) {
  return toNumber(compra?.valor_pago)
    || toNumber(compra?.valor_aprovado_admin)
    || toNumber(compra?.valor_aprovado)
    || toNumber(compra?.valor_final)
    || toNumber(compra?.valor_solicitado)
    || toNumber(compra?.valor_total)
    || toNumber(compra?.valor)
    || 0;
}

function chaveFiscal(compra) {
  const nf = String(compra?.nf_numero || compra?.numero_nota || '').trim();
  const cnpj = String(
    compra?.fornecedor_cpf_cnpj
      || compra?.fornecedor_cnpj
      || compra?.nf_emitente_cpf_cnpj
      || ''
  ).replace(/\D/g, '');
  const valor = valorCompra(compra).toFixed(2);
  if (nf && cnpj) return `nf:${nf}:${cnpj}:${valor}`;
  const url = compra?.nota_fiscal_url || compra?.nf_pdf_url || compra?.pdf_url || compra?.file_url;
  if (url) return `url:${url}`;
  return compra?.id ? `id:${compra.id}` : null;
}

function idRubricaCompra(compra) {
  return compra?.rubrica_id
    || compra?.budgetline_id
    || compra?.budget_line_id
    || compra?.linha_orcamentaria_id
    || compra?.rubrica?.id
    || null;
}

function nomeRubricaCompra(compra, rubricaById) {
  const id = idRubricaCompra(compra);
  const rubrica = id ? rubricaById.get(String(id)) : null;
  return compra?.rubrica_nome
    || compra?.budgetline_nome
    || compra?.linha_orcamentaria_nome
    || (typeof compra?.rubrica === 'string' ? compra.rubrica : null)
    || rubrica?.rubrica
    || rubrica?.nome
    || rubrica?.descricao
    || 'Sem rubrica vinculada';
}

function previstoRubrica(compra, rubricaById) {
  const id = idRubricaCompra(compra);
  const rubrica = id ? rubricaById.get(String(id)) : null;
  return toNumber(rubrica?.valor_rubrica || rubrica?.valor_total);
}

export default function NoturnoPampulhaCard({ isCoordenador = false }) {
  const queryClient = useQueryClient();
  const [preenchendo, setPreenchendo] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function handlePreencherLote() {
    if (!window.confirm('Preencher automaticamente rubrica, natureza de despesa e Cód. N4 para todas as solicitações do Noturno Pampulha com campos faltantes?')) return;
    setPreenchendo(true);
    setResultado(null);
    try {
      const resp = await base44.functions.invoke('preencherCamposNFPampulha', {});
      const data = resp?.data || resp;
      setResultado(data);
      if (data?.atualizadas > 0) {
        toast.success(`${data.atualizadas} solicitação(ões) atualizadas com sucesso!`);
        queryClient.invalidateQueries({ queryKey: ['compras-pampulha-4aditivo'] });
      } else {
        toast.info('Nenhuma solicitação precisava de atualização.');
      }
    } catch (e) {
      toast.error('Erro ao preencher: ' + (e?.message || 'Tente novamente'));
    } finally {
      setPreenchendo(false);
    }
  }

  const { data: rubricas = [], isLoading: loadingRubricas } = useQuery({
    queryKey: ['rubricas-pampulha-4aditivo'],
    queryFn: async () => {
      const results = await Promise.all(
        PAMPULHA_CENTRO_ALIASES.map(cc =>
          base44.entities.Rubrica.filter({ centro_custo: cc, ativo: true })
        )
      );
      const todas = results.flat();
      const seen = new Set();
      return todas.filter(r => {
        const key = String(r.id || `${r.rubrica || r.nome}:${r.centro_custo || ''}`);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: compras = [], isLoading: loadingCompras } = useQuery({
    queryKey: ['compras-pampulha-4aditivo'],
    queryFn: () => base44.entities.PurchaseRequest.list('-created_date', 3000),
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const invalidar = () => {
      queryClient.invalidateQueries({ queryKey: ['rubricas-pampulha-4aditivo'] });
      queryClient.invalidateQueries({ queryKey: ['compras-pampulha-4aditivo'] });
    };
    const unsubRubricas = base44.entities.Rubrica.subscribe(invalidar);
    const unsubCompras = base44.entities.PurchaseRequest.subscribe(invalidar);
    return () => {
      unsubRubricas?.();
      unsubCompras?.();
    };
  }, [queryClient]);

  const resumo = useMemo(() => {
    const rubricaById = new Map((rubricas || []).map(r => [String(r.id), r]));
    const comprasUnicas = new Map();

    (compras || []).forEach(compra => {
      const status = String(compra?.status || '').toUpperCase();
      if (!STATUS_CONTABILIZADOS.has(status)) return;
      if (!isPampulha(compra?.centro_custo)) return;
      const key = chaveFiscal(compra);
      if (!key || comprasUnicas.has(key)) return;
      comprasUnicas.set(key, compra);
    });

    const grupos = new Map();
    Array.from(comprasUnicas.values()).forEach(compra => {
      const nome = nomeRubricaCompra(compra, rubricaById);
      const key = normalizeText(nome);
      const atual = grupos.get(key) || {
        nome,
        previsto: previstoRubrica(compra, rubricaById),
        utilizado: 0,
        documentos: 0,
      };
      atual.utilizado += valorCompra(compra);
      atual.documentos += 1;
      grupos.set(key, atual);
    });

    const rubricasComCusto = Array.from(grupos.values())
      .map(item => ({
        ...item,
        utilizado: Number(item.utilizado.toFixed(2)),
        saldo: Number((item.previsto - item.utilizado).toFixed(2)),
        pct: item.previsto > 0 ? (item.utilizado / item.previsto) * 100 : null,
      }))
      .filter(item => item.utilizado > 0)
      .sort((a, b) => b.utilizado - a.utilizado);

    const totalUtilizado = Number(
      rubricasComCusto.reduce((acc, item) => acc + item.utilizado, 0).toFixed(2)
    );
    const totalPago = Number(
      Array.from(comprasUnicas.values())
        .filter(c => String(c.status || '').toUpperCase() === 'PAGO')
        .reduce((acc, c) => acc + valorCompra(c), 0)
        .toFixed(2)
    );

    return {
      rubricasComCusto,
      totalUtilizado,
      totalPago,
      totalDocumentos: comprasUnicas.size,
      semRubrica: rubricasComCusto.find(item => item.nome === 'Sem rubrica vinculada')?.documentos || 0,
    };
  }, [rubricas, compras]);

  const totalPrevisto = TOTAL_PREVISTO_PAMPULHA;
  const totalUtilizado = resumo.totalUtilizado;
  const saldo = Number((totalPrevisto - totalUtilizado).toFixed(2));
  const pct = totalPrevisto > 0 ? (totalUtilizado / totalPrevisto) * 100 : 0;
  const barColor = pct > 90 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-violet-600';
  const isLoading = loadingRubricas || loadingCompras;

  return (
    <div className="rounded-2xl border border-violet-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-violet-50 border-b border-violet-100 px-5 py-4 flex items-center justify-between gap-3">
        <div>
          <span className="inline-block rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 mb-1">
            4º Aditivo
          </span>
          <h2 className="text-lg font-bold text-gray-900 leading-tight">Noturno Pampulha</h2>
          <p className="text-xs text-gray-500 mt-0.5">Custos reais aprovados ou pagos, vinculados ao centro de custo do Noturno Pampulha.</p>
        </div>
        <div className="flex items-center gap-2">
          {isCoordenador && (
            <button
              onClick={handlePreencherLote}
              disabled={preenchendo}
              className="flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-100 px-3 py-2 text-xs font-medium text-violet-800 hover:bg-violet-200 transition-colors disabled:opacity-50"
              title="Preencher rubrica, natureza e Cód. N4 em lote"
            >
              <Wand2 className={`w-3.5 h-3.5 ${preenchendo ? 'animate-spin' : ''}`} />
              {preenchendo ? 'Preenchendo...' : 'Preencher em lote'}
            </button>
          )}
          <a
            href={DRIVE_PASTA_NFS}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg border border-violet-200 bg-white px-3 py-2 text-xs font-medium text-violet-700 hover:bg-violet-50 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Pasta Drive NFs
          </a>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-gray-100 border-b border-gray-100">
        <div className="px-4 py-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">Crédito previsto</p>
          <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{isLoading ? '...' : fmtBRL(totalPrevisto)}</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">Utilizado real</p>
          <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{isLoading ? '...' : fmtBRL(totalUtilizado)}</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">Pago</p>
          <p className="text-xl font-bold text-gray-900 mt-1 tabular-nums">{isLoading ? '...' : fmtBRL(resumo.totalPago)}</p>
        </div>
        <div className="px-4 py-4">
          <p className="text-[11px] uppercase tracking-wide font-semibold text-gray-500">Saldo</p>
          <p className={`text-xl font-bold mt-1 tabular-nums ${saldo < 0 ? 'text-red-600' : 'text-green-700'}`}>
            {isLoading ? '...' : fmtBRL(saldo)}
          </p>
        </div>
      </div>

      <div className="px-5 py-3 border-b border-gray-50">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1.5">
          <span>Percentual de execução</span>
          <span className="font-bold text-gray-700">{pct.toFixed(1)}%</span>
        </div>
        <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-2 rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      </div>

      <div className="px-5 py-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
            Rubricas com custo real ({resumo.rubricasComCusto.length})
          </p>
          <p className="text-[11px] text-gray-400">{resumo.totalDocumentos} documento(s) único(s)</p>
        </div>

        {resumo.semRubrica > 0 && (
          <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-center gap-2 text-xs text-amber-700">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {resumo.semRubrica} documento(s) ainda sem rubrica vinculada.
          </div>
        )}

        {resultado && (
          <div className={`mb-3 rounded-xl border px-3 py-2 text-xs flex items-start gap-2 ${resultado.atualizadas > 0 ? 'border-green-200 bg-green-50 text-green-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
            {resultado.atualizadas > 0
              ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-600" />
              : <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-slate-500" />
            }
            <div>
              <span className="font-semibold">Resultado do preenchimento:</span>{' '}
              {resultado.atualizadas} atualizada(s) · {resultado.ja_completas} já completa(s) · {resultado.sem_match} sem correspondência
            </div>
          </div>
        )}

        {isLoading ? (
          <p className="text-xs text-gray-400">Carregando...</p>
        ) : resumo.rubricasComCusto.length === 0 ? (
          <p className="text-xs text-gray-400">Nenhum custo aprovado ou pago foi encontrado para este centro de custo.</p>
        ) : (
          <div className="space-y-2">
            {resumo.rubricasComCusto.map((item) => (
              <div key={normalizeText(item.nome)} className="rounded-xl border border-gray-100 bg-gray-50/50 p-3">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-800">{item.nome}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{item.documentos} documento(s)</p>
                  </div>
                  <span className="text-xs font-bold tabular-nums shrink-0 text-gray-800">{fmtBRL(item.utilizado)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-gray-400 mb-1">
                  <span>Prev: {item.previsto > 0 ? fmtBRL(item.previsto) : 'não vinculado'}</span>
                  <span>Util: {fmtBRL(item.utilizado)}</span>
                  <span>{item.pct == null ? '—' : `${item.pct.toFixed(0)}%`}</span>
                </div>
                {item.previsto > 0 && (
                  <div className="h-1 w-full rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-1 rounded-full ${item.pct > 90 ? 'bg-red-500' : 'bg-violet-500'}`}
                      style={{ width: `${Math.min(item.pct, 100)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}