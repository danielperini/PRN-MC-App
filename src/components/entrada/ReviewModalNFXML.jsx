import React, { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { FileText, Loader2, LinkIcon, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

function normalizeText(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function buildNFDescription(ia, tipo) {
  const numero = ia?.nf_numero ? `NF ${ia.nf_numero}` : 'Nota Fiscal';
  const emitente = ia?.nf_emitente_nome ? ` - ${ia.nf_emitente_nome}` : '';
  return `${numero}${emitente} (${tipo})`;
}

export default function ReviewModalNFXML({ intake, onClose, onSaved }) {
  const { toast } = useToast();
  const ia = intake?.resultado_ia || {};

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pdfs, setPdfs] = useState([]);
  const [selectedPdfId, setSelectedPdfId] = useState('');

  const nfNumero = ia?.nf_numero || '';
  const nfEmitente = ia?.nf_emitente_nome || '';
  const nfValor = ia?.nf_valor_total || null;

  const selectedPdf = useMemo(
    () => pdfs.find((pdf) => pdf.id === selectedPdfId) || null,
    [pdfs, selectedPdfId]
  );

  useEffect(() => {
    let mounted = true;

    async function loadPdfCandidates() {
      setLoading(true);

      try {
        let candidates = [];

        if (nfNumero) {
          const attachmentsByNF = await base44.entities.Attachment.filter(
            { nf_numero: nfNumero },
            '-created_date',
            50
          );

          candidates = [
            ...candidates,
            ...(attachmentsByNF || []).filter((a) => {
              const type = normalizeText(a.file_type || a.mime_type || a.file_name);
              return (
                a.nf_tipo_documento === 'pdf_nf' ||
                type.includes('pdf') ||
                normalizeText(a.file_name).endsWith('.pdf')
              );
            })
          ];
        }

        if (intake?.grupo_upload_id) {
          const groupIntakes = await base44.entities.DocumentIntake.filter(
            {
              grupo_upload_id: intake.grupo_upload_id,
              status_registro: 'ATIVO'
            },
            '-created_date',
            50
          );

          for (const doc of groupIntakes || []) {
            if (!doc?.entidade_destino_id || doc.id === intake.id) continue;

            const isPdfIntake =
              doc.tipo_detectado === 'NOTA_FISCAL_PDF' ||
              normalizeText(doc.mime_type).includes('pdf') ||
              normalizeText(doc.file_name_original).endsWith('.pdf');

            if (!isPdfIntake) continue;

            try {
              const attachment = await base44.entities.Attachment.get(doc.entidade_destino_id);
              if (attachment) candidates.push(attachment);
            } catch (err) {
              console.warn('PDF do mesmo lote não encontrado:', err?.message || err);
            }
          }
        }

        if (candidates.length === 0) {
          const recentPdfIntakes = await base44.entities.DocumentIntake.filter(
            {
              tipo_detectado: 'NOTA_FISCAL_PDF',
              status_registro: 'ATIVO'
            },
            '-created_date',
            20
          );

          for (const doc of recentPdfIntakes || []) {
            if (!doc?.entidade_destino_id) continue;

            try {
              const attachment = await base44.entities.Attachment.get(doc.entidade_destino_id);
              if (attachment) candidates.push(attachment);
            } catch (err) {
              console.warn('PDF recente não encontrado:', err?.message || err);
            }
          }
        }

        const unique = [];
        const seen = new Set();

        for (const item of candidates) {
          if (!item?.id || seen.has(item.id)) continue;
          seen.add(item.id);
          unique.push(item);
        }

        if (!mounted) return;

        setPdfs(unique);
        if (unique.length > 0) setSelectedPdfId(unique[0].id);
      } catch (e) {
        toast({
          title: 'Erro ao buscar PDFs',
          description: e?.message || 'Não foi possível carregar os PDFs candidatos.',
          variant: 'destructive',
          duration: 3000
        });
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadPdfCandidates();

    return () => {
      mounted = false;
    };
  }, [intake?.id, intake?.grupo_upload_id]);

  async function handleApproveAndLink() {
    setSaving(true);

    try {
      const pdfAttachment = selectedPdf || null;

      const xmlAttachment = await base44.entities.Attachment.create({
        report_id: pdfAttachment?.report_id || '',
        file_name: intake.file_name_original,
        file_type: intake.mime_type,
        file_url: intake.arquivo_original_url,
        description: pdfAttachment
          ? buildNFDescription(ia, 'XML vinculado ao PDF')
          : buildNFDescription(ia, 'XML sem PDF vinculado'),

        nf_categoria: 'nota_fiscal',
        nf_numero: nfNumero,
        nf_valor_total: nfValor,
        nf_data_emissao: ia?.nf_data_emissao || '',
        nf_emitente_nome: nfEmitente,
        nf_emitente_cpf_cnpj: ia?.nf_emitente_cpf_cnpj || '',
        nf_tipo_documento: 'xml_nf',
        nf_nome_original: intake.file_name_original,
        nf_status_leitura: 'lido_com_sucesso',
        nf_revisado: true,
        nf_pdf_attachment_id: pdfAttachment?.id || '',
        nf_xml_sem_pdf: !pdfAttachment,
        backup_done: false
      });

      if (pdfAttachment?.id) {
        await base44.entities.Attachment.update(pdfAttachment.id, {
          description: buildNFDescription(ia, 'PDF vinculado ao XML'),
          nf_categoria: 'nota_fiscal',
          nf_numero: nfNumero || pdfAttachment.nf_numero || '',
          nf_valor_total: nfValor || pdfAttachment.nf_valor_total || null,
          nf_data_emissao: ia?.nf_data_emissao || pdfAttachment.nf_data_emissao || '',
          nf_emitente_nome: nfEmitente || pdfAttachment.nf_emitente_nome || '',
          nf_emitente_cpf_cnpj:
            ia?.nf_emitente_cpf_cnpj || pdfAttachment.nf_emitente_cpf_cnpj || '',
          nf_tipo_documento: 'pdf_nf',
          nf_xml_attachment_id: xmlAttachment.id,
          nf_revisado: true,
          nf_status_leitura: pdfAttachment.nf_status_leitura || 'lido_com_sucesso'
        });
      }

      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'APROVADO',
        entidade_destino: 'Attachment',
        entidade_destino_id: xmlAttachment.id,
        revisado_pelo_usuario: true,
        erros_validacao: pdfAttachment
          ? []
          : ['XML aprovado sem PDF correspondente. Vinculação manual poderá ser feita depois.']
      });

      toast({
        title: pdfAttachment
          ? '✅ XML aprovado e vinculado ao PDF.'
          : '⚠️ XML aprovado sem PDF.',
        description: pdfAttachment
          ? 'PDF e XML foram associados na base de documentos.'
          : 'O XML foi salvo e poderá ser vinculado depois.',
        duration: 3000
      });

      setTimeout(() => {
        onSaved?.();
        onClose?.();
      }, 3000);
    } catch (e) {
      toast({
        title: 'Erro ao aprovar XML',
        description: e?.message || 'Falha ao vincular o XML à nota fiscal.',
        variant: 'destructive',
        duration: 3000
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-full">
        <DialogHeader>
          <DialogTitle>Vincular XML à Nota Fiscal em PDF</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border bg-slate-50 p-3 text-sm">
            <div className="flex items-start gap-2">
              <FileText className="mt-0.5 h-4 w-4 text-slate-500" />
              <div>
                <p className="font-medium text-slate-800">
                  {nfNumero ? `NF ${nfNumero}` : 'XML de Nota Fiscal'}
                </p>
                <p className="text-slate-500">{nfEmitente || 'Emitente não identificado'}</p>
                {nfValor ? (
                  <p className="text-slate-500">
                    Valor: R$ {Number(nfValor).toLocaleString('pt-BR', {
                      minimumFractionDigits: 2
                    })}
                  </p>
                ) : null}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Buscando PDFs enviados junto...
            </div>
          ) : pdfs.length > 0 ? (
            <div className="space-y-2">
              <p className="text-sm font-medium text-slate-700">
                Selecione o PDF correspondente:
              </p>

              <div className="space-y-2 max-h-56 overflow-auto pr-1">
                {pdfs.map((pdf) => (
                  <button
                    key={pdf.id}
                    type="button"
                    onClick={() => setSelectedPdfId(pdf.id)}
                    className={`w-full rounded-lg border p-3 text-left text-sm transition ${
                      selectedPdfId === pdf.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="mt-0.5 h-4 w-4 text-slate-500" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium text-slate-800">
                          {pdf.file_name || 'PDF sem nome'}
                        </p>
                        <p className="truncate text-xs text-slate-500">
                          {pdf.nf_numero ? `NF ${pdf.nf_numero}` : 'PDF candidato'}
                          {pdf.nf_emitente_nome ? ` — ${pdf.nf_emitente_nome}` : ''}
                        </p>
                      </div>
                      {selectedPdfId === pdf.id ? (
                        <CheckCircle2 className="h-4 w-4 text-blue-600" />
                      ) : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              <div className="flex gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-medium">Nenhum PDF correspondente encontrado.</p>
                  <p className="text-xs">
                    O XML poderá ser aprovado agora e vinculado manualmente depois.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose} disabled={saving}>
              Cancelar
            </Button>

            <Button onClick={handleApproveAndLink} disabled={saving || loading}>
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : selectedPdf ? (
                <>
                  <LinkIcon className="mr-2 h-4 w-4" />
                  Aprovar e vincular ao PDF
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Aprovar XML sem PDF
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
