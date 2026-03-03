import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useMutation } from '@tanstack/react-query';
import { User, Save, BadgeCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const FUNCOES = ['Educador', 'Produtor Cultural', 'Comunicador', 'Administrador', 'Coordenador', 'Outro'];
const EQUIPES = ['Comunicação', 'Coordenação', 'Administração', 'Educativo', 'Produção', 'Outra'];
const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];

function PerfilInner() {
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({ full_name: '', funcao: '', equipe: '', museu: '' });

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      setFormData({
        full_name: u.full_name || '',
        funcao: u.funcao || '',
        equipe: u.equipe || '',
        museu: u.museu || '',
      });
    });
  }, []);

  const saveMutation = useMutation({
    mutationFn: () => base44.auth.updateMe(formData),
    onSuccess: () => toast.success('Perfil atualizado com sucesso!'),
    onError: () => toast.error('Erro ao atualizar perfil.'),
  });

  const set = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="flex items-center gap-4 mb-10">
          <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center">
            <span className="text-2xl font-semibold text-gray-600">
              {(user.full_name || user.email || '?')[0].toUpperCase()}
            </span>
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-black">{user.full_name || 'Meu Perfil'}</h1>
            <p className="text-sm text-gray-400">{user.email}</p>
          </div>
        </div>

        {/* Matrícula (somente leitura) */}
        {user.matricula && (
          <div className="mb-8 p-4 bg-gray-50 border border-gray-200 rounded-xl flex items-center gap-3">
            <BadgeCheck className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Número de Matrícula</p>
              <p className="text-base font-mono font-semibold text-black mt-0.5">{user.matricula}</p>
            </div>
          </div>
        )}

        {/* Formulário */}
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>Nome Completo</Label>
            <Input
              value={formData.full_name}
              onChange={e => set('full_name', e.target.value)}
              placeholder="Seu nome completo"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Função</Label>
            <Select value={formData.funcao} onValueChange={v => set('funcao', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione a função" /></SelectTrigger>
              <SelectContent>
                {FUNCOES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Equipe</Label>
            <Select value={formData.equipe} onValueChange={v => set('equipe', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione a equipe" /></SelectTrigger>
              <SelectContent>
                {EQUIPES.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Museu</Label>
            <Select value={formData.museu} onValueChange={v => set('museu', v)}>
              <SelectTrigger><SelectValue placeholder="Selecione o museu" /></SelectTrigger>
              <SelectContent>
                {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Campos somente leitura */}
          <div className="space-y-1.5">
            <Label className="text-gray-500">Papel no sistema</Label>
            <Input value={user.role || '–'} disabled className="bg-gray-50 text-gray-500" />
          </div>

          <div className="pt-2">
            <Button
              className="w-full bg-black hover:bg-gray-800 text-white"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              {saveMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Perfil() {
  return <RequireAuth><PerfilInner /></RequireAuth>;
}