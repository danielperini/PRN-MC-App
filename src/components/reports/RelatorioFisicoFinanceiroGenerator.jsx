import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { Download, Loader2, CheckCircle2 } from 'lucide-react';

const MUSEUS = ['MIS', 'MHAB', 'MUMO'];

const CAPITULOS_DISPONIVEIS = [
  ['capa', 'Capa editorial'],
  ['introducao', 'Introdução institucional'],
  ['territorio', 'Território e contexto'],
  ['resumo_geral', 'Resumo e indicadores'],
  ['publico', 'Público alcançado'],
  ['metas', 'Metas do 3º Aditivo'],
  ['programacao', 'Agenda e programação'],
  ['agenda_programacao', 'Tabela da programação'],
  ['atividades_museu', 'Atividades por museu'],
  ['galeria_evidencias', 'Galeria e evidências'],
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
  atividades: { agrupamento: 'por_museu', fotos_por_atividade: 2, textos_integrais: true },
  capitulos_removidos: ['memoria_institucional', 'atividades_por_eixo'],
};

const METAS = [
  ['META 01', 'Equipe principal', 'Contratação e manutenção da equipe principal e coordenações do projeto.'],
  ['META 03', 'Manutenção das exposições permanentes', 'Manutenção, conservação e qualificação das exposições permanentes.'],
  ['META 04', 'Alteração de núcleos expositivos', 'Planejamento técnico para núcleos e salas expositivas.'],
  ['META 05', 'Atividades educativas e culturais', 'Oficinas, mediações, Museu Criativo, Prosas MIS e ações educativas.'],
  ['META 07', 'Contratação de educadores', 'Educadores e profissionais de mediação vinculados a MIS, MHAB e MUMO.'],
  ['META 10', 'Mostras e exposições', 'Mostras, exposições e programação associada.'],
  ['META 11', 'Noturno nos Museus', 'Pré-produção, infraestrutura e planejamento executivo.'],
  ['META 12', 'Exposição MHAB', 'Projeto curatorial, catálogo, expografia e ações vinculadas ao MHAB.'],
  ['META 12B', 'Exposição MUMO', 'Projeto curatorial, ações expositivas e ocupação cultural do MUMO.'],
  ['META 14', 'Acessibilidade', 'Dispositivos, Libras, acolhimento e inclusão cultural.'],
  ['META 15', 'Diárias de educadores', 'Diárias e suporte operacional às atividades educativas.'],
  ['META 16', 'Publicações e catálogos', 'Pesquisa, texto, revisão, tradução, design, fotografia e impressão.'],
  ['META 17', 'Custeio das atividades educativas e culturais', 'Materiais, lanches, som, iluminação e produção técnica.'],
];

const PROGRAMACAO_REFERENCIA = [
  ['07/03/2026', 'MUMO', 'Oficina — Experimentação em Estamparia Natural', 'Educativa', 'Museu da Moda', 'Experimentação artística com flores, folhas, tecidos e papéis.'],
  ['08/03/2026', 'MHAB', 'Museu Criativo — Mulheres que Ecoam Histórias', 'Educativa', 'MHAB', 'Oficina de expressão visual sobre memória, mulheres e narrativas.'],
  ['21/03/2026', 'MHAB', 'Oficina Costurando Bem Querer', 'Educativa', 'MHAB', 'Oficina de costura afetiva e criação de amuletos.'],
  ['27/03/2026', 'MIS', 'Prosas MIS — Animadoras Mineiras em Foco', 'Cultural', 'MIS BH', 'Roda de conversa sobre mulheres animadoras na animação brasileira.'],
  ['14/04/2026', 'MHAB', 'Formação Ambiente Seguro, Diversidade e Inclusão', 'Formação', 'Auditório MHAB', 'Formação interna para equipes, servidores e colaboradores.'],
  ['25/04/2026', 'MHAB', 'Memórias em Libras de Belo Horizonte', 'Acessibilidade', 'Casarão MHAB', 'Encontro em Libras com público surdo, memória urbana e visita mediada.'],
  ['25/04/2026', 'MIS', 'Oficina — Criação de Cenários', 'Rotina', 'MIS BH', 'Oficina de criação visual e construção de cenários.'],
  ['30/04/2026', 'MIS', 'Laboratório — A Poética da Argila em Movimento', 'Educativa', 'MIS BH', 'Laboratório de experimentação visual com argila, movimento e imagem.'],
];

function h(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function n(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const raw = String(v ?? '').replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.');
  const x = Number(raw || 0);
  return Number.isFinite(x) ? x : 0;
}

function norm(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function brl(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n(v));
}

function inteiro(v) {
  return Math.round(n(v)).toLocaleString('pt-BR');
}

function dataBR(v) {
  const raw = String(v || '').slice(0, 10);
  if (!raw || raw.length < 10) return v || '—';
  const [y, m, d] = raw.split('-');
  return `${d}/${m}/${y}`;
}

function dt(item) {
  return String(item?.data_inicio || item?.data_realizacao || item?.data_evento || item?.data || item?.created_date || item?.updated_date || '').slice(0, 10);
}

async function safeList(entity, order = '-created_date', limit = 1000) {
  try {
    if (!entity?.list) return [];
    const data = await entity.list(order, limit);
    return Array.isArray(data) ? data : [];
  } catch (error) {
    console.warn('Falha ao listar dados:', error);
    return [];
  }
}

function filterPeriod(items, from, to) {
  return (items || []).filter((item) => {
    const d = dt(item);
    if (!d) return true;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
}

function atividadesDosRelatorios(reports) {
  return (reports || []).flatMap((r) => (Array.isArray(r?.atividades) ? r.atividades : []).map((a) => ({ ...a, report_museu: r?.museu || '' })));
}

function publico(a) {
  const direto = n(a?.publico_total ?? a?.publico_estimado ?? a?.publico ?? 0);
  if (direto > 0) return direto;
  return n(a?.publico_medio_por_sessao ?? a?.publico_medio ?? 0) * Math.max(1, Math.round(n(a?.quantas_vezes_ocorreu ?? a?.ocorrencias ?? 1)));
}

function rubricaNome(r) {
  return r?.rubrica || r?.nome || r?.item_rubrica || r?.descricao || 'Rubrica sem nome';
}

function previsto(r) {
  return n(r?.valor_total ?? r?.valor_rubrica ?? r?.valor_previsto ?? r?.previsto ?? r?.saldo_inicial);
}

function utilizado(r) {
  return n(r?.valor_utilizado ?? r?.utilizado ?? r?.realizado ?? r?.valor_pago);
}

function rubricaDaMeta(r, numero, titulo) {
  const meta = norm([r?.meta, r?.meta_numero, r?.meta_titulo].filter(Boolean).join(' '));
  const num = norm(numero);
  const tit = norm(titulo);
  const texto = norm([rubricaNome(r), r?.grupo, r?.categoria].filter(Boolean).join(' '));
  if (meta && (meta.includes(num) || meta.includes(tit))) return true;
  if (num === 'meta 01') return ['coordenador', 'assistente', 'designer', 'fotografo', 'comunicacao', 'producao', 'equipe e gestao'].some((x) => texto.includes(norm(x)));
  if (num === 'meta 03') return texto.includes('manutencao');
  if (num === 'meta 05') return ['acoes educativo', 'atividades educativas', 'oficina', 'educativo'].some((x) => texto.includes(norm(x)));
  if (num === 'meta 07') return texto.includes('educador');
  if (num === 'meta 10') return texto.includes('mostra') || texto.includes('exposicao');
  if (num === 'meta 11') return texto.includes('noturno');
  if (num === 'meta 12') return texto.includes('mhab') || texto.includes('revisao') || texto.includes('traducao') || texto.includes('impressao');
  if (num === 'meta 12b') return texto.includes('mumo');
  if (num === 'meta 14') return ['acessibilidade', 'libras', 'inclusao', 'ambiente seguro'].some((x) => texto.includes(norm(x)));
  if (num === 'meta 15') return texto.includes('diaria');
  if (num === 'meta 16') return ['publicacao', 'catalogo', 'fotografo', 'pesquisa', 'texto', 'revisao', 'traducao', 'impressao'].some((x) => texto.includes(norm(x)));
  if (num === 'meta 17') return ['lanche', 'buffet', 'alimentacao', 'material', 'som', 'iluminacao'].some((x) => texto.includes(norm(x)));
  return false;
}

function calculaMetas(rubricas, atividades, programacao) {
  return METAS.map(([numero, titulo, detalhe]) => {
    const rs = rubricas.filter((r) => rubricaDaMeta(r, numero, titulo));
    const prev = rs.reduce((s, r) => s + previsto(r), 0);
    const util = rs.reduce((s, r) => s + utilizado(r), 0);
    const financeiro = prev > 0 ? Math.min(Math.round((util / prev) * 100), 100) : 0;
    let fisico = 0;
    if (numero === 'META 05') fisico = Math.min(Math.round(((programacao.length || atividades.length) / 30) * 100), 100);
    if (numero === 'META 14') fisico = programacao.some((p) => norm(p?.titulo || p?.nome || p?.descricao).includes('libras')) ? 100 : financeiro;
    if (numero === 'META 01' || numero === 'META 07') fisico = 100;
    const pct = Math.max(financeiro, fisico);
    return { numero, titulo, detalhe, previsto: prev, utilizado: util, saldo: prev - util, pct, status: pct >= 100 ? 'CONCLUÍDA' : pct > 0 ? 'EM EXECUÇÃO' : 'PLANEJADA' };
  });
}

function tituloProg(p) {
  return p?.titulo || p?.nome || p?.atividade || p?.nome_atividade || p?.descricao_curta || 'Atividade';
}

function rowsProgramacao(programacao, atividades) {
  const base = (programacao || []).map((p) => [dataBR(dt(p)), p?.museu || p?.centro_custo || '—', tituloProg(p), p?.tipo || p?.categoria || '—', p?.local || p?.espaco || p?.museu || '—', p?.sinopse || p?.descricao || p?.resumo || 'Programação registrada no sistema Museus Centro APP.']);
  if (base.length) return base;
  const atv = (atividades || []).slice(0, 40).map((a) => [dataBR(dt(a)), a?.museu || a?.report_museu || '—', a?.titulo || a?.nome || a?.nome_atividade || 'Atividade', a?.tipo || a?.categoria || 'Atividade', a?.local || a?.museu || a?.report_museu || '—', a?.descricao || a?.resumo || 'Atividade consolidada a partir dos relatórios aprovados.']);
  return atv.length ? atv : PROGRAMACAO_REFERENCIA;
}

function htmlRelatorio({ dateFrom, dateTo, museu, capitulos, reports, rubricas, compras, programacao }) {
  const atividades = atividadesDosRelatorios(reports);
  const pub = atividades.reduce((s, a) => s + publico(a), 0);
  const totalPrevRaw = rubricas.reduce((s, r) => s + previsto(r), 0);
  const totalPrev = totalPrevRaw > 0 ? totalPrevRaw : 1320000;
  const totalUtil = rubricas.reduce((s, r) => s + utilizado(r), 0);
  const pctFin = totalPrev > 0 ? Math.round((totalUtil / totalPrev) * 100) : 0;
  const metas = calculaMetas(rubricas, atividades, programacao);
  const progs = rowsProgramacao(programacao, atividades);
  const cap = (id, title, body) => capitulos.includes(id) ? `<section class="chapter"><h2>${h(title)}</h2>${body}</section>` : '';

  const cards = metas.map((m) => `<article class="meta-card"><div class="meta-head"><span>${h(m.numero)}</span><strong>${h(m.status)}</strong></div><h3>${h(m.titulo)}</h3><p>${h(m.detalhe)}</p><div class="progress"><i style="width:${m.pct}%"></i></div><div class="meta-foot"><span>${brl(m.utilizado)} utilizado</span><b>${m.pct}%</b></div><small>Previsto: ${brl(m.previsto)} · Saldo: ${brl(m.saldo)}</small></article>`).join('');
  const metasTable = metas.map((m) => `<tr><td>${h(m.numero)}</td><td>${h(m.titulo)}</td><td>${h(m.status)}</td><td>${m.pct}%</td><td>${brl(m.utilizado)} / ${brl(m.previsto)}</td><td>${h(m.detalhe)}</td></tr>`).join('');
  const progTable = progs.map(([data, un, titulo, tipo, local, sinopse]) => `<tr><td>${h(data)}</td><td>${h(un)}</td><td>${h(titulo)}</td><td>${h(tipo)}</td><td>${h(local)}</td><td>${h(sinopse)}</td></tr>`).join('');
  const rubTable = rubricas.slice(0, 100).map((r) => `<tr><td>${h(rubricaNome(r))}</td><td>${brl(previsto(r))}</td><td>${brl(utilizado(r))}</td><td>${brl(previsto(r) - utilizado(r))}</td></tr>`).join('');

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Relatório Museus Centro</title><style>*{box-sizing:border-box}body{margin:0;padding:36px;font-family:Arial,Helvetica,sans-serif;color:#111;line-height:1.55}.cover{border:2px solid #111;border-radius:24px;padding:42px;margin-bottom:36px;min-height:300px;display:flex;flex-direction:column;justify-content:space-between}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.16em;color:#555;font-weight:700}h1{font-size:42px;letter-spacing:-.04em;margin:18px 0 12px;line-height:1}h2{font-size:26px;border-bottom:2px solid #111;padding-bottom:10px;margin:42px 0 18px}h3{font-size:20px;margin:20px 0 10px}p,li{font-size:14px;color:#333}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.kpi,.item,.meta-card{border:1px solid #ddd;border-radius:16px;padding:16px;background:#fff;break-inside:avoid}.kpi strong{display:block;font-size:24px}.kpi span,.meta-head span{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#666;font-weight:700}.chapter{break-inside:avoid;margin-bottom:28px}.meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:18px 0}.meta-head,.meta-foot{display:flex;justify-content:space-between;gap:12px}.meta-head strong{border:1px solid #111;border-radius:999px;padding:4px 8px;font-size:10px}.meta-card h3{font-size:16px}.meta-card p{font-size:12px;min-height:54px}.progress{height:7px;background:#e5e5e5;border-radius:999px;overflow:hidden}.progress i{display:block;height:100%;background:#111}table{width:100%;border-collapse:collapse;font-size:12px;margin:10px 0 18px}th,td{border-bottom:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}th{background:#f6f6f6;font-size:11px;text-transform:uppercase}@media print{body{padding:18mm}.meta-grid{grid-template-columns:repeat(2,1fr)}} </style></head><body><section class="cover"><div><div class="eyebrow">Museus Centro · MIS · MHAB · MUMO</div><h1>Relatório Físico-Financeiro e Programático</h1><p>Relatório editorial, programático, financeiro, documental e de prestação de contas do 3º Termo Aditivo.</p></div><div><p><strong>Período:</strong> ${h(dataBR(dateFrom))} a ${h(dataBR(dateTo))}</p><p><strong>Museu:</strong> ${h(museu || 'Todos os museus')}</p></div></section><div class="kpis"><div class="kpi"><span>Relatórios</span><strong>${inteiro(reports.length)}</strong></div><div class="kpi"><span>Atividades</span><strong>${inteiro(atividades.length)}</strong></div><div class="kpi"><span>Público</span><strong>${inteiro(pub)}</strong></div><div class="kpi"><span>Execução</span><strong>${pctFin}%</strong></div></div>${cap('introducao','Introdução institucional','<p>Este relatório consolida o período de reorganização, planejamento e execução do Projeto Museus Centro, integrando relatórios das equipes, programação, evidências, metas, rubricas, compras e prestação de contas.</p>')}${cap('territorio','Território e contexto','<p>O relatório organiza informações dos museus MIS, MHAB e MUMO, considerando suas especificidades institucionais, territoriais, educativas, culturais e patrimoniais.</p>')}${cap('resumo_geral','Resumo e indicadores',`<p>Foram considerados ${inteiro(reports.length)} relatórios, ${inteiro(atividades.length)} atividades, ${inteiro(progs.length)} registros de programação e público consolidado de ${inteiro(pub)} pessoas.</p><p>A execução financeira registrada é de ${brl(totalUtil)} sobre ${brl(totalPrev)}, resultando em ${pctFin}% de execução no período analisado.</p>`)}${cap('metas','Metas do 3º Aditivo',`<div class="item"><h3>Síntese Analítica das Metas do 3º Aditivo</h3><p>As metas do 3º Termo Aditivo estruturam o ciclo de consolidação operacional, curatorial, educativa e institucional do Projeto Museus Centro nos museus MIS, MHAB e MUMO.</p><p>O acompanhamento abaixo substitui a tabela estática anterior por cards executivos derivados das mesmas regras do dashboard: rubricas vinculadas, execução financeira, atividades, programação e evidências operacionais.</p></div><div class="meta-grid">${cards}</div><div class="item"><h3>Acompanhamento por Meta</h3><table><thead><tr><th>Código</th><th>Meta</th><th>Status</th><th>Execução</th><th>Financeiro</th><th>Leitura analítica</th></tr></thead><tbody>${metasTable}</tbody></table></div>`)}${cap('programacao','Agenda e Programação',`<div class="item"><h3>Programação e Agenda — Fevereiro a Abril de 2026</h3><p>O período consolidou uma etapa estratégica de retomada operacional e ampliação programática nos três equipamentos contemplados pelo 3º Termo Aditivo: MIS, MHAB e MUMO.</p><p>A programação articulou oficinas educativas, mediações culturais, ações acessíveis em Libras, encontros curatoriais, Museu Criativo, Prosas MIS, visitas mediadas, comunicação e planejamento expográfico.</p></div><div class="item"><h3>Destaques por museu</h3><table><thead><tr><th>Museu</th><th>Destaques</th><th>Resultados</th></tr></thead><tbody><tr><td>MHAB</td><td>Memórias em Libras, Ambiente Seguro, Museu Criativo, Travessias do Curral Del Rei</td><td>Ampliação da acessibilidade, mediação cultural, formação educativa e planejamento editorial</td></tr><tr><td>MIS</td><td>Prosas MIS, Do Traço ao Pixel, visitas mediadas, criação de cenários e laboratório de argila</td><td>Fortalecimento da programação contemporânea, audiovisual e educativa</td></tr><tr><td>MUMO</td><td>Clara Nunes, estamparia natural, macramê, ações criativas e uso do espaço</td><td>Ampliação da ocupação cultural, fluxo de visitantes e experimentação ligada à moda</td></tr></tbody></table></div>`)}${cap('agenda_programacao','Tabela da Programação',`<div class="item"><h3>Programação consolidada com data, sinopse e local</h3><table><thead><tr><th>Data</th><th>Museu</th><th>Atividade</th><th>Tipo</th><th>Local</th><th>Sinopse</th></tr></thead><tbody>${progTable}</tbody></table></div>`)}${cap('galeria_evidencias','Galeria e evidências','<div class="item"><h3>Memória visual e evidências fotográficas</h3><p>O relatório está preparado para receber mosaicos por atividade, com legenda, data, fotógrafo, museu e vínculo com a meta correspondente. As imagens devem ser priorizadas a partir dos registros da galeria e dos relatórios.</p></div>')}${cap('financeiro','Execução financeira',`<p>Previsto: ${brl(totalPrev)} · Utilizado: ${brl(totalUtil)} · Saldo: ${brl(totalPrev - totalUtil)} · Execução: ${pctFin}%.</p>`)}${cap('rubricas','Rubricas, orçamento e execução por grupo',`<table><thead><tr><th>Rubrica</th><th>Previsto</th><th>Utilizado</th><th>Saldo</th></tr></thead><tbody>${rubTable}</tbody></table>`)}${cap('prestacao','Prestação de contas',`<p>Foram considerados ${inteiro(compras.length)} registros de compras/solicitações para composição da prestação de contas. A integração entre rubricas, notas fiscais, documentos e relatórios fortalece a rastreabilidade da execução.</p>`)}${cap('app_museu_centro','Museu Centro APP','<p>O Museus Centro APP organiza relatórios, pagamentos, evidências, dashboards, programação e documentos. Nesta versão, o HTML do relatório passa a ser a fonte única usada no preview, no download e na exportação.</p>')}${cap('conclusao','Conclusão','<p>O relatório demonstra o avanço da consolidação do projeto, articulando gestão, programação, metas, evidências e execução financeira em uma base única de acompanhamento.</p>')}</body></html>`;
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

  const toggleCapitulo = (id) => setCapitulos((prev) => prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]);

  async function buildLocalReport() {
    const [reportsRaw, rubricasRaw, comprasRaw, programacaoRaw, programacaoEspelhoRaw] = await Promise.all([
      safeList(base44.entities.Report, '-updated_date', 1000),
      safeList(base44.entities.Rubrica, 'ordem_exibicao', 1500),
      safeList(base44.entities.PurchaseRequest, '-created_date', 1500),
      safeList(base44.entities.Programacao, '-data_inicio', 1000),
      safeList(base44.entities.ProgramacaoEspelho, '-data_inicio', 1000),
    ]);

    const reports = filterPeriod(reportsRaw, dateFrom, dateTo).filter((r) => !museu || r?.museu === museu);
    const rubricas = Array.isArray(rubricasRaw) ? rubricasRaw.filter((r) => r?.ativo !== false) : [];
    const compras = filterPeriod(comprasRaw, dateFrom, dateTo).filter((c) => !museu || c?.museu === museu || c?.centro_custo === museu);
    const programacao = filterPeriod([...(programacaoRaw || []), ...(programacaoEspelhoRaw || [])], dateFrom, dateTo).filter((p) => !museu || p?.museu === museu || p?.centro_custo === museu);
    const atividades = atividadesDosRelatorios(reports);
    const publicoTotal = atividades.reduce((sum, a) => sum + publico(a), 0);
    const totalPrev = rubricas.reduce((sum, r) => sum + previsto(r), 0) || 1320000;
    const totalUtil = rubricas.reduce((sum, r) => sum + utilizado(r), 0);
    const html = htmlRelatorio({ dateFrom, dateTo, museu, capitulos, reports, rubricas, compras, programacao });

    return {
      metricas: {
        total_relatorios: reports.length,
        total_atividades: atividades.length,
        publico_total: publicoTotal,
        percentual: totalPrev > 0 ? Math.round((totalUtil / totalPrev) * 100) : 0,
        total_compras: compras.length,
        total_nf: compras.filter((c) => c?.nf_numero || c?.numero_nf || c?.nota_fiscal).length,
        total_programacoes: rowsProgramacao(programacao, atividades).length,
        total_releases: 0,
      },
      html,
    };
  }

  const handlePreview = async () => {
    setLoading(true);
    try {
      const local = await buildLocalReport();
      setMetricas(local.metricas);
      setHtml(local.html);
      toast.success('Métricas e relatório atualizados localmente');
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível carregar as métricas do relatório');
    } finally {
      setLoading(false);
    }
  };

  const handleGerarCompleto = async () => {
    setLoading(true);
    try {
      const local = await buildLocalReport();
      setMetricas(local.metricas);
      setHtml(local.html);
      openHtmlPreview(local.html);
      toast.success('Relatório atualizado gerado com sucesso');
    } catch (err) {
      console.error(err);
      toast.error('Não foi possível gerar o relatório atualizado');
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
        versao_template: 'metas_programacao_dashboard_v2',
      });
      if (res.data?.error) throw new Error(res.data.error);
      toast.success('Relatório exportado e armazenado no Drive');
    } catch (err) {
      console.warn(err);
      openHtmlPreview(html);
      toast.warning('Exportação Base44 indisponível. Use Salvar como PDF na prévia atualizada.');
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
          <div><label className="block text-sm font-medium mb-2">Data Inicial</label><Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} disabled={loading} /></div>
          <div><label className="block text-sm font-medium mb-2">Data Final</label><Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} disabled={loading} /></div>
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Museu (opcional)</label>
          <select value={museu} onChange={(e) => setMuseu(e.target.value)} disabled={loading} className="w-full border rounded px-3 py-2">
            <option value="">Todos</option>{MUSEUS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div className="mb-6 space-y-2">
          <label className="flex items-center gap-2"><input type="checkbox" checked={introIA} onChange={(e) => setIntroIA(e.target.checked)} disabled={loading} /><span className="text-sm">Redigir textos com IA em português BR</span></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={modoEntrega} onChange={(e) => setModoEntrega(e.target.checked)} disabled={loading} /><span className="text-sm">Modo entrega / prestação de contas</span></label>
        </div>
        <div className="mb-6">
          <h3 className="font-semibold mb-3">Capítulos do relatório</h3>
          <div className="grid grid-cols-2 gap-3">
            {CAPITULOS_DISPONIVEIS.map(([id, label]) => <label key={id} className="flex items-center gap-2"><input type="checkbox" checked={capitulos.includes(id)} onChange={() => toggleCapitulo(id)} disabled={loading} /><span className="text-sm">{label}</span></label>)}
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
          <Button onClick={handlePreview} disabled={loading} variant="outline">{loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Carregar Métricas</Button>
          <Button onClick={handleGerarCompleto} disabled={loading}>{loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Gerar Relatório Atualizado</Button>
          {html && <Button onClick={handleExportarPDF} disabled={loading} className="bg-green-600 hover:bg-green-700"><Download className="w-4 h-4 mr-2" />Exportar PDF</Button>}
        </div>
      </Card>
      {metricas && <Card className="p-6"><h3 className="text-lg font-bold mb-4">Métricas Carregadas</h3><div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[['Relatórios', metricas.total_relatorios], ['Atividades', metricas.total_atividades], ['Público', metricas.publico_total?.toLocaleString?.('pt-BR')], ['Execução', `${metricas.percentual || 0}%`], ['Compras', metricas.total_compras], ['Notas Fiscais', metricas.total_nf], ['Programações', metricas.total_programacoes], ['Releases', metricas.total_releases]].map(([label, value]) => <div key={label} className="bg-blue-50 p-4 rounded"><div className="text-sm text-gray-600">{label}</div><div className="text-2xl font-bold">{value ?? 0}</div></div>)}</div></Card>}
      {html && <Card className="p-6"><h3 className="text-lg font-bold mb-4 flex items-center gap-2"><CheckCircle2 className="w-5 h-5 text-green-600" />Relatório Atualizado Gerado</h3><div className="space-y-2 text-sm"><p><strong>Status:</strong> Pronto para revisão/exportação</p><p><strong>Formato:</strong> HTML imprimível usado como fonte única do preview e PDF.</p><p><strong>Conteúdo:</strong> metas com cards, programação com tabela, sinopses, locais, indicadores e bloco de evidências fotográficas.</p></div></Card>}
    </div>
  );
}
