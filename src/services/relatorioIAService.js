import { base44 } from '@/api/base44Client';

const TOimport { base44 } from '@/api/base44Client';

const MIN_CHARS = 600;
const TOTAL_OFICIAL = 1320000;

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

Esta leitura foi estruturada a partir dos relatórios aprovados pela coordenação e dos registros disponíveis no sistema do projeto. A análise considera a natureza da ação, sua vinculação institucional, sua função dentro do ciclo de execução e sua contribuição para a organização da memória técnica do Museus Centro. Quando a ação não corresponde a uma atividade pública, o público é tratado como N/A, preservando a consistência dos indicadores e evitando distorções na leitura de alcance.`;
}

function categoriaLabel(categoria) {
  const map = {
    gestao_governanca: 'gestão e governança',
    producao_operacao: 'produção executiva, operação e manutenção',
    comunicacao_produtos: 'comunicação e produtos',
    atividade_publico: 'atividades educativas e atividades com público',
  };

  return map[categoria] || 'eixo institucional';
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

function buildPrompt(contexto = {}) {
  const atividades = Array.isArray(contexto.atividades) ? contexto.atividades : [];
  const trechos = Array.isArray(contexto.trechos_relatorios) ? contexto.trechos_relatorios : [];
  const conhecimento = Array.isArray(contexto.conhecimento) ? contexto.conhecimento : [];

  const payload = {
    periodo: contexto.periodo_extenso || '2 de fevereiro a 30 de abril de 2026',
    total_relatorios: contexto.total_relatorios || 25,
    publico_total: contexto.publico_total || 1625,
    museu: contexto.museu || 'Todos',
    valor_utilizado: contexto.valor_utilizado,
    saldo: contexto.saldo,
    percentual_execucao: contexto.percentual_execucao,
    total_compras: contexto.total_compras,
    atividades: atividades.slice(0, 160).map(buildAtividadeResumo),
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
8. Informar que foi utilizada inteligência artificial para auditoria técnica dos dados.
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

Dados:
${JSON.stringify(payload, null, 2)}

Retorne JSON válido:
{
  "introducao": "...",
  "resumo_geral": "...",
  "publico_alcancado": "...",
  "producao_executiva": "...",
  "prestacao": "...",
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

Foi utilizada inteligência artificial como camada de auditoria técnica dos dados. Essa auditoria não substitui a análise da coordenação, mas auxilia na identificação de inconsistências, na reorganização das atividades por natureza institucional, na diferenciação entre ações públicas e rotinas de gestão, e na qualificação textual do relatório. Dessa forma, atividades sem público direto deixam de ser tratadas como público zero e passam a aparecer como N/A, preservando a consistência dos indicadores.
`.trim();

  const resumo = `
No período analisado foram consolidados ${totalRelatorios} relatórios aprovados, com público total de ${publico.toLocaleString('pt-BR')} pessoas nas atividades efetivamente abertas ao público. A leitura dos dados exigiu a reorganização das ações em categorias institucionais distintas, separando atividades educativas, visitas mediadas, oficinas e ações abertas ao público de processos de gestão, produção, manutenção, comunicação e articulação institucional.

Essa distinção é importante para evitar distorções nos indicadores. Reuniões de alinhamento, rituais de gestão, organização de pauta, fechamento de relatórios, visitas técnicas, produção executiva, manutenção de espaços e atividades de comunicação não devem ser contabilizadas como ações de público. Nesses casos, a indicação correta é N/A, pois se trata de trabalho técnico necessário para a execução do projeto, mas sem atendimento direto de público.

As atividades com público concentram os indicadores quantitativos de participação e revelam a presença do projeto nos museus participantes. Oficinas, visitas mediadas, ações educativas, atividades abertas e iniciativas de formação de público são os elementos centrais para leitura de alcance. As demais frentes demonstram a sustentação institucional, técnica e operacional que torna possível a execução das ações públicas e a construção de uma programação mais estruturada.

A consolidação também evidencia o amadurecimento da rotina de produção de dados. O aplicativo desenvolvido para o projeto passa a funcionar como instrumento de gestão, auditoria e memória institucional, permitindo que os relatórios deixem de ser apenas registros narrativos e passem a compor uma base integrada de acompanhamento físico, financeiro e documental.
`.trim();

  const prestacao = `
A prestação de contas apresentada considera a execução física e financeira do projeto no período de referência. As compras, notas fiscais e solicitações financeiras não aparecem como seção isolada, mas como parte da leitura consolidada da execução e da responsabilidade administrativa do projeto. A organização desses dados no sistema permite acompanhar rubricas, valores utilizados, documentação de suporte e vínculo entre execução física e gasto realizado.

O percentual de execução financeira ainda reduzido deve ser lido à luz do cronograma do projeto. Os maiores custos estão previstos para os meses seguintes, especialmente a partir de junho, com montagem de exposições, adequações de espaços, manutenção, produção cultural, fornecedores, infraestrutura e etapas ampliadas de programação. Assim, o ritmo financeiro observado não indica atraso estrutural, mas correspondência com a lógica de execução prevista.

O período analisado teve forte componente de preparação, organização, planejamento, registro e estruturação. A execução física aparece tanto nas atividades abertas ao público quanto nas rotinas de gestão, produção e comunicação. O relatório demonstra que o projeto está em processo de consolidação operacional, com investimento crescente na produção de dados, na rastreabilidade documental e na articulação entre equipes, museus e coordenação.

O desenvolvimento do aplicativo fortalece esse processo. A ferramenta permite consolidar evidências, melhorar a qualidade da prestação de contas e ampliar a capacidade de acompanhamento pela coordenação e pela Diretoria de Museus. O relatório, portanto, não apenas descreve ações realizadas, mas inaugura uma forma mais qualificada de monitoramento institucional do Museus Centro.
`.trim();

  return {
    introducao,
    resumo_geral: resumo,
    publico_alcancado: resumo,
    producao_executiva: resumo,
    prestacao,
    conclusao: `
Conclui-se que o período consolidado demonstra avanço relevante na estruturação técnica, administrativa e cultural do projeto Museus Centro. A organização das atividades por natureza institucional permite leitura mais precisa dos resultados e evita distorções nos indicadores de público. O relatório evidencia a importância de diferenciar ações públicas de rotinas internas, reconhecendo que gestão, produção, comunicação e manutenção são dimensões essenciais para que as atividades educativas e culturais aconteçam com qualidade.

A utilização do aplicativo próprio e da inteligência artificial como apoio à auditoria de dados fortalece a produção de evidências e cria uma base mais robusta para acompanhamento institucional. O relatório também indica que a execução financeira segue o cronograma previsto, com concentração dos maiores custos nos meses seguintes. Dessa forma, a análise integrada dos dados confirma a pertinência da metodologia adotada e aponta para a continuidade do projeto com maior capacidade de monitoramento, transparência e qualificação das entregas.
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
    resumo_geral: ensureMinText(result?.resumo_geral, fallback.resumo_geral),
    publico_alcancado: ensureMinText(result?.publico_alcancado, fallback.publico_alcancado),
    producao_executiva: ensureMinText(result?.producao_executiva, fallback.producao_executiva),
    prestacao: ensureMinText(result?.prestacao, fallback.prestacao),
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
          resumo_geral: { type: 'string' },
          publico_alcancado: { type: 'string' },
          producao_executiva: { type: 'string' },
          prestacao: { type: 'string' },
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
TAL_OFICIAL = 1320000;
const MIN_CHARS = 600;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function inteiro(value) {
  return Math.round(toNumber(value));
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
    fotos: Array.isArray(atividade.fotos_destaque) ? atividade.fotos_destaque.length : 0,
  };
}

function buildPrompt(contexto = {}) {
  const atividades = Array.isArray(contexto.atividades) ? contexto.atividades : [];
  const trechos = Array.isArray(contexto.trechos_relatorios) ? contexto.trechos_relatorios : [];

  const payload = {
    periodo: contexto.periodo_extenso || '2 de fevereiro a 30 de abril de 2026',
    total_relatorios: contexto.total_relatorios || 25,
    publico_total: contexto.publico_total || 1625,
    museu: contexto.museu || 'Todos',
    valor_utilizado: contexto.valor_utilizado,
    saldo: contexto.saldo,
    percentual_execucao: contexto.percentual_execucao,
    atividades: atividades.slice(0, 120).map(buildAtividadeResumo),
    trechos_reais: trechos.slice(0, 80),
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
3. A introdução deve partir da lógica:
   O relatório cobre o período de 2 de fevereiro a 30 de abril de 2026.
   É uma consolidação dos relatórios mensais produzidos pelas equipes do MHAB, MUMO, MIS, comunicação, produção, coordenação financeira e produção executiva.
   O projeto Museus Centro é realizado em parceria com a Diretoria de Museus da Fundação Municipal de Cultura de Belo Horizonte.
   O relatório foi produzido integralmente com uso de aplicativo desenvolvido especificamente para o projeto.
   Foi utilizada inteligência artificial para auditoria técnica dos dados.
4. Reorganize as ações em:
   gestão e governança;
   produção executiva, operação e manutenção;
   comunicação e produtos;
   atividades educativas e atividades com público.
5. Apenas atividades com público devem contabilizar público.
6. Ações de gestão, produção, comunicação, manutenção, organização de pauta e reuniões devem aparecer como N/A.
7. Não criar seção específica de notas fiscais.
8. Notas fiscais e compras devem aparecer apenas dentro da prestação de contas.
9. Explicar que o baixo percentual de execução financeira decorre do cronograma, pois os maiores custos virão a partir de junho, com exposições, adequações, manutenção e produção.
10. Não inventar informações. Use os dados e trechos fornecidos.

Dados:
${JSON.stringify(payload, null, 2)}

Retorne JSON válido:
{
  "introducao": "...",
  "resumo_geral": "...",
  "publico_alcancado": "...",
  "producao_executiva": "...",
  "prestacao": "...",
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
      "descricao": "texto técnico da atividade, com até 200 palavras, usando local, data, descrição original e relação com o eixo"
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

Foi utilizada inteligência artificial como camada de auditoria técnica dos dados. Essa auditoria não substitui a análise da coordenação, mas auxilia na identificação de inconsistências, na reorganização das atividades por natureza institucional, na diferenciação entre ações públicas e rotinas de gestão, e na qualificação textual do relatório. Dessa forma, atividades sem público direto deixam de ser tratadas como público zero e passam a aparecer como N/A, preservando a consistência dos indicadores.
`.trim();

  const resumo = `
No período analisado foram consolidados ${totalRelatorios} relatórios aprovados, com público total de ${publico.toLocaleString('pt-BR')} pessoas nas atividades efetivamente abertas ao público. A leitura dos dados exigiu a reorganização das ações em categorias institucionais distintas, separando atividades educativas, visitas mediadas, oficinas e ações abertas ao público de processos de gestão, produção, manutenção, comunicação e articulação institucional.

Essa distinção é importante para evitar distorções nos indicadores. Reuniões de alinhamento, rituais de gestão, organização de pauta, fechamento de relatórios, visitas técnicas, produção executiva, manutenção de espaços e atividades de comunicação não devem ser contabilizadas como ações de público. Nesses casos, a indicação correta é N/A, pois se trata de trabalho técnico necessário para a execução do projeto, mas sem atendimento direto de público.

As atividades com público concentram os indicadores quantitativos de participação e revelam a presença do projeto nos museus participantes. Oficinas, visitas mediadas, ações educativas, atividades abertas e iniciativas de formação de público são os elementos centrais para leitura de alcance. As demais frentes demonstram a sustentação institucional, técnica e operacional que torna possível a execução das ações públicas e a construção de uma programação mais estruturada.

A consolidação também evidencia o amadurecimento da rotina de produção de dados. O aplicativo desenvolvido para o projeto passa a funcionar como instrumento de gestão, auditoria e memória institucional, permitindo que os relatórios deixem de ser apenas registros narrativos e passem a compor uma base integrada de acompanhamento físico, financeiro e documental.
`.trim();

  const prestacao = `
A prestação de contas apresentada considera a execução física e financeira do projeto no período de referência. As compras, notas fiscais e solicitações financeiras não aparecem como seção isolada, mas como parte da leitura consolidada da execução e da responsabilidade administrativa do projeto. A organização desses dados no sistema permite acompanhar rubricas, valores utilizados, documentação de suporte e vínculo entre execução física e gasto realizado.

O percentual de execução financeira ainda reduzido deve ser lido à luz do cronograma do projeto. Os maiores custos estão previstos para os meses seguintes, especialmente a partir de junho, com montagem de exposições, adequações de espaços, manutenção, produção cultural, fornecedores, infraestrutura e etapas ampliadas de programação. Assim, o ritmo financeiro observado não indica atraso estrutural, mas correspondência com a lógica de execução prevista.

O período analisado teve forte componente de preparação, organização, planejamento, registro e estruturação. A execução física aparece tanto nas atividades abertas ao público quanto nas rotinas de gestão, produção e comunicação. O relatório demonstra que o projeto está em processo de consolidação operacional, com investimento crescente na produção de dados, na rastreabilidade documental e na articulação entre equipes, museus e coordenação.

O desenvolvimento do aplicativo fortalece esse processo. A ferramenta permite consolidar evidências, melhorar a qualidade da prestação de contas e ampliar a capacidade de acompanhamento pela coordenação e pela Diretoria de Museus. O relatório, portanto, não apenas descreve ações realizadas, mas inaugura uma forma mais qualificada de monitoramento institucional do Museus Centro.
`.trim();

  return {
    introducao,
    resumo_geral: resumo,
    publico_alcancado: resumo,
    producao_executiva: resumo,
    prestacao,
    conclusao: `
Conclui-se que o período consolidado demonstra avanço relevante na estruturação técnica, administrativa e cultural do projeto Museus Centro. A organização das atividades por natureza institucional permite leitura mais precisa dos resultados e evita distorções nos indicadores de público. O relatório evidencia a importância de diferenciar ações públicas de rotinas internas, reconhecendo que gestão, produção, comunicação e manutenção são dimensões essenciais para que as atividades educativas e culturais aconteçam com qualidade.

A utilização do aplicativo próprio e da inteligência artificial como apoio à auditoria de dados fortalece a produção de evidências e cria uma base mais robusta para acompanhamento institucional. O relatório também indica que a execução financeira segue o cronograma previsto, com concentração dos maiores custos nos meses seguintes. Dessa forma, a análise integrada dos dados confirma a pertinência da metodologia adotada e aponta para a continuidade do projeto com maior capacidade de monitoramento, transparência e qualificação das entregas.
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
A atividade ${atividade.nome || 'sem título'} foi registrada em relatório aprovado pela coordenação e integrada ao eixo ${categoriaLabel(atividade.categoria_editorial)}. Sua leitura considera o museu de referência, a data, o local informado, a descrição original apresentada pela equipe e sua relação com o conjunto de ações do projeto Museus Centro. Quando a atividade corresponde a processo de gestão, produção, comunicação ou manutenção, o público é tratado como N/A, pois não se trata de ação aberta ao público. Quando corresponde a atividade educativa ou cultural aberta, o público informado é incorporado aos indicadores consolidados.
`.trim(),
    })),
  };
}

function categoriaLabel(categoria) {
  const map = {
    gestao_governanca: 'gestão e governança',
    producao_operacao: 'produção executiva, operação e manutenção',
    comunicacao_produtos: 'comunicação e produtos',
    atividade_publico: 'atividades educativas e atividades com público',
  };

  return map[categoria] || 'eixo institucional';
}

function normalizeResult(result = {}, contexto = {}) {
  const fallback = fallbackTextos(contexto);

  const atividades = Array.isArray(contexto?.atividades) ? contexto.atividades : [];
  const desc = Array.isArray(result?.atividades_descricoes) ? result.atividades_descricoes : [];

  return {
    introducao: ensureMinText(result?.introducao, fallback.introducao),
    resumo_geral: ensureMinText(result?.resumo_geral, fallback.resumo_geral),
    publico_alcancado: ensureMinText(result?.publico_alcancado, fallback.publico_alcancado),
    producao_executiva: ensureMinText(result?.producao_executiva, fallback.producao_executiva),
    prestacao: ensureMinText(result?.prestacao, fallback.prestacao),
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
          resumo_geral: { type: 'string' },
          publico_alcancado: { type: 'string' },
          producao_executiva: { type: 'string' },
          prestacao: { type: 'string' },
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
