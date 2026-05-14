import { base44 } from '@/api/base44Client';

const MIN_CHARS = 600;
const MAX_ACTIVITY_WORDS = 210;

const FORBIDDEN_OPENINGS = [
  'o presente relatório',
  'este relatório',
  'a atividade foi registrada',
  'a atividade',
  'foi realizada',
  'teve como objetivo',
  'buscou promover',
  'em síntese',
  'dessa forma',
  'nesse sentido',
];

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

function fmtInt(value) {
  return toNumber(value).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitParagraphs(text) {
  return String(text || '')
    .split(/\n{2,}|\r?\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

function sentenceCase(text) {
  const raw = String(text || '').trim();
  if (!raw) return '';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

function removeRepeatedParagraphs(text) {
  const seen = new Set();
  const result = [];

  splitParagraphs(text).forEach((paragraph) => {
    const signature = normalizeText(paragraph)
      .split(' ')
      .filter((word) => word.length > 3)
      .slice(0, 24)
      .join(' ');

    if (!signature || seen.has(signature)) return;

    const isNearDuplicate = Array.from(seen).some((item) => {
      const a = new Set(signature.split(' '));
      const b = new Set(item.split(' '));
      let overlap = 0;
      a.forEach((word) => {
        if (b.has(word)) overlap += 1;
      });
      return overlap / Math.max(1, Math.min(a.size, b.size)) > 0.78;
    });

    if (isNearDuplicate) return;

    seen.add(signature);
    result.push(paragraph);
  });

  return result.join('\n\n');
}

function reduceForbiddenOpenings(text) {
  const paragraphs = splitParagraphs(text);

  return paragraphs.map((paragraph, index) => {
    let p = paragraph.trim();
    const normalized = normalizeText(p);

    if (index > 0 && normalized.startsWith('o presente relatorio')) {
      p = p.replace(/^O presente relatório\s*/i, 'A sistematização ');
    }

    if (index > 0 && normalized.startsWith('este relatorio')) {
      p = p.replace(/^Este relatório\s*/i, 'A análise consolidada ');
    }

    if (normalized.startsWith('a atividade foi registrada')) {
      p = p.replace(/^A atividade foi registrada[^.]*\.\s*/i, 'O registro integra a documentação aprovada pela coordenação. ');
    }

    if (normalized.startsWith('a atividade ')) {
      p = p.replace(/^A atividade\s*/i, 'No período consolidado, ');
    }

    return sentenceCase(p);
  }).join('\n\n');
}

function postProcessText(text, fallback) {
  const base = String(text || '').trim() || String(fallback || '').trim();
  let cleaned = removeRepeatedParagraphs(base);
  cleaned = reduceForbiddenOpenings(cleaned);
  cleaned = cleaned
    .replace(/\b(o presente relatório)\b/gi, 'o documento')
    .replace(/\b(esse relatório marca|este relatório marca)\b/gi, 'esta etapa evidencia')
    .replace(/\b(importante)\b/gi, 'estratégico')
    .replace(/\b(relevante)\b/gi, 'significativo')
    .replace(/\s+([,.])/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (cleaned.length >= MIN_CHARS) return cleaned;

  const complement = String(fallback || '').trim();
  return removeRepeatedParagraphs([cleaned, complement].filter(Boolean).join('\n\n')).trim();
}

function ensureMinText(text, fallback) {
  const processed = postProcessText(text, fallback);
  if (processed.length >= MIN_CHARS) return processed;

  return `${processed}\n\nA leitura foi estruturada a partir dos relatórios aprovados pela coordenação e dos registros disponíveis no sistema do projeto. A análise considera a natureza da ação, sua vinculação institucional, sua função dentro do ciclo de execução e sua contribuição para a memória técnica do Museus Centro. Quando uma ação não corresponde a atendimento direto de público, o indicador é tratado como N/A, preservando a consistência metodológica do relatório.`.trim();
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

function eixoEditorial(categoria) {
  const map = {
    gestao_governanca: 'governança, memória técnica, articulação institucional e organização do trabalho coletivo',
    producao_operacao: 'produção cultural, operação, infraestrutura, montagem, manutenção e sustentação técnica da programação',
    comunicacao_produtos: 'comunicação pública, documentação, circulação de informações, registro visual e mediação com públicos ampliados',
    atividade_publico: 'educação museal, mediação cultural, formação de público, participação social e experiências de visitação',
  };

  return map[categoria] || 'execução institucional do projeto';
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
    eixo_interpretativo: eixoEditorial(atividade.categoria_editorial),
    descricao_original: atividade.descricao_original || atividade.descricao,
    evidencia_operacional: atividade.evidencia_operacional,
    sinopse_agenda: atividade.sinopse_agenda,
    programacao_vinculada: atividade.programacao_vinculada,
    fotos: Array.isArray(atividade.fotos_destaque) ? atividade.fotos_destaque.length : 0,
  };
}

function buildPrompt(contexto = {}) {
  const atividades = Array.isArray(contexto.atividades) ? contexto.atividades : [];
  const trechos = Array.isArray(contexto.trechos_relatorios) ? contexto.trechos_relatorios : [];
  const conhecimento = Array.isArray(contexto.conhecimento) ? contexto.conhecimento : [];

  const payload = {
    periodo: contexto.periodo_extenso || '2 de fevereiro a 30 de abril de 2026',
    total_relatorios: contexto.total_relatorios || 0,
    publico_total: contexto.publico_total || 0,
    museu: contexto.museu || 'Todos',
    valor_utilizado: contexto.valor_utilizado,
    saldo: contexto.saldo,
    percentual_execucao: contexto.percentual_execucao,
    total_compras: contexto.total_compras,
    por_museu: contexto.por_museu || {},
    auditoria_visual: contexto.auditoria_visual || {},
    atividades: atividades.slice(0, 180).map(buildAtividadeResumo),
    trechos_reais: trechos.slice(0, 140),
    base_conhecimento: conhecimento.slice(0, 70),
  };

  return `
Você escreve como um editor institucional e curatorial do projeto Museus Centro.

Idioma: português do Brasil.

Padrão textual esperado:
- relatório cultural e museológico de alto nível;
- linguagem institucional, técnica, humana e analítica;
- estilo compatível com publicação de museus públicos, fundações culturais e prestação de contas cultural;
- sem tom promocional, sem slogan e sem excesso de adjetivos;
- sem aparência de texto automático.

Regras de qualidade obrigatórias:
1. Não iniciar parágrafos repetidamente com "Este relatório", "O presente relatório", "A atividade", "Foi realizada" ou "Teve como objetivo".
2. Não repetir o mesmo conceito em seções diferentes.
3. Variar o tamanho dos parágrafos e a estrutura das frases.
4. Transformar dados operacionais em leitura institucional, sem inventar informação.
5. Usar contexto territorial, museológico, educativo, patrimonial e de gestão cultural quando houver base nos dados.
6. Diferenciar claramente ações públicas, rotinas internas, produção, comunicação, manutenção, gestão e mediação cultural.
7. Tratar público como N/A quando não houver atendimento direto de público.
8. Não inventar números, datas, locais, fotos, nomes de pessoas ou atividades.
9. Não criar seção isolada de notas fiscais; compras e notas entram apenas na leitura de prestação de contas.
10. Explicar a execução financeira pelo cronograma do projeto, destacando que custos maiores virão com exposições, manutenção, fornecedores, adequações e programação ampliada.
11. Usar trechos reais, programação vinculada, evidências operacionais e base de conhecimento como insumo semântico.
12. Cada descrição de atividade deve ser única, com até ${MAX_ACTIVITY_WORDS} palavras, conectando nome, data, local, eixo, museu, público quando houver e função institucional.
13. Se a atividade for técnica ou interna, explicar sua função no ciclo de execução sem tratá-la como ação pública.
14. Se a atividade tiver público, relacionar sua contribuição à formação de público, mediação cultural, participação e acesso.
15. Evitar palavras excessivamente repetidas: importante, relevante, promover, fortalecer, buscou, realizou, presente relatório, dessa forma, nesse sentido.

Orientação editorial por eixo:
- Gestão e governança: enfatizar coordenação, pactuação institucional, memória técnica, rastreabilidade, validação de dados e articulação com a Diretoria de Museus.
- Produção e operações: enfatizar bastidores da execução, infraestrutura, condições de realização, montagem, manutenção, fornecedores, logística e sustentação das atividades.
- Comunicação e produtos: enfatizar documentação, circulação pública, produção de materiais, cobertura, tradução das ações para públicos ampliados e memória visual.
- Atividades com público: enfatizar mediação, educação museal, presença territorial, experiência dos participantes, acesso, vínculos com acervos, patrimônio e formação de público.

Dados disponíveis:
${JSON.stringify(payload, null, 2)}

Retorne JSON válido, sem markdown:
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
      "descricao": "..."
    }
  ]
}
`;
}

function fallbackIntro(contexto = {}) {
  const periodo = contexto?.periodo_extenso || '2 de fevereiro a 30 de abril de 2026';
  const totalRelatorios = toNumber(contexto?.total_relatorios);

  return `
Entre ${periodo}, o Museus Centro avançou na consolidação de uma rotina integrada de registro, acompanhamento e análise das ações desenvolvidas no Museu Histórico Abílio Barreto, no Museu da Moda e no Museu da Imagem e do Som. A documentação reúne ${fmtInt(totalRelatorios)} relatórios aprovados e organiza, em uma mesma leitura, atividades educativas, processos de produção, comunicação, gestão, manutenção e acompanhamento financeiro.

A parceria com a Diretoria de Museus da Fundação Municipal de Cultura de Belo Horizonte estrutura o horizonte institucional do projeto e orienta a articulação entre memória urbana, patrimônio, formação de público e qualificação da gestão cultural. O relatório não se limita a enumerar entregas: ele interpreta o ciclo de execução, diferencia ações abertas ao público de rotinas internas e evidencia a infraestrutura técnica necessária para que a programação aconteça nos museus.

A sistematização foi realizada com apoio de aplicativo desenvolvido especificamente para o Museus Centro. A ferramenta integra relatórios, programação, fotografias, documentos administrativos, rubricas e informações financeiras, criando uma base de evidências mais consistente para acompanhamento pela coordenação e pela Diretoria de Museus. A inteligência artificial foi utilizada como camada auxiliar de auditoria e qualificação textual, sem substituir a validação humana das equipes responsáveis.
`.trim();
}

function fallbackResumo(contexto = {}) {
  const totalRelatorios = toNumber(contexto?.total_relatorios);
  const publico = toNumber(contexto?.publico_total);
  const atividades = Array.isArray(contexto?.atividades) ? contexto.atividades : [];
  const atividadesPublico = atividades.filter((a) => a?.categoria_editorial === 'atividade_publico').length;

  return `
A consolidação do período organiza ${fmtInt(totalRelatorios)} relatórios aprovados e ${fmtInt(atividades.length)} registros de ação, dos quais ${fmtInt(atividadesPublico)} correspondem a atividades com público direto. O público total contabilizado foi de ${fmtInt(publico)} pessoas, considerando apenas oficinas, visitas mediadas, ações educativas, atividades abertas e experiências de formação de público. Rotinas de gestão, produção, comunicação, manutenção, reuniões e acompanhamentos técnicos foram mantidos como N/A para evitar distorções nos indicadores.

Essa separação qualifica a leitura físico-financeira. O que aparece como atividade sem público não representa ausência de execução, mas trabalho de base: planejamento, articulação, montagem, cobertura, organização de pauta, manutenção de espaços, acompanhamento de fornecedores e estruturação documental. Tais processos sustentam a presença pública dos museus e permitem que a programação se realize com maior consistência operacional.

A leitura integrada também revela amadurecimento na produção de dados. Ao aproximar relatos, programação, fotos, documentos e rubricas, o projeto passa a formar uma memória técnica capaz de apoiar decisões, corrigir inconsistências e ampliar a transparência da execução. O relatório, assim, funciona como instrumento de prestação de contas e como registro institucional do processo de construção do Museus Centro.
`.trim();
}

function fallbackPrestacao(contexto = {}) {
  const valor = fmtBRL(contexto?.valor_utilizado);
  const saldo = fmtBRL(contexto?.saldo);
  const pct = toNumber(contexto?.percentual_execucao).toFixed(1).replace('.', ',');

  return `
A execução financeira registrada até o período consolidado alcança ${valor}, com saldo disponível de ${saldo} e percentual de execução de ${pct}%. A leitura desses números precisa ser vinculada ao cronograma físico do projeto: os primeiros meses concentram estruturação, planejamento, contratação de equipes, rotinas de produção, comunicação, manutenção inicial e organização documental, enquanto despesas de maior porte se intensificam nas etapas posteriores.

Os custos mais expressivos estão associados a exposições, adequações de espaços, fornecedores, infraestrutura, manutenção, ações educativo-culturais e ampliação da programação. Por isso, o percentual financeiro inicial não deve ser interpretado isoladamente como baixa execução, mas como reflexo da curva prevista de desembolso. A análise físico-financeira deve observar a correspondência entre entregas, documentação de suporte, centros de custo, rubricas e solicitações aprovadas.

A organização das compras e notas fiscais no sistema fortalece a rastreabilidade da prestação de contas. Cada lançamento passa a dialogar com o acompanhamento das rubricas e com a leitura das atividades, permitindo que a execução financeira seja compreendida como parte do processo institucional mais amplo de gestão cultural, e não apenas como listagem administrativa de despesas.
`.trim();
}

function fallbackConclusao(contexto = {}) {
  return `
O período consolidado demonstra avanço na estruturação técnica, administrativa e cultural do Museus Centro. A separação entre ações públicas e rotinas internas tornou os indicadores mais confiáveis, ao mesmo tempo em que evidenciou o volume de trabalho necessário para sustentar programação, mediação, comunicação, manutenção e gestão dos museus envolvidos.

A integração entre relatórios aprovados, registros fotográficos, programação, dados financeiros e documentação administrativa cria uma base de acompanhamento mais robusta para as próximas etapas. O uso do aplicativo próprio e da inteligência artificial como apoio à auditoria contribui para qualificar a prestação de contas, reduzir inconsistências e fortalecer a memória institucional do projeto.

A continuidade do Museus Centro deve aprofundar essa metodologia, ampliando a relação entre dados de público, qualidade da experiência cultural, ocupação dos espaços, gestão de rubricas e produção de evidências. O relatório aponta, portanto, para uma etapa de maior maturidade operacional, com condições mais sólidas para monitoramento, transparência e qualificação das entregas pactuadas.
`.trim();
}

function fallbackCapitulo(contexto = {}, categoria = 'gestao_governanca') {
  const atividades = Array.isArray(contexto?.atividades_por_categoria?.[categoria])
    ? contexto.atividades_por_categoria[categoria]
    : [];

  const label = categoriaLabel(categoria);
  const eixo = eixoEditorial(categoria);

  return `
O eixo ${label} reúne ${fmtInt(atividades.length)} registros associados a ${eixo}. A leitura desses registros permite compreender dimensões do projeto que nem sempre se traduzem em público direto, mas que são decisivas para a continuidade da programação e para a qualidade da execução institucional.

As informações foram organizadas a partir dos relatórios aprovados, das evidências operacionais e dos vínculos existentes no sistema. Essa metodologia evita que processos internos sejam confundidos com ações abertas ao público, ao mesmo tempo em que reconhece sua função na produção cultural, na preservação da memória técnica e na coordenação entre equipes, museus e gestão pública.

No conjunto, o eixo contribui para demonstrar que a execução do Museus Centro depende de uma rede de trabalho articulada, envolvendo planejamento, acompanhamento, comunicação, operação, documentação e mediação. A análise por natureza institucional amplia a compreensão do projeto e qualifica a prestação de contas.
`.trim();
}

function fallbackAtividade(atividade = {}) {
  const nome = atividade?.nome || 'Atividade sem título';
  const museu = atividade?.museu || 'museu de referência';
  const eixo = categoriaLabel(atividade?.categoria_editorial);
  const publico = atividade?.publico_label || 'N/A';
  const local = atividade?.local ? ` no espaço ${atividade.local}` : '';
  const data = atividade?.data ? ` em ${String(atividade.data).slice(0, 10)}` : '';
  const evidencia = atividade?.evidencia_operacional || atividade?.sinopse_agenda || atividade?.descricao_original || atividade?.descricao || '';

  if (atividade?.categoria_editorial === 'atividade_publico') {
    return `
${nome}, vinculada ao ${museu}${local}${data}, integra o eixo ${eixo} e compõe a leitura de participação pública do período. O público registrado foi de ${publico}, indicador considerado na consolidação por se tratar de ação diretamente relacionada à experiência dos participantes, à mediação cultural e à formação de vínculos entre museu, território e comunidade.

${evidencia ? `A documentação disponível informa: ${evidencia}` : 'O registro foi validado a partir dos relatórios aprovados e dos dados consolidados no sistema.'} A atividade contribui para a compreensão do museu como espaço de encontro, aprendizagem e circulação cultural, articulando programação, presença de público e produção de memória institucional.
`.trim();
  }

  return `
${nome}, vinculada ao ${museu}${local}${data}, foi classificada no eixo ${eixo}. Embora não corresponda a atendimento direto de público, sua presença no relatório é necessária para registrar os bastidores da execução, a organização técnica e os processos que sustentam a programação cultural dos museus.

${evidencia ? `A documentação disponível informa: ${evidencia}` : 'O registro foi validado a partir dos relatórios aprovados e dos dados consolidados no sistema.'} Por essa razão, o público é apresentado como N/A, preservando a consistência dos indicadores e diferenciando trabalho institucional de ação pública contabilizável.
`.trim();
}

function fallbackTextos(contexto = {}) {
  const resumo = fallbackResumo(contexto);

  return {
    introducao: fallbackIntro(contexto),
    resumo_geral: resumo,
    publico_alcancado: resumo,
    producao_executiva: resumo,
    prestacao: fallbackPrestacao(contexto),
    conclusao: fallbackConclusao(contexto),
    capitulos: {
      gestao_governanca: fallbackCapitulo(contexto, 'gestao_governanca'),
      producao_operacao: fallbackCapitulo(contexto, 'producao_operacao'),
      comunicacao_produtos: fallbackCapitulo(contexto, 'comunicacao_produtos'),
      atividade_publico: fallbackCapitulo(contexto, 'atividade_publico'),
    },
    atividades_descricoes: (contexto?.atividades || []).map((atividade, index) => ({
      indice: index + 1,
      descricao: fallbackAtividade(atividade),
    })),
  };
}

function limitWords(text, maxWords = MAX_ACTIVITY_WORDS) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return String(text || '').trim();
  return `${words.slice(0, maxWords).join(' ')}.`;
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
        descricao: limitWords(postProcessText(item.descricao, fallbackItem.descricao), MAX_ACTIVITY_WORDS),
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
