import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { FileText, Loader2, LinkIcon, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function ReviewModalNFXML({ intake, onClose, onSaved }) {
  const { toast } = useToast();
  const ia = intake.resultado_ia || {};
  const [linking, setLinking] = useState(false);

  // Auto-link quando modal abre
  useEffect(() => {
    async function autoLinkXML() {
      setLinking(true);
      try {
        // Busca PDF correspondente pelo número da NF (mais flexível)
        let pdfs = [];
        if (ia.nf_numero) {
          const allAttachments = await base44.entities.Attachment.filter(
            { nf_numero: ia.nf_numero },
            '-created_date',
            50
          );
          pdfs = (allAttachments || []).filter(a => a.nf_tipo_documento === 'pdf_nf');
        }
        
        // Se não encontrou, tenta buscar o attachment mais recente do DocumentIntake do PDF
        if (pdfs.length === 0) {
          const docIntakes = await base44.entities.DocumentIntake.filter(
            { tipo_detectado: 'NOTA_FISCAL_PDF' },
            '-created_date',
            1
          );
          if (docIntakes && docIntakes.length > 0 && docIntakes[0].entidade_destino_id) {
            const pdfAttachment = await base44.entities.Attachment.get(docIntakes[0].entidade_destino_id);
            if (pdfAttachment) pdfs = [pdfAttachment];
          }
        }

        if (pdfs.length === 0) {
          toast({ title: 'Nenhum PDF correspondente encontrado.', variant: 'destructive' });
          setTimeout(onClose, 3000);
          return;
        }

        const pdfAttachment = pdfs[0];
        
        // Vincula XML ao mesmo relatório do PDF
        await base44.entities.Attachment.create({
          report_id: pdfAttachment.report_id || '',
          file_name: intake.file_name_original,
          file_type: intake.mime_type,
          file_url: intake.arquivo_original_url,
          description: `NF ${ia.nf_numero} - ${ia.nf_emitente_nome} (XML)`,
          nf_numero: ia.nf_numero,
          nf_valor_total: ia.nf_valor_total,
          nf_data_emissao: ia.nf_data_emissao,
          nf_emitente_nome: ia.nf_emitente_nome,
          nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj,
          nf_tipo_documento: 'xml_nf',
          nf_nome_original: intake.file_name_original,
          nf_status_leitura: 'lido_com_sucesso',
          nf_revisado: false,
        });

        // Atualiza DocumentIntake
        await base44.entities.DocumentIntake.update(intake.id, {
          status_processamento: 'APROVADO',
          entidade_destino: 'Attachment',
          revisado_pelo_usuario: true,
        });

        toast({ title: '✅ XML vinculado ao PDF com sucesso!' });
        setTimeout(() => {
          onSaved();
          onClose();
        }, 3000);
      } catch (e) {
        toast({ title: 'Erro ao vincular', description: e.message, variant: 'destructive' });
        setTimeout(onClose, 3000);
      }
    }

    autoLinkXML();
  }, [ia, intake.id, onClose, onSaved, toast]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm font-medium text-slate-700">Vinculando XML ao PDF...</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}