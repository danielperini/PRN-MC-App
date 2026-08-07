import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { FileCode, Loader2, Play, AlertTriangle, CheckCircle2, X, FileX2, FolderSymlink } from 'lucide-react';
import { Button } from '@/components/ui/button';

const STATUS_PDF_LABEL = {
  pareado_pr: { label: 'PDF (PR)', cls: 'bg-green-100 text-green-700' },
  pareado_drive: { label: 'PDF (Drive)', cls: 'bg-green-100 text-green-700' },
  sem_pdf: { label: 'Sem PDF', cls: 'bg-orange-100 text-orange-700' },
};

const STATUS_COPIA_LABEL = {
  copiado: { label: 'Copiado', cls: 'bg-green-100 text-green-700' },
  ja_existia: { label: 'Já existia', cls: 'bg-gray-100 text-gray-600' },
  simulado: { label: 'Simulado', cls: 'bg-blue-100 text-blue-700' },
  sem_pasta: { label: 'Sem pasta', cls: 'bg-amber-100 text-amber-700' },
  sem_origem: { label: 'Sem origem', cls: 'bg-gray-100 text-gray-500' },
  pulado_sem_dados: { label: 'Sem dados', cls: 'bg-gray-100 text-gray-500' },
  erro: { label: 'Erro', cls: 'bg-red-100 text-red-700' },
  pendente: { label: 'Pendente', cls: 'bg-gray-100 text-gray-400' },
};

function Badge({ status, map }) {
  const cfg = map[status] || { label: status || '—', cls: 'bg-gray-100 text-gray-500' };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>;
}

export default function SincronizarXmlsPanel() {
  const [executando, setExecutando] = useState(false);
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 });
  const [resultado, setResultado] = useState(null);
  const [mostraTabela, setMostraTabela] = useState(false);

  async function executar(dryRun) {
    if (executando) return;
    setExecutando(true);
    setProgresso({ atual: 0, total: 0 });
    setResultado(null);
    setMostraTabela(false);
    try {
      if (dryRun) {
        // Simulação: lotes pequenos só para estimar
        const resp = await base44.functions.invoke('sincronizarXmlsParaPastasMensais', { dryRun: true, skip: 0, limite: 50 });
        const data = resp?.data || resp;
        if (data?.ok === false) throw new Error(data?.error || 'Falha na simulação');
        setResultado(data);
        setMostraTabela(true);
        const s = data.stats || {};
        const totalGlobal = s.total_deduplicado || s.total_xmls || 0;
        toast.success(`Simulação: ${totalGlobal} XMLs únicos (lote amostra: ${s.total_xmls}) · ${s.pareados_pdf || 0} pareados · ${s.sem_pdf || 0} sem PDF`);
        return;
      }

      // Sincronização real com paginação automática
      const LOTE = 40;
      let skip = 0;
      let totalGlobal = 0;
      let hasMore = true;
      const acumulado = {
        total_xmls: 0, pareados_pdf: 0, sem_pdf: 0, sem_pr: 0,
        copiados_primario: 0, copiados_secundario: 0, ja_existiam: 0, erros: 0,
      };
      const todasLinhas = [];
      let loteIdx = 0;
      while (hasMore) {
        loteIdx++;
        const resp = await base44.functions.invoke('sincronizarXmlsParaPastasMensais', { dryRun: false, skip, limite: LOTE });
        const data = resp?.data || resp;
        if (data?.ok === false) throw new Error(data?.error || `Falha no lote ${loteIdx}`);
        const s = data.stats || {};
        totalGlobal = s.total_deduplicado || totalGlobal;
        acumulado.total_xmls += s.total_xmls || 0;
        acumulado.pareados_pdf += s.pareados_pdf || 0;
        acumulado.sem_pdf += s.sem_pdf || 0;
        acumulado.sem_pr += s.sem_pr || 0;
        acumulado.copiados_primario += s.copiados_primario || 0;
        acumulado.copiados_secundario += s.copiados_secundario || 0;
        acumulado.ja_existiam += s.ja_existiam || 0;
        acumulado.erros += s.erros || 0;
        if (Array.isArray(data.linhas)) todasLinhas.push(...data.linhas);
        setProgresso({ atual: skip + (s.total_xmls || 0), total: totalGlobal, lote: loteIdx });
        setResultado({ stats: { ...acumulado, total_deduplicado: totalGlobal, lote_atual: loteIdx }, linhas: todasLinhas });
        hasMore = !!s.has_more;
        skip += LOTE;
        if (s.erros > 0 && s.erros >= (s.total_xmls || 1)) {
          toast.error(`Lote ${loteIdx} com muitos erros — interrompendo. Verifique detalhes.`);
          break;
        }
      }
      setMostraTabela(true);
      toast.success(
        `Sincronização completa: ${acumulado.total_xmls} XMLs · ${acumulado.copiados_primario} primário · ${acumulado.copiados_secundario} secundário · ${acumulado.ja_existiam} já existiam · ${acumulado.erros} erros`,
      );
    } catch (err) {
      toast.error('Erro: ' + (err?.message || 'erro desconhecido'));
    } finally {
      setExecutando(false);
    }
  }

  const stats = resultado?.stats || {};
  const linhas = resultado?.linhas || [];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-indigo-50 p-2">
            <FileCode className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Sincronizar XMLs → Pastas Mensais</h3>
            <p className="text-xs text-gray-500 max-w-xl">
              Envia cada XML (e seu PDF par) para as pastas mensais <code className="text-[11px]">MM-YYYY</code> do backup e do arquivo final,
              renomeados no padrão canônico. Idempotente: pula arquivos já existentes.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => executar(true)}
            disabled={executando}
          >
            {executando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderSymlink className="mr-2 h-4 w-4" />}
            Simular
          </Button>
          <Button
            size="sm"
            className="bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={() => executar(false)}
            disabled={executando}
          >
            {executando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Sincronizar
          </Button>
        </div>
      </div>

      {executando && (
        <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3">
          <div className="mb-1 flex items-center justify-between text-sm">
            <span className="text-indigo-700">
              {progresso.lote ? `Sincronizando lote ${progresso.lote}...` : 'Iniciando...'}
            </span>
            {progresso.total > 0 && (
              <span className="text-indigo-700">{progresso.atual}/{progresso.total}</span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-indigo-100">
            <div
              className="h-full bg-indigo-600 transition-all"
              style={{ width: `${progresso.total ? (progresso.atual / progresso.total) * 100 : 100}%` }}
            />
          </div>
          <p className="mt-1 text-[11px] text-indigo-500">
            Processamento em lotes automáticos para evitar timeout — cada lote copia para os dois destinos no Drive.
          </p>
        </div>
      )}

      {resultado && !executando && (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-9">
            <StatCard label="Total XMLs" value={stats.total_xmls} />
            {stats.lote_atual && <StatCard label="Lotes" value={stats.lote_atual} color="indigo" />}
            <StatCard label="Pareados PDF" value={stats.pareados_pdf} color="green" />
            <StatCard label="Sem PDF" value={stats.sem_pdf} color="orange" />
            <StatCard label="Sem PR" value={stats.sem_pr} color="amber" />
            <StatCard label="Cópias primário" value={stats.copiados_primario} color="green" />
            <StatCard label="Cópias secundário" value={stats.copiados_secundario} color="green" />
            <StatCard label="Já existiam" value={stats.ja_existiam} color="gray" />
            <StatCard label="Erros" value={stats.erros} color="red" />
          </div>

          {mostraTabela && linhas.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-gray-600">
                  {linhas.length} arquivo(s) — linhas sem PDF em laranja, erros em vermelho
                </p>
                <Button variant="ghost" size="sm" onClick={() => setMostraTabela(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="max-h-96 overflow-auto rounded-lg border border-gray-200">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium">Nome final</th>
                      <th className="px-2 py-2 text-left font-medium">Mês/Ano</th>
                      <th className="hidden md:table-cell px-2 py-2 text-left font-medium">Origem</th>
                      <th className="px-2 py-2 text-center font-medium">PDF par</th>
                      <th className="px-2 py-2 text-center font-medium">Primário</th>
                      <th className="px-2 py-2 text-center font-medium">Secundário</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {linhas.map((l, i) => {
                      const semPdf = l.status_pdf === 'sem_pdf';
                      const temErro = l.status_primario === 'erro' || l.status_secundario === 'erro';
                      const rowCls = temErro
                        ? 'bg-red-50'
                        : semPdf
                        ? 'bg-orange-50'
                        : '';
                      return (
                        <tr key={i} className={rowCls}>
                          <td className="px-2 py-1.5 text-gray-900 max-w-xs truncate" title={l.nome_final_xml}>
                            {l.nome_final_xml || l.nome_original || '—'}
                          </td>
                          <td className="px-2 py-1.5 text-gray-600 whitespace-nowrap">{l.mes_ano || '—'}</td>
                          <td className="hidden md:table-cell px-2 py-1.5 text-gray-500">{l.origem}</td>
                          <td className="px-2 py-1.5 text-center"><Badge status={l.status_pdf} map={STATUS_PDF_LABEL} /></td>
                          <td className="px-2 py-1.5 text-center"><Badge status={l.status_primario} map={STATUS_COPIA_LABEL} /></td>
                          <td className="px-2 py-1.5 text-center"><Badge status={l.status_secundario} map={STATUS_COPIA_LABEL} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {linhas.some((l) => l.erro) && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2">
                  <p className="text-xs font-medium text-red-700 mb-1">Erros detalhados:</p>
                  <ul className="text-xs text-red-600 space-y-0.5 max-h-32 overflow-auto">
                    {linhas.filter((l) => l.erro).map((l, i) => (
                      <li key={i} className="truncate">{l.nome_final_xml || l.nome_original}: {l.erro}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {!resultado && !executando && (
        <div className="rounded-lg border-2 border-dashed border-gray-200 py-8 text-center">
          <FileX2 className="mx-auto mb-2 h-8 w-8 text-gray-300" />
          <p className="text-xs text-gray-400">
            Clique em <strong>Simular</strong> para_preview ou <strong>Sincronizar</strong> para executar a cópia.
          </p>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color = 'gray' }) {
  const colorMap = {
    gray: 'border-gray-200 bg-white text-gray-900',
    green: 'border-green-200 bg-green-50 text-green-700',
    orange: 'border-orange-200 bg-orange-50 text-orange-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-red-200 bg-red-50 text-red-700',
    indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
  };
  return (
    <div className={`rounded-lg border p-2 ${colorMap[color]}`}>
      <p className="text-[10px] leading-tight opacity-70">{label}</p>
      <p className="text-lg font-semibold">{value ?? 0}</p>
    </div>
  );
}