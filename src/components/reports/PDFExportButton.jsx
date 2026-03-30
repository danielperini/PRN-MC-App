import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { FileDown, Loader, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toastMessages } from '@/lib/toastMessages';
import PhotoSelectorModal from './PhotoSelectorModal';

export default function PDFExportButton({ reportId, reportProtocolo, disabled = false }) {
  const [isExporting, setIsExporting] = useState(false);
  const [showPhotoSelector, setShowPhotoSelector] = useState(false);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState([]);

  const handleExport = async () => {
    try {
      setIsExporting(true);

      const response = await base44.functions.invoke('generateReportPDF', {
        reportId,
        coverPhotoIds: selectedPhotoIds
      });

      if (response.data) {
        const blob = new Blob([response.data], { type: 'application/pdf' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `relatorio-${reportProtocolo}.pdf`;
        document.body.appendChild(link);
        link.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(link);

        toastMessages.pdfGenerateSuccess();
        setSelectedPhotoIds([]);
      }
    } catch (error) {
      console.error('Erro ao exportar PDF:', error);
      toastMessages.pdfGenerateFailed(error?.message);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Button
          onClick={() => setShowPhotoSelector(true)}
          disabled={disabled}
          variant="outline"
          className="gap-2"
          title="Adicionar fotos ao cabeçalho">
          <Image className="w-4 h-4" />
          {selectedPhotoIds.length > 0 ? `${selectedPhotoIds.length} foto(s)` : 'Adicionar Fotos'}
        </Button>

        <Button
          onClick={handleExport}
          disabled={disabled || isExporting}
          className="gap-2"
        >
          {isExporting ? (
            <>
              <Loader className="w-4 h-4 animate-spin" />
              Gerando PDF...
            </>
          ) : (
            <>
              <FileDown className="w-4 h-4" />
              Exportar PDF
            </>
          )}
        </Button>
      </div>

      <PhotoSelectorModal
        isOpen={showPhotoSelector}
        onClose={() => setShowPhotoSelector(false)}
        reportId={reportId}
        selectedPhotoIds={selectedPhotoIds}
        onSelect={setSelectedPhotoIds} />
      
    </>
  );
}