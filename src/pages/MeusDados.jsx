import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import ContractAutoFill, { applyAiSuggestions } from '@/components/users/ContractAutoFill';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { isCoordGeral } from '@/components/auth/permissions';
import DeleteAccountDialog from '@/components/auth/DeleteAccountDialog';
import { buildTeamMemberFormPreset } from '@/lib/teamRegistryBase';

const FORM_FIELDS = [
  { name: 'email_pessoal', label: 'Email Pessoal', type: 'email' },
  { name: 'telefone', label: 'Telefone de Contato', type: 'tel' },
  { name: 'cpf', label: 'CPF', type: 'text' },
];

const EMPRESA_FIELDS = [
  { name: 'empresa_nome', label: 'Razão Social / Nome da Empresa', type: 'text' },
  { name: 'empresa_endereco', label: 'Endereço', type: 'text' },
  { name: 'representante_legal_nome', label: 'Nome do Representante Legal', type: 'text' },
  { name: 'representante_legal_cpf', label: 'CPF do Representante', type: 'text' },
];

const BANKING_FIELDS = [
  { name: 'banco', label: 'Banco', type: 'text' },
  { name: 'agencia', label: 'Agência', type: 'text' },
  { name: 'conta', label: 'Conta', type: 'text' },
  { name: 'pix_key', label: 'Chave PIX (opcional)', type: 'text' },
];

const TEAM_LINK_FIELDS = [
  { name: 'funcao_institucional', label: 'Função no projeto', type: 'text' },
  { name: 'valor_referencia', label: 'Valor de referência do vínculo', type: 'text' },
  { name: 'inicio_vinculo_referencia', label: 'Início do vínculo / contratação', type: 'text' },
];

const EMPTY_FORM = {
  email_pessoal: '',
  telefone: '',
  cpf: '',
  tipo_pessoa: 'PF',
  cnpj: '',
  empresa_nome: '',
  empresa_endereco: '',
  representante_legal_nome: '',
  representante_legal_cpf: '',
  cargo_representante: '',
  banco: '',
  agencia: '',
  conta: '',
  tipo_conta: 'Corrente',
  pix_key: '',
  funcao_institucional: '',
  valor_referencia: '',
  inicio_vinculo_referencia: '',
};

function mergeWithoutOverwrite(current, incoming) {
  return {
    ...current,
    email_pessoal: current.email_pessoal || incoming.email_pessoal || '',
    telefone: current.telefone || incoming.telefone || '',
    cpf: current.cpf || incoming.cpf || '',
    tipo_pessoa: current.tipo_pessoa || incoming.tipo_pessoa || 'PF',
    cnpj: current.cnpj || incoming.cnpj || '',
    empresa_nome: current.empresa_nome || incoming.empresa_nome || '',
    empresa_endereco: current.empresa_endereco || incoming.empresa_endereco || '',
    representante_legal_nome: current.representante_legal_nome || incoming.representante_legal_nome || '',
    representante_legal_cpf: current.representante_legal_cpf || incoming.representante_legal_cpf || '',
    cargo_representante: current.cargo_representante || incoming.cargo_representante || '',
    banco: current.banco || incoming.banco || '',
    agencia: current.agencia || incoming.agencia || '',
    conta: current.conta || incoming.conta || '',
    tipo_conta: current.tipo_conta || incoming.tipo_conta || 'Corrente',
    pix_key: current.pix_key || incoming.pix_key || '',
    funcao_institucional: current.funcao_institucional || incoming.funcao_institucional || '',
    valor_referencia: current.valor_referencia || incoming.valor_referencia || '',
    inicio_vinculo_referencia: current.inicio_vinculo_referencia || incoming.inicio_vinculo_referencia || '',
  };
}

function mapUserToForm(u) {
  return {
    email_pessoal: u?.email_pessoal || '',
    telefone: u?.telefone || '',
    cpf: u?.cpf || '',
    tipo_pessoa: u?.tipo_pessoa || 'PF',
    cnpj: u?.cnpj || '',
    empresa_nome: u?.empresa_nome || '',
    empresa_endereco: u?.empresa_endereco || '',
    representante_legal_nome: u?.representante_legal_nome || '',
    representante_legal_cpf: u?.representante_legal_cpf || '',
    cargo_representante: u?.cargo_representante || '',
    banco: u?.banco || '',
    agencia: u?.agencia || '',
    conta: u?.conta || '',
    tipo_conta: u?.tipo_conta || 'Corrente',
    pix_key: u?.pix_key || '',
    funcao_institucional: u?.funcao_institucional || '',
    valor_referencia: u?.valor_referencia || '',
    inicio_vinculo_referencia: u?.inicio_vinculo_referencia || '',
  };
}

function mapMemberToForm(member) {
  return {
    email_pessoal: member?.email_pessoal || '',
    telefone: member?.telefone || '',
    cpf: member?.cpf || '',
    tipo_pessoa: member?.tipo_pessoa || 'PF',
    cnpj: member?.cnpj || '',
    empresa_nome: member?.empresa_nome || '',
    empresa_endereco: member?.empresa_endereco || '',
    representante_legal_nome: member?.representante_legal_nome || '',
    representante_legal_cpf: member?.representante_legal_cpf || '',
    cargo_representante: member?.cargo_representante || '',
    banco: member?.banco || '',
    agencia: member?.agencia || '',
    conta: member?.conta || '',
    tipo_conta: member?.tipo_conta || 'Corrente',
    pix_key: member?.pix_key || '',
    funcao_institucional: member?.funcao_institucional || member?.funcao || '',
    valor_referencia: member?.valor_referencia || '',
    inicio_vinculo_referencia: member?.inicio_vinculo_referencia || member?.data_inicio_contrato || '',
  };
}

function resolveFuncao(currentMember, targetUser) {
  return String(
    currentMember?.funcao ||
    currentMember?.role ||
    targetUser?.funcao ||
    targetUser?.role ||
    ''
  ).trim();
}

function MeusDadosInner() {
  const [user, setUser] = useState(null);
  const [coordGeral, setCoordGeral] = useState(false);
  const [isSponsor, setIsSponsor] = useState(false);
  const [selectedUserEmail, setSelectedUserEmail] = useState(null);
  const manualFields = useRef(new Set());
  const [aiApplied, setAiApplied] = useState({});
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [autoFillLoading, setAutoFillLoading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    base44.auth.me().then((u) => {
      if (!u) {
        setUser(null);
        return;
      }
      setUser(u);
      setCoordGeral(isCoordGeral(u));
      setIsSponsor(u.role === 'PATROCINADOR' || u.role === 'OBSERVADOR');
      setFormData(mapUserToForm(u));
    }).catch(() => setUser(null));
  }, []);

  const { data: teamData = [] } = useQuery({
    queryKey: ['team-members', user?.email],
    queryFn: () => base44.entities.TeamMember.list(),
    enabled: !!user?.email,
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ['all-users-meudados'],
    queryFn: () => base44.entities.User.list(),
    enabled: coordGeral,
  });

  const targetEmail = selectedUserEmail || user?.email;
  const targetUser = selectedUserEmail ? allUsers.find((u) => u.email === selectedUserEmail) : user;

  useEffect(() => {
    if (!user?.email) return;

    if (!selectedUserEmail) {
      setFormData((prev) => mergeWithoutOverwrite(prev, mapUserToForm(user)));
    }
  }, [user?.email, selectedUserEmail, user]);

  useEffect(() => {
    if (!teamData?.length || !user?.email) return;

    if (!selectedUserEmail) {
      const currentMember = teamData.find((m) => m.user_email === user.email);
      if (currentMember) {
        setFormData((prev) => mergeWithoutOverwrite(prev, mapMemberToForm(currentMember)));
      }
    }
  }, [teamData, user?.email, selectedUserEmail, user]);

  useEffect(() => {
    if (!selectedUserEmail || !teamData.length) return;
    const member = teamData.find((m) => m.user_email === selectedUserEmail);
    if (member) {
      setFormData(mapMemberToForm(member));
    } else {
      setFormData(EMPTY_FORM);
    }
  }, [selectedUserEmail, teamData]);

  useEffect(() => {
    if (!targetEmail) return;
    const preset = buildTeamMemberFormPreset(targetEmail);
    if (!preset) return;
    setFormData((prev) => mergeWithoutOverwrite(prev, preset));
  }, [targetEmail]);

  useEffect(() => {
    if (!targetEmail || isSponsor) return;

    let active = true;

    const runAutoComplete = async () => {
      try {
        setAutoFillLoading(true);
        const existingMember = teamData.find((m) => m.user_email === targetEmail);
        const res = await base44.functions.invoke('ensureTeamMemberDataComplete', {
          team_member_id: existingMember?.id,
          user_email: targetEmail,
        });

        const member = res?.data?.member || null;
        if (!active || !member) return;

        setFormData((prev) => mergeWithoutOverwrite(prev, mapMemberToForm(member)));
      } catch (e) {
        console.warn('Erro auto-complete (não bloqueante)', e);
      } finally {
        if (active) setAutoFillLoading(false);
      }
    };

    runAutoComplete();
    return () => { active = false; };
  }, [targetEmail, isSponsor, teamData]);

  const isComplete = isSponsor
    ? !!(formData.email_pessoal && formData.telefone)
    : !!(
        formData.email_pessoal &&
        formData.telefone &&
        formData.cpf &&
        formData.banco &&
        formData.agencia &&
        formData.conta &&
        (formData.tipo_pessoa === 'PF' || (formData.cnpj && formData.empresa_nome))
      );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserEmail) {
        await base44.auth.updateMe(formData);
      }

      const currentMember = teamData.find((m) => m.user_email === targetEmail);
      const funcaoResolvida = resolveFuncao(currentMember, targetUser);

      const teamPayload = {
        user_email: targetEmail,
        user_name: targetUser?.full_name || '',
        tipo_equipe: targetUser?.equipe || '',
        funcao: funcaoResolvida,
        role: funcaoResolvida,
        email_pessoal: formData.email_pessoal,
        telefone: formData.telefone,
        cpf: formData.cpf,
        tipo_pessoa: formData.tipo_pessoa,
        cnpj: formData.cnpj,
        empresa_nome: formData.empresa_nome,
        empresa_endereco: formData.empresa_endereco,
        representante_legal_nome: formData.representante_legal_nome,
        representante_legal_cpf: formData.representante_legal_cpf,
        cargo_representante: formData.cargo_representante,
        banco: formData.banco,
        agencia: formData.agencia,
        conta: formData.conta,
        tipo_conta: formData.tipo_conta,
        pix_key: formData.pix_key,
        funcao_institucional: formData.funcao_institucional,
        valor_referencia: formData.valor_referencia,
        inicio_vinculo_referencia: formData.inicio_vinculo_referencia,
      };

      if (currentMember) {
        await base44.entities.TeamMember.update(currentMember.id, teamPayload).catch(() => null);
      } else {
        await base44.entities.TeamMember.create(teamPayload).catch(() => null);
      }

      // Atualização de dados pessoais não deve gerar aviso para terceiros.
    },
    onSuccess: () => toast.success('Dados salvos com sucesso!'),
    onError: () => toast.error('Erro ao salvar dados.'),
  });

  const set = (key, value) => {
    manualFields.current.add(key);
    setFormData((prev) => ({ ...prev, [key]: value }));
  };

  const resetAiTracking = () => {
    manualFields.current = new Set();
    setAiApplied({});
  };

  const handleAiApply = useCallback((suggestions) => {
    setFormData((prev) => applyAiSuggestions(prev, suggestions, manualFields.current));
    setAiApplied(suggestions);
  }, []);

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
        <div className="mb-10">
          <h1 className="text-3xl font-semibold text-black mb-2">
            {selectedUserEmail ? `Informações de ${targetUser?.full_name || selectedUserEmail}` : 'Informações'}
          </h1>
          <p className="text-gray-600">
            {isSponsor ? 'Atualize seus dados pessoais' : 'Preencha suas informações pessoais e bancárias para a equipe'}
          </p>
        </div>

        {coordGeral && (
          <div className="mb-8 p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
            <Label className="text-sm font-semibold text-slate-700">Editar dados de outro usuário</Label>
            <Select
              value={selectedUserEmail || '__own__'}
              onValueChange={(v) => {
                setSelectedUserEmail(v === '__own__' ? null : v);
                resetAiTracking();
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__own__">— Meus próprios dados —</SelectItem>
                {allUsers.filter((u) => u.email !== user?.email).map((u) => (
                  <SelectItem key={u.email} value={u.email}>
                    {u.full_name} ({u.email})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {!isSponsor && (
          <ContractAutoFill
            userEmail={targetEmail}
            onApply={handleAiApply}
            appliedFields={aiApplied}
          />
        )}

        {autoFillLoading && !isSponsor && (
          <div className="mb-6 p-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-sm flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Buscando dados de contratação na base e preenchendo apenas campos vazios.
          </div>
        )}

        <div className={`mb-8 p-4 border rounded-lg flex items-start gap-3 ${isComplete ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          {isComplete ? (
            <>
              <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-green-900">Informações Completas</p>
                <p className="text-xs text-green-700 mt-0.5">Todas as informações foram preenchidas</p>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-amber-900">Informações Incompletas</p>
                <p className="text-xs text-amber-700 mt-0.5">Você pode preencher manualmente qualquer campo abaixo.</p>
              </div>
            </>
          )}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); saveMutation.mutate(); }} className="space-y-8">
          <Section title="Dados Pessoais">
            {FORM_FIELDS.map((field) => (
              <div key={field.name} className="space-y-1.5">
                <Label>{field.label}</Label>
                <Input
                  type={field.type}
                  value={formData[field.name] || ''}
                  onChange={(e) => set(field.name, e.target.value)}
                  placeholder={field.label}
                />
              </div>
            ))}

            <div className="space-y-1.5">
              <Label>Tipo de Pessoa</Label>
              <Select value={formData.tipo_pessoa} onValueChange={(v) => set('tipo_pessoa', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">Pessoa Física (PF)</SelectItem>
                  <SelectItem value="MEI">MEI</SelectItem>
                  <SelectItem value="ME">ME (Microempresa)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {formData.tipo_pessoa !== 'PF' && (
              <div className="space-y-1.5">
                <Label>CNPJ</Label>
                <Input
                  value={formData.cnpj}
                  onChange={(e) => set('cnpj', e.target.value)}
                  placeholder="00.000.000/0001-00"
                />
              </div>
            )}
          </Section>

          {formData.tipo_pessoa !== 'PF' && (
            <Section title="Dados da Empresa">
              {EMPRESA_FIELDS.map((field) => (
                <div key={field.name} className="space-y-1.5">
                  <Label>{field.label}</Label>
                  <Input
                    type={field.type}
                    value={formData[field.name] || ''}
                    onChange={(e) => set(field.name, e.target.value)}
                    placeholder={field.label}
                  />
                </div>
              ))}

              <div className="space-y-1.5">
                <Label>Cargo do Representante</Label>
                <Select value={formData.cargo_representante} onValueChange={(v) => set('cargo_representante', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cargo" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Sócio-Gerente">Sócio-Gerente</SelectItem>
                    <SelectItem value="Diretor">Diretor</SelectItem>
                    <SelectItem value="Gerente">Gerente</SelectItem>
                    <SelectItem value="Procurador">Procurador</SelectItem>
                    <SelectItem value="Outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Section>
          )}

          {!isSponsor && (
            <Section title="Vínculo com a Equipe">
              <div className="space-y-1.5">
                <Label>Função cadastrada no sistema</Label>
                <Input
                  value={resolveFuncao(teamData.find((m) => m.user_email === targetEmail), targetUser) || ''}
                  readOnly
                  placeholder="Função vinculada ao usuário"
                  className="bg-slate-50"
                />
              </div>

              {TEAM_LINK_FIELDS.map((field) => (
                <div key={field.name} className="space-y-1.5">
                  <Label>{field.label}</Label>
                  <Input
                    type={field.type}
                    value={formData[field.name] || ''}
                    onChange={(e) => set(field.name, e.target.value)}
                    placeholder={field.label}
                  />
                </div>
              ))}
            </Section>
          )}

          {!isSponsor && (
            <Section title="Dados Bancários">
              <div className="space-y-4">
                {BANKING_FIELDS.map((field) => (
                  <div key={field.name} className="space-y-1.5">
                    <Label>{field.label}</Label>
                    <Input
                      type={field.type}
                      value={formData[field.name] || ''}
                      onChange={(e) => set(field.name, e.target.value)}
                      placeholder={field.label}
                    />
                  </div>
                ))}

                <div className="space-y-1.5">
                  <Label>Tipo de Conta</Label>
                  <Select value={formData.tipo_conta} onValueChange={(v) => set('tipo_conta', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Corrente">Corrente</SelectItem>
                      <SelectItem value="Poupança">Poupança</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Section>
          )}

          <div className="flex gap-2 justify-end pt-6 border-t">
            <Button
              type="submit"
              className="bg-black hover:bg-gray-800 text-white"
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...
                </>
              ) : (
                'Salvar Dados'
              )}
            </Button>
          </div>
        </form>

        {!selectedUserEmail && (
          <div className="mt-12 pt-8 border-t space-y-4">
            <h3 className="text-lg font-semibold text-red-600">Zona de Perigo</h3>
            <p className="text-sm text-gray-600">
              Deletar sua conta removerá permanentemente todos os seus dados do sistema.
            </p>
            <Button
              variant="destructive"
              onClick={() => setShowDeleteDialog(true)}
              className="w-full bg-red-600 hover:bg-red-700"
            >
              Deletar Minha Conta
            </Button>
          </div>
        )}

        <DeleteAccountDialog
          userEmail={user?.email}
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
        />
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
  return (
    <RequireAuth>
      <MeusDadosInner />
    </RequireAuth>
  );
}
