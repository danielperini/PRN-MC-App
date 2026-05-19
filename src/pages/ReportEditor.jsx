import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { notifyReportSubmitted } from '@/services/notifications/reportNotifications';
import {
  Save,
  Send,
  FileDown,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  User,
  Building2,
  Calendar,
  Users,
} from 'lucide-react';

import LoadingPage from '@/components/common/LoadingPage';
import ReportTabsNavigation from '@/components/reports/ReportTabsNavigation';
import AtividadesSection from '@/components/reports/AtividadesSection';
import ReportPhotoSection from '@/components/reports/ReportPhotoSection';
import AttachmentsSection from '@/components/reports/AttachmentsSection';
import DepoimentosSection from '@/components/reports/DepoimentosSection';
import TrustValidationPanel from '@/components/reports/TrustValidationPanel';
import EditorialEnhancer from '@/components/reports/EditorialEnhancer';
import ReleasePanelEditor from '@/components/reports/ReleasePanelEditor';
import ReportSectionSelector from '@/components/reports/ReportSectionSelector';
import PagamentosTabelaDetalhada from '@/components/reports/PagamentosTabelaDetalhada';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

const MUSEUS_LISTA = ['MHAB', 'MIS', 'MUMO', 'Geral'];

const TIPOS_ACAO = [
  'Exposição', 'Oficina', 'Palestra', 'Show / Apresentação', 'Visita Mediada',
  'Evento', 'Formação', 'Reunião', 'Publicação', 'Outro',
];

const STATUS_LABELS = {
  DRAFT: { label: 'Rascunho', color: 'bg-gray-100 text-gray-700' },
  SUBMITTED: { label: 'Enviado', color: 'bg-blue-100 text-blue-700' },
  IN_REVIEW: { label: 'Em revisão', color: 'bg-yellow-100 text-yellow-700' },
  RETURNED: { label: 'Devolvido', color: 'bg-red-100 text-red-700' },
  APPROVED: { label: 'Aprovado', color: 'bg-green-100 text-green-700' },
  ARCHIVED: { label: 'Arquivado', color: 'bg-slate-100 text-slate-600' },
};

function normalizeAtividades(raw) {
  if (!Array.isArray(raw)) return [];

  return raw.map((a) => ({
    id: a?.id || a?._id || `atividade_${Math.random().toString(36).slice(2)}`,
    classificacao: a?.classificacao || '',
    nome: a?.nome || a?.titulo || '',
    descricao: a?.descricao || '',
    museu_lista: Array.isArray(a?.museu_lista) ? a.museu_lista : a?.museu ? [a.museu] : [],
    tipo_acao_lista: Array.isArray(a?.tipo_acao_lista) ? a.tipo_acao_lista : a?.tipo ? [a.tipo] : [],
    equipe_participante_ids: Array.isArray(a?.equipe_participante_ids) ? a.equipe_participante_ids : [],
    meta_vinculada_ids: Array.isArray(a?.meta_vinculada_ids) ? a.meta_vinculada_ids : [],
    quantas_vezes_ocorreu: Number(a?.quantas_vezes_ocorreu) || 1,
    publico_medio_sessao: Number(a?.publico_medio_sessao) || 0,
    publico_estimado: Number(a?.publico_estimado) || 0,
    quantidade_produtos: Number(a?.quantidade_produtos) || 0,
    total_produtos: Number(a?.total_produtos) || 0,
    fotos: Array.isArray(a?.fotos) ? a.fotos : [],
    programacao_id: a?.programacao_id || null,
  }));
}

function formatarNumeroResumo(n) {
  if (!n && n !== 0) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;

  return String(n);
}

function createEmptyReportPayload(user, mesAtual, anoAtual) {
  return {
    author_name: user?.full_name || '',
    author_role: user?.role === 'admin' ? 'ADMIN' : user?.role === 'COORDENADOR' ? 'COORDENADOR' : 'PROFISSIONAL',
    funcao: user?.funcao || '',
    museu: user?.museu || '',
    equipe: user?.equipe || '',
    mes_referencia: mesAtual,
    ano: anoAtual,
    status: 'DRAFT',
    resumo_periodo: '',
    resumo_executivo: '',
    avaliacao_pontos_positivos: '',
    avaliacao_desafios: '',
    avaliacao_sugestoes: '',
    comentarios_gerais: '',
    publico_geral_declarado: 0,
    atividades: [],
    fotos: [],
    depoimentos: [],
  };
}

function getMesAtual() {
  return MESES[new Date().getMonth()];
}

function getAnoAtual() {
  return new Date().getFullYear();
}

function ReportSummaryStats({ atividades = [], fotos = [] }) {
  const totalAtividades = atividades.length;
  const totalPublico = atividades.reduce((sum, a) => sum + (Number(a.publico_estimado) || 0), 0);
  const totalOcorrencias = atividades.reduce((sum, a) => sum + (Number(a.quantas_vezes_ocorreu) || 0), 0);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
      {[
        { label: 'Atividades', value: formatarNumeroResumo(totalAtividades), icon: <CheckCircle2 className="w-4 h-4" /> },
        { label: 'Público', value: formatarNumeroResumo(totalPublico), icon: <Users className="w-4 h-4" /> },
        { label: 'Ocorrências', value: formatarNumeroResumo(totalOcorrencias), icon: <Calendar className="w-4 h-4" /> },
        { label: 'Fotos', value: formatarNumeroResumo(fotos.length), icon: null },
      ].map((stat) => (
        <Card key={stat.label} className="p-3">
          <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
            {stat.icon}
            {stat.label}
          </div>

          <div className="text-2xl font-bold text-gray-900">
            {stat.value}
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function ReportEditor() {
  const queryClient = useQueryClient();

  const urlParams = new URLSearchParams(window.location.search);
  const reportIdParam = urlParams.get('id') || urlParams.get('reportId');
  const mesParam = urlParams.get('mes');
  const anoParam = urlParams.get('ano') ? parseInt(urlParams.get('ano'), 10) : null;
  const isNewReportIntent = urlParams.get('novo') === '1';

  const [currentTab, setCurrentTab] = useState('relatorio');
  const [report, setReport] = useState(null);
  const [formData, setFormData] = useState({});
  const [atividades, setAtividades] = useState([]);
  const [fotos, setFotos] = useState([]);
  const [attachments, setAttachments] = useState([]);
  const [depoimentos, setDepoimentos] = useState([]);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [loadingReport, setLoadingReport] = useState(true);
  const [loadingError, setLoadingError] = useState(false);
  const [secoesPdf, setSecoesPdf] = useState([]);
  const [pagamentos, setPagamentos] = useState([]);
  const [loadingPagamentos, setLoadingPagamentos] = useState(false);

  const {
    data: currentUser,
    isLoading: loadingCurrentUser,
    isError: currentUserError,
  } = useQuery({
    queryKey: ['current-user'],
    queryFn: () => base44.auth.me(),
    staleTime: 300000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!currentUser) return;
    loadReportSafely();
  }, [currentUser, reportIdParam, isNewReportIntent, mesParam, anoParam]);

  async function loadReportSafely() {
    setLoadingReport(true);
    setLoadingError(false);

    try {
      const mesAtual = mesParam || getMesAtual();
      const anoAtual = anoParam || getAnoAtual();

      if (reportIdParam) {
        const found = await base44.entities.Report.filter({ id: reportIdParam });

        if (found && found.length > 0) {
          applyReport(found[0]);
          return;
        }

        clearReportState();
        setLoadingError(true);
        toast.error('RelatÃ³rio nÃ£o encontrado.');
        return;
      }

      if (!isNewReportIntent) {
        clearReportState();
        return;
      }

      const existingDrafts = await base44.entities.Report.filter({
        created_by: currentUser.email,
        mes_referencia: mesAtual,
        ano: anoAtual,
        status: 'DRAFT',
      });

      if (existingDrafts && existingDrafts.length > 0) {
        applyReport(existingDrafts[0]);
        toast.info('Rascunho existente aberto.');
        return;
      }

      const payload = createEmptyReportPayload(currentUser, mesAtual, anoAtual);
      const created = await base44.entities.Report.create(payload);

      applyReport(created);
      toast.success('Novo relatÃ³rio criado.');
    } catch (err) {
      console.error('Erro ao carregar/criar relatório:', err);
      setLoadingError(true);
      toast.error('Erro ao carregar relatório');
    } finally {
      setLoadingReport(false);
    }
  }

  function clearReportState() {
    setReport(null);
    setFormData({});
    setAtividades([]);
    setFotos([]);
    setAttachments([]);
    setDepoimentos([]);
    setPagamentos([]);
  }

  function applyReport(r) {
    setReport(r);

    setFormData({
      author_name: r.author_name || '',
      author_role: r.author_role || 'PROFISSIONAL',
      funcao: r.funcao || '',
      museu: r.museu || '',
      museu_secundario: r.museu_secundario || '',
      equipe: r.equipe || '',
      mes_referencia: r.mes_referencia || getMesAtual(),
      ano: r.ano || getAnoAtual(),
      status: r.status || 'DRAFT',
      resumo_periodo: r.resumo_periodo || '',
      resumo_executivo: r.resumo_executivo || '',
      avaliacao_pontos_positivos: r.avaliacao_pontos_positivos || '',
      avaliacao_desafios: r.avaliacao_desafios || '',
      avaliacao_sugestoes: r.avaliacao_sugestoes || '',
      comentarios_gerais: r.comentarios_gerais || '',
      comentarios_coordenacao: r.comentarios_coordenacao || '',
      publico_geral_declarado: r.publico_geral_declarado || 0,
    });

    setAtividades(normalizeAtividades(r.atividades));
    setFotos(Array.isArray(r.fotos) ? r.fotos : []);
    setAttachments(Array.isArray(r.attachments) ? r.attachments : []);
    setDepoimentos(Array.isArray(r.depoimentos) ? r.depoimentos : []);
  }

  useEffect(() => {
    if (currentTab === 'financeiro' && report?.id) {
      loadPagamentos();
    }
  }, [currentTab, report?.id]);

  async function loadPagamentos() {
    if (!report?.id) return;

    setLoadingPagamentos(true);

    try {
      const res = await base44.entities.PurchaseRequest.filter({
        report_id: report.id,
        status: ['PAGO', 'APROVADO_ADMIN', 'APROVADO_COORD'],
      });

      const mapped = (res || []).map((p) => ({
        id: p.id,
        data_pagamento: p.data_pagamento_efetivo || p.data_pagamento || p.aprov_admin_data || p.created_date,
        fornecedor_nome: p.fornecedor_nome || p.descricao_item,
        descricao: p.descricao_item || '',
        museu: p.centro_custo || 'Geral',
        rubrica: p.rubrica_nome || p.rubrica_id || '—',
        valor: p.valor_pago || p.valor_aprovado_admin || p.valor_aprovado || p.valor_solicitado || 0,
        status: p.status,
        nf_pdf_url: p.nf_pdf_url || p.nota_fiscal_url,
        nf_xml_url: p.nf_xml_url,
        comprovante_url: p.comprovante_pagamento_url || p.comprovante_url,
      }));

      setPagamentos(mapped);
    } catch (err) {
      console.error('Erro ao carregar pagamentos:', err);
    } finally {
      setLoadingPagamentos(false);
    }
  }

  const updateField = useCallback((field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  async function handleSave() {
    if (!report?.id) return;

    setSaving(true);

    try {
      const payload = {
        ...formData,
        atividades,
        fotos,
        attachments,
        depoimentos,
      };

      const updated = await base44.entities.Report.update(report.id, payload);

      setReport(updated);
      toast.success('✅ Relatório salvo com sucesso!');
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['relatorios-list'] });
    } catch (err) {
      console.error(err);
      toast.error('❌ Erro ao salvar: ' + (err?.message || 'tente novamente'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit() {
    if (!report?.id) return;

    if (!formData.museu) {
      toast.error('Informe o museu antes de enviar');
      return;
    }

    if (!formData.mes_referencia) {
      toast.error('Informe o mês de referência');
      return;
    }

    setSubmitting(true);

    try {
      const payload = {
        ...formData,
        status: 'SUBMITTED',
        submitted_at: new Date().toISOString(),
        atividades,
        fotos,
        attachments,
        depoimentos,
      };

      const updated = await base44.entities.Report.update(report.id, payload);

      setReport(updated);
      setFormData((prev) => ({ ...prev, status: 'SUBMITTED' }));

      await notifyReportSubmitted(
        {
          ...updated,
          created_by: updated.created_by || report.created_by || currentUser?.email,
          author_email: updated.author_email || report.author_email || currentUser?.email,
        },
        currentUser
      ).catch((error) => {
        console.warn('Falha ao notificar envio de relatório:', error);
      });

      toast.success('📤 Relatório enviado para revisão!');
      queryClient.invalidateQueries({ queryKey: ['reports'] });
      queryClient.invalidateQueries({ queryKey: ['relatorios-list'] });
    } catch (err) {
      console.error(err);
      toast.error('❌ Erro ao enviar: ' + (err?.message || 'tente novamente'));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExportPdf() {
    if (!report?.id) return;

    setExportingPdf(true);

    try {
      await handleSave();

      const response = await base44.functions.invoke('generateReportPDF', {
        reportId: report.id,
        secoes: secoesPdf.length > 0 ? secoesPdf : undefined,
      });

      if (response.data?.pdf_url) {
        window.open(response.data.pdf_url, '_blank');
        toast.success('📄 PDF gerado com sucesso!');
      } else if (response.data?.error) {
        toast.error('Erro ao gerar PDF: ' + response.data.error);
      } else {
        toast.success('📄 PDF gerado! Verifique sua pasta de downloads.');
      }
    } catch (err) {
      console.error(err);
      toast.error('❌ Erro ao exportar PDF: ' + (err?.message || 'tente novamente'));
    } finally {
      setExportingPdf(false);
    }
  }

  const handleAddPhoto = useCallback(async (photo) => {
    const newPhoto = {
      id: photo.id || `photo_${Date.now()}`,
      url: photo.url || photo.file_url,
      fileName: photo.fileName || photo.file_name || photo.name || 'foto',
      caption: photo.caption || '',
      author: photo.author || photo.created_by || '',
      activityId: photo.activityId || null,
    };

    setFotos((prev) => [...prev, newPhoto]);
  }, []);

  const handleUpdatePhoto = useCallback((photoId, caption) => {
    setFotos((prev) =>
      prev.map((p) => (p.id === photoId ? { ...p, caption } : p))
    );
  }, []);

  const handleDeletePhoto = useCallback((photoId) => {
    setFotos((prev) => prev.filter((p) => p.id !== photoId));
  }, []);

  const canEdit = !['SUBMITTED', 'IN_REVIEW', 'APPROVED', 'ARCHIVED'].includes(formData.status);
  const statusInfo = STATUS_LABELS[formData.status] || STATUS_LABELS.DRAFT;

  const isInitialPageLoading =
    loadingCurrentUser ||
    loadingReport;

  if (isInitialPageLoading) {
    return (
      <LoadingPage
        message="Carregando página..."
        description="Estamos carregando o relatório, atividades, fotos, anexos e dados do usuário. Aguarde alguns instantes."
      />
    );
  }

  if (currentUserError || loadingError) {
    return (
      <LoadingPage
        error
        errorTitle="Não foi possível carregar o relatório"
        errorDescription="Atualize a página ou tente novamente em alguns instantes."
      />
    );
  }

  if (!report) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <Card className="p-8 text-center rounded-3xl border border-gray-200 bg-white">
          <h1 className="text-2xl font-semibold text-gray-900">
            Nenhum relatÃ³rio selecionado.
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-gray-500">
            Abra um relatÃ³rio existente pela lista ou crie um novo relatÃ³rio por aÃ§Ã£o explÃ­cita.
            O editor nÃ£o gera rascunhos automaticamente ao carregar a pÃ¡gina.
          </p>
          <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button variant="outline" onClick={() => { window.location.href = '/Relatorios'; }}>
              Voltar para RelatÃ³rios
            </Button>
            <Button onClick={() => { window.location.href = '/ReportEditor?novo=1'; }}>
              Criar novo relatÃ³rio
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.history.back()}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-500" />
          </button>

          <div>
            <h1 className="text-xl font-bold text-gray-900">
              Relatório Mensal — {formData.mes_referencia} {formData.ano}
            </h1>

            <div className="flex items-center gap-2 mt-1">
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${statusInfo.color}`}
              >
                {statusInfo.label}
              </span>

              {formData.museu && (
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Building2 className="w-3 h-3" />
                  {formData.museu}
                </span>
              )}

              {report?.numero_protocolo && (
                <span className="text-xs text-gray-400">
                  {report.numero_protocolo}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canEdit && (
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={saving}
              className="gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          )}

          {canEdit && (
            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {submitting ? 'Enviando...' : 'Enviar para revisão'}
            </Button>
          )}

          <Button
            variant="outline"
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="gap-2"
          >
            {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {exportingPdf ? 'Gerando PDF...' : 'Exportar PDF'}
          </Button>
        </div>
      </div>

      {formData.status === 'RETURNED' && report?.return_comment && (
        <Card className="p-4 border-l-4 border-orange-400 bg-orange-50">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-orange-900 text-sm">
                Relatório devolvido para correção
              </p>
              <p className="text-sm text-orange-800 mt-1">
                {report.return_comment}
              </p>
            </div>
          </div>
        </Card>
      )}

      <ReportSummaryStats atividades={atividades} fotos={fotos} />

      <ReportTabsNavigation
        currentTab={currentTab}
        formData={{ ...formData, atividades, fotos }}
        onTabChange={setCurrentTab}
      />

      {currentTab === 'relatorio' && (
        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2 pb-2 border-b">
              <User className="w-4 h-4" />
              Identificação
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Nome do Profissional</Label>
                <Input
                  value={formData.author_name || ''}
                  onChange={(e) => updateField('author_name', e.target.value)}
                  placeholder="Nome completo"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Função</Label>
                <Input
                  value={formData.funcao || ''}
                  onChange={(e) => updateField('funcao', e.target.value)}
                  placeholder="Ex: Educador Cultural"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Museu Principal</Label>
                <Select
                  value={formData.museu || ''}
                  onValueChange={(v) => updateField('museu', v)}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o museu" />
                  </SelectTrigger>
                  <SelectContent>
                    {MUSEUS_LISTA.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Museu Secundário (opcional)</Label>
                <Select
                  value={formData.museu_secundario || 'nenhum'}
                  onValueChange={(v) => updateField('museu_secundario', v === 'nenhum' ? '' : v)}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Nenhum" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nenhum">Nenhum</SelectItem>
                    {MUSEUS_LISTA.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Mês de Referência</Label>
                <Select
                  value={formData.mes_referencia || ''}
                  onValueChange={(v) => updateField('mes_referencia', v)}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((m) => (
                      <SelectItem key={m} value={m}>
                        {m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Ano</Label>
                <Input
                  type="number"
                  value={formData.ano || getAnoAtual()}
                  onChange={(e) => updateField('ano', parseInt(e.target.value, 10))}
                  disabled={!canEdit}
                  min={2024}
                  max={2030}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Equipe</Label>
                <Input
                  value={formData.equipe || ''}
                  onChange={(e) => updateField('equipe', e.target.value)}
                  placeholder="Nome da equipe"
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Público Geral Declarado</Label>
                <Input
                  type="number"
                  value={formData.publico_geral_declarado || 0}
                  onChange={(e) => updateField('publico_geral_declarado', parseInt(e.target.value, 10) || 0)}
                  placeholder="Total de visitantes"
                  disabled={!canEdit}
                  min={0}
                />
              </div>
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 pb-2 border-b">
              Narrativa do Período
            </h2>

            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Resumo do Período</Label>
              <Textarea
                value={formData.resumo_periodo || ''}
                onChange={(e) => updateField('resumo_periodo', e.target.value)}
                placeholder="Apresentação geral das atividades e contexto do período..."
                className="resize-none"
                rows={4}
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Resumo Executivo</Label>
              <Textarea
                value={formData.resumo_executivo || ''}
                onChange={(e) => updateField('resumo_executivo', e.target.value)}
                placeholder="Principais resultados e destaques do mês..."
                className="resize-none"
                rows={4}
                disabled={!canEdit}
              />
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 pb-2 border-b">
              Avaliação do Período
            </h2>

            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Pontos Positivos</Label>
              <Textarea
                value={formData.avaliacao_pontos_positivos || ''}
                onChange={(e) => updateField('avaliacao_pontos_positivos', e.target.value)}
                placeholder="O que funcionou bem neste período..."
                className="resize-none"
                rows={3}
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Desafios Enfrentados</Label>
              <Textarea
                value={formData.avaliacao_desafios || ''}
                onChange={(e) => updateField('avaliacao_desafios', e.target.value)}
                placeholder="Dificuldades e obstáculos encontrados..."
                className="resize-none"
                rows={3}
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Sugestões de Melhoria</Label>
              <Textarea
                value={formData.avaliacao_sugestoes || ''}
                onChange={(e) => updateField('avaliacao_sugestoes', e.target.value)}
                placeholder="Propostas e recomendações para o próximo período..."
                className="resize-none"
                rows={3}
                disabled={!canEdit}
              />
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-gray-600">Comentários Gerais</Label>
              <Textarea
                value={formData.comentarios_gerais || ''}
                onChange={(e) => updateField('comentarios_gerais', e.target.value)}
                placeholder="Observações adicionais..."
                className="resize-none"
                rows={3}
                disabled={!canEdit}
              />
            </div>

            {(formData.author_role === 'COORDENADOR' || formData.author_role === 'ADMIN') && (
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Comentários para Coordenação</Label>
                <Textarea
                  value={formData.comentarios_coordenacao || ''}
                  onChange={(e) => updateField('comentarios_coordenacao', e.target.value)}
                  placeholder="Comentários internos para a coordenação..."
                  className="resize-none"
                  rows={3}
                  disabled={!canEdit}
                />
              </div>
            )}
          </Card>

          {report?.id && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <EditorialEnhancer
                reportId={report.id}
                mes={formData.mes_referencia}
                ano={formData.ano}
                museu={formData.museu}
                onEnhance={(editorial) => {
                  if (editorial?.introducao) {
                    updateField('resumo_periodo', editorial.introducao);
                  }

                  if (editorial?.resumoExecutivo) {
                    updateField('resumo_executivo', editorial.resumoExecutivo);
                  }
                }}
              />

              <ReleasePanelEditor
                mes={formData.mes_referencia}
                ano={formData.ano}
                museu={formData.museu}
                onSelect={(release) => {
                  const texto = release.conteudo_resumido || release.conteudo_completo?.substring(0, 500);

                  if (texto) {
                    updateField(
                      'resumo_periodo',
                      (formData.resumo_periodo ? formData.resumo_periodo + '\n\n' : '') + texto
                    );
                    toast.success('Release adicionado ao resumo');
                  }
                }}
              />
            </div>
          )}
        </div>
      )}

      {currentTab === 'atividades' && (
        <Card className="p-6">
          <AtividadesSection
            atividades={atividades}
            setAtividades={setAtividades}
            canEdit={canEdit}
            museusOptions={MUSEUS_LISTA}
            tiposAcaoOptions={TIPOS_ACAO}
            mesReferencia={formData.mes_referencia}
            ano={formData.ano}
            museu={formData.museu}
            reportId={report?.id}
            onSave={handleSave}
            onExportPdf={handleExportPdf}
          />
        </Card>
      )}

      {currentTab === 'fotos' && (
        <Card className="p-6">
          <ReportPhotoSection
            photos={fotos}
            onAddPhoto={handleAddPhoto}
            onUpdatePhoto={handleUpdatePhoto}
            onDeletePhoto={handleDeletePhoto}
            reportId={report?.id}
          />
        </Card>
      )}

      {currentTab === 'attachments' && (
        <Card className="p-6">
          <AttachmentsSection
            attachments={attachments}
            setAttachments={setAttachments}
            reportId={report?.id}
          />
        </Card>
      )}

      {currentTab === 'depoimentos' && (
        <Card className="p-6">
          <DepoimentosSection
            depoimentos={depoimentos}
            onChange={setDepoimentos}
            canEdit={canEdit}
            museu={formData.museu}
          />
        </Card>
      )}

      {currentTab === 'financeiro' && (
        <div className="space-y-4">
          {loadingPagamentos ? (
            <Card className="p-8 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </Card>
          ) : (
            <PagamentosTabelaDetalhada
              pagamentos={pagamentos}
              agrupadoPor="museu"
              totalPago={pagamentos.reduce((s, p) => s + (p.valor || 0), 0)}
              totalPagamentos={pagamentos.length}
            />
          )}
        </div>
      )}

      {currentTab === 'validacao' && (
        <div className="space-y-6">
          {report?.id && (
            <TrustValidationPanel
              reportId={report.id}
              onStatusChange={(statusData) => {
                if (statusData?.podeExportar) {
                  toast.success('✅ Relatório aprovado para exportação!');
                }
              }}
            />
          )}

          <Card className="p-6 space-y-4">
            <h2 className="text-base font-semibold text-gray-900 pb-2 border-b">
              Seções do Relatório PDF
            </h2>

            <ReportSectionSelector
              secoesSelecionadas={secoesPdf}
              onSelectionChange={setSecoesPdf}
              onGerar={(secoes) => {
                setSecoesPdf(secoes);
                handleExportPdf();
              }}
            />
          </Card>
        </div>
      )}

      <div className="flex flex-col md:flex-row gap-3 pt-4 border-t border-gray-200">
        {canEdit && (
          <>
            <Button
              variant="outline"
              onClick={handleSave}
              disabled={saving}
              className="gap-2"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Salvando...' : 'Salvar rascunho'}
            </Button>

            <Button
              onClick={handleSubmit}
              disabled={submitting}
              className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {submitting ? 'Enviando...' : 'Enviar para revisão'}
            </Button>
          </>
        )}

        <Button
          variant="outline"
          onClick={handleExportPdf}
          disabled={exportingPdf}
          className="gap-2 md:ml-auto"
        >
          {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
          {exportingPdf ? 'Gerando PDF...' : 'Exportar PDF para assinatura'}
        </Button>
      </div>
    </div>
  );
}
