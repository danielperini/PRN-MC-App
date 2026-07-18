import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FileDown, Images, Building2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';

const SECTION_LABELS = {
  MHAB: 'MHAB',
  MIS: 'MIS',
  MUMO: 'MUMO',
  MAP: 'MAP',
  CasaKubitschek: 'Casa Kubitschek',
  CasaDoBalile: 'Casa do Baíle',
  SEM_IDENTIFICACAO: 'Sem identificação',
};

export default function ExportarGaleriaPDFDialog({ open, onClose, fotos, userEmail }) {
  const [email, setEmail] = useState(userEmail || '');
  const [loading, setLoading] = useState(false);

  const museusPresentes = [...new Set(fotos.map(f => f.sectionKey || 'SEM_IDENTIFICACAO'))];

  async function handleExportar() {
    if (!email.trim()) {
      toast.error('Informe um e-mail de destino.');
      return;
    }
    setLoading(true);
    try {
      await base44.functions.invoke('exportarGaleriaPDF', {
        fotos: fotos.map(f => ({
          url: f.fileUrl,
          legenda: f.legenda || f.activityTitulo || f.fileName || '',
          museu: f.sectionKey || 'SEM_IDENTIFICACAO',
          periodo: f.reportMes || '',
        })),
        destinatario: email.trim(),
      });
      toast.success('Exportação em andamento — você receberá o link por e-mail em alguns minutos.');
      onClose();
    } catch (e) {
      toast.error('Erro ao disparar exportação: ' + (e.message || 'tente novamente.'));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Exportar Galeria em PDF
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Resumo */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm text-gray-700">
              <Images className="h-4 w-4 text-gray-400" />
              <span><strong>{fotos.length}</strong> fotos serão incluídas no PDF</span>
            </div>
            <div className="flex items-start gap-2 text-sm text-gray-700">
              <Building2 className="h-4 w-4 text-gray-400 mt-0.5 shrink-0" />
              <div>
                <span className="text-gray-500">Museus incluídos:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {museusPresentes.map(m => (
                    <span key={m} className="rounded-full bg-white border border-gray-200 px-2 py-0.5 text-xs text-gray-700">
                      {SECTION_LABELS[m] || m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* E-mail */}
          <div>
            <Label className="mb-1.5 block text-sm font-medium text-gray-700">Enviar link para</Label>
            <Input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
            <p className="mt-1 text-xs text-gray-400">O PDF será gerado no Google Drive e o link enviado por e-mail.</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancelar</Button>
          <Button onClick={handleExportar} disabled={loading || fotos.length === 0}>
            {loading ? 'Disparando...' : 'Exportar PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}