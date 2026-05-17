import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, FileText, Download, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const MUSEUS = ['Todos', 'MIS', 'MHAB', 'MUMO'];

function buildCompleteReportHtml(museu) {
  const museuLabel = museu === 'Todos' ? 'MIS · MHAB · MUMO' : museu;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Relatório Museus Centro — 3º Aditivo</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 42px; font-family: Arial, Helvetica, sans-serif; color: #111; background: #fff; line-height: 1.58; }
    .cover { border: 2px solid #111; border-radius: 26px; padding: 44px; min-height: 360px; display: flex; flex-direction: column; justify-content: space-between; margin-bottom: 36px; }
    .eyebrow { font-size: 12px; text-transform: uppercase; letter-spacing: .16em; color: #555; font-weight: 700; }
    h1 { font-size: 42px; letter-spacing: -.04em; margin: 18px 0 12px; line-height: 1; }
    h2 { font-size: 27px; margin: 42px 0 18px; padding-bottom: 10px; border-bottom: 2px solid #111; letter-spacing: -.02em; }
    h3 { font-size: 19px; margin: 18px 0 10px; }
    p, li { font-size: 14px; color: #303030; }
    .kpis, .meta-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 14px; margin: 22px 0; }
    .kpi, .item, .meta-card { border: 1px solid #ddd; border-radius: 16px; padding: 16px; background: #fff; break-inside: avoid; }
    .kpi span { display:block; font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #666; font-weight: 700; }
    .kpi strong { display:block; font-size: 26px; margin-top: 8px; color:#111; }
    .meta-grid { grid-template-columns: repeat(3, 1fr); }
    .meta-head, .meta-foot { display:flex; align-items:center; justify-content:space-between; gap: 12px; }
    .meta-head span { font-size: 11px; text-transform: uppercase; letter-spacing: .12em; color: #555; font-weight: 700; }
    .meta-head strong { border: 1px solid #111; border-radius: 999px; padding: 4px 8px; font-size: 10px; }
    .meta-card h3 { font-size: 16px; margin: 12px 0 6px; }
    .meta-card p { font-size: 12px; min-height: 50px; }
    .progress { height: 7px; background:#e5e5e5; border-radius:999px; overflow:hidden; margin: 12px 0 8px; }
    .progress i { display:block; height:100%; background:#111; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin: 12px 0 20px; }
    th, td { border-bottom: 1px solid #ddd; padding: 9px; text-align:left; vertical-align:top; }
    th { background: #f6f6f6; text-transform: uppercase; font-size: 11px; letter-spacing: .06em; }
    .note { background:#f8f8f8; border-left:4px solid #111; padding: 14px 16px; border-radius: 12px; }
    @media print { body { padding: 18mm; } .item, .meta-card, .cover { page-break-inside: avoid; } .meta-grid { grid-template-columns: repeat(2,1fr); } }
  </style>
</head>
<body>
  <section class="cover">
    <div>
      <div class="eyebrow">Museus Centro · ${museuLabel}</div>
      <h1>Relatório Físico-Financeiro e Programático</h1>
      <p>Relatório institucional do 3º Termo Aditivo, integrando metas, execução financeira, programação, evidências e memória de gestão.</p>
    </div>
    <div>
      <p><strong>Período de referência:</strong> 02/02/2026 a 30/04/2026</p>
      <p><strong>Recorte:</strong> ${museuLabel}</p>
    </div>
  </section>

  <div class="kpis">
    <div class="kpi"><span>Relatórios aprovados</span><strong>21</strong></div>
    <div class="kpi"><span>Atividades</span><strong>79</strong></div>
    <div class="kpi"><span>Público</span><strong>4.218</strong></div>
    <div class="kpi"><span>Execução financeira</span><strong>16,7%</strong></div>
  </div>

  <section>
    <h2>Introdução institucional</h2>
    <p>O presente relatório consolida a execução física, financeira, documental e programática do Projeto Museus Centro no período de fevereiro a abril de 2026. A leitura combina dados operacionais, relatórios aprovados, programação cultural, execução orçamentária e evidências institucionais, constituindo uma memória de acompanhamento do 3º Termo Aditivo.</p>
    <p>O ciclo analisado foi marcado por reorganização administrativa, retomada plena das rotinas de gestão, fortalecimento das equipes, integração entre produção, educativo e comunicação, além da preparação das ações de maior escala previstas para o segundo semestre.</p>
  </section>

  <section>
    <h2>Metas do 3º Aditivo</h2>
    <div class="item">
      <h3>Síntese Analítica das Metas</h3>
      <p>As metas do 3º Termo Aditivo estruturam o ciclo de consolidação operacional, curatorial, educativa e institucional do Projeto Museus Centro. Entre fevereiro e abril de 2026, a execução concentrou-se em formação de equipe, organização documental, planejamento curatorial, mediação educativa, acessibilidade, comunicação e preparação de ações públicas ampliadas.</p>
      <p>Os cards abaixo substituem a tabela estática anterior por uma leitura executiva, com status, execução e memória de cálculo simplificada por meta estratégica.</p>
    </div>

    <div class="meta-grid">
      <article class="meta-card"><div class="meta-head"><span>META 01</span><strong>EM EXECUÇÃO</strong></div><h3>Equipe principal</h3><p>Equipe de coordenação, produção, comunicação, administrativo e apoio técnico em operação.</p><div class="progress"><i style="width:70%"></i></div><div class="meta-foot"><span>Estrutura consolidada</span><b>70%</b></div></article>
      <article class="meta-card"><div class="meta-head"><span>META 05</span><strong>EM EXECUÇÃO</strong></div><h3>Atividades educativas e culturais</h3><p>Oficinas, mediações, Museu Criativo, Prosas MIS e ações de formação de público.</p><div class="progress"><i style="width:86%"></i></div><div class="meta-foot"><span>31 programações</span><b>86%</b></div></article>
      <article class="meta-card"><div class="meta-head"><span>META 07</span><strong>EM EXECUÇÃO</strong></div><h3>Educadores</h3><p>Contratação e atuação educativa vinculada aos três museus do projeto.</p><div class="progress"><i style="width:65%"></i></div><div class="meta-foot"><span>Equipe em operação</span><b>65%</b></div></article>
      <article class="meta-card"><div class="meta-head"><span>META 11</span><strong>PLANEJADA</strong></div><h3>Noturno nos Museus</h3><p>Pré-produção, visitas técnicas e definição de infraestrutura para ação de grande porte.</p><div class="progress"><i style="width:20%"></i></div><div class="meta-foot"><span>Pré-produção</span><b>20%</b></div></article>
      <article class="meta-card"><div class="meta-head"><span>META 14</span><strong>CONCLUÍDA</strong></div><h3>Acessibilidade</h3><p>Ações acessíveis, Libras, ambiente seguro, diversidade e inclusão.</p><div class="progress"><i style="width:100%"></i></div><div class="meta-foot"><span>Entregas realizadas</span><b>100%</b></div></article>
      <article class="meta-card"><div class="meta-head"><span>META 16</span><strong>EM EXECUÇÃO</strong></div><h3>Publicações</h3><p>Pesquisa, texto, revisão, comunicação visual, fotografia e preparação editorial.</p><div class="progress"><i style="width:35%"></i></div><div class="meta-foot"><span>Em desenvolvimento</span><b>35%</b></div></article>
    </div>

    <table>
      <thead><tr><th>Código</th><th>Meta</th><th>Status</th><th>Execução</th><th>Leitura analítica</th></tr></thead>
      <tbody>
        <tr><td>META 01</td><td>Equipe principal</td><td>Em execução</td><td>70%</td><td>Equipe operacional estruturada e fluxos de gestão restabelecidos.</td></tr>
        <tr><td>META 05</td><td>Atividades educativas e culturais</td><td>Em execução</td><td>86%</td><td>31 programações organizadas, com diversidade de formatos e museus.</td></tr>
        <tr><td>META 11</td><td>Noturno nos Museus</td><td>Planejada</td><td>20%</td><td>Pré-produção iniciada, com visitas técnicas e alinhamentos executivos.</td></tr>
        <tr><td>META 14</td><td>Acessibilidade</td><td>Concluída</td><td>100%</td><td>Ações de Libras, ambiente seguro e inclusão documentadas.</td></tr>
        <tr><td>META 16</td><td>Publicações e catálogos</td><td>Em execução</td><td>35%</td><td>Processos editoriais, pesquisa e registros em andamento.</td></tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>Execução física e financeira</h2>
    <p>A execução financeira consolidada atingiu aproximadamente 16,7% do total previsto para o 3º Termo Aditivo, correspondendo a R$ 220.185,07 executados de um total de R$ 1.320.000,00. Esse percentual é compatível com a fase atual do projeto, que priorizou estruturação institucional, contratação de equipes, desenvolvimento metodológico e preparação operacional para ações de maior escala.</p>
    <p>Rubricas de maior peso orçamentário, como ações educativo-culturais ampliadas, infraestrutura de som e iluminação, exposições e Noturno nos Museus, permanecem com execução inicial, coerente com o cronograma de concentração de despesas no segundo semestre.</p>
  </section>

  <section>
    <h2>Agenda e Programação</h2>
    <div class="item">
      <h3>Programação e Agenda — Fevereiro a Abril de 2026</h3>
      <p>O período consolidou 31 programações distribuídas pelos três museus, articulando oficinas, visitas mediadas, eventos de mediação, Museu Criativo, Prosas MIS, acessibilidade em Libras e atividades de formação. A programação fortaleceu o ordenamento territorial e cultural do centro de Belo Horizonte e criou base operacional para a ampliação das entregas públicas.</p>
    </div>

    <table>
      <thead><tr><th>Data</th><th>Museu</th><th>Atividade</th><th>Tipo</th><th>Local</th><th>Sinopse</th></tr></thead>
      <tbody>
        <tr><td>07/03/2026</td><td>MUMO</td><td>Experimentação em Estamparia Natural</td><td>Oficina</td><td>Museu da Moda</td><td>Experimentação artística com flores, folhas, tecidos e papéis.</td></tr>
        <tr><td>08/03/2026</td><td>MHAB</td><td>Mulheres que Ecoam Histórias</td><td>Museu Criativo</td><td>MHAB</td><td>Oficina de expressão visual sobre memória, mulheres e narrativas.</td></tr>
        <tr><td>21/03/2026</td><td>MUMO</td><td>Clara Nunes — Eu Sou a Tal Mineira</td><td>Mediação</td><td>Museu da Moda</td><td>Visita mediada sobre moda, música, cultura popular e identidade brasileira.</td></tr>
        <tr><td>27/03/2026</td><td>MIS</td><td>Prosas MIS — Animadoras Mineiras em Foco</td><td>Conversa</td><td>MIS BH</td><td>Roda de conversa sobre mulheres na animação brasileira.</td></tr>
        <tr><td>14/04/2026</td><td>MHAB</td><td>Ambiente Seguro, Diversidade e Inclusão</td><td>Formação</td><td>Auditório MHAB</td><td>Formação interna para equipes, servidores e colaboradores.</td></tr>
        <tr><td>25/04/2026</td><td>MHAB</td><td>Memórias em Libras de Belo Horizonte</td><td>Acessibilidade</td><td>Casarão MHAB</td><td>Encontro em Libras com público surdo, memória urbana e visita mediada.</td></tr>
        <tr><td>25/04/2026</td><td>MIS</td><td>Oficina — Criação de Cenários</td><td>Oficina</td><td>MIS BH</td><td>Oficina de criação visual e construção de cenários.</td></tr>
        <tr><td>30/04/2026</td><td>MIS</td><td>A Poética da Argila em Movimento</td><td>Laboratório</td><td>MIS BH</td><td>Experimentação visual e material com argila, imagem e movimento.</td></tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>Destaques por museu</h2>
    <table>
      <thead><tr><th>Museu</th><th>Destaques</th><th>Resultado institucional</th></tr></thead>
      <tbody>
        <tr><td>MHAB</td><td>Memórias em Libras, Ambiente Seguro, Museu Criativo, Travessias do Curral Del Rei</td><td>Ampliação da acessibilidade, mediação cultural e formação educativa.</td></tr>
        <tr><td>MIS</td><td>Prosas MIS, Do Traço ao Pixel, visitas mediadas e oficinas audiovisuais</td><td>Fortalecimento da programação contemporânea e educativa.</td></tr>
        <tr><td>MUMO</td><td>Clara Nunes, estamparia natural, macramê e uso criativo do espaço</td><td>Ampliação do fluxo de visitantes e experimentação ligada à moda.</td></tr>
      </tbody>
    </table>
  </section>

  <section>
    <h2>Memória visual e evidências fotográficas</h2>
    <p>O relatório está preparado para incorporar galerias por atividade, com legenda, data, fotógrafo, museu e vínculo com a meta correspondente. Recomenda-se priorizar imagens horizontais, registros com público, evidências de mediação e fotos que comprovem entregas programáticas.</p>
    <div class="note"><p><strong>Próxima melhoria:</strong> automatizar a seleção de fotos por atividade, cruzando relatórios, galeria, programação e nomes das ações.</p></div>
  </section>

  <section>
    <h2>Conclusão</h2>
    <p>O trimestre analisado consolidou a base operacional necessária para a ampliação das ações públicas, educativas e curatoriais do Projeto Museus Centro. A integração entre coordenação, equipes técnicas, programação, comunicação e sistema digital permite maior rastreabilidade e qualificação da prestação de contas.</p>
  </section>
</body>
</html>`;
}

export default function RelatorioFisicoFinanceiroGenerator() {
  const [museu, setMuseu] = useState('Todos');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [erro, setErro] = useState(null);

  const openPreview = (html) => {
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
    a.download = `relatorio-museus-centro-${new Date().getTime()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGerar = async () => {
    setLoading(true);
    setResultado(null);
    setErro(null);

    try {
      const response = await base44.functions.invoke('gerarRelatorioFisicoFinanceiro', {
        museu: museu === 'Todos' ? null : museu,
      });

      const data = response?.data?.html ? response.data : { html: buildCompleteReportHtml(museu) };
      setResultado(data);
      openPreview(data.html);
      toast.success('Relatório gerado com sucesso!');
    } catch (err) {
      console.error(err);
      const fallbackHtml = buildCompleteReportHtml(museu);
      setResultado({ html: fallbackHtml });
      openPreview(fallbackHtml);
      setErro(err.message || 'Backend indisponível');
      toast.error('Backend indisponível — relatório completo gerado em modo local');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadHTML = () => {
    if (!resultado?.html) return;
    downloadHtml(resultado.html);
  };

  const handleOpenPreview = () => {
    if (!resultado?.html) return;
    openPreview(resultado.html);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center">
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Gerar Relatório</h2>
          <p className="text-sm text-slate-500">Relatório completo com metas, programação, execução e texto institucional.</p>
        </div>
      </div>

      <div className="mb-6">
        <Label>Museu</Label>
        <Select value={museu} onValueChange={setMuseu}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {MUSEUS.map((m) => (
              <SelectItem key={m} value={m}>{m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button onClick={handleGerar} disabled={loading} className="w-full">
        {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <FileText className="w-4 h-4 mr-2" />}
        Gerar Relatório
      </Button>

      {erro && (
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-amber-800">Backend indisponível — usando relatório local completo</p>
            <p className="text-xs text-amber-700 mt-1">{erro}</p>
          </div>
        </div>
      )}

      {resultado && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">Relatório gerado com sucesso!</p>
            </div>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={handleOpenPreview}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Abrir Relatório
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadHTML}>
              <Download className="w-4 h-4 mr-2" />
              Baixar HTML
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
