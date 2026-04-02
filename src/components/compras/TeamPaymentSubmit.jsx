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
  AlertCircle, CheckCircle2, Eye, FileText, Loader2, Plus, Upload, Brain, FileCheck
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

function toNumber(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function formatBRL(v) {
  return `R$ ${toNumber(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function getPreviousMonthRef(mes, ano) {
  const idx = MONTHS.indexOf(mes);
  if (idx === -1) return null;
  return idx === 0 ? { mes: 'Dezembro', ano: Number(ano) - 1 } : { mes: MONTHS[idx - 1], ano: Number(ano) };
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

function buildFileName({ numeroNF, member, currentUser, valor, extension }) {
  const nf = sanitize(numeroNF || 'NF');
  const cargo = sanitize(resolveMemberFuncao(member, currentUser) || 'FUNCAO');
  const nome = sanitize(member?.user_name || member?.nome || currentUser?.full_name || 'SEM NOME');
  const valorStr = sanitize(formatBRL(valor));
  return `${nf} ${cargo} - ${nome} - MUSEUS CENTRO - ${valorStr}.${extension}`;
}

function getMemberDataStatus(member, currentUser) {
  if (!member) return { ok: false, missing: ['Perfil não encontrado'] };
  const isPJ = String(member?.tipo_pessoa || 'PF').toUpperCase() === 'PJ' || String(member?.tipo_pessoa || 'PF').toUpperCase() === 'MEI' || String(member?.tipo_pessoa || 'PF').toUpperCase() === 'ME';
  const missing = [];
  if (!(member?.user_name || member?.nome || currentUser?.full_name)) missing.push('Nome');
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
  const isPJ = String(member?.tipo_pessoa || 'PF').toUpperCase() === 'PJ' || String(member?.tipo_pessoa || 'PF').toUpperCase() === 'MEI' || String(member?.tipo_pessoa || 'PF').toUpperCase() === 'ME';
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

async function renameFile(file, fileName) {
  const buffer = await file.arrayBuffer();
  return new File([buffer], fileName, { type: file.type || 'application/octet-stream', lastModified: Date.now() });
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
    { label: 'Verificação de relatório', done: false },
    { label: 'Upload do PDF', done: false },
    { label: 'Upload do XML', done: false },
    { label: 'Análise com IA', done: false },
    { label: 'Registro no sistema', done: false },
    { label: 'Backup no Drive', done: false },
    { label: 'Notificações', done: false }
  ]);
  const [progressPercent, setProgressPercent] = useState(0);
  const [memberLocalPatch, setMemberLocalPatch] = useState({});
  const [analyzingOnly, setAnalyzingOnly] = useState(false);

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
      { label: 'Verificação de relatório', done: false },
      { label: 'Upload do PDF', done: false },
      { label: 'Upload do XML', done: false },
      { label: 'Análise com IA', done: false },
      { label: 'Registro no sistema', done: false },
      { label: 'Backup no Drive', done: false },
      { label: 'Notificações', done: false }
    ]);
    setProgressPercent(0);
  }

  function markStepDone(index, percent) {
    setSubmissionSteps((prev) => prev.map((s, i) => i === index ? { ...s, done: true } : s));
    setProgressPercent(percent);
  }

  function handleSelectPDF(file) {
    if (!file) return;
    setPdfFile(file);
    setForm((prev) => ({ ...prev, nota_fiscal_file_name: file.name, nota_fiscal_url: '' }));
  }

  function handleSelectXML(file) {
    if (!file) return;
    setXmlFile(file);
    setForm((prev) => ({ ...prev, xml_file_name: file.name, xml_url: '' }));
  }

  function setMemberField(field, value) {
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
  const memberStatus = useMemo(() => getMemberDataStatus(effectiveMember, currentUser), [effectiveMember, currentUser]);
  const resolvedFuncao = useMemo(() => resolveMemberFuncao(effectiveMember, currentUser), [effectiveMember, currentUser]);
  const descricaoModelo = useMemo(() => {
    if (!effectiveMember || !selectedComp) return '';
    return buildDescricaoModelo(effectiveMember, currentUser, selectedComp.mes, selectedComp.ano);
  }, [effectiveMember, currentUser, selectedComp]);

  async function checkPreviousReport() {
    if (!selectedComp || !currentUser?.email) return { ok: true };
    const prev = getPreviousMonthRef(selectedComp.mes, selectedComp.ano);
    if (!prev) return { ok: true };
    const reports = await base44.entities.Report.filter({ mes_referencia: prev.mes, ano: prev.ano });
    const email = String(currentUser.email).toLowerCase();
    const own = (reports || []).find((r) =>
      String(r?.created_by || '').toLowerCase() === email ||
      String(r?.author_email || '').toLowerCase() === email
    );
    if (!own) {
      return {
        ok: false,
        message: `Antes de enviar a nota de ${selectedComp.mes}/${selectedComp.ano}, envie o relatório de ${prev.mes}/${prev.ano} ao coordenador.`
      };
    }
    if (!['SUBMITTED', 'APPROVED'].includes(String(own.status || '').toUpperCase())) {
      return {
        ok: false,
        message: `O relatório de ${prev.mes}/${prev.ano} ainda não foi enviado. Status: ${own.status}.`
      };
    }
    return { ok: true };
  }

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
    if (!effectiveMember) { toast.error('Perfil não encontrado.'); return; }
    if (!selectedComp) { toast.error('Selecione o mês.'); return; }
    if (!form.numero_nf) { toast.error('Informe o número da nota.'); return; }
    if (!resolvedFuncao) { toast.error('Informe o cargo / função para continuar.'); return; }
    if (!pdfFile && !form.nota_fiscal_url) { toast.error('Selecione o arquivo PDF da nota fiscal.'); return; }
    if (!xmlFile && !form.xml_url) { toast.error('Selecione o arquivo XML da nota fiscal.'); return; }

    setSubmitting(true);
    setAnalysis(null);
    resetSubmissionProgress();

    try {
      setAnalysisStep('Verificando relatório anterior...');
      const repCheck = await checkPreviousReport();
      if (!repCheck.ok) {
        toast.error(repCheck.message);
        setSubmitting(false);
        setAnalysisStep('');
        return;
      }
      markStepDone(0, 14);

      if (pdfFile && !form.nota_fiscal_url) {
        setAnalysisStep('Enviando PDF...');
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
        setForm((prev) => ({ ...prev, nota_fiscal_url: file_url, nota_fiscal_file_name: renamed.name }));
        form.nota_fiscal_url = file_url;
        form.nota_fiscal_file_name = renamed.name;
      }
      markStepDone(1, 28);

      if (xmlFile && !form.xml_url) {
        setAnalysisStep('Enviando XML...');
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
        setForm((prev) => ({ ...prev, xml_url: file_url, xml_file_name: renamed.name }));
        form.xml_url = file_url;
        form.xml_file_name = renamed.name;
      }
      markStepDone(2, 42);

      setAnalysisStep('Analisando nota fiscal com IA...');
      const analysisResult = await base44.functions.invoke('validateTeamPaymentInvoice', {
        file_url: form.nota_fiscal_url,
        xml_url: form.xml_url,
        mes_referencia: selectedComp.mes,
        ano: selectedComp.ano,
        numero_nf: form.numero_nf,
        valor_esperado: valorParcela,
        member_snapshot: {
          user_name: effectiveMember.user_name || currentUser?.full_name || '',
          funcao: resolvedFuncao,
          role: resolvedFuncao,
          tipo_pessoa: effectiveMember.tipo_pessoa || 'PF',
          cpf: effectiveMember.cpf || '',
          cnpj: effectiveMember.cnpj || '',
          banco: effectiveMember.banco || '',
          agencia: effectiveMember.agencia || '',
          conta: effectiveMember.conta || '',
          pix_key: effectiveMember.pix_key || ''
        },
        descricao_modelo: descricaoModelo
      });

      const ar = analysisResult?.data || analysisResult || {};
      setAnalysis(ar);
      markStepDone(3, 57);

      if (ar?.can_submit === false) {
        toast.error('A IA identificou inconsistências críticas. Revise antes de enviar.');
        setSubmitting(false);
        setAnalysisStep('');
        return;
      }

      await saveManualMemberFields();

      setAnalysisStep('Registrando envio...');
      const created = await base44.entities.TeamPayment.create({
        team_member_id: effectiveMember.id,
        user_email: effectiveMember.user_email,
        user_name: effectiveMember.user_name || currentUser?.full_name || '',
        funcao: resolvedFuncao,
        role: resolvedFuncao,
        mes_referencia: selectedComp.mes,
        ano: selectedComp.ano,
        numero_nf: form.numero_nf,
        valor_nf: toNumber(form.valor_nf || valorParcela),
        valor_parcela_previsto: valorParcela,
        numero_parcela: (toNumber(effectiveMember.parcelas_pagas) || 0) + 1,
        nota_fiscal_url: form.nota_fiscal_url,
        xml_url: form.xml_url,
        nota_fiscal_file_name: form.nota_fiscal_file_name,
        xml_file_name: form.xml_file_name,
        descricao_nf_modelo: descricaoModelo,
        analysis_status: ar?.status || 'ANALISADO',
        analysis_summary: ar?.summary || '',
        analysis_warnings: Array.isArray(ar?.warnings) ? ar.warnings : [],
        analysis_critical_issues: Array.isArray(ar?.critical_issues) ? ar.critical_issues : [],
        status: 'AGUARDANDO_APROVACAO'
      });
      markStepDone(4, 71);

      try {
        setAnalysisStep('Gerando backup automático no Drive...');
        await base44.functions.invoke('backupNotasFiscaisToDrive', {
          file_url: form.nota_fiscal_url,
          file_name: form.nota_fiscal_file_name,
          xml_url: form.xml_url,
          xml_file_name: form.xml_file_name,
          team_payment_id: created?.id
        });
      } catch (e) {
        console.warn('Falha no backup do Drive (não bloqueante)', e);
      }
      markStepDone(5, 85);

      setAnalysisStep('Enviando notificações...');
      await base44.functions.invoke('notifyTeamPaymentSubmitted', {
        payment_id: created?.id,
        team_member_name: effectiveMember.user_name || currentUser?.full_name || '',
        cargo: resolvedFuncao,
        funcao: resolvedFuncao,
        mes: selectedComp.mes,
        ano: selectedComp.ano,
        valor: toNumber(form.valor_nf || valorParcela),
        user_email: effectiveMember.user_email,
        requester_email: currentUser?.email || effectiveMember.user_email || '',
        nota_fiscal_url: form.nota_fiscal_url,
        xml_url: form.xml_url,
        nota_fiscal_file_name: form.nota_fiscal_file_name,
        xml_file_name: form.xml_file_name,
        app_link: window.location.origin + '/Compras',
        cc_emails: ['danielperini.mc@viadutodasartes.org.br', 'notasfiscais@viadutodasartes.org.br']
      });

      await notifyCoordinators({
        title: '💰 Nova nota fiscal para aprovação',
        message: `${effectiveMember.user_name || effectiveMember.user_email} enviou nota fiscal de ${selectedComp.mes}/${selectedComp.ano} (${formatBRL(toNumber(form.valor_nf || valorParcela))}) para aprovação.`,
        type: 'PAYMENT_SUBMITTED',
        action_url: `${window.location.origin}/Compras`
      });

      markStepDone(6, 100);

      setTimeout(() => {
        toast.success(`✅ Nota fiscal de ${selectedComp.mes}/${selectedComp.ano} enviada com sucesso!`);
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
        resetSubmissionProgress();
      }, 500);

      await queryClient.invalidateQueries();
    } catch (e) {
      toast.error(e?.message || 'Erro ao enviar.');
    } finally {
      setSubmitting(false);
      setAnalysisStep('');
    }
  }

  if (loadingMember) return (
    <div className="rounded-xl border p-4 text-sm text-gray-500 flex items-center gap-2">
      <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
    </div>
  );

  if (!effectiveMember) return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      Perfil de equipe não localizado. Peça ao coordenador para cadastrá-lo.
    </div>
  );

  return (
    <div className="space-y-4">
      <Button onClick={() => setOpen(true)}>
        <Plus className="w-4 h-4 mr-2" /> Novo envio
      </Button>

      {!memberStatus.ok &&
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 space-y-1">
          <div className="font-medium flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> ⚠ Dados incompletos: {memberStatus.missing.join(', ')} — você pode preenchê-los manualmente abaixo.
          </div>
        </div>
      }

      <Dialog open={open} onOpenChange={setOpen}>
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
                  onValueChange={(v) => { setForm((prev) => ({ ...prev, competencia: v })); setAnalysis(null); }}
                >
                  <SelectTrigger><SelectValue placeholder="Selecione o mês" /></SelectTrigger>
                  <SelectContent>
                    {monthOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Número da nota fiscal *</Label>
                <Input
                  value={form.numero_nf}
                  onChange={(e) => setForm((prev) => ({ ...prev, numero_nf: e.target.value }))}
                  placeholder="Ex.: NF 1"
                />
              </div>

              <div className="space-y-2">
                <Label>Valor da nota</Label>
                <Input
                  value={form.valor_nf}
                  onChange={(e) => setForm((prev) => ({ ...prev, valor_nf: e.target.value }))}
                  placeholder={formatBRL(valorParcela)}
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

              {!memberStatus.ok &&
                <div className="mt-2 text-amber-600 text-xs font-medium">
                  💡 Campos faltantes: {memberStatus.missing.join(', ')} — você pode corrigi-los manualmente aqui ou em "Meus Dados".
                </div>
              }
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Escolher arquivo de nota fiscal (PDF) *</Label>
                <label className="border-2 border-dashed rounded-xl p-4 block cursor-pointer hover:bg-gray-50 transition">
                  <input type="file" accept=".pdf" className="hidden" onChange={(e) => handleSelectPDF(e.target.files?.[0])} disabled={submitting || analyzingOnly} />
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Upload className="w-4 h-4" />
                    {pdfFile ? <span className="text-green-700 font-medium">{pdfFile.name}</span> : 'Selecionar arquivo PDF'}
                  </div>
                </label>
                {pdfFile &&
                  <div className="text-xs text-green-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Arquivo selecionado — será enviado ao confirmar
                  </div>
                }
                {form.nota_fiscal_url &&
                  <div className="space-y-2">
                    <a href={form.nota_fiscal_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
                      <Eye className="w-4 h-4" /> Visualizar PDF gravado
                    </a>
                    <iframe src={form.nota_fiscal_url} title="Preview NF" className="w-full h-64 rounded-lg border" />
                  </div>
                }
              </div>

              <div className="space-y-2">
                <Label>Escolher arquivo XML *</Label>
                <label className="border-2 border-dashed rounded-xl p-4 block cursor-pointer hover:bg-gray-50 transition">
                  <input type="file" accept=".xml,text/xml,application/xml" className="hidden" onChange={(e) => handleSelectXML(e.target.files?.[0])} disabled={submitting || analyzingOnly} />
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <FileText className="w-4 h-4" />
                    {xmlFile ? <span className="text-green-700 font-medium">{xmlFile.name}</span> : 'Selecionar arquivo XML'}
                  </div>
                </label>
                {xmlFile &&
                  <div className="text-xs text-green-700 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Arquivo selecionado — será enviado ao confirmar
                  </div>
                }
                {form.xml_url &&
                  <a href={form.xml_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline">
                    <Eye className="w-4 h-4" /> Visualizar XML gravado
                  </a>
                }
              </div>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm space-y-3">
              <div className="font-semibold text-amber-900 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                O que deve constar na Nota Fiscal
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-amber-800">
                <div className="space-y-1.5">
                  <p className="font-semibold text-amber-900">Dados do Tomador (quem paga)</p>
                  <div className="bg-white/70 rounded-lg p-2 border border-amber-100 space-y-0.5">
                    <p><span className="font-medium">Razão Social:</span> {VIADUTO_EMISSAO.razao_social}</p>
                    <p><span className="font-medium">CNPJ:</span> {VIADUTO_EMISSAO.cnpj}</p>
                    <p><span className="font-medium">Insc. Municipal:</span> {VIADUTO_EMISSAO.inscricao_municipal}</p>
                    <p><span className="font-medium">Endereço:</span> {VIADUTO_EMISSAO.endereco}</p>
                    <p><span className="font-medium">Telefone:</span> {VIADUTO_EMISSAO.telefone}</p>
                    <p><span className="font-medium">E-mail:</span> {VIADUTO_EMISSAO.email}</p>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="font-semibold text-amber-900">Descrição do Serviço</p>
                  <div className="bg-white/70 rounded-lg p-2 border border-amber-100 space-y-1">
                    <p>Prestação de serviço ({resolvedFuncao || 'sua função'}) ao Projeto Museus Centro</p>
                    <p>Termo de Colaboração <span className="font-medium">{VIADUTO_EMISSAO.termo}</span></p>
                    <p>Parceria com SMC/FMC — referente ao mês selecionado</p>
                  </div>
                  <p className="font-semibold text-amber-900 mt-2">Valor</p>
                  <div className="bg-white/70 rounded-lg p-2 border border-amber-100">
                    <p>O valor deve ser exatamente o valor da parcela prevista.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
              <span className="font-medium text-gray-800">Padrão de nome dos arquivos: </span>
              NF [Número da NF] CARGO - SEU NOME - MUSEUS CENTRO - R$ VALOR DA NOTA
              <span className="block text-gray-400 mt-0.5">Os arquivos são renomeados automaticamente nesse padrão ao fazer upload.</span>
            </div>

            {submitting &&
              <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 space-y-3">
                <div className="flex items-center gap-3 text-sm text-purple-800">
                  <Brain className="w-5 h-5 animate-pulse" />
                  <span className="font-medium">{analysisStep}</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
                <div className="space-y-2 text-xs text-purple-700">
                  {submissionSteps.map((step, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {step.done ? (
                        <>
                          <CheckCircle2 className="w-4 h-4 text-green-600" />
                          <span className="font-medium text-green-700">{step.label}</span>
                        </>
                      ) : (
                        <>
                          <div className="w-4 h-4 border-2 border-purple-300 rounded-full" />
                          <span className="text-purple-600">{step.label}</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            }

            {analysis &&
              <div className={`rounded-xl border p-4 space-y-2 text-sm ${analysis.can_submit === false ? 'border-red-200 bg-red-50 text-red-800' : 'border-green-200 bg-green-50 text-green-800'}`}>
                <div className="font-semibold flex items-center gap-2">
                  {analysis.can_submit === false ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                  Resultado da análise automática
                </div>
                {analysis.summary && <div>{analysis.summary}</div>}
                {Array.isArray(analysis.critical_issues) && analysis.critical_issues.length > 0 &&
                  <div>
                    <div className="font-medium">Pontos críticos</div>
                    <ul className="list-disc pl-5">{analysis.critical_issues.map((i, idx) => <li key={idx}>{i}</li>)}</ul>
                  </div>
                }
                {Array.isArray(analysis.warnings) && analysis.warnings.length > 0 &&
                  <div>
                    <div className="font-medium">Alertas</div>
                    <ul className="list-disc pl-5">{analysis.warnings.map((i, idx) => <li key={idx}>{i}</li>)}</ul>
                  </div>
                }
              </div>
            }

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
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
