import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2, Sparkles, Paperclip, FileCheck,
  ChevronDown, ChevronRight, ExternalLink, CheckCircle2,
  Clock, AlertCircle, DollarSign, FileText, User, Briefcase,
} from 'lucide-react';
import { toast } from 'sonner';
import InactiveMembersPanel from './InactiveMembersPanel';
import { normalizeEmail, onlyDigits } from '@/utils/linking/smartEntityLinker';

const CARGOS_FUNCOES = [
  'Coordenador(a) Geral', 'Coordenador(a)', 'Coordenador(a) de Produção',
  'Coordenador(a) Administrativo(a)', 'Coordenador(a) de Comunicação',
  'Consultoria de Programação', 'Educador(a)', 'Educador(a) — Diurno',
  'Educador(a) — Noturno', 'Arte-educador(a)', 'Arte-educador(a) — Diurno',
  'Arte-educador(a) — Noturno', 'Mediador(a)', 'Mediador(a) — Diurno',
  'Mediador(a) — Noturno', 'Oficineiro(a)', 'Oficineiro(a) — Diurno',
  'Oficineiro(a) — Noturno', 'Produtor(a)', 'Assistente de Produção',
  'Técnico(a) de Som', 'Técnico(a) de Som — Noturno', 'Técnico(a) de Luz',
  'Técnico(a) de Luz — Noturno', 'Técnico(a) de Palco',
  'Técnico(a) de Palco — Noturno', 'Operador(a) de Som e Luz',
  'Operador(a) de Som e Luz — Noturno', 'Comunicador(a)', 'Designer',
  'Fotógrafo(a)', 'Videomaker', 'Curador(a)', 'Pesquisador(a)',
  'Recepcionista', 'Bilheteiro(a)', 'Intérprete / Guia', 'Assistente',
  'Auxiliar', 'Prestador(a) de Serviço', 'Outro',
];

const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Noturno nos Museus 2026', 'Publicações', 'Geral'];

const CENTROS_CUSTO = ['MUMO', 'MIS', 'MHAB', 'Noturno nos Museus 2026', 'Publicações', 'Geral'];

function fmt(val) {
  const n = Number(val);
  if (!Number.isFinite(n) || n === 0) return '—';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function fmtDate(d) {
  if (!d) return '—';
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('pt-BR');
  } catch {
    return d;
  }
}

function normalizeListResponse(res) {
  if (Array.isArray(res)) return res;
  if (Array.isArray(res?.data)) return res.data;
  if (Array.isArray(res?.items)) return res.items;
  return [];
}

function normalizeEntityResponse(res) {
  if (!res) return null;
  if (res?.id) return res;
  if (res?.data?.id) return res.data;
  return res?.data || res?.item || res || null;
}

function normalizeBudgetLineId(value) {
  return String(value || '').trim();
}

function getBudgetLineLabel(b) {
  if (!b) return 'Rubrica';
  const codigo = String(b.codigo || '').trim();
  const descricao = String(b.descricao || b.nome || b.name || '').trim();
  if (codigo && descricao) return `${codigo} — ${descricao}`;
  return codigo || descricao || 'Rubrica';
}

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function withTimeout(promise, ms = 20000, msg = 'Operação demorou muito.') {
  return Promise.race([promise, new Promise((_, r) => setTimeout(() => r(new Error(msg)), ms))]);
}

function parcelaStatusBadge(status) {
  if (!status || status === 'prevista')
    return <Badge variant="outline" className="text-slate-500 text-xs gap-1"><Clock className="w-3 h-3" />Prevista</Badge>;
  if (status === 'aprovada')
    return <Badge className="bg-blue-50 text-blue-700 border border-blue-200 text-xs gap-1"><CheckCircle2 className="w-3 h-3" />Aprovada</Badge>;
  if (status === 'paga')
    return <Badge className="bg-green-50 text-green-700 border border-green-200 text-xs gap-1"><CheckCircle2 className="w-3 h-3" />Paga</Badge>;
  if (status === 'atrasada')
    return <Badge className="bg-red-50 text-red-700 border border-red-200 text-xs gap-1"><AlertCircle className="w-3 h-3" />Atrasada</Badge>;
  return <Badge variant="outline" className="text-xs">{status}</Badge>;
}

function SectionHeader({ icon: Icon, title, children }) {
  return (
    <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-3">
      {Icon && <Icon className="w-4 h-4 text-slate-500" />}
      <span className="font-semibold text-sm text-slate-700">{title}</span>
      {children}
    </div>
  );
}

const EMPTY_FORM = {
  possui_usuario: false, user_id: '', user_email: '', user_name: '', funcao: '', budgetline_id: '',
  managed_by_user_id: '', managed_by_user_email: '',
  telefone: '', email_pessoal: '', cpf: '', cnpj: '', cpf_cnpj: '',
  tipo_pessoa: 'PF', museu_projeto: '', coordenador_responsavel: '',
  centro_custo: '', forma_pagamento: 'PIX',
  numero_contrato: '', tipo_contrato: '', data_assinatura: '',
  status_contrato: 'VIGENTE', contrato_url: '',
  vinculo_contratual: '', funcao_institucional: '',
  data_inicio_contrato: '', data_fim_contrato: '', objeto_contrato: '',
  escopo_descricao: '', escopo_atividades: '', escopo_entregas: '',
  escopo_responsabilidades: '', escopo_local: '', escopo_carga_horaria: '',
  escopo_periodo: '', escopo_observacoes: '',
  numero_parcelas: '', valor_parcela: '', valor_total: '',
  banco: '', agencia: '', conta: '', pix_key: '', pix: '',
  status: 'ATIVO',
  cronograma_parcelas: [],
};

export default function TeamMemberForm({ isOpen, onClose, onSuccess, editingMember = null, budgetLines = [] }) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState('select');
  const [selectedUser, setSelectedUser] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [uploadingContract, setUploadingContract] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [openSections, setOpenSections] = useState({ contrato: true, escopo: false, financeiro: true, bancario: false });

  const toggleSection = (key) => setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  useEffect(() => {
    if (!isOpen) {
      setMode('select'); setSelectedUser(''); setSaving(false); setForm(EMPTY_FORM);
      setOpenSections({ contrato: true, escopo: false, financeiro: true, bancario: false });
      return;
    }
    if (editingMember) {
      setMode('form');
      setForm({
        possui_usuario: Boolean(editingMember?.possui_usuario ?? editingMember?.user_email),
        user_id: editingMember?.user_id || '',
        user_email: editingMember?.user_email || '',
        user_name: editingMember?.user_name || '',
        funcao: editingMember?.funcao || '',
        budgetline_id: editingMember?.budgetline_id || '',
        managed_by_user_id: editingMember?.managed_by_user_id || '',
        managed_by_user_email: editingMember?.managed_by_user_email || '',
        telefone: editingMember?.telefone || '',
        email_pessoal: editingMember?.email_pessoal || '',
        cpf: editingMember?.cpf || '',
        cnpj: editingMember?.cnpj || '',
        cpf_cnpj: editingMember?.cpf_cnpj || editingMember?.cpf || editingMember?.cnpj || '',
        tipo_pessoa: editingMember?.tipo_pessoa || 'PF',
        museu_projeto: editingMember?.museu_projeto || '',
        coordenador_responsavel: editingMember?.coordenador_responsavel || '',
        centro_custo: editingMember?.centro_custo || '',
        forma_pagamento: editingMember?.forma_pagamento || 'PIX',
        numero_contrato: editingMember?.numero_contrato || '',
        tipo_contrato: editingMember?.tipo_contrato || '',
        data_assinatura: editingMember?.data_assinatura || '',
        status_contrato: editingMember?.status_contrato || 'VIGENTE',
        contrato_url: editingMember?.contrato_url || '',
        vinculo_contratual: editingMember?.vinculo_contratual || editingMember?.tipo_contrato || '',
        funcao_institucional: editingMember?.funcao_institucional || editingMember?.funcao || '',
        data_inicio_contrato: editingMember?.data_inicio_contrato || '',
        data_fim_contrato: editingMember?.data_fim_contrato || '',
        objeto_contrato: editingMember?.objeto_contrato || '',
        escopo_descricao: editingMember?.escopo_descricao || '',
        escopo_atividades: editingMember?.escopo_atividades || '',
        escopo_entregas: editingMember?.escopo_entregas || '',
        escopo_responsabilidades: editingMember?.escopo_responsabilidades || '',
        escopo_local: editingMember?.escopo_local || '',
        escopo_carga_horaria: editingMember?.escopo_carga_horaria || '',
        escopo_periodo: editingMember?.escopo_periodo || '',
        escopo_observacoes: editingMember?.escopo_observacoes || '',
        numero_parcelas: editingMember?.numero_parcelas || '',
        valor_parcela: editingMember?.valor_parcela || '',
        valor_total: editingMember?.valor_total || '',
        banco: editingMember?.banco || '',
        agencia: editingMember?.agencia || '',
        conta: editingMember?.conta || '',
        pix_key: editingMember?.pix_key || '',
        pix: editingMember?.pix || editingMember?.pix_key || '',
        status: editingMember?.status || 'ATIVO',
        cronograma_parcelas: editingMember?.cronograma_parcelas || [],
      });
    } else {
      setMode('select'); setSelectedUser(''); setForm(EMPTY_FORM);
    }
  }, [isOpen, editingMember]);

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['users-all'],
    queryFn: async () => normalizeListResponse(await base44.entities.User.list()),
    enabled: isOpen,
  });

  const { data: teamMembers = [], isLoading: loadingTeamMembers } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => normalizeListResponse(await base44.entities.TeamMember.list()),
    enabled: isOpen,
  });

  const { data: budgetLinesFromDB = [], isLoading: loadingBudgetLines } = useQuery({
    queryKey: ['team-member-form-budget-lines'],
    queryFn: async () => normalizeListResponse(await base44.entities.BudgetLine.list()),
    enabled: isOpen && (!Array.isArray(budgetLines) || budgetLines.length === 0),
  });

  const { data: purchaseRequests = [] } = useQuery({
    queryKey: ['purchase-requests-team'],
    queryFn: async () => normalizeListResponse(await base44.entities.PurchaseRequest.list()),
    enabled: isOpen && mode === 'form',
  });

  const availableUsers = useMemo(() => {
    const existingEmails = new Set(
      teamMembers.filter(m => m?.status === 'ATIVO')
        .map(m => String(m?.user_email || '').trim().toLowerCase()).filter(Boolean)
    );
    return users.filter(u => {
      const email = String(u?.email || '').trim().toLowerCase();
      return email && !existingEmails.has(email);
    });
  }, [users, teamMembers]);

  const finalBudgetLines = useMemo(() => {
    const source = Array.isArray(budgetLines) && budgetLines.length > 0 ? budgetLines : budgetLinesFromDB;
    const filtradas = source.filter(b => String(b?.codigo || '').startsWith('MC3A'));
    return filtradas.length > 0 ? filtradas : source;
  }, [budgetLines, budgetLinesFromDB]);

  // Parcelas vinculadas a solicitações
  const parcelasComVinculo = useMemo(() => {
    const parcelas = Array.isArray(form.cronograma_parcelas) ? form.cronograma_parcelas : [];
    return parcelas.map(p => {
      const linked = p.purchase_request_id
        ? purchaseRequests.find(r => r.id === p.purchase_request_id)
        : null;
      return { ...p, linked_request: linked };
    });
  }, [form.cronograma_parcelas, purchaseRequests]);

  const handleSelectUser = () => {
    const user = availableUsers.find(u =>
      String(u?.email || '').trim().toLowerCase() === String(selectedUser || '').trim().toLowerCase()
    );
    if (!user) { toast.error('Selecione um usuário válido.'); return; }
    setForm({
      ...EMPTY_FORM,
      possui_usuario: true,
      user_id: user.id || '',
      user_email: user.email || '',
      user_name: user.name || user.full_name || user.email || '',
      telefone: user.phone || user.telefone || '',
      managed_by_user_id: user.id || '',
      managed_by_user_email: user.email || '',
      status: 'ATIVO',
    });
    setMode('form');
  };

  const handleContractUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingContract(true);
    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const file_url = uploadRes?.file_url || uploadRes?.data?.file_url || '';
      if (!file_url) throw new Error('Arquivo enviado, mas sem URL retornada.');

      const rubricasContext = finalBudgetLines.map(b => `ID: ${b.id} | ${getBudgetLineLabel(b)}`).join('\n');
      const cargo = form.funcao || 'profissional';

      toast.info('IA lendo contrato e extraindo dados completos...');

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Você é um especialista em contratos de prestação de serviços culturais (Projeto Museus Centro, BH).
Leia o contrato PDF anexado e extraia TODOS os campos abaixo com máxima precisão.
Se um campo não existir, retorne null ou string vazia.

Campos financeiros:
- numero_parcelas (inteiro)
- valor_parcela (número)
- valor_total (número)
- forma_pagamento: "PIX" | "TED/Transferência" | "Boleto"
- datas_pagamento: array de strings YYYY-MM-DD (uma por parcela)

Campos do contrato:
- numero_contrato: identificador do contrato
- tipo_contrato: "CONTRATO" | "TERMO_ADITIVO" | "OUTRO"
- data_assinatura: YYYY-MM-DD
- data_inicio: YYYY-MM-DD
- data_fim: YYYY-MM-DD
- status_contrato: "VIGENTE" | "ENCERRADO" | "SUSPENSO" | "EM_ELABORACAO"

Dados do profissional/membro:
- cpf: somente dígitos
- cnpj: somente dígitos (se PJ)
- tipo_pessoa: "PF" | "MEI" | "ME"
- banco, agencia, conta, pix_key
- museu_projeto: museu ou projeto vinculado (MIS, MHAB, MUMO, etc.)
- centro_custo: MUMO | MIS | MHAB | Noturno nos Museus 2026 | Publicações | Geral

Escopo de trabalho:
- escopo_descricao: descrição completa do escopo de trabalho
- escopo_atividades: atividades previstas
- escopo_entregas: entregas obrigatórias
- escopo_responsabilidades: responsabilidades do profissional
- escopo_local: local de atuação
- escopo_carga_horaria: carga horária prevista
- escopo_periodo: período de execução
- escopo_observacoes: observações relevantes
- objeto_contrato: descrição objetiva do objeto contratado

Rubrica sugerida — escolha o ID mais adequado para o cargo "${cargo}":
${rubricasContext}

rubrica_id_sugerida: ID da rubrica mais adequada`,
        file_urls: [file_url],
        model: 'claude_sonnet_4_6',
        response_json_schema: {
          type: 'object',
          properties: {
            numero_parcelas: { type: 'number' },
            valor_parcela: { type: 'number' },
            valor_total: { type: 'number' },
            forma_pagamento: { type: 'string' },
            datas_pagamento: { type: 'array', items: { type: 'string' } },
            numero_contrato: { type: 'string' },
            tipo_contrato: { type: 'string' },
            data_assinatura: { type: 'string' },
            data_inicio: { type: 'string' },
            data_fim: { type: 'string' },
            status_contrato: { type: 'string' },
            cpf: { type: 'string' },
            cnpj: { type: 'string' },
            tipo_pessoa: { type: 'string' },
            banco: { type: 'string' },
            agencia: { type: 'string' },
            conta: { type: 'string' },
            pix_key: { type: 'string' },
            museu_projeto: { type: 'string' },
            centro_custo: { type: 'string' },
            escopo_descricao: { type: 'string' },
            escopo_atividades: { type: 'string' },
            escopo_entregas: { type: 'string' },
            escopo_responsabilidades: { type: 'string' },
            escopo_local: { type: 'string' },
            escopo_carga_horaria: { type: 'string' },
            escopo_periodo: { type: 'string' },
            escopo_observacoes: { type: 'string' },
            objeto_contrato: { type: 'string' },
            rubrica_id_sugerida: { type: 'string' },
          },
        },
      });

      // Gerar cronograma de parcelas automaticamente
      const numParcelas = result?.numero_parcelas || 0;
      const valParcela = result?.valor_parcela || 0;
      const datas = Array.isArray(result?.datas_pagamento) ? result.datas_pagamento : [];
      const cronograma = [];
      for (let i = 0; i < numParcelas; i++) {
        cronograma.push({
          numero: i + 1,
          vencimento: datas[i] || null,
          valor: valParcela,
          status: 'prevista',
          purchase_request_id: null,
          comprovante_url: null,
          descricao: `Parcela ${i + 1} de ${numParcelas}`,
        });
      }

      setForm(prev => ({
        ...prev,
        contrato_url: file_url,
        numero_parcelas: result?.numero_parcelas ? String(result.numero_parcelas) : prev.numero_parcelas,
        valor_parcela: result?.valor_parcela ? String(result.valor_parcela) : prev.valor_parcela,
        valor_total: result?.valor_total ? String(result.valor_total) : prev.valor_total,
        forma_pagamento: result?.forma_pagamento || prev.forma_pagamento,
        data_inicio_contrato: result?.data_inicio || prev.data_inicio_contrato,
        data_fim_contrato: result?.data_fim || prev.data_fim_contrato,
        data_assinatura: result?.data_assinatura || prev.data_assinatura,
        numero_contrato: result?.numero_contrato || prev.numero_contrato,
        tipo_contrato: result?.tipo_contrato || prev.tipo_contrato,
        status_contrato: result?.status_contrato || prev.status_contrato,
        cpf: result?.cpf || prev.cpf,
        cnpj: result?.cnpj || prev.cnpj,
        tipo_pessoa: result?.tipo_pessoa || prev.tipo_pessoa,
        banco: result?.banco || prev.banco,
        agencia: result?.agencia || prev.agencia,
        conta: result?.conta || prev.conta,
        pix_key: result?.pix_key || prev.pix_key,
        museu_projeto: result?.museu_projeto || prev.museu_projeto,
        centro_custo: result?.centro_custo || prev.centro_custo,
        objeto_contrato: result?.objeto_contrato || prev.objeto_contrato,
        escopo_descricao: result?.escopo_descricao || prev.escopo_descricao,
        escopo_atividades: result?.escopo_atividades || prev.escopo_atividades,
        escopo_entregas: result?.escopo_entregas || prev.escopo_entregas,
        escopo_responsabilidades: result?.escopo_responsabilidades || prev.escopo_responsabilidades,
        escopo_local: result?.escopo_local || prev.escopo_local,
        escopo_carga_horaria: result?.escopo_carga_horaria || prev.escopo_carga_horaria,
        escopo_periodo: result?.escopo_periodo || prev.escopo_periodo,
        escopo_observacoes: result?.escopo_observacoes || prev.escopo_observacoes,
        budgetline_id: result?.rubrica_id_sugerida || prev.budgetline_id,
        cronograma_parcelas: cronograma.length > 0 ? cronograma : prev.cronograma_parcelas,
      }));

      setOpenSections({ contrato: true, escopo: true, financeiro: true, bancario: true });
      toast.success(`Contrato lido! ${numParcelas} parcelas de ${fmt(valParcela)} geradas automaticamente.`);
    } catch (err) {
      console.error('Erro ao processar contrato:', err);
      toast.error(`Erro ao processar contrato: ${err?.message || 'Tente novamente.'}`);
    } finally {
      setUploadingContract(false);
      e.target.value = '';
    }
  };

  const handleSuggestFromAI = async () => {
    setLoadingAI(true);
    try {
      const docs = normalizeListResponse(await base44.entities.KnowledgeDocument.filter({ categoria: 'Plano de Trabalho', ativo: true }));
      if (!docs.length) { toast.error('Nenhum Plano de Trabalho encontrado.'); return; }
      const conteudo = docs.map(d => d.conteudo_extraido || d.descricao || d.titulo).filter(Boolean).join('\n\n---\n\n');
      const cargo = form.funcao || 'profissional';
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `Com base no Plano de Trabalho abaixo, extraia o número de parcelas e o valor de cada parcela para o cargo "${cargo}".
PLANO DE TRABALHO:
${conteudo}
Responda SOMENTE com os dados extraídos.`,
        response_json_schema: {
          type: 'object',
          properties: {
            numero_parcelas: { type: 'number' },
            valor_parcela: { type: 'number' },
            valor_total: { type: 'number' },
            observacao: { type: 'string' },
          },
        },
      });
      if (result?.numero_parcelas || result?.valor_parcela) {
        setForm(prev => ({
          ...prev,
          numero_parcelas: String(result.numero_parcelas ?? prev.numero_parcelas),
          valor_parcela: String(result.valor_parcela ?? prev.valor_parcela),
          valor_total: String(result.valor_total ?? prev.valor_total),
        }));
        toast.success(result?.observacao || 'Valores sugeridos com base no Plano de Trabalho.');
      } else {
        toast.error('Não foi possível sugerir valores para esse cargo.');
      }
    } catch (e) {
      console.error(e);
      toast.error(`Erro ao consultar IA: ${e?.message}`);
    } finally {
      setLoadingAI(false);
    }
  };

  const handleSave = async () => {
    if (saving) return;
    if (!String(form.user_name || '').trim()) { toast.error('Preencha o nome.'); return; }
    if (!String(form.funcao || '').trim()) { toast.error('Selecione o cargo / função.'); return; }
    if (!normalizeBudgetLineId(form.budgetline_id)) { toast.error('Selecione a rubrica.'); return; }
    setSaving(true);
    try {
      const numeroParcelas = toNum(form.numero_parcelas);
      const valorParcela = toNum(form.valor_parcela);
      const valorTotal = toNum(form.valor_total) || (numeroParcelas > 0 && valorParcela > 0 ? numeroParcelas * valorParcela : 0);
      const cpfCnpj = onlyDigits(form.cpf_cnpj || form.cpf || form.cnpj);
      const userEmail = normalizeEmail(form.user_email);
      const hasUser = Boolean(form.possui_usuario && userEmail);
      const managedUser = users.find((u) => String(u.id || '') === String(form.managed_by_user_id || ''));
      const payload = {
        possui_usuario: hasUser,
        user_id: hasUser ? String(form.user_id || '').trim() : '',
        user_email: hasUser ? userEmail : '',
        user_name: String(form.user_name).trim(),
        funcao: String(form.funcao).trim(),
        funcao_institucional: String(form.funcao_institucional || form.funcao || '').trim(),
        role: String(form.funcao).trim(),
        budgetline_id: normalizeBudgetLineId(form.budgetline_id),
        budget_line_id: normalizeBudgetLineId(form.budgetline_id),
        managed_by_user_id: String(form.managed_by_user_id || '').trim(),
        managed_by_user_email: normalizeEmail(form.managed_by_user_email || managedUser?.email || ''),
        telefone: String(form.telefone || '').trim(),
        email_pessoal: String(form.email_pessoal || '').trim(),
        cpf: onlyDigits(form.cpf || (form.tipo_pessoa === 'PF' ? cpfCnpj : '')),
        cnpj: onlyDigits(form.cnpj || (form.tipo_pessoa !== 'PF' ? cpfCnpj : '')),
        cpf_cnpj: cpfCnpj,
        tipo_pessoa: form.tipo_pessoa || 'PF',
        museu_projeto: String(form.museu_projeto || '').trim(),
        coordenador_responsavel: String(form.coordenador_responsavel || '').trim(),
        centro_custo: String(form.centro_custo || '').trim(),
        forma_pagamento: form.forma_pagamento || 'PIX',
        numero_contrato: String(form.numero_contrato || '').trim(),
        tipo_contrato: String(form.tipo_contrato || '').trim(),
        data_assinatura: form.data_assinatura || undefined,
        status_contrato: form.status_contrato || 'VIGENTE',
        contrato_url: form.contrato_url || undefined,
        vinculo_contratual: String(form.vinculo_contratual || form.tipo_contrato || '').trim(),
        data_inicio_contrato: form.data_inicio_contrato || undefined,
        data_fim_contrato: form.data_fim_contrato || undefined,
        objeto_contrato: String(form.objeto_contrato || '').trim(),
        escopo_trabalho: String(form.escopo_descricao || '').trim(),
        escopo_descricao: String(form.escopo_descricao || '').trim(),
        escopo_atividades: String(form.escopo_atividades || '').trim(),
        escopo_entregas: String(form.escopo_entregas || '').trim(),
        escopo_responsabilidades: String(form.escopo_responsabilidades || '').trim(),
        escopo_local: String(form.escopo_local || '').trim(),
        escopo_carga_horaria: String(form.escopo_carga_horaria || '').trim(),
        escopo_periodo: String(form.escopo_periodo || '').trim(),
        escopo_observacoes: String(form.escopo_observacoes || '').trim(),
        numero_parcelas: numeroParcelas,
        valor_parcela: valorParcela,
        valor_total: valorTotal,
        banco: String(form.banco || '').trim(),
        agencia: String(form.agencia || '').trim(),
        conta: String(form.conta || '').trim(),
        pix_key: String(form.pix_key || form.pix || '').trim(),
        pix: String(form.pix || form.pix_key || '').trim(),
        cronograma_parcelas: form.cronograma_parcelas || [],
        status: String(form.status || 'ATIVO').trim(),
      };
      let rawResult;
      if (editingMember?.id) {
        rawResult = await withTimeout(base44.entities.TeamMember.update(editingMember.id, payload));
      } else {
        rawResult = await withTimeout(base44.entities.TeamMember.create(payload));
      }
      const result = normalizeEntityResponse(rawResult);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['team-members'] }),
        queryClient.invalidateQueries({ queryKey: ['team-members-all'] }),
        queryClient.invalidateQueries({ queryKey: ['users-all'] }),
      ]);
      toast.success(editingMember?.id ? `Equipe atualizada — ${form.user_name}` : `Novo membro adicionado — ${form.user_name}`);
      if (typeof onSuccess === 'function') await onSuccess(result || payload);
      onClose?.();
    } catch (error) {
      console.error(error);
      toast.error(`Erro ao salvar membro: ${error?.message || 'Tente novamente.'}`);
    } finally {
      setSaving(false);
    }
  };

  const setF = (key, val) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !saving) onClose?.(); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editingMember ? 'Editar membro da equipe' : 'Adicionar membro da equipe'}</DialogTitle>
        </DialogHeader>

        {/* ── STEP 1: Selecionar usuário ── */}
        {mode === 'select' && !editingMember && (
          <div className="space-y-4">
            <InactiveMembersPanel />
            <div className="space-y-2">
              <Label>Selecionar usuário</Label>
              <Select value={selectedUser} onValueChange={setSelectedUser} disabled={loadingUsers || loadingTeamMembers || saving}>
                <SelectTrigger>
                  <SelectValue placeholder={loadingUsers ? 'Carregando...' : availableUsers.length === 0 ? 'Nenhum usuário disponível' : 'Selecione um usuário'} />
                </SelectTrigger>
                <SelectContent>
                  {availableUsers.length > 0 ? availableUsers.map(u => (
                    <SelectItem key={u.id || u.email} value={u.email}>{u.name || u.full_name || u.email} — Transformar em membro</SelectItem>
                  )) : (
                    <SelectItem value="__empty__" disabled>Nenhum usuário disponível</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => onClose?.()} disabled={saving}>Cancelar</Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setForm({ ...EMPTY_FORM, possui_usuario: false, status: 'ATIVO' });
                  setMode('form');
                }}
                disabled={saving}
              >
                Criar membro sem usuário
              </Button>
              <Button onClick={handleSelectUser} disabled={!selectedUser || selectedUser === '__empty__' || saving}>Continuar</Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: Formulário completo ── */}
        {mode === 'form' && (
          <div className="space-y-5">

            {/* ── DADOS DO MEMBRO ── */}
            <div>
              <SectionHeader icon={User} title="Dados do Membro" />
              {!form.possui_usuario && (
                <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Este membro não precisa ter login. Ele poderá ser vinculado a atividades, relatórios, contratos, notas fiscais e pagamentos por um usuário responsável.
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Nome completo *</Label>
                  <Input value={form.user_name} onChange={e => setF('user_name', e.target.value)} disabled={saving} />
                </div>
                <div className="space-y-1">
                  <Label>E-mail de login vinculado</Label>
                  <Input value={form.user_email} onChange={e => setF('user_email', e.target.value)} disabled={saving || !form.possui_usuario} placeholder={form.possui_usuario ? 'usuario@exemplo.com' : 'Sem usuário de acesso'} />
                </div>
                <div className="space-y-1">
                  <Label>Cargo / Função *</Label>
                  <Select value={form.funcao} onValueChange={v => setF('funcao', v)} disabled={saving}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{CARGOS_FUNCOES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Função institucional</Label>
                  <Input value={form.funcao_institucional} onChange={e => setF('funcao_institucional', e.target.value)} disabled={saving} placeholder="Ex: educadora, artista, consultoria, apoio" />
                </div>
                <div className="space-y-1">
                  <Label>Tipo de pessoa</Label>
                  <Select value={form.tipo_pessoa} onValueChange={v => setF('tipo_pessoa', v)} disabled={saving}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PF">PF — Pessoa Física</SelectItem>
                      <SelectItem value="MEI">MEI</SelectItem>
                      <SelectItem value="ME">ME</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>{form.tipo_pessoa === 'PF' ? 'CPF' : 'CNPJ'}</Label>
                  <Input value={form.tipo_pessoa === 'PF' ? form.cpf : form.cnpj} onChange={e => {
                    setF(form.tipo_pessoa === 'PF' ? 'cpf' : 'cnpj', e.target.value);
                    setF('cpf_cnpj', e.target.value);
                  }} disabled={saving} placeholder="Somente dígitos" />
                </div>
                <div className="space-y-1">
                  <Label>E-mail pessoal</Label>
                  <Input value={form.email_pessoal} onChange={e => setF('email_pessoal', e.target.value)} disabled={saving} />
                </div>
                <div className="space-y-1">
                  <Label>Telefone</Label>
                  <Input value={form.telefone} onChange={e => setF('telefone', e.target.value)} disabled={saving} />
                </div>
                <div className="space-y-1">
                  <Label>Museu / Projeto</Label>
                  <Select value={form.museu_projeto} onValueChange={v => setF('museu_projeto', v)} disabled={saving}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Coordenador responsável</Label>
                  <Input value={form.coordenador_responsavel} onChange={e => setF('coordenador_responsavel', e.target.value)} disabled={saving} />
                </div>
                <div className="space-y-1">
                  <Label>Usuário responsável pelo membro</Label>
                  <Select
                    value={form.managed_by_user_id || '__none__'}
                    onValueChange={v => {
                      if (v === '__none__') {
                        setForm(prev => ({ ...prev, managed_by_user_id: '', managed_by_user_email: '' }));
                        return;
                      }
                      const selected = users.find(u => String(u.id || '') === String(v));
                      setForm(prev => ({ ...prev, managed_by_user_id: v, managed_by_user_email: selected?.email || '' }));
                    }}
                    disabled={saving || loadingUsers}
                  >
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Sem responsável definido</SelectItem>
                      {users.map(u => <SelectItem key={u.id || u.email} value={String(u.id || u.email)}>{u.name || u.full_name || u.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Rubrica *</Label>
                  <Select value={normalizeBudgetLineId(form.budgetline_id)} onValueChange={v => setF('budgetline_id', v)} disabled={saving || loadingBudgetLines}>
                    <SelectTrigger><SelectValue placeholder={loadingBudgetLines ? 'Carregando...' : 'Selecione a rubrica'} /></SelectTrigger>
                    <SelectContent>
                      {finalBudgetLines.map(b => <SelectItem key={b.id} value={String(b.id)}>{getBudgetLineLabel(b)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setF('status', v)} disabled={saving}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ATIVO">Ativo</SelectItem>
                      <SelectItem value="INATIVO">Inativo</SelectItem>
                      <SelectItem value="SUSPENSO">Suspenso</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* ── DADOS DO CONTRATO ── */}
            <div>
              <button type="button" onClick={() => toggleSection('contrato')} className="w-full flex items-center gap-2 border-b border-slate-200 pb-2 mb-3 text-left hover:text-slate-900">
                <FileText className="w-4 h-4 text-slate-500" />
                <span className="font-semibold text-sm text-slate-700">Dados do Contrato</span>
                {openSections.contrato ? <ChevronDown className="w-4 h-4 ml-auto text-slate-400" /> : <ChevronRight className="w-4 h-4 ml-auto text-slate-400" />}
              </button>
              {openSections.contrato && (
                <div className="space-y-3">
                  {/* Upload do contrato com IA */}
                  <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border">
                    <label className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm cursor-pointer transition-colors ${uploadingContract ? 'opacity-50 pointer-events-none' : 'hover:bg-white bg-white'}`}>
                      {uploadingContract ? <><Loader2 className="w-4 h-4 animate-spin" />Lendo contrato via IA...</> :
                        form.contrato_url ? <><FileCheck className="w-4 h-4 text-green-600" />Contrato anexado</> :
                          <><Paperclip className="w-4 h-4" />Anexar contrato PDF</>}
                      <input type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleContractUpload} disabled={saving || uploadingContract} />
                    </label>
                    {form.contrato_url && <a href={form.contrato_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 underline flex items-center gap-1"><ExternalLink className="w-3 h-3" />Ver contrato</a>}
                    <span className="text-xs text-slate-500 ml-auto">A IA preencherá todos os campos automaticamente</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Número do contrato</Label>
                      <Input value={form.numero_contrato} onChange={e => setF('numero_contrato', e.target.value)} disabled={saving} placeholder="Ex: 001/2026" />
                    </div>
                    <div className="space-y-1">
                      <Label>Tipo de contrato</Label>
                      <Select value={form.tipo_contrato} onValueChange={v => setF('tipo_contrato', v)} disabled={saving}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="CONTRATO">Contrato</SelectItem>
                          <SelectItem value="TERMO_ADITIVO">Termo Aditivo</SelectItem>
                          <SelectItem value="OUTRO">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Data de assinatura</Label>
                      <Input type="date" value={form.data_assinatura} onChange={e => setF('data_assinatura', e.target.value)} disabled={saving} />
                    </div>
                    <div className="space-y-1">
                      <Label>Status do contrato</Label>
                      <Select value={form.status_contrato} onValueChange={v => setF('status_contrato', v)} disabled={saving}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VIGENTE">Vigente</SelectItem>
                          <SelectItem value="ENCERRADO">Encerrado</SelectItem>
                          <SelectItem value="SUSPENSO">Suspenso</SelectItem>
                          <SelectItem value="EM_ELABORACAO">Em elaboração</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Vigência inicial</Label>
                      <Input type="date" value={form.data_inicio_contrato} onChange={e => setF('data_inicio_contrato', e.target.value)} disabled={saving} />
                    </div>
                    <div className="space-y-1">
                      <Label>Vigência final</Label>
                      <Input type="date" value={form.data_fim_contrato} onChange={e => setF('data_fim_contrato', e.target.value)} disabled={saving} />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Objeto do contrato</Label>
                    <textarea rows={2} value={form.objeto_contrato} onChange={e => setF('objeto_contrato', e.target.value)} disabled={saving} className="w-full px-3 py-2 text-sm border rounded-md font-sans resize-none" placeholder="Descrição objetiva do objeto contratado" />
                  </div>
                </div>
              )}
            </div>

            {/* ── ESCOPO DE TRABALHO ── */}
            <div>
              <button type="button" onClick={() => toggleSection('escopo')} className="w-full flex items-center gap-2 border-b border-slate-200 pb-2 mb-3 text-left hover:text-slate-900">
                <Briefcase className="w-4 h-4 text-slate-500" />
                <span className="font-semibold text-sm text-slate-700">Escopo de Trabalho</span>
                {openSections.escopo ? <ChevronDown className="w-4 h-4 ml-auto text-slate-400" /> : <ChevronRight className="w-4 h-4 ml-auto text-slate-400" />}
              </button>
              {openSections.escopo && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Descrição completa do escopo</Label>
                    <textarea rows={3} value={form.escopo_descricao} onChange={e => setF('escopo_descricao', e.target.value)} disabled={saving} className="w-full px-3 py-2 text-sm border rounded-md font-sans resize-none" />
                  </div>
                  <div className="space-y-1">
                    <Label>Atividades previstas</Label>
                    <textarea rows={2} value={form.escopo_atividades} onChange={e => setF('escopo_atividades', e.target.value)} disabled={saving} className="w-full px-3 py-2 text-sm border rounded-md font-sans resize-none" />
                  </div>
                  <div className="space-y-1">
                    <Label>Entregas obrigatórias</Label>
                    <textarea rows={2} value={form.escopo_entregas} onChange={e => setF('escopo_entregas', e.target.value)} disabled={saving} className="w-full px-3 py-2 text-sm border rounded-md font-sans resize-none" />
                  </div>
                  <div className="space-y-1">
                    <Label>Responsabilidades do profissional</Label>
                    <textarea rows={2} value={form.escopo_responsabilidades} onChange={e => setF('escopo_responsabilidades', e.target.value)} disabled={saving} className="w-full px-3 py-2 text-sm border rounded-md font-sans resize-none" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label>Local de atuação</Label>
                      <Input value={form.escopo_local} onChange={e => setF('escopo_local', e.target.value)} disabled={saving} />
                    </div>
                    <div className="space-y-1">
                      <Label>Carga horária prevista</Label>
                      <Input value={form.escopo_carga_horaria} onChange={e => setF('escopo_carga_horaria', e.target.value)} disabled={saving} placeholder="Ex: 20h/semana" />
                    </div>
                    <div className="space-y-1">
                      <Label>Período de execução</Label>
                      <Input value={form.escopo_periodo} onChange={e => setF('escopo_periodo', e.target.value)} disabled={saving} placeholder="Ex: jan/2026 a dez/2026" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label>Observações do contrato</Label>
                    <textarea rows={2} value={form.escopo_observacoes} onChange={e => setF('escopo_observacoes', e.target.value)} disabled={saving} className="w-full px-3 py-2 text-sm border rounded-md font-sans resize-none" />
                  </div>
                </div>
              )}
            </div>

            {/* ── PARCELAS E PAGAMENTOS ── */}
            <div>
              <button type="button" onClick={() => toggleSection('financeiro')} className="w-full flex items-center gap-2 border-b border-slate-200 pb-2 mb-3 text-left hover:text-slate-900">
                <DollarSign className="w-4 h-4 text-slate-500" />
                <span className="font-semibold text-sm text-slate-700">Parcelas e Pagamentos</span>
                {openSections.financeiro ? <ChevronDown className="w-4 h-4 ml-auto text-slate-400" /> : <ChevronRight className="w-4 h-4 ml-auto text-slate-400" />}
              </button>
              {openSections.financeiro && (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <Label>Nº de parcelas</Label>
                        <Button type="button" variant="outline" size="sm" onClick={handleSuggestFromAI} disabled={saving || loadingAI} className="h-6 text-xs gap-1 px-2">
                          {loadingAI ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}IA
                        </Button>
                      </div>
                      <Input type="number" value={form.numero_parcelas} onChange={e => setF('numero_parcelas', e.target.value)} disabled={saving} />
                    </div>
                    <div className="space-y-1">
                      <Label>Valor da parcela</Label>
                      <Input type="number" value={form.valor_parcela} onChange={e => setF('valor_parcela', e.target.value)} disabled={saving} />
                    </div>
                    <div className="space-y-1">
                      <Label>Valor total</Label>
                      <Input type="number" value={form.valor_total} onChange={e => setF('valor_total', e.target.value)} disabled={saving} />
                    </div>
                    <div className="space-y-1">
                      <Label>Forma de pagamento</Label>
                      <Select value={form.forma_pagamento} onValueChange={v => setF('forma_pagamento', v)} disabled={saving}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="PIX">PIX</SelectItem>
                          <SelectItem value="TED/Transferência">TED / Transferência</SelectItem>
                          <SelectItem value="Boleto">Boleto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Centro de custo</Label>
                      <Select value={form.centro_custo} onValueChange={v => setF('centro_custo', v)} disabled={saving}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{CENTROS_CUSTO.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Tabela de parcelas */}
                  {parcelasComVinculo.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-medium text-slate-600 mb-2">Cronograma de parcelas</p>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="text-left px-3 py-2 text-slate-500 font-medium">Parcela</th>
                              <th className="text-right px-3 py-2 text-slate-500 font-medium">Valor</th>
                              <th className="text-center px-3 py-2 text-slate-500 font-medium">Data prevista</th>
                              <th className="text-center px-3 py-2 text-slate-500 font-medium">Status</th>
                              <th className="text-center px-3 py-2 text-slate-500 font-medium">Solicitação</th>
                              <th className="text-center px-3 py-2 text-slate-500 font-medium">Comprovante</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {parcelasComVinculo.map((p, idx) => (
                              <tr key={idx} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-medium">{p.numero} de {parcelasComVinculo.length}</td>
                                <td className="px-3 py-2 text-right font-mono">{fmt(p.valor)}</td>
                                <td className="px-3 py-2 text-center text-slate-600">{fmtDate(p.vencimento)}</td>
                                <td className="px-3 py-2 text-center">{parcelaStatusBadge(p.status)}</td>
                                <td className="px-3 py-2 text-center">
                                  {p.linked_request ? (
                                    <span className="text-blue-600 font-medium">{p.linked_request.numero_processamento || p.linked_request.id?.slice(-6)}</span>
                                  ) : <span className="text-slate-400">—</span>}
                                </td>
                                <td className="px-3 py-2 text-center">
                                  {p.comprovante_url ? (
                                    <a href={p.comprovante_url} target="_blank" rel="noreferrer" className="text-blue-600 underline flex items-center gap-1 justify-center"><ExternalLink className="w-3 h-3" />Ver</a>
                                  ) : <span className="text-slate-400">—</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── DADOS BANCÁRIOS ── */}
            <div>
              <button type="button" onClick={() => toggleSection('bancario')} className="w-full flex items-center gap-2 border-b border-slate-200 pb-2 mb-3 text-left hover:text-slate-900">
                <span className="font-semibold text-sm text-slate-700">Dados Bancários</span>
                {openSections.bancario ? <ChevronDown className="w-4 h-4 ml-auto text-slate-400" /> : <ChevronRight className="w-4 h-4 ml-auto text-slate-400" />}
              </button>
              {openSections.bancario && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Banco</Label>
                    <Input value={form.banco} onChange={e => setF('banco', e.target.value)} disabled={saving} />
                  </div>
                  <div className="space-y-1">
                    <Label>Agência</Label>
                    <Input value={form.agencia} onChange={e => setF('agencia', e.target.value)} disabled={saving} />
                  </div>
                  <div className="space-y-1">
                    <Label>Conta</Label>
                    <Input value={form.conta} onChange={e => setF('conta', e.target.value)} disabled={saving} />
                  </div>
                  <div className="space-y-1">
                    <Label>Chave PIX</Label>
                    <Input value={form.pix_key} onChange={e => setF('pix_key', e.target.value)} disabled={saving} />
                  </div>
                </div>
              )}
            </div>

            {/* ── AÇÕES ── */}
            <div className="flex justify-end gap-2 pt-2 border-t">
              <Button type="button" variant="outline" onClick={() => editingMember ? onClose?.() : setMode('select')} disabled={saving}>
                {editingMember ? 'Cancelar' : 'Voltar'}
              </Button>
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</> : 'Salvar'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
