import React, { useMemo, useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { notifyCoordinators } from '@/lib/notifyHelpers';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle
} from '@/components/ui/dialog';
import {
  AlertCircle, CheckCircle2, Eye, FileText, Loader2, Plus, Upload, Brain
} from 'lucide-react';
import { toast } from 'sonner';
import { Progress } from '@/components/ui/progress';

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const VIADUTO_EMISSAO = {
  razao_social: 'Viaduto das Artes',
  endereco: 'Av. Olinto Meireles, 45 - Barreiro, Belo Horizonte - MG, 30640-010',
  cnpj: '23.843.648/0001-25',
  inscricao_municipal: '0.745.690/001-X',
  telefone: '(31) 98802-5140',
  email: 'viadutodasartes@viadutodasartes.org.br',
  termo: '01-031.069/24-80'
};

const PAYMENT_STATUS_META = {
  RASCUNHO: { label: 'Rascunho', className: 'bg-gray-100 text-gray-700' },
  AGUARDANDO_APROVACAO: { label: 'Aguardando aprovação', className: 'bg-amber-100 text-amber-800' },
  EM_ANALISE_COORD: { label: 'Em análise', className: 'bg-blue-100 text-blue-800' },
  DEVOLVIDO_REVISAO: { label: 'Devolvido para revisão', className: 'bg-orange-100 text-orange-800' },
  APROVADO_COORD: { label: 'Aprovado coord.', className: 'bg-emerald-100 text-emerald-800' },
  ENCAMINHADO_COORD_ADMIN: { label: 'Encaminhado', className: 'bg-cyan-100 text-cyan-800' },
  APROVADO: { label: 'Aprovado', className: 'bg-green-100 text-green-800' },
  REVISAO: { label: 'Em revisão', className: 'bg-yellow-100 text-yellow-800' },
  PAGO: { label: 'Pago', className: 'bg-lime-100 text-lime-800' },
  RECUSADO: { label: 'Recusado', className: 'bg-red-100 text-red-800' },
  FINALIZADO: { label: 'Finalizado', className: 'bg-slate-100 text-slate-700' }
};

function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  const raw = String(v).trim();
  if (!raw) return 0;

  const hasComma = raw.includes(',');
  let normalized = raw.replace(/[^\d,.-]/g, '');

  if (hasComma) {
    normalized = normalized.replace(/\./g, '').replace(',', '.');
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function formatBRL(v) {
  return `R$ ${toNumber(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function currencyInputMask(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const cents = Number(digits || '0') / 100;
  return cents.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildMonthOptions() {
  const now = new Date();
  const out = [];
  for (let i = 0; i < 18; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mes = MONTHS[d.getMonth()];
    const ano = d.getFullYear();
    out.push({ value: `${mes}|${ano}`, label: `${mes}/${ano}`, mes, ano });
  }
  return out;
}

function getPaymentStatusMeta(status) {
  return PAYMENT_STATUS_META[status] || {
    label: String(status || 'Sem status'),
    className: 'bg-gray-100 text-gray-700'
  };
}

function getMonthIndex(monthLabel) {
  return MONTHS.findIndex((month) => month === monthLabel);
}

function getPreviousReferenceFromMonth(monthLabel, yearValue) {
  const year = Number(yearValue);
  const monthIndex = getMonthIndex(monthLabel);

  if (monthIndex < 0 || !Number.isFinite(year)) return '';

  const date = new Date(year, monthIndex, 1);
  date.setMonth(date.getMonth() - 1);

  return `${MONTHS[date.getMonth()]}/${date.getFullYear()}`;
}

function getPreviousReferenceFromDate(dateValue) {
  if (!dateValue) return '';

  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return '';

  date.setMonth(date.getMonth() - 1);
  return `${MONTHS[date.getMonth()]}/${date.getFullYear()}`;
}

function getPaymentReferenceLabel(payment) {
  return (
    getPreviousReferenceFromDate(payment?.nf_data_emissao) ||
    getPreviousReferenceFromMonth(payment?.mes_referencia, payment?.ano) ||
    (payment?.mes_referencia && payment?.ano ? `${payment.mes_referencia}/${payment.ano}` : '—')
  );
}

function sanitize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function getValorParcela(member) {
  const vp = toNumber(member?.valor_parcela);
  if (vp > 0) return vp;
  const total = toNumber(member?.valor_total);
  const parcelas = toNumber(member?.numero_parcelas) || toNumber(member?.parcelas);
  return total && parcelas ? total / parcelas : 0;
}

function resolveMemberFuncao(member, currentUser) {
  return String(
    member?.funcao ||
    member?.role ||
    currentUser?.funcao ||
    currentUser?.role ||
    ''
  ).trim();
}

function resolveMemberName(member, currentUser) {
  return String(
    member?.user_name ||
    member?.nome ||
    currentUser?.full_name ||
    currentUser?.name ||
    ''
  ).trim();
}

function buildFileName({ numeroNF, member, currentUser, valor, extension }) {
  const nf = sanitize(numeroNF || 'NF');
  const cargo = sanitize(resolveMemberFuncao(member, currentUser) || 'FUNCAO');
  const nome = sanitize(resolveMemberName(member, currentUser) || 'SEM NOME');
  const valorStr = sanitize(formatBRL(valor));
  return `${nf} ${cargo} - ${nome} - MUSEUS CENTRO - ${valorStr}.${extension}`;
}

function getMemberDataStatus(member, currentUser) {
  if (!member) return { ok: false, missing: ['Perfil não encontrado'] };
  const tipoPessoa = String(member?.tipo_pessoa || 'PF').toUpperCase();
  const isPJ = tipoPessoa === 'PJ' || tipoPessoa === 'MEI' || tipoPessoa === 'ME';
  const missing = [];
  if (!resolveMemberName(member, currentUser)) missing.push('Nome');
  if (!resolveMemberFuncao(member, currentUser)) missing.push('Função');
  if (!member?.banco) missing.push('Banco');
  if (!member?.agencia) missing.push('Agência');
  if (!member?.conta) missing.push('Conta');
  if (!member?.pix_key) missing.push('PIX');
  if (isPJ && !member?.cnpj) missing.push('CNPJ');
  if (!isPJ && !member?.cpf) missing.push('CPF');
  return { ok: missing.length === 0, missing, isPJ };
}

function buildDescricaoModelo(member, currentUser, mes, ano) {
  const funcao = resolveMemberFuncao(member, currentUser) || 'Função';
  const tipoPessoa = String(member?.tipo_pessoa || 'PF').toUpperCase();
  const isPJ = tipoPessoa === 'PJ' || tipoPessoa === 'MEI' || tipoPessoa === 'ME';
  const doc = isPJ ? `CNPJ: ${member?.cnpj || ''}` : `CPF: ${member?.cpf || ''}`;
  return [
    'DESCRIÇÃO DA NOTA',
    `Prestação de serviço (${funcao}) ao Projeto Museus Centro - Termo de Colaboração ${VIADUTO_EMISSAO.termo}, parceria com SMC/FMC: ${mes}/${ano}.`,
    '',
    'Dados para pagamento',
    `Banco: ${member?.banco || ''}`,
    `Agência: ${member?.agencia || ''}`,
    `Conta: ${member?.conta || ''}`,
    doc,
    `PIX: ${member?.pix_key || ''}`,
    '',
    `VALOR: ${formatBRL(getValorParcela(member))}`,
    '',
    VIADUTO_EMISSAO.razao_social,
    `Endereço: ${VIADUTO_EMISSAO.endereco}`,
    `CNPJ: ${VIADUTO_EMISSAO.cnpj}`,
    `Inscrição Municipal: ${VIADUTO_EMISSAO.inscricao_municipal}`,
    `Telefone: ${VIADUTO_EMISSAO.telefone}`,
    `Email: ${VIADUTO_EMISSAO.email}`
  ].join('\n');
}

function safeStringify(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value || '');
  }
}

function extractErrorMessage(error) {
  if (!error) return 'Erro ao enviar.';
  if (typeof error === 'string') return error;

  return (
    error?.message ||
    error?.data?.error ||
    error?.error ||
    error?.details ||
    'Erro ao enviar.'
  );
}

function extractErrorDetails(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;

  const detailSource = {
    message: error?.message || '',
    error: error?.error || error?.data?.error || '',
    details: error?.details || error?.data?.details || '',
    status: error?.status || error?.response?.status || '',
    data: error?.data || error?.response?.data || null,
    stack: error?.stack || ''
  };

  return safeStringify(detailSource);
}

async function renameFile(file, fileName) {
  const buffer = await file.arrayBuffer();
  return new File([buffer], fileName, {
    type: file.type || 'application/octet-stream',
    lastModified: Date.now()
  });
}

export default function TeamPaymentSubmit({ userEmail }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pdfFile, setPdfFile] = useState(null);
  const [xmlFile, setXmlFile] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [analysisStep, setAnalysisStep] = useState('');
  const [submissionSteps, setSubmissionSteps] = useState([
    { label: 'Upload do PDF', done: false, failed: false },
    { label: 'Upload do XML', done: false, failed: false },
    { label: 'Análise com IA', done: false, failed: false },
    { label: 'Validações de negócio', done: false, failed: false },
    { label: 'Registro no sistema', done: false, failed: false },
    { label: 'Backup no Drive', done: false, failed: false },
    { label: 'Notificações', done: false, failed: false }
  ]);
  const [progressPercent, setProgressPercent] = useState(0);
  const [memberLocalPatch, setMemberLocalPatch] = useState({});
  const [analyzingOnly] = useState(false);
  const [submitErrorMessage, setSubmitErrorMessage] = useState('');
  const [submitErrorDetails, setSubmitErrorDetails] = useState('');
  const [showErrorDetails, setShowErrorDetails] = useState(false);

  const [form, setForm] = useState({
    competencia: '',
    numero_nf: '',
    valor_nf: '',
    nota_fiscal_url: '',
    xml_url: '',
    nota_fiscal_file_name: '',
    xml_file_name: ''
  });

  function resetSubmissionProgress() {
    setSubmissionSteps([
      { label: 'Upload do PDF', done: false, failed: false },
      { label: 'Upload do XML', done: false, failed: false },
      { label: 'Análise com IA', done: false, failed: false },
      { label: 'Validações de negócio', done: false, failed: false },
      { label: 'Registro no sistema', done: false, failed: false },
      { label: 'Backup no Drive', done: false, failed: false },
      { label: 'Notificações', done: false, failed: false }
    ]);
    setProgressPercent(0);
  }

  function markStepDone(index, percent) {
    setSubmissionSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, done: true, failed: false } : s))
    );
    setProgressPercent(percent);
  }

  function markStepFailed(index) {
    setSubmissionSteps((prev) =>
      prev.map((s, i) => (i === index ? { ...s, failed: true } : s))
    );
  }

  function clearSubmitError() {
    setSubmitErrorMessage('');
    setSubmitErrorDetails('');
    setShowErrorDetails(false);
  }

  function handleSelectPDF(file) {
    if (!file) return;
    setPdfFile(file);
    clearSubmitError();
    setForm((prev) => ({
      ...prev,
      nota_fiscal_file_name: file.name,
      nota_fiscal_url: ''
    }));
  }

  function handleSelectXML(file) {
    if (!file) return;
    setXmlFile(file);
    clearSubmitError();
    setForm((prev) => ({
      ...prev,
      xml_file_name: file.name,
      xml_url: ''
    }));
  }

  function setMemberField(field, value) {
    clearSubmitError();
    setMemberLocalPatch((prev) => ({ ...prev, [field]: value }));
  }

  const monthOptions = useMemo(() => buildMonthOptions(), []);

  const selectedComp = useMemo(
    () => monthOptions.find((o) => o.value === form.competencia) || null,
    [form.competencia, monthOptions]
  );

  const { data: currentUser } = useQuery({
    queryKey: ['auth-me'],
    queryFn: () => base44.auth.me()
  });

  const { data: member, isLoading: loadingMember } = useQuery({
    queryKey: ['team-submit-own-member', userEmail],
    queryFn: async () => {
      const rows = await base44.entities.TeamMember.filter({ user_email: userEmail });
      return Array.isArray(rows) ? rows[0] || null : null;
    },
    enabled: !!userEmail
  });

  const { data: submittedPayments = [], isLoading: loadingSubmittedPayments } = useQuery({
    queryKey: ['team-submit-own-payments', userEmail],
    queryFn: async () => {
      const rows = await base44.entities.TeamPayment.filter({ user_email: userEmail });
      if (!Array.isArray(rows)) return [];
      return [...rows].sort((a, b) => {
        const dateA = new Date(a?.created_date || a?.updated_date || 0).getTime();
        const dateB = new Date(b?.created_date || b?.updated_date || 0).getTime();
        return dateB - dateA;
      });
    },
    enabled: !!userEmail
  });

  useEffect(() => {
    let cancelled = false;

    async function hydrateMissingMemberData() {
      if (!member?.id) return;

      const missingCritical =
        !member?.banco ||
        !member?.agencia ||
        !member?.conta ||
        !member?.pix_key ||
        (!member?.cpf && !member?.cnpj);

      if (!missingCritical) return;

      try {
        const res = await base44.functions.invoke('ensureTeamMemberDataComplete', {
          team_member_id: member.id,
          user_email: member.user_email
        });

        const hydratedMember = res?.data?.member || null;
        if (!cancelled && hydratedMember) {
          setMemberLocalPatch({
            banco: member.banco || hydratedMember.banco || '',
            agencia: member.agencia || hydratedMember.agencia || '',
            conta: member.conta || hydratedMember.conta || '',
            pix_key: member.pix_key || hydratedMember.pix_key || '',
            cpf: member.cpf || hydratedMember.cpf || '',
            cnpj: member.cnpj || hydratedMember.cnpj || '',
            funcao: member.funcao || hydratedMember.funcao || hydratedMember.role || '',
            role: member.role || hydratedMember.role || hydratedMember.funcao || '',
            valor_parcela: member.valor_parcela || hydratedMember.valor_parcela || '',
            numero_parcelas: member.numero_parcelas || hydratedMember.numero_parcelas || '',
            vigencia_inicio: member.vigencia_inicio || hydratedMember.vigencia_inicio || '',
            vigencia_fim: member.vigencia_fim || hydratedMember.vigencia_fim || ''
          });
        }
      } catch (e) {
        console.warn('Falha ao completar dados do membro', e);
      }
    }

    hydrateMissingMemberData();
    return () => { cancelled = true; };
  }, [member?.id, member?.user_email, member?.funcao, member?.role]);

  const effectiveMember = useMemo(() => ({
    ...(member || {}),
    ...(memberLocalPatch || {})
  }), [member, memberLocalPatch]);

  const valorParcela = useMemo(() => getValorParcela(effectiveMember), [effectiveMember]);
  const memberStatus = useMemo(
    () => getMemberDataStatus(effectiveMember, currentUser),
    [effectiveMember, currentUser]
  );
  const resolvedFuncao = useMemo(
    () => resolveMemberFuncao(effectiveMember, currentUser),
    [effectiveMember, currentUser]
  );
  const resolvedName = useMemo(
    () => resolveMemberName(effectiveMember, currentUser),
    [effectiveMember, currentUser]
  );
  const descricaoModelo = useMemo(() => {
    if (!effectiveMember || !selectedComp) return '';
    return buildDescricaoModelo(effectiveMember, currentUser, selectedComp.mes, selectedComp.ano);
  }, [effectiveMember, currentUser, selectedComp]);

  async function saveManualMemberFields() {
    if (!effectiveMember?.id) return;
    const funcaoNormalizada = resolveMemberFuncao(effectiveMember, currentUser);

    await base44.entities.TeamMember.update(effectiveMember.id, {
      banco: effectiveMember.banco || '',
      agencia: effectiveMember.agencia || '',
      conta: effectiveMember.conta || '',
      pix_key: effectiveMember.pix_key || '',
      cpf: effectiveMember.cpf || '',
      cnpj: effectiveMember.cnpj || '',
      funcao: funcaoNormalizada,
      role: funcaoNormalizada
    }).catch(() => null);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    clearSubmitError();

    if (!effectiveMember) {
      toast.error('Perfil não encontrado.');
      return;
    }
    if (!selectedComp) {
      toast.error('Selecione o mês.');
      return;
    }
    if (!form.numero_nf) {
      toast.error('Informe o número da nota.');
      return;
    }
    if (!resolvedFuncao) {
      toast.error('Informe o cargo / função para continuar.');
      return;
    }
    if (!pdfFile && !form.nota_fiscal_url) {
      toast.error('Selecione o arquivo PDF da nota fiscal.');
      return;
    }
    if (!xmlFile && !form.xml_url) {
      toast.error('Selecione o arquivo XML da nota fiscal.');
      return;
    }

    setSubmitting(true);
    setAnalysis(null);
    resetSubmissionProgress();

    try {
      let pdfUrl = form.nota_fiscal_url;
      let pdfName = form.nota_fiscal_file_name;
      let xmlUrl = form.xml_url;
      let xmlName = form.xml_file_name;
      let created = null;

      if (pdfFile && !pdfUrl) {
        try {
          setAnalysisStep('Gravando PDF da nota fiscal...');
          const renamed = await renameFile(
            pdfFile,
            buildFileName({
              numeroNF: form.numero_nf || 'NF',
              member: effectiveMember,
              currentUser,
              valor: form.valor_nf || valorParcela,
              extension: 'pdf'
            })
          );
          const { file_url } = await base44.integrations.Core.UploadFile({ file: renamed });
          pdfUrl = file_url;
          pdfName = renamed.name;
          setForm((prev) => ({
            ...prev,
            nota_fiscal_url: file_url,
            nota_fiscal_file_name: renamed.name
          }));
          markStepDone(0, 15);
        } catch (err) {
          markStepFailed(0);
          throw err;
        }
      } else {
        markStepDone(0, 15);
      }

      if (xmlFile && !xmlUrl) {
        try {
          setAnalysisStep('Gravando XML da nota fiscal...');
          const renamed = await renameFile(
            xmlFile,
            buildFileName({
              numeroNF: form.numero_nf || 'NF',
              member: effectiveMember,
              currentUser,
              valor: form.valor_nf || valorParcela,
              extension: 'xml'
            })
          );
          const { file_url } = await base44.integrations.Core.UploadFile({ file: renamed });
          xmlUrl = file_url;
          xmlName = renamed.name;
          setForm((prev) => ({
            ...prev,
            xml_url: file_url,
            xml_file_name: renamed.name
          }));
          markStepDone(1, 30);
        } catch (err) {
          markStepFailed(1);
          throw err;
        }
      } else {
        markStepDone(1, 30);
      }

      setAnalysisStep('Lendo nota fiscal com IA...');
      let ar = {};

      try {
        const analysisResult = await base44.functions.invoke('validateTeamPaymentInvoice', {
          file_url: pdfUrl,
          xml_url: xmlUrl,
          mes_referencia: selectedComp.mes,
          ano: selectedComp.ano,
          numero_nf: form.numero_nf,
          valor_esperado: toNumber(form.valor_nf || valorParcela),
          member_snapshot: {
            user_name: resolvedName || '',
            funcao: resolvedFuncao,
            role: resolvedFuncao,
            tipo_pessoa: effectiveMember.tipo_pessoa || 'PF',
            cpf: effectiveMember.cpf || '',
            cnpj: effectiveMember.cnpj || '',
            banco: effectiveMember.banco || '',
            agencia: effectiveMember.agencia || '',
            conta: effectiveMember.conta || '',
            pix_key: effectiveMember.pix_key || '',
            contrato_url: effectiveMember.contrato_url || effectiveMember.file_url || ''
          },
          descricao_modelo: descricaoModelo
        });

        ar = analysisResult?.data || analysisResult || {};
      } catch (analysisError) {
        console.error('ERRO IA:', analysisError);
        ar = {
          can_submit: true,
          status: 'ATENCAO',
          summary: 'IA indisponível - envio permitido',
          warnings: ['Análise automática falhou'],
          critical_issues: []
        };
      }

      setAnalysis(ar);
      markStepDone(2, 45);

      if (ar?.can_submit === false) {
        toast.error('A IA identificou inconsistências críticas. Revise antes de enviar.');
        setSubmitting(false);
        setAnalysisStep('');
        return;
      }

      try {
        setAnalysisStep('Executando validações de negócio...');

        const existing = await base44.entities.TeamPayment.filter({
          team_member_id: effectiveMember.id,
          numero_nf: form.numero_nf,
          mes_referencia: selectedComp.mes,
          ano: selectedComp.ano
        });

        if (Array.isArray(existing) && existing.length > 0) {
          throw new Error('Já existe uma nota fiscal enviada para essa competência com esse número.');
        }

        try {
          const budgetCheck = await base44.functions.invoke('check_budget', {
            valor: toNumber(form.valor_nf || valorParcela),
            user_email: effectiveMember.user_email,
            contexto: 'TEAM_PAYMENT',
            mes: selectedComp.mes,
            ano: selectedComp.ano
          });

          const bc = budgetCheck?.data || budgetCheck || {};

          if (bc?.blocked_by_rubrica) {
            throw new Error('Envio bloqueado: rubrica inválida ou não permitida.');
          }

          if (bc?.saldo_insuficiente) {
            throw new Error('Saldo insuficiente para envio desta nota fiscal.');
          }
        } catch (budgetError) {
          if (budgetError instanceof Error) throw budgetError;
          throw new Error(extractErrorMessage(budgetError));
        }

        markStepDone(3, 60);
      } catch (err) {
        markStepFailed(3);
        throw err;
      }

      try {
        setAnalysisStep('Registrando envio no sistema...');
        await saveManualMemberFields();

        created = await base44.entities.TeamPayment.create({
          team_member_id: effectiveMember.id,
          user_email: effectiveMember.user_email,
          user_name: resolvedName || '',
          funcao: resolvedFuncao,
          role: resolvedFuncao,
          mes_referencia: selectedComp.mes,
          ano: selectedComp.ano,
          numero_nf: form.numero_nf,
          valor_nf: toNumber(form.valor_nf || valorParcela),
          valor_parcela_previsto: valorParcela,
          numero_parcela: (toNumber(effectiveMember.parcelas_pagas) || 0) + 1,
          nota_fiscal_url: pdfUrl,
          xml_url: xmlUrl,
          nota_fiscal_file_name: pdfName,
          xml_file_name: xmlName,
          descricao_nf_modelo: descricaoModelo,
          analysis_status: ar?.status || 'ANALISADO',
          analysis_summary: ar?.summary || '',
          analysis_warnings: Array.isArray(ar?.warnings) ? ar.warnings : [],
          analysis_critical_issues: Array.isArray(ar?.critical_issues) ? ar.critical_issues : [],
          resultado_validacao: JSON.stringify(ar || {}),
          status: 'AGUARDANDO_APROVACAO'
        });

        markStepDone(4, 75);
      } catch (err) {
        markStepFailed(4);
        throw err;
      }

      try {
        setAnalysisStep('Executando backup no Drive...');
        await base44.functions.invoke('backupNotasFiscaisToDrive', {
          file_url: pdfUrl,
          file_name: pdfName,
          xml_url: xmlUrl,
          xml_file_name: xmlName,
          team_payment_id: created?.id
        });
        markStepDone(5, 88);
      } catch (err) {
        console.warn('Falha no backup do Drive (não bloqueante)', err);
        markStepFailed(5);
      }

      try {
        setAnalysisStep('Enviando notificações...');
        await base44.functions.invoke('notifyTeamPaymentSubmitted', {
          payment_id: created?.id,
          team_member_name: resolvedName || '',
          cargo: resolvedFuncao,
          mes: selectedComp.mes,
          ano: selectedComp.ano,
          valor: toNumber(form.valor_nf || valorParcela),
          user_email: effectiveMember.user_email,
          requester_email: currentUser?.email || effectiveMember.user_email || '',
          nota_fiscal_url: pdfUrl,
          xml_url: xmlUrl,
          nota_fiscal_file_name: pdfName,
          xml_file_name: xmlName,
          app_link: `${window.location.origin}/Compras`
        });

        await notifyCoordinators({
          title: '💰 Nova nota fiscal para aprovação',
          message: `${resolvedName || effectiveMember.user_email} enviou nota fiscal de ${selectedComp.mes}/${selectedComp.ano} (${formatBRL(toNumber(form.valor_nf || valorParcela))}) para aprovação.`,
          type: 'PAYMENT_SUBMITTED',
          action_url: `${window.location.origin}/Compras`
        });

        markStepDone(6, 100);
      } catch (err) {
        console.warn('Falha nas notificações (não bloqueante)', err);
        markStepFailed(6);
      }

      toast.success(`✅ Nota fiscal de ${selectedComp.mes}/${selectedComp.ano} enviada com sucesso!`);

      setTimeout(() => {
        setOpen(false);
        setPdfFile(null);
        setXmlFile(null);
        setForm({
          competencia: '',
          numero_nf: '',
          valor_nf: '',
          nota_fiscal_url: '',
          xml_url: '',
          nota_fiscal_file_name: '',
          xml_file_name: ''
        });
        setAnalysis(null);
        setAnalysisStep('');
        clearSubmitError();
        resetSubmissionProgress();
      }, 500);

      await queryClient.invalidateQueries();
    } catch (e) {
      const message = extractErrorMessage(e);
      const details = extractErrorDetails(e);

      setSubmitErrorMessage(message);
      setSubmitErrorDetails(details);
      setShowErrorDetails(true);

      toast.error(message);
    } finally {
      setSubmitting(false);
      setAnalysisStep('');
    }
  }

  if (loadingMember) {
    return (
      <div className="rounded-xl border p-4 text-sm text-gray-500 flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
      </div>
    );
  }

  if (!effectiveMember) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Perfil de equipe não localizado. Peça ao coordenador para cadastrá-lo.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Meus pagamentos</h3>
          <p className="text-xs text-gray-500">
            Histórico de envios realizados, com mês de referência exibido como o mês anterior ao da nota fiscal.
          </p>
        </div>

        {loadingSubmittedPayments ? (
          <div className="rounded-xl border p-4 text-sm text-gray-500 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Carregando envios realizados...
          </div>
        ) : submittedPayments.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-gray-200">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="px-3 py-3 font-medium text-gray-600">Mês de referência</th>
                  <th className="px-3 py-3 font-medium text-gray-600">Valor</th>
                  <th className="px-3 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-3 py-3 font-medium text-gray-600">Nota fiscal</th>
                </tr>
              </thead>
              <tbody>
                {submittedPayments.map((payment) => {
                  const statusMeta = getPaymentStatusMeta(payment?.status);
                  const notaFiscalUrl = payment?.nota_fiscal_url || '';
                  const notaFiscalLabel = payment?.numero_nf
                    ? `NF ${payment.numero_nf}`
                    : (payment?.nota_fiscal_file_name || 'Abrir nota fiscal');

                  return (
                    <tr key={payment.id} className="border-b border-gray-100 bg-white last:border-b-0 hover:bg-gray-50">
                      <td className="px-3 py-2.5 font-medium text-gray-900">
                        {getPaymentReferenceLabel(payment)}
                      </td>
                      <td className="px-3 py-2.5 text-gray-700">
                        {formatBRL(payment?.valor_nf || payment?.valor_parcela_previsto || 0)}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusMeta.className}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">
                        {notaFiscalUrl ? (
                          <a
                            href={notaFiscalUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-sm font-medium text-blue-700 hover:underline"
                          >
                            <Eye className="w-4 h-4" /> {notaFiscalLabel}
                          </a>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 p-4 text-sm text-gray-500">
            Nenhum envio realizado até o momento.
          </div>
        )}
      </div>

      <Button onClick={() => { clearSubmitError(); setOpen(true); }}>
        <Plus className="w-4 h-4 mr-2" /> Novo envio
      </Button>

      {!memberStatus.ok && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 space-y-1">
          <div className="font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            ⚠ Dados incompletos: {memberStatus.missing.join(', ')} — você pode preenchê-los manualmente abaixo.
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={(value) => {
        setOpen(value);
        if (!value) setShowErrorDetails(false);
      }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Envio mensal de nota fiscal</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Mês de envio *</Label>
                <Select
                  value={form.competencia}
                  onValueChange={(v) => {
                    clearSubmitError();
                    setForm((prev) => ({ ...prev, competencia: v }));
                    setAnalysis(null);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o mês" /></SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Número da nota fiscal *</Label>
                <Input
                  value={form.numero_nf}
                  onChange={(e) => {
                    clearSubmitError();
                    setForm((prev) => ({ ...prev, numero_nf: e.target.value }));
                  }}
                  placeholder="Ex.: NF 1"
                />
              </div>

              <div className="space-y-2">
                <Label>Valor da nota</Label>
                <Input
                  value={form.valor_nf}
                  onChange={(e) => {
                    clearSubmitError();
                    setForm((prev) => ({ ...prev, valor_nf: currencyInputMask(e.target.value) }));
                  }}
                  placeholder={currencyInputMask(String(Math.round(valorParcela * 100)))}
                />
              </div>

              <div className="space-y-2">
                <Label>Valor previsto da parcela</Label>
                <Input value={formatBRL(valorParcela)} disabled className="bg-gray-50" />
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
              <div className="font-medium text-gray-900 mb-2">Seus dados bancários para conferência</div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Cargo / Função</Label>
                  <Input
                    value={resolvedFuncao}
                    onChange={(e) => {
                      clearSubmitError();
                      const value = e.target.value;
                      setMemberField('funcao', value);
                      setMemberField('role', value);
                    }}
                    placeholder="Informe seu cargo / função"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Banco</Label>
                  <Input
                    value={effectiveMember?.banco || ''}
                    onChange={(e) => setMemberField('banco', e.target.value)}
                    placeholder="Banco"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Agência</Label>
                  <Input
                    value={effectiveMember?.agencia || ''}
                    onChange={(e) => setMemberField('agencia', e.target.value)}
                    placeholder="Agência"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Conta</Label>
                  <Input
                    value={effectiveMember?.conta || ''}
                    onChange={(e) => setMemberField('conta', e.target.value)}
                    placeholder="Conta"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>PIX</Label>
                  <Input
                    value={effectiveMember?.pix_key || ''}
                    onChange={(e) => setMemberField('pix_key', e.target.value)}
                    placeholder="Chave PIX"
                  />
                </div>

                {memberStatus.isPJ ? (
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>CNPJ</Label>
                    <Input
                      value={effectiveMember?.cnpj || ''}
                      onChange={(e) => setMemberField('cnpj', e.target.value)}
                      placeholder="CNPJ"
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5 md:col-span-2">
                    <Label>CPF</Label>
                    <Input
                      value={effectiveMember?.cpf || ''}
                      onChange={(e) => setMemberField('cpf', e.target.value)}
                      placeholder="CPF"
                    />
                  </div>
                )}
              </div>

              {!memberStatus.ok && (
                <div className="mt-2 text-amber-600 text-xs font-medium">
                  💡 Campos faltantes: {memberStatus.missing.join(', ')} — você pode corrigi-los manualmente aqui ou em "Meus Dados".
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Escolher arquivo de nota fiscal (PDF) *</Label>
                <label className="border-2 border-dashed rounded-xl p-4 block cursor-pointer hover:bg-gray-50 transition">
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    onChange={(e) => handleSelectPDF(e.target.files?.[0])}
                    disabled={submitting || analyzingOnly}
                  />
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Upload className="w-4 h-4" />
                    {pdfFile ? (
                      <span className="text-green-700 font-medium">{pdfFile.name}</span>
                    ) : 'Selecionar arquivo PDF'}
                  </div>
                </label>

                {pdfFile && (
                  <div className="text-xs text-green-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Arquivo selecionado — será enviado ao confirmar
                  </div>
                )}

                {form.nota_fiscal_url && (
                  <div className="space-y-2">
                    <a
                      href={form.nota_fiscal_url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
                    >
                      <Eye className="w-4 h-4" /> Visualizar PDF gravado
                    </a>
                    <iframe
                      src={form.nota_fiscal_url}
                      title="Preview NF"
                      className="w-full h-64 rounded-lg border"
                    />
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label>Escolher arquivo XML *</Label>
                <label className="border-2 border-dashed rounded-xl p-4 block cursor-pointer hover:bg-gray-50 transition">
                  <input
                    type="file"
                    accept=".xml,text/xml,application/xml"
                    className="hidden"
                    onChange={(e) => handleSelectXML(e.target.files?.[0])}
                    disabled={submitting || analyzingOnly}
                  />
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <FileText className="w-4 h-4" />
                    {xmlFile ? (
                      <span className="text-green-700 font-medium">{xmlFile.name}</span>
                    ) : 'Selecionar arquivo XML'}
                  </div>
                </label>

                {xmlFile && (
                  <div className="text-xs text-green-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Arquivo selecionado — será enviado ao confirmar
                  </div>
                )}

                {form.xml_url && (
                  <a
                    href={form.xml_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
                  >
                    <Eye className="w-4 h-4" /> Visualizar XML gravado
                  </a>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm space-y-3">
              <div className="font-semibold text-amber-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                O que deve constar na Nota Fiscal
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-amber-800">
                <div className="space-y-1">
                  <div><strong>Razão Social:</strong> {VIADUTO_EMISSAO.razao_social}</div>
                  <div><strong>CNPJ:</strong> {VIADUTO_EMISSAO.cnpj}</div>
                  <div><strong>Inscrição Municipal:</strong> {VIADUTO_EMISSAO.inscricao_municipal}</div>
                  <div><strong>Telefone:</strong> {VIADUTO_EMISSAO.telefone}</div>
                  <div><strong>Email:</strong> {VIADUTO_EMISSAO.email}</div>
                </div>

                <div className="space-y-1">
                  <div><strong>Endereço:</strong> {VIADUTO_EMISSAO.endereco}</div>
                  <div><strong>Termo:</strong> {VIADUTO_EMISSAO.termo}</div>
                  <div><strong>Competência:</strong> {selectedComp ? `${selectedComp.mes}/${selectedComp.ano}` : 'Selecione o mês'}</div>
                  <div><strong>Função:</strong> {resolvedFuncao || 'Informe sua função'}</div>
                  <div><strong>Valor previsto:</strong> {formatBRL(valorParcela)}</div>
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-white p-3">
                <div className="font-medium text-amber-900 mb-2">Modelo sugerido para descrição</div>
                <pre className="whitespace-pre-wrap text-xs text-amber-900">{descricaoModelo}</pre>
              </div>
            </div>

            {(submitting || progressPercent > 0) && (
              <div className="rounded-xl border p-4 space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <div className="font-medium flex items-center gap-2">
                    <Brain className="w-4 h-4" />
                    {analysisStep || 'Processando envio...'}
                  </div>
                  <div className="text-gray-500">{progressPercent}%</div>
                </div>

                <Progress value={progressPercent} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                  {submissionSteps.map((step, index) => (
                    <div
                      key={index}
                      className={`rounded-lg border px-3 py-2 flex items-center gap-2 ${
                        step.failed
                          ? 'border-red-200 bg-red-50 text-red-700'
                          : step.done
                            ? 'border-green-200 bg-green-50 text-green-700'
                            : 'border-gray-200 bg-gray-50 text-gray-600'
                      }`}
                    >
                      {step.failed ? (
                        <AlertCircle className="w-3.5 h-3.5" />
                      ) : step.done ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <Loader2 className={`w-3.5 h-3.5 ${submitting ? 'animate-spin' : ''}`} />
                      )}
                      <span>{step.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {analysis && (
              <div className={`rounded-xl border p-4 text-sm space-y-3 ${
                analysis?.status === 'CONFORME'
                  ? 'border-green-200 bg-green-50 text-green-900'
                  : analysis?.status === 'CRITICO'
                    ? 'border-red-200 bg-red-50 text-red-900'
                    : 'border-amber-200 bg-amber-50 text-amber-900'
              }`}>
                <div className="font-semibold">Resultado da análise automática</div>

                {analysis.summary && <div>{analysis.summary}</div>}

                {Array.isArray(analysis.critical_issues) && analysis.critical_issues.length > 0 && (
                  <div>
                    <div className="font-medium">Pontos críticos</div>
                    <ul className="list-disc pl-5">
                      {analysis.critical_issues.map((i, idx) => <li key={idx}>{i}</li>)}
                    </ul>
                  </div>
                )}

                {Array.isArray(analysis.warnings) && analysis.warnings.length > 0 && (
                  <div>
                    <div className="font-medium">Alertas</div>
                    <ul className="list-disc pl-5">
                      {analysis.warnings.map((i, idx) => <li key={idx}>{i}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {submitErrorMessage && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 space-y-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <div className="font-semibold">Falha no envio</div>
                    <div>{submitErrorMessage}</div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowErrorDetails((prev) => !prev)}
                    className="h-8"
                  >
                    {showErrorDetails ? 'Ocultar detalhes' : 'Ver detalhes do erro'}
                  </Button>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={clearSubmitError}
                    className="h-8"
                  >
                    Limpar erro
                  </Button>
                </div>

                {showErrorDetails && (
                  <pre className="whitespace-pre-wrap break-words rounded-lg border border-red-200 bg-white p-3 text-xs text-red-900 overflow-x-auto">
                    {submitErrorDetails || submitErrorMessage}
                  </pre>
                )}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting || analyzingOnly}>
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analisando e enviando...
                  </>
                ) : '✅ Enviar nota para aprovação'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
