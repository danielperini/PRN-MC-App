import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  CloudUpload,
  Loader2,
  CheckCircle2,
  FileText,
  FileCode2,
  AlertTriangle,
  ExternalLink,
  FolderGit,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

const fmtBR = (dateStr) => {
  if (!dateStr) return '—';
  try { return new Date(dateStr).toLocaleString('pt-BR'); } catch { return dateStr; }
};
const FOLDER_URL = 'https://drive.google.com/drive/folders/1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';

// Painel "Backup Drive Concluído":
//   Lista as NFs enviadas nesta sessão com fornecedor, número, mês (MM-YYYY),
//   ícones PDF/XML e link para a pasta mensal do Drive.
//   Botão "Garantir arquivos no Drive" executa a verificação + cópia idempotente
//   para todas as NFs aprovadas/pagas sem drive_backup_nf_ok=true.
export default function BackupDriveConcluidoPanel({ visible = true }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  async function garantir() {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('backupDiarioNFsDrive', { limite: 0 });
      const data = res?.data || res;
      if (!data?.ok) throw new Error(data?.error || 'Falha ao executar backup');
      setResult(data);
      const r = data.resultados || {};
      toast.success(
        `Backup concluído: ${r.enviado || 0} enviados · ${r.ja_sincronizado || 0} já existiam · ${r.erro || 0} erros.`
      );
    } catch (e) {
      toast.error('Erro ao garantir arquivos: ' + (e?.message || 'desconhecido'));
    } finally {
      setLoading(false);
    }
  }

  // Deriva lista de NFs a partir de data.logs (formato do backupDiarioNFsDrive)
  const logs = Array.isArray(result?.logs) ? result.logs : [];
  const stats = {
    enviados: result?.resultados?.enviado ?? 0,
    existiam: result?.resultados?.ja_sincronizado ?? 0,
    erros: result?.resultados?.erro ?? 0,
    invalidas: result?.resultados?.data_invalida ?? 0,
    semArq: result?.resultados?.sem_arquivos ?? 0,
  };

  if (!visible) return null;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
            <CloudUpload className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900">Backup Drive Concluído</h3>
            <p className="text-xs text-gray-500">
              Garante que o par PDF + XML de cada NF aprovada/paga esteja na pasta mensal MM-YYYY do Drive.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          disabled={loading}
          onClick={garantir}
          className="gap-2 bg-emerald-600 text-white hover:bg-emerald-700"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CloudUpload className="h-4 w-4" />}
          {loading ? 'Enviando...' : 'Garantir arquivos no Drive'}
        </Button>
      </div>

      {result && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <MiniStat label="Enviados" value={stats.enviados} tone="text-emerald-700 bg-emerald-50 border-emerald-200" />
            <MiniStat label="Já existiam" value={stats.existiam} tone="text-blue-700 bg-blue-50 border-blue-200" />
            <MiniStat label="Erros" value={stats.erros} tone="text-red-700 bg-red-50 border-red-200" />
            <MiniStat label="Data inválida" value={stats.invalidas} tone="text-amber-700 bg-amber-50 border-amber-200" />
            <MiniStat label="Sem arquivos" value={stats.semArq} tone="text-gray-700 bg-gray-50 border-gray-200" />
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <span>
              {(result.total_processadas ?? 0)} processadas · {result.execution_ms ?? 0}ms · {fmtBR(result.backup_at)}
            </span>
            <a href={FOLDER_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:underline">
              <FolderGit className="h-3.5 w-3.5" /> Pasta raiz do backup
            </a>
          </div>

          {logs.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-lg border border-gray-200">
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium">Fornecedor / NF</th>
                      <th className="px-2 py-1.5 text-left font-medium">Mês</th>
                      <th className="px-2 py-1.5 text-center font-medium">PDF</th>
                      <th className="px-2 py-1.5 text-center font-medium">XML</th>
                      <th className="px-2 py-1.5 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {logs.map((l) => (
                      <NFRow key={l.id} l={l} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {logs.length === 0 && (
            <div className="mt-3 rounded-lg border border-dashed border-gray-200 bg-gray-50 p-4 text-center text-xs text-gray-500">
              Nenhuma NF precisou de envio — todas já estão sincronizadas no Drive.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function NFRow({ l }) {
  const detalhes = Array.isArray(l.detalhes) ? l.detalhes : [];
  const temPdf = detalhes.some((d) => /^PDF:/.test(d) || /PDF/.test(d));
  const temXml = detalhes.some((d) => /^XML:/.test(d));
  const erroPdf = detalhes.some((d) => /ERRO PDF|ERRO XML/i.test(d));
  const mes = (l.mes || extrairMesDeDetalhes(detalhes)) || '';

  let tone = 'bg-gray-100 text-gray-600';
  let statusText = l.status || '—';
  if (l.status === 'enviado') { tone = 'bg-emerald-100 text-emerald-700'; statusText = 'Enviado'; }
  else if (l.status === 'ja_sincronizado') { tone = 'bg-blue-100 text-blue-700'; statusText = 'Já existia'; }
  else if (l.status === 'erro') { tone = 'bg-red-100 text-red-700'; statusText = 'Erro'; }
  else if (l.status === 'data_invalida') { tone = 'bg-amber-100 text-amber-700'; statusText = 'Data inválida'; }

  return (
    <tr className="hover:bg-gray-50">
      <td className="px-2 py-1.5">
        <div className="font-medium text-gray-800 truncate max-w-[240px]">
          {l.fornecedor || l.descricao || l.id?.slice(0, 10)}
        </div>
        <div className="text-gray-400">{l.nf_numero || '—'}</div>
      </td>
      <td className="px-2 py-1.5 text-gray-700">{mes || '—'}</td>
      <td className="px-2 py-1.5 text-center">
        <IconOk ok={temPdf} err={erroPdf} kind="pdf" />
      </td>
      <td className="px-2 py-1.5 text-center">
        <IconOk ok={temXml} kind="xml" />
      </td>
      <td className="px-2 py-1.5 text-center">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${tone}`}>
          {statusText}
        </span>
      </td>
    </tr>
  );
}

function IconOk({ ok, err, kind }) {
  if (ok) {
    return kind === 'pdf'
      ? <FileText className="mx-auto h-4 w-4 text-emerald-600" />
      : <FileCode2 className="mx-auto h-4 w-4 text-emerald-600" />;
  }
  if (err) return <AlertTriangle className="mx-auto h-4 w-4 text-red-500" />;
  return <span className="text-gray-300">—</span>;
}

function MiniStat({ label, value, tone }) {
  return (
    <div className={`rounded-lg border px-2 py-1.5 text-center ${tone}`}>
      <div className="text-lg font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide">{label}</div>
    </div>
  );
}

function extrairMesDeDetalhes(detalhes) {
  for (const d of detalhes) {
    const m = String(d).match(/\b(\d{2}-\d{4})\b/);
    if (m) return m[1];
  }
  return '';
}