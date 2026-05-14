import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import ReportTabsNavigation from '@/components/reports/ReportTabsNavigation';
import AtividadesSection from '@/components/reports/AtividadesSection';
import AttachmentsSection from '@/components/reports/AttachmentsSection';
import ReportPhotoSection from '@/components/reports/ReportPhotoSection';
import DepoimentosSection from '@/components/reports/DepoimentosSection';
import EditorialEnhancer from '@/components/reports/EditorialEnhancer';
import ReleasePanelEditor from '@/components/reports/ReleasePanelEditor';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

const MESES = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
];

const MUSEUS = ['MIS', 'MHAB', 'MUMO', 'Atuação Geral'];
const EQUIPES = ['Comunicação', 'Coordenação', 'Administração', 'Educativo', 'Produção'];

function formatarNumeroResumo(texto) {
  if (!texto) return texto;

  return String(texto).replace(/\d{1,3}(?:\.\d{3})*,\d+/g, (match) => {
    const numero = Number(match.replace(/\./g, '').replace(',', '.'));
    if (!Number.isFinite(numero)) return match;
    return Math.round(numero).toLocaleString('pt-BR');
  });
}

function createEmptyReportPayload(currentUser = null) {
  return {
    numero_protocolo: '',
    author_name:
      currentUser?.full_name ||
      currentUser?.name ||
      currentUser?.user_name ||
      currentUser?.email ||
      '',
    funcao: currentUser?.funcao || currentUser?.role || '',
    museu: currentUser?.museu || '',
    equipe: currentUser?.equipe || '',
    mes_referencia: '',
    ano: new Date().getFullYear(),
    resumo_periodo: '',
    resumo_executivo: '',
    avaliacao_pontos_positivos: '',
    avaliacao_desafios: '',
    avaliacao_sugestoes: '',
    comentarios_gerais: '',
    comentarios_coordenacao: '',
    historico_observacoes: '',
    oportunidades_resumo: '',
    status: 'DRAFT',
    atividades: [],
    oportunidades: [],
    fotos: [],
    depoimentos: [],
    attachments: [],
  };
}

function hasText(value) {
  return String(value || '').trim().length > 0;
}

function isEmptyDraftReport(report) {
  if (!report || report.status !== 'DRAFT') return false;

  const hasContent =
    hasText(report.numero_protocolo) ||
    hasText(report.mes_referencia) ||
    hasText(report.resumo_periodo) ||
    hasText(report.resumo_executivo) ||
    hasText(report.avaliacao_pontos_positivos) ||
    hasText(report.avaliacao_desafios) ||
    hasText(report.avaliacao_sugestoes) ||
    hasText(report.comentarios_gerais) ||
    hasText(report.comentarios_coordenacao) ||
    hasText(report.historico_observacoes) ||
    hasText(report.oportunidades_resumo) ||
    (Array.isArray(report.atividades) && report.atividades.length > 0) ||
    (Array.isArray(report.oportunidades) && report.oportunidades.length > 0) ||
    (Array.isArray(report.fotos) && report.fotos.length > 0) ||
    (Array.isArray(report.depoimentos) && report.depoimentos.length > 0) ||
    (Array.isArray(report.attachments) && report.attachments.length > 0);

  return !hasContent;
}

async function findReusableEmptyDraft(currentUser) {
  const email = currentUser?.email;
  if (!email) return null;

  try {
    const drafts = await base44.entities.Report.filter(
      { created_by: email, status: 'DRAFT' },
      '-created_date',
      30
    );

    const emptyDrafts = (drafts || []).filter(isEmptyDraftReport);
    if (emptyDrafts.length === 0) return null;

    const [draftToUse, ...duplicates] = emptyDrafts;

    // Limpeza conservadora: remove apenas rascunhos realmente vazios do mesmo usuário.
    await Promise.allSettled(
      duplicates.map((draft) => base44.entities.Report.delete(draft.id))
    );

    return draftToUse;
  } catch (error) {
    console.warn('Não foi possível verificar rascunhos reutilizáveis:', error);
    return null;
  }
}

export default function ReportEditor() {
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('relatorio');
  const lastLoadedReportIdRef = useRef(null);

  const [form, setForm] = useState(createEmptyReportPayload());

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const reportId = urlParams.get('id');

        if (reportId) {
          const data = await base44.entities.Report.get(reportId);
          if (!isMounted) return;
          setReport(data || null);
          return;
        }

        const currentUser = await base44.auth.me().catch(() => null);
        const reusableDraft = await findReusableEmptyDraft(currentUser);

        if (reusableDraft?.id) {
          if (!isMounted) return;
          setReport(reusableDraft);
          window.history.replaceState({}, '', `/ReportEditor?id=${reusableDraft.id}`);
          return;
        }

        const payload = createEmptyReportPayload(currentUser);
        const novoRelatorio = await base44.entities.Report.create(payload);

        if (!isMounted) return;

        setReport(novoRelatorio || null);

        if (novoRelatorio?.id) {
          window.history.replaceState({}, '', `/ReportEditor?id=${novoRelatorio.id}`);
        }
      } catch (error) {
        toast.error('Erro ao carregar relatório');
        console.error('Erro ao inicializar ReportEditor:', error);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    init();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!report?.id) return;
    if (lastLoadedReportIdRef.current === report.id) return;

    const normalizedAtividades = (Array.isArray(report?.atividades) ? report.atividades : []).map((atividade) => ({
      ...atividade,
      equipe_participante_ids: Array.isArray(atividade?.equipe_participante_ids)
        ? Array.from(new Set(atividade.equipe_participante_ids.filter(Boolean)))
        : [],
      meta_vinculada_ids: Array.isArray(atividade?.meta_vinculada_ids)
        ? Array.from(new Set(atividade.meta_vinculada_ids.filter(Boolean)))
        : [],
    }));

    setForm((prev) => ({
      ...prev,
      ...report,
      numero_protocolo: report?.numero_protocolo ?? '',
      author_name: report?.author_name ?? '',
      funcao: report?.funcao ?? '',
      museu: report?.museu ?? '',
      equipe: report?.equipe ?? '',
      mes_referencia: report?.mes_referencia ?? '',
      ano: report?.ano ?? new Date().getFullYear(),
      resumo_periodo: formatarNumeroResumo(report?.resumo_periodo ?? ''),
      resumo_executivo: report?.resumo_executivo ?? '',
      avaliacao_pontos_positivos: report?.avaliacao_pontos_positivos ?? '',
      avaliacao_desafios: report?.avaliacao_desafios ?? '',
      avaliacao_sugestoes: report?.avaliacao_sugestoes ?? '',
      comentarios_gerais: report?.comentarios_gerais ?? '',
      comentarios_coordenacao: report?.comentarios_coordenacao ?? '',
      historico_observacoes: report?.historico_observacoes ?? '',
      oportunidades_resumo: report?.oportunidades_resumo ?? '',
      atividades: normalizedAtividades,
      oportunidades: Array.isArray(report?.oportunidades) ? report.oportunidades : [],
      fotos: Array.isArray(report?.fotos) ? report.fotos : [],
      depoimentos: Array.isArray(report?.depoimentos) ? report.depoimentos : [],
      attachments: Array.isArray(report?.attachments) ? report.attachments : [],
    }));

    lastLoadedReportIdRef.current = report.id;
  }, [report]);

  const buildPayload = (nextStatus = null) => ({
    numero_protocolo: form.numero_protocolo ?? '',
    author_name: form.author_name ?? '',
    funcao: form.funcao ?? '',
    museu: form.museu ?? '',
    equipe: form.equipe ?? '',
    mes_referencia: form.mes_referencia ?? '',
    ano: Number(form.ano) || new Date().getFullYear(),
    resumo_periodo: formatarNumeroResumo(form.resumo_periodo ?? ''),
    resumo_executivo: form.resumo_executivo ?? '',
    avaliacao_pontos_positivos: form.avaliacao_pontos_positivos ?? '',
    avaliacao_desafios: form.avaliacao_desafios ?? '',
    avaliacao_sugestoes: form.avaliacao_sugestoes ?? '',
    comentarios_gerais: form.comentarios_gerais ?? '',
    comentarios_coordenacao: form.comentarios_coordenacao ?? '',
    historico_observacoes: form.historico_observacoes ?? '',
    oportunidades_resumo: form.oportunidades_resumo ?? '',
    status: nextStatus || form.status || 'DRAFT',
    atividades: Array.isArray(form.atividades) ? form.atividades : [],
    oportunidades: Array.isArray(form.oportunidades) ? form.oportunidades : [],
    fotos: Array.isArray(form.fotos) ? form.fotos : [],
    depoimentos: Array.isArray(form.depoimentos) ? form.depoimentos : [],
    attachments: Array.isArray(form.attachments) ? form.attachments : [],
  });

  const persistReportPhotos = async (nextPhotos) => {
    try {
      if (!report?.id) {
        toast.error('Relatório não carregado corretamente');
        return;
      }
      await base44.entities.Report.update(report.id, { fotos: nextPhotos });
    } catch (error) {
      toast.error('Erro ao salvar fotos');
      console.error(error);
    }
  };

  const handleSave = async (nextStatus = null) => {
    if (!report?.id) {
      toast.error('Relatório não carregado corretamente');
      return;
    }

    setSaving(true);
    try {
      const payload = buildPayload(nextStatus);

      await base44.entities.Report.update(report.id, payload);

      if (nextStatus === 'SUBMITTED') {
        toast.success('Relatório enviado para revisão com sucesso!');

        try {
          await base44.functions.invoke('notifyReportSubmitted', { reportId: report.id });
        } catch (notifyErr) {
          console.error('Erro ao notificar:', notifyErr);
        }
      } else {
        toast.success('Relatório salvo com sucesso!');
      }

      setForm((prev) => ({ ...prev, ...payload }));
      setReport((prev) => (prev ? { ...prev, ...payload } : prev));
    } catch (error) {
      toast.error('Erro ao salvar relatório');
      console.error(error);
      throw error;
    } finally {
      setSaving(false);
    }
  };

  const openHtmlForPrint = (html, title = 'Relatório para assinatura') => {
    const printWindow = window.open('', '_blank', 'width=1100,height=800');

    if (!printWindow) {
      toast.error('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-up.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.document.title = title;
    printWindow.focus();
  };

  const handleExportPdf = async () => {
    try {
      if (!report?.id) {
        toast.error('Relatório não carregado corretamente');
        return;
      }

      await handleSave('DRAFT');

      const response = await base44.functions.invoke('generateSingleReportPDF', {
        reportId: report.id,
        mode: 'assinatura',
      });

      const html = response?.data?.html || response?.html;
      const fileName = response?.data?.file_name || response?.file_name || 'relatorio_assinatura';

      if (!html) {
        toast.error('Não foi possível gerar o conteúdo do PDF.');
        return;
      }

      openHtmlForPrint(html, fileName);
      toast.success('Layout de assinatura aberto. Use “Salvar como PDF” na impressão.');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar PDF para assinatura');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center h-96">Carregando...</div>;
  }

  if (!report?.id) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-4">
        <p>Nenhum relatório selecionado</p>
        <Button onClick={() => navigate('/Relatorios')}>Voltar aos Relatórios</Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ReportTabsNavigation currentTab={activeTab} formData={form} onTabChange={setActiveTab} />

      <Card className="p-6">
        {activeTab === 'relatorio' && (
          <div className="space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="author_name">Nome do profissional</Label>
                <Input
                  id="author_name"
                  value={form.author_name}
                  onChange={(e) => setForm((prev) => ({ ...prev, author_name: e.target.value }))}
                  placeholder="Nome do responsável pelo relatório"
                />
              </div>

              <div>
                <Label htmlFor="funcao">Função / Cargo</Label>
                <Input
                  id="funcao"
                  value={form.funcao}
                  onChange={(e) => setForm((prev) => ({ ...prev, funcao: e.target.value }))}
                  placeholder="Função exercida"
                />
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <Label>Museu</Label>
                <Select value={form.museu || ''} onValueChange={(value) => setForm((prev) => ({ ...prev, museu: value }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o museu" /></SelectTrigger>
                  <SelectContent>
                    {MUSEUS.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Equipe / Área</Label>
                <Select value={form.equipe || ''} onValueChange={(value) => setForm((prev) => ({ ...prev, equipe: value }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione a equipe" /></SelectTrigger>
                  <SelectContent>
                    {EQUIPES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Mês de referência</Label>
                <Select value={form.mes_referencia || ''} onValueChange={(value) => setForm((prev) => ({ ...prev, mes_referencia: value }))}>
                  <SelectTrigger><SelectValue placeholder="Selecione o mês" /></SelectTrigger>
                  <SelectContent>
                    {MESES.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="ano">Ano</Label>
                <Input
                  id="ano"
                  type="number"
                  value={form.ano}
                  onChange={(e) => setForm((prev) => ({ ...prev, ano: Number(e.target.value) || new Date().getFullYear() }))}
                />
              </div>
              <div />
            </div>

            <div>
              <Label htmlFor="resumo_periodo">Resumo do Período</Label>
              <Textarea
                id="resumo_periodo"
                value={form.resumo_periodo}
                onChange={(e) => setForm((prev) => ({ ...prev, resumo_periodo: formatarNumeroResumo(e.target.value) }))}
                placeholder="Descreva o resumo do período"
                className="min-h-[150px] text-base p-4"
              />
            </div>

            <div>
              <Label htmlFor="resumo_executivo">Resumo Executivo</Label>
              <Textarea
                id="resumo_executivo"
                value={form.resumo_executivo}
                onChange={(e) => setForm((prev) => ({ ...prev, resumo_executivo: e.target.value }))}
                placeholder="Descreva o resumo executivo"
                className="min-h-[150px] text-base p-4"
              />
            </div>

            <div className="border-t pt-6">
              <h3 className="text-lg font-semibold mb-4">Inteligência Editorial</h3>
              <div className="grid md:grid-cols-2 gap-6">
                <ReleasePanelEditor
                  mes={form.mes_referencia}
                  ano={form.ano}
                  museu={form.museu}
                  onSelect={(release) => {
                    // Adicionar release ao resumo executivo
                    if (release.conteudo_resumido) {
                      setForm((prev) => ({
                        ...prev,
                        resumo_executivo: `${prev.resumo_executivo}\n\n📰 ${release.titulo}:\n${release.conteudo_resumido}`
                      }));
                      toast.success('Release adicionado ao resumo executivo');
                    }
                  }}
                />
                <EditorialEnhancer
                  reportId={report.id}
                  mes={form.mes_referencia}
                  ano={form.ano}
                  museu={form.museu}
                  onEnhance={(editorial) => {
                    if (editorial.introducao) {
                      setForm((prev) => ({
                        ...prev,
                        resumo_periodo: editorial.introducao
                      }));
                    }
                    toast.success('Relatório enriquecido com inteligência editorial!');
                  }}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="oportunidades_resumo">Resumo de Oportunidades</Label>
              <Textarea
                id="oportunidades_resumo"
                value={form.oportunidades_resumo}
                onChange={(e) => setForm((prev) => ({ ...prev, oportunidades_resumo: e.target.value }))}
                placeholder="Descreva as oportunidades identificadas"
                className="min-h-[150px] text-base p-4"
              />
            </div>

            <div>
              <Label htmlFor="avaliacao_pontos_positivos">Pontos Positivos</Label>
              <Textarea
                id="avaliacao_pontos_positivos"
                value={form.avaliacao_pontos_positivos}
                onChange={(e) => setForm((prev) => ({ ...prev, avaliacao_pontos_positivos: e.target.value }))}
                placeholder="Descreva os pontos positivos"
                className="min-h-[120px] text-base p-4"
              />
            </div>

            <div>
              <Label htmlFor="avaliacao_desafios">Desafios</Label>
              <Textarea
                id="avaliacao_desafios"
                value={form.avaliacao_desafios}
                onChange={(e) => setForm((prev) => ({ ...prev, avaliacao_desafios: e.target.value }))}
                placeholder="Descreva os desafios enfrentados"
                className="min-h-[120px] text-base p-4"
              />
            </div>

            <div>
              <Label htmlFor="avaliacao_sugestoes">Sugestões de Melhoria</Label>
              <Textarea
                id="avaliacao_sugestoes"
                value={form.avaliacao_sugestoes}
                onChange={(e) => setForm((prev) => ({ ...prev, avaliacao_sugestoes: e.target.value }))}
                placeholder="Descreva sugestões de melhoria"
                className="min-h-[120px] text-base p-4"
              />
            </div>

            <div>
              <Label htmlFor="comentarios_gerais">Comentários Gerais</Label>
              <Textarea
                id="comentarios_gerais"
                value={form.comentarios_gerais}
                onChange={(e) => setForm((prev) => ({ ...prev, comentarios_gerais: e.target.value }))}
                placeholder="Comentários gerais"
                className="min-h-[120px] text-base p-4"
              />
            </div>

            <div>
              <Label htmlFor="comentarios_coordenacao">Comentários da Coordenação</Label>
              <Textarea
                id="comentarios_coordenacao"
                value={form.comentarios_coordenacao}
                onChange={(e) => setForm((prev) => ({ ...prev, comentarios_coordenacao: e.target.value }))}
                placeholder="Comentários da coordenação"
                className="min-h-[120px] text-base p-4"
              />
            </div>

            <div>
              <Label htmlFor="historico_observacoes">Histórico / Observações</Label>
              <Textarea
                id="historico_observacoes"
                value={form.historico_observacoes}
                onChange={(e) => setForm((prev) => ({ ...prev, historico_observacoes: e.target.value }))}
                placeholder="Observações relevantes"
                className="min-h-[120px] text-base p-4"
              />
            </div>
          </div>
        )}

        {activeTab === 'atividades' && (
          <AtividadesSection
            reportId={report.id}
            atividades={form.atividades || []}
            setAtividades={(updater) => {
              if (typeof updater === 'function') {
                setForm((prev) => ({ ...prev, atividades: updater(Array.isArray(prev.atividades) ? prev.atividades : []) }));
                return;
              }
              setForm((prev) => ({ ...prev, atividades: Array.isArray(updater) ? updater : [] }));
            }}
            mesReferencia={form.mes_referencia}
            ano={form.ano}
            museu={form.museu}
            onSave={() => handleSave('DRAFT')}
            onExportPdf={handleExportPdf}
            onBackToReport={() => setActiveTab('relatorio')}
            canEdit={true}
          />
        )}

        {activeTab === 'fotos' && (
          <ReportPhotoSection
            reportId={report.id}
            photos={form.fotos || []}
            onAddPhoto={async (photo) => {
              const normalizedPhoto = {
                id: photo?.id || photo?._id || photo?.file_id || crypto.randomUUID(),
                url: photo?.url || photo?.file_url || '',
                fileName: photo?.fileName || photo?.file_name || photo?.name || 'Foto',
                author: photo?.author || photo?.uploaded_by || photo?.author_name || '',
                caption: photo?.caption || '',
              };
              const nextPhotos = [...(form.fotos || []), normalizedPhoto];
              setForm((prev) => ({ ...prev, fotos: nextPhotos }));
              await persistReportPhotos(nextPhotos);
            }}
            onUpdatePhoto={async (photoId, caption) => {
              const nextPhotos = (form.fotos || []).map((p) => (p.id === photoId ? { ...p, caption } : p));
              setForm((prev) => ({ ...prev, fotos: nextPhotos }));
              await persistReportPhotos(nextPhotos);
            }}
            onDeletePhoto={async (photoId) => {
              const nextPhotos = (form.fotos || []).filter((p) => p.id !== photoId);
              setForm((prev) => ({ ...prev, fotos: nextPhotos }));
              await persistReportPhotos(nextPhotos);
            }}
          />
        )}

        {activeTab === 'attachments' && <AttachmentsSection reportId={report.id} canEdit={true} reportData={form} />}

        {activeTab === 'depoimentos' && (
          <DepoimentosSection
            depoimentos={form.depoimentos || []}
            onChange={(nextDepoimentos) => setForm((prev) => ({ ...prev, depoimentos: nextDepoimentos }))}
            canEdit={true}
            museu={form.museu}
          />
        )}
      </Card>

      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => navigate('/Relatorios')}>Cancelar</Button>
        <Button onClick={() => handleSave('DRAFT')} disabled={saving} variant="secondary">
          {saving ? 'Salvando...' : 'Salvar Rascunho'}
        </Button>
        <Button
          onClick={() => handleSave('SUBMITTED')}
          disabled={saving || form.status === 'SUBMITTED'}
          className={form.status === 'SUBMITTED' ? 'bg-green-600 text-white hover:bg-green-600 cursor-not-allowed' : ''}
        >
          {saving ? 'Enviando...' : form.status === 'SUBMITTED' ? 'Enviado com Sucesso!' : 'Enviar para Revisão'}
        </Button>
      </div>
    </div>
  );
}