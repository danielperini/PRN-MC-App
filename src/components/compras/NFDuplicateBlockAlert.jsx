import React, { useState } from 'react';
import { ShieldAlert, AlertTriangle, ExternalLink, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const CONFIDENCE_LABELS = {
  CERTEZA: { label: 'Duplicidade confirmada (chave XML idêntica)', color: 'red' },
  PROVAVEL: { label: 'Duplicidade provável (CNPJ + número NF)', color: 'red' },
  POSSIVEL: { label: 'Possível duplicidade (CNPJ + valor + data)', color: 'amber' },
};

const STATUS_LABELS = {
  APROVADO_COORD: 'Aprovada (coord.)',
  APROVADO_ADMIN: 'Aprovada (admin)',
  PAGO: 'Paga',
  SOLICITADO: 'Solicitada (pendente)',
  RASCUNHO: 'Rascunho',
};

/**
 * NFDuplicateBlockAlert
 *
 * Props:
 *   result         — objeto retornado por validateNFDuplicate
 *   isCoord        — se o usuário é coordenador (pode ignorar alertas não bloqueantes)
 *   onConfirmBypass — callback quando coordenador confirma que não é duplicata
 *   bypassConfirmed — boolean controlado pelo pai
 */
export default function NFDuplicateBlockAlert({ result, isCoord, onConfirmBypass, bypassConfirmed, onDeleteDuplicate, deletingDuplicate }) {
  const [expanded, setExpanded] = useState(false);

  if (!result?.isDuplicate) return null;

  const conf = CONFIDENCE_LABELS[result.confidence] || CONFIDENCE_LABELS.POSSIVEL;
  const isRed = conf.color === 'red';
  const isBlocking = result.isBlocking && !bypassConfirmed;

  return (
    <div className={`rounded-xl border p-4 space-y-3 ${
      isRed
        ? 'border-red-200 bg-red-50'
        : 'border-amber-200 bg-amber-50'
    }`}>
      <div className="flex items-start gap-3">
        {isRed
          ? <ShieldAlert className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
          : <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        }
        <div className="flex-1 min-w-0">
          <p className={`text-sm font-semibold ${isRed ? 'text-red-800' : 'text-amber-800'}`}>
            {conf.label}
          </p>
          <p className={`text-xs mt-1 ${isRed ? 'text-red-700' : 'text-amber-700'}`}>
            Possível nota fiscal duplicada. Já existe lançamento para este fornecedor, número, valor ou XML.
          </p>
          {result.motivo && (
            <p className={`text-xs mt-1 font-mono ${isRed ? 'text-red-600' : 'text-amber-600'}`}>
              Critério: {result.motivo}
            </p>
          )}
        </div>
      </div>

      {/* Lista de matches */}
      {result.matches?.length > 0 && (
        <div className="space-y-1.5">
          {(expanded ? result.matches : result.matches.slice(0, 2)).map((m, i) => (
            <div
              key={i}
              className={`rounded-lg px-3 py-2 text-xs flex items-start justify-between gap-2 ${
                m.is_approved ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
              }`}
            >
              <div className="min-w-0">
                <span className="font-semibold">{m.confidence}</span>
                {' · '}
                {STATUS_LABELS[m.status] || m.status}
                {m.fornecedor_nome && ` · ${m.fornecedor_nome}`}
                {m.nf_numero && ` · NF ${m.nf_numero}`}
                {m.nf_valor_total && ` · R$ ${Number(m.nf_valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                {m.numero_processamento && (
                  <span className="block text-[10px] opacity-70">Proc. {m.numero_processamento}</span>
                )}
              </div>
              {m.source === 'PurchaseRequest' && m.id && (
                <a
                  href={`#`}
                  onClick={(e) => { e.preventDefault(); }}
                  title={`ID: ${m.id}`}
                  className="shrink-0 opacity-60 hover:opacity-100"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          ))}

          {result.matches.length > 2 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className={`text-xs flex items-center gap-1 ${isRed ? 'text-red-600' : 'text-amber-700'} hover:underline`}
            >
              {expanded
                ? <><ChevronUp className="h-3 w-3" />Mostrar menos</>
                : <><ChevronDown className="h-3 w-3" />{result.matches.length - 2} ocorrência(s) adicionais</>
              }
            </button>
          )}
        </div>
      )}

      {/* Botão de bypass — apenas coordenadores, apenas em alertas não-certeza */}
      {isCoord && !bypassConfirmed && !isBlocking && (
        <div className="border-t border-amber-200 pt-3">
          <button
            type="button"
            onClick={onConfirmBypass}
            className="text-xs text-amber-700 underline hover:text-amber-900"
          >
            Confirmar que não é duplicata e continuar
          </button>
        </div>
      )}

      {isCoord && !bypassConfirmed && isBlocking && (
        <div className="border-t border-red-200 pt-3 space-y-2">
          <p className="text-xs text-red-700 font-medium">
            ⛔ Aprovação bloqueada. Esta nota fiscal aparenta já ter sido aprovada anteriormente.
            Acesse a auditoria de compras para revisar antes de prosseguir.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-red-300 text-red-700 hover:bg-red-50 text-xs"
              onClick={onConfirmBypass}
            >
              Confirmar revisão e aprovar mesmo assim (responsabilidade do coordenador)
            </Button>
            {onDeleteDuplicate && result.matches?.some(m => m.source === 'PurchaseRequest' && m.id) && (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="gap-1.5 text-xs"
                onClick={() => onDeleteDuplicate(result.matches.filter(m => m.source === 'PurchaseRequest' && m.id))}
                disabled={deletingDuplicate}
              >
                <Trash2 className="h-3.5 w-3.5" />
                {deletingDuplicate ? 'Removendo...' : 'Deletar solicitação duplicada'}
              </Button>
            )}
          </div>
        </div>
      )}

      {bypassConfirmed && (
        <div className="flex items-center gap-2 border-t border-gray-200 pt-3 text-xs text-gray-500">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
          Alerta de duplicidade revisado e confirmado pelo coordenador.
        </div>
      )}
    </div>
  );
}