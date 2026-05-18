import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { splitParticipantName } from '@/utils/presenca/deduplicateParticipants';

const EMPTY = {
  nome_completo: '',
  nome_social: '',
  data_nascimento: '',
  email: '',
  telefone: '',
  cpf: '',
  passaporte: '',
  cep: '',
  endereco: '',
  numero: '',
  complemento: '',
  bairro: '',
  cidade: '',
  estado: '',
  pais: 'Brasil',
};

export default function QuickParticipantForm({ onSave, defaultMuseu = '', disabled = false }) {
  const [form, setForm] = useState(EMPTY);
  const [loadingCep, setLoadingCep] = useState(false);
  const [saving, setSaving] = useState(false);

  const setF = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  async function lookupCep(value) {
    const cep = String(value || '').replace(/\D/g, '');
    setF('cep', value);
    if (cep.length !== 8) return;
    setLoadingCep(true);
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();
      if (!data?.erro) {
        setForm((prev) => ({
          ...prev,
          cep,
          endereco: prev.endereco || data.logradouro || '',
          bairro: prev.bairro || data.bairro || '',
          cidade: prev.cidade || data.localidade || '',
          estado: prev.estado || data.uf || '',
          pais: prev.pais || 'Brasil',
        }));
      }
    } catch (error) {
      console.warn('CEP não preenchido automaticamente:', error);
    } finally {
      setLoadingCep(false);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (!String(form.nome_completo || '').trim()) {
      toast.error('Informe o nome completo.');
      return;
    }
    setSaving(true);
    try {
      const parts = splitParticipantName(form.nome_completo);
      await onSave?.({
        ...form,
        ...parts,
        museu: defaultMuseu,
      });
      toast.success('Participante salvo.');
      setForm(EMPTY);
    } catch (error) {
      console.error(error);
      toast.error(error?.message || 'Erro ao salvar participante.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1 md:col-span-2">
          <Label>Nome completo *</Label>
          <Input value={form.nome_completo} onChange={(e) => setF('nome_completo', e.target.value)} disabled={disabled || saving} />
        </div>
        <div className="space-y-1">
          <Label>Nome social</Label>
          <Input value={form.nome_social} onChange={(e) => setF('nome_social', e.target.value)} disabled={disabled || saving} />
        </div>
        <div className="space-y-1">
          <Label>Data de nascimento</Label>
          <Input type="date" value={form.data_nascimento} onChange={(e) => setF('data_nascimento', e.target.value)} disabled={disabled || saving} />
        </div>
        <div className="space-y-1">
          <Label>E-mail</Label>
          <Input type="email" value={form.email} onChange={(e) => setF('email', e.target.value)} disabled={disabled || saving} />
        </div>
        <div className="space-y-1">
          <Label>Telefone</Label>
          <Input value={form.telefone} onChange={(e) => setF('telefone', e.target.value)} disabled={disabled || saving} />
        </div>
        <div className="space-y-1">
          <Label>CPF</Label>
          <Input value={form.cpf} onChange={(e) => setF('cpf', e.target.value)} disabled={disabled || saving} />
        </div>
        <div className="space-y-1">
          <Label>Passaporte</Label>
          <Input value={form.passaporte} onChange={(e) => setF('passaporte', e.target.value)} disabled={disabled || saving} />
        </div>
        <div className="space-y-1">
          <Label>CEP</Label>
          <div className="relative">
            <Input value={form.cep} onChange={(e) => lookupCep(e.target.value)} disabled={disabled || saving} />
            {loadingCep && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-slate-400" />}
          </div>
        </div>
        <div className="space-y-1">
          <Label>Endereço</Label>
          <Input value={form.endereco} onChange={(e) => setF('endereco', e.target.value)} disabled={disabled || saving} />
        </div>
        <div className="space-y-1">
          <Label>Número</Label>
          <Input value={form.numero} onChange={(e) => setF('numero', e.target.value)} disabled={disabled || saving} />
        </div>
        <div className="space-y-1">
          <Label>Complemento</Label>
          <Input value={form.complemento} onChange={(e) => setF('complemento', e.target.value)} disabled={disabled || saving} />
        </div>
        <div className="space-y-1">
          <Label>Bairro</Label>
          <Input value={form.bairro} onChange={(e) => setF('bairro', e.target.value)} disabled={disabled || saving} />
        </div>
        <div className="space-y-1">
          <Label>Cidade</Label>
          <Input value={form.cidade} onChange={(e) => setF('cidade', e.target.value)} disabled={disabled || saving} />
        </div>
        <div className="space-y-1">
          <Label>Estado</Label>
          <Input value={form.estado} onChange={(e) => setF('estado', e.target.value)} disabled={disabled || saving} />
        </div>
        <div className="space-y-1">
          <Label>País</Label>
          <Input value={form.pais} onChange={(e) => setF('pais', e.target.value)} disabled={disabled || saving} />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={disabled || saving}>
        {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
        Salvar participante
      </Button>
    </form>
  );
}
