import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Settings } from 'lucide-react';

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];
const CATEGORIAS = [
  { key: 'manutencao', label: 'Manutenção de Rotina' },
  { key: 'diarias_educador', label: 'Diárias de Educador' },
  { key: 'lanches', label: 'Lanches' },
  { key: 'alimentacao_cartao', label: 'Alimentação Cartão' },
  { key: 'material', label: 'Material' },
  { key: 'acoes_educativas', label: 'Ações Educativas' },
  { key: 'som_luz', label: 'Som e Luz' },
  { key: 'exposicao', label: 'Exposição' },
];

export default function GerenciarRubricasMuseuDialog({ open, onClose }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ rubrica_id: '', museu: '', categoria_key: '', divisor: 1 });
  const [saving, setSaving] = useState(false);

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
    if (!form.rubrica_id || !form.museu || !form.categoria_key) return;
    setSaving(true);
    await base44.entities.RubricaMuseuConfig.create({ ...form, divisor: Number(form.divisor) || 1 });
    await refetch();
    queryClient.invalidateQueries({ queryKey: ['rubrica-museu-configs'] });
    setForm({ rubrica_id: '', museu: '', categoria_key: '', divisor: 1 });
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Select value={form.rubrica_id} onValueChange={v => setForm(f => ({ ...f, rubrica_id: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Selecionar rubrica..." />
              </SelectTrigger>
              <SelectContent>
                {rubricasAtivas.map(r => (
                  <SelectItem key={r.id} value={r.id}>{r.rubrica}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={form.museu} onValueChange={v => setForm(f => ({ ...f, museu: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Museu..." />
              </SelectTrigger>
              <SelectContent>
                {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={form.categoria_key} onValueChange={v => setForm(f => ({ ...f, categoria_key: v }))}>
              <SelectTrigger>
                <SelectValue placeholder="Card / Categoria..." />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map(c => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={String(form.divisor)} onValueChange={v => setForm(f => ({ ...f, divisor: Number(v) }))}>
              <SelectTrigger>
                <SelectValue placeholder="Divisor..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Exclusiva (÷1)</SelectItem>
                <SelectItem value="2">Compartilhada entre 2 (÷2)</SelectItem>
                <SelectItem value="3">Compartilhada entre 3 (÷3)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={handleAdd}
            disabled={saving || !form.rubrica_id || !form.museu || !form.categoria_key}
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
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm text-gray-800 truncate">{getRubricaNome(c.rubrica_id)}</span>
                        <Badge variant="outline" className="text-xs shrink-0">{CATEGORIAS.find(cat => cat.key === c.categoria_key)?.label || c.categoria_key}</Badge>
                        {c.divisor > 1 && <Badge className="text-xs bg-gray-100 text-gray-600 shrink-0">÷{c.divisor}</Badge>}
                      </div>
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