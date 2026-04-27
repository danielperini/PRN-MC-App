import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { FileQuestion, Loader2, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const TIPOS = [
  { value: 'FOTO_ATIVIDADE', label: 'Foto de Atividade' },
  { value: 'NOTA_FISCAL_PDF', label: 'Nota Fiscal PDF' },
  { value: 'NOTA_FISCAL_XML', label: 'Nota Fiscal XML' },
  { value: 'DOCUMENTO_ADMINISTRATIVO', label: 'Documento Administrativo' },
  { value: 'OUTRO', label: 'Outro' },
];

export default function ReviewModalOutro({ intake, onClose, onReclassified }) {
  const { toast } = useToast();
  const [tipo, setTipo] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleReclassify() {
    if (!tipo) return;
    setSaving(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        tipo_detectado: tipo,
        status_processamento: 'AGUARDANDO_REVISAO',
        revisado_pelo_usuario: false,
      });
      toast({ title: 'Documento reclassificado. Abrindo revisão...' });
      onReclassified(tipo);
    } catch (e) {
      toast({ title: 'Erro', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Tem certeza que deseja deletar este documento?')) return;
    setDeleting(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'DELETADO',
      });
      toast({ title: 'Documento deletado com sucesso.' });
      onClose();
    } catch (e) {
      toast({ title: 'Erro ao deletar', description: e.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileQuestion className="w-5 h-5 text-slate-500" />
            Classificar Documento Manualmente
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            A IA não conseguiu classificar este documento. Selecione o tipo correto para continuar.
          </p>
          <div className="space-y-1">
            <Label>Tipo do documento</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue placeholder="Selecione o tipo" /></SelectTrigger>
              <SelectContent>
                {TIPOS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              <Trash2 className={`w-4 h-4 ${deleting ? 'mr-2' : 'mr-2'}`} />
              Deletar
            </Button>
            <Button onClick={handleReclassify} disabled={!tipo || saving}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Confirmar
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}