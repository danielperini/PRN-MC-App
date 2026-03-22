import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Upload, X, Sparkles, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useQuery } from '@tanstack/react-query';
import { CARGOS_PLANO_TRABALHO } from '@/components/planoTrabalho';

const DEFAULT_START_DATE = '2026-02-02';
const ANA_LUIZA_START_DATE = '2026-03-03';

const EMPTY_FORM = {
  user_email: '',
  user_name: '',
  email_pessoal: '',
  telefone: '',
  tipo_pessoa: 'PF',
  cpf: '',
  cnpj: '',
  funcao: '',
  empresa_nome: '',
  empresa_endereco: '',
  representante_legal_nome: '',
  representante_legal_cpf: '',
  cargo_representante: '',
  budgetline_id: '',
  contrato_url: '',
  descricao_contrato: '',
  objeto_contrato: '',
  data_inicio_contrato: '',
  data_fim_contrato: '',
  valor_total: 0,
  numero_parcelas: 1,
  parcelas_pagas: 0,
  valor_parcela: 0,
  cronograma_parcelas: [],
  banco: '',
  agencia: '',
  conta: '',
  tipo_conta: 'Corrente',
  pix_key: '',
  status: 'ATIVO',
};

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeForm(data) {
  return {
    ...EMPTY_FORM,
    ...(data || {}),
    valor_total: toNumber(data?.valor_total),
    numero_parcelas: Math.max(1, parseInt(data?.numero_parcelas, 10) || 1),
    parcelas_pagas: Math.max(0, parseInt(data?.parcelas_pagas, 10) || 0),
    valor_parcela: toNumber(data?.valor_parcela),
    cronograma_parcelas: Array.isArray(data?.cronograma_parcelas) ? data.cronograma_parcelas : [],
    status: data?.status || 'ATIVO',
  };
}

function getEquipeFinanceRules(funcao, userName) {
  const f = normalizeText(funcao);
  const nome = normalizeText(userName);
  const isAnaLuiza = nome.includes('ana luiza');

  const rules = [
    {
      match: ['coordenador geral'],
      rubricaKeywords: ['coordenador geral'],
      valorParcela: 7000,
      numeroParcelas: 10,
      objeto: 'Contratação de Coordenador Geral',
    },
    {
      match: ['assistente de coordenacao', 'assistente de coordenação'],
      rubricaKeywords: ['assistente de coordenacao', 'assistente de coordenação', 'assistente de coordenação e produção'],
      valorParcela: 5000,
      numeroParcelas: 10,
      objeto: 'Contratação de Assistente de Coordenação e Produção',
    },
    {
      match: ['consultoria de programacao', 'consultoria de programação'],
      rubricaKeywords: ['consultoria de programacao', 'consultoria de programação'],
      valorParcela: 6000,
      numeroParcelas: 5,
      objeto: 'Contratação de Consultoria de Programação',
    },
    {
      match: ['coordenador de comunicacao', 'coordenador de comunicação'],
      rubricaKeywords: ['coordenador comunicacao', 'coordenador comunicação'],
      valorParcela: 6000,
      numeroParcelas: 10,
      objeto: 'Contratação de Coordenador de Comunicação',
    },
    {
      match: ['analista adm', 'analista administrativo', 'analista financeira', 'analista adm. financeira'],
      rubricaKeywords: ['analista adm', 'analista financeiro', 'analista adm. financeira'],
      valorParcela: 5000,
      numeroParcelas: 10,
      objeto: 'Contratação de Analista Administrativo-Financeira',
    },
    {
      match: ['assistente administrativo'],
      rubricaKeywords: ['assistente administrativo'],
      valorParcela: 4000,
      numeroParcelas: 10,
      objeto: 'Contratação de Assistente Administrativo',
    },
    {
      match: ['producao', 'produção', 'produtor', 'produtora'],
      rubricaKeywords: ['producao mis', 'produção mis', 'producao mis/mumo/mhab', 'produção mis/mumo/mhab'],
      valorParcela: 4200,
      numeroParcelas: 9,
      objeto: 'Contratação de Produção MIS/MUMO/MHAB',
    },
    {
      match: ['assessor de imprensa', 'imprensa'],
      rubricaKeywords: ['assessor de imprensa'],
      valorParcela: 3000,
      numeroParcelas: 9,
      objeto: 'Contratação de Assessor de Imprensa',
    },
    {
      match: ['rede social', 'marketing', 'marketing cultural', 'social media'],
      rubricaKeywords: ['rede social', 'marketing cultural'],
      valorParcela: 2500,
      numeroParcelas: 9,
      objeto: 'Contratação de Rede Social / Marketing Cultural',
    },
    {
      match: ['designer'],
      rubricaKeywords: ['designer'],
      valorParcela: 5200,
      numeroParcelas: 10,
      objeto: 'Contratação de Designer',
    },
    {
      match: ['fotografo', 'fotógrafo', 'fotografia'],
      rubricaKeywords: ['fotografo', 'fotógrafo'],
      valorParcela: 1000,
      numeroParcelas: 9,
      objeto: 'Contratação de Fotógrafo',
    },
    {
      match: ['educador'],
      rubricaKeywords: ['educador mis', 'educador mumo', 'educador mhab'],
      valorParcela: 4600,
      numeroParcelas: 10,
      objeto: 'Contratação de Educador MIS / MUMO / MHAB',
    },
  ];

  const found = rules.find(rule => rule.match.some(term => f.includes(term)));
  if (!found) return null;

  return {
    ...found,
    parcelas_pagas: isAnaLuiza ? 0 : 1,
    data_inicio_contrato: isAnaLuiza ? ANA_LUIZA_START_DATE : DEFAULT_START_DATE,
    valor_total: found.valorParcela * found.numeroParcelas,
  };
}

function findBudgetLineByRule(budgetLines, rule) {
  if (!rule || !Array.isArray(budgetLines)) return null;

  return budgetLines.find(bl => {
    if (!bl || bl.ativo === false) return false;

    const text = normalizeText(`${bl.codigo || ''} ${bl.nome || ''} ${bl.descricao || ''}`);
    return rule.rubricaKeywords.some(keyword => text.includes(normalizeText(keyword)));
  }) || null;
}

export default function TeamMemberForm({ isOpen, onClose, onSuccess, editingMember, budgetLines = [] }) {
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [form, setForm] = useState(normalizeForm(editingMember || EMPTY_FORM));
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(user => setCurrentUser(user)).catch(() => setCurrentUser(null));
  }, []);

  useEffect(() => {
    if (isOpen) {
      setForm(normalizeForm(editingMember || EMPTY_FORM));
    }
  }, [isOpen, editingMember]);

  const isEditingOwnData = editingMember && currentUser && editingMember.user_email === currentUser.email;

  const { data: users = [] } = useQuery({
    queryKey: ['users-list'],
    queryFn: () => base44.entities.User.list(),
    enabled: isOpen && !editingMember,
  });

  const { data: existingMembers = [] } = useQuery({
    queryKey: ['team-members'],
    queryFn: () => base44.entities.TeamMember.list(),
    enabled: isOpen && !editingMember,
  });

  const { data: termos = [] } = useQuery({
    queryKey: ['termos-compromisso'],
    queryFn: () => base44.entities.TermoCompromisso.list(),
    enabled: isOpen,
  });

  const availableUsers = users.filter(u => !existingMembers.some(m => m.user_email === u.email));

  const availableBudgetLines = useMemo(() => {
    return (budgetLines || [])
      .filter(bl => bl && bl.ativo !== false && (bl.aditivo === 3 || bl.aditivo === '3' || bl.aditivo === undefined || bl.aditivo === null))
      .sort((a, b) => {
        const aa = `${a?.codigo || ''} ${a?.nome || ''} ${a?.descricao || ''}`.toLowerCase();
        const bb = `${b?.codigo || ''} ${b?.nome || ''} ${b?.descricao || ''}`.toLowerCase();
        return aa.localeCompare(bb, 'pt-BR');
      });
  }, [budgetLines]);

  const parcelaCalculada = useMemo(() => {
    const total = toNumber(form.valor_total);
    const parcelas = Math.max(1, parseInt(form.numero_parcelas, 10) || 1);
    return total / parcelas;
  }, [form.valor_total, form.numero_parcelas]);

  const parcelasRestantes = useMemo(() => {
    const previstas = Math.max(1, parseInt(form.numero_parcelas, 10) || 1);
    const pagas = Math.max(0, parseInt(form.parcelas_pagas, 10) || 0);
    return Math.max(previstas - pagas, 0);
  }, [form.numero_parcelas, form.parcelas_pagas]);

  const saldoEstimadoContrato = useMemo(() => {
    const total = toNumber(form.valor_total);
    const pagas = Math.max(0, parseInt(form.parcelas_pagas, 10) || 0);
    return Math.max(total - pagas * parcelaCalculada, 0);
  }, [form.valor_total, form.parcelas_pagas, parcelaCalculada]);

  const preencherFormComTermo = (userEmail) => {
    const termoDoUsuario = termos.find(t => t.contratado_email === userEmail);
    if (termoDoUsuario) {
      const numeroParcelasTermo = Math.max(1, termoDoUsuario.parcelas?.length || 1);
      const valorTotalTermo = toNumber(termoDoUsuario.valor_total);

      setForm(prev => ({
        ...prev,
        objeto_contrato: termoDoUsuario.objeto || prev.objeto_contrato,
        descricao_contrato: termoDoUsuario.escopo || prev.descricao_contrato,
        data_inicio_contrato: termoDoUsuario.data_inicio || prev.data_inicio_contrato,
        data_fim_contrato: termoDoUsuario.data_fim || prev.data_fim_contrato,
        valor_total: valorTotalTermo || prev.valor_total,
        numero_parcelas: numeroParcelasTermo || prev.numero_parcelas,
        valor_parcela: valorTotalTermo ? (valorTotalTermo / numeroParcelasTermo) : prev.valor_parcela,
        banco: termoDoUsuario.contratado_banco || prev.banco,
        agencia: termoDoUsuario.contratado_agencia || prev.agencia,
        conta: termoDoUsuario.contratado_conta || prev.conta,
        tipo_conta: termoDoUsuario.tipo_conta || prev.tipo_conta,
        pix_key: termoDoUsuario.pix_key || prev.pix_key,
      }));
    }
  };

  const applyAutoFinanceByFuncao = (funcao, userName) => {
    const rule = getEquipeFinanceRules(funcao, userName);
    const matchedBudgetLine = findBudgetLineByRule(availableBudgetLines, rule);

    if (!rule) return;

    setForm(prev => ({
      ...prev,
      funcao,
      budgetline_id: matchedBudgetLine?.id || prev.budgetline_id || '',
      data_inicio_contrato: prev.data_inicio_contrato || rule.data_inicio_contrato,
      numero_parcelas: rule.numeroParcelas,
      parcelas_pagas: rule.parcelas_pagas,
      valor_parcela: rule.valorParcela,
      valor_total: rule.valor_total,
      objeto_contrato: prev.objeto_contrato || rule.objeto,
    }));
  };

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const handleContratoUpload = async (file) => {
    if (!file) return;

    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain'
    ];
    const allowedExts = ['.pdf', '.doc', '.docx', '.txt'];

    if (!allowedTypes.includes(file.type) && !allowedExts.some(ext => file.name.toLowerCase().endsWith(ext))) {
      toast.error('Aceitos: PDF, DOC, DOCX ou TXT');
      return;
    }

    setAiLoading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      setForm(prev => ({
        ...prev,
        contrato_url: file_url,
      }));

      toast.success('Contrato anexado com sucesso');
    } catch (error) {
      console.error('Erro no upload do contrato:', error);
      toast.error('Erro ao anexar contrato: ' + error.message);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const numeroParcelas = Math.max(1, parseInt(form.numero_parcelas, 10) || 1);
      const parcelasPagas = Math.max(0, parseInt(form.parcelas_pagas, 10) || 0);
      const valorTotal = toNumber(form.valor_total);
      const valorParcela = valorTotal / numeroParcelas;

      const data = {
        ...form,
        valor_total: valorTotal,
        numero_parcelas: numeroParcelas,
        parcelas_pagas: parcelasPagas,
        valor_parcela: valorParcela,
        data_criacao: form.data_criacao || new Date().toISOString().split('T')[0],
        status: form.status || 'ATIVO',
      };

      let memberId;
      if (editingMember?.id) {
        await base44.entities.TeamMember.update(editingMember.id, data);
        memberId = editingMember.id;
      } else {
        const created = await base44.entities.TeamMember.create(data);
        memberId = created.id;
      }

      if (form.contrato_url && memberId) {
        try {
          const driveRes = await base44.functions.invoke('saveContractToDrive', {
            file_url: form.contrato_url,
            member_name: form.user_name,
            member_id: memberId,
          });

          await base44.entities.TeamMember.update(memberId, {
            contrato_url: driveRes.data.driveLink,
          });

          const fileName = `Contrato_${form.user_name?.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}`;
          await base44.entities.Attachment.create({
            activity_id: memberId,
            file_name: fileName,
            file_type: 'application/pdf',
            file_url: driveRes.data.driveLink,
            description: `Contrato vinculado a ${form.user_name} (${form.user_email}) | Objeto: ${form.objeto_contrato?.substring(0, 80) || 'N/A'}`,
            user_email: form.user_email,
            team_member_id: memberId,
          });

          toast.success('✅ Contrato vinculado e armazenado no Google Drive com sucesso!');
        } catch (driveError) {
          console.error('Erro ao vinculação do contrato:', driveError);
          toast.error('Membro salvo, mas erro ao vincular contrato. Tente novamente.');
        }
      }

      if (editingMember?.id) {
        toast.success('✅ Membro atualizado com sucesso!');
      } else {
        toast.success('✅ Membro adicionado à equipe com sucesso!');
      }

      onSuccess();
      onClose();
    } catch (error) {
      toast.error('Erro ao salvar: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingMember ? 'Editar Membro' : 'Adicionar Membro à Equipe'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <Section title="Identificação">
            {!editingMember || isEditingOwnData ? (
              <div>
                <Label>Usuário da Plataforma *</Label>
                {editingMember && isEditingOwnData ? (
                  <Input value={form.user_email} disabled className="bg-gray-50" />
                ) : (
                  <Select
                    value={form.user_email}
                    onValueChange={v => {
                      const user = users.find(u => u.email === v);

                      setForm(prev => ({
                        ...prev,
                        user_email: v,
                        user_name: user?.full_name || '',
                        email_pessoal: user?.email_pessoal || '',
                        telefone: user?.telefone || '',
                        cpf: user?.cpf || '',
                        cnpj: user?.cnpj || '',
                        tipo_pessoa: user?.tipo_pessoa || 'PF',
                        empresa_nome: user?.empresa_nome || '',
                        empresa_endereco: user?.empresa_endereco || '',
                        representante_legal_nome: user?.representante_legal_nome || '',
                        representante_legal_cpf: user?.representante_legal_cpf || '',
                        cargo_representante: user?.cargo_representante || '',
                        banco: user?.banco || '',
                        agencia: user?.agencia || '',
                        conta: user?.conta || '',
                        tipo_conta: user?.tipo_conta || 'Corrente',
                        pix_key: user?.pix_key || '',
                      }));

                      preencherFormComTermo(v);

                      if (form.funcao) {
                        applyAutoFinanceByFuncao(form.funcao, user?.full_name || '');
                      }
                    }}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione um usuário" /></SelectTrigger>
                    <SelectContent>
                      {availableUsers.map(u => (
                        <SelectItem key={u.id} value={u.email}>
                          {u.full_name} — {u.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {form.user_name && <p className="text-xs text-gray-500 mt-1">{form.user_name}</p>}
              </div>
            ) : (
              <div>
                <Label>Email</Label>
                <Input value={form.user_email} disabled className="bg-gray-50" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Email Pessoal</Label>
                <Input value={form.email_pessoal} onChange={e => set('email_pessoal', e.target.value)} placeholder="email@pessoal.com" />
              </div>
              <div>
                <Label>Telefone de Contato</Label>
                <Input value={form.telefone} onChange={e => set('telefone', e.target.value)} placeholder="(31) 99999-9999" />
              </div>
            </div>

            <div>
              <Label>Função / Cargo (com auto preenchimento financeiro)</Label>
              <Select
                value={form.funcao}
                onValueChange={v => {
                  applyAutoFinanceByFuncao(v, form.user_name);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Selecione a função" /></SelectTrigger>
                <SelectContent>
                  {CARGOS_PLANO_TRABALHO.map(cargo => (
                    <SelectItem key={cargo} value={cargo}>{cargo}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                Para cargos da equipe, o sistema tenta preencher automaticamente rubrica, parcelas, valor total e parcelas já pagas.
              </p>
            </div>

            <div>
              <Label>Tipo de Pessoa *</Label>
              <Select value={form.tipo_pessoa} onValueChange={v => set('tipo_pessoa', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PF">Pessoa Física (PF)</SelectItem>
                  <SelectItem value="MEI">MEI</SelectItem>
                  <SelectItem value="ME">ME (Microempresa)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {form.tipo_pessoa === 'PF' ? (
                <div className="col-span-2">
                  <Label>CPF</Label>
                  <Input value={form.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00" />
                </div>
              ) : (
                <>
                  <div>
                    <Label>CPF (sócio/titular)</Label>
                    <Input value={form.cpf} onChange={e => set('cpf', e.target.value)} placeholder="000.000.000-00" />
                  </div>
                  <div>
                    <Label>CNPJ</Label>
                    <Input value={form.cnpj} onChange={e => set('cnpj', e.target.value)} placeholder="00.000.000/0001-00" />
                  </div>
                </>
              )}
            </div>

            {form.tipo_pessoa !== 'PF' && (
              <div className="space-y-4 border-t pt-4">
                <h4 className="font-semibold text-black">Dados da Empresa</h4>
                <div>
                  <Label>Razão Social / Nome da Empresa</Label>
                  <Input value={form.empresa_nome} onChange={e => set('empresa_nome', e.target.value)} placeholder="Nome da empresa" />
                </div>
                <div>
                  <Label>Endereço</Label>
                  <Input value={form.empresa_endereco} onChange={e => set('empresa_endereco', e.target.value)} placeholder="Endereço completo" />
                </div>
                <div>
                  <Label>Nome do Representante Legal</Label>
                  <Input value={form.representante_legal_nome} onChange={e => set('representante_legal_nome', e.target.value)} placeholder="Nome completo" />
                </div>
                <div>
                  <Label>CPF do Representante</Label>
                  <Input value={form.representante_legal_cpf} onChange={e => set('representante_legal_cpf', e.target.value)} placeholder="000.000.000-00" />
                </div>
                <div>
                  <Label>Cargo do Representante</Label>
                  <Select value={form.cargo_representante} onValueChange={v => set('cargo_representante', v)}>
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
              </div>
            )}
          </Section>

          <Section title="Contrato">
            <div>
              <Label>Contrato (PDF, DOC, DOCX ou TXT) *</Label>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
                {aiLoading ? (
                  <div className="flex flex-col items-center gap-2 py-2">
                    <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                    <p className="text-sm text-indigo-600 font-medium">Anexando contrato...</p>
                  </div>
                ) : form.contrato_url ? (
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-green-600 flex items-center gap-1">
                      ✅ Contrato anexado
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => set('contrato_url', '')}
                      className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    >
                      <X className="w-4 h-4" />
                      Deletar
                    </Button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600">Clique para enviar contrato</p>
                    <p className="text-xs text-gray-400 mt-1">PDF, DOC, DOCX ou TXT</p>
                    <input type="file" accept=".pdf,.doc,.docx,.txt" onChange={e => handleContratoUpload(e.target.files[0])} className="hidden" />
                  </label>
                )}
              </div>
            </div>

            <div>
              <Label>Objeto do Contrato</Label>
              <Textarea value={form.objeto_contrato} onChange={e => set('objeto_contrato', e.target.value)} rows={3} className="text-sm" placeholder="Descreva o objeto/escopo do contrato" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>Descrição Completa do Contrato</Label>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      if (!form.contrato_url) {
                        toast.error('Envie o contrato primeiro');
                        return;
                      }
                      setAiLoading(true);
                      try {
                        const res = await base44.integrations.Core.InvokeLLM({
                          prompt: `Leia este contrato e forneça um resumo conciso e claro em português, destacando: 1) Objeto/Escopo, 2) Duração, 3) Valor, 4) Principais obrigações. Seja objetivo e direto.`,
                          file_urls: [form.contrato_url],
                        });
                        set('descricao_contrato', res);
                        toast.success('✨ Resumo gerado pela IA!');
                      } catch (error) {
                        toast.error('Erro ao gerar resumo: ' + error.message);
                      } finally {
                        setAiLoading(false);
                      }
                    }}
                    disabled={aiLoading || !form.contrato_url}
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
                    Resumir com IA
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      if (!form.contrato_url) {
                        toast.error('Envie o contrato primeiro');
                        return;
                      }
                      setAiLoading(true);
                      try {
                        const res = await base44.integrations.Core.InvokeLLM({
                          prompt: `Leia este contrato e extraia TODOS os dados estruturados. Retorne um JSON com: data_inicio (YYYY-MM-DD), data_fim (YYYY-MM-DD), valor_total (número), numero_parcelas (número), cronograma_parcelas (array com {numero, vencimento (YYYY-MM-DD), valor (número)}), banco, agencia, conta, tipo_conta (Corrente ou Poupança), pix_key, objeto_contrato (texto breve), descricao_contrato (resumo completo). Se não encontrar algum campo, deixe vazio/nulo.`,
                          file_urls: [form.contrato_url],
                          response_json_schema: {
                            type: 'object',
                            properties: {
                              data_inicio: { type: 'string' },
                              data_fim: { type: 'string' },
                              valor_total: { type: 'number' },
                              numero_parcelas: { type: 'number' },
                              cronograma_parcelas: {
                                type: 'array',
                                items: {
                                  type: 'object',
                                  properties: {
                                    numero: { type: 'number' },
                                    vencimento: { type: 'string' },
                                    valor: { type: 'number' },
                                    descricao: { type: 'string' }
                                  }
                                }
                              },
                              banco: { type: 'string' },
                              agencia: { type: 'string' },
                              conta: { type: 'string' },
                              tipo_conta: { type: 'string' },
                              pix_key: { type: 'string' },
                              objeto_contrato: { type: 'string' },
                              descricao_contrato: { type: 'string' }
                            }
                          }
                        });

                        const extracted = res;
                        const numeroParcelasExtraidas = Math.max(1, parseInt(extracted.numero_parcelas, 10) || 1);
                        const valorTotalExtraido = toNumber(extracted.valor_total);

                        setForm(prev => ({
                          ...prev,
                          data_inicio_contrato: extracted.data_inicio || prev.data_inicio_contrato,
                          data_fim_contrato: extracted.data_fim || prev.data_fim_contrato,
                          valor_total: valorTotalExtraido || prev.valor_total,
                          numero_parcelas: numeroParcelasExtraidas || prev.numero_parcelas,
                          valor_parcela: valorTotalExtraido && numeroParcelasExtraidas
                            ? valorTotalExtraido / numeroParcelasExtraidas
                            : prev.valor_parcela,
                          cronograma_parcelas: extracted.cronograma_parcelas || prev.cronograma_parcelas,
                          banco: extracted.banco || prev.banco,
                          agencia: extracted.agencia || prev.agencia,
                          conta: extracted.conta || prev.conta,
                          tipo_conta: extracted.tipo_conta || prev.tipo_conta,
                          pix_key: extracted.pix_key || prev.pix_key,
                          objeto_contrato: extracted.objeto_contrato || prev.objeto_contrato,
                          descricao_contrato: extracted.descricao_contrato || prev.descricao_contrato,
                        }));
                        toast.success('✨ Formulário preenchido automaticamente!');
                      } catch (error) {
                        toast.error('Erro ao extrair dados: ' + error.message);
                      } finally {
                        setAiLoading(false);
                      }
                    }}
                    disabled={aiLoading || !form.contrato_url}
                  >
                    <Sparkles className="w-3 h-3 mr-1" />
                    Preencher Tudo com IA
                  </Button>
                </div>
              </div>
              <Textarea value={form.descricao_contrato} onChange={e => set('descricao_contrato', e.target.value)} rows={5} className="text-sm" placeholder="Resumo completo do contrato" />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data de Início *</Label>
                <Input type="date" value={form.data_inicio_contrato} onChange={e => set('data_inicio_contrato', e.target.value)} />
              </div>
              <div>
                <Label>Data de Término *</Label>
                <Input type="date" value={form.data_fim_contrato} onChange={e => set('data_fim_contrato', e.target.value)} />
              </div>
            </div>
          </Section>

          <Section title="Valores e Parcelas">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <Label>Valor Total (R$) *</Label>
                <Input
                  type="number"
                  value={form.valor_total}
                  onChange={e => set('valor_total', parseFloat(e.target.value) || 0)}
                  step="0.01"
                  min="0"
                />
              </div>
              <div>
                <Label>Nº de Parcelas Previstas *</Label>
                <Input
                  type="number"
                  value={form.numero_parcelas}
                  onChange={e => set('numero_parcelas', Math.max(1, parseInt(e.target.value, 10) || 1))}
                  min="1"
                />
              </div>
              <div>
                <Label>Parcelas Recebidas</Label>
                <Input
                  type="number"
                  value={form.parcelas_pagas}
                  onChange={e => set('parcelas_pagas', Math.max(0, parseInt(e.target.value, 10) || 0))}
                  min="0"
                />
              </div>
              <div>
                <Label>Valor por Parcela (R$)</Label>
                <Input value={parcelaCalculada ? parcelaCalculada.toFixed(2) : ''} disabled className="bg-gray-50" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-gray-500">Parcelas Restantes</p>
                <p className="font-semibold text-black">{parcelasRestantes}</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-gray-500">Saldo Estimado do Contrato</p>
                <p className="font-semibold text-black">R$ {saldoEstimadoContrato.toFixed(2)}</p>
              </div>
            </div>

            {form.cronograma_parcelas?.length > 0 && (
              <div>
                <Label className="flex items-center gap-1 mb-2"><Sparkles className="w-3 h-3 text-indigo-500" /> Cronograma de Parcelas (extraído pela IA)</Label>
                <div className="border rounded-lg overflow-hidden text-sm">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">#</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Vencimento</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Valor</th>
                        <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {form.cronograma_parcelas.map((p, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-600">{p.numero || i + 1}</td>
                          <td className="px-3 py-2">{p.vencimento || '—'}</td>
                          <td className="px-3 py-2 font-medium">R$ {p.valor?.toFixed?.(2) || '—'}</td>
                          <td className="px-3 py-2 text-gray-500 text-xs">{p.descricao || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>

          {availableBudgetLines.length > 0 && (
            <Section title="Rubrica Orçamentária">
              <div>
                <Label>Rubrica / Linha vinculada *</Label>
                <Select value={form.budgetline_id || ''} onValueChange={v => set('budgetline_id', v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione a rubrica / linha orçamentária" /></SelectTrigger>
                  <SelectContent>
                    {availableBudgetLines.map(bl => (
                      <SelectItem key={bl.id} value={bl.id}>
                        {bl.codigo || bl.nome || 'Sem código'} — {bl.nome || bl.descricao?.substring(0, 80) || 'Sem descrição'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.budgetline_id && (
                  <p className="text-xs text-gray-500 mt-1">
                    Esta vinculação será usada no controle de saldo e pagamento mensal.
                  </p>
                )}
              </div>
            </Section>
          )}

          <Section title="Dados Bancários">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Banco</Label>
                <Input value={form.banco} onChange={e => set('banco', e.target.value)} placeholder="Ex: Caixa Econômica" />
              </div>
              <div>
                <Label>Agência</Label>
                <Input value={form.agencia} onChange={e => set('agencia', e.target.value)} placeholder="Ex: 0001" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Conta</Label>
                <Input value={form.conta} onChange={e => set('conta', e.target.value)} placeholder="Número da conta" />
              </div>
              <div>
                <Label>Tipo de Conta</Label>
                <Select value={form.tipo_conta} onValueChange={v => set('tipo_conta', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Corrente">Corrente</SelectItem>
                    <SelectItem value="Poupança">Poupança</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Chave PIX (opcional)</Label>
              <Input value={form.pix_key} onChange={e => set('pix_key', e.target.value)} placeholder="CPF, Email, Telefone ou Aleatória" />
            </div>
          </Section>

          <div className="flex gap-2 justify-end border-t pt-4">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" className="bg-black hover:bg-gray-800" disabled={loading || aiLoading}>
              {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando...</> : 'Salvar'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Section({ title, children }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-black border-b pb-1.5">{title}</h3>
      {children}
    </div>
  );
}
