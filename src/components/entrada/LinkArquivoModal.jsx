import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { FileText, Link2, CheckCircle2 } from 'lucide-react';

const TIPO_LABEL = {
  NOTA_FISCAL_PDF: 'NF PDF',
  NOTA_FISCAL_XML: 'NF XML',
  RECIBO_PDF: 'Recibo/Comprovante',
  DOCUMENTO_ADMINISTRATIVO: 'Documento',
  OUTRO: 'Outro',
};

function parseValorBR(v) {
  const s = String(v || '0').trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s.replace(',', '.')) || 0;
}

function getValorDisplay(intake) {
  const ia = intake?.resultado_ia || {};
  const valor = ia.nf_valor_total || ia.valor || ia.valor_total || intake?.valor;
  if (!valor) return null;
  const num = parseValorBR(valor);
  if (!num || num <= 0) return null;
  return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
}

export default function LinkArquivoModal({ intake, candidatos = [], onConfirm, onClose }) {
  const [selected, setSelected] = useState(null);

  if (!intake) return null;

  const tipoOrigem = TIPO_LABEL[intake.tipo_detectado] || intake.tipo_detectado || 'Arquivo';
  const fileName = intake.file_name_final || intake.file_name_original || 'Arquivo';

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Link2 className="w-4 h-4" />
            Vincular arquivo manualmente
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-200">
            <p className="text-xs text-gray-500 font-semibold uppercase tracking-wide mb-1">Arquivo origem</p>
            <p className="text-sm font-medium text-black truncate">{fileName}</p>
            <p className="text-xs text-gray-500 mt-0.5">{tipoOrigem}</p>
          </div>

          <div>
            <p className="text-sm font-semibold text-black mb-2">Selecione o arquivo para vincular:</p>
            {candidatos.length === 0 ? (
              <p className="text-sm text-gray-400 italic text-center py-6 border-2 border-dashed border-gray-200 rounded-xl">
                Nenhum arquivo compatível disponível para vínculo.
              </p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {candidatos.map((c) => {
                  const isSelected = selected?.id === c.id;
                  const valor = getValorDisplay(c);
                  const cFileName = c.file_name_final || c.file_name_original || 'Arquivo';
                  const cTipo = TIPO_LABEL[c.tipo_detectado] || c.tipo_detectado || 'Arquivo';

                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelected(c)}
                      className={`w-full text-left border rounded-xl px-4 py-3 flex items-center gap-3 transition-colors ${
                        isSelected
                          ? 'border-black bg-black/5'
                          : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-black truncate">{cFileName}</p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-gray-500">{cTipo}</span>
                          {valor && <span className="text-xs font-semibold text-green-700">{valor}</span>}
                          {c.resultado_ia?.nf_numero && (
                            <span className="text-xs text-gray-400">NF {c.resultado_ia.nf_numero}</span>
                          )}
                        </div>
                      </div>
                      {isSelected && <CheckCircle2 className="w-4 h-4 text-black flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            className="bg-black text-white hover:bg-gray-800"
            disabled={!selected}
            onClick={() => selected && onConfirm(selected)}
          >
            <Link2 className="w-3.5 h-3.5 mr-1.5" />
            Vincular
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}