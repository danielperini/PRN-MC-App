import { base44 } from '@/api/base44Client';

const MIN_CHARS = 600;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fmtBRL(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

function ensureMinText(text, fallback) {
  const raw = String(text || '').trim();
  if (raw.length >= MIN_CHARS) return raw;

  const complement = String(fallback || '').trim();
  const combined = [raw, complement].filter(Boolean).join('\n\n');

  if (combined.length >= MIN_CHARS) return combined;

  return `${combined}

Esta leitura foi estruturada a partir dos relatórios aprovados pela coordenação e dos registros disponíveis no sistema do projeto. A análise considera a natureza da ação, sua vinculação institucional, sua função dentro do ciclo de execução e sua contribuição para a organização da memória técnica do Museus Centro. Quando a ação não corresponde a uma atividade pública, o público é tratado como N/A, preservando a consistência dos indicadores.`;
}

function categoriaLabel(categoria) {
  const map = {
    gestao_governanca: 'Gestão e governança',
    producao_operacao: 'Produção executiva, operação e manutenção',
    comunicacao_produtos: 'Comunicação e produtos',
    atividade_publico: 'Atividades educativas e atividades com público',
  };

  return map[categoria] || 'Eixo institucional';
}

function buildAtividadeResumo(atividade, index) {
  return {
    indice: index + 1,
    nome: atividade.nome,
    museu: atividade.museu,
    mes: atividade.mes,
    data: atividade.data,
    local: atividade.local,
    publico: atividade.publico_label || 'N/A',
    categoria_editorial: atividade.categoria_editorial,
    categoria_label: categoriaLabel(atividade.categoria_editorial),
    classificacao: atividade.classificacao,
    descricao_original: atividade.descricao,
    sinopse_agenda: atividade.sinopse_agenda,
    fotos: Array.isArray(atividade.fotos_destaque) ? atividade.fotos_destaque.length : 0,
  };
}

function buildRelatorioEquipeResumo(relatorio, index) {
  return {
    indice: index + 1,
    autor: relatorio?.autor,
    funcao: relatorio?.funcao,
    museu: relatorio?.museu,
    mes: relatorio?.mes,
    status: relatorio?.status,
    atividades_count: relatorio?.atividades_count,
    publico: relatorio?.publico,
    resumo_executivo: relatorio?.resumo_executivo,
    resumo_periodo: relatorio?.resumo_periodo,
    pontos_positivos: relatorio?.pontos_positivos,
    desafios: relatorio?.desafios,
    encaminhamentos: relatorio?.encaminhamentos,
    trechos: Array.isArray(relatorio?.trechos) ? relatorio.trechos.slice(0, 6) : [],
  };
}

function buildProgramacaoResumo(item, index) {
  return {
    indice: index + 1,
    titulo: item?.titulo,
    museu: item?.museu,
    data: item?.data,
    local: item?.local,
    tipo: item?.tipo,
    status: item?.status,
    publico_estimado: item?.publico_estimado,
    descricao: item?.descricao,
  };
}

function buildRubricaResumo(rubrica, index) {
  return {
    indice: index + 1,
    rubrica: rubrica?.rubrica,
    grupo: rubrica?.grupo,
    valor_previsto: rubrica?.valor_previsto,
    valor_utilizado: rubrica?.valor_utilizado,
    saldo: rubrica?.saldo,
    percentual: rubrica?.percentual,
  };
}

function buildCompraResumo(compra, index) {
  return {
    indice: index + 1,
    descricao: compra?.descricao,
    fornecedor: compra?.fornecedor,
    rubrica: compra?.rubrica,
    status: compra?.status,
    valor: compra?.valor,
    nf_numero: compra?.nf_numero,
  };
}

function buildPrompt(contexto = {}) {
  const atividades = Array.isArray(contexto.atividades) ? contexto.atividades : [];
  const trechos = Array.isArray(contexto.trechos_relatorios) ? contexto.trechos_relatorios : [];
  const conhecimento = Array.isArray(contexto.conhecimento) ? contexto.conhecimento : [];
  const relatoriosEquipe = Array.isArray(contexto.relatorios_equipe) ? contexto.relatorios_equipe : [];
  const programacao = Array.isArray(contexto.programacao) ? contexto.programacao : [];
  const rubricas = Array.isArray(contexto.rubricas) ? contexto.rubricas : [];
  const compras = Array.isArray(contexto.compras) ? contexto.compras : [];

  const payload = {
    periodo: contexto.periodo_extenso || '2 de fevereiro a 30 de abril de 2026',
    total_relatorios: contexto.total_relatorios || 25,
    total_equipe: contexto.equipe_total || relatoriosEquipe.length,
    publico_total: contexto.publico_total || 1625,
    museu: contexto.museu || 'Todos',
    total_atividades: contexto.total_atividades,
    programacao_total: contexto.programacao_total,
    valor_utilizado: contexto.valor_utilizado,
    saldo: contexto.saldo,
    percentual_execucao: contexto.percentual_execucao,
    total_compras: contexto.total_compras,
    atividades: atividades.slice(0, 160).map(buildAtividadeResumo),
    relatorios_equipe: relatoriosEquipe.slice(0, 80).map(buildRelatorioEquipeResumo),
    programacao: programacao.slice(0, 120).map(buildProgramacaoResumo),
    rubricas: rubricas.slice(0, 80).map(buildRubricaResumo),
    compras: compras.slice(0, 120).map(buildCompraResumo),
    trechos_reais: trechos.slice(0, 120),
    base_conhecimento: conhecimento.slice(0, 60),
  };

  return `
Você escreve como Daniel Perini.

Idioma:
Português do Brasil.

Tom:
Institucional.
Técnico.
Curatorial.
Analítico.
Sem linguagem promocional.
Sem excesso de adjetivos.
Sem travessões.
Sem frases genéricas de IA.

Regras obrigatórias:
1. Nenhum texto pode ter menos de 600 caracteres.
2. Cada subtítulo pode ter até 500 palavras.
3. Cada descrição de atividade deve ter até 200 palavras, mas deve ser profunda e técnica.
4. A introdução deve informar que o relatório cobre o período de 2 de fevereiro a 30 de abril de 2026.
5. Informar que o relatório consolida relatórios mensais das equipes do MHAB, MUMO, MIS, comunicação, produção, coordenação financeira e produção executiva.
6. Informar que o projeto Museus Centro é realizado em parceria com a Diretoria de Museus da Fundação Municipal de Cultura de Belo Horizonte.
7. Informar que o relatório foi produzido com aplicativo desenvolvido especificamente para o projeto.
8. Informar que foi realizado tratamento dos dados com apoio de inteligência artificial.
9. Reorganizar as ações em:
   gestão e governança;
   produção executiva, operação e manutenção;
   comunicação e produtos;
   atividades educativas e atividades com público.
10. Apenas atividades com público devem contabilizar público.
11. Ações de gestão, produção, comunicação, manutenção, organização de pauta e reuniões devem aparecer como N/A.
12. Não criar seção específica de notas fiscais.
13. Notas fiscais e compras devem aparecer apenas dentro da prestação de contas.
14. Explicar que o baixo percentual de execução financeira decorre do cronograma, pois os maiores custos virão a partir de junho, com exposições, adequações, manutenção e produção.
15. Use os trechos reais dos relatórios aprovados como base semântica.
16. Use agenda/programação e base de conhecimento quando disponível.
17. Não inventar números, datas, locais ou fotos.
18. Refinar os textos com leitura executiva, mas preservar rastreabilidade dos dados.
19. Explicitar os avanços de uso do app, integração de dados, tratamento dos dados com apoio de IA e qualificação da gestão sem linguagem publicitária.
20. Gerar textos específicos para território, metas, programação, comunicação, financeiro e app, pois eles serão usados como capítulos autônomos.
21. Não escrever tags HTML, Markdown bruto, <p>, <br>, listas com marcação ou símbolos de template. Entregar apenas texto limpo em PT-BR.

Dados:
${JSON.stringify(payload, null, 2)}

Retorne JSON válido:
{
  "introducao": "...",
  "contexto_territorial": "...",
  "resumo_geral": "...",
  "publico_alcancado": "...",
  "metas": "...",
  "programacao": "...",
  "producao_executiva": "...",
  "comunicacao": "...",
  "financeiro": "...",
  "prestacao": "...",
  "app_museu_centro": "...",
  "conclusao": "...",
  "capitulos": {
    "gestao_governanca": "...",
    "producao_operacao": "...",
    "comunicacao_produtos": "...",
    "atividade_publico": "..."
  },
  "atividades_descricoes": [
    {
      "indice": 1,
      "descricao": "texto técnico da atividade, com até 200 palavras, usando local, data, descrição original, agenda e relação com o eixo"
    }
  ]
}
`;
}

function fallbackTextos(contexto = {}) {
  const periodo = contexto?.periodo_extenso || '2 de fevereiro a 30 de abril de 2026';
  const totalRelatorios = contexto?.total_relatorios || 25;
  const publico = contexto?.publico_total || 1625;

  const introducao = `
O presente relatório cobre o período de ${periodo} e consolida as atividades desenvolvidas no âmbito do projeto Museus Centro, realizado em parceria com a Diretoria de Museus da Fundação Municipal de Cultura de Belo Horizonte. O documento reúne informações produzidas mês a mês pelas equipes que atuam no Museu Histórico Abílio Barreto, no Museu da Moda e no Museu da Imagem e do Som, além das entregas vinculadas à comunicação, produção executiva, coordenação financeira e acompanhamento operacional.

A consolidação resulta da leitura dos relatórios aprovados pela coordenação do projeto e busca organizar, em um único documento, registros produzidos por diferentes profissionais e frentes de trabalho. Trata-se de um relatório produzido por várias mãos, com base na rotina concreta de execução do projeto, nos registros das atividades, na documentação fotográfica, nos indicadores de público e nos dados de acompanhamento financeiro disponíveis no sistema.

Este relatório também marca uma etapa importante do processo de gestão do projeto, pois foi produzido integralmente com o uso de aplicativo desenvolvido especificamente para o Museus Centro. A ferramenta permite integrar relatórios, programação, fotos, registros administrativos, dados financeiros e informações de prestação de contas. A partir das próximas entregas, o sistema também poderá disponibilizar dashboard de acompanhamento para a Diretoria de Museus, fortalecendo a transparência e a produção de evidências.

Foi realizado tratamento dos dados com apoio de inteligência artificial. Esse tratamento não substitui a análise da coordenação, mas auxilia na identificação de inconsistências, na reorganização das atividades por natureza institucional, na diferenciação entre ações públicas e rotinas de gestão, e na qualificação textual do relatório. Dessa forma, atividades sem público direto deixam de ser tratadas como público zero e passam a aparecer como N/A, preservando a consistência dos indicadores.
`.trim();

  const resumo = `
No período analisado foram consolidados ${totalRelatorios} relatórios aprovados, com público total de ${publico.toLocaleString('pt-BR')} pessoas nas atividades efetivamente abertas ao público. A leitura dos dados exigiu a reorganização das ações em categorias institucionais distintas, separando atividades educativas, visitas mediadas, oficinas e ações abertas ao público de processos de gestão, produção, manutenção, comunicação e articulação institucional.

Essa distinção é importante para evitar distorções nos indicadores. Reuniões de alinhamento, rituais de gestão, organização de pauta, fechamento de relatórios, visitas técnicas, produção executiva, manutenção de espaços e atividades de comunicação não devem ser contabilizadas como ações de público. Nesses casos, a indicação correta é N/A, pois se trata de trabalho técnico necessário para a execução do projeto, mas sem atendimento direto de público.

As atividades com público concentram os indicadores quantitativos de participação e revelam a presença do projeto nos museus participantes. Oficinas, visitas mediadas, ações educativas, atividades abertas e iniciativas de formação de público são os elementos centrais para leitura de alcance. As demais frentes demonstram a sustentação institucional, técnica e operacional que torna possível a execução das ações públicas e a construção de uma programação mais estruturada.

A consolidação também evidencia o amadurecimento da rotina de produção de dados. O aplicativo desenvolvido para o projeto passa a funcionar como instrumento de gestão, tratamento de dados e memória institucional, permitindo que os relatórios deixem de ser apenas registros narrativos e passem a compor uma base integrada de acompanhamento físico, financeiro e documental.
`.trim();

  const contextoTerritorial = `
O Projeto Museus Centro articula MIS, MHAB e MUMO como equipamentos complementares de memória, imagem, moda, cidade e mediação cultural no centro de Belo Horizonte. A leitura territorial do período indica que a atuação integrada dos museus permite reconhecer o centro como espaço de circulação, pesquisa, patrimônio, formação de público e produção de memória institucional. O relatório organiza essa dimensão a partir dos registros aprovados pelas equipes, das atividades públicas, das rotinas de bastidor e da documentação associada ao app.

Essa abordagem territorial evita reduzir o projeto a uma sequência de eventos. O conjunto de ações revela uma infraestrutura cultural em funcionamento, sustentada por equipes, programação, comunicação, manutenção, produção executiva, registros financeiros e mediações com públicos diversos. A análise considera que cada museu possui vocação própria, mas que a leitura conjunta permite acompanhar o avanço de uma política cultural compartilhada e orientada por evidências.
`.trim();

  const metas = `
As metas do 3º Aditivo devem ser lidas em relação ao estágio real de execução do projeto. O período consolidado corresponde a uma fase de estruturação, recomposição de rotinas, planejamento programático, organização documental, qualificação de dados e retomada de processos de gestão. Por isso, parte relevante dos avanços aparece em ações preparatórias, articulações institucionais, produção de agenda, comunicação, manutenção e consolidação de relatórios da equipe.

A inteligência artificial foi utilizada como apoio para classificar as ações por natureza institucional, revisar consistência dos indicadores e diferenciar atividades com público de rotinas técnicas sem atendimento direto. Esse refinamento melhora a leitura das metas porque impede que reuniões, produções internas, fechamento de pautas ou tarefas administrativas sejam confundidas com atividade pública. Assim, o acompanhamento físico passa a refletir melhor a execução concreta do projeto.
`.trim();

  const programacao = `
A programação do período reúne atividades públicas, ações educativas, visitas, oficinas, eventos, reuniões técnicas, etapas de planejamento e processos de produção que sustentam a presença dos museus no território. No MUMO, registros como a Oficina Experimentação em Estamparia Natural, o Sarau Insubmissas e a Oficina Costurando Bem Querer ajudam a situar moda, corpo, manualidade, encontro e formação de público como dimensões culturais conectadas ao cotidiano do equipamento. No MHAB, a Formação Museus Centro dedicada à diversidade e inclusão aparece como eixo de qualificação institucional, aproximando equipe, mediação, acolhimento e responsabilidade pública. No MIS BH, ações como Prosas MIS: Animadoras Mineiras em Foco ampliam a leitura sobre audiovisual, memória da imagem, circulação de repertórios e participação de públicos interessados na história e na produção cultural do cinema de animação.

Essa leitura permite compreender a agenda como um conjunto de frentes complementares, e não como simples calendário de eventos. Oficinas, prosas, formações, visitas mediadas, preparação educativa, estudos de exposição, atividades em equipamentos culturais parceiros, visitas técnicas e rotinas de produção aparecem de modos distintos no relatório. As ações abertas ao público compõem os indicadores de alcance, enquanto atividades de gestão, comunicação, manutenção, planejamento, estudo e produção aparecem como infraestrutura técnica de execução, responsável por dar consistência à programação e por preparar os ciclos seguintes.

O uso do app permite aproximar programação, relatório de equipe, fotos, descrição original, museu de referência, data, local e público informado. Essa integração melhora a conferência das informações e cria uma base mais robusta para os próximos ciclos. Quando a agenda disponível no sistema dialoga com os relatórios aprovados, o relatório consegue recuperar não apenas o que aconteceu, mas também como cada ação se insere na estratégia institucional do Museus Centro.
`.trim();

  const comunicacao = `
A comunicação foi analisada como frente técnica de documentação, circulação pública e memória institucional, não apenas como divulgação de atividades. Os registros do período indicam que a produção de conteúdo, a organização de pauta, a cobertura fotográfica, a atualização de canais e a curadoria de evidências visuais compõem parte essencial da execução física do projeto. Essas ações podem não gerar público direto, mas sustentam visibilidade, transparência e continuidade documental.

No relatório, a comunicação aparece articulada aos museus, à programação e às atividades registradas pelas equipes. As fotos vinculadas no app reforçam essa camada de evidência e permitem qualificar a leitura das entregas. A inteligência artificial auxilia na organização dos textos, mas os dados preservam a origem nos relatórios aprovados e nos registros administrativos, mantendo a rastreabilidade entre narrativa, imagem e execução.
`.trim();

  const financeiro = `
A execução financeira consolidada deve ser interpretada em conjunto com o cronograma físico do projeto. O percentual utilizado até o fim do período não representa, por si só, atraso estrutural, pois os maiores custos estão previstos para etapas posteriores, especialmente a partir de junho, quando se intensificam despesas com exposições, infraestrutura, manutenção, produção cultural, fornecedores, adequações e ações de maior escala.

A leitura financeira foi estruturada a partir das rubricas, compras e registros disponíveis no app. Notas fiscais, solicitações e documentos de suporte são tratados dentro da prestação de contas, evitando criar uma seção fiscal isolada e desconectada da execução. Essa forma de organização permite acompanhar saldo, utilização e vínculo entre gasto e etapa do projeto, fortalecendo a governança financeira e a capacidade de resposta da coordenação.
`.trim();

  const appMuseuCentro = `
O relatório evidencia avanço importante no uso do aplicativo desenvolvido especificamente para o Museus Centro. A ferramenta passa a funcionar como ambiente de integração entre relatórios mensais, programação, fotos, atividades, equipe, compras, rubricas e documentação de prestação de contas. Esse desenho melhora a qualidade da informação, reduz dispersão documental e permite que a coordenação acompanhe a execução física e financeira com maior precisão.

A inteligência artificial apoia o tratamento técnico dos dados, reorganizando textos, conferindo coerência dos indicadores e qualificando a leitura institucional dos registros. Esse uso não substitui a validação humana nem altera dados originais, mas amplia a capacidade de síntese e de identificação de inconsistências. O resultado é um relatório mais abrangente, rastreável e útil para tomada de decisão, acompanhamento da Diretoria de Museus e memória do projeto.
`.trim();

  const prestacao = `
A prestação de contas apresentada considera a execução física e financeira do projeto no período de referência. As compras, notas fiscais e solicitações financeiras não aparecem como seção isolada, mas como parte da leitura consolidada da execução e da responsabilidade administrativa do projeto. A organização desses dados no sistema permite acompanhar rubricas, valores utilizados, documentação de suporte e vínculo entre execução física e gasto realizado.

O percentual de execução financeira ainda reduzido deve ser lido à luz do cronograma do projeto. Os maiores custos estão previstos para os meses seguintes, especialmente a partir de junho, com montagem de exposições, adequações de espaços, manutenção, produção cultural, fornecedores, infraestrutura e etapas ampliadas de programação. Assim, o ritmo financeiro observado não indica atraso estrutural, mas correspondência com a lógica de execução prevista.

O período analisado teve forte componente de preparação, organização, planejamento, registro e estruturação. A execução física aparece tanto nas atividades abertas ao público quanto nas rotinas de gestão, produção e comunicação. O relatório demonstra que o projeto está em processo de consolidação operacional, com investimento crescente na produção de dados, na rastreabilidade documental e na articulação entre equipes, museus e coordenação.

O desenvolvimento do aplicativo fortalece esse processo. A ferramenta permite consolidar evidências, melhorar a qualidade da prestação de contas e ampliar a capacidade de acompanhamento pela coordenação e pela Diretoria de Museus. O relatório, portanto, não apenas descreve ações realizadas, mas inaugura uma forma mais qualificada de monitoramento institucional do Museus Centro.
`.trim();

  return {
    introducao,
    contexto_territorial: contextoTerritorial,
    territorio: contextoTerritorial,
    resumo_geral: resumo,
    publico_alcancado: resumo,
    metas,
    programacao,
    producao_executiva: resumo,
    comunicacao,
    financeiro,
    prestacao,
    app_museu_centro: appMuseuCentro,
    conclusao: `
O fechamento do período reconhece o Museus Centro como construção coletiva, sustentada por equipes públicas, profissionais do Viaduto das Artes, coordenações, educativo, produção, comunicação, prestadoras e prestadores de serviço que converteram o cotidiano dos museus em ação cultural, documentação e presença pública.

O aplicativo passa a ocupar papel importante nessa memória operacional. Ao reunir relatórios, fotografias, programação, indicadores, documentos e registros de execução, a plataforma ajuda a preservar a experiência institucional vivida no período e a transformar informação dispersa em acompanhamento compartilhado. A tecnologia, nesse contexto, não substitui a mediação nem a presença das equipes nos museus: ela organiza evidências para que a cultura pública possa ser acompanhada com mais cuidado, continuidade e responsabilidade.

A continuidade do projeto se expressa na colaboração entre museus, na documentação do cotidiano, na escuta das equipes e na capacidade de manter a programação conectada à cidade. O período deixa como legado uma base mais consistente de memória, gestão e leitura pública da execução cultural.
`.trim(),
    capitulos: {
      gestao_governanca: resumo,
      producao_operacao: resumo,
      comunicacao_produtos: resumo,
      atividade_publico: resumo,
    },
    atividades_descricoes: (contexto?.atividades || []).map((atividade, index) => ({
      indice: index + 1,
      descricao: `
A atividade ${atividade.nome || 'sem título'} foi registrada em relatório aprovado pela coordenação e integrada ao eixo ${categoriaLabel(atividade.categoria_editorial)}. Sua leitura considera o museu de referência, a data, o local informado, a descrição original apresentada pela equipe, a programação associada quando localizada e sua relação com o conjunto de ações do projeto Museus Centro. Quando a atividade corresponde a processo de gestão, produção, comunicação ou manutenção, o público é tratado como N/A, pois não se trata de ação aberta ao público. Quando corresponde a atividade educativa ou cultural aberta, o público informado é incorporado aos indicadores consolidados.
`.trim(),
    })),
  };
}

function normalizeResult(result = {}, contexto = {}) {
  const fallback = fallbackTextos(contexto);

  const atividades = Array.isArray(contexto?.atividades) ? contexto.atividades : [];
  const desc = Array.isArray(result?.atividades_descricoes) ? result.atividades_descricoes : [];

  return {
    introducao: ensureMinText(result?.introducao, fallback.introducao),
    contexto_territorial: ensureMinText(result?.contexto_territorial || result?.territorio, fallback.contexto_territorial),
    territorio: ensureMinText(result?.territorio || result?.contexto_territorial, fallback.territorio),
    resumo_geral: ensureMinText(result?.resumo_geral, fallback.resumo_geral),
    publico_alcancado: ensureMinText(result?.publico_alcancado, fallback.publico_alcancado),
    metas: ensureMinText(result?.metas, fallback.metas),
    programacao: ensureMinText(result?.programacao, fallback.programacao),
    producao_executiva: ensureMinText(result?.producao_executiva, fallback.producao_executiva),
    comunicacao: ensureMinText(result?.comunicacao, fallback.comunicacao),
    financeiro: ensureMinText(result?.financeiro, fallback.financeiro),
    prestacao: ensureMinText(result?.prestacao, fallback.prestacao),
    app_museu_centro: ensureMinText(result?.app_museu_centro, fallback.app_museu_centro),
    conclusao: ensureMinText(result?.conclusao, fallback.conclusao),
    capitulos: {
      gestao_governanca: ensureMinText(result?.capitulos?.gestao_governanca, fallback.capitulos.gestao_governanca),
      producao_operacao: ensureMinText(result?.capitulos?.producao_operacao, fallback.capitulos.producao_operacao),
      comunicacao_produtos: ensureMinText(result?.capitulos?.comunicacao_produtos, fallback.capitulos.comunicacao_produtos),
      atividade_publico: ensureMinText(result?.capitulos?.atividade_publico, fallback.capitulos.atividade_publico),
    },
    atividades_descricoes: atividades.map((atividade, index) => {
      const item = desc.find((d) => Number(d?.indice) === index + 1) || desc[index] || {};
      const fallbackItem = fallback.atividades_descricoes[index] || {};
      return {
        indice: index + 1,
        descricao: ensureMinText(item.descricao, fallbackItem.descricao),
      };
    }),
  };
}

export async function gerarTextosRelatorioFisicoFinanceiro(contexto = {}, usarIA = true) {
  const fallback = normalizeResult({}, contexto);

  if (!usarIA) return fallback;

  try {
    if (!base44?.integrations?.Core?.InvokeLLM) {
      return fallback;
    }

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: buildPrompt(contexto),
      response_json_schema: {
        type: 'object',
        properties: {
          introducao: { type: 'string' },
          contexto_territorial: { type: 'string' },
          territorio: { type: 'string' },
          resumo_geral: { type: 'string' },
          publico_alcancado: { type: 'string' },
          metas: { type: 'string' },
          programacao: { type: 'string' },
          producao_executiva: { type: 'string' },
          comunicacao: { type: 'string' },
          financeiro: { type: 'string' },
          prestacao: { type: 'string' },
          app_museu_centro: { type: 'string' },
          conclusao: { type: 'string' },
          capitulos: {
            type: 'object',
            properties: {
              gestao_governanca: { type: 'string' },
              producao_operacao: { type: 'string' },
              comunicacao_produtos: { type: 'string' },
              atividade_publico: { type: 'string' },
            },
          },
          atividades_descricoes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                indice: { type: 'number' },
                descricao: { type: 'string' },
              },
            },
          },
        },
      },
    });

    return normalizeResult(result || {}, contexto);
  } catch (error) {
    console.warn('IA indisponível. Usando textos técnicos locais.', error);
    return fallback;
  }
}

export default gerarTextosRelatorioFisicoFinanceiro;
