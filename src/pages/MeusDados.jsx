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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { isCoordGeral } from '@/components/auth/permissions';
import DeleteAccountDialog from '@/components/auth/DeleteAccountDialog';
import { buildTeamMemberFormPreset } from '@/lib/teamRegistryBase';
import AtividadesMetasTab from '@/components/meus-dados/AtividadesMetasTab';
import DocumentosTab from '@/components/meus-dados/DocumentosTab';
import DadosExpandidosSection from '@/components/meus-dados/DadosExpandidosSection';
import AiContractSuggestionsBanner from '@/components/meus-dados/AiContractSuggestionsBanner';
import ConvidarCadastroPanel from '@/components/meus-dados/ConvidarCadastroPanel';

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
  celular: '',
  cpf: '',
  endereco_residencial: '',
  contato_emergencia_nome: '',
  contato_emergencia_telefone: '',
  museu_vinculado: '',
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
  contrato_num_parcelas: '',
  contrato_valor_parcela: '',
  funcao_institucional: '',
  valor_referencia: '',
  inicio_vinculo_referencia: '',
};

function mergeWithoutOverwrite(current, incoming) {
  const pick = (k, def = '') => current[k] || incoming[k] || def;
  return {
    ...current,
    email_pessoal: pick('email_pessoal'),
    telefone: pick('telefone'),
    celular: pick('celular'),
    cpf: pick('cpf'),
    endereco_residencial: pick('endereco_residencial'),
    contato_emergencia_nome: pick('contato_emergencia_nome'),
    contato_emergencia_telefone: pick('contato_emergencia_telefone'),
    museu_vinculado: pick('museu_vinculado'),
    tipo_pessoa: pick('tipo_pessoa', 'PF'),
    cnpj: pick('cnpj'),
    empresa_nome: pick('empresa_nome'),
    empresa_endereco: pick('empresa_endereco'),
    representante_legal_nome: pick('representante_legal_nome'),
    representante_legal_cpf: pick('representante_legal_cpf'),
    cargo_representante: pick('cargo_representante'),
    banco: pick('banco'),
    agencia: pick('agencia'),
    conta: pick('conta'),
    tipo_conta: pick('tipo_conta', 'Corrente'),
    pix_key: pick('pix_key'),
    contrato_num_parcelas: pick('contrato_num_parcelas'),
    contrato_valor_parcela: pick('contrato_valor_parcela'),
    funcao_institucional: pick('funcao_institucional'),
    valor_referencia: pick('valor_referencia'),
    inicio_vinculo_referencia: pick('inicio_vinculo_referencia'),
  };
}

function mapUserToForm(u) {
  const f = (k, d = '') => u?.[k] || d;
  return {
    email_pessoal: f('email_pessoal'),
    telefone: f('telefone'),
    celular: f('celular'),
    cpf: f('cpf'),
    endereco_residencial: f('endereco_residencial'),
    contato_emergencia_nome: f('contato_emergencia_nome'),
    contato_emergencia_telefone: f('contato_emergencia_telefone'),
    museu_vinculado: f('museu_vinculado'),
    tipo_pessoa: f('tipo_pessoa', 'PF'),
    cnpj: f('cnpj'),
    empresa_nome: f('empresa_nome'),
    empresa_endereco: f('empresa_endereco'),
    representante_legal_nome: f('representante_legal_nome'),
    representante_legal_cpf: f('representante_legal_cpf'),
    cargo_representante: f('cargo_representante'),
    banco: f('banco'),
    agencia: f('agencia'),
    conta: f('conta'),
    tipo_conta: f('tipo_conta', 'Corrente'),
    pix_key: f('pix_key'),
    contrato_num_parcelas: f('contrato_num_parcelas'),
    contrato_valor_parcela: f('contrato_valor_parcela'),
    funcao_institucional: f('funcao_institucional'),
    valor_referencia: f('valor_referencia'),
    inicio_vinculo_referencia: f('inicio_vinculo_referencia'),
  };
}

function mapMemberToForm(member) {
  const f = (k, d = '') => member?.[k] || d;
  return {
    email_pessoal: f('email_pessoal'),
    telefone: f('telefone'),
    celular: f('celular'),
    cpf: f('cpf'),
    endereco_residencial: f('endereco_residencial'),
    contato_emergencia_nome: f('contato_emergencia_nome'),
    contato_emergencia_telefone: f('contato_emergencia_telefone'),
    museu_vinculado: f('museu_vinculado') || f('museu') || f('centro_custo'),
    tipo_pessoa: f('tipo_pessoa', 'PF'),
    cnpj: f('cnpj'),
    empresa_nome: f('empresa_nome'),
    empresa_endereco: f('empresa_endereco'),
    representante_legal_nome: f('representante_legal_nome'),
    representante_legal_cpf: f('representante_legal_cpf'),
    cargo_representante: f('cargo_representante'),
    banco: f('banco'),
    agencia: f('agencia'),
    conta: f('conta'),
    tipo_conta: f('tipo_conta', 'Corrente'),
    pix_key: f('pix_key'),
    contrato_num_parcelas: f('contrato_num_parcelas'),
    contrato_valor_parcela: f('contrato_valor_parcela'),
    funcao_institucional: f('funcao_institucional') || f('funcao'),
    valor_referencia: f('valor_referencia'),
    inicio_vinculo_referencia: f('inicio_vinculo_referencia') || f('data_inicio_contrato'),
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

function Section({ title, children }) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-black border-b pb-2">{title}</h2>
      {children}
    </div>
  );
}

function DadosPessoaisTab({
  user, isSponsor, coordGeral, selectedUserEmail, setSelectedUserEmail,
  allUsers, teamData, targetEmail, targetUser, formData, set,
  autoFillLoading, isComplete, saveMutation, aiApplied, handleAiApply,
  handleAiConfirm, showDeleteDialog, setShowDeleteDialog, resetAiTracking,
}) {
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {coordGeral && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
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

      {/* Banner IA expandido com novos campos */}
      {!isSponsor && (
        <AiContractSuggestionsBanner
          userEmail={targetEmail}
          onConfirm={handleAiConfirm}
          appliedFields={aiApplied}
        />
      )}

      {autoFillLoading && !isSponsor && (
        <div className="p-3 rounded-lg border border-blue-200 bg-blue-50 text-blue-800 text-sm flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Buscando dados de contratação na base e preenchendo apenas campos vazios.
        </div>
      )}

      <div className={`p-4 border rounded-lg flex items-start gap-3 ${isComplete ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
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
              <p className="text-xs text-amber-700 mt-0.5">Preencha os campos abaixo. Campos com ✨ têm sugestão da IA.</p>
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
        </Section>

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

        {/* Campos expandidos (novos) */}
        {!isSponsor && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-black border-b pb-2">Informações Complementares</h2>
            <DadosExpandidosSection
              formData={formData}
              set={set}
              aiSuggestedFields={aiApplied}
            />
          </div>
        )}

        {!isSponsor && (
          <Section title="Dados Bancários">
            <div className="space-y-4">
              {BANKING_FIELDS.filter(f => f.name !== 'pix_key').map((field) => (
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
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Salvando...</>
            ) : (
              'Salvar Dados'
            )}
          </Button>
        </div>
      </form>

      {/* Painel admin de convite — apenas coordGeral */}
      {coordGeral && !selectedUserEmail && (
        <div className="mt-8">
          <ConvidarCadastroPanel allUsers={allUsers} teamData={teamData} />
        </div>
      )}

      {!selectedUserEmail && (
        <div className="mt-8 pt-8 border-t space-y-4">
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
  );
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

  const teamMember = teamData.find((m) => m.user_email === targetEmail) || null;
  const userMuseum = teamMember?.museu || teamMember?.centro_custo || null;

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
        formData.celular &&
        formData.cpf &&
        formData.endereco_residencial &&
        formData.contato_emergencia_nome &&
        formData.museu_vinculado &&
        formData.contrato_num_parcelas &&
        formData.contrato_valor_parcela &&
        formData.pix_key &&
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
        celular: formData.celular,
        cpf: formData.cpf,
        endereco_residencial: formData.endereco_residencial,
        contato_emergencia_nome: formData.contato_emergencia_nome,
        contato_emergencia_telefone: formData.contato_emergencia_telefone,
        museu_vinculado: formData.museu_vinculado,
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
        contrato_num_parcelas: formData.contrato_num_parcelas ? Number(formData.contrato_num_parcelas) : undefined,
        contrato_valor_parcela: formData.contrato_valor_parcela ? Number(formData.contrato_valor_parcela) : undefined,
        funcao_institucional: formData.funcao_institucional,
        valor_referencia: formData.valor_referencia,
        inicio_vinculo_referencia: formData.inicio_vinculo_referencia,
      };

      if (currentMember) {
        await base44.entities.TeamMember.update(currentMember.id, teamPayload).catch(() => null);
      } else {
        await base44.entities.TeamMember.create(teamPayload).catch(() => null);
      }
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

  // Novo: aplica sugestões do banner expandido (novos campos + campos existentes)
  const handleAiConfirm = useCallback((suggestions) => {
    setFormData((prev) => {
      const next = { ...prev };
      for (const [key, s] of Object.entries(suggestions)) {
        if (!manualFields.current.has(key)) {
          next[key] = s.aiValue;
        }
      }
      return next;
    });
    // Marca todos os campos sugeridos como "aplicados" para mostrar ✓ no banner
    setAiApplied((prev) => {
      const next = { ...prev };
      for (const [key, s] of Object.entries(suggestions)) {
        next[key] = s;
      }
      return next;
    });
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
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-black mb-1">
            {selectedUserEmail ? `Informações de ${targetUser?.full_name || selectedUserEmail}` : 'Informações'}
          </h1>
          <p className="text-gray-600">
            {isSponsor ? 'Atualize seus dados pessoais' : 'Preencha suas informações pessoais e acompanhe seu desempenho'}
          </p>
        </div>

        <Tabs defaultValue="dados">
          <TabsList className="mb-6 w-full sm:w-auto">
            <TabsTrigger value="dados">Dados Pessoais</TabsTrigger>
            {!isSponsor && <TabsTrigger value="atividades">Atividades e Metas</TabsTrigger>}
            {!isSponsor && <TabsTrigger value="documentos">Documentos</TabsTrigger>}
          </TabsList>

          <TabsContent value="dados">
            <DadosPessoaisTab
              user={user}
              isSponsor={isSponsor}
              coordGeral={coordGeral}
              selectedUserEmail={selectedUserEmail}
              setSelectedUserEmail={setSelectedUserEmail}
              allUsers={allUsers}
              teamData={teamData}
              targetEmail={targetEmail}
              targetUser={targetUser}
              formData={formData}
              set={set}
              autoFillLoading={autoFillLoading}
              isComplete={isComplete}
              saveMutation={saveMutation}
              aiApplied={aiApplied}
              handleAiApply={handleAiApply}
              handleAiConfirm={handleAiConfirm}
              showDeleteDialog={showDeleteDialog}
              setShowDeleteDialog={setShowDeleteDialog}
              resetAiTracking={resetAiTracking}
            />
          </TabsContent>

          {!isSponsor && (
            <TabsContent value="atividades">
              <AtividadesMetasTab
                targetEmail={targetEmail}
                userMuseum={userMuseum}
              />
            </TabsContent>
          )}

          {!isSponsor && (
            <TabsContent value="documentos">
              <DocumentosTab
                targetEmail={targetEmail}
                teamMember={teamMember}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
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