import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Save, Send, Plus, Trash2, CheckCircle, AlertCircle, RotateCcw, ShieldCheck, FileDown } from 'lucide-react';
import ReportTabsNavigation from '../components/reports/ReportTabsNavigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import AtividadesSection, { validateAtividade } from '../components/reports/AtividadesSection';
import PDFExportButton from '../components/reports/PDFExportButton';
import AIAssistButton from '../components/reports/AIAssistButton';
import ReportGenerator from '../components/reports/ReportGenerator';
import ExecutiveSummaryAI from '../components/reports/ExecutiveSummaryAI';
import TrendAnalysisAI from '../components/reports/TrendAnalysisAI';
import ReportCommentsPanel from '../components/reports/ReportCommentsPanel';
import ReportTimeline from '../components/reports/ReportTimeline';
import ActivityProgressBar from '../components/reports/ActivityProgressBar';
import ReportVersionHistory from '../components/reports/ReportVersionHistory';
import RichTextEditor from '../components/reports/RichTextEditor';
import { Sparkles } from 'lucide-react';
import SaveTemplateDialog from '../components/templates/SaveTemplateDialog';
import LoadFromTemplateDialog from '../components/templates/LoadFromTemplateDialog';
import AttachmentsSection from '../components/reports/AttachmentsSection';
import ConsolidatedExportDialog from '../components/reports/ConsolidatedExportDialog';
import DepoimentosSection from '../components/reports/DepoimentosSection';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const FUNCOES = ['Educador', 'Produtor Cultural', 'Comunicador', 'Administrador', 'Coordenador', 'Consultoria Programação', 'Outro'];
const CATEGORIAS_OP = ['Programação', 'Parceria', 'Comunicação', 'Captação', 'Acessibilidade', 'Infraestrutura', 'Outro'];

const EMPTY_FORM = {
  author_name: '',
  funcao: '',
  museu: '',
  mes_referencia: '',
  ano: 2026,
  resumo_executivo: '',
  atividades: [],
  oportunidades: [],
  momentos: [],
  depoimentos: [],
  avaliacao_pontos_positivos: '',
  avaliacao_desafios: '',
  avaliacao_sugestoes: '',
  status: 'DRAFT',
  return_comment: ''
};

function SectionTitle({ children }) {
  return (
    <h2 className="text-base font-semibold text-black mb-4 pb-2 border-b border-gray-100">
      {children}
    </h2>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm text-gray-700">{label}</Label>
      {children}
    </div>
  );
}

function ReportEditorInner() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user: currentUser, isCoordenador } = useCurrentUser();
  const isComunicacao = currentUser?.role === 'COORD_COMUNICACAO';
  const urlParams = new URLSearchParams(window.location.search);
  const reportId = urlParams.get('id');

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [declaracaoAceita, setDeclaracaoAceita] = useState(false);
  const [currentTab, setCurrentTab] = useState('identificacao');
  const [autoSaveTimer, setAutoSaveTimer] = useState(null);
  const [showSaveAlert, setShowSaveAlert] = useState(false);
  const [showSaveTemplateDialog, setShowSaveTemplateDialog] = useState(false);
  const [showLoadTemplateDialog, setShowLoadTemplateDialog] = useState(false);
  const [showSubmitConfirm, setShowSubmitConfirm] = useState(false);
  const [showConsolidatedExport, setShowConsolidatedExport] = useState(false);

  const initializedReportRef = useRef(false);
  const loadedReportIdRef = useRef(null);

  const set = (key, value) => {
    setFormData((prev) => {
      if (prev === null || typeof prev !== 'object') return prev;

      const next = {
        ...prev,
        [key]: value
      };

      if (key === 'atividades' && Array.isArray(value)) {
        next.atividades = value.map((item) => ({ ...item }));
      }

      if (key === 'oportunidades' && Array.isArray(value)) {
        next.oportunidades = value.map((item) => ({ ...item }));
      }

      if (key === 'momentos' && Array.isArray(value)) {
        next.momentos = value.map((item) => ({ ...item }));
      }

      if (key === 'depoimentos' && Array.isArray(value)) {
        next.depoimentos = value.map((item) => ({ ...item }));
      }

      return next;
    });
  };

  useEffect(() => {
    initializedReportRef.current = false;
    loadedReportIdRef.current = reportId || null;

    if (!reportId) {
      setFormData(EMPTY_FORM);
    }
  }, [reportId]);

  useEffect(() => {
    if (currentUser && !reportId) {
      setFormData((prev) => ({
        ...prev,
        author_name: currentUser.full_name || '',
        museu: currentUser.museu || '',
        funcao: currentUser.funcao || ''
      }));
    }
  }, [currentUser, reportId]);

  const { isLoading, data: reportData } = useQuery({
    queryKey: ['report', reportId],
    queryFn: async () => {
      if (!reportId) return null;
      const data = await base44.entities.Report.get(reportId);
      return data || null;
    },
    enabled: !!reportId,
    staleTime: 30000
  });

  useEffect(() => {
    if (!reportId || !reportData?.id) return;
    if (initializedReportRef.current && loadedReportIdRef.current === reportId) return;

    setFormData({
      ...EMPTY_FORM,
      ...reportData,
      atividades: Array.isArray(reportData.atividades)
        ? reportData.atividades.map((item) => ({ ...item }))
        : [],
      oportunidades: Array.isArray(reportData.oportunidades)
        ? reportData.oportunidades.map((item) => ({ ...item }))
        : [],
      momentos: Array.isArray(reportData.momentos)
        ? reportData.momentos.map((item) => ({ ...item }))
        : [],
      depoimentos: Array.isArray(reportData.depoimentos)
        ? reportData.depoimentos.map((item) => ({ ...item }))
        : []
    });

    initializedReportRef.current = true;
    loadedReportIdRef.current = reportId;
  }, [reportData, reportId]);

  const gerarNumeroProtocolo = async (mes, ano) => {
    const MESES_ABREV = {
      Janeiro: 'JAN',
      Fevereiro: 'FEV',
      Março: 'MAR',
      Abril: 'ABR',
      Maio: 'MAI',
      Junho: 'JUN',
      Julho: 'JUL',
      Agosto: 'AGO',
      Setembro: 'SET',
      Outubro: 'OUT',
      Novembro: 'NOV',
      Dezembro: 'DEZ'
    };

    const mesAbrev = MESES_ABREV[mes] || String(mes || 'SEM').substring(0, 3).toUpperCase();
    const allReports = await base44.entities.Report.list('-created_date', 9999);
    const seq = String(allReports.length + 1).padStart(5, '0');
    return `MC-${mesAbrev}${ano}-${seq}`;
  };

  const handleSaveDraft = () => {
    setShowSaveAlert(true);
  };

  const proceedWithSave = () => {
    setShowSaveAlert(false);
    saveMutation.mutate(formData);
  };

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      const { id, created_date, updated_date, created_by, ...payload } = data;

      if (!reportId && !payload.numero_protocolo) {
        payload.numero_protocolo = await gerarNumeroProtocolo(
          payload.mes_referencia || 'SEM',
          payload.ano || 2026
        );
      }

      return reportId
        ? base44.entities.Report.update(reportId, payload)
        : base44.entities.Report.create(payload);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries(['report', reportId]);
      queryClient.invalidateQueries(['my-reports']);
      toast.success('Rascunho salvo', {
        description: '✓ Suas alterações foram gravadas com sucesso.'
      });

      if (!reportId && saved?.id) {
        navigate(createPageUrl(`ReportEditor?id=${saved.id}`), { replace: true });
      }
    },
    onError: () => {
      toast.error('Erro ao salvar rascunho', {
        description: 'Não foi possível gravar as alterações. Tente novamente.'
      });
    }
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!declaracaoAceita) {
        toast.error('Aceite a declaração de responsabilidade antes de enviar.');
        throw new Error('Declaração não aceita');
      }

      if (!formData.mes_referencia) {
        toast.error('Selecione o mês de referência antes de enviar.');
        throw new Error('Mês obrigatório');
      }

      if (!formData.author_name) {
        toast.error('Informe o nome do profissional antes de enviar.');
        throw new Error('Nome obrigatório');
      }

      if (!formData.museu) {
        toast.error('Selecione o museu antes de enviar.');
        throw new Error('Museu obrigatório');
      }

      const { id, created_date, updated_date, created_by, ...payload } = formData;

      if (!reportId && !payload.numero_protocolo) {
        payload.numero_protocolo = await gerarNumeroProtocolo(
          payload.mes_referencia,
          payload.ano || 2026
        );
      }

      const data = { ...payload, status: 'SUBMITTED' };

      return reportId
        ? base44.entities.Report.update(reportId, data)
        : base44.entities.Report.create(data);
    },
    onSuccess: () => {
      setShowSubmitConfirm(false);
      queryClient.invalidateQueries(['my-reports']);
      toast.success('Relatório enviado para revisão!', {
        description: '✓ O coordenador será notificado em breve.'
      });
      setTimeout(() => navigate(createPageUrl('Dashboard')), 1500);
    },
    onError: (e) => {
      const silentErrors = [
        'Declaração não aceita',
        'Mês obrigatório',
        'Nome obrigatório',
        'Museu obrigatório'
      ];

      if (!silentErrors.includes(e.message)) {
        toast.error('Erro ao enviar relatório', {
          description: 'Não foi possível enviar. Tente novamente.'
        });
      }
    }
  });

  const handleSubmitClick = () => {
    if (!declaracaoAceita) {
      toast.error('Aceite a declaração de responsabilidade antes de enviar.');
      return;
    }

    if (!(formData.atividades?.length > 0) && !(formData.oportunidades?.length > 0)) {
      toast.error('Preencha atividades ou oportunidades para enviar');
      return;
    }

    setShowSubmitConfirm(true);
  };

  const workflowMutation = useMutation({
    mutationFn: ({ action, comment }) => {
      if (!reportId) throw new Error('Salve o relatório antes de alterar o status.');

      const statusMap = {
        start_review: 'IN_REVIEW',
        return: 'RETURNED',
        approve: 'APPROVED',
        archive: 'ARCHIVED',
        reopen: 'DRAFT'
      };

      const newStatus = statusMap[action];
      if (!newStatus) throw new Error(`Ação desconhecida: ${action}`);

      const update = { status: newStatus };
      if (comment) update.return_comment = comment;

      return base44.entities.Report.update(reportId, update);
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries(['report', reportId]);
      queryClient.invalidateQueries(['my-reports']);
      queryClient.invalidateQueries(['all-reports']);

      const msgs = {
        start_review: { title: 'Revisão iniciada', desc: '✓ O relatório foi movido para revisão.' },
        return: { title: 'Relatório devolvido', desc: '✓ Notificação enviada ao profissional.' },
        approve: { title: 'Relatório aprovado', desc: '✓ Status atualizado com sucesso.' },
        archive: { title: 'Arquivado', desc: '✓ Relatório movido para arquivo.' },
        reopen: { title: 'Reabertura concluída', desc: '✓ Relatório reaberto como rascunho.' }
      };

      const msg = msgs[action] || { title: 'Status atualizado', desc: '' };
      toast.success(msg.title, { description: msg.desc });
    },
    onError: (e) =>
      toast.error('Erro ao atualizar', {
        description: e?.message || 'Não foi possível processar a ação.'
      })
  });

  const addOp = () =>
    setFormData((prev) => ({
      ...prev,
      oportunidades: [...(prev.oportunidades || []), { descricao: '', categoria: '', impacto: '' }]
    }));

  const updateOp = (i, field, value) =>
    setFormData((prev) => ({
      ...prev,
      oportunidades: prev.oportunidades.map((o, idx) => (idx === i ? { ...o, [field]: value } : o))
    }));

  const removeOp = (i) =>
    setFormData((prev) => ({
      ...prev,
      oportunidades: prev.oportunidades.filter((_, idx) => idx !== i)
    }));

  const handleLoadFromTemplate = (template) => {
    if (template?.template_data) {
      setFormData((prev) => ({
        ...EMPTY_FORM,
        ...template.template_data,
        author_name: currentUser?.full_name || '',
        status: 'DRAFT'
      }));
      toast.success('Template carregado com sucesso!');
    }
  };

  const canEdit =
    (formData.status === 'DRAFT' || formData.status === 'RETURNED') &&
    (!isComunicacao || (isComunicacao && formData.funcao === 'Comunicador'));

  const canReview =
    isCoordenador &&
    (!isComunicacao || (isComunicacao && formData.funcao === 'Comunicador'));

  const handleTabChange = (newTab) => {
    if (canEdit && reportId) {
      saveMutation.mutate(formData);
    }
    setCurrentTab(newTab);
  };

  const [conflictError, setConflictError] = useState(null);
  const [lastSaveTime, setLastSaveTime] = useState(null);
  const autoSaveTimerRef = useRef(null);

  useEffect(() => {
    if (!canEdit || !reportId || !formData.mes_referencia) return;

    clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        const response = await base44.functions.invoke('autoSaveReport', {
          reportId,
          formData
        });

        if (response.data.hasConflict) {
          setConflictError(response.data.conflictMessage);
          toast.error('Conflito de edição detectado!', {
            description: 'Outro usuário editou este relatório. Verifique as alterações.',
            duration: 10000
          });
        } else {
          setLastSaveTime(new Date().toLocaleTimeString('pt-BR'));
          setConflictError(null);
        }
      } catch (err) {
        console.error('Erro ao auto-salvar:', err);
      }
    }, 5000);

    return () => clearTimeout(autoSaveTimerRef.current);
  }, [formData, canEdit, reportId]);

  if (isLoading && reportId) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <p className="text-gray-400">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-10 flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Link to={createPageUrl('Dashboard')}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>

            <div>
              <h1 className="text-2xl font-semibold text-black">
                {reportId ? 'Editar Relatório' : 'Novo Relatório'}
              </h1>
              <div className="flex items-center gap-2 mt-0.5">
                {formData.numero_protocolo && (
                  <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {formData.numero_protocolo}
                  </span>
                )}
                {formData.status && formData.status !== 'DRAFT' && (
                  <p className="text-xs text-gray-400">Status: {formData.status}</p>
                )}
              </div>
            </div>
          </div>
          {reportId && (
            <Button variant="outline" size="sm" onClick={() => setShowConsolidatedExport(true)}>
              <FileDown className="w-4 h-4 mr-2" />
              Exportar consolidado do mês
            </Button>
          )}
        </div>

        <ConsolidatedExportDialog
          open={showConsolidatedExport}
          onClose={() => setShowConsolidatedExport(false)}
          currentReport={formData}
          currentReportId={reportId}
          currentUser={currentUser}
        />

        <ReportTabsNavigation currentTab={currentTab} formData={formData} onTabChange={handleTabChange} />

        <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="mb-8 flex flex-wrap h-auto gap-1 bg-gray-100 p-1 rounded-xl">
            <TabsTrigger value="identificacao">Identificação</TabsTrigger>
            <TabsTrigger value="atividades">Atividades</TabsTrigger>
            <TabsTrigger value="oportunidades">Oportunidades</TabsTrigger>
            <TabsTrigger value="depoimentos">Depoimentos</TabsTrigger>
            <TabsTrigger value="avaliacao">Avaliação</TabsTrigger>
            <TabsTrigger value="anexos">Anexos</TabsTrigger>
            <TabsTrigger value="comentarios">Comentários</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="identificacao">
            <div className="space-y-8">
              <section>
                <SectionTitle>Identificação</SectionTitle>
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Mês de Referência">
                    <Select value={formData.mes_referencia || ''} onValueChange={(v) => set('mes_referencia', v)} disabled={!canEdit}>
                      <SelectTrigger><SelectValue placeholder="Selecione o mês" /></SelectTrigger>
                      <SelectContent>
                        {MESES.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Ano">
                    <Input
                      type="number"
                      value={formData.ano || 2026}
                      onChange={(e) => set('ano', parseInt(e.target.value, 10) || 2026)}
                      disabled={!canEdit}
                    />
                  </Field>

                  <Field label="Nome do Profissional">
                    <Input
                      value={formData.author_name || ''}
                      onChange={(e) => set('author_name', e.target.value)}
                      disabled={!isCoordenador && !canEdit}
                      className={!isCoordenador ? 'bg-gray-50' : ''}
                    />
                  </Field>

                  <Field label="Função">
                    <Select value={formData.funcao || ''} onValueChange={(v) => set('funcao', v)} disabled={!canEdit}>
                      <SelectTrigger><SelectValue placeholder="Selecione a função" /></SelectTrigger>
                      <SelectContent>
                        {FUNCOES.map((f) => (
                          <SelectItem key={f} value={f}>{f}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>

                  <Field label="Museu Principal">
                    <Select value={formData.museu || ''} onValueChange={(v) => set('museu', v)} disabled={!canEdit}>
                      <SelectTrigger><SelectValue placeholder="Selecione o museu" /></SelectTrigger>
                      <SelectContent>
                        {MUSEUS.map((m) => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                  <h2 className="text-base font-semibold text-black">Resumo Executivo</h2>
                </div>
                <RichTextEditor
                  placeholder="Descreva sucintamente as atividades realizadas no mês..."
                  value={formData.resumo_executivo || ''}
                  onChange={(text) => set('resumo_executivo', text)}
                  disabled={!canEdit}
                />
              </section>
            </div>
          </TabsContent>

          <TabsContent value="atividades">
            <div className="space-y-6">
              <AtividadesSection
                atividades={formData.atividades || []}
                mesReferencia={formData.mes_referencia || ''}
                ano={formData.ano || 2026}
                setAtividades={(updater) => {
                  if (typeof updater === 'function') {
                    set('atividades', updater(formData.atividades || []));
                    return;
                  }
                  set('atividades', updater);
                }}
                canEdit={canEdit}
                museusOptions={MUSEUS}
                tiposAcaoOptions={[
                  'Oficina',
                  'Visita mediada',
                  'Ação educativa',
                  'Comunicação',
                  'Reunião',
                  'Produção',
                  'Articulação',
                  'Formação',
                  'Outro'
                ]}
              />
            </div>
          </TabsContent>

          <TabsContent value="oportunidades">
            <section className="space-y-8">
              <div className="space-y-4">
                {(formData.oportunidades || []).map((op, i) => (
                  <div key={i} className="p-4 border rounded-xl space-y-3">
                    <Textarea
                      placeholder="Descrição da oportunidade"
                      value={op.descricao || ''}
                      onChange={(e) => updateOp(i, 'descricao', e.target.value)}
                      disabled={!canEdit}
                    />
                    <div className="grid grid-cols-2 gap-3">
                      <Select value={op.categoria || ''} onValueChange={(v) => updateOp(i, 'categoria', v)} disabled={!canEdit}>
                        <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                        <SelectContent>
                          {CATEGORIAS_OP.map((c) => (
                            <SelectItem key={c} value={c}>{c}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select value={op.impacto || ''} onValueChange={(v) => updateOp(i, 'impacto', v)} disabled={!canEdit}>
                        <SelectTrigger><SelectValue placeholder="Impacto" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Baixo">Baixo</SelectItem>
                          <SelectItem value="Médio">Médio</SelectItem>
                          <SelectItem value="Alto">Alto</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {canEdit && (
                      <div className="flex justify-end">
                        <Button variant="ghost" size="sm" onClick={() => removeOp(i)}>
                          <Trash2 className="w-4 h-4 mr-2" />
                          Remover
                        </Button>
                      </div>
                    )}
                  </div>
                ))}

                {canEdit && (
                  <Button variant="outline" onClick={addOp}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar oportunidade
                  </Button>
                )}
              </div>
            </section>
          </TabsContent>

          <TabsContent value="depoimentos">
           <DepoimentosSection
             depoimentos={formData.depoimentos || []}
             onChange={(updatedDepoimentos) => set('depoimentos', updatedDepoimentos)}
             canEdit={canEdit}
             museu={formData.museu}
           />
          </TabsContent>

          <TabsContent value="avaliacao">
           <section className="space-y-6">
             <SectionTitle>Avaliação do Mês</SectionTitle>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-sm text-gray-700">Pontos Positivos</Label>
                  <RichTextEditor
                    placeholder="O que funcionou bem este mês..."
                    value={formData.avaliacao_pontos_positivos || ''}
                    onChange={(text) => set('avaliacao_pontos_positivos', text)}
                    disabled={!canEdit}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm text-gray-700">Dificuldades</Label>
                  <RichTextEditor
                    placeholder="Principais dificuldades enfrentadas..."
                    value={formData.avaliacao_desafios || ''}
                    onChange={(text) => set('avaliacao_desafios', text)}
                    disabled={!canEdit}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-sm text-gray-700">Sugestões</Label>
                  <RichTextEditor
                    placeholder="Sugestões de melhoria..."
                    value={formData.avaliacao_sugestoes || ''}
                    onChange={(text) => set('avaliacao_sugestoes', text)}
                    disabled={!canEdit}
                  />
                </div>
              </div>

              {canEdit && (
                <div className="p-4 border border-gray-200 rounded-xl bg-gray-50">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="declaracao"
                      checked={declaracaoAceita}
                      onCheckedChange={(v) => setDeclaracaoAceita(!!v)}
                      className="mt-1"
                    />
                    <label htmlFor="declaracao" className="text-xs text-gray-700 leading-relaxed cursor-pointer">
                      Declaro que as informações registradas neste relatório são verdadeiras, completas e de minha inteira responsabilidade.
                    </label>
                  </div>
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="anexos" className="space-y-6">
            {reportId ? (
              <AttachmentsSection reportId={reportId} canEdit={canEdit} />
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Salve o relatório para anexar arquivos</p>
            )}
          </TabsContent>

          <TabsContent value="comentarios" className="space-y-6">
            {reportId ? (
              <ReportCommentsPanel reportId={reportId} currentUser={currentUser} />
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Salve o relatório para adicionar comentários</p>
            )}
          </TabsContent>

          <TabsContent value="historico" className="space-y-6">
            {reportId ? (
              <ReportVersionHistory reportId={reportId} />
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Salve o relatório para visualizar histórico</p>
            )}
          </TabsContent>
        </Tabs>

        {canEdit && (
          <div className="mt-6 pt-6 border-t border-gray-100 flex justify-end gap-3">
            <Button variant="outline" onClick={handleSaveDraft} disabled={saveMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />
              Salvar Rascunho
            </Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={handleSubmitClick}
              disabled={
                submitMutation.isPending ||
                !declaracaoAceita ||
                (!(formData.atividades?.length > 0) && !(formData.oportunidades?.length > 0))
              }
            >
              <Send className="w-4 h-4 mr-2" />
              Enviar para Revisão
            </Button>
          </div>
        )}

        <AlertDialog open={showSubmitConfirm} onOpenChange={setShowSubmitConfirm}>
          <AlertDialogContent className="max-w-lg">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-blue-600" />
                Atestado de Veracidade
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-3 text-sm text-gray-700">
                Ao prosseguir, você atesta que todas as informações deste relatório são verdadeiras e completas.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex justify-end gap-3 mt-6">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {submitMutation.isPending ? 'Enviando...' : 'Confirmar Envio'}
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog open={showSaveAlert} onOpenChange={setShowSaveAlert}>
          <AlertDialogContent className="max-w-md">
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-amber-600" />
                Atenção — Rascunho em Progresso
              </AlertDialogTitle>
              <AlertDialogDescription className="mt-3 text-sm text-gray-700">
                Apenas relatórios aprovados são considerados na prestação de contas. Rascunhos ficam salvos apenas na plataforma.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="flex justify-end gap-3 mt-6">
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={proceedWithSave} className="bg-black hover:bg-gray-800">
                Salvar Rascunho
              </AlertDialogAction>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

export default function ReportEditor() {
  return (
    <RequireAuth>
      <ReportEditorInner />
    </RequireAuth>
  );
}