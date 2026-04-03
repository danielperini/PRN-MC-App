import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import ReportTabsNavigation from '@/components/reports/ReportTabsNavigation';
import AtividadesSection from '@/components/reports/AtividadesSection';
import AttachmentsSection from '@/components/reports/AttachmentsSection';
import ReportPhotoSection from '@/components/reports/ReportPhotoSection';
import DepoimentosSection from '@/components/reports/DepoimentosSection';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

export default function ReportEditor() {
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('relatorio');
  const lastLoadedReportIdRef = useRef(null);

  const [form, setForm] = useState({
    numero_protocolo: '',
    author_name: '',
    funcao: '',
    museu: '',
    equipe: '',
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
  });

  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const reportId = urlParams.get('id');

    if (!reportId) {
      setLoading(false);
      return;
    }

    const loadReport = async () => {
      try {
        const data = await base44.entities.Report.get(reportId);
        setReport(data);
      } catch (error) {
        toast.error('Erro ao carregar relatório');
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    loadReport();
  }, []);

  useEffect(() => {
    if (!report?.id) return;
    if (lastLoadedReportIdRef.current === report.id) return;

    setForm((prev) => ({
      ...prev,
      ...report,
      resumo_periodo: report?.resumo_periodo ?? '',
      resumo_executivo: report?.resumo_executivo ?? '',
      avaliacao_pontos_positivos: report?.avaliacao_pontos_positivos ?? '',
      avaliacao_desafios: report?.avaliacao_desafios ?? '',
      avaliacao_sugestoes: report?.avaliacao_sugestoes ?? '',
      comentarios_gerais: report?.comentarios_gerais ?? '',
      comentarios_coordenacao: report?.comentarios_coordenacao ?? '',
      historico_observacoes: report?.historico_observacoes ?? '',
      oportunidades_resumo: report?.oportunidades_resumo ?? '',
      atividades: Array.isArray(report?.atividades) ? report.atividades : [],
      oportunidades: Array.isArray(report?.oportunidades) ? report.oportunidades : [],
      fotos: Array.isArray(report?.fotos) ? report.fotos : [],
      depoimentos: Array.isArray(report?.depoimentos) ? report.depoimentos : [],
      attachments: Array.isArray(report?.attachments) ? report.attachments : [],
    }));

    lastLoadedReportIdRef.current = report.id;
  }, [report]);

  const buildPayload = (nextStatus = null) => {
    return {
      numero_protocolo: form.numero_protocolo,
      author_name: form.author_name,
      funcao: form.funcao,
      museu: form.museu,
      equipe: form.equipe,
      mes_referencia: form.mes_referencia,
      ano: form.ano,
      resumo_periodo: form.resumo_periodo ?? '',
      resumo_executivo: form.resumo_executivo ?? '',
      avaliacao_pontos_positivos: form.avaliacao_pontos_positivos ?? '',
      avaliacao_desafios: form.avaliacao_desafios ?? '',
      avaliacao_sugestoes: form.avaliacao_sugestoes ?? '',
      comentarios_gerais: form.comentarios_gerais ?? '',
      comentarios_coordenacao: form.comentarios_coordenacao ?? '',
      historico_observacoes: form.historico_observacoes ?? '',
      oportunidades_resumo: form.oportunidades_resumo ?? '',
      status: nextStatus || form.status,
      atividades: form.atividades || [],
      oportunidades: form.oportunidades || [],
      fotos: form.fotos || [],
      depoimentos: form.depoimentos || [],
      attachments: form.attachments || [],
    };
  };

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
    setSaving(true);
    try {
      const payload = buildPayload(nextStatus);

      if (report?.id) {
        await base44.entities.Report.update(report.id, payload);

        if (nextStatus === 'SUBMITTED') {
          toast.success('Relatório enviado para revisão com sucesso!');
        } else {
          toast.success('Relatório salvo com sucesso!');
        }

        setForm((prev) => ({ ...prev, status: nextStatus || prev.status }));
        setReport((prev) => (prev ? { ...prev, ...payload } : prev));
      }
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
      await handleSave('DRAFT');

      const response = await base44.functions.invoke('generateSingleReportPDF', {
        reportId: report?.id,
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
            <div>
              <Label htmlFor="resumo_periodo">Resumo do Período</Label>
              <Textarea
                id="resumo_periodo"
                value={form.resumo_periodo}
                onChange={(e) => setForm((prev) => ({ ...prev, resumo_periodo: e.target.value }))}
                placeholder="Descreva o resumo do período"
                className="min-h-[150px] text-base p-4"
              />
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
          </div>
        )}

        {activeTab === 'atividades' && (
          <AtividadesSection
            reportId={report.id}
            atividades={form.atividades || []}
            setAtividades={(updater) => {
              if (typeof updater === 'function') {
                setForm((prev) => ({
                  ...prev,
                  atividades: updater(prev.atividades || []),
                }));
                return;
              }

              setForm((prev) => ({
                ...prev,
                atividades: Array.isArray(updater) ? updater : [],
              }));
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
              const nextPhotos = (form.fotos || []).map((p) =>
                p.id === photoId ? { ...p, caption } : p
              );
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

        {activeTab === 'attachments' && (
          <AttachmentsSection
            reportId={report.id}
            attachments={form.attachments || []}
          />
        )}

        {activeTab === 'depoimentos' && (
          <DepoimentosSection
            reportId={report.id}
            depoimentos={form.depoimentos || []}
            onChange={(nextDepoimentos) =>
              setForm((prev) => ({ ...prev, depoimentos: nextDepoimentos }))
            }
          />
        )}
      </Card>

      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => navigate('/Relatorios')}>
          Cancelar
        </Button>

        <Button onClick={() => handleSave('DRAFT')} disabled={saving} variant="secondary">
          {saving ? 'Salvando...' : 'Salvar Rascunho'}
        </Button>

        <Button onClick={() => handleSave('SUBMITTED')} disabled={saving}>
          {saving ? 'Enviando...' : 'Enviar para Revisão'}
        </Button>
      </div>
    </div>
  );
}
