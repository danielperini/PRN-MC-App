import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import RequireAuth from '../components/auth/RequireAuth';
import { useCurrentUser } from '../components/auth/useCurrentUser';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { ArrowLeft, Save, Send, Plus, Trash2, CheckCircle, AlertCircle, RotateCcw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import AtividadesSection, { validateAtividade } from '../components/reports/AtividadesSection';
import ExportPDF from '../components/reports/ExportPDF';
import AIAssistButton from '../components/reports/AIAssistButton';
import ReportGenerator from '../components/reports/ReportGenerator';
import ExecutiveSummaryAI from '../components/reports/ExecutiveSummaryAI';
import TrendAnalysisAI from '../components/reports/TrendAnalysisAI';
import ReportComments from '../components/reports/ReportComments';
import ReportTimeline from '../components/reports/ReportTimeline';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
const MUSEUS = ['MHAB', 'MIS', 'MUMO', 'Atuação Geral'];
const FUNCOES = ['Educador', 'Produtor Cultural', 'Comunicador', 'Administrador', 'Coordenador', 'Outro'];
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
  avaliacao_pontos_positivos: '',
  avaliacao_desafios: '',
  avaliacao_sugestoes: '',
  status: 'DRAFT',
  return_comment: '',
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
  const urlParams = new URLSearchParams(window.location.search);
  const reportId = urlParams.get('id');

  const [formData, setFormData] = useState(EMPTY_FORM);
  const [declaracaoAceita, setDeclaracaoAceita] = useState(false);
  const set = (key, value) => setFormData(prev => ({ ...prev, [key]: value }));

  // Pre-fill author from logged user on new reports
  useEffect(() => {
    if (currentUser && !reportId) {
      setFormData(prev => ({
        ...prev,
        author_name: currentUser.full_name || '',
        museu: currentUser.museu || '',
        funcao: currentUser.funcao || '',
      }));
    }
  }, [currentUser, reportId]);

  // Load existing report
  const { isLoading, data: reportData } = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => base44.entities.Report.get(reportId),
    enabled: !!reportId,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (reportData) {
      setFormData({
        ...EMPTY_FORM,
        ...reportData,
        atividades: Array.isArray(reportData.atividades) ? reportData.atividades : [],
        oportunidades: Array.isArray(reportData.oportunidades) ? reportData.oportunidades : [],
      });
    }
  }, [reportData]);

  // Generate protocol number: MC-MESANO-XXXXX
  const gerarNumeroProtocolo = async (mes, ano) => {
    const MESES_ABREV = {
      'Janeiro': 'JAN', 'Fevereiro': 'FEV', 'Março': 'MAR', 'Abril': 'ABR',
      'Maio': 'MAI', 'Junho': 'JUN', 'Julho': 'JUL', 'Agosto': 'AGO',
      'Setembro': 'SET', 'Outubro': 'OUT', 'Novembro': 'NOV', 'Dezembro': 'DEZ'
    };
    const mesAbrev = MESES_ABREV[mes] || mes.substring(0, 3).toUpperCase();
    const allReports = await base44.entities.Report.list('-created_date', 9999);
    const seq = String(allReports.length + 1).padStart(5, '0');
    return `MC-${mesAbrev}${ano}-${seq}`;
  };

  const saveMutation = useMutation({
    mutationFn: async data => {
      // Strip internal fields that should not be sent to the API
      const { id, created_date, updated_date, created_by, ...payload } = data;
      if (!reportId && !payload.numero_protocolo) {
        payload.numero_protocolo = await gerarNumeroProtocolo(payload.mes_referencia || 'SEM', payload.ano || 2026);
      }
      return reportId
        ? base44.entities.Report.update(reportId, payload)
        : base44.entities.Report.create(payload);
    },
    onSuccess: (saved) => {
      queryClient.invalidateQueries(['report', reportId]);
      queryClient.invalidateQueries(['my-reports']);
      toast.success('Relatório salvo com sucesso!', { description: 'Seu rascunho foi salvo.' });
      if (!reportId && saved?.id) {
        navigate(createPageUrl(`ReportEditor?id=${saved.id}`), { replace: true });
      }
    },
    onError: () => toast.error('Erro ao salvar o relatório. Tente novamente.'),
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
        payload.numero_protocolo = await gerarNumeroProtocolo(payload.mes_referencia, payload.ano || 2026);
      }
      const data = { ...payload, status: 'SUBMITTED' };
      return reportId
        ? base44.entities.Report.update(reportId, data)
        : base44.entities.Report.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['my-reports']);
      toast.success('Relatório enviado para revisão!', { description: 'O coordenador será notificado.' });
      navigate(createPageUrl('Dashboard'));
    },
    onError: (e) => {
      const silentErrors = ['Declaração não aceita', 'Mês obrigatório', 'Nome obrigatório', 'Museu obrigatório'];
      if (!silentErrors.includes(e.message)) toast.error('Erro ao enviar o relatório. Tente novamente.');
    },
  });

  const workflowMutation = useMutation({
    mutationFn: ({ action, comment }) => {
      if (!reportId) throw new Error('Salve o relatório antes de alterar o status.');
      const statusMap = { start_review: 'IN_REVIEW', return: 'RETURNED', approve: 'APPROVED', archive: 'ARCHIVED', reopen: 'DRAFT' };
      const newStatus = statusMap[action];
      if (!newStatus) throw new Error(`Ação desconhecida: ${action}`);
      const update = { status: newStatus };
      if (comment) update.return_comment = comment;
      return base44.entities.Report.update(reportId, update);
    },
    onSuccess: (_, { action }) => {
      queryClient.invalidateQueries(['report', reportId]);
      queryClient.invalidateQueries(['my-reports']);
      const msgs = {
        start_review: 'Revisão iniciada.',
        return: 'Relatório devolvido ao profissional.',
        approve: 'Relatório aprovado com sucesso!',
        archive: 'Relatório arquivado.',
        reopen: 'Relatório reaberto como rascunho.',
      };
      toast.success(msgs[action] || 'Status atualizado.');
    },
    onError: (e) => toast.error('Erro ao atualizar status: ' + (e?.message || 'tente novamente')),
  });

  // Oportunidades helpers
  const addOp = () => setFormData(prev => ({
    ...prev,
    oportunidades: [...(prev.oportunidades || []), { descricao: '', categoria: '', impacto: '' }]
  }));
  const updateOp = (i, field, value) => setFormData(prev => ({
    ...prev,
    oportunidades: prev.oportunidades.map((o, idx) => idx === i ? { ...o, [field]: value } : o)
  }));
  const removeOp = (i) => setFormData(prev => ({
    ...prev,
    oportunidades: prev.oportunidades.filter((_, idx) => idx !== i)
  }));

  const canEdit = formData.status === 'DRAFT' || formData.status === 'RETURNED';

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

        {/* Header */}
        <div className="flex items-center justify-between mb-10 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <Link to={createPageUrl('Dashboard')}>
              <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
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

          <div className="flex gap-2 flex-wrap">
            {reportId && (
              <>
                <ReportGenerator reportId={reportId} report={formData} />
                <ExportPDF report={formData} reportId={reportId} />
              </>
            ) || (
              <span className="text-xs text-gray-400">Salve o relatório para exportar dados</span>
            )}
            {canEdit && (
              <>
                <Button variant="outline" onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending}>
                  <Save className="w-4 h-4 mr-2" />Salvar Rascunho
                </Button>
                <Button className="bg-black hover:bg-gray-800 text-white" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                  <Send className="w-4 h-4 mr-2" />Enviar para Revisão
                </Button>
              </>
            )}
            {isCoordenador && formData.status === 'SUBMITTED' && (
              <Button variant="outline" onClick={() => workflowMutation.mutate({ action: 'start_review' })}>Iniciar Revisão</Button>
            )}
            {isCoordenador && formData.status === 'IN_REVIEW' && (
              <>
                <Button variant="outline" className="text-red-600 border-red-200" onClick={() => { const c = prompt('Motivo da devolução:'); if (c) workflowMutation.mutate({ action: 'return', comment: c }); }}>
                  <AlertCircle className="w-4 h-4 mr-2" />Devolver
                </Button>
                <Button className="bg-green-600 hover:bg-green-700 text-white" onClick={() => workflowMutation.mutate({ action: 'approve' })}>
                  <CheckCircle className="w-4 h-4 mr-2" />Aprovar
                </Button>
              </>
            )}
            {isCoordenador && formData.status === 'APPROVED' && (
              <Button variant="outline" onClick={() => workflowMutation.mutate({ action: 'archive' })}>Arquivar</Button>
            )}
            {isCoordenador && ['ARCHIVED', 'APPROVED'].includes(formData.status) && (
              <Button variant="outline" onClick={() => workflowMutation.mutate({ action: 'reopen' })}>
                <RotateCcw className="w-4 h-4 mr-2" />Reabrir
              </Button>
            )}
          </div>
        </div>

        {/* Return comment banner */}
        {formData.return_comment && formData.status === 'RETURNED' && (
          <div className="mb-8 p-4 bg-red-50 border border-red-100 rounded-xl">
            <p className="text-sm font-semibold text-red-800 mb-3 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" />Relatório devolvido — comentários do coordenador:
            </p>
            {formData.return_comment.includes('[') ? (
              <div className="space-y-3">
                {formData.return_comment.split('\n\n').map((block, i) => {
                  const match = block.match(/^\[(.+?)\]\n([\s\S]*)/);
                  if (!match) return <p key={i} className="text-sm text-red-700">{block}</p>;
                  return (
                    <div key={i} className="bg-white border border-red-100 rounded-lg p-3">
                      <p className="text-xs font-semibold text-red-600 uppercase tracking-wide mb-1">{match[1]}</p>
                      <p className="text-sm text-red-700 whitespace-pre-wrap">{match[2]}</p>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-red-700 whitespace-pre-wrap">{formData.return_comment}</p>
            )}
          </div>
        )}

        <Tabs defaultValue="identificacao" className="w-full">
          <TabsList className="mb-8 flex flex-wrap h-auto gap-1 bg-gray-100 p-1 rounded-xl">
            <TabsTrigger value="identificacao">Identificação</TabsTrigger>
            <TabsTrigger value="atividades">Atividades</TabsTrigger>
            <TabsTrigger value="oportunidades">Oportunidades</TabsTrigger>
            <TabsTrigger value="avaliacao">Avaliação</TabsTrigger>
            <TabsTrigger value="comentarios">Comentários</TabsTrigger>
            <TabsTrigger value="historico">Histórico</TabsTrigger>
          </TabsList>

          <TabsContent value="identificacao">
            <div className="space-y-8">
              <section>
                <SectionTitle>Identificação</SectionTitle>
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Mês de Referência">
                    <Select value={formData.mes_referencia || ''} onValueChange={v => set('mes_referencia', v)} disabled={!canEdit}>
                      <SelectTrigger><SelectValue placeholder="Selecione o mês" /></SelectTrigger>
                      <SelectContent>
                        {MESES.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Ano">
                    <Input type="number" value={formData.ano || 2026} onChange={e => set('ano', parseInt(e.target.value) || 2026)} disabled={!canEdit} />
                  </Field>
                  <Field label="Nome do Profissional">
                    <Input
                      value={formData.author_name || ''}
                      onChange={e => set('author_name', e.target.value)}
                      disabled={!isCoordenador && !canEdit}
                      className={!isCoordenador ? 'bg-gray-50' : ''}
                    />
                  </Field>
                  <Field label="Função">
                    <Select value={formData.funcao || ''} onValueChange={v => set('funcao', v)} disabled={!canEdit}>
                      <SelectTrigger><SelectValue placeholder="Selecione a função" /></SelectTrigger>
                      <SelectContent>
                        {FUNCOES.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Museu Principal">
                    <Select value={formData.museu || ''} onValueChange={v => set('museu', v)} disabled={!canEdit}>
                      <SelectTrigger><SelectValue placeholder="Selecione o museu" /></SelectTrigger>
                      <SelectContent>
                        {MUSEUS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </section>
              <section>
                <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                  <h2 className="text-base font-semibold text-black">Resumo Executivo</h2>
                  {canEdit && (
                    <div className="flex gap-1.5">
                      <ExecutiveSummaryAI
                        atividades={formData.atividades}
                        reportData={formData}
                        onApply={text => set('resumo_executivo', text)}
                        disabled={false}
                      />
                      <AIAssistButton
                        field="resumo_executivo"
                        context={formData}
                        onGenerate={text => set('resumo_executivo', text)}
                        placeholder="Resumo das principais atividades e resultados do mês"
                      />
                    </div>
                  )}
                </div>
                <Textarea
                  placeholder="Descreva sucintamente as atividades realizadas no mês..."
                  value={formData.resumo_executivo || ''}
                  onChange={e => set('resumo_executivo', e.target.value)}
                  className="min-h-[120px]"
                  disabled={!canEdit}
                />
              </section>
            </div>
          </TabsContent>

          <TabsContent value="atividades">
            <AtividadesSection
              atividades={formData.atividades || []}
              canEdit={canEdit}
              onChange={list => set('atividades', list)}
              reportId={reportId}
            />
          </TabsContent>

          <TabsContent value="oportunidades">
            <section>
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-100">
                <h2 className="text-base font-semibold text-black">Oportunidades Identificadas</h2>
                {canEdit && (
                  <Button variant="outline" size="sm" onClick={addOp}>
                    <Plus className="w-4 h-4 mr-1" />Adicionar
                  </Button>
                )}
              </div>
              {(formData.oportunidades || []).length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8 border border-dashed rounded-xl">
                  Nenhuma oportunidade adicionada
                </p>
              ) : (
                <div className="space-y-4">
                  {(formData.oportunidades || []).map((op, i) => (
                    <div key={i} className="p-5 border border-gray-100 rounded-xl">
                      <div className="flex justify-between items-center mb-3">
                        <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Oportunidade {i + 1}</span>
                        {canEdit && (
                          <Button variant="ghost" size="icon" className="text-red-400 h-7 w-7" onClick={() => removeOp(i)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                      <div className="space-y-3">
                        <Textarea
                          placeholder="Descrição da oportunidade"
                          value={op.descricao || ''}
                          onChange={e => updateOp(i, 'descricao', e.target.value)}
                          disabled={!canEdit}
                        />
                        <div className="grid grid-cols-2 gap-3">
                          <Select value={op.categoria || ''} onValueChange={v => updateOp(i, 'categoria', v)} disabled={!canEdit}>
                            <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                            <SelectContent>
                              {CATEGORIAS_OP.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          <Select value={op.impacto || ''} onValueChange={v => updateOp(i, 'impacto', v)} disabled={!canEdit}>
                            <SelectTrigger><SelectValue placeholder="Impacto" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Baixo">Baixo</SelectItem>
                              <SelectItem value="Médio">Médio</SelectItem>
                              <SelectItem value="Alto">Alto</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="avaliacao">
            <section>
              <SectionTitle>Avaliação do Mês</SectionTitle>

              {/* Análise de Tendências */}
              {reportId && formData.museu && (
                <div className="mb-6 p-4 border border-gray-100 rounded-xl bg-gray-50">
                  <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-3">Análise de Tendências Históricas</p>
                  <TrendAnalysisAI museu={formData.museu} disabled={false} />
                </div>
              )}

              {(formData.atividades || []).length === 0 && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-medium text-amber-800">Nenhuma atividade vinculada</p>
                    <p className="text-xs text-amber-600 mt-0.5">
                      Este relatório não possui atividades registradas. Período de referência: <strong>{formData.mes_referencia || '—'} {formData.ano || 2026}</strong>.
                      Acesse a aba "Atividades" para adicionar.
                    </p>
                  </div>
                </div>
              )}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-gray-700">Pontos Positivos</Label>
                    {canEdit && <AIAssistButton field="avaliacao_pontos_positivos" context={formData} onGenerate={t => set('avaliacao_pontos_positivos', t)} />}
                  </div>
                  <Textarea placeholder="O que funcionou bem este mês..." value={formData.avaliacao_pontos_positivos || ''} onChange={e => set('avaliacao_pontos_positivos', e.target.value)} disabled={!canEdit} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-gray-700">Dificuldades</Label>
                    {canEdit && <AIAssistButton field="avaliacao_desafios" context={formData} onGenerate={t => set('avaliacao_desafios', t)} />}
                  </div>
                  <Textarea placeholder="Principais dificuldades enfrentadas..." value={formData.avaliacao_desafios || ''} onChange={e => set('avaliacao_desafios', e.target.value)} disabled={!canEdit} />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm text-gray-700">Sugestões</Label>
                    {canEdit && <AIAssistButton field="avaliacao_sugestoes" context={formData} onGenerate={t => set('avaliacao_sugestoes', t)} />}
                  </div>
                  <Textarea placeholder="Sugestões de melhoria..." value={formData.avaliacao_sugestoes || ''} onChange={e => set('avaliacao_sugestoes', e.target.value)} disabled={!canEdit} />
                </div>
              </div>
            </section>
          </TabsContent>

          {/* COMENTÁRIOS */}
          <TabsContent value="comentarios" className="space-y-6">
            {reportId ? (
              <ReportComments reportId={reportId} userRole={currentUser?.role} />
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Salve o relatório para adicionar comentários</p>
            )}
          </TabsContent>

          {/* HISTÓRICO */}
          <TabsContent value="historico" className="space-y-6">
            {reportId ? (
              <ReportTimeline reportId={reportId} />
            ) : (
              <p className="text-sm text-gray-400 text-center py-8">Salve o relatório para visualizar o histórico</p>
            )}
          </TabsContent>
        </Tabs>

        {/* Declaração de responsabilidade */}
        {canEdit && (
          <div className="mt-10 p-5 border border-gray-200 rounded-xl bg-gray-50">
            <div className="flex items-start gap-3">
              <Checkbox
                id="declaracao"
                checked={declaracaoAceita}
                onCheckedChange={v => setDeclaracaoAceita(!!v)}
                className="mt-0.5"
              />
              <label htmlFor="declaracao" className="text-sm text-gray-700 leading-relaxed cursor-pointer">
                <span className="flex items-center gap-1.5 font-semibold text-black mb-1">
                  <ShieldCheck className="w-4 h-4 text-green-600" />
                  Declaração de Responsabilidade
                </span>
                Declaro que as informações registradas neste relatório são verdadeiras, completas e de minha inteira responsabilidade. 
                Estou ciente de que o envio deste documento implica comprometimento formal com os dados informados, nos termos do contrato de gestão com a Fundação Municipal de Cultura de Belo Horizonte (FMC/PBH).
              </label>
            </div>
          </div>
        )}

        {/* Bottom save bar */}
        {canEdit && (
          <div className="mt-4 pt-4 border-t border-gray-100 flex justify-end gap-3">
            <Button variant="outline" onClick={() => saveMutation.mutate(formData)} disabled={saveMutation.isPending}>
              <Save className="w-4 h-4 mr-2" />Salvar Rascunho
            </Button>
            <Button
              className="bg-black hover:bg-gray-800 text-white"
              onClick={() => submitMutation.mutate()}
              disabled={submitMutation.isPending || !declaracaoAceita}
              title={!declaracaoAceita ? 'Aceite a declaração de responsabilidade para enviar' : ''}
            >
              <Send className="w-4 h-4 mr-2" />Enviar para Revisão
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReportEditor() {
  return <RequireAuth><ReportEditorInner /></RequireAuth>;
}