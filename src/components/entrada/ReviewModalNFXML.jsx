import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { Loader2, FileText } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function ReviewModalNFXML({ intake, onClose, onSaved }) {
  const { toast } = useToast();
  const ia = intake?.resultado_ia || {};
  const [linking, setLinking] = useState(true);
  const alreadyProcessedRef = useRef(false);

  useEffect(() => {
    if (!intake?.id || alreadyProcessedRef.current) return;

    alreadyProcessedRef.current = true;

    async function autoLinkXML() {
      setLinking(true);

      try {
        let pdfs = [];

        if (ia?.nf_numero) {
          const allAttachments = await base44.entities.Attachment.filter(
            { nf_numero: ia.nf_numero },
            '-created_date',
            50
          );

          pdfs = (allAttachments || []).filter(
            (a) => a.nf_tipo_documento === 'pdf_nf'
          );
        }

        if (pdfs.length === 0) {
          const docIntakes = await base44.entities.DocumentIntake.filter(
            {
              tipo_detectado: 'NOTA_FISCAL_PDF',
              status_registro: 'ATIVO'
            },
            '-created_date',
            10
          );

          for (const doc of docIntakes || []) {
            if (!doc.entidade_destino_id) continue;

            try {
              const pdfAttachment = await base44.entities.Attachment.get(
                doc.entidade_destino_id
              );

              if (pdfAttachment?.nf_tipo_documento === 'pdf_nf') {
                pdfs = [pdfAttachment];
                break;
              }
            } catch (err) {
              console.warn('PDF Attachment não encontrado:', err?.message || err);
            }
          }
        }

        const pdfAttachment = pdfs[0] || null;

        const xmlAttachment = await base44.entities.Attachment.create({
          report_id: pdfAttachment?.report_id || '',
          file_name: intake.file_name_original,
          file_type: intake.mime_type,
          file_url: intake.arquivo_original_url,
          description: pdfAttachment
            ? `NF ${ia?.nf_numero || ''} - ${ia?.nf_emitente_nome || ''} (XML vinculado ao PDF)`
            : `NF ${ia?.nf_numero || ''} - ${ia?.nf_emitente_nome || ''} (XML sem PDF correspondente)`,
          nf_categoria: 'nota_fiscal',
          nf_numero: ia?.nf_numero || '',
          nf_valor_total: ia?.nf_valor_total || null,
          nf_data_emissao: ia?.nf_data_emissao || '',
          nf_emitente_nome: ia?.nf_emitente_nome || '',
          nf_emitente_cpf_cnpj: ia?.nf_emitente_cpf_cnpj || '',
          nf_tipo_documento: 'xml_nf',
          nf_nome_original: intake.file_name_original,
          nf_status_leitura: 'lido_com_sucesso',
          nf_revisado: false,
          nf_pdf_attachment_id: pdfAttachment?.id || '',
          nf_xml_sem_pdf: !pdfAttachment,
          backup_done: false
        });

        await base44.entities.DocumentIntake.update(intake.id, {
          status_processamento: 'APROVADO',
          entidade_destino: 'Attachment',
          entidade_destino_id: xmlAttachment.id,
          revisado_pelo_usuario: true,
          erros_validacao: pdfAttachment
            ? []
            : ['XML salvo sem PDF correspondente. Vinculação manual poderá ser feita depois.']
        });

        toast({
          title: pdfAttachment
            ? '✅ XML vinculado ao PDF com sucesso.'
            : '⚠️ XML salvo sem PDF correspondente.',
          description: pdfAttachment
            ? 'Documento registrado em Attachment.'
            : 'O arquivo foi preservado e poderá ser vinculado depois.',
          duration: 3000
        });

        setTimeout(() => {
          onSaved?.();
          onClose?.();
        }, 3000);
      } catch (e) {
        toast({
          title: 'Erro ao processar XML',
          description: e?.message || 'Falha inesperada ao salvar o XML.',
          variant: 'destructive',
          duration: 3000
        });

        setTimeout(() => {
          onClose?.();
        }, 3000);
      } finally {
        setLinking(false);
      }
    }

    autoLinkXML();
  }, [intake?.id]);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <div className="flex flex-col items-center justify-center py-8 gap-3">
          {linking ? (
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          ) : (
            <FileText className="w-8 h-8 text-slate-500" />
          )}
          <p className="text-sm font-medium text-slate-700">
            {linking ? 'Processando XML da nota fiscal...' : 'Finalizando...'}
          </p>
          <p className="text-xs text-slate-500 text-center">
            O XML será salvo mesmo sem PDF correspondente.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
