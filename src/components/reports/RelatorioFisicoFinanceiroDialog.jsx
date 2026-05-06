import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { FileDown, Loader2, Eye, AlertCircle, Paperclip, Sparkles } from 'lucide-react';

const TOTAL_OFICIAL = 1320000;

const SECOES = [
  { id: 'capa', label: 'Capa' },
  { id: 'introducao', label: 'Introdução executiva' },
  { id: 'resumo_geral', label: 'Resumo geral do período' },
  { id: 'atividades', label: 'Atividades realizadas' },
  { id: 'resumo_museu', label: 'Resumo por museu' },
  { id: 'publico', label: 'Público alcançado' },
  { id: 'comunicacao', label: 'Comunicação' },
  { id: 'fotos', label: 'Fotos' },
  { id: 'financeiro', label: 'Execução financeira' },
  { id: 'notas_fiscais', label: 'Notas fiscais e compras' },
  { id: 'prestacao', label: 'Prestação de contas' },
  { id: 'conclusao', label: 'Conclusão' },
];

const MUSEUS_OPTIONS = [
  { value: 'todos', label: 'Todos os museus' },
  { value: 'MIS', label: 'MIS' },
  { value: 'MHAB', label: 'MHAB' },
  { value: 'MUMO', label: 'MUMO' },
];

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function inteiro(value) {
  return Math.round(toNumber(value));
}

function fmtInt(value) {
  return inteiro(value).toLocaleString('pt-BR');
}

function fmtBRL(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

function parseDate(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateInRange(value, from, to) {
  const d = parseDate(value);
  if (!d) return false;

  const start = new Date(from);
  start.setHours(0, 0, 0, 0);

  const end = new Date(to);
  end.setHours(23, 59, 59, 999);

  return d >= start && d <= end;
}

function getActivityDate(activity, report) {
  return (
    activity?.data_inicio ||
    activity?.data_realizacao ||
    activity?.data ||
    report?.data_inicio ||
    report?.created_date ||
    report?.updated_date
  );
}

function getActivityPublico(activity) {
  return inteiro(
    activity?.publico_total ??
    activity?.publico_estimado ??
    activity?.publico ??
    0
  );
}

function isApprovedReport(report) {
  const status = String(report?.status || '').toUpperCase();
  return ['APPROVED', 'APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN'].includes(status);
}

function normalizeMuseu(value) {
  const raw = String(value || '').toUpperCase();
  if (raw.includes('MHAB')) return 'MHAB';
  if (raw.includes('MIS')) return 'MIS';
  if (raw.includes('MUMO')) return 'MUMO';
  return value || 'Atuação Geral';
}

async function safeList(entity, order = '-created_date', limit = 1000) {
  try {
    if (!entity?.list) return [];
    const res = await entity.list(order, limit);
    return Array.isArray(res) ? res : [];
  } catch (error) {
    console.warn('Falha ao listar entidade:', error);
    return [];
  }
}

function buildPersonaPrompt(contexto) {
  return `
Você escreve como Daniel Perini.

Idioma: português do Brasil.

Estilo:
Linguagem técnica, institucional e objetiva.
Frases curtas.
Sem linguagem promocional.
Sem exageros.
Sem adjetivação excessiva.
Sem travessões.
Sem aparência de texto gerado por IA.

Tom:
Análise técnica.
Leitura crítica de dados.
Síntese operacional.
Perspectiva de gestão cultural, ESG, diálogo social e políticas públicas.

Evitar:
"Além disso".
"Vale destacar".
"Importante ressaltar".
"Transformador".
"Incrível".
"Impactante".
Travessões.
Listas excessivas.
Texto genérico.

Use somente os dados abaixo.
Não invente números.
Não invente atividades.
Não invente público.
Não invente execução financeira.

Dados consolidados:
${JSON.stringify(contexto, null, 2)}

Escreva em JSON válido, sem markdown, com as chaves:
{
  "introducao": "texto institucional de 2 a 4 parágrafos",
  "resumo_geral": "síntese técnica de 2 a 4 parágrafos",
  "prestacao": "texto de prestação de contas com leitura financeira e operacional",
  "conclusao": "conclusão técnica objetiva"
}
`;
}

async function gerarTextosComIA(contexto) {
  try {
    const result = await base44.integrations.Core.InvokeLLM({
      prompt: buildPersonaPrompt(contexto),
      response_json_schema: {
        type: 'object',
        properties: {
          introducao: { type: 'string' },
          resumo_geral: { type: 'string' },
          prestacao: { type: 'string' },
          conclusao: { type: 'string' },
        },
      },
    });

    return {
      introducao: result?.introducao || '',
      resumo_geral: result?.resumo_geral || '',
      prestacao: result?.prestacao || '',
      conclusao: result?.conclusao || '',
    };
  } catch (error) {
    console.warn('IA indisponível. Usando textos técnicos locais.', error);

    return {
      introducao:
        `O relatório consolida a execução física e financeira do projeto Museus Centro no período selecionado. A leitura considera relatórios aprovados, atividades registradas, público informado, rubricas orçamentárias e solicitações de compras disponíveis no sistema.`,
      resumo_geral:
        `No período analisado foram identificadas ${fmtInt(contexto.total_atividades)} atividades e público total de ${fmtInt(contexto.publico_total)} pessoas. Os dados foram organizados por museu, classificação e vínculo financeiro, preservando a rastreabilidade entre execução física, registros administrativos e orçamento.`,
      prestacao:
        `A execução financeira considera orçamento oficial de ${fmtBRL(TOTAL_OFICIAL)}, valor utilizado de ${fmtBRL(contexto.valor_utilizado)} e saldo de ${fmtBRL(contexto.saldo)}. As notas fiscais e compras listadas foram extraídas das solicitações disponíveis no sistema, sem alteração dos dados de origem.`,
      conclusao:
        `O conjunto de informações permite acompanhar a execução do projeto com base em dados verificáveis. A consolidação apoia o monitoramento técnico, a prestação de contas e a tomada de decisão da coordenação.`,
    };
  }
}

function montarHtmlRelatorio({ contexto, textos, secoesSelecionadas, filtros }) {
  const show = (id) => secoesSelecionadas.includes(id);

  const atividadesRows = contexto.atividades.slice(0, 120).map((a) => `
    <tr>
      <td>${a.nome}</td>
      <td>${a.museu}</td>
      <td>${a.mes || ''}</td>
      <td class="num">${fmtInt(a.publico)}</td>
    </tr>
  `).join('');

  const museuRows = Object.values(contexto.por_museu).map((m) => `
    <tr>
      <td>${m.museu}</td>
      <td class="num">${fmtInt(m.atividades)}</td>
      <td class="num">${fmtInt(m.publico)}</td>
    </tr>
  `).join('');

  const compraRows = contexto.compras.slice(0, 120).map((c) => `
    <tr>
      <td>${c.descricao}</td>
      <td>${c.fornecedor}</td>
      <td>${c.rubrica}</td>
      <td>${c.status}</td>
      <td class="num">${fmtBRL(c.valor)}</td>
    </tr>
  `).join('');

  const fotoBlocks = contexto.fotos.slice(0, 24).map((foto) => `
    <figure>
      <img src="${foto.url}" />
      <figcaption>${foto.caption || foto.fileName || 'Registro fotográfico'}</figcaption>
    </figure>
  `).join('');

  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Relatório Físico-Financeiro</title>
<style>
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    background: #f4f4f5;
    margin: 0;
    padding: 32px;
  }
  .page {
    background: white;
    max-width: 980px;
    margin: 0 auto 24px auto;
    padding: 56px;
    box-shadow: 0 10px 40px rgba(0,0,0,.08);
  }
  h1 {
    font-size: 34px;
    line-height: 1.1;
    margin: 0 0 12px;
    letter-spacing: -0.03em;
  }
  h2 {
    font-size: 21px;
    margin: 36px 0 12px;
    border-bottom: 1px solid #ddd;
    padding-bottom: 8px;
  }
  h3 {
    font-size: 15px;
    margin: 20px 0 8px;
  }
  p {
    font-size: 14px;
    line-height: 1.65;
    margin: 0 0 12px;
  }
  .meta {
    color: #555;
    font-size: 13px;
    margin-top: 8px;
  }
  .kpis {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
    margin: 28px 0;
  }
  .kpi {
    border: 1px solid #ddd;
    border-radius: 14px;
    padding: 16px;
  }
  .kpi small {
    display: block;
    color: #666;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .08em;
    margin-bottom: 8px;
  }
  .kpi strong {
    font-size: 22px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0 24px;
    font-size: 12px;
  }
  th, td {
    border-bottom: 1px solid #e5e5e5;
    padding: 9px 8px;
    text-align: left;
    vertical-align: top;
  }
  th {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: .06em;
    color: #555;
  }
  .num {
    text-align: right;
    white-space: nowrap;
  }
  .photo-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
  }
  figure {
    margin: 0;
    border: 1px solid #ddd;
    border-radius: 12px;
    overflow: hidden;
  }
  figure img {
    width: 100%;
    height: 220px;
    object-fit: cover;
    display: block;
  }
  figcaption {
    padding: 10px;
    font-size: 11px;
    color: #444;
  }
  .actions {
    max-width: 980px;
    margin: 0 auto 24px auto;
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }
  button {
    background: #111;
    color: white;
    border: 0;
    padding: 10px 14px;
    border-radius: 10px;
    cursor: pointer;
  }
  button.secondary {
    background: white;
    color: #111;
    border: 1px solid #ccc;
  }
  @media print {
    body {
      background: white;
      padding: 0;
    }
    .actions {
      display: none;
    }
    .page {
      box-shadow: none;
      margin: 0;
      max-width: none;
      min-height: 100vh;
      page-break-after: always;
    }
  }
</style>
</head>
<body>
  <div class="actions">
    <button class="secondary" onclick="window.print()">Salvar como PDF</button>
    <button onclick="window.print()">Imprimir / PDF</button>
  </div>

  <section class="page">
    ${show('capa') ? `
      <h1>Relatório Físico-Financeiro</h1>
      <p class="meta">Museus Centro · ${filtros.museu || 'Todos os museus'} · ${filtros.dateFrom} a ${filtros.dateTo}</p>
      <div class="kpis">
        <div class="kpi"><small>Atividades</small><strong>${fmtInt(contexto.total_atividades)}</strong></div>
        <div class="kpi"><small>Público</small><strong>${fmtInt(contexto.publico_total)}</strong></div>
        <div class="kpi"><small>Utilizado</small><strong>${fmtBRL(contexto.valor_utilizado)}</strong></div>
        <div class="kpi"><small>Saldo</small><strong>${fmtBRL(contexto.saldo)}</strong></div>
      </div>
    ` : ''}

    ${show('introducao') ? `<h2>Introdução executiva</h2><p>${textos.introducao}</p>` : ''}
    ${show('resumo_geral') ? `<h2>Resumo geral do período</h2><p>${textos.resumo_geral}</p>` : ''}

    ${show('resumo_museu') ? `
      <h2>Resumo por museu</h2>
      <table>
        <thead><tr><th>Museu</th><th class="num">Atividades</th><th class="num">Público</th></tr></thead>
        <tbody>${museuRows}</tbody>
      </table>
    ` : ''}

    ${show('publico') ? `
      <h2>Público alcançado</h2>
      <p>O público consolidado no período foi de ${fmtInt(contexto.publico_total)} pessoas, considerando os registros de atividades disponíveis nos relatórios aprovados.</p>
    ` : ''}

    ${show('atividades') ? `
      <h2>Atividades realizadas</h2>
      <table>
        <thead><tr><th>Atividade</th><th>Museu</th><th>Mês</th><th class="num">Público</th></tr></thead>
        <tbody>${atividadesRows || '<tr><td colspan="4">Nenhuma atividade encontrada no período.</td></tr>'}</tbody>
      </table>
    ` : ''}

    ${show('comunicacao') ? `
      <h2>Comunicação</h2>
      <p>A seção de comunicação consolida registros disponíveis nos relatórios, atividades e anexos do período. Nesta primeira versão, o texto é gerado a partir dos dados estruturados já existentes no sistema.</p>
    ` : ''}

    ${show('financeiro') ? `
      <h2>Execução financeira</h2>
      <table>
        <tbody>
          <tr><th>Orçamento oficial</th><td class="num">${fmtBRL(TOTAL_OFICIAL)}</td></tr>
          <tr><th>Valor utilizado</th><td class="num">${fmtBRL(contexto.valor_utilizado)}</td></tr>
          <tr><th>Saldo disponível</th><td class="num">${fmtBRL(contexto.saldo)}</td></tr>
          <tr><th>Percentual de execução</th><td class="num">${contexto.percentual_execucao}%</td></tr>
        </tbody>
      </table>
    ` : ''}

    ${show('notas_fiscais') ? `
      <h2>Notas fiscais e compras</h2>
      <table>
        <thead><tr><th>Descrição</th><th>Fornecedor</th><th>Rubrica</th><th>Status</th><th class="num">Valor</th></tr></thead>
        <tbody>${compraRows || '<tr><td colspan="5">Nenhuma compra encontrada no período.</td></tr>'}</tbody>
      </table>
    ` : ''}

    ${show('prestacao') ? `<h2>Prestação de contas</h2><p>${textos.prestacao}</p>` : ''}
    ${show('conclusao') ? `<h2>Conclusão</h2><p>${textos.conclusao}</p>` : ''}
  </section>

  ${show('fotos') ? `
    <section class="page">
      <h2>Fotos</h2>
      <div class="photo-grid">${fotoBlocks || '<p>Nenhuma foto localizada para o período.</p>'}</div>
    </section>
  ` : ''}
</body>
</html>
`;
}

export default function RelatorioFisicoFinanceiroDialog({ open, onClose }) {
  const hoje = new Date().toISOString().slice(0, 10);
  const inicioAno = `${new Date().getFullYear()}-01-01`;

  const [dateFrom, setDateFrom] = useState(inicioAno);
  const [dateTo, setDateTo] = useState(hoje);
  const [museu, setMuseu] = useState('todos');
  const [secoes, setSecoes] = useState(Object.fromEntries(SECOES.map((s) => [s.id, true])));
  const [modoEntrega, setModoEntrega] = useState(false);
  const [introIA, setIntroIA] = useState(true);
  const [loadingPrevia, setLoadingPrevia] = useState(false);
  const [loadingPDF, setLoadingPDF] = useState(false);
  const [previa, setPrevia] = useState(null);

  const toggleSecao = (id) => setSecoes((p) => ({ ...p, [id]: !p[id] }));
  const toggleAll = (val) => setSecoes(Object.fromEntries(SECOES.map((s) => [s.id, val])));

  const secoesSelecionadas = Object.entries(secoes).filter(([, v]) => v).map(([k]) => k);

  async function coletarDados() {
    const [reportsRaw, rubricasRaw, comprasRaw, attachmentsRaw, programacaoRaw] = await Promise.all([
      safeList(base44.entities.Report, '-updated_date', 1000),
      safeList(base44.entities.Rubrica, 'ordem_exibicao', 1000),
      safeList(base44.entities.PurchaseRequest, '-created_date', 1000),
      safeList(base44.entities.Attachment, '-created_date', 1000),
      safeList(base44.entities.Programacao, '-data_inicio', 1000),
    ]);

    const museuFiltro = museu === 'todos' ? null : museu;

    const reports = reportsRaw
      .filter(isApprovedReport)
      .filter((r) => !museuFiltro || normalizeMuseu(r?.museu) === museuFiltro);

    const atividades = [];

    reports.forEach((report) => {
      (Array.isArray(report?.atividades) ? report.atividades : []).forEach((atividade) => {
        const dataAtividade = getActivityDate(atividade, report);

        if (!dateInRange(dataAtividade, dateFrom, dateTo)) return;

        atividades.push({
          nome: atividade?.nome || atividade?.titulo || atividade?.nome_atividade || 'Atividade sem título',
          museu: normalizeMuseu(report?.museu || atividade?.museu),
          mes: report?.mes_referencia || '',
          publico: getActivityPublico(atividade),
          classificacao: atividade?.classificacao || '',
        });
      });
    });

    const porMuseu = {};
    atividades.forEach((atividade) => {
      const key = normalizeMuseu(atividade.museu);
      if (!porMuseu[key]) {
        porMuseu[key] = { museu: key, atividades: 0, publico: 0 };
      }
      porMuseu[key].atividades += 1;
      porMuseu[key].publico += inteiro(atividade.publico);
    });

    const rubricasAtivas = rubricasRaw.filter((r) => r?.ativo !== false);
    const valorUtilizado = rubricasAtivas.reduce((sum, r) => sum + toNumber(r?.valor_utilizado), 0);
    const saldo = TOTAL_OFICIAL - valorUtilizado;
    const percentualExecucao = TOTAL_OFICIAL > 0
      ? Number(((valorUtilizado / TOTAL_OFICIAL) * 100).toFixed(1))
      : 0;

    const compras = comprasRaw
      .filter((c) => !museuFiltro || normalizeMuseu(c?.centro_custo || c?.museu) === museuFiltro)
      .filter((c) => {
        const data = c?.data_emissao || c?.nf_data_emissao || c?.created_date || c?.updated_date;
        return dateInRange(data, dateFrom, dateTo);
      })
      .map((c) => ({
        descricao: c?.descricao || c?.description || c?.titulo || 'Solicitação de compra',
        fornecedor: c?.fornecedor_nome || c?.fornecedor || c?.supplier_name || '',
        rubrica: c?.rubrica_nome || c?.rubrica || '',
        status: c?.status || '',
        valor: toNumber(c?.valor_total || c?.valor || c?.amount),
      }));

    const fotos = attachmentsRaw
      .filter((a) => String(a?.mime_type || a?.type || '').includes('image') || /\.(jpg|jpeg|png|webp)$/i.test(String(a?.file_name || a?.name || a?.url || '')))
      .slice(0, 60)
      .map((a) => ({
        url: a?.url || a?.file_url || a?.arquivo_url || '',
        caption: a?.caption || a?.legenda || '',
        fileName: a?.file_name || a?.name || 'Foto',
      }))
      .filter((a) => a.url);

    const contexto = {
      periodo: { dateFrom, dateTo },
      museu: museuFiltro || 'Todos',
      total_relatorios: reports.length,
      total_atividades: atividades.length,
      publico_total: atividades.reduce((sum, a) => sum + inteiro(a.publico), 0),
      por_museu: porMuseu,
      atividades,
      valor_utilizado: valorUtilizado,
      saldo,
      percentual_execucao: percentualExecucao,
      total_nf: compras.length,
      total_compras: compras.length,
      compras,
      fotos,
      programacao_total: programacaoRaw.length,
    };

    const textos = introIA
      ? await gerarTextosComIA(contexto)
      : await gerarTextosComIA(contexto);

    return { contexto, textos };
  }

  async function handlePrevia() {
    if (!dateFrom || !dateTo) {
      toast.error('Informe as datas');
      return;
    }

    if (secoesSelecionadas.length === 0) {
      toast.error('Selecione ao menos uma seção');
      return;
    }

    setLoadingPrevia(true);

    try {
      const { contexto, textos } = await coletarDados();
      setPrevia(contexto);

      const html = montarHtmlRelatorio({
        contexto,
        textos,
        secoesSelecionadas,
        filtros: { dateFrom, dateTo, museu: museu === 'todos' ? 'Todos os museus' : museu },
      });

      const w = window.open('', '_blank', 'width=1200,height=900');
      if (w) {
        w.document.open();
        w.document.write(html);
        w.document.close();
      }

      toast.success('Prévia aberta em nova janela.');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar prévia: ' + (error?.message || 'tente novamente'));
    } finally {
      setLoadingPrevia(false);
    }
  }

  async function handlePDF() {
    if (!dateFrom || !dateTo) {
      toast.error('Informe as datas');
      return;
    }

    if (secoesSelecionadas.length === 0) {
      toast.error('Selecione ao menos uma seção');
      return;
    }

    setLoadingPDF(true);

    try {
      const { contexto, textos } = await coletarDados();
      setPrevia(contexto);

      const html = montarHtmlRelatorio({
        contexto,
        textos,
        secoesSelecionadas,
        filtros: { dateFrom, dateTo, museu: museu === 'todos' ? 'Todos os museus' : museu },
      });

      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);

      const w = window.open(url, '_blank', 'width=1200,height=900');
      if (w) {
        setTimeout(() => {
          try {
            w.print();
          } catch {}
        }, 900);
      }

      toast.success('Relatório aberto. Use “Salvar como PDF”.');
    } catch (error) {
      console.error(error);
      toast.error('Erro ao gerar relatório: ' + (error?.message || 'tente novamente'));
    } finally {
      setLoadingPDF(false);
    }
  }

  const isLoading = loadingPrevia || loadingPDF;
  const secoesCount = secoesSelecionadas.length;
  const tempoEstimado = modoEntrega ? '3 a 5 min' : '1 a 2 min';

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Relatório Físico-Financeiro</DialogTitle>
          <p className="text-sm text-gray-500 mt-0.5">Projeto Museus Centro — gerado com IA</p>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Data inicial</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="border-gray-200" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Data final</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="border-gray-200" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-sm font-medium">Museu</Label>
            <Select value={museu} onValueChange={setMuseu}>
              <SelectTrigger className="border-gray-200">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MUSEUS_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">Opções de geração</Label>
            <div className="space-y-2.5 p-4 bg-gray-50 border border-gray-100 rounded-xl">
              <div
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${modoEntrega ? 'border-black bg-black/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                onClick={() => setModoEntrega((p) => !p)}
              >
                <Checkbox
                  id="modoEntrega"
                  checked={modoEntrega}
                  onCheckedChange={(v) => setModoEntrega(!!v)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="modoEntrega" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5" />
                    Entrega / Prestação de Contas
                  </Label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Inclui fotos, notas fiscais, compras, execução financeira e texto técnico de prestação de contas.
                  </p>
                </div>
              </div>

              <div
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${introIA ? 'border-black bg-black/5' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                onClick={() => setIntroIA((p) => !p)}
              >
                <Checkbox
                  id="introIA"
                  checked={introIA}
                  onCheckedChange={(v) => setIntroIA(!!v)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5"
                />
                <div>
                  <Label htmlFor="introIA" className="text-sm font-medium cursor-pointer flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Redigir textos com IA
                  </Label>
                  <p className="text-xs text-gray-500 mt-0.5">
                    A IA escreve com a persona Daniel Perini, em português técnico, direto e sem marcas de texto automatizado.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Seções do relatório</Label>
              <div className="flex gap-2 text-xs">
                <button onClick={() => toggleAll(true)} className="text-blue-600 hover:underline">Todas</button>
                <span className="text-gray-300">|</span>
                <button onClick={() => toggleAll(false)} className="text-gray-500 hover:underline">Nenhuma</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4 bg-gray-50 border border-gray-100 rounded-xl">
              {SECOES.map((s) => (
                <div key={s.id} className="flex items-center gap-2.5">
                  <Checkbox
                    id={s.id}
                    checked={!!secoes[s.id]}
                    onCheckedChange={() => toggleSecao(s.id)}
                  />
                  <Label htmlFor={s.id} className="text-sm cursor-pointer text-gray-700">{s.label}</Label>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-400">
              {secoesCount} de {SECOES.length} seções selecionadas
            </p>
          </div>

          {previa && (
            <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl space-y-2 text-sm">
              <p className="font-semibold text-blue-800">Prévia — métricas extraídas</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-blue-900">
                <span>Relatórios: <strong>{previa.total_relatorios ?? '—'}</strong></span>
                <span>Atividades: <strong>{previa.total_atividades ?? '—'}</strong></span>
                <span>Público total: <strong>{fmtInt(previa.publico_total)}</strong></span>
                <span>Orçamento: <strong>{fmtBRL(TOTAL_OFICIAL)}</strong></span>
                <span>Utilizado: <strong>{fmtBRL(previa.valor_utilizado)}</strong></span>
                <span>Compras/NFs: <strong>{previa.total_compras ?? '—'}</strong></span>
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg text-xs text-amber-700">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              A IA gera textos com base nos dados reais. Nenhum dado será alterado. Tempo estimado: <strong>{tempoEstimado}</strong>.
            </span>
          </div>
        </div>

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            className="gap-2 border-blue-200 text-blue-700 hover:bg-blue-50"
            onClick={handlePrevia}
            disabled={isLoading}
          >
            {loadingPrevia ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4" />}
            {loadingPrevia ? 'Gerando prévia...' : 'Gerar prévia'}
          </Button>
          <Button
            className="bg-black hover:bg-gray-800 text-white gap-2"
            onClick={handlePDF}
            disabled={isLoading}
          >
            {loadingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {loadingPDF ? 'Gerando PDF...' : 'Gerar PDF'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
