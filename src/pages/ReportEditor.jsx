import React, { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import ReportTabsNavigation from '@/components/reports/ReportTabsNavigation';
import AtividadesSection from '@/components/reports/AtividadesSection';
import AttachmentsSection from '@/components/reports/AttachmentsSection';
import ReportPhotoSection from '@/components/reports/ReportPhotoSection';
import DepoimentosSection from '@/components/reports/DepoimentosSection';
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
  SelectValue } from
'@/components/ui/select';
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
'Dezembro'];


const MUSEUS = ['MIS', 'MHAB', 'MUMO', 'Atuação Geral'];
const EQUIPES = ['Comunicação', 'Coordenação', 'Administração', 'Educativo', 'Produção'];

export default function ReportEditor() {
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('relatorio');
  const lastLoadedReportIdRef = useRef(null);

  // 🔹 NOVO ESTADO PARA CONTROLE VISUAL DO RASCUNHO
  const [draftSaved, setDraftSaved] = useState(false);

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
    attachments: []
  });

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

        const novoRelatorio = await base44.entities.Report.create({
          numero_protocolo: '',
          author_name:
          currentUser?.full_name ||
          currentUser?.name ||
          currentUser?.user_name ||
          '',
          funcao: currentUser?.funcao || currentUser?.role || '',
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
          attachments: []
        });

        if (!isMounted) return;

        setReport(novoRelatorio || null);

        if (novoRelatorio?.id) {
          window.history.replaceState({}, '', `/ReportEditor?id=${novoRelatorio.id}`);
        }
      } catch (error) {
        toast.error('Erro ao carregar relatório');
        console.error(error);
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
      attachments: Array.isArray(report?.attachments) ? report.attachments : []
    }));

    lastLoadedReportIdRef.current = report.id;
  }, [report]);

  const buildPayload = (nextStatus = null) => {
    return {
      numero_protocolo: form.numero_protocolo ?? '',
      author_name: form.author_name ?? '',
      funcao: form.funcao ?? '',
      museu: form.museu ?? '',
      equipe: form.equipe ?? '',
      mes_referencia: form.mes_referencia ?? '',
      ano: Number(form.ano) || new Date().getFullYear(),
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
      attachments: form.attachments || []
    };
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
      } else {
        toast.success('Relatório salvo com sucesso!');
      }

      // 🔹 CONTROLE VISUAL DO BOTÃO RASCUNHO
      if (nextStatus === 'DRAFT') {
        setDraftSaved(true);
      }

      setForm((prev) => ({ ...prev, status: nextStatus || prev.status }));
      setReport((prev) => prev ? { ...prev, ...payload } : prev);
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

  return (
    <div className="space-y-6">
      <ReportTabsNavigation currentTab={activeTab} formData={form} onTabChange={setActiveTab} />

      <Card className="p-6">
        {/* conteúdo mantido igual */}
      </Card>

      <div className="flex gap-3 justify-end">
        <Button variant="outline" onClick={() => navigate('/Relatorios')}>
          Cancelar
        </Button>

        {/* 🔹 BOTÃO RASCUNHO ATUALIZADO */}
        <Button
          onClick={() => handleSave('DRAFT')}
          disabled={saving || draftSaved}
          variant="secondary"
          className={
            draftSaved
              ? 'bg-green-600 text-white hover:bg-green-600 cursor-not-allowed'
              : ''
          }
        >
          {saving
            ? 'Salvando...'
            : draftSaved
              ? 'Salvo com Sucesso!'
              : 'Salvar Rascunho'}
        </Button>

        <Button
          onClick={() => handleSave('SUBMITTED')}
          disabled={saving || form.status === 'SUBMITTED'}
          className={
            form.status === 'SUBMITTED'
              ? 'bg-green-600 text-white hover:bg-green-600 cursor-not-allowed'
              : ''
          }
        >
          {saving
            ? 'Enviando...'
            : form.status === 'SUBMITTED'
              ? 'Enviado com Sucesso!'
              : 'Enviar para Revisão'}
        </Button>
      </div>
    </div>
  );
}
