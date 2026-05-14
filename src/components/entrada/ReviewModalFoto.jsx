import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { Image, Loader2, CheckCircle2, Trash2, AlertCircle } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function ReviewModalFoto({ intake, onClose, onSaved }) {
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [activities, setActivities] = useState([]);
  const [metas, setMetas] = useState([]);
  const [loadingActivities, setLoadingActivities] = useState(true);
  const [loadingMetas, setLoadingMetas] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    activity_id: intake.activity_id_vinculada || '',
    meta_id: intake.meta_id_vinculada || '',
    legenda: intake.legenda_sugerida || intake.resultado_ia?.legenda || '',
    descricao: intake.resultado_ia?.descricao || '',
    local: intake.resultado_ia?.local_provavel || '',
  });

  useEffect(() => {
    async function load() {
      try {
        const currentUser = await base44.auth.me();
        setUser(currentUser);
        const acts = await base44.entities.Activity.filter(
          { created_by: currentUser.email },
          '-created_date',
          100
        );
        setActivities(acts || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingActivities(false);
      }
    }
    load();
  }, []);

  useEffect(() => {
    async function loadMetas() {
      try {
        const projectMetas = await base44.entities.ProjectMeta.filter(
          { ativo: true },
          'nome'
        );
        setMetas(projectMetas || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoadingMetas(false);
      }
    }
    loadMetas();
  }, []);

  async function handleSave() {
    if (!form.activity_id) {
      toast({ title: 'Selecione uma atividade', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      // Cria o attachment vinculado à atividade
      await base44.entities.Attachment.create({
        report_id: '',
        activity_id: form.activity_id,
        file_name: intake.file_name_original,
        file_type: intake.mime_type,
        file_url: intake.arquivo_original_url,
        description: form.legenda,
      });

      // Atualiza o intake
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'APROVADO',
        activity_id_vinculada: form.activity_id,
        meta_id_vinculada: form.meta_id || undefined,
        legenda_sugerida: form.legenda,
        entidade_destino: 'Activity',
        entidade_destino_id: form.activity_id,
        revisado_pelo_usuario: true,
      });

      toast({
        title: 'Foto salva e disponível na Atividade.',
        description: 'Acesse a atividade para visualizar a foto vinculada.',
      });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm('Tem certeza que deseja deletar esta foto?')) return;
    setDeleting(true);
    try {
      await base44.entities.DocumentIntake.update(intake.id, {
        status_processamento: 'DELETADO',
      });
      toast({ title: 'Foto deletada com sucesso.' });
      onSaved();
    } catch (e) {
      toast({ title: 'Erro ao deletar', description: e.message, variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Image className="w-5 h-5 text-purple-500" /> Vincular Foto à Atividade
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
           {/* Preview */}
           <div className="rounded-lg overflow-hidden border bg-slate-50 flex items-center justify-center h-48">
             <img
               src={intake.arquivo_original_url}
               alt="preview"
               className="max-h-48 object-contain"
             />
           </div>

           {/* Alerta se sem atividades */}
           {!loadingActivities && activities.length === 0 && (
             <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg flex gap-3">
               <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
               <div className="text-sm text-amber-800">
                 <p className="font-semibold mb-1">Nenhuma atividade encontrada</p>
                 <p className="text-xs">Você precisa criar uma atividade antes de vincular esta foto. Acesse a seção de Atividades para criar uma nova.</p>
               </div>
             </div>
           )}

           {/* Atividade */}
           <div className="space-y-1">
             <Label>Atividade <span className="text-red-500">*</span></Label>
             {loadingActivities ? (
               <div className="flex items-center gap-2 text-sm text-slate-400">
                 <Loader2 className="w-4 h-4 animate-spin" /> Carregando atividades...
               </div>
             ) : activities.length === 0 ? (
               <div className="text-sm text-slate-500 p-2 bg-slate-50 rounded border border-slate-200">
                 Nenhuma atividade disponível
               </div>
             ) : (
               <Select value={form.activity_id} onValueChange={(v) => setForm(f => ({ ...f, activity_id: v }))}>
                 <SelectTrigger>
                   <SelectValue placeholder="Selecione a atividade" />
                 </SelectTrigger>
                 <SelectContent>
                   {activities.map((a) => (
                     <SelectItem key={a.id} value={a.id}>
                       {a.titulo} {a.data_realizacao ? `— ${a.data_realizacao}` : ''}
                     </SelectItem>
                   ))}
                 </SelectContent>
               </Select>
             )}
           </div>

          {/* Meta do 3º Aditivo */}
          <div className="space-y-1">
            <Label>Meta do 3º Aditivo</Label>
            {loadingMetas ? (
              <div className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Carregando metas...
              </div>
            ) : (
              <Select value={form.meta_id} onValueChange={(v) => setForm(f => ({ ...f, meta_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a meta (opcional)" />
                </SelectTrigger>
                <SelectContent>
                  {metas.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Legenda */}
          <div className="space-y-1">
            <Label>Legenda sugerida pela IA</Label>
            <Input
              value={form.legenda}
              onChange={(e) => setForm(f => ({ ...f, legenda: e.target.value }))}
              placeholder="Legenda da foto"
            />
          </div>

          {/* Descrição */}
          <div className="space-y-1">
            <Label>Descrição</Label>
            <Input
              value={form.descricao}
              onChange={(e) => setForm(f => ({ ...f, descricao: e.target.value }))}
              placeholder="Descrição adicional"
            />
          </div>

          {/* Local */}
          {form.local && (
            <div className="space-y-1">
              <Label>Local provável</Label>
              <Input
                value={form.local}
                onChange={(e) => setForm(f => ({ ...f, local: e.target.value }))}
              />
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              Deletar
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.activity_id || activities.length === 0}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Vincular Foto
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}