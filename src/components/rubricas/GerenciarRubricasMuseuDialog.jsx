import React, { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Settings, AlertCircle } from 'lucide-react';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

export default function GerenciarRubricasMuseuDialog({ open, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ rubrica_id: '', museu: '' });
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    if (open) {
      base44.auth.me().then(setCurrentUser).catch(() => {});
    }
  }, [open]);

  const isCoordenador = currentUser && ['COORDENADOR', 'ADMIN', 'admin'].includes(currentUser?.role);

  const { data: rubricas = [] } = useQuery({
    queryKey: ['rubricas-all'],
    queryFn: () => base44.entities.Rubrica.list('ordem_exibicao', 200),
  });

  const { data: configs = [], refetch } = useQuery({
    queryKey: ['rubrica-museu-configs'],
    queryFn: () => base44.entities.RubricaMuseuConfig.list(),
  });

  const rubricasAtivas = useMemo(() => rubricas.filter(r => r.ativo !== false), [rubricas]);

  async function handleAdd() {
    if (!form.rubrica_id || !form.museu) return;
    setSaving(true);
    await base44.entities.RubricaMuseuConfig.create({ 
      rubrica_id: form.rubrica_id, 
      museu: form.museu,
      categoria_key: 'geral'
    });
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['rubrica-museu-configs'] });
    setForm({ rubrica_id: '', museu: '' });
    setSaving(false);
  }

  async function handleRemove(id) {
    await base44.entities.RubricaMuseuConfig.delete(id);
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['rubrica-museu-configs'] });
  }

  const getRubricaNome = (id) => rubricasAtivas.find(r => r.id === id)?.rubrica || id;

  // Agrupar por museu
  const porMuseu = MUSEUS.map(m => ({
    museu: m,
    items: configs.filter(c => c.museu === m),
  }));

  if (!isCoordenador) {
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertCircle className="w-5 h-5" />
              Acesso Restrito
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">Apenas coordenadores podem gerenciar rubricas por museu.</p>
          <Button onClick={onClose} className="mt-4 w-full">Fechar</Button>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            Gerenciar Rubricas por Museu
          </DialogTitle>
        </DialogHeader>

        {/* Formulário para adicionar */}
         <div className="bg-gray-50 rounded-lg p-4 space-y-3 border">
           <p className="text-sm font-semibold text-gray-700">Adicionar rubrica a um museu</p>
           <div className="flex gap-2">
             <Select value={form.rubrica_id} onValueChange={v => setForm(f => ({ ...f, rubrica_id: v }))}>
               <SelectTrigger className="flex-1">
                 <SelectValue placeholder="Selecionar rubrica..." />
               </SelectTrigger>
               <SelectContent>
                 {rubricasAtivas.map(r => (
                   <SelectItem key={r.id} value={r.id}>{r.rubrica}</SelectItem>
                 ))}
               </SelectContent>
             </Select>

             <Select value={form.museu} onValueChange={v => setForm(f => ({ ...f, museu: v }))}>
               <SelectTrigger className="w-32">
                 <SelectValue placeholder="Museu..." />
               </SelectTrigger>
               <SelectContent>
                 {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
               </SelectContent>
             </Select>
           </div>
           <Button
             onClick={handleAdd}
             disabled={saving || !form.rubrica_id || !form.museu}
             className="w-full gap-2"
           >
             <Plus className="w-4 h-4" />
             Adicionar
           </Button>
         </div>

        {/* Lista atual por museu */}
        <div className="space-y-4">
          {porMuseu.map(({ museu, items }) => (
            <div key={museu}>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">{museu}</p>
              {items.length === 0 ? (
                <p className="text-xs text-gray-400 italic pl-2">Nenhuma rubrica configurada</p>
              ) : (
                <div className="space-y-1">
                  {items.map(c => (
                     <div key={c.id} className="flex items-center justify-between bg-white border rounded-lg px-3 py-2">
                       <span className="text-sm text-gray-800 truncate flex-1">{getRubricaNome(c.rubrica_id)}</span>
                       <Button
                         variant="ghost"
                         size="icon"
                         className="h-7 w-7 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                         onClick={() => handleRemove(c.id)}
                       >
                         <Trash2 className="w-4 h-4" />
                       </Button>
                     </div>
                   ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}