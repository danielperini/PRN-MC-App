import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  FolderSearch,
  Loader2,
  Database,
  CalendarClock,
  Sparkles,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Wallet,
  FileText,
  FolderGit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCurrentUser } from '@/components/auth/useCurrentUser';
import LimparNomesMaquinaDialog from '@/components/compras/LimparNomesMaquinaDialog';
import UnificarBackupDialog from '@/components/compras/UnificarBackupDialog';

const FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const FOLDER_URL = `https://drive.google.com/drive/folders/${FOLDER_ID}`;

const fmtInt = (n) => new Intl.NumberFormat('pt-BR').format(Number(n || 0));
const fmtBR = (dateStr) => {
  if (!dateStr) return '—';
  try {
    if (dateStr.length === 7) {
      // YYYY-MM
      const [y, m] = dateStr.split('-');
      const nomes = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      return `${nomes[Number(m) - 1]}/${y}`;
    }
    return new Date(dateStr).toLocaleDateString('pt-BR');
  } catch { return dateStr; }
};

function MonthRow({ row, onTratarMes, processandoMesId, expandido, onToggleExpand }) {
  const { mes, total, no_banco, faltando, faltando_ids } = row;
  const pctBanco = total > 0 ? Math.round((no_banco / total) * 100) : 0;
  const isAntes14Julho = mes < '2026-07' || (mes === '2026-07');
  const cor = pctBanco === 100 ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
    : pctBanco > 50 ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-red-100 text-red-700 border-red-200';

  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        type="button"
        onClick={onToggleExpand}
        className="flex w-full items-stretch text-left"
      >
        <div className="flex items-center px-3 text-gray-400">
          {expandido ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
        </div>
        <div className="flex flex-1 items-center justify-between gap-3 py-3 pr-3">
          <div className="flex items-center gap-3">
            <CalendarClock className="h-5 w-5 text-gray-500" />
            <div>
              <div className="text-sm font-semibold text-gray-900">{fmtBR(mes)}</div>
              <div className="text-xs text-gray-500">{fmtInt(total)} arquivo(s) localizado(s)</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <div className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold ${cor}`}>
                <Database className="h-3 w-3" /> {no_banco}/{total} ({pctBanco}%)
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm font-semibold text-gray-900">{fmtInt(faltando)} faltando{mensagemPagosLabel(isAntes14Julho)}</div>
              <div className="text-xs text-gray-500">{faltando_ids?.length || 0} id(s) prontos p/ tratar</div>
            </div>
          </div>
        </div>
      </button>
      {expandido && (
        <div className="border-t border-gray-100 bg-gray-50 px-4 py-3 text-xs">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="space-y-1 text-gray-700">
              <p><span className="font-medium">Totais:</span> {fmtInt(total)} · <span className="text-emerald-700">{fmtInt(no_banco)} no banco</span> · <span className="text-red-700">{fmtInt(faltando)} faltando</span></p>
              <p><span className="font-medium">Estratégia:</span> XMLs baixados+parseados; <span className={isAntes14Julho ? 'text-blue-700' : ''}>NFs anteriores a 14/07/2026 marcadas como <strong>PAGO</strong></span>.</p>
              <p><span className="font-medium">Tratamento IA:</span> rubrica + meta + centro de custo sugeridos pela IA para registros novos/faltantes.</p>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={processandoMesId === mes || !faltando_ids?.length}
              onClick={() => onTratarMes(mes, faltando_ids)}
              className="gap-2 bg-black text-white hover:bg-gray-800"
            >
              {processandoMesId === mes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {processandoMesId === mes ? 'Tratando...' : `Tratar ${faltando_ids?.length || 0} NF(s)`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function mensagemPagosLabel(isAntes) {
  return isAntes ? ' (→ PAGO)' : '';
}

function StatCard({ icon: Icon, label, value, tone }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${tone}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wide text-gray-400">{label}</div>
          <div className="text-lg font-bold text-gray-900">{value}</div>
        </div>
      </div>
    </div>
  );
}

export default function PainelSincronizacaoDriveNFs({ purchasesPendentes }) {
  const qc = useQueryClient();
  const { isCoordGeral } = useCurrentUser();
  const [limparNomesOpen, setLimparNomesOpen] = useState(false);
  const [unificarBackupOpen, setUnificarBackupOpen] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanData, setScanData] = useState(null);
  const [tratandoMes, setTratandoMes] = useState(null);
  const [tratandoTudo, setTratandoTudo] = useState(false);
  const [marcandoPagos, setMarcandoPagos] = useState(false);
  const [logRecente, setLogRecente] = useState([]);
  const [expanded, setExpanded] = useState(new Set(['2026-07']));

  // Normalização silenciosa de pastas (fire-and-forget) — chamada automaticamente
  // ao abrir o painel e após cada scan manual. Restrita a isCoordGeral.
  function dispararNormalizacaoIncrementalBackground() {
    if (!isCoordGeral) return;
    base44.functions
      .invoke('normalizarPastasDriveNFs', { modo: 'incremental' })
      .catch((err) => console.error('Normalização incremental (background) falhou:', err));
  }

  // Disparo único ao montar o painel — sem bloquear a UI, sem feedback visual.
  useEffect(() => {
    dispararNormalizacaoIncrementalBackground();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function executarScan() {
    setScanning(true);
    setScanData(null);
    setLogRecente([]);
    try {
      const res = await base44.functions.invoke('auditSincPastaNFs', { mode: 'scan' });
      const data = res?.data || res || {};
      if (data?.ok === false) throw new Error(data?.error || 'Falha no scan');
      setScanData(data);
      if (data.warning) toast.info(data.warning);
      toast.success(
        `Pasta escaneada: ${data.total_xmls} XMLs / ${data.total_pdfs} PDFs · ${data.por_mes?.length || 0} meses.`
      );
      // Após scan concluir, dispara normalização incremental em background (fire-and-forget).
      dispararNormalizacaoIncrementalBackground();
    } catch (e) {
      console.error('Erro scan:', e);
      toast.error('Erro ao escanear pasta: ' + (e?.message || e));
    } finally {
      setScanning(false);
    }
  }

  async function tratarMes(mes, fileIds) {
    if (!fileIds?.length) return;
    setTratandoMes(mes);
    try {
      toast.info(`Tratando ${fileIds.length} NF(s) de ${fmtBR(mes)}...`);
      // Processamos em blocos de 15 para garantir dentro do timeout
      const total = fileIds.length;
      let criados = 0, atualizados = 0, pagos = 0, erros = 0;
      const resultadosAcum = [];
      for (let i = 0; i < total; i += 15) {
        const batch = fileIds.slice(i, i + 15);
        try {
          const res = await base44.functions.invoke('auditSincPastaNFs', { mode: 'tratar_lote', file_ids: batch });
          const d = res?.data || res || {};
          if (d?.ok === false) throw new Error(d?.error);
          criados += Number(d.criados || 0);
          atualizados += Number(d.atualizados || 0);
          pagos += Number(d.pagosMarcados || 0);
          erros += Number(d.erros || 0);
          if (Array.isArray(d.resultados)) resultadosAcum.push(...d.resultados);
        } catch (e) {
          console.error('Erro em batch:', e);
          erros += batch.length;
        }
      }
      setLogRecente((prev) => [
        { mes, total, criados, atualizados, pagos, erros, timestamp: new Date().toISOString(), amostra: resultadosAcum.slice(0, 8) },
        ...prev,
      ].slice(0, 12));
      toast.success(
        `${mes} → ${criados} criados, ${atualizados} atualizados, ${pagos} marcados PAGO, ${erros} erros.`
      );
      // Re-scan automatizado para atualizar a UI
      await executarScan();
      qc.invalidateQueries(['compras']);
    } catch (e) {
      toast.error(`Erro ao tratar mês ${mes}: ${e?.message || e}`);
    } finally {
      setTratandoMes(null);
    }
  }

  async function tratarMesInternal(mes, fileIds) {
    setTratandoMes(mes);
    const total = fileIds.length;
    let criados = 0, atualizados = 0, pagos = 0, erros = 0;
    const resultadosAcum = [];
    for (let i = 0; i < total; i += 15) {
      const batch = fileIds.slice(i, i + 15);
      try {
        const res = await base44.functions.invoke('auditSincPastaNFs', { mode: 'tratar_lote', file_ids: batch });
        const d = res?.data || res || {};
        if (d?.ok === false) throw new Error(d?.error);
        criados += Number(d.criados || 0);
        atualizados += Number(d.atualizados || 0);
        pagos += Number(d.pagosMarcados || 0);
        erros += Number(d.erros || 0);
        if (Array.isArray(d.resultados)) resultadosAcum.push(...d.resultados);
      } catch (e) {
        erros += batch.length;
      }
    }
    setLogRecente((prev) => [
      { mes, total, criados, atualizados, pagos, erros, timestamp: new Date().toISOString(), amostra: resultadosAcum.slice(0, 8) },
      ...prev,
    ].slice(0, 12));
    setTratandoMes(null);
    return { criados, atualizados, pagos, erros };
  }

  async function tratarPdfsSemXmlInternal(pdfIds) {
    const total = pdfIds.length;
    let criados = 0, erros = 0;
    const resultadosAcum = [];
    for (let i = 0; i < total; i += 10) {
      const batch = pdfIds.slice(i, i + 10);
      try {
        const res = await base44.functions.invoke('auditSincPastaNFs', { mode: 'tratar_pdfs_sem_xml', pdf_ids: batch });
        const d = res?.data || res || {};
        if (d?.ok === false) throw new Error(d?.error);
        criados += Number(d.criados || 0);
        erros += Number(d.erros || 0);
        if (Array.isArray(d.resultados)) resultadosAcum.push(...d.resultados);
      } catch (e) {
        erros += batch.length;
      }
    }
    setLogRecente((prev) => [
      { mes: 'PDFs IA', pdfIA: true, total, criados, erros, timestamp: new Date().toISOString(), amostra: resultadosAcum.slice(0, 8) },
      ...prev,
    ].slice(0, 12));
    return { criados, erros };
  }

  async function tratarTudo() {
    if (!scanData?.por_mes?.length) {
      toast.info('Execute o scan primeiro.');
      return;
    }
    setTratandoTudo(true);
    try {
      const todos = scanData.por_mes.filter((r) => r.faltando_ids?.length > 0);
      let totalCriados = 0, totalAtualizados = 0, totalPagos = 0, totalErros = 0;
      for (const row of todos) {
        const acc = await tratarMesInternal(row.mes, row.faltando_ids);
        totalCriados += acc.criados;
        totalAtualizados += acc.atualizados;
        totalPagos += acc.pagos;
        totalErros += acc.erros;
      }

      // Fallback: PDFs sem XML via IA
      let pdfCriados = 0, pdfErros = 0;
      const pdfsSemXml = scanData.pdfs_sem_xml || [];
      if (pdfsSemXml.length > 0) {
        toast.info(`${pdfsSemXml.length} PDF(s) sem XML — extraindo dados via IA...`);
        const accPdf = await tratarPdfsSemXmlInternal(pdfsSemXml.map((p) => p.id));
        pdfCriados = accPdf.criados;
        pdfErros = accPdf.erros;
      }

      toast.success(
        `Tratamento total: ${totalCriados} criados, ${totalAtualizados} atualizados, ${totalPagos} marcados PAGO, ${totalErros} erros.` +
        (pdfsSemXml.length > 0 ? ` PDFs IA: ${pdfCriados} intakes, ${pdfErros} erros.` : '')
      );
      await executarScan();
      qc.invalidateQueries(['compras']);
    } catch (e) {
      toast.error('Erro ao tratar tudo: ' + (e?.message || e));
    } finally {
      setTratandoTudo(false);
    }
  }

  async function marcarAnteriores14JulhoComoPago() {
    setMarcandoPagos(true);
    try {
      toast.info('Marcando NFs anteriores a 14/07/2026 como PAGAS...');
      const res = await base44.functions.invoke('auditSincPastaNFs', { mode: 'completar_pagos_anteriores' });
      const d = res?.data || res || {};
      if (d?.ok === false) throw new Error(d?.error);
      toast.success(
        `${d.marcados} NF(s) marcadas como PAGAS (${d.candidatos} candidatas).`
      );
      qc.invalidateQueries(['compras']);
      await executarScan();
    } catch (e) {
      toast.error('Erro ao marcar pagos: ' + (e?.message || e));
    } finally {
      setMarcandoPagos(false);
    }
  }

  function toggleExpand(mes) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(mes)) next.delete(mes);
      else next.add(mes);
      return next;
    });
  }

  const porMes = scanData?.por_mes || [];
  const totalFaltando = porMes.reduce((acc, r) => acc + (r.faltando || 0), 0);
  const totalNoBanco = porMes.reduce((acc, r) => acc + (r.no_banco || 0), 0);
  const faltandoIds = porMes.flatMap((r) => r.faltando_ids || []);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <FolderSearch className="h-5 w-5 text-black" />
              Sincronização de Notas Fiscais (Drive → Banco)
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              Pasta raiz:{' '}
              <a href={FOLDER_URL} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline">
                {FOLDER_ID}
              </a>
              <span className="mx-2 text-gray-300">·</span>
              NFs &lt; 14/07/2026 marcadas como <strong className="text-emerald-700">PAGO</strong>
              <span className="mx-2 text-gray-300">·</span>
              IA preenche rubrica, meta e centro de custo
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={executarScan}
              disabled={scanning}
              className="gap-2"
            >
              {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderSearch className="h-4 w-4" />}
              {scanning ? 'Escaneando...' : 'Escanear pasta agora'}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={tratarTudo}
              disabled={tratandoTudo || !scanData || totalFaltando === 0}
              className="gap-2 bg-black text-white hover:bg-gray-800"
            >
              {tratandoTudo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {tratandoTudo ? 'Tratando tudo...' : `Tratar tudo (${totalFaltando})`}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={marcarAnteriores14JulhoComoPago}
              disabled={marcandoPagos}
              className="gap-2 border-emerald-300 text-emerald-700 hover:bg-emerald-50"
            >
              {marcandoPagos ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              {marcandoPagos ? 'Marcando...' : 'Marcar anteriores a 14/07 como PAGO'}
            </Button>
            {isCoordGeral && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setUnificarBackupOpen(true)}
                className="gap-2 border-gray-300 text-gray-800 hover:bg-gray-100"
              >
                <FolderGit className="h-4 w-4" />
                Unificar pastas backup (MM-YYYY)
              </Button>
            )}
            {isCoordGeral && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLimparNomesOpen(true)}
                className="gap-2 border-gray-300 text-gray-800 hover:bg-gray-100"
              >
                <Sparkles className="h-4 w-4" />
                Limpar nomes de máquina
              </Button>
            )}
          </div>
        </div>

        {scanData && (
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-6 gap-3">
            <StatCard icon={FolderSearch} tone="bg-gray-100 text-gray-700" label="Total arquivos" value={fmtInt(scanData.total_arquivos)} />
            <StatCard icon={Database} tone="bg-blue-100 text-blue-700" label="XMLs parseados" value={fmtInt(scanData.total_xmls)} />
            <StatCard icon={CheckCircle2} tone="bg-emerald-100 text-emerald-700" label="Já no banco" value={fmtInt(totalNoBanco)} />
            <StatCard icon={AlertTriangle} tone="bg-amber-100 text-amber-700" label="Faltando tratar" value={fmtInt(totalFaltando)} />
            <StatCard
              icon={FileText}
              tone={(scanData.pdfs_sem_xml?.length || 0) > 0 ? 'bg-amber-500 text-white' : 'bg-gray-100 text-gray-600'}
              label="PDFs sem XML"
              value={fmtInt(scanData.total_pdfs)}
            />
            <StatCard
              icon={FolderGit}
              tone="bg-emerald-100 text-emerald-700"
              label="Pastas normalizadas"
              value="✓"
            />
          </div>
        )}

        {scanData?.requer_marcar_pago_anteriores > 0 && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
            <Wallet className="mr-1 inline h-3.5 w-3.5" />
            <strong>{scanData.requer_marcar_pago_anteriores}</strong> NF(s) no banco com data &lt; 14/07/2026 ainda não marcadas como PAGO — clique em <em>“Marcar anteriores a 14/07 como PAGO”</em>.
          </div>
        )}

        {scanData?.erros_scan?.length > 0 && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
            {scanData.erros_scan.length} erro(s) durante varredura (mostrados no console).
          </div>
        )}
      </div>

      {scanning && !scanData && (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-gray-200 bg-white p-12">
          <Loader2 className="h-8 w-8 animate-spin text-gray-700" />
          <p className="text-sm text-gray-500">Varrendo a pasta do Drive recursivamente (até 3 níveis)...</p>
        </div>
      )}

      {scanData && porMes.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-gray-700">Arquivos localizados por mês de emissão</h4>
          {porMes.map((row) => (
            <MonthRow
              key={row.mes}
              row={row}
              onTratarMes={tratarMes}
              processandoMesId={tratandoMes}
              expandido={expanded.has(row.mes)}
              onToggleExpand={() => toggleExpand(row.mes)}
            />
          ))}
        </div>
      )}

      {scanData && porMes.length === 0 && !scanning && (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Nenhum arquivo NF localizado na pasta raiz e subpastas (profundidade até 3).
        </div>
      )}

      {logRecente.length > 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-4">
          <h4 className="mb-3 text-sm font-semibold text-gray-700">Processamentos recentes</h4>
          <div className="space-y-2">
            {logRecente.map((log, idx) => (
              <div
                key={`${log.mes}-${log.timestamp}-${idx}`}
                className={`rounded-lg border p-3 text-xs ${log.pdfIA ? 'border-indigo-200 bg-indigo-50' : 'border-gray-200 bg-gray-50'}`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium text-gray-900">
                    {log.pdfIA ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                        <FileText className="h-3 w-3" /> PDFs IA
                      </span>
                    ) : null}
                    {log.pdfIA ? 'PDFs tratados via IA' : `${fmtBR(log.mes)} · ${log.total} arquivo(s)`}
                  </div>
                  <div className="text-gray-500">{new Date(log.timestamp).toLocaleString('pt-BR')}</div>
                </div>
                <div className="mt-1 flex flex-wrap gap-3 text-gray-700">
                  {log.pdfIA ? (
                    <>
                      <span className="text-indigo-700">✓ {log.criados} intakes criados</span>
                      {log.erros > 0 && <span className="text-red-700">⚠ {log.erros} erros</span>}
                    </>
                  ) : (
                    <>
                      <span className="text-emerald-700">✓ {log.criados} criados</span>
                      <span className="text-blue-700">✎ {log.atualizados} atualizados</span>
                      <span className="text-purple-700">💰 {log.pagos} marcados PAGO</span>
                      {log.erros > 0 && <span className="text-red-700">⚠ {log.erros} erros</span>}
                    </>
                  )}
                </div>
                {log.amostra?.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-[11px] text-gray-600">
                    {log.amostra.slice(0, 4).map((r, i) => (
                      <li key={i}>
                        {r.ok ? '✓' : '✗'} <span className="font-medium">{r.file_name || r.file_id?.slice(0, 10)}</span>
                        {' '}— NF {r.nf_numero || '—'} · {r.emissor || '—'} · R$ {Number(r.valor || 0).toFixed(2)}
                        {r.acao && <em className="text-gray-400"> ({r.acao})</em>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {isCoordGeral && (
        <LimparNomesMaquinaDialog open={limparNomesOpen} onOpenChange={setLimparNomesOpen} />
      )}
      {isCoordGeral && (
        <UnificarBackupDialog open={unificarBackupOpen} onOpenChange={setUnificarBackupOpen} />
      )}
    </div>
  );
}