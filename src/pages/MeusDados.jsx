import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Users, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';

const FORM_FIELDS = [
  { name: 'email_pessoal', label: 'Email Pessoal', type: 'email' },
  { name: 'telefone', label: 'Telefone de Contato', type: 'tel' },
  { name: 'cpf', label: 'CPF', type: 'text' },
];

const BANKING_FIELDS = [
  { name: 'banco', label: 'Banco', type: 'text' },
  { name: 'agencia', label: 'Agência', type: 'text' },
  { name: 'conta', label: 'Conta', type: 'text' },
  { name: 'pix_key', label: 'Chave PIX (opcional)', type: 'text' },
];

function MeusDadosInner() {
  const [user, setUser] = useState(null);
  const [formData, setFormData] = useState({
    email_pessoal: '',
    telefone: '',
    cpf: '',
    banco: '',
    agencia: '',
    conta: '',
    tipo_conta: 'Corrente',
    pix_key: '',
  });
  const [teamMembers, setTeamMembers] = useState([]);

  useEffect(() => {
    base44.auth.me().then(u => {
      if (!u) {
        setUser(null);
        return;
      }
      setUser(u);
      // Inicializar com dados do usuário
      setFormData(prev => ({
        ...prev,
        email_pessoal: u.email_pessoal || '',
        telefone: u.telefone || '',
        cpf: u.cpf || '',
        banco: u.banco || '',
        agencia: u.agencia || '',
        conta: u.conta || '',
        tipo_conta: u.tipo_conta || 'Corrente',
        pix_key: u.pix_key || '',
      }));
    }).catch(() => setUser(null));
  }, []);

  const { data: teamData = [] } = useQuery({
    queryKey: ['team-members', user?.email],
    queryFn: () => base44.entities.TeamMember.list(),
    enabled: !!user?.email,
  });

  useEffect(() => {
    if (teamData && user?.email) {
      // Encontrar dados do próprio usuário na equipe e preencher dados faltantes
      const currentMember = teamData.find(m => m.user_email === user.email);
      if (currentMember) {
        setFormData(prev => ({
          email_pessoal: prev.email_pessoal || currentMember.email_pessoal || '',
          telefone: prev.telefone || currentMember.telefone || '',
          cpf: prev.cpf || currentMember.cpf || '',
          banco: prev.banco || currentMember.banco || '',
          agencia: prev.agencia || currentMember.agencia || '',
          conta: prev.conta || currentMember.conta || '',
          tipo_conta: prev.tipo_conta || currentMember.tipo_conta || 'Corrente',
          pix_key: prev.pix_key || currentMember.pix_key || '',
        }));
      }
      
      // Mostrar colegas de equipe para referência
      if (user?.equipe) {
        const teamColeagues = teamData.filter(m => m.tipo_equipe === user.equipe && m.user_email !== user.email);
        setTeamMembers(teamColeagues);
      }
    }
  }, [teamData, user?.email]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      await base44.auth.updateMe(formData);
      
      if (teamMembers.length > 0) {
        await Promise.all(teamMembers.map(member =>
          base44.entities.Notification.create({
            user_email: member.user_email,
            type: 'TEAM_DATA_REMINDER',
            title: `${user.full_name} atualizou seus dados`,
            message: `Seus colegas estão preenchendo os dados pessoais e bancários. Complete seus dados para manter a equipe sincronizada.`,
            action_url: '/MeusDados'
          }).catch(() => null)
        ));
      }
    },
    onSuccess: () => toast.success('Dados salvos com sucesso!'),
    onError: () => toast.error('Erro ao salvar dados.'),
  });

  const set = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));

  const isComplete = formData.email_pessoal && formData.telefone && formData.cpf && 
                     formData.banco && formData.agencia && formData.conta;

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white pb-20">
      <div className="max-w-2xl mx-auto px-6 py-12">

        {/* Header */}
        <div className="mb-10">
          <h1 className="text-3xl font-semibold text-black mb-2">Meus Dados</h1>
          <p className="text-gray-600">Preencha suas informações pessoais e bancárias para a equipe</p>
        </div>

        {/* Equipe Info */}
        {user.equipe && (
          <div className="mb-8 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
            <Users className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-blue-900">Equipe: {user.equipe}</p>
              {teamMembers.length > 0 && (
                <div className="text-xs text-blue-700 mt-2 space-y-1">
                  <p>{teamMembers.length} colega(s) de equipe</p>
                  <div className="space-y-1 mt-2">
                    {teamMembers.map(member => (
                      <div key={member.id} className="flex items-center justify-between p-2 bg-white rounded border border-blue-100 text-xs">
                        <span className="font-medium">{member.user_name}</span>
                        <span className="text-blue-600">{member.funcao}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Completion Status */}
        <div className={`mb-8 p-4 border rounded-lg flex items-start gap-3 ${isComplete ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          {isComplete ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-900">Dados Completos</p>
                <p className="text-xs text-green-700 mt-0.5">Todas as informações foram preenchidas</p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Dados Incompletos</p>
                <p className="text-xs text-amber-700 mt-0.5">Preencha todos os campos obrigatórios</p>
              </div>
            </>
          )}
        </div>

        {/* Form */}
        <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-8">

          {/* Dados Pessoais */}
          <Section title="Dados Pessoais">
            {FORM_FIELDS.map(field => (
              <div key={field.name} className="space-y-1.5">
                <Label>{field.label} *</Label>
                <Input
                  type={field.type}
                  value={formData[field.name]}
                  onChange={e => set(field.name, e.target.value)}
                  placeholder={field.label}
                  required
                />
              </div>
            ))}
          </Section>

          {/* Dados Bancários */}
          <Section title="Dados Bancários">
            <div className="space-y-4">
              {BANKING_FIELDS.map(field => (
                <div key={field.name} className="space-y-1.5">
                  <Label>{field.icon} {field.label} {field.name !== 'pix_key' ? '*' : ''}</Label>
                  <Input
                    type={field.type}
                    value={formData[field.name]}
                    onChange={e => set(field.name, e.target.value)}
                    placeholder={field.label}
                    required={field.name !== 'pix_key'}
                  />
                </div>
              ))}

              <div className="space-y-1.5">
                <Label>💳 Tipo de Conta *</Label>
                <Select value={formData.tipo_conta} onValueChange={v => set('tipo_conta', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Corrente">Corrente</SelectItem>
                    <SelectItem value="Poupança">Poupança</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Section>

          {/* Ações */}
          <div className="flex gap-2 justify-end pt-6 border-t">
            <Button
              type="submit"
              className="bg-black hover:bg-gray-800 text-white"
              disabled={saveMutation.isPending || !isComplete}
            >
              {saveMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
              ) : (
                'Salvar Dados'
              )}
            </Button>
          </div>
        </form>

      </div>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-black border-b pb-2">{title}</h2>
      {children}
    </div>
  );
}

export default function MeusDados() {
  return <RequireAuth requireRole={['admin', 'COORDENADOR', 'user']}><MeusDadosInner /></RequireAuth>;
}