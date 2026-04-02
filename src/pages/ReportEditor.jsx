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
  const [activeTab, setActiveTab] = useState('resumo');
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
  });

  // Load report from URL
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

  // Initialize form with report data
  useEffect(() => {
    if (!report?.id) return;
    if (lastLoadedReportIdRef.current === report.id) return;

    setForm((prev) => ({
      ...prev,
      ...report,
      resumo_periodo: report?.resumo_periodo ?? '',
      oportunidades_resumo: report?.oportunidades_resumo ?? '',
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
    };
  };

  const handleSave = async (nextStatus = null) => {
    setSaving(true);
    try {
      const payload = buildPayload(nextStatus);

      if (report?.id) {
        await base44.entities.Report.update(report.id, payload);
        toast.success('Relatório salvo com sucesso!');
        setForm((prev) => ({ ...prev, status: nextStatus || prev.status }));
        if (report) setReport({ ...report, ...payload });
      }
    } catch (error) {
      toast.error('Erro ao salvar relatório');
      console.error(error);
    } finally {
      setSaving(false);
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
      {/* Navigation Tabs */}
      <ReportTabsNavigation activeTab={activeTab} setActiveTab={setActiveTab} formData={form} />

      {/* Content Area */}
      <Card className="p-6">
        {/* Resumo Tab */}
        {activeTab === 'resumo' && (
          <div className="space-y-6">
            <div>
              <Label htmlFor="resumo_periodo">Resumo do Período</Label>
              <Textarea
                id="resumo_periodo"
                value={form.resumo_periodo}
                onChange={(e) => setForm({ ...form, resumo_periodo: e.target.value })}
                placeholder="Descreva o resumo do período"
                className="min-h-[150px] text-base p-4"
              />
            </div>

            <div>
              <Label htmlFor="oportunidades_resumo">Resumo de Oportunidades</Label>
              <Textarea
                id="oportunidades_resumo"
                value={form.oportunidades_resumo}
                onChange={(e) => setForm({ ...form, oportunidades_resumo: e.target.value })}
                placeholder="Descreva as oportunidades identificadas"
                className="min-h-[150px] text-base p-4"
              />
            </div>

            <div>
              <Label htmlFor="avaliacao_pontos_positivos">Pontos Positivos</Label>
              <Textarea
                id="avaliacao_pontos_positivos"
                value={form.avaliacao_pontos_positivos}
                onChange={(e) => setForm({ ...form, avaliacao_pontos_positivos: e.target.value })}
                placeholder="Descreva os pontos positivos"
                className="min-h-[120px] text-base p-4"
              />
            </div>

            <div>
              <Label htmlFor="avaliacao_desafios">Desafios</Label>
              <Textarea
                id="avaliacao_desafios"
                value={form.avaliacao_desafios}
                onChange={(e) => setForm({ ...form, avaliacao_desafios: e.target.value })}
                placeholder="Descreva os desafios enfrentados"
                className="min-h-[120px] text-base p-4"
              />
            </div>

            <div>
              <Label htmlFor="avaliacao_sugestoes">Sugestões de Melhoria</Label>
              <Textarea
                id="avaliacao_sugestoes"
                value={form.avaliacao_sugestoes}
                onChange={(e) => setForm({ ...form, avaliacao_sugestoes: e.target.value })}
                placeholder="Descreva sugestões de melhoria"
                className="min-h-[120px] text-base p-4"
              />
            </div>
          </div>
        )}

        {/* Atividades Tab */}
        {activeTab === 'atividades' && (
          <AtividadesSection
            reportId={report.id}
            formData={form}
            onActivitiesUpdate={(atividades) => setForm({ ...form, atividades })}
          />
        )}

        {/* Fotos Tab */}
        {activeTab === 'fotos' && (
          <ReportPhotoSection
            reportId={report.id}
            photos={form.fotos || []}
            onPhotosUpdate={(fotos) => setForm({ ...form, fotos })}
          />
        )}

        {/* Depoimentos Tab */}
        {activeTab === 'depoimentos' && (
          <DepoimentosSection
            reportId={report.id}
            depoimentos={form.depoimentos || []}
            onDepoimentosUpdate={(depoimentos) => setForm({ ...form, depoimentos })}
          />
        )}

        {/* Attachments Tab */}
        {activeTab === 'attachments' && (
          <AttachmentsSection
            reportId={report.id}
            attachments={form.attachments || []}
          />
        )}
      </Card>

      {/* Action Buttons */}
      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => navigate('/Relatorios')}>
          Cancelar
        </Button>
        <Button
          onClick={() => handleSave('DRAFT')}
          disabled={saving}
          variant="secondary"
        >
          {saving ? 'Salvando...' : 'Salvar Rascunho'}
        </Button>
        <Button
          onClick={() => handleSave('SUBMITTED')}
          disabled={saving}
        >
          {saving ? 'Enviando...' : 'Enviar para Revisão'}
        </Button>
      </div>
    </div>
  );
}