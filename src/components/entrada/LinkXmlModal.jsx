import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Link2 } from 'lucide-react';

export default function LinkXmlModal({ xmlIntake, pdfsDisponiveis, onConfirm, onClose }) {
  const xmlNome = xmlIntake?.file_name_original || 'XML';

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-blue-600" />
            Vincular XML ao PDF
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600">
            <span className="font-medium">XML:</span> {xmlNome}
          </div>

          {pdfsDisponiveis.length === 0 ? (
            <div className="text-center py-6 text-slate-500 text-sm">
              Nenhum PDF disponível para vínculo. <br />
              Faça o upload do PDF correspondente antes de vincular.
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-slate-600 font-medium">Escolha o PDF desta nota fiscal:</p>
              {pdfsDisponiveis.map((pdf) => {
                const ia = pdf.resultado_ia || {};
                const nome = pdf.file_name_final || pdf.file_name_original || 'Arquivo PDF';
                const emitente = ia.nf_emitente_nome || '';
                const valor = ia.nf_valor_total ? `R$ ${Number(ia.nf_valor_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '';

                return (
                  <button
                    key={pdf.id}
                    onClick={() => onConfirm(pdf)}
                    className="w-full flex items-start gap-3 text-left border border-slate-200 rounded-lg px-3 py-2.5 hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <FileText className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{nome}</p>
                      <p className="text-xs text-slate-500">
                        {[emitente, valor].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}