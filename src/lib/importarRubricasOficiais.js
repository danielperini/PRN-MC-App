/**
 * importarRubricasOficiais.js
 *
 * Importação idempotente das 72 rubricas oficiais do 3º Aditivo.
 * Executa no frontend via base44.entities.Rubrica.
 *
 * Regras:
 *  - Atualiza rubricas existentes pela chave: grupo + rubrica + meta (normalizada)
 *  - Cria somente as que não existem
 *  - Inativa rubricas antigas do 3º Aditivo que não estão na planilha nova
 *  - Não duplica
 *  - Não apaga solicitações, anexos, pagamentos ou histórico
 */

import { base44 } from '@/api/base44Client';
import { getRubricasOficiais3Aditivo, TOTAL_OFICIAL_3_ADITIVO } from './rubricasOficiais3Aditivo';

function normalizeKey(str = '') {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function buildChave(r = {}) {
  const grupo = normalizeKey(r?.grupo || '');
  const rubrica = normalizeKey(r?.rubrica || r?.nome || '');
  const meta = normalizeKey(r?.meta || '');
  return `${grupo}::${rubrica}::${meta}`;
}

/**
 * Rubricas legadas que devem ser inativadas quando a planilha nova trouxe rubricas separadas.
 * Identificadas pela aba "Alterações" da planilha.
 */
const LEGADAS_PARA_INATIVAR = [
  'producao mis/mumo/mhab',
  'producao mis / mumo / mhab',
  'educador mis / mumo / mhab',
  'educador mis/mumo/mhab',
  'infraestrutura mis/mumo/mhab',
  'infraestrutura mis / mumo / mhab',
  'diarias mis/mumo/mhab',
  'diarias mis / mumo / mhab',
  'material mis/mumo/mhab',
  'material mis / mumo / mhab',
];

function isLegadaParaInativar(r = {}) {
  const nome = normalizeKey(r?.rubrica || r?.nome || '');
  return LEGADAS_PARA_INATIVAR.some((leg) => nome.includes(leg));
}

function is3Aditivo(r = {}) {
  const origem = String(r?.origem_recurso || '').toLowerCase();
  return origem.includes('3') && (origem.includes('aditivo') || origem.includes('adit'));
}

export async function importarRubricasOficiais({ onProgress } = {}) {
  const oficiais = getRubricasOficiais3Aditivo();
  const totalOficial = oficiais.reduce((acc, r) => acc + (r.valor_total || 0), 0);

  if (totalOficial !== TOTAL_OFICIAL_3_ADITIVO) {
    console.warn(`[importarRubricasOficiais] Total calculado R$${totalOficial} difere do esperado R$${TOTAL_OFICIAL_3_ADITIVO}`);
  }

  onProgress?.({ fase: 'carregando', msg: 'Carregando rubricas existentes...' });

  // Busca todas as rubricas existentes
  const existentes = await base44.entities.Rubrica.list('rubrica', 2000);
  const existentesArr = Array.isArray(existentes) ? existentes : [];

  // Mapa por chave normalizada
  const mapaExistentes = new Map();
  existentesArr.forEach((r) => {
    const chave = buildChave(r);
    mapaExistentes.set(chave, r);
    // também indexar pela chave _chave_oficial se existir
    if (r?._chave_oficial) mapaExistentes.set(r._chave_oficial, r);
  });

  let criadas = 0;
  let atualizadas = 0;
  let inativadas = 0;

  // Mapa de chaves oficiais para controle de inativação
  const chavesOficiais = new Set(oficiais.map((r) => r._chave_oficial));

  onProgress?.({ fase: 'importando', msg: `Importando ${oficiais.length} rubricas...` });

  for (const oficial of oficiais) {
    const chave = oficial._chave_oficial;
    const existente = mapaExistentes.get(chave);

    const payload = {
      rubrica: oficial.rubrica,
      nome: oficial.rubrica,
      item_rubrica: oficial.rubrica,
      grupo: oficial.grupo,
      meta: oficial.meta,
      descricao: oficial.nome_natureza,
      natureza_despesa: oficial.natureza_despesa,
      nome_natureza: oficial.nome_natureza,
      numero_natureza: oficial.numero_natureza,
      unidade: oficial.unidade,
      quantidade: oficial.quantidade,
      periodo_frequencia: oficial.periodo_frequencia,
      numero_parcelas_unidades: oficial.numero_parcelas_unidades,
      valor_unitario: oficial.valor_unitario,
      valor_rubrica: oficial.valor_total,
      valor_total: oficial.valor_total,
      origem_recurso: oficial.origem_recurso,
      conferencia_valor: oficial.conferencia_valor,
      museu_codigo: oficial.museu_codigo,
      escopo_orcamentario: oficial.escopo_orcamentario,
      ativo: true,
      _chave_oficial: chave,
    };

    if (existente) {
      // Atualiza sem tocar em valor_utilizado, saldo, etc.
      await base44.entities.Rubrica.update(existente.id, {
        ...payload,
        // Preserva valor_utilizado existente
        valor_utilizado: existente.valor_utilizado ?? 0,
        saldo: (oficial.valor_total || 0) - (existente.valor_utilizado ?? 0),
      });
      atualizadas++;
    } else {
      await base44.entities.Rubrica.create({
        ...payload,
        valor_utilizado: 0,
        saldo: oficial.valor_total,
        saldo_real: oficial.valor_total,
        percentual_utilizado: 0,
        ordem_exibicao: oficial.ordem_exibicao || 0,
      });
      criadas++;
    }
  }

  // Inativar rubricas do 3º Aditivo que não estão na planilha nova
  onProgress?.({ fase: 'inativando', msg: 'Verificando rubricas legadas...' });

  for (const existente of existentesArr) {
    if (!is3Aditivo(existente)) continue;
    const chave = buildChave(existente);
    if (chavesOficiais.has(chave)) continue;
    if (existente.ativo === false) continue;
    // Inativa rubricas legadas do 3º Aditivo não presentes na planilha nova
    if (isLegadaParaInativar(existente) || is3Aditivo(existente)) {
      await base44.entities.Rubrica.update(existente.id, { ativo: false });
      inativadas++;
    }
  }

  const resultado = {
    ok: true,
    totalOficial: totalOficial,
    totalEsperado: TOTAL_OFICIAL_3_ADITIVO,
    totalRubricas: oficiais.length,
    criadas,
    atualizadas,
    inativadas,
    validacoes: {
      totalCorreto: totalOficial === TOTAL_OFICIAL_3_ADITIVO,
      quantidadeCorreta: oficiais.length === 72,
    },
  };

  onProgress?.({ fase: 'concluido', msg: `Concluído: ${criadas} criadas, ${atualizadas} atualizadas, ${inativadas} inativadas.`, resultado });
  return resultado;
}