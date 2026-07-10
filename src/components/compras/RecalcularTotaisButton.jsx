import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { RefreshCw, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  isFinanciallyActiveStatus,
  normalizeCentroCusto,
  getFinancialDedupKey,
  getPurchaseValue,
} from '@/utils/finance/financeiroUtils';

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

export default function RecalcularTotaisButton({ onDone }) {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function handleRecalcular() {
    if (!window.confirm('Recalcular rubricas e totais financeiros?\n\nIsso irá:\n• Normalizar centros de custo\n• Detectar e marcar duplicatas\n• Recalcular totais dos cards\n\nNenhum registro será deletado.')) return;

    setLoading(true);
    setResultado(null);
    const loteId = `LOTE-${Date.now()}`;

    try {
      const user = await base44.auth.me();
      const executado_por = user?.email || 'sistema';

      // 1. Buscar todas as NFs
      const purchases = await base44.asServiceRole.entities.PurchaseRequest.list();

      const logs = [];
      const updates = [];

      // 2. Normalizar centro_custo
      for (const nf of purchases) {
        const { centro_normalizado } = normalizeCentroCusto(nf);
        const ccAtual = String(nf.centro_custo || '').trim();
        if (centro_normalizado && centro_normalizado !== ccAtual && ccAtual !== '') {
          // Só registra log — não altera o banco (política: não mudar campo existente)
          logs.push({
            nf_id: nf.id,
            acao: 'CENTRO_NORMALIZADO',
            campo: 'centro_custo',
            valor_anterior: ccAtual,
            valor_novo: centro_normalizado,
            motivo: 'Normalização automática de centro de custo',
            executado_por,
            lote_id: loteId,
          });
        }
      }

      // 3. Detectar duplicatas entre NFs financeiramente ativas
      const ativas = purchases.filter(p => isFinanciallyActiveStatus(p.status));
      const keyMap = new Map(); // key -> nf principal

      for (const nf of ativas) {
        const key = getFinancialDedupKey(nf);
        if (!key) continue;
        if (!keyMap.has(key)) {
          keyMap.set(key, nf);
        } else {
          const current = keyMap.get(key);
          if (duplicatePriority(nf) > duplicatePriority(current)) {
            // nf é melhor — current vira duplicata
            keyMap.set(key, nf);
            updates.push({ id: current.id, duplicada_financeira: true, incluir_no_somatorio: false, duplicata_de: nf.id });
            logs.push({
              nf_id: current.id,
              acao: 'DUPLICATA_DETECTADA',
              campo: 'duplicada_financeira',
              valor_anterior: 'false',
              valor_novo: 'true',
              motivo: `Chave duplicada: ${key}. Principal: ${nf.id}`,
              executado_por,
              lote_id: loteId,
            });
          } else {
            // nf é a duplicata
            updates.push({ id: nf.id, duplicada_financeira: true, incluir_no_somatorio: false, duplicata_de: current.id });
            logs.push({
              nf_id: nf.id,
              acao: 'DUPLICATA_DETECTADA',
              campo: 'duplicada_financeira',
              valor_anterior: 'false',
              valor_novo: 'true',
              motivo: `Chave duplicada: ${key}. Principal: ${current.id}`,
              executado_por,
              lote_id: loteId,
            });
          }
        }
      }

      // 4. Limpar flag de duplicata em NFs que não são mais duplicatas
      const duplicataIds = new Set(updates.map(u => u.id));
      const nfsComFlagErrada = purchases.filter(p =>
        (p.duplicada_financeira === true || p.incluir_no_somatorio === false) && !duplicataIds.has(p.id)
      );
      for (const nf of nfsComFlagErrada) {
        updates.push({ id: nf.id, duplicada_financeira: false, incluir_no_somatorio: true, duplicata_de: null });
        logs.push({
          nf_id: nf.id,
          acao: 'DUPLICATA_IGNORADA_NO_TOTAL',
          campo: 'duplicada_financeira',
          valor_anterior: 'true',
          valor_novo: 'false',
          motivo: 'NF não é mais duplicata no recálculo atual',
          executado_por,
          lote_id: loteId,
        });
      }

      // 5. Aplicar updates no banco (em lotes de 20)
      const BATCH = 20;
      let atualizadas = 0;
      for (let i = 0; i < updates.length; i += BATCH) {
        const lote = updates.slice(i, i + BATCH);
        await Promise.all(lote.map(u => {
          const { id, ...data } = u;
          return base44.asServiceRole.entities.PurchaseRequest.update(id, data);
        }));
        atualizadas += lote.length;
      }

      // 6. Registrar logs (sem bloquear — pode falhar sem impacto)
      const logsBatch = logs.slice(0, 100); // Limite de 100 logs por execução
      if (logsBatch.length > 0) {
        await base44.asServiceRole.entities.FinanceiroAuditLog.bulkCreate(logsBatch).catch(() => {});
      }

      // 7. Calcular resumo
      const totalNFs = purchases.length;
      const ativasCount = ativas.length;
      const duplicatasCount = duplicataIds.size;
      const totalUtilizado = Array.from(keyMap.values()).reduce((s, p) => s + getPurchaseValue(p), 0);

      const res = {
        total_nfs: totalNFs,
        ativas: ativasCount,
        duplicatas_detectadas: duplicatasCount,
        nfs_corrigidas: atualizadas,
        total_utilizado: totalUtilizado,
        lote_id: loteId,
      };

      setResultado(res);
      toast.success(`Recálculo concluído — ${duplicatasCount} duplicata(s) detectada(s), ${atualizadas} NF(s) atualizada(s).`);

      if (onDone) onDone();
    } catch (e) {
      toast.error('Erro no recálculo: ' + (e?.message || 'desconhecido'));
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0);

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
            Recálculo concluído
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 mt-1">
            <span>NFs analisadas:</span><span className="font-medium">{resultado.total_nfs}</span>
            <span>Status ativo:</span><span className="font-medium">{resultado.ativas}</span>
            <span>Duplicatas detectadas:</span>
            <span className={`font-medium ${resultado.duplicatas_detectadas > 0 ? 'text-amber-700' : ''}`}>
              {resultado.duplicatas_detectadas}
            </span>
            <span>Total utilizado válido:</span>
            <span className="font-medium">{fmt(resultado.total_utilizado)}</span>
          </div>
          {resultado.duplicatas_detectadas > 0 && (
            <div className="flex items-center gap-1 text-amber-700 mt-1">
              <AlertTriangle className="h-3 w-3" />
              Duplicatas marcadas — verifique a tabela
            </div>
          )}
        </div>
      )}
    </div>
  );
}