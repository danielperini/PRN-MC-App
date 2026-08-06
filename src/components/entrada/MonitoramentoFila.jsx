import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  Radar,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
  FileCheck2,
  FileX2,
  Clock,
  Search,
  Activity,
  History,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ArrowRight,
  Wrench,
} from 'lucide-react';

// Tempos limite
const LIMITE_ANALISANDO_IA_MS = 10 * 60 * 1000; // 10 minutos
const LIMITE_XML_PENDENTE_MS = 24 * 60 * 60 * 1000; // 24h

function getTipoByFile(intake) {
  const mime = String(intake?.mime_type || '').toLowerCase();
  const name = String(intake?.file_name_original || '').toLowerCase();
  if (mime.includes('xml') || name.endsWith('.xml')) return 'NOTA_FISCAL_XML';
  if (mime.includes('pdf') || name.endsWith('.pdf')) return 'NOTA_FISCAL_PDF';
  return intake?.tipo_detectado || 'OUTRO';
}

function parseValorBR(value) {
  const raw = String(value || '').trim().replace(/\s/g, '');
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) {
    return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return Number(raw.replace(',', '.')) || 0;
}

function getValorNF(intake) {
  const ia = intake?.resultado_ia || {};
  return parseValorBR(
    ia.nf_valor_total ||
      ia.valor_total ||
      ia.valor ||
      intake?.nf_valor_total ||
      ''
  );
}

function getFornecedor(intake) {
  const ia = intake?.resultado_ia || {};
  return (
    ia.nf_emitente_nome ||
    ia.fornecedor_nome ||
    intake?.nf_emitente_nome ||
    intake?.fornecedor_nome ||
    intake?.file_name_original ||
    '—'
  );
}

function formatarTempo(ms) {
  if (!ms || ms < 0) return '—';
  const horas = Math.floor(ms / (60 * 60 * 1000));
  const minutos = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (horas > 0) return `${horas}h ${minutos}min`;
  return `${minutos}min`;
}

function formatarDataHora(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

const ETAPAS_PIPELINE = [
  { key: 'ENVIADO', label: 'Enviado', cor: 'text-gray-600', bg: 'bg-gray-100' },
  { key: 'ANALISANDO_IA', label: 'Analisando IA', cor: 'text-blue-700', bg: 'bg-blue-100' },
  { key: 'AGUARDANDO_REVISAO', label: 'Aguard. Revisão', cor: 'text-amber-700', bg: 'bg-amber-100' },
  { key: 'ENVIADO_APROVACAO', label: 'Enviado Aprov.', cor: 'text-indigo-700', bg: 'bg-indigo-100' },
  { key: 'APROVADO', label: 'Aprovado', cor: 'text-green-700', bg: 'bg-green-100' },
];

export default function MonitoramentoFila({ intakes = [], processados = [], onRefresh }) {
  const [expandido, setExpandido] = useState(false);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsLoaded, setLogsLoaded] = useState(false);
  const [buscandoXmls, setBuscandoXmls] = useState(false);
  const [atualizando, setAtualizando] = useState(false);
  const [corrigindoComprovantes, setCorrigindoComprovantes] = useState(false);

  // Lista combinada: intakes (pendentes) + processados, para calcular o funil completo
  const todosIntakes = useMemo(() => [...intakes, ...processados], [intakes, processados]);

  // ---- Cálculos do Bloco 1: Status XML/PDF ----
  const statusXmlPdf = useMemo(() => {
    const pdfs = todosIntakes.filter((i) => getTipoByFile(i) === 'NOTA_FISCAL_PDF');
    const comXml = pdfs.filter(
      (i) => !!i.nf_xml_intake_id || i.grupo_status === 'COMPLETO'
    );
    const aguardandoXml = pdfs.filter(
      (i) => !i.nf_xml_intake_id && i.grupo_status !== 'COMPLETO'
    );

    const agora = Date.now();
    const aguardandoXml24h = aguardandoXml
      .filter((i) => {
        const desde = i.xml_pendente_desde || i.created_date || i.updated_date;
        if (!desde) return false;
        return agora - new Date(desde).getTime() > LIMITE_XML_PENDENTE_MS;
      })
      .map((i) => {
        const desde = i.xml_pendente_desde || i.created_date || i.updated_date;
        return {
          id: i.id,
          arquivo: i.file_name_final || i.file_name_original || '—',
          fornecedor: getFornecedor(i),
          valor: getValorNF(i),
          tempoMs: desde ? agora - new Date(desde).getTime() : 0,
        };
      })
      .sort((a, b) => b.tempoMs - a.tempoMs);

    return {
      totalPdfs: pdfs.length,
      comXml: comXml.length,
      aguardandoXml: aguardandoXml.length,
      aguardandoXml24h,
    };
  }, [todosIntakes]);

  // ---- Cálculos do Bloco 2: Pipeline de aprovação ----
  const pipeline = useMemo(() => {
    const contagem = {};
    for (const etapa of ETAPAS_PIPELINE) {
      contagem[etapa.key] = 0;
    }
    for (const i of todosIntakes) {
      const status = String(i.status_processamento || '').toUpperCase();
      if (contagem[status] !== undefined) contagem[status]++;
    }

    const agora = Date.now();
    const travadosAnalisandoIa = todosIntakes.filter((i) => {
      const status = String(i.status_processamento || '').toUpperCase();
      if (status !== 'ANALISANDO_IA') return false;
      const updated = new Date(i.updated_date || i.created_date || 0).getTime();
      return updated && agora - updated > LIMITE_ANALISANDO_IA_MS;
    });

    return { contagem, travadosAnalisandoIa: travadosAnalisandoIa.length };
  }, [todosIntakes]);

  // ---- Carregar BackupLogs ao expandir ----
  const carregarLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      let list = [];
      try {
        list = await base44.entities.BackupLog.filter(
          { backup_type: 'auditoria_entrada_unica' },
          '-processed_at',
          10
        );
      } catch {
        list = [];
      }

      const sorted = (Array.isArray(list) ? list : [])
        .sort((a, b) => new Date(b.processed_at || b.updated_date || b.created_date || 0) - new Date(a.processed_at || a.updated_date || a.created_date || 0))
        .slice(0, 5);
      setLogs(sorted);
      setLogsLoaded(true);
    } catch (e) {
      console.warn('Erro ao carregar BackupLogs:', e);
      setLogs([]);
      setLogsLoaded(true);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (expandido && !logsLoaded) {
      carregarLogs();
    }
  }, [expandido, logsLoaded, carregarLogs]);

  // ---- Ações ----
  async function handleAtualizar() {
    setAtualizando(true);
    try {
      await Promise.all([onRefresh?.(), carregarLogs()]);
    } finally {
      setAtualizando(false);
    }
  }

  async function handleBuscarXmlsDrive() {
    setBuscandoXmls(true);
    try {
      const res = await base44.functions.invoke('buscarXmlsNoDrive', { maxNfs: 50 });
      const data = res?.data || res || {};
      const encontrados = data.total_encontrados ?? data.encontrados ?? data.vinculados ?? 0;
      const processados = data.total_processados ?? data.processados ?? 0;
      toast.success(
        `Busca de XMLs concluída: ${encontrados} encontrados de ${processados} processados.`
      );
      await onRefresh?.();
    } catch (e) {
      console.error('Erro ao buscar XMLs no Drive:', e);
      toast.error('Erro ao buscar XMLs: ' + (e?.message || e));
    } finally {
      setBuscandoXmls(false);
    }
  }

  async function handleCorrigirComprovantes() {
    setCorrigindoComprovantes(true);
    try {
      const res = await base44.functions.invoke('reclassificarComprovantesMalClassificados', { apenas_novos: false });
      const data = res?.data || res || {};
      if (data?.ok === false) {
        toast.error(data.error || 'Erro ao corrigir comprovantes');
        return;
      }
      const reclassificados = data.reclassificados || 0;
      const vinculados = data.vinculados || 0;
      const semMatch = data.sem_match || 0;
      if (reclassificados === 0 && vinculados === 0 && semMatch === 0) {
        toast.info('Nenhum comprovante mal classificado encontrado.');
      } else {
        toast.success(
          `${reclassificados} comprovante(s) reclassificado(s), ${vinculados} vinculado(s), ${semMatch} sem match.`
        );
      }
      await onRefresh?.();
    } catch (e) {
      console.error('Erro ao corrigir comprovantes mal classificados:', e);
      toast.error('Erro ao corrigir comprovantes: ' + (e?.message || e));
    } finally {
      setCorrigindoComprovantes(false);
    }
  }

  const badgeCount = statusXmlPdf.aguardandoXml;
  const temAtencao = pipeline.travadosAnalisandoIa > 0 || statusXmlPdf.aguardandoXml24h.length > 0;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
      {/* Cabeçalho clicável */}
      <button
        type="button"
        onClick={() => setExpandido((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${temAtencao ? 'bg-amber-100' : 'bg-gray-100'}`}>
            <Radar className={`w-4 h-4 ${temAtencao ? 'text-amber-700' : 'text-black'}`} />
          </div>
          <div className="text-left min-w-0">
            <p className="text-sm font-semibold text-black flex items-center gap-2">
              Monitoramento da Fila
              {badgeCount > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-[11px] font-bold">
                  {badgeCount} aguardando XML
                </span>
              )}
              {pipeline.travadosAnalisandoIa > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[11px] font-bold">
                  {pipeline.travadosAnalisandoIa} travados IA
                </span>
              )}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              Status do processamento automático em tempo real
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            onClick={(e) => {
              e.stopPropagation();
              handleAtualizar();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 cursor-pointer"
          >
            {atualizando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Atualizar
          </span>
          {expandido ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </div>
      </button>

      {/* Conteúdo expandido */}
      {expandido && (
        <div className="border-t border-gray-100 p-4 md:p-5 bg-gray-50/50">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Bloco 1 — Status XML/PDF */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <FileCheck2 className="w-4 h-4 text-black" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-black">Status XML / PDF</p>
                  <p className="text-[11px] text-gray-500">Vínculo de XMLs às NFs PDF</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="text-center">
                  <p className="text-2xl font-bold text-black">{statusXmlPdf.totalPdfs}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Total PDFs</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-green-700">{statusXmlPdf.comXml}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">Com XML</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-700">{statusXmlPdf.aguardandoXml}</p>
                  <p className="text-[10px] uppercase tracking-wide text-gray-500 font-semibold">S/ XML</p>
                </div>
              </div>

              {statusXmlPdf.aguardandoXml24h.length > 0 && (
                <div className="mb-3">
                  <p className="text-[11px] font-semibold text-amber-700 mb-1.5 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    Aguardando XML há mais de 24h
                  </p>
                  <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
                    {statusXmlPdf.aguardandoXml24h.slice(0, 5).map((item) => (
                      <div key={item.id} className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5">
                        <p className="text-xs font-medium text-gray-800 truncate">{item.arquivo}</p>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <p className="text-[11px] text-gray-600 truncate flex-1">{item.fornecedor}</p>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {item.valor > 0 && (
                              <span className="text-[11px] font-semibold text-gray-700">
                                R$ {item.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </span>
                            )}
                            <span className="text-[11px] text-amber-700 font-semibold">
                              {formatarTempo(item.tempoMs)}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                onClick={handleBuscarXmlsDrive}
                disabled={buscandoXmls}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                {buscandoXmls ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Search className="w-3.5 h-3.5" />
                )}
                Buscar XMLs no Drive
              </button>

              <button
                onClick={handleCorrigirComprovantes}
                disabled={corrigindoComprovantes}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                {corrigindoComprovantes ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Wrench className="w-3.5 h-3.5" />
                )}
                Corrigir Comprovantes Mal Classificados
              </button>
            </div>

            {/* Bloco 2 — Pipeline de aprovação */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Activity className="w-4 h-4 text-black" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-black">Pipeline de Aprovação</p>
                  <p className="text-[11px] text-gray-500">Funil de processamento</p>
                </div>
              </div>

              <div className="space-y-1.5">
                {ETAPAS_PIPELINE.map((etapa, idx) => {
                  const count = pipeline.contagem[etapa.key] || 0;
                  const isTravado = etapa.key === 'ANALISANDO_IA' && pipeline.travadosAnalisandoIa > 0;
                  return (
                    <React.Fragment key={etapa.key}>
                      <div className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 ${etapa.bg} ${isTravado ? 'ring-1 ring-amber-400' : ''}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          {isTravado ? (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                          ) : (
                            <span className={`w-2 h-2 rounded-full ${etapa.cor.replace('text-', 'bg-')} flex-shrink-0`} />
                          )}
                          <span className={`text-xs font-medium ${etapa.cor} truncate`}>{etapa.label}</span>
                        </div>
                        <span className={`text-sm font-bold ${etapa.cor} flex-shrink-0`}>{count}</span>
                      </div>
                      {idx < ETAPAS_PIPELINE.length - 1 && (
                        <div className="flex justify-center">
                          <ArrowRight className="w-3 h-3 text-gray-300 -rotate-90" />
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {pipeline.travadosAnalisandoIa > 0 && (
                <div className="mt-3 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2">
                  <p className="text-[11px] text-amber-700 font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    {pipeline.travadosAnalisandoIa} documento(s) travado(s) há mais de 10 min
                  </p>
                </div>
              )}
            </div>

            {/* Bloco 3 — Histórico de conciliação */}
            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <History className="w-4 h-4 text-black" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-black">Conciliação Automática</p>
                  <p className="text-[11px] text-gray-500">Últimas 5 execuções</p>
                </div>
              </div>

              {logsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
                </div>
              ) : logs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-gray-400">
                  <History className="w-7 h-7 mb-1.5 text-gray-300" />
                  <p className="text-xs text-gray-500">Nenhuma execução registrada</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {logs.map((log) => {
                    const isErro = String(log.status || '').toLowerCase() === 'erro' || String(log.status || '').toLowerCase() === 'failure';
                    return (
                      <div
                        key={log.id}
                        className={`rounded-lg border px-2.5 py-2 ${isErro ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {isErro ? (
                              <XCircle className="w-3.5 h-3.5 text-red-600 flex-shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5 text-green-600 flex-shrink-0" />
                            )}
                            <span className={`text-[11px] font-semibold ${isErro ? 'text-red-700' : 'text-green-700'}`}>
                              {formatarDataHora(log.processed_at || log.updated_date || log.created_date)}
                            </span>
                          </div>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isErro ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}
                          >
                            {String(log.status || '').toUpperCase()}
                          </span>
                        </div>
                        <div className="text-[11px] text-gray-600 space-y-0.5">
                          <p>
                            <span className="font-semibold text-gray-700">{log.total_files || 0}</span> arquivos ·{' '}
                            <span className="font-semibold text-gray-700">{log.files_copied || 0}</span> copiados
                          </p>
                          {log.details && (
                            <p className="truncate text-gray-500">{log.details}</p>
                          )}
                          {log.error_message && (
                            <p className="truncate text-red-600">{log.error_message}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}