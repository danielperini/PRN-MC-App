import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  FileText, CheckCircle2, AlertTriangle, Loader2, ExternalLink,
  RefreshCw, ChevronDown, ChevronUp, Search, XCircle
} from 'lucide-react';

function fmtBRL(v) {
  const n = Number(v ?? 0);
  if (!n) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
}

function IntakeCard({ intake, onAprovar, onDescartar, loading }) {
  const [expanded, setExpanded] = useState(false);
  const ia = intake.resultado_ia || {};
  const temPDF = !!(intake.nf_pdf_url || ia.pdf_drive_url);
  const temValor = !!intake.nf_valor_total;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className="text-sm font-semibold text-black truncate">{intake.nf_emitente_nome || intake.fornecedor_nome || 'Sem fornecedor'}</span>
            {intake.nf_numero && (
              <Badge variant="outline" className="text-[10px] border-gray-200 text-gray-500">NF {intake.nf_numero}</Badge>
            )}
            {temValor ? (
              <Badge variant="outline" className="text-[10px] border-green-200 text-green-700 bg-green-50">{fmtBRL(intake.nf_valor_total)}</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-600 bg-amber-50">Valor não extraído</Badge>
            )}
            {temPDF ? (
              <Badge variant="outline" className="text-[10px] border-blue-200 text-blue-600 bg-blue-50">PDF disponível</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] border-gray-200 text-gray-400">Sem PDF</Badge>
            )}
          </div>
          <p className="text-xs text-gray-500 truncate">{intake.file_name_original}</p>
          {ia.nf_data_emissao && (
            <p className="text-[10px] text-gray-400 mt-0.5">Emissão: {ia.nf_data_emissao} · CNPJ: {intake.nf_emitente_cpf_cnpj || '—'}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={() => setExpanded(v => !v)} className="text-gray-400 hover:text-black p-1">
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-red-200 text-red-600 hover:bg-red-50 px-2.5"
            onClick={() => onDescartar(intake)}
            disabled={loading}
          >
            <XCircle className="w-3 h-3 mr-1" />Descartar
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs bg-black text-white hover:bg-gray-800 px-2.5"
            onClick={() => onAprovar(intake)}
            disabled={loading}
          >
            <CheckCircle2 className="w-3 h-3 mr-1" />Confirmar
          </Button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 space-y-2">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-gray-400">Caminho no Drive</p>
              <p className="text-gray-700 truncate">{ia.path || '—'}</p>
            </div>
            <div>
              <p className="text-gray-400">Mês de referência</p>
              <p className="text-gray-700">{ia.mes_referencia || '—'}</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {ia.drive_url && (
              <a href={ia.drive_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline border border-blue-200 rounded px-2 py-1 bg-white">
                <ExternalLink className="w-3 h-3" />XML no Drive
              </a>
            )}
            {(intake.nf_pdf_url || ia.pdf_drive_url) && (
              <a href={intake.nf_pdf_url || ia.pdf_drive_url} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline border border-blue-200 rounded px-2 py-1 bg-white">
                <ExternalLink className="w-3 h-3" />PDF no Drive
              </a>
            )}
          </div>
          {ia.nf_chave && (
            <p className="text-[10px] text-gray-400 font-mono break-all">Chave: {ia.nf_chave}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function PainelConferenciaVarredura({ onSuccess }) {
  const [intakes, setIntakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processando, setProcessando] = useState(null);
  const [busca, setBusca] = useState('');
  const [rodandoVarredura, setRodandoVarredura] = useState(false);
  const [resultadoVarredura, setResultadoVarredura] = useState(null);

  async function carregar() {
    setLoading(true);
    try {
      const list = await base44.entities.DocumentIntake.filter({
        status_processamento: 'AGUARDANDO_REVISAO'
      }, '-created_date', 200);

      // Filtrar apenas NFs da varredura ou sem vínculo ainda
      const nfs = (list || []).filter(i =>
        (i.tipo_detectado === 'NOTA_FISCAL_XML' || i.tipo_detectado === 'NOTA_FISCAL_PDF') &&
        !i.entidade_destino_id &&
        i.status_registro !== 'REMOVIDO'
      );
      setIntakes(nfs);
    } catch (e) {
      toast.error('Erro ao carregar: ' + e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  async function handleAprovar(intake) {
    setProcessando(intake.id);
    try {
      // Enviar para aprovação — muda status para ENVIADO_APROVACAO
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ENVIADO_APROVACAO',
        revisado_pelo_usuario: true
      });
      toast.success(`NF ${intake.nf_numero || ''} confirmada e enviada para aprovação.`);
      setIntakes(prev => prev.filter(i => i.id !== intake.id));
      onSuccess?.();
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setProcessando(null);
    }
  }

  async function handleDescartar(intake) {
    if (!window.confirm(`Descartar esta NF (${intake.file_name_original})?\nEla será marcada como removida e não aparecerá mais na fila.`)) return;
    setProcessando(intake.id);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'REJEITADO',
        status_registro: 'REMOVIDO'
      });
      toast.success('NF descartada.');
      setIntakes(prev => prev.filter(i => i.id !== intake.id));
    } catch (e) {
      toast.error('Erro: ' + e.message);
    } finally {
      setProcessando(null);
    }
  }

  async function handleExecutarVarredura() {
    setRodandoVarredura(true);
    setResultadoVarredura(null);
    toast.info('Executando varredura no Drive… aguarde.');
    try {
      const res = await base44.functions.invoke('auditarNFsDriveFevJul', {});
      const d = res.data;
      if (!d?.success) throw new Error(d?.error || 'Erro desconhecido');
      setResultadoVarredura(d.resumo);
      toast.success(`Varredura concluída: ${d.resumo.intakes_criados} nova(s) NF(s) importada(s), ${d.resumo.duplicatas_descartadas} duplicata(s) descartada(s).`);
      await carregar();
    } catch (e) {
      toast.error('Erro na varredura: ' + (e?.message || e));
    } finally {
      setRodandoVarredura(false);
    }
  }

  const filtradas = intakes.filter(i => {
    if (!busca.trim()) return true;
    const b = busca.toLowerCase();
    return (
      (i.nf_emitente_nome || '').toLowerCase().includes(b) ||
      (i.fornecedor_nome || '').toLowerCase().includes(b) ||
      (i.nf_numero || '').toLowerCase().includes(b) ||
      (i.file_name_original || '').toLowerCase().includes(b)
    );
  });

  const totalValor = intakes.reduce((acc, i) => acc + (Number(i.nf_valor_total) || 0), 0);

  return (
    <div className="rounded-2xl border border-amber-200 bg-white overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-amber-100 bg-amber-50">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-amber-600 flex items-center justify-center shrink-0">
              <FileText className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-amber-900">Conferência de NFs — Varredura Fev-Jul/2026</h2>
              <p className="text-xs text-amber-600">
                {loading ? 'Carregando…' : `${intakes.length} NF(s) aguardando revisão${totalValor ? ` · ${fmtBRL(totalValor)} total` : ''}`}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={carregar}
              disabled={loading}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-amber-600 text-white hover:bg-amber-700 rounded-xl"
              onClick={handleExecutarVarredura}
              disabled={rodandoVarredura}
            >
              {rodandoVarredura
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Varrendo…</>
                : <><Search className="w-3.5 h-3.5" />Varrer Drive agora</>
              }
            </Button>
          </div>
        </div>
      </div>

      {/* Resultado da última varredura */}
      {resultadoVarredura && (
        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: 'XMLs no Drive', value: resultadoVarredura.xmls_encontrados_drive, color: 'text-gray-700' },
              { label: 'Duplicatas descartadas', value: resultadoVarredura.duplicatas_descartadas, color: 'text-orange-600' },
              { label: 'Novas encontradas', value: resultadoVarredura.novas_nfs_encontradas, color: 'text-green-700' },
              { label: 'Intakes criados', value: resultadoVarredura.intakes_criados, color: 'text-blue-700' },
            ].map((s, i) => (
              <div key={i} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-center">
                <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                <p className="text-[10px] text-gray-500 leading-tight mt-0.5">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Busca */}
      {intakes.length > 0 && (
        <div className="px-5 py-3 border-b border-gray-100">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por fornecedor, NF, arquivo…"
              className="w-full pl-8 pr-4 py-2 text-sm rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-300 bg-white"
            />
          </div>
        </div>
      )}

      {/* Lista */}
      <div className="p-5 space-y-2 max-h-[600px] overflow-y-auto">
        {loading ? (
          <div className="py-8 flex flex-col items-center gap-2 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin" />
            <p className="text-xs">Carregando NFs pendentes…</p>
          </div>
        ) : filtradas.length === 0 ? (
          <div className="py-10 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-300 mx-auto mb-2" />
            <p className="text-sm font-semibold text-gray-500">
              {intakes.length === 0 ? 'Nenhuma NF aguardando conferência' : 'Nenhum resultado para a busca'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {intakes.length === 0
                ? 'Execute a varredura no Drive para importar novas NFs ou todas já foram conferidas.'
                : 'Tente outros termos de busca.'}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-gray-500">{filtradas.length} NF(s) exibida(s)</p>
              {filtradas.length > 1 && (
                <button
                  onClick={async () => {
                    if (!window.confirm(`Confirmar todas as ${filtradas.length} NFs de uma vez?`)) return;
                    for (const intake of filtradas) {
                      await base44.entities.DocumentIntake.update(intake.id, {
                        status_processamento: 'ENVIADO_APROVACAO',
                        revisado_pelo_usuario: true
                      }).catch(() => {});
                    }
                    toast.success(`${filtradas.length} NFs enviadas para aprovação.`);
                    await carregar();
                    onSuccess?.();
                  }}
                  className="text-xs text-green-700 hover:underline flex items-center gap-1"
                >
                  <CheckCircle2 className="w-3 h-3" />Confirmar todas
                </button>
              )}
            </div>
            {filtradas.map(intake => (
              <IntakeCard
                key={intake.id}
                intake={intake}
                onAprovar={handleAprovar}
                onDescartar={handleDescartar}
                loading={processando === intake.id}
              />
            ))}
          </>
        )}
      </div>

      {/* Aviso de NFs sem valor */}
      {intakes.filter(i => !i.nf_valor_total).length > 0 && (
        <div className="px-5 py-3 border-t border-amber-100 bg-amber-50">
          <p className="text-xs text-amber-700 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            {intakes.filter(i => !i.nf_valor_total).length} NF(s) sem valor extraído — verifique o XML original no Drive antes de confirmar.
          </p>
        </div>
      )}
    </div>
  );
}