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

    const init = async () => {
      try {
        if (!reportId) {
          // 🔥 CRIAR NOVO RELATÓRIO AUTOMATICAMENTE
          const newReport = await base44.entities.Report.create({
            status: 'DRAFT',
            ano: new Date().getFullYear(),
            atividades: [],
            oportunidades: [],
            fotos: [],
            depoimentos: [],
            attachments: [],
          });

          setReport(newReport);
          return;
        }

        const data = await base44.entities.Report.get(reportId);
        setReport(data);
      } catch (error) {
        toast.error('Erro ao carregar relatório');
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    init();
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

  if (loading) {
    return <div className="flex items-center justify-center h-96">Carregando...</div>;
  }

  return (
    <div className="space-y-6">
      <ReportTabsNavigation currentTab={activeTab} formData={form} onTabChange={setActiveTab} />

      <Card className="p-6">
        {activeTab === 'relatorio' && (
          <div className="space-y-6">
            <div>
              <Label>Resumo do Período</Label>
              <Textarea
                value={form.resumo_periodo}
                onChange={(e) => setForm((prev) => ({ ...prev, resumo_periodo: e.target.value }))}
              />
            </div>
          </div>
        )}

        {activeTab === 'atividades' && (
          <AtividadesSection
            reportId={report.id}
            atividades={form.atividades || []}
            setAtividades={(v) => setForm((prev) => ({ ...prev, atividades: v }))}
            canEdit={true}
          />
        )}

        {activeTab === 'fotos' && (
          <ReportPhotoSection reportId={report.id} photos={form.fotos || []} />
        )}

        {activeTab === 'attachments' && (
          <AttachmentsSection reportId={report.id} attachments={form.attachments || []} />
        )}

        {activeTab === 'depoimentos' && (
          <DepoimentosSection
            reportId={report.id}
            depoimentos={form.depoimentos || []}
            onChange={(v) => setForm((prev) => ({ ...prev, depoimentos: v }))}
          />
        )}
      </Card>

      <div className="flex gap-3 justify-end">
        <Button onClick={() => navigate('/Relatorios')} variant="outline">
          Cancelar
        </Button>

        <Button onClick={() => handleSave('DRAFT')} disabled={saving}>
          Salvar
        </Button>

        <Button onClick={() => handleSave('SUBMITTED')} disabled={saving}>
          Enviar
        </Button>
      </div>
    </div>
  );
}
