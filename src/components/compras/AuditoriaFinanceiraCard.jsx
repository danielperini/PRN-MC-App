import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, ShieldAlert, Pencil, X } from 'lucide-react';

function toNumber(value) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function getChaveFiscal(p) {
  if (p?.nf_numero && (p?.fornecedor_cpf_cnpj || p?.nf_emitente_cpf_cnpj)) {
    return `nf:${String(p.nf_numero).trim()}:${String(p.fornecedor_cpf_cnpj || p.nf_emitente_cpf_cnpj).replace(/\D/g, '')}`;
  }
  if (p?.nota_fiscal_url) return `url:${p.nota_fiscal_url.trim()}`;
  if (p?.file_url) return `file:${p.file_url.trim()}`;
  if (p?.intake_id) return `intake:${p.intake_id.trim()}`;
  return null;
}

function getPurchaseValue(p) {
  return (
    toNumber(p?.valor_pago) ||
    toNumber(p?.valor_aprovado_admin) ||
    toNumber(p?.valor_aprovado) ||
    toNumber(p?.valor_final) ||
    toNumber(p?.valor_solicitado) ||
    toNumber(p?.valor_total) ||
    0);

}

const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

function normalizeStatus(value) {
  return String(value || '').trim().toUpperCase();
}

const TIPO_COLORS = {
  'NF duplicada': 'bg-red-100 text-red-700',
  'Sem rubrica': 'bg-red-100 text-red-700',
  'Sem valor': 'bg-amber-100 text-amber-700',
  'Rubrica inexistente': 'bg-red-100 text-red-700',
  'Débito não registrado': 'bg-amber-100 text-amber-700',
  'Valor divergente': 'bg-amber-100 text-amber-700',
  'Rubrica não atualizada': 'bg-orange-100 text-orange-700',
  'Centro divergente': 'bg-gray-100 text-gray-600'
};

export default function AuditoriaFinanceiraCard({ purchases = [], rubricas = [], onEditPurchase }) {
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(new Set()); // chaves descartadas

  const rubricaById = useMemo(() => {
    const m = {};
    (rubricas || []).forEach((r) => {if (r?.id) m[r.id] = r;});
    return m;
  }, [rubricas]);

  const alertas = useMemo(() => {
    const aprovadas = (purchases || []).filter(
      (p) => STATUS_APROVADOS.has(normalizeStatus(p.status))
    );

    const lista = [];

    const chavesVistas = new Map();
    for (const p of aprovadas) {
      const chave = getChaveFiscal(p);
      if (chave) {
        if (chavesVistas.has(chave)) {
          lista.push({
            tipo: 'NF duplicada',
            descricao: `Nota fiscal duplicada: "${p.descricao_item || p.nf_numero || p.id?.slice(0, 8)}"`,
            id: p.id,
            purchase: p,
            alertKey: `nf-dup-${p.id}`
          });
        } else {
          chavesVistas.set(chave, p.id);
        }
      }
    }

    for (const p of aprovadas) {
      const desc = p.descricao_item || p.objeto || p.id?.slice(0, 8) || '—';

      if (!p.rubrica_id) {
        lista.push({ tipo: 'Sem rubrica', descricao: `Aprovada sem rubrica: "${desc}"`, id: p.id, purchase: p, alertKey: `sem-rubrica-${p.id}` });
        continue;
      }

      if (getPurchaseValue(p) === 0) {
        lista.push({ tipo: 'Sem valor', descricao: `Aprovada sem valor: "${desc}"`, id: p.id, purchase: p, alertKey: `sem-valor-${p.id}` });
      }

      const rubrica = rubricaById[p.rubrica_id];
      if (!rubrica) {
        lista.push({ tipo: 'Rubrica inexistente', descricao: `Rubrica não encontrada para: "${desc}"`, id: p.id, purchase: p, alertKey: `rubrica-inv-${p.id}` });
        continue;
      }

      const isEquipe = !!(
      p.team_payment_id ||
      String(p.tipo_origem || p.origem || p.categoria || p.tipo_solicitacao || '').
      toLowerCase().match(/equipe|team|contrato|prestacao|prestação/));

      const temChaveFiscal = !!getChaveFiscal(p);
      if (!p.rubrica_debitada_em && temChaveFiscal && !isEquipe) {
        lista.push({ tipo: 'Débito não registrado', descricao: `Aprovada sem débito registrado: "${desc}"`, id: p.id, purchase: p, alertKey: `debito-${p.id}` });
      }

      const valorSolicitado = getPurchaseValue(p);
      const valorDebitado = toNumber(p.rubrica_debitada_valor);
      if (p.rubrica_debitada_em && valorDebitado > 0 && Math.abs(valorSolicitado - valorDebitado) > 0.01) {
        lista.push({ tipo: 'Valor divergente', descricao: `Valor aprovado ≠ debitado em "${desc}"`, id: p.id, purchase: p, alertKey: `valor-div-${p.id}` });
      }

      if (toNumber(rubrica.valor_utilizado) === 0 && valorSolicitado > 0) {
        lista.push({ tipo: 'Rubrica não atualizada', descricao: `Rubrica "${rubrica.rubrica || rubrica.nome}" com utilizado=0 apesar de aprovações`, id: p.id, purchase: p, alertKey: `rubrica-0-${p.id}` });
      }

      const centroPurchase = String(p.centro_custo || '').trim().toUpperCase();
      const centroRubrica = String(rubrica.museu || rubrica.centro_custo || '').trim().toUpperCase();
      if (centroPurchase && centroRubrica && centroPurchase !== centroRubrica &&
      !centroPurchase.includes('GERAL') && !centroRubrica.includes('GERAL') &&
      !centroPurchase.includes('RATEADO')) {
        lista.push({ tipo: 'Centro divergente', descricao: `Centro "${p.centro_custo}" ≠ rubrica "${rubrica.museu || rubrica.centro_custo}" em "${desc}"`, id: p.id, purchase: p, alertKey: `centro-${p.id}` });
      }
    }

    return lista;
  }, [purchases, rubricaById]);

  const alertasVisiveis = alertas.filter((a) => !dismissed.has(a.alertKey));
  const total = alertasVisiveis.length;
  const exibidos = expanded ? alertasVisiveis : alertasVisiveis.slice(0, 3);
  const temMais = alertasVisiveis.length > 3;

  function dismiss(alertKey) {
    setDismissed((prev) => new Set([...prev, alertKey]));
  }

  let borderColor = 'border-green-200 bg-green-50';
  let headerColor = 'text-green-700';
  let iconColor = 'text-green-500';
  let Icon = CheckCircle2;

  if (total > 5) {
    borderColor = 'border-red-200 bg-red-50';
    headerColor = 'text-red-700';
    iconColor = 'text-red-500';
    Icon = ShieldAlert;
  } else if (total > 0) {
    borderColor = 'border-amber-200 bg-amber-50';
    headerColor = 'text-amber-700';
    iconColor = 'text-amber-500';
    Icon = AlertTriangle;
  }

  return null;











































































}