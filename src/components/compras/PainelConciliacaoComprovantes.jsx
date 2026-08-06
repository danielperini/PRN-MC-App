import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Receipt,
  Loader2,
  ScanLine,
  Check,
  X,
  AlertTriangle,
} from 'lucide-react';

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(v) || 0);
}

function fmtCnpj(cnpj) {
  const c = String(cnpj || '').replace(/\D/g, '');
  if (c.length === 14) return c.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  if (c.length === 11) return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  return c;
}

function ScoreBadge({ score }) {
  const color =
    score >= 75
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : score >= 50
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-red-50 text-red-700 border-red-200';
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${color}`}>{score}%</span>;
}

function ColumnHeader({ icon, label, count, color }) {
  const colorMap = {
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
  };
  return (
    <div className={`rounded-2xl border p-3 flex items-center justify-between gap-2 ${colorMap[color]}`}>
      <div className="flex items-center gap-2 min-w-0">
        {icon}
        <span className="text-sm font-semibold truncate">{label}</span>
      </div>
      <span className="text-xl font-bold">{count}</span>
    </div>
  );
}

function VinculadoCard({ v }) {
  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-black truncate" title={v.file_name}>{v.file_name}</p>
          <p className="text-xs text-gray-600 truncate">{v.fornecedor || 'Fornecedor não identificado'}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            Pago <span className="font-semibold text-emerald-700">{fmtBRL(v.valor_pago)}</span> · Sq. <span className="font-semibold">{fmtBRL(v.valor_solicitado)}</span>
          </p>
        </div>
        <ScoreBadge score={v.score} />
      </div>
    </div>
  );
}

function SemMatchCard({ s }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
      <p className="text-sm font-semibold text-gray-700 truncate" title={s.file_name}>{s.file_name || '—'}</p>
      <p className="text-xs text-gray-500 mt-0.5">{s.motivo || 'Sem correspondência encontrada.'}</p>
      {s.dados?.favorecido_nome && (
        <p className="text-xs text-gray-400 mt-1 truncate">{s.dados.favorecido_nome} · R$ {fmtBRL(s.dados.valor_pago)}</p>
      )}
    </div>
  );
}

export default function PainelConciliacaoComprovantes({ currentUser, isCoordenador }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resultado, setResultado] = useState(null);
  const [processing, setProcessing] = useState(new Set());

  const podeVer = isCoordenador || currentUser?.role === 'admin';

  async function handleVarredura() {
    setLoading(true);
    setProgress(10);
    setResultado(null);
    try {
      setProgress(35);
      const r = await base44.functions.invoke('vincularComprovantesEmLote', { limite: 25, dry_run: false });
      setProgress(95);
      const data = r?.data || r;
      if (data?.ok === false) {
        toast.error(data.error || 'Erro na varredura');
        return;
      }
      setResultado(data);
      setProgress(100);
      toast.success(
        `Varredura concluída: ${data.vinculados || 0} vinculados, ${data.incertos || 0} aguardando, ${data.sem_match || 0} sem correspondência.`
      );
    } catch (e) {
      console.error('Varredura comprovantes falhou:', e);
      toast.error('Erro: ' + (e?.message || e));
    } finally {
      setLoading(false);
      setTimeout(() => setProgress(0), 1200);
    }
  }

  async function handleConfirmar(incerto, candidato) {
    const key = incerto.intake_id;
    setProcessing((s) => new Set(s).add(key));
    try {
      const now = new Date().toISOString();
      await base44.entities.PurchaseRequest.update(candidato.purchase_id, {
        status: 'PAGO',
        pago: true,
        status_pagamento: 'pago',
        comprovante_url: incerto.comprovante_url,
        comprovante_pagamento_url: incerto.comprovante_url,
        data_pagamento: now,
        data_pagamento_efetivo: incerto.dados?.data_pagamento || now.slice(0, 10),
        usuario_pagamento: currentUser?.email,
        usuario_pagamento_nome: currentUser?.full_name || currentUser?.email,
        confianca_vinculo_pagamento: candidato.score,
        vinculo_automatico_ia: false,
      });
      try {
        await base44.entities.DocumentIntake.update(incerto.intake_id, {
          status_processamento: 'APROVADO',
          ocultar_entrada_unica: true,
          entidade_destino: 'PurchaseRequest',
          entidade_destino_id: candidato.purchase_id,
        });
      } catch (_e) { /* não bloqueia */ }
      toast.success(`Comprovante vinculado a ${candidato.fornecedor} (${candidato.score}%).`);
      setResultado((prev) =>
        prev
          ? {
              ...prev,
              vinculados: prev.vinculados + 1,
              incertos: prev.incertos - 1,
              vinculados_lista: [
                ...(prev.vinculados_lista || []),
                {
                  intake_id: incerto.intake_id,
                  file_name: incerto.file_name,
                  purchase_id: candidato.purchase_id,
                  fornecedor: candidato.fornecedor,
                  valor_pago: incerto.dados?.valor_pago,
                  valor_solicitado: candidato.valor_solicitado,
                  score: candidato.score,
                  detalhes: ['confirmação manual'],
                  motivo_ia: 'manual',
                },
              ],
              incertos_lista: (prev.incertos_lista || []).filter((i) => i.intake_id !== incerto.intake_id),
            }
          : prev
      );
    } catch (e) {
      toast.error('Erro ao confirmar: ' + (e?.message || e));
    } finally {
      setProcessing((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }

  async function handleRejeitar(incerto) {
    const key = incerto.intake_id;
    setProcessing((s) => new Set(s).add(key));
    try {
      await base44.entities.DocumentIntake.update(incerto.intake_id, {
        erros_validacao: [
          ...(Array.isArray(incerto.dados?.alertas) ? incerto.dados.alertas : []),
          'Conciliação rejeitada — sem correspondência confirmada.',
        ],
      });
      toast.success('Comprovante marcado como sem correspondência.');
      setResultado((prev) =>
        prev
          ? {
              ...prev,
              incertos: prev.incertos - 1,
              sem_match: prev.sem_match + 1,
              incertos_lista: (prev.incertos_lista || []).filter((i) => i.intake_id !== incerto.intake_id),
              sem_match_lista: [
                ...(prev.sem_match_lista || []),
                {
                  intake_id: incerto.intake_id,
                  file_name: incerto.file_name,
                  motivo: 'Rejeitado manualmente.',
                },
              ],
            }
          : prev
      );
    } catch (e) {
      toast.error('Erro ao rejeitar: ' + (e?.message || e));
    } finally {
      setProcessing((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }

  if (!podeVer) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      <div className="p-5 md:p-6 border-b border-gray-100 bg-gradient-to-br from-white via-white to-gray-50">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-semibold text-gray-600 shadow-sm">
              <Receipt className="w-3.5 h-3.5 text-black" /> Conciliação de Comprovantes
            </div>
            <h3 className="text-lg font-semibold text-black tracking-tight">Varrer comprovantes de pagamento</h3>
            <p className="text-sm text-gray-500 max-w-xl">
              Lê PDFs (Entrada Única) com IA, extrai CNPJ + valor + descrição e vincula automaticamente a solicitações com
              mesmo CNPJ e valor (±1%). Casos ambíguos ficam para confirmação manual.
            </p>
          </div>
          <Button onClick={handleVarredura} disabled={loading} className="bg-black text-white hover:bg-gray-800 gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />}
            {loading ? 'Varrendo...' : 'Varrer Comprovantes'}
          </Button>
        </div>
        {loading && (
          <div className="mt-4 space-y-1.5">
            <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
              <div className="bg-black h-1.5 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-500">Lendo comprovantes e cruzando com solicitações aprovadas...</p>
          </div>
        )}
      </div>

      {!loading && !resultado && (
        <div className="px-5 md:px-6 py-10 text-center">
          <Receipt className="mx-auto h-10 w-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-500 max-w-md mx-auto">
            Acione a varredura para processar até 25 comprovantes por chamada. Resultados aparecem abaixo em três colunas.
          </p>
        </div>
      )}

      {resultado && (
        <div className="p-4 md:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <ColumnHeader icon={<Check className="w-4 h-4" />} label="Vinculados automaticamente" count={resultado.vinculados} color="emerald" />
            <ColumnHeader icon={<AlertTriangle className="w-4 h-4" />} label="Aguardando confirmação" count={resultado.incertos} color="amber" />
            <ColumnHeader icon={<X className="w-4 h-4" />} label="Sem correspondência" count={resultado.sem_match} color="red" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-emerald-100 bg-white/60 min-h-[120px] p-3 space-y-2 max-h-[600px] overflow-y-auto">
              {(resultado.vinculados_lista || []).map((v) => (
                <VinculadoCard key={v.intake_id} v={v} />
              ))}
              {(resultado.vinculados_lista || []).length === 0 && (
                <p className="text-xs text-gray-400 text-center pt-6">Nenhum vínculo automático nesta rodada.</p>
              )}
            </div>

            <div className="rounded-2xl border border-amber-100 bg-white/60 min-h-[120px] p-3 space-y-2 max-h-[600px] overflow-y-auto">
              {(resultado.incertos_lista || []).map((inc) => {
                const proc = processing.has(inc.intake_id);
                return (
                  <div key={inc.intake_id} className="rounded-2xl border border-amber-200 bg-amber-50/40 p-3 space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-black truncate" title={inc.file_name}>{inc.file_name}</p>
                        <p className="text-xs text-gray-600">{inc.dados?.favorecido_nome || 'Favorecido não identificado'}</p>
                        <p className="text-xs text-gray-600">
                          {fmtCnpj(inc.dados?.favorecido_cnpj_cpf) || '—'} · R$ {fmtBRL(inc.dados?.valor_pago)}
                        </p>
                      </div>
                      <span className="text-[10px] uppercase tracking-wide font-semibold text-amber-700 whitespace-nowrap">incerto</span>
                    </div>
                    <div className="space-y-2">
                      {(inc.candidatos || []).map((c) => (
                        <div key={c.purchase_id} className="rounded-xl border border-gray-200 bg-white p-3">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-black truncate">{c.fornecedor || '—'}</p>
                              <p className="text-xs text-gray-500 truncate" title={c.descricao_item}>{c.descricao_item || ''}</p>
                            </div>
                            <ScoreBadge score={c.score} />
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 text-xs text-gray-600 mb-2">
                            <span>R$ {fmtBRL(c.valor_solicitado)}</span>
                            <span className="text-right">{c.status}</span>
                          </div>
                          <Button
                            size="sm"
                            disabled={proc}
                            onClick={() => handleConfirmar(inc, c)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5"
                          >
                            {proc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                            Confirmar vínculo
                          </Button>
                        </div>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={proc}
                      onClick={() => handleRejeitar(inc)}
                      className="w-full border-red-200 text-red-700 hover:bg-red-50 gap-1.5"
                    >
                      {proc ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                      Rejeitar todos
                    </Button>
                  </div>
                );
              })}
              {(resultado.incertos_lista || []).length === 0 && (
                <p className="text-xs text-gray-400 text-center pt-6">Nenhum caso ambíguo para confirmar.</p>
              )}
            </div>

            <div className="rounded-2xl border border-red-100 bg-white/60 min-h-[120px] p-3 space-y-2 max-h-[600px] overflow-y-auto">
              {(resultado.sem_match_lista || []).map((s) => (
                <SemMatchCard key={s.intake_id} s={s} />
              ))}
              {(resultado.sem_match_lista || []).length === 0 && (
                <p className="text-xs text-gray-400 text-center pt-6">Nenhum comprovante sem correspondência.</p>
              )}
            </div>
          </div>

          {resultado.vinculados === 0 && resultado.incertos === 0 && resultado.sem_match === 0 && (
            <p className="text-center text-sm text-gray-500 py-8">
              Nenhum comprovante elegível encontrado na varredura.
            </p>
          )}
        </div>
      )}
    </div>
  );
}