import React, { useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  isFinanciallyActiveStatus,
  normalizeCentroCusto,
  getFinancialDedupKey,
  getPurchaseValue,
  hasInvalidFiscalDate,
} from '@/utils/finance/financeiroUtils';

const AUTO_RECALC_KEY = 'compras-financeiro-auto-recalc-date';

function toNumber(v) {
  if (typeof v === 'string') {
    const c = v.replace(/[R$\s.]/g, '').replace(',', '.');
    const n = parseFloat(c);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function duplicatePriority(nf) {
  let score = 0;
  if (nf.comprovante_pagamento_url || nf.comprovante_url) score += 16;
  if (nf.drive_backup_status === 'concluido') score += 8;
  if (nf.nota_fiscal_pdf_url || nf.nf_pdf_url) score += 4;
  if (nf.nota_fiscal_xml_url || nf.xml_url) score += 2;
  if (String(nf.status || '').toUpperCase() === 'PAGO') score += 1;
  return score;
}

function getRubricaId(purchase) {
  return purchase?.rubrica_id || purchase?.budgetline_id || purchase?.budget_line_id || purchase?.linha_orcamentaria_id || null;
}

function getRubricaPrevisto(rubrica) {
  return toNumber(rubrica?.valor_rubrica) || toNumber(rubrica?.valor_total) || toNumber(rubrica?.valor_previsto) || 0;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export default function RecalcularTotaisButton({ onDone }) {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const runningRef = useRef(false);

  async function executarRecalculo({ automatico = false } = {}) {
    if (runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    setResultado(null);
    const loteId = `LOTE-${Date.now()}`;

    try {
      const user = await base44.auth.me();
      const executado_por = user?.email || 'sistema';

      const [purchasesRaw, rubricasRaw] = await Promise.all([
        base44.asServiceRole.entities.PurchaseRequest.list(),
        base44.asServiceRole.entities.Rubrica.list(),
      ]);

      const purchases = Array.isArray(purchasesRaw) ? purchasesRaw : [];
      const rubricas = Array.isArray(rubricasRaw) ? rubricasRaw : [];
      const logs = [];
      const purchaseUpdates = [];

      for (const nf of purchases) {
        const { centro_normalizado } = normalizeCentroCusto(nf);
        const ccAtual = String(nf.centro_custo || '').trim();
        if (centro_normalizado && centro_normalizado !== ccAtual && ccAtual !== '') {
          logs.push({
            nf_id: nf.id,
            acao: 'CENTRO_NORMALIZADO',
            campo: 'centro_custo',
            valor_anterior: ccAtual,
            valor_novo: centro_normalizado,
            motivo: 'Normalização usada no cálculo; campo original preservado',
            executado_por,
            lote_id: loteId,
          });
        }
      }

      const ativas = purchases.filter((p) => isFinanciallyActiveStatus(p.status) && !hasInvalidFiscalDate(p));
      const keyMap = new Map();

      for (const nf of ativas) {
        if (nf.incluir_no_somatorio === false && nf.duplicada_financeira !== true) continue;
        const key = getFinancialDedupKey(nf);
        const effectiveKey = key || `NO_KEY:${nf.id}`;

        if (!keyMap.has(effectiveKey)) {
          keyMap.set(effectiveKey, nf);
          continue;
        }

        const current = keyMap.get(effectiveKey);
        const principal = duplicatePriority(nf) > duplicatePriority(current) ? nf : current;
        const duplicata = principal === nf ? current : nf;
        keyMap.set(effectiveKey, principal);

        purchaseUpdates.push({
          id: duplicata.id,
          duplicada_financeira: true,
          incluir_no_somatorio: false,
          duplicata_de: principal.id,
        });
        logs.push({
          nf_id: duplicata.id,
          acao: 'DUPLICATA_DETECTADA',
          campo: 'duplicada_financeira',
          valor_anterior: String(duplicata.duplicada_financeira === true),
          valor_novo: 'true',
          motivo: `Chave duplicada: ${effectiveKey}. Principal: ${principal.id}`,
          executado_por,
          lote_id: loteId,
        });
      }

      const duplicataIds = new Set(purchaseUpdates.map((u) => u.id));
      for (const nf of purchases) {
        if (nf.duplicada_financeira === true && !duplicataIds.has(nf.id)) {
          purchaseUpdates.push({ id: nf.id, duplicada_financeira: false, incluir_no_somatorio: true, duplicata_de: null });
          logs.push({
            nf_id: nf.id,
            acao: 'DUPLICATA_REVERTIDA',
            campo: 'duplicada_financeira',
            valor_anterior: 'true',
            valor_novo: 'false',
            motivo: 'Registro deixou de ser duplicata no recálculo atual',
            executado_por,
            lote_id: loteId,
          });
        }
      }

      const BATCH = 20;
      let nfsAtualizadas = 0;
      for (let i = 0; i < purchaseUpdates.length; i += BATCH) {
        const lote = purchaseUpdates.slice(i, i + BATCH);
        await Promise.all(lote.map(({ id, ...data }) => base44.asServiceRole.entities.PurchaseRequest.update(id, data)));
        nfsAtualizadas += lote.length;
      }

      const principais = Array.from(keyMap.values()).filter((p) => p.incluir_no_somatorio !== false || p.duplicada_financeira === true);
      const utilizadoPorRubrica = new Map();
      for (const purchase of principais) {
        const rubricaId = getRubricaId(purchase);
        if (!rubricaId) continue;
        utilizadoPorRubrica.set(rubricaId, (utilizadoPorRubrica.get(rubricaId) || 0) + getPurchaseValue(purchase));
      }

      const rubricaUpdates = [];
      for (const rubrica of rubricas) {
        if (!rubrica?.id || rubrica?.ativo === false) continue;
        const novoUtilizado = Number((utilizadoPorRubrica.get(rubrica.id) || 0).toFixed(2));
        const utilizadoAtual = Number(toNumber(rubrica.valor_utilizado).toFixed(2));
        if (Math.abs(novoUtilizado - utilizadoAtual) <= 0.01) continue;

        const previsto = getRubricaPrevisto(rubrica);
        rubricaUpdates.push({
          id: rubrica.id,
          valor_utilizado: novoUtilizado,
          saldo: Number((previsto - novoUtilizado).toFixed(2)),
        });
        logs.push({
          nf_id: rubrica.id,
          acao: 'RUBRICA_RECALCULADA',
          campo: 'valor_utilizado',
          valor_anterior: String(utilizadoAtual),
          valor_novo: String(novoUtilizado),
          motivo: 'Soma de solicitações aprovadas/pagas, sem duplicidades e sem datas fiscais inválidas',
          executado_por,
          lote_id: loteId,
        });
      }

      let rubricasAtualizadas = 0;
      for (let i = 0; i < rubricaUpdates.length; i += BATCH) {
        const lote = rubricaUpdates.slice(i, i + BATCH);
        await Promise.all(lote.map(({ id, ...data }) => base44.asServiceRole.entities.Rubrica.update(id, data)));
        rubricasAtualizadas += lote.length;
      }

      if (logs.length > 0) {
        await base44.asServiceRole.entities.FinanceiroAuditLog.bulkCreate(logs.slice(0, 200)).catch(() => {});
      }

      const totalUtilizado = principais.reduce((s, p) => s + getPurchaseValue(p), 0);
      const res = {
        total_nfs: purchases.length,
        ativas: ativas.length,
        duplicatas_detectadas: duplicataIds.size,
        nfs_corrigidas: nfsAtualizadas,
        rubricas_corrigidas: rubricasAtualizadas,
        total_utilizado: totalUtilizado,
        lote_id: loteId,
        automatico,
      };

      setResultado(res);
      localStorage.setItem(AUTO_RECALC_KEY, todayKey());
      if (!automatico) {
        toast.success(`Recálculo concluído — ${duplicataIds.size} duplicata(s), ${rubricasAtualizadas} rubrica(s) corrigida(s).`);
      }
      onDone?.();
    } catch (e) {
      if (!automatico) toast.error('Erro no recálculo: ' + (e?.message || 'desconhecido'));
      console.error('[Financeiro] Falha no recálculo automático:', e);
    } finally {
      runningRef.current = false;
      setLoading(false);
    }
  }

  async function handleRecalcular() {
    if (!window.confirm('Recalcular rubricas e totais financeiros?\n\nIsso irá:\n• Detectar e marcar duplicatas\n• Ignorar datas fiscais anteriores a 2026\n• Recalcular o valor utilizado de cada rubrica\n• Atualizar os totais do 3º e 4º aditivos\n\nNenhum registro será deletado.')) return;
    await executarRecalculo({ automatico: false });
  }

  useEffect(() => {
    const jaExecutadoHoje = localStorage.getItem(AUTO_RECALC_KEY) === todayKey();
    if (!jaExecutadoHoje) executarRecalculo({ automatico: true });
  }, []);

  const fmt = (v) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);

  return (
    <div className="flex flex-col gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={handleRecalcular}
        disabled={loading}
        className="flex items-center gap-2 border-amber-300 text-amber-800 hover:bg-amber-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
        {loading ? 'Recalculando...' : 'Recalcular rubricas e totais'}
      </Button>

      {resultado && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold text-green-900">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {resultado.automatico ? 'Recálculo automático concluído' : 'Recálculo concluído'}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
            <span>NFs analisadas:</span><span className="font-medium">{resultado.total_nfs}</span>
            <span>Status ativo:</span><span className="font-medium">{resultado.ativas}</span>
            <span>Duplicatas detectadas:</span>
            <span className={`font-medium ${resultado.duplicatas_detectadas > 0 ? 'text-amber-700' : ''}`}>{resultado.duplicatas_detectadas}</span>
            <span>Rubricas corrigidas:</span><span className="font-medium">{resultado.rubricas_corrigidas}</span>
            <span>Total utilizado válido:</span><span className="font-medium">{fmt(resultado.total_utilizado)}</span>
          </div>
          {resultado.duplicatas_detectadas > 0 && (
            <div className="flex items-center gap-1 text-amber-700 mt-1">
              <AlertTriangle className="h-3 w-3" />
              Duplicatas marcadas sem exclusão de registros
            </div>
          )}
        </div>
      )}
    </div>
  );
}
