import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { ExternalLink, FileDown, Loader, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { toastMessages } from '@/lib/toastMessages';

const CAMPOS = [
  { id: 'identificacao', label: 'Identificação do Relatório' },
  { id: 'resumo', label: 'Resumo Executivo' },
  { id: 'atividades', label: 'Atividades Realizadas' },
  { id: 'avaliacao', label: 'Avaliação (Pontos, Desafios, Sugestões)' },
  { id: 'oportunidades', label: 'Oportunidades' },
  { id: 'depoimentos', label: 'Depoimentos' },
  { id: 'fotos', label: 'Miniaturas de Fotos' },
];

function normalizePdfBlob(result) {
  if (result instanceof Blob) return result;
  if (result?.blob instanceof Blob) return result.blob;
  if (result?.data instanceof Blob) return result.data;
  if (result instanceof ArrayBuffer) return new Blob([result], { type: 'application/pdf' });
  if (result instanceof Uint8Array) return new Blob([result], { type: 'application/pdf' });

  const payload = result?.data ?? result;
  if (payload instanceof ArrayBuffer) return new Blob([payload], { type: 'application/pdf' });
  if (payload instanceof Uint8Array) return new Blob([payload], { type: 'application/pdf' });

  if (typeof payload === 'string') {
    const base64 = payload.includes(',') ? payload.split(',').pop() : payload;
    try {
      const binary = window.atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
      return new Blob([bytes], { type: 'application/pdf' });
    } catch {
      throw new Error('O gerador retornou um conteúdo de PDF inválido.');
    }
  }

  throw new Error('O gerador não retornou um arquivo PDF válido.');
}

function triggerPdfDownload(url, filename) {
  if (!url) throw new Error('Arquivo PDF indisponível para download.');

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

export default function PDFExportButton({ reportId, reportProtocolo, reportData, disabled = false }) {
  const [showDialog, setShowDialog] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedFields, setSelectedFields] = useState(CAMPOS.map(c => c.id));
  const [assinatura, setAssinatura] = useState('');
  const [generatedPdfUrl, setGeneratedPdfUrl] = useState('');
  const [generatedPdfFilename, setGeneratedPdfFilename] = useState('');

  useEffect(() => () => {
    if (generatedPdfUrl) window.URL.revokeObjectURL(generatedPdfUrl);
  }, [generatedPdfUrl]);

  const toggleField = (id) => {
    setSelectedFields(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const handleExport = async () => {
    try {
      setIsExporting(true);

      const response = await base44.functions.invoke('generateReportPDF', {
        reportId,
        selectedFields,
        assinatura,
      });

      if (response?.data?.error) throw new Error(response.data.error);

      const pdfBlob = normalizePdfBlob(response?.data ?? response);
      if (!(pdfBlob instanceof Blob) || pdfBlob.size <= 0) {
        throw new Error('O PDF foi gerado vazio.');
      }

      const normalizedBlob = pdfBlob.type?.includes('pdf')
        ? pdfBlob
        : new Blob([pdfBlob], { type: 'application/pdf' });

      const filename = `relatorio-${reportProtocolo || reportId}.pdf`;
      const nextUrl = window.URL.createObjectURL(normalizedBlob);

      setGeneratedPdfUrl(previousUrl => {
        if (previousUrl) window.URL.revokeObjectURL(previousUrl);
        return nextUrl;
      });
      setGeneratedPdfFilename(filename);

      console.info('[PDF Mensal] Arquivo preparado', {
        filename,
        size: normalizedBlob.size,
        type: normalizedBlob.type,
        urlCreated: Boolean(nextUrl),
      });

      triggerPdfDownload(nextUrl, filename);
      toastMessages.pdfGenerateSuccess?.();
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      toastMessages.pdfGenerateFailed?.(error?.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleOpenPdf = () => {
    if (!generatedPdfUrl) return;
    const opened = window.open(generatedPdfUrl, '_blank', 'noopener,noreferrer');
    if (!opened) toastMessages.warning?.('O navegador bloqueou a abertura. Use “Baixar PDF”.');
  };

  return (
    <>
      <Button
        onClick={() => setShowDialog(true)}
        disabled={disabled || isExporting}
        className="gap-2"
      >
        {isExporting ? (
          <><Loader className="w-4 h-4 animate-spin" /> Gerando PDF...</>
        ) : (
          <><FileDown className="w-4 h-4" /> Exportar PDF</>
        )}
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" /> Configurar Exportação PDF
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Seções a incluir:</p>
              <div className="space-y-2">
                {CAMPOS.map(campo => (
                  <div key={campo.id} className="flex items-center gap-2">
                    <Checkbox
                      id={campo.id}
                      checked={selectedFields.includes(campo.id)}
                      onCheckedChange={() => toggleField(campo.id)}
                    />
                    <Label htmlFor={campo.id} className="text-sm cursor-pointer">
                      {campo.label}
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t">
              <Label className="text-sm font-medium text-gray-700">
                Assinatura do responsável
              </Label>
              <Input
                className="mt-1"
                placeholder="Nome completo para assinatura"
                value={assinatura}
                onChange={e => setAssinatura(e.target.value)}
              />
              <p className="text-xs text-gray-500 mt-1">
                Após assinar, o PDF deve ser enviado ao coordenador até o dia 15 do mês seguinte ao mês de referência do relatório.
              </p>
            </div>

            {generatedPdfUrl ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                <p className="text-sm font-medium text-green-800">PDF preparado e disponível.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => triggerPdfDownload(generatedPdfUrl, generatedPdfFilename)}
                    className="gap-2"
                  >
                    <FileDown className="h-4 w-4" /> Baixar PDF
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={handleOpenPdf} className="gap-2">
                    <ExternalLink className="h-4 w-4" /> Abrir PDF
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={isExporting}>
              Fechar
            </Button>
            <Button onClick={handleExport} disabled={isExporting || selectedFields.length === 0}>
              {isExporting ? (
                <><Loader className="w-4 h-4 mr-2 animate-spin" /> Gerando...</>
              ) : (
                <><FileDown className="w-4 h-4 mr-2" /> Gerar PDF</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
