import { base44 } from '@/api/base44Client';

const TOTAL_OFICIAL = 1320000;

function toNumber(value) {
  const n = N
import { base44 } from '@/api/base44Client';

function fallbackDescricao(atividade) {
  return `
A atividade ${atividade.nome} integrou o eixo ${atividade.categoria_editorial}
do projeto Museus Centro, articulando ações de patrimônio, mediação cultural
e processos institucionais vinculados à política pública de cultura do município.
`.trim();
}

export async function gerarTextosRelatorioFisicoFinanceiro(contexto = {}) {
  const atividades = contexto?.atividades || [];

  const descricoes = await Promise.all(
    atividades.map(async (atividade) => {
      try {
        if (!base44?.integrations?.Core?.InvokeLLM) {
          return fallbackDescricao(atividade);
        }

        const result = await base44.integrations.Core.InvokeLLM({
          prompt: `
Escreva texto institucional técnico em português do Brasil.

Atividade:
${atividade.nome}

Categoria:
${atividade.categoria_editorial}

Museu:
${atividade.museu}

Descrição original:
${atividade.descricao}

Local:
${atividade.local}

Data:
${atividade.data}

Escreva até 200 palavras.
Tom técnico.
Sem linguagem promocional.
`,
        });

        return result?.text || fallbackDescricao(atividade);
      } catch {
        return fallbackDescricao(atividade);
      }
    })
  );

  return {
    introducao: `
O relatório apresenta a consolidação editorial das ações desenvolvidas
no âmbito do projeto Museus Centro, considerando processos de gestão,
mediação cultural, patrimônio, formação de público e articulação institucional.
`.trim(),

    atividades_descricoes: descricoes,
  };
}

export default gerarTextosRelatorioFisicoFinanceiro;
umber(value);
  return Number.isFinite(n) ? n : 0;
}

function inteiro(value) {
  return Math.round(toNumber(value));
}

function fmtInt(value) {
  return inteiro(value).toLocaleString('pt-BR');
}

function fmtPublico(value) {
  const n = inteiro(value);
  return n > 0 ? n.toLocaleString('pt-BR') : 'N/A';
}

function fmtBRL(value) {
  return toNumber(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  });
}

function buildAtividadesResumo(contexto = {}) {
  const atividades = Array.isArray(contexto.atividades) ? contexto.atividades : [];

  return atividades.slice(0, 80).map((atividade, index) => ({
    indice: index + 1,
    nome: atividade.nome || 'Atividade sem título',
    museu: atividade.museu || '',
    mes: atividade.mes || '',
    ano: atividade.ano || '',
    classificacao: atividade.classificacao || '',
    equipe: atividade.equipe || '',
    publico: fmtPublico(atividade.publico),
    descricao_original:
      atividade.descricao ||
      atividade.resumo ||
      atividade.observacoes ||
      atividade.resultado ||
      atividade.resultados ||
      '',
    fotos: Array.isArray(atividade.fotos) ? atividade.fotos.length : 0,
  }));
}

function buildPersonaPrompt(contexto) {
  const contextoReduzido = {
    periodo: contexto?.periodo || {},
    museu: contexto?.museu || 'Todos',
    total_relatorios: contexto?.total_relatorios || 0,
    total_atividades: contexto?.total_atividades || 0,
    publico_total: contexto?.publico_total || 0,
    por_museu: contexto?.por_museu || {},
    valor_utilizado: contexto?.valor_utilizado || 0,
    saldo: contexto?.saldo || 0,
    percentual_execucao: contexto?.percentual_execucao || 0,
    total_compras: contexto?.total_compras || 0,
    atividades_resumo: buildAtividadesResumo(contexto),
  };

  return `
Você escreve como Daniel Perini.

Idioma:
Português do Brasil.

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

Regras:
Use somente os dados fornecidos.
Não invente números.
Não invente atividades.
Não invente público.
Não invente execução financeira.
Quando o dado não existir, informe de forma técnica que o dado não foi localizado no sistema.
Escreva com coerência de prestação de contas e relatório institucional.
Para público igual a zero, trate como N/A.
Para cada atividade, gere uma descrição técnica curta, de 1 parágrafo, baseada no nome, museu, classificação, público e descrição original.
Não transforme a descrição em texto promocional.

Dados consolidados:
${JSON.stringify(contextoReduzido, null, 2)}

Retorne somente JSON válido, sem markdown, no formato:
{
  "introducao": "texto institucional de 2 a 4 parágrafos",
  "resumo_geral": "síntese técnica de 2 a 4 parágrafos",
  "comunicacao": "síntese técnica da comunicação com base nos dados disponíveis",
  "prestacao": "texto de prestação de contas com leitura financeira e operacional",
  "conclusao": "conclusão técnica objetiva",
  "atividades_descricoes": [
    {
      "indice": 1,
      "nome": "nome da atividade",
      "descricao": "descrição técnica da atividade em 1 parágrafo"
    }
  ]
}
`;
}

function textosFallback(contexto = {}) {
  const atividades = Array.isArray(contexto.atividades) ? contexto.atividades : [];

  return {
    introducao:
      `O relatório consolida a execução física e financeira do projeto Museus Centro no período selecionado. A leitura considera relatórios aprovados pela coordenação, atividades registradas, público informado, rubricas orçamentárias, compras e notas fiscais disponíveis no sistema.`,

    resumo_geral:
      `No período analisado foram identificadas ${fmtInt(contexto.total_atividades)} atividades e público total de ${fmtInt(contexto.publico_total)} pessoas. Os dados foram organizados por museu, classificação e vínculo financeiro, preservando a rastreabilidade entre execução física, registros administrativos e orçamento.`,

    comunicacao:
      `A comunicação foi analisada a partir dos registros disponíveis no sistema. Quando não há indicadores específicos de alcance, a leitura considera as atividades, anexos e registros textuais vinculados aos relatórios aprovados.`,

    prestacao:
      `A execução financeira considera orçamento oficial de ${fmtBRL(TOTAL_OFICIAL)}, valor utilizado de ${fmtBRL(contexto.valor_utilizado)} e saldo de ${fmtBRL(contexto.saldo)}. As compras e notas fiscais listadas foram extraídas das solicitações disponíveis no sistema, sem alteração dos dados de origem.`,

    conclusao:
      `O conjunto de informações permite acompanhar a execução do projeto com base em dados verificáveis. A consolidação apoia o monitoramento técnico, a prestação de contas e a tomada de decisão da coordenação.`,

    atividades_descricoes: atividades.map((atividade, index) => {
      const publico = fmtPublico(atividade.publico);
      const descricaoBase =
        atividade.descricao ||
        atividade.resumo ||
        atividade.observacoes ||
        atividade.resultado ||
        atividade.resultados ||
        '';

      return {
        indice: index + 1,
        nome: atividade.nome || 'Atividade sem título',
        descricao: descricaoBase
          ? `${descricaoBase}`
          : `A atividade ${atividade.nome || 'sem título'} foi registrada no relatório aprovado, vinculada a ${atividade.museu || 'museu não informado'}, com classificação ${atividade.classificacao || 'não informada'} e público ${publico}.`,
      };
    }),
  };
}

function normalizarDescricoesAtividades(result, contexto) {
  const fallback = textosFallback(contexto);
  const atividades = Array.isArray(contexto.atividades) ? contexto.atividades : [];
  const resultList = Array.isArray(result?.atividades_descricoes) ? result.atividades_descricoes : [];

  return atividades.map((atividade, index) => {
    const indice = index + 1;
    const encontrado = resultList.find((item) => Number(item?.indice) === indice) || resultList[index];

    return {
      indice,
      nome: atividade.nome || encontrado?.nome || fallback.atividades_descricoes[index]?.nome || 'Atividade sem título',
      descricao:
        encontrado?.descricao ||
        fallback.atividades_descricoes[index]?.descricao ||
        `Atividade registrada no relatório aprovado pela coordenação.`,
    };
  });
}

export async function gerarTextosRelatorioFisicoFinanceiro(contexto = {}, usarIA = true) {
  const fallback = textosFallback(contexto);

  if (!usarIA) {
    return fallback;
  }

  try {
    if (!base44?.integrations?.Core?.InvokeLLM) {
      return fallback;
    }

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: buildPersonaPrompt(contexto),
      response_json_schema: {
        type: 'object',
        properties: {
          introducao: { type: 'string' },
          resumo_geral: { type: 'string' },
          comunicacao: { type: 'string' },
          prestacao: { type: 'string' },
          conclusao: { type: 'string' },
          atividades_descricoes: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                indice: { type: 'number' },
                nome: { type: 'string' },
                descricao: { type: 'string' },
              },
            },
          },
        },
      },
    });

    return {
      ...fallback,
      ...(result || {}),
      atividades_descricoes: normalizarDescricoesAtividades(result || {}, contexto),
    };
  } catch (error) {
    console.warn('IA indisponível. Usando textos técnicos locais.', error);
    return fallback;
  }
}

export default gerarTextosRelatorioFisicoFinanceiro;
