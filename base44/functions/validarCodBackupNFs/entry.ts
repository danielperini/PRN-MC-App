import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * syncComprasCodFromPlanoTrabalho (validarCodBackupNFs)
 *
 * Sincroniza TODOS os registros de PurchaseRequest com o Plano de Trabalho oficial.
 * Fonte soberana: Plano de Trabalho (MAPA_N4 abaixo).
 * Fontes PROIBIDAS para definir cod: nome de arquivo, número de NF, IDs internos.
 *
 * Params: { dryRun?: boolean, force?: boolean, purchaseIds?: string[] }
 * - dryRun=false → grava no banco (DEFAULT)
 * - force=true   → sobrescreve inclusive status_cod=OK
 * - purchaseIds  → array de IDs específicos (vazio = todos)
 */

// ── Normalização canônica ──────────────────────────────────────────────────────
function norm(v: string): string {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-–—\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pad2(s: string | number): string {
  const str = String(s || '').replace(/\D/g, '');
  if (!str) return '';
  return str.padStart(2, '0');
}

// ── MAPA N4 OFICIAL COMPLETO ──────────────────────────────────────────────────
// Baseado integralmente no Plano de Trabalho + arquivo corrigido fornecido.
// CADA ENTRADA É INEQUÍVOCA — termos que geram ambiguidade ficam FORA do mapa
// e são resolvidos na função desempatarPorCentroCusto.
//
// PRIORIDADE: entradas mais específicas devem vir ANTES das genéricas.
// A busca retorna TODOS os códigos que batem; se >1, vai para desempate.

const MAPA_N4: Array<{ codigo: string; termos: string[] }> = [
  // ── 01: Consultorias ───────────────────────────────────────────────────────
  {
    codigo: '01',
    termos: [
      'consultoria de programacao',
      'consultorias de temas transversais',
      'consultoria temas transversais',
      'consultoria transversal',
      'assessoria juridica',
      'assessor juridico',
      'assessoria contabil',
      'contabilidade',
      'advogado',
      'advocacia',
      'rh assessoria contabil',
      'mario amaro',
      'formacao sobre ambiente seguro',
      'formacao ambiente seguro',
      'consultoria acessibilidade',
      'consultoria pedagogica',
      'ana luiza teixeira neves',
    ],
  },
  // ── 02: Segurança ─────────────────────────────────────────────────────────
  {
    codigo: '02',
    termos: [
      'seguranca ed 2026',
      'servico de seguranca',
      'locacao de mao de obra seguranca',
      'vigilancia patrimonial',
    ],
  },
  // ── 03: Manutenção e exposições (MHAB/MIS/MUMO específicos) ──────────────
  {
    codigo: '03',
    termos: [
      'manutencao mhab',
      'manutencao mis',
      'manutencao mumo',
      'mostra baixa complexidade mis',
      'mostra media complexidade mhab',
      'mostra pequena complexidade',
      'peca em destaque mhab',
      'peca em destaque mis',
      'peca em destaque mumo',
      'exposicao mumo',
      'manutencao da exposicao',
      'manutencao exposicao',
      'manutencao de exposicao',
      'montagem mostra',
      'manutencao rotina exposicoes',
    ],
  },
  // ── 04: Transporte/Combustível ────────────────────────────────────────────
  {
    codigo: '04',
    termos: [
      'combustivel',
      'gasolina',
      'abastecimento',
    ],
  },
  // ── 12: Lanche/buffet e Material de escritório/Despesas gerais ─────────────
  {
    codigo: '12',
    termos: [
      'lanchesbuffet',
      'lanches buffet',
      'fornecimento de lanche',
      'lanche e buffet',
      'coffee break',
      'cafe',
      'refeicao',
      'lanchonete',
      'panificadora',
      'ticket alimentacao',
      'ticket refeicao',
      'disponibilizacao de beneficio',
      'material de escritorio',
      'material escritorio',
      'cemig',
      'energia eletrica',
      'ajuda de custo viaduto',
      'conta de luz',
      'agua',
      'despesas gerais',
    ],
  },
  // ── 13: Sinalização ────────────────────────────────────────────────────────
  {
    codigo: '13',
    termos: [
      'sinalizacao ed 2026',
      'sinalizacao noturno',
      'servico grafico de sinalizacao',
      'sinalizacao para a edicao',
      'impressao mhab',
      'impressao mis',
      'impressao mumo',
      'flag impressao digital',
      'flag digital',
    ],
  },
  // ── 15: Material MIS/MUMO/MHAB (atividades educativas) ────────────────────
  {
    codigo: '15',
    termos: [
      'material mis mumo mhab',
      'material para acao educativa',
      'material para oficina',
      'material para atividade',
      'material educativo',
      'luva nitrilica',
      'tecido tricoline',
      'fios petropolis',
      'floricultura',
      'kalunga',
      'bh seg equipamentos',
      'eco print distribuidora',
    ],
  },
  // ── 17: Kit de Iluminação (Ed. 2026) ─────────────────────────────────────
  {
    codigo: '17',
    termos: [
      'kit de iluminacao ed 2026',
      'kit de iluminacao noturno',
      'kit iluminacao noturno',
      'arte em iluminar',
      'iluminacao museus centro',
      'locacao de iluminacao ed 2026',
    ],
  },
  // ── 18: Vans/transporte escolar ───────────────────────────────────────────
  {
    codigo: '18',
    termos: [
      'van ',
      ' vans ',
      'onibus',
      'micro onibus',
      'microonibus',
      'transporte escolar',
      'locacao de veiculo',
    ],
  },
  // ── 22: Ações educativo-culturais e Apresentações culturais ───────────────
  {
    codigo: '22',
    termos: [
      'acoes educativo culturais mis mumo mhab',
      'acoes educativo culturais',
      'acoes educativas',
      'acao educativa cultural',
      'acao educativa mis',
      'acao educativa mhab',
      'acao educativa mumo',
      'apresentacoes culturais 3 museus pbh',
      'apresentacoes mis mumo mhab',
      'apresentacoes mis mumo mhab ed 2026',
      'apresentacoes culturais ed 2026',
      'apresentacoes culturais 3 museus pbh ed 2026',
      'apresentacao cultural mhab',
      'apresentacao cultural mis',
      'apresentacao cultural mumo',
      'pesquisa e texto mhab',
      'pesquisa e texto mis',
      'pesquisa e texto mumo',
      'assistente administrativo',
      'assistente administrativa',
      'workshop',
      'oficina cultural',
      // Noturno Pampulha e 2026
      'contratacao de artistas e atracoes noturno pampulha',
      'contratacao de artistas e atracoes pampulha',
      'contratacao de artistas e atracoes',
      'apresentacoes culturais noturno pampulha',
      'apresentacao cultural pampulha',
    ],
  },
  // ── 23: Designer/Comunicação ──────────────────────────────────────────────
  {
    codigo: '23',
    termos: [
      'assessor de imprensa',
      'assessoria de imprensa',
      'rede social marketing cultural',
      'redes sociais',
      'rede social',
      'marketing cultural',
      'social media',
      'designer mhab',
      'designer mis',
      'designer mumo',
      'design grafico mhab',
      'design grafico mis',
      'design grafico mumo',
      'designer mes 19',
      'design grafico mes 19',
      'id designer',
      'id design',
      'identidade visual comunicacao',
      'redacao',
      'redator',
      'comunicacao e divulgacao noturno',
      'comunicacao e divulgacao pampulha',
      'comunicacao e divulgacao noturno pampulha',
      'divulgacao pampulha',
      'cs comunicacao e arte',
      'retina eletrica filmes',
      'estudio folha',
      'samira lopes mota',
      'engenharia e design ltda',
      'ammor design',
    ],
  },
  // ── 24: Fotógrafo/Vídeo ───────────────────────────────────────────────────
  {
    codigo: '24',
    termos: [
      'fotografo mes 19',
      'fotografa mes 19',
      'video e fotografia ed 2026',
      'video fotografia ed 2026',
      'audiovisual noturno',
      'noturno nos museus audiovisual',
      'cobertura fotografica noturno',
      'cobertura de video noturno',
      'daniel moreira art',
    ],
  },
  // ── 40: Mostra de média complexidade MHAB ────────────────────────────────
  {
    codigo: '40',
    termos: [
      'mostra media complexidade mhab',
      'montagem mostra mhab',
    ],
  },
  // ── 41: Limpeza ───────────────────────────────────────────────────────────
  {
    codigo: '41',
    termos: [
      'servico de limpeza ed 2026',
      'limpeza ed 2026',
      'limpeza noturno',
      'higienizacao',
    ],
  },
  // ── 42: Equipe/pessoal (educador, produção, coordenação, monitores, diárias)
  {
    codigo: '42',
    termos: [
      'coordenador geral mes 19',
      'coordenador geral mes',
      'coordenacao geral mes',
      'perini projetos',
      'daniel perini',
      'assistente de coordenacao e producao',
      'analista adm financeira',
      'analista administrativo financeiro',
      'josiane amancio',
      'producao mis mumo mhab',
      'producao mis',
      'producao mumo',
      'producao mhab',
      'producao mes 19',
      'produtora mes 19',
      'educador mis mumo mhab',
      'educador mis',
      'educador mumo',
      'educador mhab',
      'educadora mes 19',
      'educadora mis',
      'educadora mumo',
      'educadora mhab',
      'monitores ed 2026',
      'assistente de producao ed 2026',
      'assistente de producao noturno',
      'diarias mis mumo mhab',
      'diarias mis',
      'diarias mumo',
      'diarias mhab',
      'diaria de educador',
      'diaria educadora',
      'gestor administrativo financeiro',
      'mobilizador',
      'monitor noturno',
      'produtor pampulha',
      'equipe tecnica e coordenacao pampulha',
      'coordenacao noturno pampulha',
      'daniela isis',
      'wanda benevides',
      'isabella caroline de souza',
      'lara carvalho ferreira',
      'ana carolina motta rocha montalvao',
      'clara braga assumpcao',
      'clara assumpcao',
      'juliana cristina da silva',
    ],
  },
  // ── 53: Coordenador de Comunicação ────────────────────────────────────────
  {
    codigo: '53',
    termos: [
      'coordenador de comunicacao mes 19',
      'coordenadora de comunicacao mes 19',
      'coordenador comunicacao mes 19',
      'coordenadora comunicacao mes 19',
      'coord comunicacao mes',
      'fernanda monte mor',
      'ammor design coordenadora',
    ],
  },
  // ── 99: Infraestrutura (excl. sinalização e limpeza) ─────────────────────
  {
    codigo: '99',
    termos: [
      'infraestrutura 3 museus pbh ed 2026',
      'infraestrutura mis mumo mhab ed 2026',
      'infraestrutura mis mumo mhab',
      'infraestrutura mhab ed 2026',
      'infraestrutura mis ed 2026',
      'infraestrutura mumo ed 2026',
      'infraestrutura noturno',
      'producao e infraestrutura noturno pampulha',
      'producao e infraestrutura pampulha',
      'producao infraestrutura pampulha',
      'producao e infraestrutura noturno',
      'sonorizacao noturno',
      'sonorizacao museus',
      'sonorizacao pampulha',
      'sonorizacao museus pampulha',
      'servico de sonorizacao',
      'som e iluminacao',
      'fornecimento de agua noturno',
      'global support',
      'locacao de grades',
      'servico de carreto',
      'iluminacao museus pampulha',
      'servico de iluminacao museus pampulha',
      'iluminacao conica',
      'atelie do evento',
      'polvo studio',
      'fornecimento de lanche camarim',
      'camarim',
      'grade de protecao',
      'mobiliario evento',
    ],
  },
];

// ── Mapeamentos de rubrica → código (por nome exato normalizado) ─────────────
// Serve como "override" para casos onde o mapa por termos não é suficiente.
// Chave: nome normalizado da rubrica oficial (campo rubrica/nome/grupo)
const MAPA_RUBRICA_EXATA: Record<string, string> = {
  'assessor de imprensa mes 19 ao 28': '23',
  'assessora de imprensa mes 19 ao 28': '23',
  'assessoria de imprensa mes 19 ao 28': '23',
  'rede social marketing cultural mes 19 ao 28': '23',
  'designer mes 19 ao 28': '23',
  'designer mhab': '23',
  'design grafico mhab': '23',
  'id designer ed 2026': '23',
  'coordenador de comunicacao mes 19 ao 28': '53',
  'coordenadora de comunicacao mes 19 ao 28': '53',
  'coordenador comunicacao mes 19 ao 28': '53',
  'coordenadora comunicacao mes 19 ao 28': '53',
  'coordenador geral mes 19 ao 28': '42',
  'coordenador geral': '42',
  'assistente administrativo mes 19 ao 28': '22',
  'assistente administrativa mes 19 ao 28': '22',
  'acoes educativo culturais mis mumo mhab': '22',
  'acoes educativo culturais': '22',
  'apresentacoes culturais 3 museus pbh ed 2026': '22',
  'apresentacoes mis mumo mhab ed 2026': '22',
  'fotografo mes 19 ao 28': '24',
  'fotografia mes 19 ao 28': '24',
  'video e fotografia ed 2026': '24',
  'producao mis mumo mhab mes 19 ao 28': '42',
  'educador mis mumo mhab mes 19 ao 28': '42',
  'educadora mis mumo mhab mes 19 ao 28': '42',
  'diarias mis mumo mhab': '42',
  'monitores ed 2026': '42',
  'assistente de producao ed 2026': '42',
  'assistente de coordenacao e producao': '42',
  'analista adm financeira mes 19 ao 28': '42',
  'analista administrativo financeira mes 19 ao 28': '42',
  'material mis mumo mhab mes 19 ao 28': '15',
  'material mis': '15',
  'material mumo': '15',
  'material mhab': '15',
  'lanchesbuffet mes 19 ao 28': '12',
  'lanches buffet mes 19 ao 28': '12',
  'material de escritorio': '12',
  'consultorias de temas transversais diversos': '01',
  'consultoria de programacao': '01',
  'seguranca ed 2026': '02',
  'limpeza ed 2026': '41',
  'kit de iluminacao ed 2026': '17',
  'sinalizacao ed 2026': '13',
  'infraestrutura 3 museus pbh ed 2026': '99',
  'infraestrutura mis mumo mhab ed 2026': '99',
  'producao e infraestrutura noturno pampulha': '99',
  'exposicao mumo': '03',
  'manutencao mhab mes 19 ao 28': '03',
  'manutencao mis mes 19 ao 28': '03',
  'peca em destaque mhab': '03',
  'mostra de baixa complexidade mis': '03',
  'mostra de media complexidade mhab': '40',
  'contratacao de artistas e atracoes noturno pampulha': '22',
};

// Conjunto oficial de códigos válidos
const CODIGOS_OFICIAIS = new Set(['01','02','03','04','12','13','15','17','18','22','23','24','40','41','42','46','53','99']);

// ── Normalização para busca ────────────────────────────────────────────────────
function normBusca(rubrica: any): string {
  return norm([
    rubrica.rubrica || rubrica.nome || rubrica.item_rubrica || '',
    rubrica.grupo || '',
    rubrica.descricao || '',
    rubrica.meta_titulo || '',
  ].join(' '));
}

// ── Busca de código pelo nome/grupo da rubrica ────────────────────────────────
function buscarCodigoPorRubrica(rubrica: any, centroCustoCompra?: string): {
  codigo: string | null;
  matches: string[];
  status: 'ok' | 'ambiguo' | 'nao_encontrado';
  metodo: string;
} {
  const nomeRubrica = norm(rubrica.rubrica || rubrica.nome || rubrica.item_rubrica || '');
  const grupo = norm(rubrica.grupo || '');
  const texto = normBusca(rubrica);

  // 1. Rubrica.codigo já oficial?
  if (rubrica.codigo) {
    const padded = pad2(rubrica.codigo);
    if (CODIGOS_OFICIAIS.has(padded)) {
      return { codigo: padded, matches: [padded], status: 'ok', metodo: 'rubrica.codigo' };
    }
  }

  // 2. Mapa de rubrica exata (nome normalizado)
  for (const [chave, cod] of Object.entries(MAPA_RUBRICA_EXATA)) {
    if (texto.includes(chave) || nomeRubrica.includes(chave) || grupo.includes(chave)) {
      return { codigo: cod, matches: [cod], status: 'ok', metodo: 'mapa_exato' };
    }
  }

  // 3. Mapa N4 por termos (ordem de especificidade)
  const matchedCodes = new Set<string>();
  for (const entrada of MAPA_N4) {
    if (entrada.termos.some(t => texto.includes(t.trim()))) {
      matchedCodes.add(entrada.codigo);
    }
  }

  const matches = [...matchedCodes];
  if (matches.length === 0) return { codigo: null, matches, status: 'nao_encontrado', metodo: 'nenhum' };
  if (matches.length === 1) return { codigo: matches[0], matches, status: 'ok', metodo: 'mapa_n4' };

  // 4. Tentativa de desempate automático
  const desempate = desempatarPorCentroCusto(rubrica, centroCustoCompra || '', matches, texto);
  if (desempate) {
    return { codigo: desempate, matches, status: 'ok', metodo: 'desempate_centro_custo' };
  }

  return { codigo: null, matches, status: 'ambiguo', metodo: 'ambiguo' };
}

// ── Desempate por centro_custo da Compra e texto da rubrica ──────────────────
function desempatarPorCentroCusto(rubrica: any, centroCustoCompra: string, codigosAmbiguos: string[], textoNorm?: string): string | null {
  const texto = textoNorm || normBusca(rubrica);
  const centro = norm(centroCustoCompra || '');
  const ambSet = new Set(codigosAmbiguos);

  // Regra 1: 'Material' genérico → depende do centro
  // Material de escritório / Despesas gerais → '12'
  // Material MIS/MUMO/MHAB (atividades) → '15'
  if (ambSet.has('12') && ambSet.has('15')) {
    if (texto.includes('escritorio') || texto.includes('despesas gerais') || centro.includes('despesas gerais') || centro.includes('geral')) {
      return '12';
    }
    if (texto.includes('atividade') || texto.includes('oficina') || texto.includes('educativa') ||
        centro.includes('mhab') || centro.includes('mis') || centro.includes('mumo')) {
      return '15';
    }
  }

  // Regra 2: 'Lanche' → '12' sempre (sem ambiguidade possível com 99)
  if (ambSet.has('12') && texto.includes('lanche') && !texto.includes('camarim')) {
    return '12';
  }

  // Regra 3: 'Lanche/Camarim' (Noturno) → '99' (infraestrutura)
  if (texto.includes('lanche') && texto.includes('camarim')) {
    return '99';
  }

  // Regra 4: 'Designer'/'design gráfico' → '23' por padrão (exceto MHAB com rubrica manutenção)
  if (ambSet.has('23') && (texto.includes('designer') || texto.includes('design grafico'))) {
    return '23';
  }

  // Regra 5: 'Infraestrutura' + 'sinalização' → '13' se 'sinalização' no texto
  if (ambSet.has('13') && ambSet.has('99') && texto.includes('sinalizac')) {
    return '13';
  }

  // Regra 6: 'Infraestrutura' + 'limpeza' → '41'
  if (ambSet.has('41') && ambSet.has('99') && texto.includes('limpeza')) {
    return '41';
  }

  // Regra 7: 'Apresentações' → '22'
  if (ambSet.has('22') && (texto.includes('apresentac') || texto.includes('acao educativa'))) {
    return '22';
  }

  // Regra 8: 'Coordenador de Comunicação' → '53'
  if (ambSet.has('53') && (texto.includes('coord') && texto.includes('comunicac'))) {
    return '53';
  }

  // Regra 9: 'Monitores' → '42'
  if (ambSet.has('42') && texto.includes('monitor')) {
    return '42';
  }

  // Regra 10: 'Consultorias' → '01'
  if (ambSet.has('01') && (texto.includes('consultoria') || texto.includes('contabil') || texto.includes('juridic'))) {
    return '01';
  }

  return null;
}

// ── Normaliza código vazio/inválido para null ─────────────────────────────────
function codEhVazio(cod: any): boolean {
  if (!cod) return true;
  const s = String(cod).trim();
  return s === '' || s === '?' || s === '—' || s === '-' || s === 'null' || s === 'undefined' || s === '0';
}

// ── Verifica se o código aparece como token separado no nome do arquivo ────────
function codigoNoNomeArquivo(nomeArquivo: string, cod: string): boolean {
  if (!nomeArquivo || !cod) return false;
  const nome = norm(nomeArquivo);
  const regex = new RegExp(`(^|[_\\-\\s])0*${parseInt(cod, 10)}([_\\-\\s]|$)`);
  return regex.test(nome);
}

// ── Extrai nome do arquivo de uma URL ─────────────────────────────────────────
function extrairNomeArquivo(url: string): string {
  if (!url) return '';
  try {
    const decoded = decodeURIComponent(url);
    const partes = decoded.split(/[/?#]/);
    for (let i = partes.length - 1; i >= 0; i--) {
      const p = partes[i].trim();
      if (p && p.includes('.')) return p;
    }
    return partes[partes.length - 1] || '';
  } catch {
    return '';
  }
}

// ── Constrói novo nome padronizado ────────────────────────────────────────────
function construirNovoNome(purchase: any, cod: string, tipo: 'NF' | 'XML'): string {
  const fornecedor = norm(purchase.fornecedor_nome || purchase.nf_emitente_nome || 'FORNECEDOR')
    .replace(/\s+/g, '_').toUpperCase().substring(0, 20);
  const numero = (purchase.nf_numero || '').replace(/[^0-9]/g, '') || '000';
  const data = (purchase.nf_data_emissao || purchase.data_pagamento_efetivo || '').substring(0, 10) || 'S-DATA';
  const ext = tipo === 'XML' ? 'xml' : 'pdf';
  return `${cod}_${tipo}_${fornecedor}_${numero}_${data}.${ext}`;
}

// ── Renomeia arquivo no Drive via API PATCH ───────────────────────────────────
async function renomearNoDrive(driveToken: string, fileId: string, novoNome: string): Promise<boolean> {
  try {
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: novoNome }),
      }
    );
    return resp.ok;
  } catch {
    return false;
  }
}

// ── Extrai fileId de URL do Drive ─────────────────────────────────────────────
function extrairDriveFileId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  const m2 = url.match(/id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];
  return null;
}

// ── Busca compras em lotes de 500 para cobrir todos os registros ──────────────
async function buscarTodasCompras(base44: any): Promise<any[]> {
  const resultado: any[] = [];
  let skip = 0;
  const limit = 500;
  while (true) {
    const lote = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', limit, skip).catch(() => []);
    if (!lote || lote.length === 0) break;
    resultado.push(...lote);
    if (lote.length < limit) break;
    skip += limit;
  }
  return resultado;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dryRun === true;
    // force=true sobrescreve TODOS, inclusive OK. Por padrão false = só preenche/corrige divergências.
    const force: boolean = body.force !== false; // default TRUE para sincronização definitiva
    const purchaseIds: string[] = Array.isArray(body.purchaseIds) ? body.purchaseIds : [];

    // ── Buscar compras ─────────────────────────────────────────────────────────
    let compras: any[];
    if (purchaseIds.length > 0) {
      const results = await Promise.all(purchaseIds.map(id => base44.asServiceRole.entities.PurchaseRequest.get(id).catch(() => null)));
      compras = results.filter(Boolean);
    } else {
      compras = await buscarTodasCompras(base44);
    }

    // ── Buscar rubricas ────────────────────────────────────────────────────────
    const todasRubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 2000);
    const rubricaMap = new Map<string, any>();
    for (const r of todasRubricas) rubricaMap.set(r.id, r);

    // ── Token do Drive ─────────────────────────────────────────────────────────
    let driveToken: string | null = null;
    try {
      const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      driveToken = conn?.accessToken || conn?.access_token || null;
    } catch { /* sem token — renomeação indisponível */ }

    // ── Estatísticas ──────────────────────────────────────────────────────────
    const stats = {
      total_registros: compras.length,
      total_analisado: 0,
      codigos_preenchidos: 0,
      codigos_corretos: 0,
      codigos_corrigidos: 0,
      rubricas_nao_encontradas: 0,
      associacoes_ambiguas: 0,
      arquivos_sem_codigo: 0,
      arquivos_com_codigo_divergente: 0,
      backup_validado_sim: 0,
      arquivos_renomeados: 0,
    };

    const logs: any[] = [];
    const alteracoes: any[] = [];

    for (const purchase of compras) {
      stats.total_analisado++;

      const codAnterior = purchase.cod || null;
      const statusCodAnterior = purchase.status_cod || null;

      const log: any = {
        id: purchase.id,
        descricao: (purchase.descricao_item || '').substring(0, 80),
        fornecedor: purchase.fornecedor_nome || '',
        rubrica_nome: '',
        cod_anterior: codAnterior,
        status_cod_anterior: statusCodAnterior,
        cod_final: null,
        status_cod: null,
        metodo: '',
        codigo_pdf_ok: 'NÃO_SE_APLICA',
        codigo_xml_ok: 'NÃO_SE_APLICA',
        backup_validado: 'NÃO',
        motivo_revisao: null,
        acoes: [],
      };

      // ── Determinar código via Plano de Trabalho ────────────────────────────
      let cod: string | null = null;
      let statusCod: string = 'SEM_RUBRICA';
      let metodo = '';

      const rubrica = purchase.rubrica_id ? (rubricaMap.get(purchase.rubrica_id) || null) : null;
      log.rubrica_nome = rubrica ? (rubrica.rubrica || rubrica.nome || '') : '(sem rubrica)';

      if (!purchase.rubrica_id || !rubrica) {
        cod = null;
        statusCod = 'SEM_RUBRICA';
        log.motivo_revisao = purchase.rubrica_id ? `Rubrica ID ${purchase.rubrica_id} não encontrada` : 'Sem rubrica vinculada';
        stats.rubricas_nao_encontradas++;
      } else {
        const resultado = buscarCodigoPorRubrica(rubrica, purchase.centro_custo);

        if (resultado.status === 'ok' && resultado.codigo) {
          cod = resultado.codigo;
          statusCod = 'OK';
          metodo = resultado.metodo;

          // Sincronizar Rubrica.codigo se vazio ou diferente
          if ((!rubrica.codigo || pad2(rubrica.codigo) !== cod) && !dryRun) {
            await base44.asServiceRole.entities.Rubrica.update(rubrica.id, { codigo: cod }).catch(() => null);
            log.acoes.push(`Rubrica atualizada: codigo=${cod}`);
          }
        } else if (resultado.status === 'ambiguo') {
          cod = null;
          statusCod = 'REVISAR';
          log.motivo_revisao = `Código ambíguo (candidatos: ${resultado.matches.join(', ')}) — revisar manualmente`;
          stats.associacoes_ambiguas++;
        } else {
          cod = null;
          statusCod = 'SEM_CODIGO';
          log.motivo_revisao = 'Rubrica sem correspondência no Plano de Trabalho';
          stats.rubricas_nao_encontradas++;
        }
      }

      log.cod_final = cod;
      log.status_cod = statusCod;
      log.metodo = metodo;

      // Contabilizar tipo de atualização
      if (cod && statusCod === 'OK') {
        const codAntPad = codAnterior ? pad2(codAnterior) : null;
        if (codEhVazio(codAnterior)) {
          stats.codigos_preenchidos++;
          log.acoes.push(`cod PREENCHIDO: ${cod}`);
        } else if (codAntPad !== cod) {
          stats.codigos_corrigidos++;
          log.acoes.push(`cod CORRIGIDO: ${codAnterior} → ${cod}`);
        } else {
          stats.codigos_corretos++;
        }
      }

      // ── Validação de arquivos PDF/XML ──────────────────────────────────────
      const pdfUrlFinal = !String(purchase.nota_fiscal_url || '').toLowerCase().endsWith('.xml')
        ? (purchase.nota_fiscal_url || purchase.nf_pdf_url || purchase.arquivo_url || '')
        : (purchase.nf_pdf_url || '');

      const xmlUrlFinal = String(purchase.nota_fiscal_url || '').toLowerCase().endsWith('.xml')
        ? purchase.nota_fiscal_url
        : '';

      let codigoPdfOk = 'NÃO_SE_APLICA';
      let codigoXmlOk = 'NÃO_SE_APLICA';
      let motivoRevisao = log.motivo_revisao || '';

      if (cod) {
        if (pdfUrlFinal) {
          const nomeArquivoPdf = extrairNomeArquivo(pdfUrlFinal);
          const temCod = codigoNoNomeArquivo(nomeArquivoPdf, cod);
          codigoPdfOk = temCod ? 'SIM' : 'NÃO';
          if (!temCod) {
            stats.arquivos_sem_codigo++;
            log.acoes.push(`PDF sem cod no nome: "${nomeArquivoPdf}"`);
            if (!dryRun && driveToken) {
              const fileId = extrairDriveFileId(pdfUrlFinal);
              if (fileId) {
                const novoNome = construirNovoNome(purchase, cod, 'NF');
                const ok = await renomearNoDrive(driveToken, fileId, novoNome);
                if (ok) {
                  codigoPdfOk = 'SIM';
                  stats.arquivos_renomeados++;
                  log.acoes.push(`PDF renomeado → ${novoNome}`);
                }
              }
            }
          }
        }

        if (xmlUrlFinal) {
          const nomeArquivoXml = extrairNomeArquivo(xmlUrlFinal);
          const temCod = codigoNoNomeArquivo(nomeArquivoXml, cod);
          codigoXmlOk = temCod ? 'SIM' : 'NÃO';
          if (!temCod) {
            log.acoes.push(`XML sem cod no nome: "${nomeArquivoXml}"`);
            if (!dryRun && driveToken) {
              const fileId = extrairDriveFileId(xmlUrlFinal);
              if (fileId) {
                const novoNome = construirNovoNome(purchase, cod, 'XML');
                const ok = await renomearNoDrive(driveToken, fileId, novoNome);
                if (ok) {
                  codigoXmlOk = 'SIM';
                  stats.arquivos_renomeados++;
                  log.acoes.push(`XML renomeado → ${novoNome}`);
                }
              }
            }
          }
        }

        // Detectar divergência entre PDF e XML
        if (pdfUrlFinal && xmlUrlFinal) {
          const nomePdf = extrairNomeArquivo(pdfUrlFinal);
          const nomeXml = extrairNomeArquivo(xmlUrlFinal);
          let codNoPdf: string | null = null;
          let codNoXml: string | null = null;
          for (const c of CODIGOS_OFICIAIS) {
            if (!codNoPdf && codigoNoNomeArquivo(nomePdf, c)) codNoPdf = c;
            if (!codNoXml && codigoNoNomeArquivo(nomeXml, c)) codNoXml = c;
          }
          if (codNoPdf && codNoXml && codNoPdf !== codNoXml) {
            stats.arquivos_com_codigo_divergente++;
            motivoRevisao = (motivoRevisao ? motivoRevisao + ' | ' : '') + `Código divergente: PDF=${codNoPdf} vs XML=${codNoXml}`;
            if (log.status_cod === 'OK') log.status_cod = 'REVISAR';
          }
        }
      }

      log.codigo_pdf_ok = codigoPdfOk;
      log.codigo_xml_ok = codigoXmlOk;
      log.motivo_revisao = motivoRevisao || null;

      // ── backup_validado ────────────────────────────────────────────────────
      const backupValidado = (
        cod &&
        CODIGOS_OFICIAIS.has(cod) &&
        log.status_cod === 'OK' &&
        codigoPdfOk === 'SIM' &&
        (codigoXmlOk === 'SIM' || codigoXmlOk === 'NÃO_SE_APLICA') &&
        !String(motivoRevisao || '').includes('divergente')
      ) ? 'SIM' : 'NÃO';

      log.backup_validado = backupValidado;
      if (backupValidado === 'SIM') stats.backup_validado_sim++;

      // ── Persistir ─────────────────────────────────────────────────────────
      if (!dryRun) {
        const updates: any = {
          status_cod: log.status_cod,
          codigo_pdf_ok: codigoPdfOk,
          codigo_xml_ok: codigoXmlOk,
          backup_validado: backupValidado,
        };
        if (cod) updates.cod = cod;
        updates.motivo_revisao = log.motivo_revisao || null;

        await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, updates).catch(e => {
          log.acoes.push(`ERRO ao salvar: ${e?.message || e}`);
        });
      }

      logs.push(log);

      // Log de alterações efetivas
      if (log.acoes.some((a: string) => a.includes('CORRIGIDO') || a.includes('PREENCHIDO'))) {
        alteracoes.push({
          compra_id: purchase.id,
          fornecedor: purchase.fornecedor_nome || '',
          rubrica_original: log.rubrica_nome,
          cod_anterior: codAnterior,
          cod_novo: cod,
          motivo: 'Sincronização com Plano de Trabalho oficial',
          data_hora: new Date().toISOString(),
        });
      }
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      force,
      stats: {
        total_registros: stats.total_registros,
        total_analisado: stats.total_analisado,
        codigos_preenchidos: stats.codigos_preenchidos,
        codigos_corretos: stats.codigos_corretos,
        codigos_corrigidos: stats.codigos_corrigidos,
        rubricas_nao_encontradas: stats.rubricas_nao_encontradas,
        associacoes_ambiguas: stats.associacoes_ambiguas,
        arquivos_sem_codigo: stats.arquivos_sem_codigo,
        arquivos_com_codigo_divergente: stats.arquivos_com_codigo_divergente,
        backup_validado_sim: stats.backup_validado_sim,
        arquivos_renomeados: stats.arquivos_renomeados,
      },
      alteracoes,
      logs,
    });

  } catch (err) {
    console.error('[syncComprasCodFromPlanoTrabalho]', err);
    return Response.json({ ok: false, error: String((err as any)?.message || err) }, { status: 500 });
  }
});