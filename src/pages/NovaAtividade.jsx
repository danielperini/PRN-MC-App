import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2, PlusCircle, CheckCircle2 } from 'lucide-react';
import { useCurrentUser } from '@/components/auth/useCurrentUser';

const CLASSIFICACOES = [
  { value: 'META', label: 'Meta do projeto' },
  { value: 'ROTINA', label: 'Rotina' },
  { value: 'EXTRA', label: 'Atividade extra' },
];

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const ANO_ATUAL = new Date().getFullYear();
const MES_ATUAL = MESES[new Date().getMonth()];

export default function NovaAtividade() {
  const { user } = useCurrentUser();

  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    classificacao: 'ROTINA',
    museu: '',
    mes: MES_ATUAL,
    ano: String(ANO_ATUAL),
    publico_estimado: '',
    data_realizacao: '',
    observacoes: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  const set = (field) => (value) => setForm((prev) => ({ ...prev, [field]: value }));
  const setEv = (field) => (e) => set(field)(e.target.value);

  async function handleSubmit() {
    if (!form.titulo.trim()) {
      toast.error('Informe o título da atividade.');
      return;
    }
    if (!form.museu) {
      toast.error('Selecione o museu.');
      return;
    }

    setSubmitting(true);
    try {
      // Usa createActivityWithAutoReport para garantir vínculo com relatório mensal
      await base44.functions.invoke('createActivityWithAutoReport', {
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim(),
        classificacao: form.classificacao,
        museu: form.museu,
        mes: form.mes,
        ano: Number(form.ano),
        publico_estimado: form.publico_estimado ? Number(form.publico_estimado) : 0,
        data_realizacao: form.data_realizacao || null,
        observacoes: form.observacoes.trim(),
        user_email: user?.email || '',
        user_name: user?.full_name || user?.email || '',
      });

      setDone(true);
      toast.success('Atividade criada e vinculada ao relatório mensal.');

      // Reset após 2s
      setTimeout(() => {
        setDone(false);
        setForm({
          titulo: '',
          descricao: '',
          classificacao: 'ROTINA',
          museu: '',
          mes: MES_ATUAL,
          ano: String(ANO_ATUAL),
          publico_estimado: '',
          data_realizacao: '',
          observacoes: '',
        });
      }, 2000);
    } catch (err) {
      // Fallback: cria direto no banco se a função falhar
      try {
        await base44.entities.Activity.create({
          titulo: form.titulo.trim(),
          descricao: form.descricao.trim(),
          classificacao: form.classificacao,
          data_realizacao: form.data_realizacao || null,
          publico_estimado: form.publico_estimado ? Number(form.publico_estimado) : 0,
          observacoes: form.observacoes.trim(),
        });
        toast.success('Atividade criada (sem vínculo automático com relatório).');
        setDone(true);
        setTimeout(() => setDone(false), 2000);
      } catch (fallbackErr) {
        toast.error('Erro ao criar atividade: ' + (fallbackErr?.message || 'tente novamente.'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-gray-900">Nova Atividade</h1>
        <p className="text-sm text-gray-500 mt-1">
          A atividade será automaticamente vinculada ao relatório mensal do museu.
        </p>
      </div>

      {done && (
        <div className="mb-4 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" />
          Atividade registrada com sucesso!
        </div>
      )}

      <div className="space-y-5 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="space-y-1.5">
          <Label>Título *</Label>
          <Input
            placeholder="Ex: Oficina de fotografia para jovens"
            value={form.titulo}
            onChange={setEv('titulo')}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Descrição</Label>
          <Textarea
            placeholder="Descreva a atividade, objetivo e metodologia..."
            value={form.descricao}
            onChange={setEv('descricao')}
            className="min-h-[100px]"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Classificação</Label>
            <Select value={form.classificacao} onValueChange={set('classificacao')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASSIFICACOES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Museu *</Label>
            <Select value={form.museu} onValueChange={set('museu')}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione..." />
              </SelectTrigger>
              <SelectContent>
                {MUSEUS.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Mês de referência</Label>
            <Select value={form.mes} onValueChange={set('mes')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MESES.map((m) => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Data de realização</Label>
            <Input
              type="date"
              value={form.data_realizacao}
              onChange={setEv('data_realizacao')}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Público estimado</Label>
            <Input
              type="number"
              min="0"
              placeholder="0"
              value={form.publico_estimado}
              onChange={setEv('publico_estimado')}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Observações</Label>
          <Textarea
            placeholder="Informações adicionais, parcerias, imprevistos..."
            value={form.observacoes}
            onChange={setEv('observacoes')}
            className="min-h-[80px]"
          />
        </div>

        <div className="pt-2">
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full gap-2 bg-black text-white hover:bg-gray-900"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlusCircle className="h-4 w-4" />
            )}
            {submitting ? 'Criando atividade...' : 'Criar atividade'}
          </Button>
        </div>
      </div>
    </div>
  );
}