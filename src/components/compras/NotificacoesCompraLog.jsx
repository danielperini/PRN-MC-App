import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { CheckCircle2, XCircle, AlertTriangle, Bell, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function fmtDateTime(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_CONFIG = {
  sucesso: { label: 'Enviado', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
  falha_parcial: { label: 'Parcial', icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
  falha: { label: 'Falha', icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-200' }
};

function LogRow({ log }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = STATUS_CONFIG[log.status] || STATUS_CONFIG.falha;
  const Icon = cfg.icon;

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} p-3`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Icon className={`h-4 w-4 flex-shrink-0 ${cfg.color}`} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">
              {log.purchase_descricao || log.purchase_id}
            </p>
            <p className="text-xs text-gray-500">
              {log.fornecedor || '—'} · {fmtBRL(log.valor)} · {fmtDateTime(log.disparado_em)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className={`text-xs font-semibold ${cfg.color}`}>{cfg.label}</span>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded p-1 text-gray-400 hover:bg-white hover:text-gray-700">
            
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded &&
      <div className="mt-3 space-y-1.5 border-t border-gray-200 pt-3">
          <p className="text-xs text-gray-500">
            <span className="font-medium text-gray-700">Disparado por:</span> {log.enviado_por || '—'}
          </p>
          <p className="text-xs text-gray-500">
            <span className="font-medium text-gray-700">Destinatários:</span>{' '}
            {(log.recipients || []).join(', ') || '—'}
          </p>
          {log.erro &&
        <p className="text-xs text-red-600">
              <span className="font-medium">Erro:</span> {log.erro}
            </p>
        }
          {(log.detalhes || []).length > 0 &&
        <div className="mt-1 space-y-1">
              {log.detalhes.map((d, i) =>
          <div key={i} className="flex items-center gap-2 text-xs">
                  {d.status === 'sucesso' ?
            <CheckCircle2 className="h-3 w-3 text-emerald-500" /> :
            <XCircle className="h-3 w-3 text-red-500" />}
                  <span className="text-gray-700">{d.email}</span>
                  {d.erro && <span className="text-red-500">— {d.erro}</span>}
                </div>
          )}
            </div>
        }
        </div>
      }
    </div>);

}

export default function NotificacoesCompraLog() {
  const { data: logs = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['notificacoes-compra-log'],
    queryFn: () => base44.entities.NotificacaoCompraLog.list('-disparado_em', 50),
    staleTime: 1000 * 30,
    refetchOnWindowFocus: false
  });

  const sucessos = logs.filter((l) => l.status === 'sucesso').length;
  const falhas = logs.filter((l) => l.status === 'falha').length;
  const parciais = logs.filter((l) => l.status === 'falha_parcial').length;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 hidden">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-indigo-600" />
          <h3 className="text-base font-semibold text-gray-900">Log de Notificações de Compras</h3>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5 text-xs">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Atualizar
        </Button>
      </div>

      {/* Resumo */}
      <div className="mb-4 flex gap-3">
        <div className="flex-1 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-center">
          <p className="text-lg font-bold text-emerald-700">{sucessos}</p>
          <p className="text-xs text-emerald-600">Enviados</p>
        </div>
        <div className="flex-1 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-center">
          <p className="text-lg font-bold text-amber-700">{parciais}</p>
          <p className="text-xs text-amber-600">Parciais</p>
        </div>
        <div className="flex-1 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-center">
          <p className="text-lg font-bold text-red-700">{falhas}</p>
          <p className="text-xs text-red-600">Falhas</p>
        </div>
      </div>

      {isLoading ?
      <div className="py-8 text-center text-sm text-gray-400">Carregando logs...</div> :
      logs.length === 0 ?
      <div className="py-8 text-center text-sm text-gray-400">Nenhuma notificação disparada ainda.</div> :

      <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {logs.map((log) => <LogRow key={log.id} log={log} />)}
        </div>
      }
    </div>);

}