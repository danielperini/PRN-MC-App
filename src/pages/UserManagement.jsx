import React, { useState, useEffect, useRef } from 'react';
import {
  FileText, Image, CheckCircle2, Clock, AlertCircle, Loader2,
  Eye, Send, RefreshCw, X, Download, ExternalLink, Link2, Plus, Receipt, AlertTriangle
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { deleteIntake } from '@/lib/deleteIntegrado';

const STATUS_CONFIG = {
  ENVIADO: { label: 'Enviado', color: 'bg-blue-100 text-blue-700', icon: Clock },
  ANALISANDO_IA: { label: 'Analisando...', color: 'bg-yellow-100 text-yellow-700', icon: Loader2, spin: true },
  AGUARDANDO_REVISAO: { label: 'Aguardando revisão', color: 'bg-orange-100 text-orange-700', icon: Eye },
  RASCUNHO: { label: 'Rascunho', color: 'bg-slate-100 text-slate-600', icon: FileText },
  ENVIADO_APROVACAO: { label: 'Enviado p/ aprovação', color: 'bg-purple-100 text-purple-700', icon: Send },
  APROVADO: { label: 'Aprovado', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  REJEITADO: { label: 'Rejeitado', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  ERRO_PROCESSAMENTO: { label: 'Erro', color: 'bg-red-100 text-red-700', icon: AlertCircle },
};

function parseValorBR(v) {
  const s = String(v || '0').trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) {
    return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(s.replace(',', '.')) || 0;
}

function onlyDigits(v) {
  return String(v || '').replace(/\D/g, '');
}

export default function DocumentIntakeCard({
  intake,
  onReview,
  onDeleted,
  onSentToApproval,
  onReanalyse
}) {
  const [loading, setLoading] = useState(false);
  const [sendingApproval, setSendingApproval] = useState(false);
  const [isDuplicado, setIsDuplicado] = useState(false);

  const status = STATUS_CONFIG[intake.status_processamento] || STATUS_CONFIG.ENVIADO;
  const Icon = status.icon;

  const ia = intake.resultado_ia || {};
  const valor = parseValorBR(ia.nf_valor_total || intake.valor || 0);

  // =========================
  // DETECÇÃO DE DUPLICIDADE (IA + BACKEND)
  // =========================
  useEffect(() => {
    async function checkDuplicado() {
      try {
        const nf = onlyDigits(ia.nf_numero);
        const cnpj = onlyDigits(ia.nf_emitente_cpf_cnpj);

        if (!nf || !cnpj || !valor) return;

        const lista = await base44.entities.PurchaseRequest.list('-created_date', 300);

        const duplicado = (lista || []).some(p => {
          return (
            onlyDigits(p.nf_numero) === nf &&
            onlyDigits(p.fornecedor_cnpj || p.fornecedor_cpf_cnpj) === cnpj &&
            Math.abs(parseValorBR(p.valor || p.valor_solicitado) - valor) < 0.01
          );
        });

        setIsDuplicado(duplicado);
      } catch (e) {
        console.error('erro duplicidade', e);
      }
    }

    checkDuplicado();
  }, []);

  async function handleDelete() {
    if (!confirm('Deletar documento?')) return;
    setLoading(true);
    try {
      await deleteIntake(intake);
      onDeleted?.(intake.id);
    } catch (e) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }

  // =========================
  // ENVIAR = MESMA AÇÃO DE APROVAÇÃO
  // =========================
  async function handleSend() {
    if (isDuplicado) {
      toast.error('Documento duplicado. Verifique antes de enviar.');
      return;
    }

    setSendingApproval(true);

    try {
      const rubrica_id = intake.rubrica_id_sugerida;
      const centro_custo = intake.centro_custo;

      if (!rubrica_id) {
        toast.error('Rubrica obrigatória.');
        return;
      }

      const valorFinal = valor;

      const pr = await base44.entities.PurchaseRequest.create({
        descricao_item: ia.descricao_servico || ia.nf_emitente_nome,
        fornecedor_nome: ia.nf_emitente_nome,
        fornecedor_cnpj: ia.nf_emitente_cpf_cnpj,
        valor: valorFinal,
        valor_solicitado: valorFinal,
        rubrica_id,
        budgetline_id: rubrica_id,
        centro_custo,
        status: 'AGUARDANDO_APROVACAO',
        origem: 'EntradaUnica',
        intake_id: intake.id,
        nf_numero: ia.nf_numero,
        nf_valor_total: valorFinal,
      });

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ENVIADO_APROVACAO',
        entidade_destino_id: pr
