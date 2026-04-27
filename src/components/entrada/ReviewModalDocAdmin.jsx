import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { FileText, Loader2, AlertCircle, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

const CATEGORIAS = [
  'Contrato',
  'Recibo',
  'Comprovante',
  'Relatório',
  'Autorização',
  'Declaração',
  'Outro',
];

export default function ReviewModalDocAdmin({ intake, onClose, onSaved }) {
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    titulo: intake.resultado_ia?.descricao || '',
    categoria: '',
    descricao: '',
  });

  async function handleSalvarRascunho() {
    setSaving(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'RASCUNHO',
        resultado_ia: { ...intake.resultado_ia, ...form },
        revisado_pelo_usuario: true,
      });
      toast({ title: 'Documento salvo como rascunho.' });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
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
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao deletar', description: e.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  async function handleEnviarAprovacao() {
    if (!form.categoria) {
      toast({ title: 'Selecione uma categoria antes de enviar.', variant: 'destructive' });
      return;
    }

    setSending(true);
    try {
      // Criar entrada no banco (similar a NF, mas simplificado)
      await base44.entities.Attachment.create({
        report_id: '',
        file_name: intake.file_name_original,
        file_type: intake.mime_type,
        file_url: intake.arquivo_original_url,
        description: form.descricao || form.titulo || intake.file_name_original,
      });

      // Atualizar intake
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'ENVIADO_APROVACAO',
        tipo_detectado: 'DOCUMENTO_ADMINISTRATIVO',
        resultado_ia: { ...intake.resultado_ia, ...form },
        revisado_pelo_usuario: true,
        entidade_destino: 'Attachment',
      });

      // Notificar coordenação e usuário
      try {
        await base44.functions.invoke('notifyDocumentSubmissionForApproval', {
          documentIntakeId: intake.id,
          tipoDocumento: 'Documento Administrativo',
          categoriaIdentificada: form.categoria,
          nfNumero: null,
          valor: null,
          rubricaSugerida: null,
          centroCusto: null,
          nomeArquivo: intake.file_name_original,
        });
      } catch (notifyErr) {
        console.error('Erro ao notificar:', notifyErr);
        // Notificação é secundária, não quebra o fluxo
      }

      toast({
        title: 'Documento enviado para aprovação com sucesso.',
        description: 'A coordenação foi notificada por e-mail.',
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao enviar', description: e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  }

  // Mostrar inconsistências, se houver
  const erros = (intake.erros_validacao || []).filter(e => String(e || '').trim().length > 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-500" />
            Revisar Documento Administrativo
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status da IA */}
          <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-100 text-sm text-blue-700">
            ✓ Documento identificado como administrativo. Revise os dados antes de enviar.
          </div>

          {/* Inconsistências, se houver */}
          {erros.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 space-y-1">
              <p className="font-medium flex items-center gap-1">
                <AlertCircle className="w-4 h-4" /> Observações:
              </p>
              {erros.map((e, i) => (
                <p key={i}>• {e}</p>
              ))}
            </div>
          )}

          {/* Título */}
          <div className="space-y-1">
            <Label>Título do Documento</Label>
            <Input
              value={form.titulo}
              onChange={(e) => setForm(f => ({ ...f, titulo: e.target.value }))}
              placeholder="Ex: Contrato de Consultoria"
            />
          </div>

          {/* Categoria */}
          <div className="space-y-1">
            <Label>Categoria <span className="text-red-500">*</span></Label>
            <Select value={form.categoria} onValueChange={(v) => setForm(f => ({ ...f, categoria: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar categoria" />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Descrição */}
          <div className="space-y-1">
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={form.descricao}
              onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))}
              placeholder="Contexto ou detalhes sobre o documento"
              className="min-h-24"
            />
          </div>

          {/* Info arquivo */}
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
            <p className="text-xs text-slate-600">
              <strong>Arquivo:</strong> {intake.file_name_original}
            </p>
          </div>

          {/* Aviso de envio */}
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
            💡 Ao enviar, o documento será encaminhado para análise da coordenação e você receberá um email de confirmação.
          </div>

          <div className="flex justify-end gap-2 pt-2 flex-wrap">
            <Button variant="outline" onClick={onClose}>
              Cancelar
            </Button>

            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Deletar
            </Button>

            <Button
              variant="outline"
              onClick={handleSalvarRascunho}
              disabled={saving || sending}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salvar Rascunho
            </Button>

            <Button
              onClick={handleEnviarAprovacao}
              disabled={sending || saving || !form.categoria}
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Enviar para Aprovação
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}