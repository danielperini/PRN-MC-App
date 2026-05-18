import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, Download, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import buildRelatorioFisicoFinanceiroContext from '@/utils/buildRelatorioFisicoFinanceiroContext';
import montarHtmlRelatorioFisicoFinanceiro from '@/utils/relatorioFisicoFinanceiroTemplate';
import gerarTextosRelatorioFisicoFinanceiro from '@/services/relatorioIAService';

const MUSEUS = ['Todos', 'MIS', 'MHAB', 'MUMO'];

const SECOES_RELATORIO = [
  'capa',
  'introducao',
  'territorio',
  'resumo_geral',
  'publico',
  'metas',
  'programacao',
  'agenda_programacao',
  'atividades_museu',
  'relatorios_completos',
  'galeria_evidencias',
  'comunicacao',
  'financeiro',
  'rubricas',
  'prestacao',
  'app_museu_centro',
  'conclusao',
];

async function safeList(entity, order = '-created_date', limit = 1000) {
  try {
    if (!entity?.list) return [];
    const res = await entity.list(order, limit);
    return Array.isArray(res) ? res : [];
  } catch (error) {
    console.warn('Falha ao listar entidade do relatório:', error);
    return [];
  }
}

async function carregarBaseConhecimento() {
  const candidatos = [
    base44?.entities?.BaseConhecimento,
    base44?.entities?.KnowledgeBase,
    base44?.entities?.KnowledgeItem,
    base44?.entities?.ProjectKnowledge,
  ].filter(Boolean);

  for (const entity of candidatos) {
    const lista = await safeList(entity, '-updated_date', 500);
    if (lista.length > 0) return lista;
  }

  return [];
}

function salvarPreview(html) {
  try {
    sessionStorage.setItem('relatorio_fisico_financeiro_html', html);
  } catch (error) {
    console.warn('Não foi possível salvar a prévia do relatório:', error);
  }
}

async function gerarRelatorioDoApp(museu) {
  const dateFrom = '2026-02-02';
  const dateTo = '2026-04-30';
  const museuFiltro = museu === 'Todos' ? 'todos' : museu;

  const [
    reportsRaw,
    rubricasRaw,
    comprasRaw,
    attachmentsRaw,
    programacaoRaw,
    conhecimentoRaw,
  ] = await Promise.all([
    safeList(base44.entities.Report, '-updated_date', 2000),
    safeList(base44.entities.Rubrica, 'ordem_exibicao', 2000),
    safeList(base44.entities.PurchaseRequest, '-created_date', 2000),
    safeList(base44.entities.Attachment, '-created_date', 3000),
    safeList(base44.entities.Programacao, '-data_inicio', 3000),
    carregarBaseConhecimento(),
  ]);

  const contexto = buildRelatorioFisicoFinanceiroContext({
    reportsRaw,
    rubricasRaw,
    comprasRaw,
    attachmentsRaw,
    programacaoRaw,
    conhecimentoRaw,
    filtros: {
      dateFrom,
      dateTo,
      museu: museuFiltro,
      capitulos: SECOES_RELATORIO,
    },
  });

  const contextoComEstrategia = {
    ...contexto,
    secoesSelecionadas: SECOES_RELATORIO,
  };

  const textos = await gerarTextosRelatorioFisicoFinanceiro(
    contextoComEstrategia,
    true
  );

  const html = montarHtmlRelatorioFisicoFinanceiro({
    contexto: contextoComEstrategia,
    textos,
    secoesSelecionadas: SECOES_RELATORIO,
    filtros: {
      dateFrom,
      dateTo,
      museu: museu === 'Todos' ? 'Todos os museus' : museu,
    },
  });

  return { html, contexto: contextoComEstrategia };
}

const IMG = {
  capa: 'https://images.unsplash.com/photo-1518998053901-5348d3961a04?q=80&w=1600&auto=format&fit=crop',
  mis: 'https://images.unsplash.com/photo-1511578314322-379afb476865?q=80&w=1200&auto=format&fit=crop',
  mhab: 'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1200&auto=format&fit=crop',
  mumo: 'https://images.unsplash.com/photo-1529156069898-49953e39b3ac?q=80&w=1200&auto=format&fit=crop',
  publico: 'https://images.unsplash.com/photo-1515169067865-5387ec356754?q=80&w=1200&auto=format&fit=crop'
};

function bar(label, value, max = 100) {
  const width = Math.max(0, Math.min(100, Math.round((value / max) * 100)));
  return `<div class="chart-row"><span>${label}</span><b>${value}</b><i><em style="width:${width}%"></em></i></div>`;
}

function money(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
}

function buildCompleteReportHtml(museu) {
  const museuLabel = museu === 'Todos' ? 'MIS · MHAB · MUMO' : museu;
  const total = 1320000;
  const usado = 220185.07;
  const saldo = total - usado;
  const exec = 16.7;

  const metas = [
    ['META 01', 'Equipe principal', 'EM EXECUÇÃO', 70, 'Equipe de coordenação, produção, comunicação, administrativo e apoio técnico em operação.'],
    ['META 05', 'Atividades educativas e culturais', 'EM EXECUÇÃO', 86, 'Oficinas, mediações, Museu Criativo, Prosas MIS e ações de formação de público.'],
    ['META 07', 'Educadores', 'EM EXECUÇÃO', 65, 'Contratação e atuação educativa vinculada aos três museus do projeto.'],
    ['META 11', 'Noturno nos Museus', 'PRÉ-PRODUÇÃO', 20, 'Visitas técnicas, infraestrutura, planejamento executivo e preparação para evento de maior escala.'],
    ['META 14', 'Acessibilidade', 'CONCLUÍDA', 100, 'Ações em Libras, ambiente seguro, diversidade, inclusão e mediações acessíveis.'],
    ['META 16', 'Publicações', 'EM EXECUÇÃO', 35, 'Pesquisa, texto, revisão, comunicação visual, fotografia e preparação editorial.']
  ];

  const programacao = [
    ['07/03/2026','MUMO','Experimentação em Estamparia Natural','Oficina','Experimentação artística com flores, folhas, tecidos e papéis.'],
    ['08/03/2026','MHAB','Mulheres que Ecoam Histórias','Museu Criativo','Oficina de expressão visual sobre memória, mulheres e narrativas.'],
    ['21/03/2026','MUMO','Clara Nunes — Eu Sou a Tal Mineira','Mediação','Visita mediada sobre moda, música, cultura popular e identidade brasileira.'],
    ['27/03/2026','MIS','Prosas MIS — Animadoras Mineiras em Foco','Conversa','Roda de conversa sobre mulheres na animação brasileira.'],
    ['14/04/2026','MHAB','Ambiente Seguro, Diversidade e Inclusão','Formação','Formação interna para equipes, servidores e colaboradores.'],
    ['25/04/2026','MHAB','Memórias em Libras de Belo Horizonte','Acessibilidade','Encontro em Libras com público surdo, memória urbana e visita mediada.'],
    ['25/04/2026','MIS','Oficina — Criação de Cenários','Oficina','Oficina de criação visual e construção de cenários.'],
    ['30/04/2026','MIS','A Poética da Argila em Movimento','Laboratório','Experimentação visual e material com argila, imagem e movimento.']
  ];

  const rubricas = [
    ['Educador MIS / MUMO / MHAB',138000,41400,30],['Produção MIS/MUMO/MHAB',113400,33600,29.6],['Coordenador Geral',70000,21000,30],['Designer',52000,15500,29.8],['Assistente de Coordenação e Produção',50000,15000,30],['Coordenador de Comunicação',60000,12000,20],['Consultoria de programação',30000,12000,40],['Formação Ambiente Seguro',2500,2500,100],['Material de escritório',2700,2700,100],['Ações educativo-culturais',90000,0,0],['Exposição MUMO',210000,0,0],['Noturno nos Museus — Vans',30400,0,0]
  ];

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Relatório Institucional — Museus Centro</title><style>
@page{margin:2.2cm 1.8cm}*{box-sizing:border-box}body{font-family:Helvetica Neue,Arial,sans-serif;color:#151515;font-size:11.5px;line-height:1.72;background:#fff;margin:0}h1{font-size:38px;margin:0 0 10px;letter-spacing:-.7px}h2{font-size:18px;border-bottom:2.5px solid #111;padding-bottom:7px;margin:46px 0 18px;counter-increment:section}h2:before{content:counter(section,decimal-leading-zero) '. ';color:#777;font-size:12px;font-weight:400}h3{font-size:13px;margin:20px 0 8px}p{margin:0 0 14px;text-align:justify}table{width:100%;border-collapse:collapse;margin:16px 0;font-size:10px}th{background:#111;color:white;padding:7px 10px;text-align:left;text-transform:uppercase;font-size:9px;letter-spacing:.08em}td{padding:6px 10px;border-bottom:1px solid #eee;vertical-align:top}tr:nth-child(even) td{background:#fafafa}.capa{min-height:420px;padding:80px 42px 60px;color:white;text-align:center;page-break-after:always;position:relative;overflow:hidden;background:#111}.capa:before{content:'';position:absolute;inset:0;background:url('${IMG.capa}') center/cover;opacity:.34}.capa:after{content:'';position:absolute;inset:0;background:linear-gradient(135deg,rgba(8,8,12,.82),rgba(24,15,65,.78),rgba(8,8,12,.92))}.capa-content{position:relative;z-index:2}.subtitle{color:rgba(255,255,255,.72);font-size:15px;margin:6px 0}.kpis-capa{display:flex;justify-content:center;margin-top:34px;padding-top:24px;border-top:1px solid rgba(255,255,255,.15);flex-wrap:wrap}.kpi-c{padding:0 24px;border-right:1px solid rgba(255,255,255,.12)}.kpi-c:last-child{border-right:0}.kpi-c .val{font-size:26px;font-weight:800;display:block}.kpi-c .lbl{font-size:9px;text-transform:uppercase;letter-spacing:.18em;color:rgba(255,255,255,.5)}.secao{page-break-before:always;counter-reset:none}.sumario ol{list-style:none;padding:0}.sumario li{display:flex;gap:12px;border-bottom:1px dotted #ddd;padding:8px 0}.num{color:#999;min-width:26px}.kpi-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:20px 0}.kpi{background:#f7f7f7;border:1px solid #e8e8e8;border-radius:7px;padding:14px}.kpi.dark{background:#111;color:white}.kpi .val{font-size:22px;font-weight:800;display:block}.kpi .lbl{font-size:9px;color:#888;text-transform:uppercase;letter-spacing:.12em}.badge{display:inline-block;background:#111;color:#fff;border-radius:3px;padding:2px 7px;font-size:9px;font-weight:700}.badge.green{background:#166534}.badge.amber{background:#92400e}.progress-bar{background:#eee;border-radius:4px;height:8px;overflow:hidden;margin:8px 0}.progress-fill{height:8px;background:#111}.destaque-box{background:#f5f5f5;border-left:3px solid #111;padding:14px 18px;margin:20px 0;border-radius:0 6px 6px 0}.analise-ia{background:#fafafa;border:1px solid #e5e5e5;border-radius:7px;padding:12px 16px;margin:12px 0;color:#555}.foto-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:13px;margin:16px 0}.foto-item{break-inside:avoid;border:1px solid #eee;border-radius:8px;overflow:hidden;background:#fff}.foto{width:100%;height:150px;object-fit:cover;display:block}.foto-legenda{font-size:9px;color:#777;padding:8px;line-height:1.35}.chart{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0}.chart-box{border:1px solid #e5e5e5;border-radius:8px;padding:14px;background:#fafafa}.chart-row{display:grid;grid-template-columns:80px 42px 1fr;gap:8px;align-items:center;margin:8px 0;font-size:10px}.chart-row i{height:8px;background:#e4e4e4;border-radius:5px;overflow:hidden}.chart-row em{display:block;height:8px;background:#111}.donut{width:130px;height:130px;border-radius:50%;background:conic-gradient(#111 0 16.7%,#e5e5e5 16.7% 100%);margin:8px auto;position:relative}.donut:after{content:'16,7%';position:absolute;inset:22px;background:#fafafa;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px}.quote{background:#111;color:#fff;border-radius:10px;padding:22px;margin:22px 0}.rodape{font-size:9px;color:#aaa;text-align:center;margin-top:48px;border-top:1px solid #eee;padding-top:12px}@media print{.secao{page-break-before:always}.foto-item,.kpi,.chart-box,tr{page-break-inside:avoid}h2,h3{page-break-after:avoid}}
</style></head><body><div class="capa"><div class="capa-content"><div style="font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(255,255,255,.45);margin-bottom:16px">Museus Centro · Relatório Institucional Consolidado · 2026</div><h1>Relatório Físico-Financeiro</h1><div class="subtitle">Projeto Museus Centro</div><div class="subtitle">02/02/2026 a 30/04/2026</div><div class="subtitle" style="font-size:13px;color:rgba(255,255,255,.55)">${museuLabel}</div><div class="kpis-capa"><div class="kpi-c"><span class="val">21</span><span class="lbl">Relatórios</span></div><div class="kpi-c"><span class="val">4.218</span><span class="lbl">Público</span></div><div class="kpi-c"><span class="val">79</span><span class="lbl">Atividades</span></div><div class="kpi-c"><span class="val">16,7%</span><span class="lbl">Execução</span></div><div class="kpi-c"><span class="val">31</span><span class="lbl">Prog.</span></div><div class="kpi-c"><span class="val">19</span><span class="lbl">Equipe</span></div></div><div style="font-size:10px;color:rgba(255,255,255,.38);margin-top:28px;letter-spacing:.15em;text-transform:uppercase">MIS · MHAB · MUMO · Viaduto das Artes · Noturno nos Museus</div></div></div>
<div class="sumario secao"><h2 style="counter-increment:none">Sumário</h2><ol>${['Introdução Institucional','Metas do 3º Aditivo','Agenda e Programação','Relatórios das Equipes','Comunicação e Visibilidade','Execução Financeira','Rubricas Orçamentárias','Território e Contexto Cultural','Conclusão'].map((x,i)=>`<li><span class="num">${String(i+1).padStart(2,'0')}</span><span>${x}</span></li>`).join('')}</ol></div>
<div class="secao"><h2>Introdução Institucional</h2><p>O presente relatório físico-financeiro abrange o período de 02 de fevereiro a 30 de abril de 2026, correspondente à fase inicial de execução do 3º Termo Aditivo do Projeto Museus Centro, realizado em parceria com a Diretoria de Museus da Fundação Municipal de Cultura de Belo Horizonte. O período foi marcado por transição relevante na estrutura de gestão e pela retomada progressiva das atividades nos três museus contemplados: MIS, MHAB e MUMO.</p><p>Este documento consolida 21 relatórios aprovados, 79 atividades registradas e público total de 4.218 pessoas. O conjunto revela um projeto em fase de reativação qualificada, com reorganização administrativa, fortalecimento de rituais de gestão, integração entre produção, educativo, comunicação e coordenação técnica, e preparação para o ciclo de maior intensidade previsto para o segundo semestre.</p><div class="destaque-box"><p>A adoção do Museu Centro APP qualifica a rastreabilidade das entregas, integra documentos, relatórios, rubricas e evidências, e transforma a prestação de contas em instrumento de gestão e memória institucional.</p></div><div class="foto-grid"><div class="foto-item"><img class="foto" src="${IMG.mis}"/><div class="foto-legenda">MIS — memória audiovisual, Prosas MIS e atividades educativas.</div></div><div class="foto-item"><img class="foto" src="${IMG.mhab}"/><div class="foto-legenda">MHAB — memória urbana, formação e mediação histórica.</div></div><div class="foto-item"><img class="foto" src="${IMG.mumo}"/><div class="foto-legenda">MUMO — moda, experimentação criativa e identidade cultural.</div></div></div></div>
<div class="secao"><h2>Metas do 3º Aditivo</h2><p>As metas MC3A-20 a MC3A-25 estruturam a lógica de execução do 3º Aditivo em ciclos progressivos. O período analisado correspondeu a uma fase de consolidação operacional, não de pico de execução, com forte ênfase em equipe, planejamento, programação educativa, comunicação e pré-produção do Noturno nos Museus.</p><div class="kpi-grid">${metas.map(m=>`<div class="kpi"><span class="lbl">${m[0]} · ${m[2]}</span><span class="val">${m[3]}%</span><div class="progress-bar"><div class="progress-fill" style="width:${m[3]}%"></div></div><strong>${m[1]}</strong><p style="font-size:10px;text-align:left;margin-top:8px">${m[4]}</p></div>`).join('')}</div><div class="analise-ia">Leitura IA: a execução física avançou mais rapidamente do que a execução financeira, o que indica ciclo inicial de estruturação, com despesas de maior escala previstas para exposições, infraestrutura e Noturno nos Museus.</div></div>
<div class="secao"><h2>Agenda e Programação</h2><p>As 31 programações registradas revelam uma retomada estruturada após a pausa operacional de fevereiro. A programação articulou oficinas, visitas mediadas, eventos de debate curatorial, acessibilidade, formação e ações de manutenção e infraestrutura.</p><div class="chart"><div class="chart-box"><h3>Distribuição de público</h3>${bar('MUMO',2575,2575)}${bar('MIS',954,2575)}${bar('MHAB',689,2575)}</div><div class="chart-box"><h3>Atividades por museu</h3>${bar('MHAB',24,24)}${bar('MUMO',21,24)}${bar('MIS',7,24)}</div></div><table><thead><tr><th>Data</th><th>Museu</th><th>Atividade</th><th>Tipo</th><th>Sinopse</th></tr></thead><tbody>${programacao.map(p=>`<tr><td>${p[0]}</td><td>${p[1]}</td><td><strong>${p[2]}</strong></td><td>${p[3]}</td><td>${p[4]}</td></tr>`).join('')}</tbody></table></div>
<div class="secao"><h2>Relatórios das Equipes</h2><p>Os 21 relatórios aprovados revelam estrutura de equipe distribuída, multifuncional e com coberturas diferenciadas por museu e natureza de atuação. A cobertura alcança os três equipamentos de forma não homogênea, refletindo maturidade dos fluxos educativos e disponibilidade operacional em cada espaço.</p><div class="kpi-grid"><div class="kpi"><span class="val">21</span><span class="lbl">Relatórios aprovados</span></div><div class="kpi"><span class="val">19</span><span class="lbl">Profissionais</span></div><div class="kpi dark"><span class="val">3</span><span class="lbl">Museus integrados</span></div></div><p>A granularidade dos registros — de reuniões semanais a roteiros de cobertura audiovisual, visitas técnicas e fechamentos mensais — permite rastrear tanto a execução programática quanto os processos internos de gestão que a sustentam.</p></div>
<div class="secao"><h2>Comunicação e Visibilidade</h2><p>O período registrou ausência de releases formais de imprensa, mas a produção de comunicação interna e conteúdo para redes sociais manteve ritmo consistente: roteiros de cobertura, peças editoriais, calendário de redes sociais, registros fotográficos e vídeos documentando ações educativas e culturais.</p><div class="foto-grid"><div class="foto-item"><img class="foto" src="${IMG.publico}"/><div class="foto-legenda">Cobertura de ações públicas e registros de presença.</div></div><div class="foto-item"><img class="foto" src="${IMG.mumo}"/><div class="foto-legenda">Atividades de moda e experimentação criativa.</div></div><div class="foto-item"><img class="foto" src="${IMG.mhab}"/><div class="foto-legenda">Formação, memória urbana e acessibilidade.</div></div></div><div class="destaque-box"><p>Próximo ciclo: estruturar plano de comunicação externa para Noturno nos Museus, exposições e ações de maior escala.</p></div></div>
<div class="secao"><h2>Execução Financeira</h2><div class="kpi-grid"><div class="kpi"><span class="val">${money(total)}</span><span class="lbl">Orçamento 3º Aditivo</span></div><div class="kpi dark"><span class="val">${money(usado)}</span><span class="lbl">Utilizado</span></div><div class="kpi"><span class="val">${money(saldo)}</span><span class="lbl">Saldo disponível</span></div></div><div class="chart"><div class="chart-box"><h3>Execução geral</h3><div class="donut"></div></div><div class="chart-box"><h3>Leitura financeira</h3><p>Execução de ${exec}% compatível com o cronograma: maiores investimentos concentram-se no segundo semestre, especialmente exposições, infraestrutura, manutenção especializada e Noturno nos Museus.</p></div></div><table><thead><tr><th>Rubrica</th><th>Previsto</th><th>Utilizado</th><th>Saldo</th><th>%</th></tr></thead><tbody>${rubricas.map(r=>`<tr><td><strong>${r[0]}</strong></td><td>${money(r[1])}</td><td>${money(r[2])}</td><td>${money(r[1]-r[2])}</td><td>${r[3]}%</td></tr>`).join('')}</tbody></table></div>
<div class="secao"><h2>Território e Contexto Cultural</h2><p>No cenário cultural de Belo Horizonte, MIS, MHAB e MUMO consolidam-se como dispositivos fundamentais de uma museologia territorializada. O MHAB articula memória urbana; o MIS salvaguarda patrimônio audiovisual e sensorial; o MUMO utiliza a moda como sistema de leitura das transformações sociais e culturais da cidade.</p><p>Ao articular os três museus sob estratégia integrada, o Projeto Museus Centro estabelece referência técnica para gestão de ativos culturais em áreas urbanas densas, demonstrando que preservação patrimonial, mediação cultural e uso do espaço público são dimensões inseparáveis.</p></div>
<div class="secao"><h2>Conclusão</h2><p>O trimestre configura etapa de consolidação estrutural do Projeto Museus Centro. A transição de coordenação, os rituais de planejamento, a adoção do Museu Centro APP e a atuação integrada das equipes permitiram retomar atividades e qualificar processos de gestão, documentação e prestação de contas.</p><div class="quote">O relatório demonstra que a gestão cultural pode ser exercida com método, integridade, evidência documental e profundidade analítica à altura das instituições que representa.</div><p>Os próximos meses marcarão a entrada na fase de maior intensidade programática e financeira, com exposições, produção cultural ampliada, adequações de infraestrutura e Noturno nos Museus como eixo de maior visibilidade pública.</p></div><div class="rodape">Relatório Institucional — Projeto Museus Centro — Gerado com Museu Centro APP<br/>MIS · MHAB · MUMO · Viaduto das Artes · Noturno nos Museus — parceria DEMUS/FMC-BH</div></body></html>`;
}

void buildCompleteReportHtml;

export default function RelatorioFisicoFinanceiroGenerator() {
  const [museu, setMuseu] = useState('Todos');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);

  const openPreview = (html) => {
    salvarPreview(html);
    const preview = window.open('/RelatorioPreview', '_blank', 'width=1200,height=900');
    if (preview) return null;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    return url;
  };

  const downloadHtml = (html) => {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `relatorio-museus-centro-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGerar = async () => {
    setLoading(true);
    setResultado(null);
    setErro(null);
    try {
      let data = null;
      let fonte = 'backend';

      try {
        const response = await base44.functions.invoke('gerarRelatorioFisicoFinanceiro', {
          museu: museu === 'Todos' ? null : museu,
          formato: 'abrangente',
          usar_fotos_app: true,
          incluir_relatorios_equipe: true,
          refinar_textos_ia: true,
        });

        if (response?.data?.html) {
          data = response.data;
        }
      } catch (backendError) {
        console.warn(
          'gerarRelatorioFisicoFinanceiro indisponível. Gerando no frontend com dados do app e textos refinados por IA.',
          backendError
        );
      }

      if (!data?.html) {
        const local = await gerarRelatorioDoApp(museu);
        data = { html: local.html, contexto: local.contexto };
        fonte = 'frontend_ia';
      }

      setResultado({ ...data, fonte });
      openPreview(data.html);
      toast.success(fonte === 'backend' ? 'Relatório gerado pela função evoluída.' : 'Relatório gerado com dados reais do app e IA.');
    } catch (err) {
      console.error(err);
      setErro(err.message || 'Não foi possível gerar o relatório.');
      toast.error('Não foi possível gerar o relatório.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-6"><div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center"><FileText className="w-5 h-5 text-white" /></div><div><h2 className="text-lg font-bold text-slate-900">Gerar Relatório</h2><p className="text-sm text-slate-500">Relatório institucional premium com fotos, gráficos, metas, programação e execução financeira.</p></div></div>
      <div className="mb-6"><Label>Museu</Label><Select value={museu} onValueChange={setMuseu}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{MUSEUS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent></Select></div>
      <Button onClick={handleGerar} disabled={loading} className="w-full">{loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}Gerar Relatório</Button>
      {erro && <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3"><AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" /><div><p className="text-sm font-medium text-amber-800">Não foi possível gerar o relatório</p><p className="text-xs text-amber-700 mt-1">{erro}</p></div></div>}
      {resultado && <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4"><div className="flex items-start gap-3 mb-3"><CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" /><div><p className="text-sm font-medium text-green-800">Relatório gerado com sucesso!</p><p className="text-xs text-green-700 mt-1">{resultado.fonte === 'backend' ? 'Gerado pela função gerarRelatorioFisicoFinanceiro.' : 'Gerado no frontend com dados reais do app, fotos vinculadas e refinamento textual por IA.'}</p></div></div><div className="flex gap-3 flex-wrap"><Button variant="outline" size="sm" onClick={() => openPreview(resultado.html)}><ExternalLink className="w-4 h-4 mr-2" />Abrir Relatório</Button><Button variant="outline" size="sm" onClick={() => downloadHtml(resultado.html)}><Download className="w-4 h-4 mr-2" />Baixar HTML</Button></div></div>}
    </div>
  );
}
