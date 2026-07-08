import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Loader2, Download, FileSpreadsheet, X, HardDrive, ExternalLink, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v);
}

export default function RelatorioMensalConsolidadoDialog({ isOpen, onClose }) {
  const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
  const currentYear = String(new Date().getFullYear());
  const [mes, setMes] = useState(currentMonth);
  const [ano, setAno] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [uploadingDrive, setUploadingDrive] = useState(false);
  const [driveResult, setDriveResult] = useState(null);

  const meses = [
    { value: '01', label: 'Janeiro' },
    { value: '02', label: 'Fevereiro' },
    { value: '03', label: 'Março' },
    { value: '04', label: 'Abril' },
    { value: '05', label: 'Maio' },
    { value: '06', label: 'Junho' },
    { value: '07', label: 'Julho' },
    { value: '08', label: 'Agosto' },
    { value: '09', label: 'Setembro' },
    { value: '10', label: 'Outubro' },
    { value: '11', label: 'Novembro' },
    { value: '12', label: 'Dezembro' }
  ];

  const anos = ['2025', '2026', '2027'];

  const gerar = useCallback(async () => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const res = await base44.functions.invoke('gerarRelatorioMensalConsolidadoNF', { mes, ano });
      const result = res?.data || res;
      if (result?.success) {
        setData(result);
      } else {
        setError(result?.error || 'Erro ao gerar relatório.');
      }
    } catch (err) {
      setError(err?.message || 'Erro de conexão.');
    } finally {
      setLoading(false);
    }
  }, [mes, ano]);

  useEffect(() => {
    if (isOpen) {
      setData(null);
      setError(null);
      setDriveResult(null);
    }
  }, [isOpen]);

  const enviarParaDrive = useCallback(async () => {
    if (!data?.relatorio) return;
    setUploadingDrive(true);
    setDriveResult(null);
    try {
      const res = await base44.functions.invoke('exportarRelatorioConsolidadoParaDrive', {
        mes,
        ano,
        relatorio: data.relatorio,
        mes_extenso: data.mes_extenso,
        count_geral: data.count_geral,
        total_geral_fmt: data.total_geral_fmt
      });
      const result = res?.data || res;
      if (result?.success) {
        setDriveResult(result);
        toast.success(`Relatório salvo no Drive: "${result.file_name}"`);
      } else {
        toast.error(result?.error || 'Erro ao enviar para o Drive.');
      }
    } catch (err) {
      toast.error(err?.message || 'Erro ao enviar para o Drive.');
    } finally {
      setUploadingDrive(false);
    }
  }, [data, mes, ano]);

  const exportarCSV = () => {
    if (!data?.relatorio) return;
    const linhas = ['Museu;Natureza da Despesa;NF;Fornecedor;Descrição;Valor;Meta;Rubrica'];
    for (const centro of data.relatorio) {
      for (const nat of (centro.naturezas || [])) {
        for (const item of (nat.itens || [])) {
          linhas.push([
            centro.centro_custo,
            nat.natureza,
            item.nf_numero,
            `"${item.fornecedor}"`,
            `"${item.descricao}"`,
            item.valor.toFixed(2).replace('.', ','),
            item.meta,
            `"${item.rubrica}"`
          ].join(';'));
        }
      }
    }
    const csv = '\uFEFF' + linhas.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_consolidado_nf_${mes}_${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Relatório Mensal Consolidado de NF</DialogTitle>
          <DialogDescription>
            Agrupamento de notas fiscais aprovadas por museu e natureza de despesa.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-end gap-3 py-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Mês</label>
            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {meses.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Ano</label>
            <Select value={ano} onValueChange={setAno}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anos.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={gerar} disabled={loading} className="bg-black text-white hover:bg-gray-800">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileSpreadsheet className="mr-2 h-4 w-4" />}
            {loading ? 'Gerando...' : 'Gerar Relatório'}
          </Button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {data && (
          <div className="space-y-6">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700">
                {data.mes_extenso} — {data.count_geral} notas fiscais — Total: <span className="text-lg font-bold text-black">{data.total_geral_fmt}</span>
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={exportarCSV} className="gap-2">
                  <Download className="h-4 w-4" />
                  Exportar CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={enviarParaDrive}
                  disabled={uploadingDrive}
                  className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  {uploadingDrive
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <HardDrive className="h-4 w-4" />}
                  {uploadingDrive ? 'Enviando para Drive...' : 'Salvar no Google Drive'}
                </Button>
              </div>

              {driveResult && (
                <a
                  href={driveResult.drive_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-700 hover:bg-green-100"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Abrir no Drive
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>

            {data.relatorio.map((centro) => (
              <div key={centro.centro_custo} className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-50 px-5 py-3 flex items-center justify-between border-b border-gray-200">
                  <h3 className="text-base font-bold text-gray-900">{centro.centro_custo}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-gray-500">{centro.count} NF{centro.count !== 1 ? 's' : ''}</span>
                    <span className="text-base font-bold text-black">{centro.total_fmt}</span>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {centro.naturezas.map((nat) => (
                    <div key={nat.natureza} className="px-5 py-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="inline-flex rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                          {nat.natureza}
                        </span>
                        <span className="text-sm font-semibold text-gray-800">
                          {nat.count} NF{nat.count !== 1 ? 's' : ''} — {nat.total_fmt}
                        </span>
                      </div>
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="border-b border-gray-100 text-left text-gray-400">
                            <th className="py-1 font-medium">NF</th>
                            <th className="py-1 font-medium">Fornecedor</th>
                            <th className="py-1 font-medium">Descrição</th>
                            <th className="py-1 font-medium">Meta</th>
                            <th className="py-1 font-medium">Rubrica</th>
                            <th className="py-1 text-right font-medium">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nat.itens.map((item, idx) => (
                            <tr key={idx} className="border-b border-gray-50 text-gray-700">
                              <td className="py-1.5 pr-2 font-mono text-gray-500">{item.nf_numero}</td>
                              <td className="py-1.5 pr-2 max-w-[140px] truncate">{item.fornecedor}</td>
                              <td className="py-1.5 pr-2 max-w-[200px] truncate">{item.descricao}</td>
                              <td className="py-1.5 pr-2">{item.meta || '—'}</td>
                              <td className="py-1.5 pr-2 max-w-[160px] truncate">{item.rubrica || '—'}</td>
                              <td className="py-1.5 text-right font-medium tabular-nums">{item.valor_fmt}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {data.relatorio.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
                <p className="text-gray-400">Nenhuma nota fiscal aprovada neste período.</p>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}