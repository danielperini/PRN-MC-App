import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, XCircle, Loader2, Download, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

function StatusBadge({ type }) {
  if (type === 'ok') return <span className="inline-flex items-center gap-1 text-green-700 text-xs"><CheckCircle2 className="w-3.5 h-3.5" /> OK</span>;
  if (type === 'alerta') return <span className="inline-flex items-center gap-1 text-amber-700 text-xs"><AlertTriangle className="w-3.5 h-3.5" /> Alerta</span>;
  return <span className="inline-flex items-center gap-1 text-red-700 text-xs"><XCircle className="w-3.5 h-3.5" /> Erro</span>;
}

function ItemList({ items, type }) {
  if (!items || items.length === 0) return null;
  const colors = {
    ok: 'bg-green-50 border-green-200 text-green-800',
    alerta: 'bg-amber-50 border-amber-200 text-amber-800',
    erro: 'bg-red-50 border-red-200 text-red-800',
  };
  return (
    <ul className={`rounded-lg border p-3 space-y-1.5 ${colors[type]}`}>
      {items.map((item, i) => (
        <li key={i} className="text-sm flex items-start gap-2">
          <StatusBadge type={type} />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function IntegridadePanel() {
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);

  async function verificar() {
    setLoading(true);
    setResultado(null);
    try {
      const res = await base44.functions.invoke('verificarIntegridadeSistema', {});
      setResultado(res.data);
    } catch (e) {
      toast.error('Erro ao verificar: ' + (e.message || 'Tente novamente.'));
    }
    setLoading(false);
  }

  function exportar() {
    if (!resultado) return;
    const texto = JSON.stringify(resultado, null, 2);
    const blob = new Blob([texto], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `integridade_sistema_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const resumo = resultado?.resumo;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-600">
            Verifica banco de dados, usuários, relatórios, compras, rubricas, arquivos, duplicatas e logs.
          </p>
        </div>
        <Button onClick={verificar} disabled={loading} className="gap-2 shrink-0">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
          {loading ? 'Verificando...' : 'Iniciar Verificação'}
        </Button>
      </div>

      {resultado && (
        <div className="space-y-4">
          {/* Resumo */}
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border bg-green-50 border-green-200 p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{resumo.total_ok}</p>
              <p className="text-xs text-green-600 mt-1">Itens OK</p>
            </div>
            <div className="rounded-xl border bg-amber-50 border-amber-200 p-3 text-center">
              <p className="text-2xl font-bold text-amber-700">{resumo.total_alerta}</p>
              <p className="text-xs text-amber-600 mt-1">Alertas</p>
            </div>
            <div className="rounded-xl border bg-red-50 border-red-200 p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{resumo.total_erro}</p>
              <p className="text-xs text-red-600 mt-1">Erros</p>
            </div>
          </div>

          {/* Status geral */}
          <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${
            resumo.total_erro > 0
              ? 'bg-red-50 border-red-200 text-red-700'
              : resumo.total_alerta > 0
              ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-green-50 border-green-200 text-green-700'
          }`}>
            {resumo.status_geral}
          </div>

          {/* Listas */}
          <div className="space-y-3">
            <ItemList items={resultado.itens_erro} type="erro" />
            <ItemList items={resultado.itens_alerta} type="alerta" />
            <ItemList items={resultado.itens_ok} type="ok" />
          </div>

          {/* Sugestões */}
          {resultado.sugestoes?.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide mb-2">Sugestões de correção</p>
              <ul className="space-y-1">
                {resultado.sugestoes.map((s, i) => (
                  <li key={i} className="text-sm text-slate-700 flex items-start gap-2">
                    <span className="text-slate-400">→</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Meta info */}
          <div className="text-xs text-gray-400 flex items-center justify-between">
            <span>Verificado por: {resultado.verificado_por} em {new Date(resultado.data_verificacao).toLocaleString('pt-BR')}</span>
            <span className="font-medium">Versão {resultado.versao}</span>
          </div>

          {/* Exportar */}
          <Button variant="outline" onClick={exportar} className="gap-2 w-full">
            <Download className="w-4 h-4" />
            Exportar Relatório de Verificação (JSON)
          </Button>
        </div>
      )}
    </div>
  );
}