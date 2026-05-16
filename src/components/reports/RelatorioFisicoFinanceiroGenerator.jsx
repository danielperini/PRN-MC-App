import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Download, FileText, Loader2, CheckCircle2 } from 'lucide-react';

const MUSEUS = ['MIS', 'MHAB', 'MUMO'];

const CAPITULOS_DISPONIVEIS = [
  ['capa', 'Capa editorial'],
  ['introducao', 'Introdução institucional'],
  ['territorio', 'Território e contexto'],
  ['resumo_geral', 'Resumo e indicadores'],
  ['publico', 'Público alcançado'],
  ['metas', 'Metas do 3º Aditivo'],
  ['programacao', 'Programação'],
  ['agenda_programacao', 'Agenda de programação'],
  ['atividades_museu', 'Atividades por museu'],
  ['relatorios_completos', 'Relatórios integrais das equipes'],
  ['galeria_evidencias', 'Galeria e evidências'],
  ['comunicacao', 'Comunicação'],
  ['financeiro', 'Execução financeira'],
  ['rubricas', 'Rubricas, orçamento e execução por grupo'],
  ['prestacao', 'Prestação de contas'],
  ['app_museu_centro', 'Museu Centro APP'],
  ['conclusao', 'Conclusão'],
];

const REPORT_GENERATOR_STRATEGY = {
  nome: 'Gerador de Relatório',
  idioma: 'pt-BR',
  tom: 'institucional, técnico, cultural e analítico',
  atividades: {
    agrupamento: 'por_museu',
    fotos_por_atividade: 2,
    textos_integrais: true,
    arquivos_drive_em_tres_colunas: true,
  },
  capitulos_removidos: ['memoria_institucional', 'atividades_por_eixo'],
};

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toNumber(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function formatInt(value) {
  return Math.round(toNumber(value)).toLocaleString('pt-BR');
}

function openHtmlPreview(html) {
  try {
    sessionStorage.setItem('relatorio_fisico_financeiro_html', html);
  } catch {}

  const opened = window.open('/RelatorioPreview', '_blank', 'width=1200,height=900');
  if (opened) return;

  const w = window.open('', '_blank', 'width=1200,height=900');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
  }
}

async function safeList(entity, order = '-created_date', limit = 500) {
  try {
    if (!entity?.list) return [];
    const data = await entity.list(order, limit);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('Falha ao listar dados do relatório:', error);
    return [];
  }
}

function filterByPeriod(items, dateFrom, dateTo) {
  if (!Array.isArray(items)) return [];
  return items.filter((item) => {
    const rawDate = item?.data_inicio || item?.data_realizacao || item?.data || item?.created_date || item?.updated_date || '';
    const date = String(rawDate).slice(0, 10);
    if (!date) return true;
    if (dateFrom && date < dateFrom) return false;
    if (dateTo && date > dateTo) return false;
    return true;
  });
}

function getReportActivities(reports = []) {
  return reports.flatMap((report) => {
    const atividades = Array.isArray(report?.atividades) ? report.atividades : [];
    return atividades.map((atividade) => ({
      ...atividade,
      report_id: report?.id,
      report_author: report?.author_name || report?.created_by || '',
      report_museu: report?.museu || '',
      report_mes: report?.mes_referencia || '',
      report_ano: report?.ano || '',
    }));
  });
}

function getPublicoAtividade(atividade) {
  const direto = toNumber(atividade?.publico_total ?? atividade?.publico_estimado ?? atividade?.publico ?? 0);
  if (direto > 0) return direto;
  const medio = toNumber(atividade?.publico_medio_por_sessao ?? atividade?.publico_medio ?? 0);
  const vezes = Math.max(1, Math.round(toNumber(atividade?.quantas_vezes_ocorreu ?? atividade?.ocorrencias ?? 1)));
  return medio * vezes;
}

function groupActivitiesByMuseum(atividades = []) {
  const groups = { MIS: [], MHAB: [], MUMO: [], Geral: [] };
  atividades.forEach((atividade) => {
    const text = String([atividade?.museu, atividade?.report_museu, atividade?.local, atividade?.descricao, atividade?.titulo, atividade?.nome].filter(Boolean).join(' ')).toUpperCase();
    if (text.includes('MIS') || text.includes('IMAGEM') || text.includes('SOM')) groups.MIS.push(atividade);
    else if (text.includes('MHAB') || text.includes('ABILIO') || text.includes('ABÍLIO')) groups.MHAB.push(atividade);
    else if (text.includes('MUMO') || text.includes('MODA')) groups.MUMO.push(atividade);
    else groups.Geral.push(atividade);
  });
  return groups;
}

function buildFallbackHtml({ dateFrom, dateTo, museu, capitulos, reports, rubricas, compras, programacao }) {
  const atividades = getReportActivities(reports);
  const atividadesPorMuseu = groupActivitiesByMuseum(atividades);
  const publicoTotal = atividades.reduce((sum, atividade) => sum + getPublicoAtividade(atividade), 0);
  const totalPrevisto = rubricas.reduce((sum, r) => sum + toNumber(r?.valor_total ?? r?.valor_rubrica ?? r?.previsto), 0);
  const totalUtilizado = rubricas.reduce((sum, r) => sum + toNumber(r?.valor_utilizado ?? r?.utilizado ?? r?.realizado ?? r?.valor_pago), 0);
  const saldo = totalPrevisto - totalUtilizado;

  const chapter = (id, title, body) => capitulos.includes(id) ? `<section class="chapter"><h2>${escapeHtml(title)}</h2>${body}</section>` : '';

  const atividadesHtml = Object.entries(atividadesPorMuseu).map(([key, list]) => {
    if (!list.length) return '';
    return `<h3>${escapeHtml(key)}</h3>${list.slice(0, 60).map((a, index) => `
      <article class="item">
        <h4>${index + 1}. ${escapeHtml(a?.titulo || a?.nome || a?.nome_atividade || 'Atividade')}</h4>
        ${a?.descricao ? `<p>${escapeHtml(a.descricao)}</p>` : ''}
        <p><strong>Público:</strong> ${formatInt(getPublicoAtividade(a))}</p>
      </article>
    `).join('')}`;
  }).join('');

  const rubricasHtml = rubricas.slice(0, 80).map((r) => {
    const previsto = toNumber(r?.valor_total ?? r?.valor_rubrica ?? r?.previsto);
    const utilizado = toNumber(r?.valor_utilizado ?? r?.utilizado ?? r?.realizado ?? r?.valor_pago);
    return `<tr><td>${escapeHtml(r?.rubrica || r?.nome || r?.descricao || 'Rubrica')}</td><td>${formatInt(previsto)}</td><td>${formatInt(utilizado)}</td><td>${formatInt(previsto - utilizado)}</td></tr>`;
  }).join('');

  const reportsHtml = reports.slice(0, 120).map((r) => `
    <article class="item">
      <h4>${escapeHtml(r?.author_name || r?.created_by || 'Relatório')}</h4>
      <p><strong>Período:</strong> ${escapeHtml(r?.mes_referencia || '')} ${escapeHtml(r?.ano || '')} · <strong>Museu:</strong> ${escapeHtml(r?.museu || '')}</p>
      ${r?.resumo_periodo ? `<p>${escapeHtml(r.resumo_periodo)}</p>` : ''}
      ${r?.resumo_executivo ? `<p>${escapeHtml(r.resumo_executivo)}</p>` : ''}
    </article>
  `).join('');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Gerador de Relatório — Museus Centro</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 36px; font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; line-height: 1.55; }
    .cover { border: 2px solid #111; border-radius: 24px; padding: 42px; margin-bottom: 36px; min-height: 360px; display: flex; flex-direction: column; justify-content: space-between; }
    .eyebrow { font-size: 12px; text-transform: uppercase; letter-spacing: .16em; color: #555; font-weight: 700; }
    h1 { font-size: 42px; letter-spacing: -0.04em; margin: 18px 0 12px; line-height: 1; }
    h2 { font-size: 26px; border-bottom: 2px solid #111; padding-bottom: 10px; margin: 42px 0 18px; letter-spacing: -0.02em; }
    h3 { font-size: 20px; margin: 26px 0 12px; }
    h4 { font-size: 15px; margin: 0 0 8px; }
    p { font-size: 14px; margin: 0 0 12px; color: #333; }
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 24px 0; }
    .kpi { border: 1px solid #ddd; border-radius: 16px; padding: 18px; }
    .kpi strong { display: block; font-size: 24px; color: #111; }
    .kpi span { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: .12em; }
    .chapter { break-inside: avoid; margin-bottom: 28px; }
    .item { border: 1px solid #ddd; border-radius: 14px; padding: 14px; margin: 10px 0; break-inside: avoid; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; }
    th, td { border-bottom: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background: #f6f6f6; }
    @media print { body { padding: 18mm; } .chapter { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <section class="cover">
    <div>
      <div class="eyebrow">Museus Centro · MIS · MHAB · MUMO</div>
      <h1>Gerador de Relatório</h1>
      <p>Relatório editorial, programático, financeiro e de prestação de contas.</p>
    </div>
    <div>
      <p><strong>Período:</strong> ${escapeHtml(dateFrom)} a ${escapeHtml(dateTo)}</p>
      <p><strong>Museu:</strong> ${escapeHtml(museu || 'Todos os museus')}</p>
    </div>
  </section>

  <div class="kpis">
    <div class="kpi"><span>Relatórios</span><strong>${formatInt(reports.length)}</strong></div>
    <div class="kpi"><span>Atividades</span><strong>${formatInt(atividades.length)}</strong></div>
    <div class="kpi"><span>Público</span><strong>${formatInt(publicoTotal)}</strong></div>
    <div class="kpi"><span>Execução</span><strong>${totalPrevisto > 0 ? Math.round((totalUtilizado / totalPrevisto) * 100) : 0}%</strong></div>
  </div>

  ${chapter('introducao', 'Introdução institucional', '<p>Este relatório consolida o período de reorganização, planejamento e execução do Projeto Museus Centro, incluindo relatórios das equipes, programação, evidências, metas, rubricas e prestação de contas.</p>')}
  ${chapter('territorio', 'Território e contexto', '<p>O relatório organiza informações dos museus MIS, MHAB e MUMO, considerando suas especificidades institucionais, territoriais, educativas, culturais e patrimoniais.</p>')}
  ${chapter('resumo_geral', 'Resumo e indicadores', `<p>Foram considerados ${formatInt(reports.length)} relatórios, ${formatInt(atividades.length)} atividades e público consolidado de ${formatInt(publicoTotal)} pessoas.</p>`)}
  ${chapter('metas', 'Metas do 3º Aditivo', '<p>As metas do 3º Aditivo são apresentadas a partir dos dados disponíveis no sistema, com leitura integrada das rubricas, programação, relatórios e evidências.</p>')}
  ${chapter('programacao', 'Programação', `<p>Foram localizados ${formatInt(programacao.length)} registros de programação no período informado.</p>`)}
  ${chapter('atividades_museu', 'Atividades por museu', atividadesHtml || '<p>Nenhuma atividade localizada para o período.</p>')}
  ${chapter('relatorios_completos', 'Relatórios integrais das equipes', reportsHtml || '<p>Nenhum relatório localizado para o período.</p>')}
  ${chapter('financeiro', 'Execução financeira', `<p>Previsto: ${formatInt(totalPrevisto)} · Utilizado: ${formatInt(totalUtilizado)} · Saldo: ${formatInt(saldo)}.</p>`)}
  ${chapter('rubricas', 'Rubricas, orçamento e execução por grupo', `<table><thead><tr><th>Rubrica</th><th>Previsto</th><th>Utilizado</th><th>Saldo</th></tr></thead><tbody>${rubricasHtml}</tbody></table>`)}
  ${chapter('prestacao', 'Prestação de contas', `<p>Foram considerados ${formatInt(compras.length)} registros de compras/solicitações para composição da prestação de contas.</p>`)}
  ${chapter('app_museu_centro', 'Museu Centro APP', '<p>O Museu Centro APP organiza relatórios, pagamentos, evidências, dashboards, programação e documentos, qualificando o acompanhamento institucional e a transparência operacional.</p>')}
  ${chapter('conclusao', 'Conclusão', '<p>O relatório demonstra o avanço da consolidação do projeto, articulando gestão, programação, metas, evidências e execução financeira em uma base única de acompanhamento.</p>')}
</body>
</html>`;
}

export default function RelatorioFisicoFinanceiroGenerator() {
  const [dateFrom, setDateFrom] = useState('2026-02-02');
  const [dateTo, setDateTo] = useState('2026-04-30');
  const [museu, setMuseu] = useState('');
  const [capitulos, setCapitulos] = useState(CAPITULOS_DISPONIVEIS.map((s) => s[0]));
  const [loading, setLoading] = useState(false);
  const [metricas, setMetricas] = useState(null);
  const [html, setHtml] = useState(null);
  const [introIA, setIntroIA] = useState(true);
  const [modoEntrega, setModoEntrega] = useState(true);

  const toggleCapitulo = (id) => {
    setCapitulos((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);
  };

  const payloadBase = (modo) => ({
    dateFrom,
    dateTo,
    museu: museu || null,
    secoes: capitulos,
    capitulos,
    modo,
    introIA,
    modoEntrega,
    reportGeneratorStrategy: REPORT_GENERATOR_STRATEGY,
  });

  async function buildLocalReport() {
    const [reportsRaw, rubricasRaw, comprasRaw, programacaoRaw] = await Promise.all([
      safeList(base44.entities.Report, '-updated_date', 1000),
      safeList(base44.entities.Rubrica, 'ordem_exibicao', 1000),
      safeList(base44.entities.PurchaseRequest, '-created_date', 1000),
      safeList(base44.entities.Programacao, '-data_inicio', 1000),
    ]);

    const reports = filterByPeriod(reportsRaw, dateFrom, dateTo).filter((r) => !museu || r?.museu === museu);
    const rubricas = Array.isArray(rubricasRaw) ? rubricasRaw.filter((r) => r?.ativo !== false) : [];
    const compras = filterByPeriod(comprasRaw, dateFrom, dateTo).filter((c) => !museu || c?.museu === museu || c?.centro_custo === museu);
    const programacao = filterByPeriod(programacaoRaw, dateFrom, dateTo).filter((p) => !museu || p?.museu === museu || p?.centro_custo === museu);
    const atividades = getReportActivities(reports);
    const publicoTotal = atividades.reduce((sum, a) => sum + getPublicoAtividade(a), 0);
    const totalPrevisto = rubricas.reduce((sum, r) => sum + toNumber(r?.valor_total ?? r?.valor_rubrica ?? r?.previsto), 0);
    const totalUtilizado = rubricas.reduce((sum, r) => sum + toNumber(r?.valor_utilizado ?? r?.utilizado ?? r?.realizado ?? r?.valor_pago), 0);

    return {
      metricas: {
        total_relatorios: reports.length,
        total_atividades: atividades.length,
        publico_total: publicoTotal,
        percentual: totalPrevisto > 0 ? Math.round((totalUtilizado / totalPrevisto) * 100) : 0,
        total_compras: compras.length,
        total_nf: compras.filter((c) => c?.nf_numero || c?.numero_nf || c?.nota_fiscal).length,
        total_programacoes: programacao.length,
        total_releases: 0,
      },
      html: buildFallbackHtml({ dateFrom, dateTo, museu, capitulos, reports, rubricas, compras, programacao }),
    };
  }

  const handlePreview = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('gerarRelatorioFisicoFinanceiro', payloadBase('previa'));

      if (res.data?.error) {
        throw new Error(res.data.error);
      }

      setMetricas(res.data);
      toast.success('Métricas carregadas');
    } catch (err) {
      const local = await buildLocalReport();
      setMetricas(local.metricas);
      toast.warning('Função Base44 indisponível. Métricas locais carregadas.');
    } finally {
      setLoading(false);
    }
  };

  const handleGerarCompleto = async () => {
    setLoading(true);
    try {
      const res = await base44.functions.invoke('gerarRelatorioFisicoFinanceiro', payloadBase('completo'));

      if (res.data?.error) {
        throw new Error(res.data.error);
      }

      if (res.data?.html) {
        setHtml(res.data.html);
        openHtmlPreview(res.data.html);
        toast.success('Relatório gerado com sucesso');
        return;
      }

      throw new Error('Função não retornou HTML');
    } catch (err) {
      const local = await buildLocalReport();
      setMetricas(local.metricas);
      setHtml(local.html);
      openHtmlPreview(local.html);
      toast.warning('Função Base44 indisponível. Relatório local aberto para revisão.');
    } finally {
      setLoading(false);
    }
  };

  const handleExportarPDF = async () => {
    if (!html) {
      toast.error('Gere o relatório antes de exportar');
      return;
    }

    setLoading(true);
    try {
      const res = await base44.functions.invoke('exportarRelatorioFisicoFinanceiroPDF', {
        html,
        dateFrom,
        dateTo,
        museu: museu || 'Consolidado',
        formato: 'ambos',
        reportGeneratorStrategy: REPORT_GENERATOR_STRATEGY,
      });

      if (res.data?.error) {
        throw new Error(res.data.error);
      }

      toast.success('Relatório exportado e armazenado no Drive');
    } catch (err) {
      openHtmlPreview(html);
      toast.warning('Exportação Base44 indisponível. Use Salvar como PDF na prévia.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      <Card className="p-6">
        <h2 className="text-xl font-bold mb-1">Gerador de Relatório</h2>
        <p className="text-sm text-gray-500 mb-6">Relatório editorial, programático, financeiro e de prestação de contas.</p>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-2">Data Inicial</label>
            <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} disabled={loading} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Data Final</label>
            <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} disabled={loading} />
          </div>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Museu (opcional)</label>
          <select value={museu} onChange={(e) => setMuseu(e.target.value)} disabled={loading} className="w-full border rounded px-3 py-2">
            <option value="">Todos</option>
            {MUSEUS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div className="mb-6 space-y-2">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={introIA} onChange={(e) => setIntroIA(e.target.checked)} disabled={loading} />
            <span className="text-sm">Redigir textos com IA em português BR</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={modoEntrega} onChange={(e) => setModoEntrega(e.target.checked)} disabled={loading} />
            <span className="text-sm">Modo entrega / prestação de contas</span>
          </label>
        </div>

        <div className="mb-6">
          <h3 className="font-semibold mb-3">Capítulos do relatório</h3>
          <div className="grid grid-cols-2 gap-3">
            {CAPITULOS_DISPONIVEIS.map(([id, label]) => (
              <label key={id} className="flex items-center gap-2">
                <input type="checkbox" checked={capitulos.includes(id)} onChange={() => toggleCapitulo(id)} disabled={loading} />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex gap-3 flex-wrap">
          <Button onClick={handlePreview} disabled={loading} variant="outline">
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Carregar Métricas
          </Button>
          <Button onClick={handleGerarCompleto} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Gerar Relatório
          </Button>
          {html && (
            <Button onClick={handleExportarPDF} disabled={loading} className="bg-green-600 hover:bg-green-700">
              <Download className="w-4 h-4 mr-2" />
              Exportar PDF
            </Button>
          )}
        </div>
      </Card>

      {metricas && (
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4">Métricas Carregadas</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              ['Relatórios', metricas.total_relatorios],
              ['Atividades', metricas.total_atividades],
              ['Público', metricas.publico_total?.toLocaleString?.('pt-BR')],
              ['Execução', `${metricas.percentual || 0}%`],
              ['Compras', metricas.total_compras],
              ['Notas Fiscais', metricas.total_nf],
              ['Programações', metricas.total_programacoes],
              ['Releases', metricas.total_releases],
            ].map(([label, value]) => (
              <div key={label} className="bg-blue-50 p-4 rounded">
                <div className="text-sm text-gray-600">{label}</div>
                <div className="text-2xl font-bold">{value ?? 0}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {html && (
        <Card className="p-6">
          <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-green-600" />
            Relatório Gerado
          </h3>
          <div className="space-y-2 text-sm">
            <p><strong>Status:</strong> Pronto para revisão/exportação</p>
            <p><strong>Formato:</strong> HTML imprimível</p>
            <p><strong>PDF:</strong> abra a prévia e use Salvar como PDF.</p>
            <Button
              variant="outline"
              onClick={() => {
                const blob = new Blob([html], { type: 'text/html' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `relatorio-${new Date().toISOString().split('T')[0]}.html`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="w-full"
            >
              <FileText className="w-4 h-4 mr-2" />
              Baixar HTML
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
