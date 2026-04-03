// 🔥 VERSÃO ESTÁVEL — GARANTIA DE RUBRICA + SEGURANÇA ORÇAMENTÁRIA

import React, { useMemo, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { notifyCoordinators } from '@/lib/notifyHelpers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  AlertCircle, CheckCircle2, Eye, FileText, Loader2, Plus, Upload, Brain
} from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';

/* =========================
   🔒 NORMALIZAÇÃO CRÍTICA
========================= */

function normalizeRubricaId(value) {
  if (!value) return null;
  const v = String(value).trim();
  return v || null;
}

function normalizeRubricaNome(value) {
  if (!value) return '';
  return String(value).trim();
}

/* =========================
   RESTANTE DO ARQUIVO ORIGINAL (INALTERADO)
========================= */

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

// ... (TODO O RESTANTE DO CÓDIGO PERMANECE IGUAL ATÉ handleSubmit)

/* =========================
   🔥 ALTERAÇÃO PRINCIPAL
========================= */

async function handleSubmit(e) {
  e.preventDefault();
  if (submitting) return;

  clearSubmitError();

  // 🔒 NORMALIZAÇÃO FORTE DE RUBRICA
  const rubricaIdFinal = normalizeRubricaId(selectedRubricaId);
  const rubricaNomeFinal = normalizeRubricaNome(selectedRubricaNome);

  if (!rubricaIdFinal) {
    toast.error('Envio bloqueado: rubrica obrigatória.');
    return;
  }

  if (!rubricaNomeFinal) {
    toast.error('Envio bloqueado: nome da rubrica não identificado.');
    return;
  }

  // ... (resto das validações permanece igual)

  try {
    // ...

    const payload = {
      team_member_id: effectiveMember.id,
      user_email: effectiveMember.user_email,
      user_name: resolvedName || '',
      funcao: resolvedFuncao,
      role: resolvedFuncao,
      mes_referencia: selectedComp.mes,
      ano: selectedComp.ano,
      numero_nf: form.numero_nf,
      valor_nf: toNumber(form.valor_nf || valorParcela),
      valor_parcela_previsto: valorParcela,
      numero_parcela: (toNumber(effectiveMember.parcelas_pagas) || 0) + 1,
      nota_fiscal_url: pdfUrl,
      xml_url: xmlUrl,
      nota_fiscal_file_name: pdfName,
      xml_file_name: xmlName,
      descricao_nf_modelo: descricaoModelo,

      // 🔥 GARANTIA DE CONSISTÊNCIA
      rubrica_id: rubricaIdFinal,
      rubrica_nome: rubricaNomeFinal,

      analysis_status: ar?.status || 'ANALISADO',
      analysis_summary: ar?.summary || '',
      analysis_warnings: Array.isArray(ar?.warnings) ? ar.warnings : [],
      analysis_critical_issues: Array.isArray(ar?.critical_issues) ? ar.critical_issues : [],
      resultado_validacao: JSON.stringify(ar || {}),
      status: 'AGUARDANDO_APROVACAO',

      unique_key: `${effectiveMember.user_email}_${selectedComp.mes}_${selectedComp.ano}`
    };

    // 🔒 BLOQUEIO FINAL (FAIL-SAFE)
    if (!payload.rubrica_id) {
      throw new Error('Falha crítica: rubrica_id ausente no payload.');
    }

    const created = await base44.entities.TeamPayment.create(payload);

    // ...
  } catch (e) {
    // ... (inalterado)
  }
}

/* =========================
   RESTANTE DO COMPONENTE
========================= */

export default TeamPaymentSubmit;
