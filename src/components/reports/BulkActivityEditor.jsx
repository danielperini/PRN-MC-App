import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { AlertCircle } from 'lucide-react';

const MUSEUS_ATIV = ['MHAB', 'MIS', 'MUMO', 'Externo'];
const EQUIPES = ['Comunicação', 'Administração', 'Educativo', 'Produção', 'Outra'];
const TIPOS_ACAO = [
  'Visita Mediada', 'Oficina', 'Exposição', 'Evento', 'Palestra',
  'Reunião', 'Formação', 'Produção de Conteúdo', 'Manutenção', 'Outro'
];

const CLASSIF_OPTIONS = ['META', 'ROTINA', 'EXTRA'];

export default function BulkActivityEditor({ open, selectedActivities, onApply, onClose }) {
  const [updates, setUpdates] = useState({
    data_inicio: '',
    museu: '',
    equipe_responsavel: '',
    tipo_acao: '',
    classificacao: '',
  });

  const handleApply = () => {
    const changedFields = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== '')
    );

    if (Object.keys(changedFields).length === 0) {
      toast.warning('Selecione pelo menos um campo para atualizar');
      return;
    }

    onApply(changedFields);
    setUpdates({ data_inicio: '', museu: '', equipe_responsavel: '', tipo_acao: '', classificacao: '' });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar {selectedActivities.length} atividade(s)</DialogTitle>
          <DialogDescription>
            Atualize os campos selecionados para todas as atividades. Campos em branco serão ignorados.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
          <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700">
            Apenas os campos preenchidos serão alterados. Deixe em branco os campos que não deseja modificar.
          </p>
        </div>

        <div className="space-y-4">
          <div>
            <Label>Data de início</Label>
            <Input
              type="date"
              value={updates.data_inicio}
              onChange={e => setUpdates({ ...updates, data_inicio: e.target.value })}
            />
          </div>

          <div>
            <Label>Museu / Local</Label>
            <Select value={updates.museu} onValueChange={v => setUpdates({ ...updates, museu: v })}>
              <SelectTrigger><SelectValue placeholder="Nenhuma alteração" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>— Nenhuma alteração —</SelectItem>
                {MUSEUS_ATIV.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Equipe responsável</Label>
            <Select value={updates.equipe_responsavel} onValueChange={v => setUpdates({ ...updates, equipe_responsavel: v })}>
              <SelectTrigger><SelectValue placeholder="Nenhuma alteração" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>— Nenhuma alteração —</SelectItem>
                {EQUIPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Tipo de ação</Label>
            <Select value={updates.tipo_acao} onValueChange={v => setUpdates({ ...updates, tipo_acao: v })}>
              <SelectTrigger><SelectValue placeholder="Nenhuma alteração" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>— Nenhuma alteração —</SelectItem>
                {TIPOS_ACAO.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Classificação</Label>
            <Select value={updates.classificacao} onValueChange={v => setUpdates({ ...updates, classificacao: v })}>
              <SelectTrigger><SelectValue placeholder="Nenhuma alteração" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={null}>— Nenhuma alteração —</SelectItem>
                {CLASSIF_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="mt-6">
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button className="bg-black hover:bg-gray-800 text-white" onClick={handleApply}>
            Aplicar a {selectedActivities.length} atividade(s)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}