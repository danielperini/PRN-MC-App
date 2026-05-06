import { base44 } from '@/api/base44Client';

const TOTAL_OFICIAL = 1320000;

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

function buildPersonaPrompt(contexto) {
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

Dados consolidados:
${JSON.stringify(contexto, null, 2)}

Retorne somente JSON válido, sem markdown, no formato:
{
  "introducao": "texto institucional de 2 a 4 parágrafos",
  "resumo_geral": "síntese técnica de 2 a 4 parágrafos",
  "comunicacao": "síntese técnica da comunicação com base nos dados disponíveis",
  "prestacao": "texto de prestação de contas com leitura financeira e operacional",
  "conclusao": "conclusão técnica objetiva"
}
`;
}

function textosFallback(contexto = {}) {
  return {
    introducao:
      `O relatório consolida a execução física e financeira do projeto Museus Centro no período selecionado. A leitura considera relatórios aprovados, atividades registradas, público informado, rubricas orçamentárias, compras e notas fiscais disponíveis no sistema.`,

    resumo_geral:
      `No período analisado foram identificadas ${fmtInt(contexto.total_atividades)} atividades e público total de ${fmtInt(contexto.publico_total)} pessoas. Os dados foram organizados por museu, classificação e vínculo financeiro, preservando a rastreabilidade entre execução física, registros administrativos e orçamento.`,

    comunicacao:
      `A comunicação foi analisada a partir dos registros disponíveis no sistema. Quando não há indicadores específicos de alcance, a leitura considera as atividades, anexos e registros textuais vinculados aos relatórios aprovados.`,

    prestacao:
      `A execução financeira considera orçamento oficial de ${fmtBRL(TOTAL_OFICIAL)}, valor utilizado de ${fmtBRL(contexto.valor_utilizado)} e saldo de ${fmtBRL(contexto.saldo)}. As compras e notas fiscais listadas foram extraídas das solicitações disponíveis no sistema, sem alteração dos dados de origem.`,

    conclusao:
      `O conjunto de informações permite acompanhar a execução do projeto com base em dados verificáveis. A consolidação apoia o monitoramento técnico, a prestação de contas e a tomada de decisão da coordenação.`,
  };
}

export async function gerarTextosRelatorioFisicoFinanceiro(contexto = {}, usarIA = true) {
  if (!usarIA) {
    return textosFallback(contexto);
  }

  try {
    if (!base44?.integrations?.Core?.InvokeLLM) {
      return textosFallback(contexto);
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
        },
      },
    });

    return {
      ...textosFallback(contexto),
      ...(result || {}),
    };
  } catch (error) {
    console.warn('IA indisponível. Usando textos técnicos locais.', error);
    return textosFallback(contexto);
  }
}

export default gerarTextosRelatorioFisicoFinanceiro;

