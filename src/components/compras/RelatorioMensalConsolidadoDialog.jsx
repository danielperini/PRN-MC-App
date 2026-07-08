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
import { Loader2, Download, FileSpreadsheet, HardDrive, ExternalLink, CheckCircle2, FileText, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import jsPDF from 'jspdf';

const MESES = [
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

function fmtBRL(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 }).format(v);
}

function gerarPDF(data, mes, ano) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const mesLabel = MESES.find(m => m.value === mes)?.label || mes;
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 15;
  const contentW = pageW - margin * 2;
  let y = margin;

  // Cabeçalho institucional
  doc.setFillColor(15, 15, 15);
  doc.rect(0, 0, pageW, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('VIADUTO DAS ARTES — MUSEUS CENTRO', pageW / 2, 11, { align: 'center' });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text('Relatório Mensal Consolidado de Notas Fiscais', pageW / 2, 18, { align: 'center' });
  doc.text(`Período: ${mesLabel} de ${ano}`, pageW / 2, 24, { align: 'center' });

  y = 36;

  // Resumo geral
  doc.setFillColor(245, 245, 245);
  doc.roundedRect(margin, y, contentW, 14, 2, 2, 'F');
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`${data.mes_extenso}  •  ${data.count_geral} notas fiscais  •  Total: ${data.total_geral_fmt}`, margin + 4, y + 9);
  y += 20;

  for (const centro of (data.relatorio || [])) {
    // Cabeçalho do centro de custo
    if (y > 260) { doc.addPage(); y = margin; }
    doc.setFillColor(30, 30, 30);
    doc.rect(margin, y, contentW, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(centro.centro_custo.toUpperCase(), margin + 3, y + 5.5);
    doc.text(`${centro.count} NF${centro.count !== 1 ? 's' : ''}  •  ${centro.total_fmt}`, margin + contentW - 3, y + 5.5, { align: 'right' });
    y += 10;

    for (const nat of (centro.naturezas || [])) {
      if (y > 265) { doc.addPage(); y = margin; }
      doc.setFillColor(235, 240, 255);
      doc.rect(margin, y, contentW, 6, 'F');
      doc.setTextColor(40, 60, 160);
      doc.setFontSize(7.5);
      doc.setFont('helvetica', 'bold');
      doc.text(nat.natureza, margin + 3, y + 4.2);
      doc.text(`${nat.count} NF${nat.count !== 1 ? 's' : ''}  •  ${nat.total_fmt}`, margin + contentW - 3, y + 4.2, { align: 'right' });
      y += 8;

      // Cabeçalho da tabela
      doc.setFillColor(250, 250, 250);
      doc.rect(margin, y, contentW, 5, 'F');
      doc.setTextColor(120, 120, 120);
      doc.setFontSize(6.5);
      doc.setFont('helvetica', 'bold');
      const cols = { nf: margin + 2, fornecedor: margin + 22, descricao: margin + 68, meta: margin + 118, rubrica: margin + 140, valor: margin + contentW - 2, data: margin + 168 };
      doc.text('NF', cols.nf, y + 3.5);
      doc.text('Fornecedor', cols.fornecedor, y + 3.5);
      doc.text('Descrição', cols.descricao, y + 3.5);
      doc.text('Meta', cols.meta, y + 3.5);
      doc.text('Rubrica', cols.rubrica, y + 3.5);
      doc.text('Data NF', cols.data, y + 3.5);
      doc.text('Valor', cols.valor, y + 3.5, { align: 'right' });
      y += 6;

      for (const item of (nat.itens || [])) {
        if (y > 270) { doc.addPage(); y = margin; }
        const rowH = 7;
        doc.setFillColor(255, 255, 255);
        doc.rect(margin, y, contentW, rowH, 'F');
        doc.setDrawColor(240, 240, 240);
        doc.line(margin, y + rowH, margin + contentW, y + rowH);

        doc.setTextColor(60, 60, 60);
        doc.setFontSize(6.5);
        doc.setFont('helvetica', 'normal');

        const truncate = (s, max) => {
          const str = String(s || '');
          return str.length > max ? str.slice(0, max - 1) + '…' : str;
        };

        doc.text(truncate(item.nf_numero, 10), cols.nf, y + 4.5);
        doc.text(truncate(item.fornecedor, 26), cols.fornecedor, y + 4.5);
        doc.text(truncate(item.descricao, 30), cols.descricao, y + 4.5);
        doc.text(truncate(item.meta, 12), cols.meta, y + 4.5);
        doc.text(truncate(item.rubrica, 16), cols.rubrica, y + 4.5);
        doc.text(truncate(item.data_emissao || '', 10), cols.data, y + 4.5);
        doc.setFont('helvetica', 'bold');
        doc.text(item.valor_fmt, cols.valor, y + 4.5, { align: 'right' });

        // Links para documentos (indicadores visuais)
        let linkX = cols.nf;
        const links = [];
        if (item.nf_pdf_url || item.nota_fiscal_url) links.push({ label: 'PDF', url: item.nf_pdf_url || item.nota_fiscal_url });
        if (item.nf_xml_url || item.xml_url) links.push({ label: 'XML', url: item.nf_xml_url || item.xml_url });
        if (item.comprovante_url) links.push({ label: 'COMP', url: item.comprovante_url });
        if (item.drive_folder_url || item.drive_pdf_url) links.push({ label: 'DRIVE', url: item.drive_folder_url || item.drive_pdf_url });

        if (links.length > 0) {
          doc.setFontSize(5.5);
          doc.setTextColor(37, 99, 235);
          let lx = cols.nf;
          const lineY = y + rowH - 1;
          for (const lnk of links) {
            doc.textWithLink(lnk.label, lx, lineY, { url: lnk.url });
            lx += doc.getTextWidth(lnk.label) + 2;
          }
          doc.setTextColor(60, 60, 60);
        }

        y += rowH;
      }
      y += 3;
    }
    y += 4;
  }

  // Rodapé
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.setFont('helvetica', 'normal');
    doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} — Viaduto das Artes / Museus Centro`, margin, doc.internal.pageSize.getHeight() - 6);
    doc.text(`Página ${i} de ${pageCount}`, pageW - margin, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
  }

  doc.save(`Relatorio_NF_${mes}_${ano}.pdf`);
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
  const [gerandoPDF, setGerandoPDF] = useState(false);

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
    const linhas = ['Museu;Natureza da Despesa;NF;Fornecedor;Descrição;Valor;Meta;Rubrica;Data Emissão;Link PDF;Link XML;Link Comprovante;Link Drive'];
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
            `"${item.rubrica}"`,
            item.data_emissao || '',
            item.nf_pdf_url || item.nota_fiscal_url || '',
            item.nf_xml_url || item.xml_url || '',
            item.comprovante_url || '',
            item.drive_folder_url || item.drive_pdf_url || ''
          ].join(';'));
        }
      }
    }
    const csv = '\uFEFF' + linhas.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio_nf_${mes}_${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportarPDF = async () => {
    if (!data) return;
    setGerandoPDF(true);
    try {
      gerarPDF(data, mes, ano);
      toast.success('PDF gerado com sucesso!');
    } catch (e) {
      toast.error('Erro ao gerar PDF: ' + e.message);
    } finally {
      setGerandoPDF(false);
    }
  };

  const hasLinks = (item) =>
    item.nf_pdf_url || item.nota_fiscal_url || item.nf_xml_url || item.xml_url || item.comprovante_url || item.drive_folder_url || item.drive_pdf_url;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">Relatório Mensal Consolidado de NF</DialogTitle>
          <DialogDescription>
            Agrupamento de notas fiscais aprovadas por museu e natureza de despesa, com links para documentos.
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
                {MESES.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
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
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Resumo */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-700">
                {data.mes_extenso} — {data.count_geral} notas fiscais — Total:{' '}
                <span className="text-lg font-bold text-black">{data.total_geral_fmt}</span>
              </p>
            </div>

            {/* Botões de exportação */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={exportarCSV} className="gap-2">
                  <Download className="h-4 w-4" />
                  Exportar CSV
                </Button>
                <Button
                  variant="outline"
                  onClick={exportarPDF}
                  disabled={gerandoPDF}
                  className="gap-2 border-gray-800 text-gray-800 hover:bg-gray-50"
                >
                  {gerandoPDF ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  {gerandoPDF ? 'Gerando PDF...' : 'Exportar PDF'}
                </Button>
                <Button
                  variant="outline"
                  onClick={enviarParaDrive}
                  disabled={uploadingDrive}
                  className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
                >
                  {uploadingDrive ? <Loader2 className="h-4 w-4 animate-spin" /> : <HardDrive className="h-4 w-4" />}
                  {uploadingDrive ? 'Enviando...' : 'Salvar no Drive'}
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

            {/* Tabela de dados */}
            {data.relatorio.map((centro) => (
              <div key={centro.centro_custo} className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="bg-gray-900 px-5 py-3 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-white">{centro.centro_custo}</h3>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-300">{centro.count} NF{centro.count !== 1 ? 's' : ''}</span>
                    <span className="text-sm font-bold text-white">{centro.total_fmt}</span>
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
                            <th className="py-1 font-medium">Data</th>
                            <th className="py-1 font-medium">Docs</th>
                            <th className="py-1 text-right font-medium">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {nat.itens.map((item, idx) => (
                            <tr key={idx} className="border-b border-gray-50 text-gray-700 hover:bg-gray-50">
                              <td className="py-1.5 pr-2 font-mono text-gray-500">{item.nf_numero || '—'}</td>
                              <td className="py-1.5 pr-2 max-w-[140px] truncate">{item.fornecedor}</td>
                              <td className="py-1.5 pr-2 max-w-[180px] truncate">{item.descricao}</td>
                              <td className="py-1.5 pr-2 text-gray-500">{item.meta || '—'}</td>
                              <td className="py-1.5 pr-2 max-w-[140px] truncate text-gray-500">{item.rubrica || '—'}</td>
                              <td className="py-1.5 pr-2 whitespace-nowrap text-gray-400">{item.data_emissao || '—'}</td>
                              <td className="py-1.5 pr-2">
                                <div className="flex items-center gap-1">
                                  {(item.nf_pdf_url || item.nota_fiscal_url) && (
                                    <a href={item.nf_pdf_url || item.nota_fiscal_url} target="_blank" rel="noopener noreferrer"
                                      className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-600 hover:bg-gray-200" title="Nota Fiscal PDF">
                                      PDF
                                    </a>
                                  )}
                                  {(item.nf_xml_url || item.xml_url) && (
                                    <a href={item.nf_xml_url || item.xml_url} target="_blank" rel="noopener noreferrer"
                                      className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600 hover:bg-blue-100" title="XML da NF">
                                      XML
                                    </a>
                                  )}
                                  {item.comprovante_url && (
                                    <a href={item.comprovante_url} target="_blank" rel="noopener noreferrer"
                                      className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-600 hover:bg-green-100" title="Comprovante de pagamento">
                                      COMP
                                    </a>
                                  )}
                                  {(item.drive_folder_url || item.drive_pdf_url) && (
                                    <a href={item.drive_folder_url || item.drive_pdf_url} target="_blank" rel="noopener noreferrer"
                                      className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-600 hover:bg-indigo-100" title="Google Drive">
                                      <ExternalLink className="h-2.5 w-2.5 inline" />
                                    </a>
                                  )}
                                  {!hasLinks(item) && <span className="text-gray-300 text-[10px]">—</span>}
                                </div>
                              </td>
                              <td className="py-1.5 text-right font-semibold tabular-nums text-gray-900">{item.valor_fmt}</td>
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