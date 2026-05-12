import React, { useState } from 'react';
import CoordReviewModalNF from './CoordReviewModalNF';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { FileText, Loader2, ShieldCheck, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function isDocumentoAuxiliar(intake) {
  const ia = intake?.resultado_ia || {};
  const haystack = normalizeText([
    intake?.file_name_original,
    intake?.file_name_final,
    intake?.tipo_detectado,
    intake?.classificacao,
    intake?.categoria,
    ia?.tipo_documento,
    ia?.classificacao,
    ia?.categoria,
    ia?.descricao_servico,
    ia?.descricao,
    ia?.texto_extraido,
  ].filter(Boolean).join(' '));

  const hasAuxiliarKeyword =
    haystack.includes('recibo') ||
    haystack.includes('comprovante') ||
    haystack.includes('comprovacao') ||
    haystack.includes('pagamento') ||
    haystack.includes('deposito') ||
    haystack.includes('pix') ||
    haystack.includes('transferencia') ||
    haystack.includes('boleto');

  const hasNotaKeyword =
    haystack.includes('nota fiscal') ||
    haystack.includes('nfse') ||
    haystack.includes('nfs-e') ||
    haystack.includes('danfe') ||
    haystack.includes('xml') ||
    intake?.tipo_detectado === 'NOTA_FISCAL_PDF' ||
    intake?.tipo_detectado === 'NOTA_FISCAL_XML';

  return hasAuxiliarKeyword && !hasNotaKeyword;
}

export default function ReviewModalNF(props) {
  const { intake, onClose, onSaved } = props;
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);

  if (!isDocumentoAuxiliar(intake)) {
    return <CoordReviewModalNF {...props} />;
  }

  async function marcarComoAnexoAuxiliar() {
    if (!intake?.id) return;

    setSaving(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        tipo_detectado: 'DOCUMENTO_COMPLEMENTAR',
        categoria: 'comprovante_recibo',
        status_processamento: 'APROVADO',
        ocultar_entrada_unica: true,
        nao_gerar_solicitacao_financeira: true,
        nao_debitar_rubrica: true,
        observacao_sistema: 'Documento auxiliar vinculado ao processo. Não gera PurchaseRequest e não debita rubrica.',
      });

      toast({
        title: 'Documento auxiliar registrado sem débito financeiro.',
        description: 'Recibo/comprovante não soma no utilizado. O valor permanece debitado apenas pela nota fiscal.',
        duration: 4000,
      });

      await onSaved?.();
      onClose?.();
    } catch (error) {
      toast({
        title: 'Erro ao registrar documento auxiliar',
        description: error?.message || 'Falha ao atualizar documento.',
        variant: 'destructive',
        duration: 4000,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-green-600" />
            Documento auxiliar detectado
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-xl border border-green-100 bg-green-50 p-4 text-sm text-green-800">
            Este arquivo parece ser recibo, comprovante ou PDF auxiliar da nota fiscal.
            Ele será registrado como anexo complementar e não criará nova solicitação financeira.
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-700 flex items-start gap-2">
            <FileText className="w-4 h-4 mt-0.5 text-slate-500" />
            <div className="min-w-0">
              <p className="font-medium truncate">{intake?.file_name_original || intake?.file_name_final || 'Documento'}</p>
              <p className="text-xs text-slate-500 mt-1">
                Regra financeira: o valor deve ser somado ao utilizado apenas uma vez, pela NF principal.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              <X className="w-4 h-4 mr-1" />
              Cancelar
            </Button>
            <Button type="button" onClick={marcarComoAnexoAuxiliar} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              Registrar sem débito
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
