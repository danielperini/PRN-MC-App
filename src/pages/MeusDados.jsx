import React, { useState, useEffect, useRef, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { applyAiSuggestions } from '@/components/users/ContractAutoFill';
import { useMutation, useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Loader2, Sparkles, ChevronDown, ChevronUp, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { isCoordGeral } from '@/components/auth/permissions';
import DeleteAccountDialog from '@/components/auth/DeleteAccountDialog';
import { buildTeamMemberFormPreset } from '@/lib/teamRegistryBase';
import AtividadesMetasTab from '@/components/meus-dados/AtividadesMetasTab';
import DocumentosTab from '@/components/meus-dados/DocumentosTab';
import MinhaGaleriaTab from '@/components/meus-dados/MinhaGaleriaTab';
import AiContractSuggestionsBanner from '@/components/meus-dados/AiContractSuggestionsBanner';
import ConvidarCadastroPanel from '@/components/meus-dados/ConvidarCadastroPanel';

const EMPTY_FORM = {
  email_pessoal: '',
  telefone: '',
  celular: '',
  cpf: '',
  endereco_residencial: '',
  contato_emergencia_nome: '',
  contato_emergencia_telefone: '',
  museu_vinculado: '',
  regime_trabalho: '',
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
  funcao: '',
  inicio_vinculo_referencia: '',
  data_inicio_contrato: '',
  data_fim_contrato: '',
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
    regime_trabalho: pick('regime_trabalho'),
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
    funcao: pick('funcao'),
    inicio_vinculo_referencia: pick('inicio_vinculo_referencia'),
    data_inicio_contrato: pick('data_inicio_contrato'),
    data_fim_contrato: pick('data_fim_contrato'),
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
    regime_trabalho: f('regime_trabalho'),
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
    funcao: f('funcao'),
    inicio_vinculo_referencia: f('inicio_vinculo_referencia'),
    data_inicio_contrato: f('data_inicio_contrato'),
    data_fim_contrato: f('data_fim_contrato'),
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
    regime_trabalho: f('regime_trabalho'),
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
    funcao: f('funcao') || f('funcao_institucional'),
    inicio_vinculo_referencia: f('inicio_vinculo_referencia') || f('data_inicio_contrato'),
    data_inicio_contrato: f('data_inicio_contrato'),
    data_fim_contrato: f('data_fim_contrato'),
  };
}

function Section({ title, children }) {
  return (
    <div className="space-y-4">
      <h2 className="text-base font-semibold text-gray-900 border-b pb-2">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

// Banner IA compacto — apenas ícone + texto curto
function IaBannerCompacto({ userEmail, onConfirm, appliedFields }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5 hover:bg-amber-100 transition-colors"
      >
        <Sparkles className="w-3.5 h-3.5" />
        {Object.keys(appliedFields || {}).length > 0
          ? `✓ ${Object.keys(appliedFields).length} campos via IA`
          : 'Preencher com IA'}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-2">
          <AiContractSuggestionsBanner
            userEmail={userEmail}
            onConfirm={(sug) => { onConfirm(sug); setOpen(false); }}
            appliedFields={appliedFields}
          />
        </div>
      )}
    </>
  );
}

function DadosPessoaisTab({
  user, isSponsor, coordGeral, selectedUserEmail, setSelectedUserEmail,
  allUsers, teamData, targetEmail, targetUser, formData, set,
  autoFillLoading, isComplete, saveMutation, aiApplied, handleAiConfirm,
  showDeleteDialog, setShowDeleteDialog, resetAiTracking,
}) {
  const [mesmoDadosTitular, setMesmoDadosTitular] = useState(false);
  const [bancarioAviso, setBancarioAviso] = useState(false);

  // Sincroniza checkbox "mesmos dados"
  useEffect(() => {
    if (mesmoDadosTitular) {
      set('representante_legal_nome', formData.user_name || targetUser?.full_name || '');
      set('representante_legal_cpf', formData.cpf);
    }
  }, [mesmoDadosTitular, formData.cpf]);

  const isPJ = formData.tipo_pessoa && formData.tipo_pessoa !== 'PF';

  function handleSubmit(e) {
    e.preventDefault();
    const hasPix = !!formData.pix_key?.trim();
    const hasBancario = !!(formData.banco?.trim() && formData.agencia?.trim() && formData.conta?.trim());
    if (!hasPix && !hasBancario) {
      setBancarioAviso(true);
      return;
    }
    setBancarioAviso(false);
    saveMutation.mutate();
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Seletor de usuário (coordGeral) */}
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
            <SelectTrigger><SelectValue /></SelectTrigger>
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

      {/* Banner IA compacto */}
      {!isSponsor && (
        <IaBannerCompacto
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

      {/* Status de preenchimento */}
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
              <p className="text-xs text-amber-700 mt-0.5">Preencha os campos abaixo. Use ✨ para sugestões da IA.</p>
            </div>
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* DADOS PESSOAIS */}
        <Section title="Dados Pessoais">
          <Field label="Email Pessoal">
            <Input type="email" value={formData.email_pessoal || ''} onChange={(e) => set('email_pessoal', e.target.value)} placeholder="email@pessoal.com" />
          </Field>
          <Field label="Telefone de Contato">
            <Input type="tel" value={formData.telefone || ''} onChange={(e) => set('telefone', e.target.value)} placeholder="(00) 00000-0000" />
          </Field>
          <Field label="CPF">
            <Input value={formData.cpf || ''} onChange={(e) => set('cpf', e.target.value)} placeholder="000.000.000-00" />
          </Field>
        </Section>

        {/* VÍNCULO COM A EQUIPE */}
        {!isSponsor && (
          <Section title="Vínculo com a Equipe">
            <Field label="Função">
              <Input value={formData.funcao || ''} onChange={(e) => set('funcao', e.target.value)} placeholder="Ex: Educador, Produtor Cultural, Designer" />
            </Field>
            <Field label="Início do vínculo / contratação">
              <Input value={formData.inicio_vinculo_referencia || ''} onChange={(e) => set('inicio_vinculo_referencia', e.target.value)} placeholder="Ex: Janeiro/2025" />
            </Field>
            <Field label="Início do contrato">
              <Input type="date" value={formData.data_inicio_contrato || ''} onChange={(e) => set('data_inicio_contrato', e.target.value)} />
            </Field>
            <Field label="Fim do contrato">
              <Input type="date" value={formData.data_fim_contrato || ''} onChange={(e) => set('data_fim_contrato', e.target.value)} />
            </Field>
            <Field label="Regime de Trabalho">
              <Select value={formData.regime_trabalho || ''} onValueChange={(v) => set('regime_trabalho', v)}>
                <SelectTrigger><SelectValue placeholder="Selecione o regime" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Presencial">Presencial</SelectItem>
                  <SelectItem value="Home Office">Home Office</SelectItem>
                  <SelectItem value="Híbrido">Híbrido</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </Section>
        )}

        {/* DADOS PJ/MEI — condicional */}
        {!isSponsor && isPJ && (
          <Section title="Dados da Empresa (PJ/MEI)">
            <Field label="Tipo de Empresa">
              <Select value={formData.tipo_pessoa} onValueChange={(v) => set('tipo_pessoa', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEI">MEI</SelectItem>
                  <SelectItem value="ME">ME (Microempresa)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="CNPJ">
              <Input value={formData.cnpj || ''} onChange={(e) => set('cnpj', e.target.value)} placeholder="00.000.000/0001-00" />
            </Field>
            <Field label="Razão Social / Nome da Empresa">
              <Input value={formData.empresa_nome || ''} onChange={(e) => set('empresa_nome', e.target.value)} placeholder="Nome da empresa" />
            </Field>
            <Field label="Endereço da Empresa">
              <Input value={formData.empresa_endereco || ''} onChange={(e) => set('empresa_endereco', e.target.value)} placeholder="Rua, número, cidade" />
            </Field>

            {/* Checkbox mesmos dados */}
            <div className={`flex items-center gap-2 py-2 rounded-lg transition-all ${mesmoDadosTitular ? 'border-l-2 border-amber-300 bg-amber-50 pl-3' : ''}`}>
              <input
                id="mesmo-titular"
                type="checkbox"
                checked={mesmoDadosTitular}
                onChange={(e) => setMesmoDadosTitular(e.target.checked)}
                className="w-4 h-4 rounded"
              />
              <label htmlFor="mesmo-titular" className="text-sm text-gray-700 cursor-pointer">
                Meus dados pessoais são os mesmos do titular da empresa
              </label>
            </div>

            <Field label="Nome do Representante Legal">
              <Input
                value={formData.representante_legal_nome || ''}
                onChange={(e) => set('representante_legal_nome', e.target.value)}
                placeholder="Nome completo"
                readOnly={mesmoDadosTitular}
                className={mesmoDadosTitular ? 'bg-amber-50 border-amber-200' : ''}
              />
            </Field>
            <Field label="CPF do Representante">
              <Input
                value={formData.representante_legal_cpf || ''}
                onChange={(e) => set('representante_legal_cpf', e.target.value)}
                placeholder="000.000.000-00"
                readOnly={mesmoDadosTitular}
                className={mesmoDadosTitular ? 'bg-amber-50 border-amber-200' : ''}
              />
            </Field>
            <Field label="Cargo do Representante">
              <Input value={formData.cargo_representante || ''} onChange={(e) => set('cargo_representante', e.target.value)} placeholder="Ex: Sócio-administrador" />
            </Field>
          </Section>
        )}

        {/* Seletor de tipo de pessoa — só para PF aparece aqui */}
        {!isSponsor && !isPJ && (
          <Section title="Tipo de Vínculo">
            <Field label="Tipo de Pessoa">
              <Select value={formData.tipo_pessoa} onValueChange={(v) => set('tipo_pessoa', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">Pessoa Física (PF)</SelectItem>
                  <SelectItem value="MEI">MEI</SelectItem>
                  <SelectItem value="ME">ME (Microempresa)</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </Section>
        )}

        {/* DADOS BANCÁRIOS */}
        {!isSponsor && (
          <Section title="Dados Bancários">
            <p className="text-xs text-muted-foreground -mt-2">Preencha ao menos a Chave PIX ou os dados bancários tradicionais.</p>
            <div className="space-y-3">
              <Field label="Chave PIX">
                <Input value={formData.pix_key || ''} onChange={(e) => set('pix_key', e.target.value)} placeholder="CPF, e-mail, telefone ou chave aleatória" />
              </Field>
              <div className="border-t pt-3 space-y-3">
                <p className="text-xs font-medium text-gray-600">Dados bancários tradicionais</p>
                <Field label="Banco">
                  <Input value={formData.banco || ''} onChange={(e) => set('banco', e.target.value)} placeholder="Nome do banco" />
                </Field>
                <Field label="Agência">
                  <Input value={formData.agencia || ''} onChange={(e) => set('agencia', e.target.value)} placeholder="0000" />
                </Field>
                <Field label="Conta">
                  <Input value={formData.conta || ''} onChange={(e) => set('conta', e.target.value)} placeholder="00000-0" />
                </Field>
                <Field label="Tipo de Conta">
                  <Select value={formData.tipo_conta || 'Corrente'} onValueChange={(v) => set('tipo_conta', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Corrente">Corrente</SelectItem>
                      <SelectItem value="Poupança">Poupança</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          </Section>
        )}

        {/* DADOS CONTRATUAIS */}
        {!isSponsor && (
          <Section title="Dados Contratuais">
            <Field label="Nº de Parcelas">
              <Input type="number" value={formData.contrato_num_parcelas || ''} onChange={(e) => set('contrato_num_parcelas', e.target.value)} placeholder="Ex: 12" />
            </Field>
            <Field label="Valor por Parcela (R$)">
              <Input type="number" value={formData.contrato_valor_parcela || ''} onChange={(e) => set('contrato_valor_parcela', e.target.value)} placeholder="Ex: 3500.00" />
            </Field>
          </Section>
        )}

        {/* Aviso bancário inline */}
        {bancarioAviso && (
          <div className="flex items-start gap-2 p-3 border border-amber-200 bg-amber-50 rounded-lg text-sm text-amber-800">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>Preencha ao menos a Chave PIX ou os dados bancários (banco, agência e conta) para salvar.</span>
          </div>
        )}

        <div className="flex gap-2 justify-end pt-6 border-t">
          <Button type="submit" className="bg-black hover:bg-gray-800 text-white" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</>
            ) : 'Salvar Dados'}
          </Button>
        </div>
      </form>

      {coordGeral && !selectedUserEmail && (
        <div className="mt-8">
          <ConvidarCadastroPanel allUsers={allUsers} teamData={teamData} />
        </div>
      )}

      {!selectedUserEmail && (
        <div className="mt-8 pt-8 border-t space-y-4">
          <h3 className="text-lg font-semibold text-red-600">Zona de Perigo</h3>
          <p className="text-sm text-gray-600">Deletar sua conta removerá permanentemente todos os seus dados do sistema.</p>
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)} className="w-full bg-red-600 hover:bg-red-700">
            Deletar Minha Conta
          </Button>
        </div>
      )}

      <DeleteAccountDialog userEmail={user?.email} open={showDeleteDialog} onOpenChange={setShowDeleteDialog} />
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
      if (!u) { setUser(null); return; }
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
    if (!user?.email || selectedUserEmail) return;
    setFormData((prev) => mergeWithoutOverwrite(prev, mapUserToForm(user)));
  }, [user?.email, selectedUserEmail, user]);

  useEffect(() => {
    if (!teamData?.length || !user?.email || selectedUserEmail) return;
    const currentMember = teamData.find((m) => m.user_email === user.email);
    if (currentMember) setFormData((prev) => mergeWithoutOverwrite(prev, mapMemberToForm(currentMember)));
  }, [teamData, user?.email, selectedUserEmail, user]);

  useEffect(() => {
    if (!selectedUserEmail || !teamData.length) return;
    const member = teamData.find((m) => m.user_email === selectedUserEmail);
    setFormData(member ? mapMemberToForm(member) : EMPTY_FORM);
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
        formData.email_pessoal && formData.telefone && formData.cpf &&
        (formData.pix_key || (formData.banco && formData.agencia && formData.conta)) &&
        (formData.tipo_pessoa === 'PF' || (formData.cnpj && formData.empresa_nome))
      );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!selectedUserEmail) await base44.auth.updateMe(formData);

      const currentMember = teamData.find((m) => m.user_email === targetEmail);
      const teamPayload = {
        user_email: targetEmail,
        user_name: targetUser?.full_name || '',
        tipo_equipe: targetUser?.equipe || '',
        funcao: formData.funcao,
        role: formData.funcao,
        funcao_institucional: formData.funcao,
        email_pessoal: formData.email_pessoal,
        telefone: formData.telefone,
        celular: formData.celular,
        cpf: formData.cpf,
        endereco_residencial: formData.endereco_residencial,
        contato_emergencia_nome: formData.contato_emergencia_nome,
        contato_emergencia_telefone: formData.contato_emergencia_telefone,
        museu_vinculado: formData.museu_vinculado,
        regime_trabalho: formData.regime_trabalho,
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
        inicio_vinculo_referencia: formData.inicio_vinculo_referencia,
        data_inicio_contrato: formData.data_inicio_contrato,
        data_fim_contrato: formData.data_fim_contrato,
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

  const handleAiConfirm = useCallback((suggestions) => {
    setFormData((prev) => {
      const next = { ...prev };
      for (const [key, s] of Object.entries(suggestions)) {
        if (!manualFields.current.has(key)) next[key] = s.aiValue;
      }
      return next;
    });
    setAiApplied((prev) => {
      const next = { ...prev };
      for (const [key, s] of Object.entries(suggestions)) next[key] = s;
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

  // Dados de exibição do cabeçalho
  const displayName = selectedUserEmail
    ? targetUser?.full_name || selectedUserEmail
    : user?.full_name || user?.email || '';
  const displayMuseu = teamMember?.museu_vinculado || teamMember?.museu_projeto || userMuseum || '';
  const displayFuncao = formData.funcao || teamMember?.funcao || teamMember?.funcao_institucional || '';

  return (
    <div className="min-h-screen bg-white pb-20">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-10">
        {/* CABEÇALHO */}
        <div className="mb-8 space-y-2">
          <h1 className="text-2xl font-bold text-gray-900">Espaço do Usuário</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-semibold text-gray-800">{displayName}</span>
            {displayMuseu && (
              <Badge className="bg-slate-100 text-slate-700 border border-slate-200 font-medium">
                {displayMuseu}
              </Badge>
            )}
            {displayFuncao && (
              <Badge variant="outline" className="text-gray-600 font-normal">
                {displayFuncao}
              </Badge>
            )}
          </div>
          <p className="text-sm text-gray-500">
            {isSponsor ? 'Atualize seus dados pessoais' : 'Gerencie seu perfil, galeria de fotos e documentos'}
          </p>
        </div>

        <Tabs defaultValue="perfil">
          <TabsList className="mb-6 w-full sm:w-auto flex-wrap gap-1">
            <TabsTrigger value="perfil">Meu Perfil</TabsTrigger>
            {!isSponsor && <TabsTrigger value="atividades">Atividades e Metas</TabsTrigger>}
            {!isSponsor && <TabsTrigger value="documentos">Documentos</TabsTrigger>}
            {!isSponsor && <TabsTrigger value="galeria">Minha Galeria</TabsTrigger>}
          </TabsList>

          <TabsContent value="perfil">
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
              handleAiConfirm={handleAiConfirm}
              showDeleteDialog={showDeleteDialog}
              setShowDeleteDialog={setShowDeleteDialog}
              resetAiTracking={resetAiTracking}
            />
          </TabsContent>

          {!isSponsor && (
            <TabsContent value="atividades">
              <AtividadesMetasTab targetEmail={targetEmail} userMuseum={userMuseum} />
            </TabsContent>
          )}

          {!isSponsor && (
            <TabsContent value="documentos">
              <DocumentosTab targetEmail={targetEmail} teamMember={teamMember} />
            </TabsContent>
          )}

          {!isSponsor && (
            <TabsContent value="galeria">
              <MinhaGaleriaTab targetEmail={targetEmail} />
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