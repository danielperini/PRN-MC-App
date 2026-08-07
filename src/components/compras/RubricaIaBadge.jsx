import React from 'react';
import { ShieldCheck, AlertTriangle, AlertCircle } from 'lucide-react';

/**
 * Badge compacto indicando o status da validação IA da rubrica vinculada.
 *
 * Estados:
 *  - validada (verde):   IA concordou com a rubrica atual.
 *  - corrigida (âmbar):  IA corrigiu automaticamente a rubrica (rubrica_ia_corrigida_de preenchido).
 *  - divergente (vermelho): IA sugeriu rubrica divergente com score < 70 — revisão manual.
 *
 * Sem badge quando a solicitação ainda não foi processada pela IA
 * (status não aprovado ou sem rubrica_ia_validada definida).
 */
function estadoIa(purchase) {
  if (!purchase) return null;
  const statusUpper = String(purchase.status || '').toUpperCase();
  const aprovado = ['APROVADO_COORD', 'APROVADO_ADMIN', 'APROVADO', 'PAGO'].includes(statusUpper);
  if (!aprovado) return null;

  if (purchase.rubrica_ia_divergente === true) {
    return {
      kind: 'divergente',
      icon: AlertCircle,
      label: 'Rubrica divergente',
      bg: 'bg-red-50',
      color: 'text-red-700',
      border: 'border-red-200',
      tip:
        `🔴 Rubrica divergente — revisão necessária.\n` +
        `Score IA: ${purchase.rubrica_ia_score ?? '—'}\n` +
        (purchase.rubrica_ia_justificativa ? `Justificativa: ${purchase.rubrica_ia_justificativa}` : 'A IA sugeriu uma rubrica diferente, mas com confiança abaixo do limiar para correção automática.'),
    };
  }

  if (purchase.rubrica_ia_corrigida_de) {
    return {
      kind: 'corrigida',
      icon: AlertTriangle,
      label: 'Rubrica corrigida pela IA',
      bg: 'bg-amber-50',
      color: 'text-amber-700',
      border: 'border-amber-200',
      tip:
        `⚠️ Rubrica corrigida pela IA.\n` +
        `Score IA: ${purchase.rubrica_ia_score ?? '—'}\n` +
        (purchase.rubrica_ia_justificativa ? `Justificativa: ${purchase.rubrica_ia_justificativa}` : 'A rubrica foi corrigida automaticamente com base na análise da IA.'),
    };
  }

  if (purchase.rubrica_ia_validada === true) {
    return {
      kind: 'validada',
      icon: ShieldCheck,
      label: 'Rubrica validada pela IA',
      bg: 'bg-green-50',
      color: 'text-green-700',
      border: 'border-green-200',
      tip:
        `✅ Rubrica validada pela IA.\n` +
        `Score IA: ${purchase.rubrica_ia_score ?? '—'}\n` +
        (purchase.rubrica_ia_justificativa ? `Justificativa: ${purchase.rubrica_ia_justificativa}` : 'A IA confirmou que a rubrica vinculada é adequada à descrição e fornecedor.'),
    };
  }

  return null;
}

export default function RubricaIaBadge({ purchase, rubricaById, compact = true }) {
  const estado = estadoIa(purchase);
  if (!estado) return null;

  const Icon = estado.icon;
  const sizeCls = compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2 py-0.5';

  let nomeCorrigidoDe = '';
  if (estado.kind === 'corrigida' && rubricaById && purchase.rubrica_ia_corrigida_de) {
    const antiga = rubricaById[purchase.rubrica_ia_corrigida_de];
    if (antiga) {
      nomeCorrigidoDe = `${antiga.grupo ? antiga.grupo + ' › ' : ''}${antiga.rubrica || antiga.nome || ''}`;
    }
  }

  const tooltipText = nomeCorrigidoDe
    ? `${estado.tip}\nRubrica anterior: ${nomeCorrigidoDe}`
    : estado.tip;

  return (
    <span
      title={tooltipText}
      className={`inline-flex items-center gap-1 rounded-full border ${estado.bg} ${estado.color} ${estado.border} ${sizeCls} font-medium leading-tight`}
    >
      <Icon className={compact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
      {estado.label}
    </span>
  );
}