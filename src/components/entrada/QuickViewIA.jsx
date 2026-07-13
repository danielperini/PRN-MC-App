import React, { useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronUp, Zap, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

function Row({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-gray-400 w-28 flex-shrink-0">{label}</span>
      <span className="text-gray-800 font-medium break-all">{value}</span>
    </div>
  );
}

function formatCNPJ(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return v;
}

export default function QuickViewIA({ intake, onValidated, onReview }) {
  const [open, setOpen] = useState(false);
  const [validating, setValidating] = useState(false);

  const status = String(intake.status_processamento || '').toUpperCase();
  if (status !== 'AGUARDANDO_REVISAO') return null;

  const ia = intake.resultado_ia || {};
  const hasData = ia.nf_numero || ia.nf_valor_total || ia.nf_emitente_nome || ia.nf_emitente_cpf_cnpj || ia.descricao_servico;
  if (!hasData) return null;

  const valor = ia.nf_valor_total
    ? `R$ ${Number(ia.nf_valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
    : null;

  async function handleValidate() {
    setValidating(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        revisado_pelo_usuario: true,
        status_processamento: 'AGUARDANDO_REVISAO',
        fornecedor_nome: ia.nf_emitente_nome || ia.fornecedor_nome || intake.fornecedor_nome || '',
        nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || intake.nf_emitente_cpf_cnpj || '',
        nf_numero: ia.nf_numero || intake.nf_numero || '',
        nf_valor_total: ia.nf_valor_total || intake.nf_valor_total || 0,
      });
      toast.success('Dados validados. Clique em "Revisar" para completar e enviar para aprovação.');
      if (onValidated) onValidated(intake.id);
    } catch (e) {
      toast.error('Erro ao validar: ' + (e?.message || e));
    } finally {
      setValidating(false);
    }
  }

  return (
    <div className="mt-3 rounded-xl border border-orange-100 bg-orange-50/60 overflow-hidden">
      {/* Header clicável */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-orange-800 hover:bg-orange-100/50 transition-colors"
      >
        <span className="flex items-center gap-1.5">
          <Zap className="w-3.5 h-3.5 text-orange-500" />
          Dados extraídos pela IA
          {intake.revisado_pelo_usuario && (
            <span className="ml-1 text-green-700 bg-green-100 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
              ✓ Validado
            </span>
          )}
        </span>
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          <Row label="Fornecedor" value={ia.nf_emitente_nome || ia.fornecedor_nome} />
          <Row label="CNPJ/CPF" value={formatCNPJ(ia.nf_emitente_cpf_cnpj || ia.fornecedor_cpf_cnpj)} />
          <Row label="Nº NF" value={ia.nf_numero} />
          <Row label="Data emissão" value={ia.nf_data_emissao} />
          <Row label="Valor total" value={valor} />
          <Row label="Município" value={ia.municipio || ia.municipio_emitente} />
          <Row label="Competência" value={ia.competencia} />
          <Row label="Centro de custo" value={ia.centro_custo_sugerido || intake.centro_custo} />
          <Row label="Rubrica sugerida" value={ia.rubrica_nome_sugerida || intake.rubrica_nome_sugerida} />
          {ia.descricao_servico && (
            <div className="flex items-start gap-2 text-xs">
              <span className="text-gray-400 w-28 flex-shrink-0">Descrição</span>
              <span className="text-gray-700 italic line-clamp-2">{ia.descricao_servico}</span>
            </div>
          )}
          {(intake.erros_validacao || []).length > 0 && (
            <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-2 py-1.5 space-y-0.5">
              {(intake.erros_validacao || []).map((e, i) => (
                <p key={i} className="text-[11px] text-red-700">⚠ {e}</p>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            {!intake.revisado_pelo_usuario ? (
              <Button
                size="sm"
                onClick={handleValidate}
                disabled={validating}
                className="h-7 text-xs px-3 bg-green-600 hover:bg-green-700 text-white gap-1"
              >
                {validating
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <CheckCircle2 className="w-3 h-3" />}
                Confirmar dados da IA
              </Button>
            ) : (
              <span className="inline-flex items-center gap-1 text-xs text-green-700 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" /> Dados confirmados
              </span>
            )}
            <button
              onClick={() => onReview && onReview(intake)}
              className="text-xs text-orange-700 underline hover:text-orange-900"
            >
              Editar / revisar completo →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}