import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

const TIPOS = ['oficina', 'curso', 'visita', 'mediação', 'atividade educativa', 'ação cultural', 'formação', 'palestra', 'laboratório', 'outro'];
const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Museus Centro', 'Noturno nos Museus'];

const EMPTY = {
  nome_atividade: '',
  tipo: 'oficina',
  museu: 'MHAB',
  educador_responsavel: '',
  data_inicial: '',
  data_final: '',
  descricao_curta: '',
  meta_relacionada: '',
  publico_alvo: '',
  quantidade_prevista: '',
};

export default function QuickActivityForm({ onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const setF = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.nome_atividade.trim()) {
      toast.error('Informe o nome da atividade.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nome_acao: form.nome_atividade.trim(),
        titulo: form.nome_atividade.trim(),
        atividade: form.nome_atividade.trim(),
        tipo: form.tipo,
        tipo_atividade: form.tipo,
        museu: form.museu,
        centro_custo: form.museu,
        responsavel: form.educador_responsavel,
        educador_responsavel: form.educador_responsavel,
        data_realizacao: form.data_inicial || undefined,
        data_inicio: form.data_inicial || undefined,
        data_fim: form.data_final || form.data_inicial || undefined,
        descricao: form.descricao_curta,
        sinopse: form.descricao_curta,
        meta_relacionada: form.meta_relacionada,
        publico_alvo: form.publico_alvo,
        publico_estimado: Number(form.quantidade_prevista) || 0,
        origem: 'GeradorListaPresenca',
        status: 'ATIVO',
        created_at: new Date().toISOString(),
      };
      const created = await base44.entities.Programacao.create(payload);
      await base44.entities.AttendanceAuditLog?.create?.({
        action: 'EDUCATIONAL_ACTIVITY_CREATED',
        entity_type: 'Programacao',
        entity_id: created?.id || '',
        details: `Atividade criada: ${payload.nome_acao}`,
        metadata: payload,
        created_at: new Date().toISOString(),
      }).catch(() => null);
      toast.success('Atividade criada.');
      setForm(EMPTY);
      await onCreated?.(created || payload);
    } catch (error) {
      console.error(error);
      toast.error('Erro ao criar atividade.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        <p className="font-semibold">Criar atividade</p>
        <p className="text-xs">Use este formulário para cadastrar a ação principal, como oficina, curso, visita, palestra ou mediação.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label>Nome da atividade principal *</Label>
          <Input value={form.nome_atividade} onChange={(e) => setF('nome_atividade', e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-1">
          <Label>Tipo</Label>
          <Select value={form.tipo} onValueChange={(value) => setF('tipo', value)} disabled={saving}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{TIPOS.map((tipo) => <SelectItem key={tipo} value={tipo}>{tipo}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Museu</Label>
          <Select value={form.museu} onValueChange={(value) => setF('museu', value)} disabled={saving}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{MUSEUS.map((museu) => <SelectItem key={museu} value={museu}>{museu}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Educador/profissional responsável</Label>
          <Input value={form.educador_responsavel} onChange={(e) => setF('educador_responsavel', e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-1">
          <Label>Meta relacionada</Label>
          <Input value={form.meta_relacionada} onChange={(e) => setF('meta_relacionada', e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-1">
          <Label>Data inicial</Label>
          <Input type="date" value={form.data_inicial} onChange={(e) => setF('data_inicial', e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-1">
          <Label>Data final</Label>
          <Input type="date" value={form.data_final} onChange={(e) => setF('data_final', e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-1">
          <Label>Público-alvo</Label>
          <Input value={form.publico_alvo} onChange={(e) => setF('publico_alvo', e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-1">
          <Label>Qtd. prevista</Label>
          <Input type="number" min="0" value={form.quantidade_prevista} onChange={(e) => setF('quantidade_prevista', e.target.value)} disabled={saving} />
        </div>
        <div className="space-y-1 md:col-span-2">
          <Label>Descrição curta</Label>
          <Textarea value={form.descricao_curta} onChange={(e) => setF('descricao_curta', e.target.value)} rows={2} className="resize-none" disabled={saving} />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
        Criar atividade
      </Button>
    </form>
  );
}
