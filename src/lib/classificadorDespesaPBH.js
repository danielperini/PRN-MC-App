/**
 * Classificador de despesa por item — PBH.
 *
 * A natureza econômica vem do plano de trabalho e o item é conciliado com o
 * "Classificador de Despesa" da PBH. A regra determinística é sempre usada
 * primeiro. A IA só entra para rubricas sem item oficial ou sem correspondência
 * segura, para não alterar classificações fiscais já definidas pelo plano.
 */
import { InvokeLLM } from '@/lib/aiClient';

const ITENS_PBH = {
  '339030': {
    '04': 'Combustíveis e lubrificantes automotivos',
    '12': 'Material de expediente',
    '14': 'Material elétrico e eletrônico',
    '15': 'Material educativo e esportivo',
    '17': 'Material para esporte e lazer',
    '18': 'Material para áudio, vídeo e foto',
    '19': 'Material gráfico',
    '20': 'Material de tecnologia da informação',
  },
  '339035': {
    '01': 'Serviços de consultoria',
    '02': 'Consultoria em tecnologia da informação',
    '03': 'Consultoria contábil',
    '04': 'Consultoria jurídica',
  },
  '339037': {
    '01': 'Apoio de limpeza e conservação',
    '02': 'Apoio de vigilância ostensiva',
    '03': 'Apoio administrativo',
    '04': 'Serviços técnicos profissionais',
    '05': 'Outras locações de mão de obra',
  },
  '339039': {
    '03': 'Exposições, congressos e conferências',
    '04': 'Energia elétrica',
    '05': 'Serviços de água e esgoto',
    '12': 'Fornecimento de alimentação',
    '13': 'Serviços gráficos',
    '17': 'Locação de máquinas e equipamentos',
    '18': 'Locação de veículos',
    '19': 'Fretes e transportes de encomendas',
    '22': 'Exposições, congressos e conferências',
    '23': 'Publicidade e propaganda',
    '24': 'Serviços de áudio, vídeo e foto',
    '28': 'Manutenção e conservação de bens imóveis',
    '29': 'Manutenção e conservação de máquinas e equipamentos',
    '40': 'Vigilância ostensiva',
    '41': 'Limpeza e conservação',
    '42': 'Apoio administrativo, técnico e operacional',
    '46': 'Serviços judiciários',
    '53': 'Serviços de comunicação em geral',
    '55': 'Serviços de comunicação',
    '99': 'Outros serviços de terceiros — pessoa jurídica',
  },
};

function normalizar(value = '') {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function natureDigits(value = '') {
  return String(value || '').replace(/\D/g, '').slice(-6);
}

function itemDigits(value = '') {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits || digits.length > 2) return '';
  return digits.padStart(2, '0');
}

export function formatarCodigoConciliacao(natureza, item) {
  const n = natureDigits(natureza);
  const i = itemDigits(item);
  if (!n || !i) return null;
  return `3.3.90.${n.slice(-2)}.${i}`;
}

function resultado(natureza, item, origem, confianca) {
  const descricao = ITENS_PBH[natureza]?.[item] || '';
  if (!descricao) return null;
  return {
    codigo_item_pbh: formatarCodigoConciliacao(natureza, item),
    item_pbh: item,
    descricao_item_pbh: descricao,
    classificacao_item_origem: origem,
    classificacao_item_confianca: confianca,
  };
}

function itemSemantico(natureza, texto) {
  const has = (...termos) => termos.some((termo) => texto.includes(termo));
  if (natureza === '339035') {
    if (has('contabil', 'contador')) return '03';
    if (has('juridic', 'advoc')) return '04';
    if (has('tecnologia', 'informatica', 'sistema', 'software', 'ti ')) return '02';
    if (has('consultor', 'consultoria')) return '01';
  }
  if (natureza === '339037') {
    if (has('seguranca', 'vigil')) return '02';
    if (has('limpeza', 'conservacao')) return '01';
    if (has('administrativ')) return '03';
    if (has('tecnico', 'profissional')) return '04';
  }
  if (natureza === '339039') {
    if (has('energia eletrica')) return '04';
    if (has('agua', 'esgoto')) return '05';
    if (has('lanche', 'buffet', 'alimentacao', 'refeicao')) return '12';
    if (has('impress', 'grafica', 'sinalizacao')) return '13';
    if (has('kit de iluminacao', 'locacao de equipamento', 'locacao equipamento')) return '17';
    if (has('van', 'onibus', 'fretamento', 'locacao de veiculo')) return '18';
    if (has('frete', 'carreto', 'transportadora')) return '19';
    if (has('apresentacao', 'evento', 'acao educativo', 'mostra', 'exposicao')) return '22';
    if (has('marketing', 'rede social', 'publicidade', 'propaganda', 'designer')) return '23';
    if (has('foto', 'fotograf', 'video', 'audiovisual')) return '24';
    if (has('manutencao') && has('imovel', 'predial')) return '28';
    if (has('manutencao')) return '29';
    if (has('seguranca', 'vigil')) return '40';
    if (has('limpeza', 'conservacao')) return '41';
    if (has('coorden', 'producao', 'educador', 'monitor', 'assistente', 'administrativ')) return '42';
    if (has('juridic', 'advoc')) return '46';
    if (has('comunicacao', 'imprensa')) return '53';
  }
  if (natureza === '339030') {
    if (has('combustivel', 'gasolina', 'diesel')) return '04';
    if (has('escritorio', 'expediente', 'papelaria')) return '12';
    if (has('eletrico', 'eletronico', 'led')) return '14';
    if (has('educativo', 'pedagogico', 'didatico')) return '15';
    if (has('esporte', 'lazer')) return '17';
    if (has('foto', 'video', 'audiovisual')) return '18';
    if (has('grafico', 'impress')) return '19';
    if (has('informatica', 'tecnologia', 'computador')) return '20';
  }
  return '';
}

/** Retorna a classificação oficial, ou null quando ela precisa da IA. */
export function classificarItemDespesaPBH(rubrica = {}) {
  const natureza = natureDigits(rubrica.natureza_despesa || rubrica.natureza || rubrica.numero_natureza);
  if (!ITENS_PBH[natureza]) return null;
  const texto = normalizar([
    rubrica.rubrica, rubrica.nome, rubrica.item_rubrica, rubrica.grupo,
    rubrica.descricao, rubrica.meta,
  ].filter(Boolean).join(' '));
  const semantico = itemSemantico(natureza, texto);
  if (semantico && ITENS_PBH[natureza][semantico]) return resultado(natureza, semantico, 'REGRA_SEMANTICA_PBH', 0.98);

  const itemPlano = itemDigits(rubrica.numero_natureza || rubrica.item_pbh);
  if (itemPlano && ITENS_PBH[natureza][itemPlano]) return resultado(natureza, itemPlano, 'PLANO_DE_TRABALHO', 1);
  return null;
}

/**
 * Fallback controlado: a IA escolhe somente entre os itens válidos da natureza
 * econômica já cadastrada. O resultado deve ser revisável e nunca muda valor,
 * meta, natureza ou rubrica.
 */
export async function classificarItemDespesaComIA(rubrica = {}) {
  const natureza = natureDigits(rubrica.natureza_despesa || rubrica.natureza || rubrica.numero_natureza);
  const opcoes = ITENS_PBH[natureza];
  if (!opcoes) throw new Error('A natureza econômica não possui itens PBH configurados.');
  const lista = Object.entries(opcoes).map(([item, descricao]) => `${item}: ${descricao}`).join('; ');
  const response = await InvokeLLM({
    model: 'gpt-4o-mini',
    prompt: `Classifique a rubrica abaixo no Classificador de Despesa PBH. Escolha EXATAMENTE um item da lista permitida. Não invente código.\n\nNatureza: ${natureza}\nRubrica: ${rubrica.rubrica || rubrica.nome || ''}\nGrupo: ${rubrica.grupo || ''}\nMeta: ${rubrica.meta || ''}\nDescrição: ${rubrica.descricao || ''}\n\nItens permitidos: ${lista}`,
    response_json_schema: {
      type: 'object',
      properties: {
        item: { type: 'string', description: 'Dois dígitos, obrigatoriamente um item permitido.' },
        confidence: { type: 'number', description: 'Número de 0 a 1.' },
      },
      required: ['item', 'confidence'],
      additionalProperties: false,
    },
  });
  const item = itemDigits(response?.item);
  if (!item || !opcoes[item]) throw new Error('A IA retornou um item PBH inválido.');
  return resultado(natureza, item, 'IA_REVISAVEL', Math.max(0, Math.min(1, Number(response?.confidence) || 0)));
}

export function descricaoCodigoConciliacao(rubrica = {}) {
  const classificacao = classificarItemDespesaPBH(rubrica);
  return classificacao?.codigo_item_pbh || rubrica.codigo_item_pbh || null;
}
