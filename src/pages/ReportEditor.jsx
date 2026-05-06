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

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function inteiro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n);
}

function formatInt(value) {
  return inteiro(value).toLocaleString('pt-BR');
}

function buildFallbackReportHtml(report) {
  const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
  const totalPublico = atividades.reduce(
    (sum, atividade) => sum + inteiro(atividade?.publico_total ?? atividade?.publico_estimado ?? 0),
    0
  );

  const atividadesHtml = atividades.length > 0
    ? atividades.map((atividade, index) => `
      <section class="atividade">
        <h3>${index + 1}. ${escapeHtml(atividade?.nome || atividade?.titulo || 'Atividade')}</h3>
        ${atividade?.descricao ? `<p><strong>Descrição:</strong> ${escapeHtml(atividade.descricao)}</p>` : ''}
        <p><strong>Público:</strong> ${formatInt(atividade?.publico_total ?? atividade?.publico_estimado ?? 0)}</p>
      </section>
    `).join('')
    : '<p>Nenhuma atividade cadastrada neste relatório.</p>';

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório para assinatura</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, sans-serif; color: #111; margin: 32px; line-height: 1.45; }
    header { border-bottom: 2px solid #111; padding-bottom: 16px; margin-bottom: 24px; }
    h1 { font-size: 24px; margin: 0 0 8px; }
    h2 { font-size: 18px; margin: 24px 0 10px; }
    h3 { font-size: 15px; margin: 0 0 8px; }
    p { margin: 4px 0; }
    .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 24px; }
    .box { border: 1px solid #ddd; border-radius: 10px; padding: 12px; margin: 12px 0; }
    .atividade { border: 1px solid #ddd; border-radius: 10px; padding: 12px; margin: 10px 0; break-inside: avoid; }
    .assinaturas { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 64px; }
    .linha { border-top: 1px solid #111; padding-top: 8px; text-align: center; font-size: 12px; }
    @media print { body { margin: 18mm; } }
  </style>
</head>
<body>
  <header>
    <h1>Relatório ${escapeHtml(report?.mes_referencia || '')} ${escapeHtml(report?.ano || '')}</h1>
    <div class="grid">
      <p><strong>Profissional:</strong> ${escapeHtml(report?.author_name || '')}</p>
      <p><strong>Museu:</strong> ${escapeHtml(report?.museu || '')}</p>
      <p><strong>Equipe:</strong> ${escapeHtml(report?.equipe || '')}</p>
      <p><strong>Status:</strong> ${escapeHtml(report?.status || '')}</p>
    </div>
  </header>
  <section class="box">
    <h2>Resumo</h2>
    <p><strong>Total de atividades:</strong> ${formatInt(atividades.length)}</p>
    <p><strong>Público total:</strong> ${formatInt(totalPublico)}</p>
  </section>
  ${report?.resumo_periodo ? `<section class="box"><h2>Resumo do Período</h2><p>${escapeHtml(report.resumo_periodo)}</p></section>` : ''}
  ${report?.resumo_executivo ? `<section class="box"><h2>Resumo Executivo</h2><p>${escapeHtml(report.resumo_executivo)}</p></section>` : ''}
  <section><h2>Atividades</h2>${atividadesHtml}</section>
  <section class="assinaturas"><div class="linha">Responsável pelo relatório</div><div class="linha">Coordenação</div></section>
  <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
</body>
</html>`;
}

function isFunctionNotFoundError(error) {
  const status = error?.response?.status || error?.status;
  const message = String(error?.message || '').toLowerCase();
  return status === 404 || message.includes('404') || message.includes('not found');
}

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
          attachments: [],
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

  const buildPayload = (nextStatus = null) => {
    return {
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
      status: nextStatus || form.status,
      atividades: Array.isArray(form.atividades) ? form.atividades : [],
      oportunidades: Array.isArray(form.oportunidades) ? form.oportunidades : [],
      fotos: Array.isArray(form.fotos) ? form.fotos : [],
      depoimentos: Array.isArray(form.depoimentos) ? form.depoimentos : [],
      attachments: Array.isArray(form.attachments) ? form.attachments : [],
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
          await base44.functions.invoke('notifyReportSubmitted', {
            reportId: report.id,
          });
        } catch (notifyErr) {
          console.error('Erro ao notificar:', notifyErr);
        }
      } else {
        toast.success('Relatório salvo com sucesso!');
      }

      setForm((prev) => ({ ...prev, ...payload, status: nextStatus || prev.status }));
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

      const reportAtualizado = { ...report, ...buildPayload('DRAFT') };

      try {
        const response = await base44.functions.invoke('generateSingleReportPDF', {
          reportId: report.id,
          mode: 'assinatura',
        });

        const html = response?.data?.html || response?.html;
        const fileName = response?.data?.file_name || response?.file_name || 'relatorio_assinatura';

        if (html) {
          openHtmlForPrint(html, fileName);
          toast.success('Layout de assinatura aberto. Use “Salvar como PDF” na impressão.');
          return;
        }

        openHtmlForPrint(buildFallbackReportHtml(reportAtualizado), fileName);
        toast.warning('Função de PDF sem retorno. Abrindo versão local para impressão.');
      } catch (functionError) {
        console.error('Erro na função generateSingleReportPDF:', functionError);

        if (isFunctionNotFoundError(functionError)) {
          openHtmlForPrint(buildFallbackReportHtml(reportAtualizado), 'relatorio_assinatura');
          toast.warning('Função generateSingleReportPDF não encontrada. Abrindo versão local para impressão.');
          return;
        }

        throw functionError;
      }
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
                <Select
                  value={form.museu || ''}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, museu: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o museu" />
                  </SelectTrigger>
                  <SelectContent>
                    {MUSEUS.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Equipe / Área</Label>
                <Select
                  value={form.equipe || ''}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, equipe: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a equipe" />
                  </SelectTrigger>
                  <SelectContent>
                    {EQUIPES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Mês de referência</Label>
                <Select
                  value={form.mes_referencia || ''}
                  onValueChange={(value) => setForm((prev) => ({ ...prev, mes_referencia: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o mês" />
                  </SelectTrigger>
                  <SelectContent>
                    {MESES.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
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
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      ano: Number(e.target.value) || new Date().getFullYear(),
                    }))
                  }
                />
              </div>

              <div />
            </div>

            <div>
              <Label htmlFor="resumo_periodo">Resumo do Período</Label>
              <Textarea
                id="resumo_periodo"
                value={form.resumo_periodo}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    resumo_periodo: formatarNumeroResumo(e.target.value),
                  }))
                }
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
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    avaliacao_pontos_positivos: e.target.value,
                  }))
                }
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
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    comentarios_coordenacao: e.target.value,
                  }))
                }
                placeholder="Comentários da coordenação"
                className="min-h-[120px] text-base p-4"
              />
            </div>

            <div>
              <Label htmlFor="historico_observacoes">Histórico / Observações</Label>
              <Textarea
                id="historico_observacoes"
                value={form.historico_observacoes}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    historico_observacoes: e.target.value,
                  }))
                }
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
                setForm((prev) => ({
                  ...prev,
                  atividades: updater(Array.isArray(prev.atividades) ? prev.atividades : []),
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
            canEdit={true}
            reportData={form}
          />
        )}

        {activeTab === 'depoimentos' && (
          <DepoimentosSection
            depoimentos={form.depoimentos || []}
            onChange={(nextDepoimentos) =>
              setForm((prev) => ({ ...prev, depoimentos: nextDepoimentos }))
            }
            canEdit={true}
            museu={form.museu}
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
