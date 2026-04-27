import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { FileText, Loader2, LinkIcon, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function ReviewModalNFXML({ intake, onClose, onSaved }) {
  const { toast } = useToast();
  const [linking, setLinking] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [selectedPDFAttachmentId, setSelectedPDFAttachmentId] = useState('');
  const ia = intake.resultado_ia || {};

  // Buscar attachment do PDF correspondente (mesmo NF número)
  useEffect(() => {
    async function findPDFAttachment() {
      try {
        const allAttachments = await base44.entities.Attachment.filter(
          { nf_numero: ia.nf_numero || '' },
          '-created_date',
          50
        );
        const pdfs = (allAttachments || []).filter(a => 
          a.nf_tipo_documento === 'pdf_nf' && a.nf_emitente_cpf_cnpj === ia.nf_emitente_cpf_cnpj
        );
        setAttachments(pdfs);
        if (pdfs.length > 0) {
          setSelectedPDFAttachmentId(pdfs[0].id);
        }
      } catch (e) {
        console.error('Erro ao buscar PDF:', e);
      }
    }
    findPDFAttachment();
  }, [ia.nf_numero, ia.nf_emitente_cpf_cnpj]);

  async function handleLinkToXML() {
    if (!selectedPDFAttachmentId) {
      toast({ title: 'Selecione um arquivo PDF para vincular.', variant: 'destructive' });
      return;
    }

    setLinking(true);
    try {
      // Cria attachment do XML vinculado ao mesmo relatório do PDF
      const pdfAttachment = attachments.find(a => a.id === selectedPDFAttachmentId);
      
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

      // Atualiza status do DocumentIntake
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'APROVADO',
        entidade_destino: 'Attachment',
        revisado_pelo_usuario: true,
      });

      toast({ title: '✅ XML vinculado com sucesso ao PDF.' });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao vincular', description: e.message, variant: 'destructive' });
    } finally {
      setLinking(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-green-500" />
            Vincular XML à Nota Fiscal
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-700">
            O arquivo XML será automaticamente vinculado ao PDF correspondente. Nenhuma revisão necessária.
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700">Informações do XML:</p>
            <div className="bg-slate-50 p-3 rounded-lg space-y-1 text-sm">
              <div><span className="font-medium">NF:</span> {ia.nf_numero}</div>
              <div><span className="font-medium">Valor:</span> R$ {ia.nf_valor_total}</div>
              <div><span className="font-medium">Emitente:</span> {ia.nf_emitente_nome}</div>
            </div>
          </div>

          {attachments.length === 0 ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
              <AlertCircle className="w-4 h-4 inline mr-2" />
              Nenhum PDF correspondente encontrado. Você pode enviar o PDF primeiro.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">PDF correspondente:</p>
              <select 
                value={selectedPDFAttachmentId} 
                onChange={(e) => setSelectedPDFAttachmentId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
              >
                {attachments.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.file_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button 
              onClick={handleLinkToXML}
              disabled={linking || !selectedPDFAttachmentId}
              className="bg-green-600 hover:bg-green-700"
            >
              {linking ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <LinkIcon className="w-4 h-4 mr-2" />}
              Vincular XML
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}