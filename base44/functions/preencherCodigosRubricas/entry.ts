import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * preencherCodigosRubricas
 *
 * Percorre todas as Rubricas ativas e preenche o campo `codigo`
 * com o código oficial de 2 dígitos (coluna N4 do Plano de Trabalho),
 * usando o mapa hardcoded idêntico ao de validarCodBackupNFs.
 *
 * Params: { dryRun?: boolean (default: true), force?: boolean (default: false) }
 * - dryRun=true  → apenas preview, sem salvar
 * - force=false  → não sobrescreve codigo já válido
 *
 * Retorna: { total, preenchidos, ja_tinham, sem_correspondencia, ambiguos, logs[] }
 */

// ── Normalização canônica (idêntica a validarCodBackupNFs) ────────────────────
function norm(v: string): string {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-–—\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── Conjunto de códigos oficiais válidos ───────────────────────────────────────
const CODIGOS_OFICIAIS = new Set([
  '02','03','04','12','13','15','17','18',
  '22','23','24','31','33','34','38','39',
  '41','42','46','53','99'
]);

// ── Mapa N4 oficial (idêntico ao de validarCodBackupNFs/entry.ts) ─────────────
const MAPA_N4: Array<{ codigo: string; termos: string[] }> = [
  // 02 — Segurança
  { codigo: '02', termos: ['seguranca', 'segurança', 'locacao de mao de obra seguranca', 'vigilancia', 'vigia', 'servico de seguranca'] },

  // 03 — Projeto Expográfico / Identidade Visual (Meta 12/13)
  { codigo: '03', termos: ['projeto expografico', 'expografia', 'identidade visual exposicao', 'identidade visual meta 12', 'identidade visual meta 13', 'montagem expografica'] },

  // 04 — Combustível / Transporte / Energia elétrica
  { codigo: '04', termos: ['combustivel', 'energia eletrica', 'conta de luz', 'gasolina', 'abastecimento', 'transporte combustivel'] },

  // 12 — Alimentação / Material de escritório
  { codigo: '12', termos: ['lanche', 'lanches', 'alimentacao', 'coffee break', 'cafe', 'refeicao', 'buffet', 'lanchonete', 'fornecimento de lanches', 'fornecimento de alimentacao', 'material de escritorio', 'material de consumo escritorio'] },

  // 13 — Sinalização / Impressão
  { codigo: '13', termos: ['sinalizacao', 'sinalização', 'impressao mis', 'impressao mumo', 'impressao mhab', 'impressao material', 'impressao 2a publicacao', 'impressao 2 publicacao'] },

  // 15 — Material de consumo (museus)
  { codigo: '15', termos: ['material mis', 'material mumo', 'material mhab', 'material consumo', 'material educativo', 'material grafico'] },

  // 17 — Kit de Iluminação / Infraestrutura iluminação
  { codigo: '17', termos: ['kit de iluminacao', 'kit iluminacao', 'infraestrutura e iluminacao', 'infraestrutura iluminacao', 'locacao de iluminacao', 'iluminacao e infraestrutura noturno', 'iluminacao pampulha'] },

  // 18 — Vans / Ônibus
  { codigo: '18', termos: ['van', 'vans', 'onibus', 'micro onibus', 'microonibus', 'transporte escolar', 'locacao de veiculo', 'onibus micro onibus'] },

  // 22 — Assistente Adm / Ações Educativas e Culturais / Apresentações / Curadoria / Pesquisa / Consultoria
  { codigo: '22', termos: [
    'assistente administrativo', 'assistente administrativa',
    'acoes educativas', 'acao educativa',
    'acoes culturais', 'acao cultural',
    'acoes educativo culturais', 'acoes educativo-culturais',
    'apresentacoes mis', 'apresentacoes mumo', 'apresentacoes mhab',
    'apresentacoes 3 museus', 'apresentacoes 2 museus',
    'apresentacoes culturais', 'apresentacoes culturais 3 museus',
    'apresentacoes culturais mck', 'apresentacoes culturais map', 'apresentacoes culturais casa do baile',
    'curadoria', 'curadora',
    'pesquisa e texto', 'pesquisa e producao de texto',
    'consultoria de programacao', 'consultoria pedagogica', 'consultoria acessibilidade', 'consultoria temas transversais',
    'programacao meta 19', 'programacao iemanja',
  ]},

  // 23 — Comunicação / Designer / Assessor de Imprensa / Redator
  { codigo: '23', termos: [
    'assessor de imprensa', 'assessora de imprensa', 'assessoria de imprensa',
    'rede social', 'redes sociais', 'marketing cultural', 'social media',
    'criacao de site', 'site',
    'redator', 'redatora', 'redacao',
    'designer', 'web designer', 'webdesigner', 'id designer', 'design grafico', 'designer e web designer',
    'identidade visual comunicacao',
  ]},

  // 24 — Fotógrafo / Vídeo e Fotografia
  { codigo: '24', termos: [
    'fotografo', 'fotografia', 'fotografa',
    'video e fotografia', 'video fotografia', 'cobertura fotografica', 'cobertura de video',
    'fotografo mhab',
  ]},

  // 31 — Mostras
  { codigo: '31', termos: [
    'mostras mis', 'mostras mumo', 'mostras mhab', 'mostra mis', 'mostra mumo', 'mostra mhab',
    'mostra baixa complexidade', 'mostra media complexidade',
    'peca em destaque', 'mostra de cinema', 'mostra de video', 'mostra de arte',
  ]},

  // 33 — Manutenção (exposições)
  { codigo: '33', termos: [
    'manutencao mis', 'manutencao mumo', 'manutencao mhab',
    'manutencao dos museus', 'manutencao uma exposicao', 'manutencao 2 expo', 'manutencao expo',
  ]},

  // 34 — Alteração sala expo
  { codigo: '34', termos: [
    'alteracao sala expo', 'alteracao sala exposicao', 'alteracao da sala', 'alteracao do espaco expositivo',
    'reforma sala expo',
  ]},

  // 38 — Exposição MHAB
  { codigo: '38', termos: ['exposicao mhab', 'exposicao abilio barreto', 'exposicao historico municipal'] },

  // 39 — Exposição MIS
  { codigo: '39', termos: ['exposicao mis', 'exposicao imagem e som'] },

  // 41 — Limpeza
  { codigo: '41', termos: ['limpeza', 'servico de limpeza', 'higienizacao'] },

  // 42 — Pessoal (coordenadores, produção, educadores, monitores, etc.)
  { codigo: '42', termos: [
    'coordenador geral', 'coordenadora geral',
    'coordenador producao', 'coordenador de producao', 'coordenadora de producao',
    'coordenador programacao', 'coordenador de programacao',
    'analista adm', 'analista administrativo financeiro', 'analista adm financeiro',
    'gestor administrativo financeiro', 'gestor adm financeiro', 'gestora adm',
    'assistente de coordenacao', 'assistente de coordenacao e producao',
    'assistente de producao',
    'mobilizador', 'mobilizadora',
    'producao mis', 'producao mumo', 'producao mhab',
    'producao noturno',
    'educador mis', 'educador mumo', 'educador mhab', 'educadora',
    'monitor noturno', 'monitores noturno', 'monitores ed', 'monitores educacao', 'monitores',
    'diarias mis', 'diarias mumo', 'diarias mhab', 'diarias meta',
    'contador', 'contadora',
    'produtor pampulha', 'produtor 4 aditivo', 'producao meta 19',
  ]},

  // 46 — Assessoria Jurídica
  { codigo: '46', termos: ['assessoria juridica', 'assessor juridico', 'advogado', 'advocacia'] },

  // 53 — Coordenador Comunicação
  { codigo: '53', termos: ['coordenador comunicacao', 'coordenadora comunicacao', 'coordenador de comunicacao', 'coordenadora de comunicacao'] },

  // 99 — Infraestrutura / Revisão / Tradução / Dispositivos / Som e Iluminação
  { codigo: '99', termos: [
    'infraestrutura noturno', 'infraestrutura mis', 'infraestrutura mumo', 'infraestrutura mhab',
    'infraestrutura 3 museus', 'infraestrutura ed', 'infraestrutura educacao',
    'revisao mis', 'revisao mumo', 'revisao mhab', 'revisao de texto', 'revisao textual',
    'traducao', 'tradutor', 'tradutora', 'traducao mhab',
    'maquete tatil', 'video com libras', 'audio descricao',
    'dispositivos acessiveis', 'dispositivo acessivel',
    'fornecimento de som e iluminacao', 'fornecimento de som', 'som e iluminacao',
    'equipamentos de som', 'equipamentos audiovisuais',
  ]},
];

// ── Busca o código N4 pelo nome/grupo da rubrica ──────────────────────────────
function buscarCodigoPorNome(rubrica: any): { codigo: string | null; status: 'ok' | 'ambiguo' | 'nao_encontrado' } {
  const texto = norm([
    rubrica.rubrica || rubrica.nome || '',
    rubrica.grupo || '',
    rubrica.meta || '',
    rubrica.descricao || '',
  ].join(' '));

  const matches = new Set<string>();
  for (const entrada of MAPA_N4) {
    if (entrada.termos.some(t => texto.includes(t))) {
      matches.add(entrada.codigo);
    }
  }

  if (matches.size === 0) return { codigo: null, status: 'nao_encontrado' };
  if (matches.size === 1) return { codigo: [...matches][0], status: 'ok' };
  return { codigo: null, status: 'ambiguo' };
}

// ── Handler principal ─────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun: boolean = body.dryRun !== false; // default: true (seguro)
    const force: boolean = body.force === true;     // default: false

    // ── Buscar todas as Rubricas ativas ───────────────────────────────────────
    const todasRubricas: any[] = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 2000);
    const rubricas = todasRubricas.filter(r => r.ativo !== false);

    // ── Estatísticas ──────────────────────────────────────────────────────────
    let total = 0;
    let preenchidos = 0;
    let ja_tinham = 0;
    let sem_correspondencia = 0;
    let ambiguos = 0;

    const logs: Array<{
      id: string;
      nome: string;
      grupo: string;
      codigo_anterior: string | null;
      codigo_atribuido: string | null;
      status: string;
    }> = [];

    // ── Processar em sequência (evitar rate limit) ─────────────────────────────
    for (const rubrica of rubricas) {
      total++;

      const codigoAtual: string | null = rubrica.codigo || null;
      const jaTemCodigoValido = codigoAtual && CODIGOS_OFICIAIS.has(codigoAtual);

      // Pular se já tem código válido e force=false
      if (jaTemCodigoValido && !force) {
        ja_tinham++;
        logs.push({
          id: rubrica.id,
          nome: rubrica.rubrica || rubrica.nome || '',
          grupo: rubrica.grupo || '',
          codigo_anterior: codigoAtual,
          codigo_atribuido: codigoAtual,
          status: 'JA_OK',
        });
        continue;
      }

      // Buscar correspondência no mapa N4
      const resultado = buscarCodigoPorNome(rubrica);

      if (resultado.status === 'ok' && resultado.codigo) {
        // Correspondência única encontrada
        if (!dryRun) {
          await base44.asServiceRole.entities.Rubrica.update(rubrica.id, { codigo: resultado.codigo });
        }
        preenchidos++;
        logs.push({
          id: rubrica.id,
          nome: rubrica.rubrica || rubrica.nome || '',
          grupo: rubrica.grupo || '',
          codigo_anterior: codigoAtual,
          codigo_atribuido: resultado.codigo,
          status: dryRun ? 'PREVIEW' : 'PREENCHIDO',
        });
      } else if (resultado.status === 'ambiguo') {
        ambiguos++;
        logs.push({
          id: rubrica.id,
          nome: rubrica.rubrica || rubrica.nome || '',
          grupo: rubrica.grupo || '',
          codigo_anterior: codigoAtual,
          codigo_atribuido: null,
          status: 'AMBIGUO',
        });
      } else {
        sem_correspondencia++;
        logs.push({
          id: rubrica.id,
          nome: rubrica.rubrica || rubrica.nome || '',
          grupo: rubrica.grupo || '',
          codigo_anterior: codigoAtual,
          codigo_atribuido: null,
          status: 'SEM_CORRESPONDENCIA',
        });
      }
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      force,
      total,
      preenchidos,
      ja_tinham,
      sem_correspondencia,
      ambiguos,
      logs,
    });

  } catch (err) {
    console.error('[preencherCodigosRubricas]', err);
    return Response.json({ ok: false, error: String((err as any)?.message || err) }, { status: 500 });
  }
});