import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Tabela canônica oficial — 3º Aditivo (53 itens = R$ 1.319.999,85)
// Cada item: chave = identificador normalizado único para matching robusto, valor = valor oficial
const TABELA_CANONICA = [
  // Equipe e gestão
  { chave: 'coordenador geral', valor: 70000 },
  { chave: 'assistente de coordenacao', valor: 50000 },
  { chave: 'consultoria de programacao', valor: 30000 },
  { chave: 'coordenador de comunicacao', valor: 60000 },
  { chave: 'analista adm financeira', valor: 50000 },
  { chave: 'assistente administrativo', valor: 40000 },
  { chave: 'producao mis mumo mhab', valor: 113400 },
  { chave: 'assessor de imprensa', valor: 27000 },
  { chave: 'rede social marketing', valor: 22500 },
  { chave: 'fotografo', valor: 27000 },
  { chave: 'designer', valor: 52000 },
  // Manutenção e operação
  { chave: 'manutencao mis', valor: 13500 },
  { chave: 'manutencao mumo', valor: 13500 },
  { chave: 'manutencao mhab', valor: 18000 },
  { chave: 'educador mis mumo mhab', valor: 138000 },
  // Mostras e exposições
  { chave: 'mostra baixa complexidade mis', valor: 4000 },
  { chave: 'mostra media complexidade mhab', valor: 7000 },
  { chave: 'peca em destaque mhab', valor: 1000 },
  // Noturno nos Museus 2026
  { chave: 'producao noturno', valor: 6000 },
  { chave: 'assistente de producao noturno', valor: 4000 },
  { chave: 'id designer noturno', valor: 7000 },
  { chave: 'sinalizacao noturno', valor: 11250 },
  { chave: 'monitores noturno', valor: 3000 },
  { chave: 'kit iluminacao noturno', valor: 12000 },
  { chave: 'seguranca noturno', valor: 3000 },
  { chave: 'limpeza noturno', valor: 2700 },
  { chave: 'vans noturno', valor: 30400 },
  { chave: 'video fotografia noturno', valor: 20000 },
  { chave: 'apresentacoes mis mumo mhab noturno', valor: 15000 },
  { chave: 'infraestrutura mis mumo mhab noturno', valor: 12000 },
  { chave: 'apresentacoes culturais pbh noturno', valor: 7500 },
  { chave: 'infraestrutura 3 museus pbh noturno', valor: 7500 },
  // Diárias e publicações
  { chave: 'diarias mis mumo mhab', valor: 6300 },
  { chave: 'designer mhab publicacao', valor: 7000 },
  { chave: 'fotografo mhab publicacao', valor: 5675 },
  { chave: 'pesquisa e texto mhab', valor: 3000 },
  { chave: 'revisao mhab', valor: 1375 },
  { chave: 'traducao mhab', valor: 2200 },
  { chave: 'impressao mhab', valor: 21000 },
  // Alimentação, material e ações
  { chave: 'lanches buffet', valor: 9000 },
  { chave: 'alimentacao mensal', valor: 9000 },
  { chave: 'material mis mumo mhab', valor: 24000 },
  { chave: 'acoes educativo culturais', valor: 90000 },
  { chave: 'fornecimento som iluminacao', valor: 7500 },
  // Mostras e exposições
  { chave: 'exposicao mumo', valor: 210000 },
  // Consultorias
  { chave: 'consultorias transversais', valor: 5000 },
  { chave: 'formacao diversidade', valor: 2500 },
  // Despesas Gerais
  { chave: 'transporte despesas', valor: 4000 },
  { chave: 'material de escritorio', valor: 2700 },
  { chave: 'assessoria juridica', valor: 17000 },
  { chave: 'energia eletrica', valor: 4500 },
  { chave: 'contador', valor: 10000 },
];

// Mapeamento rubrica real (ID do banco) → chave canônica
// Construído a partir da listagem real do banco para matching robusto
const MAPA_ID_CHAVE = {
  // Equipe e gestão
  'coordenador geral': 'coordenador geral',
  'assistente de coordenacao e producao': 'assistente de coordenacao',
  'consultoria de programacao': 'consultoria de programacao',
  'coordenador de comunicacao': 'coordenador de comunicacao',
  'analista adm. financeira': 'analista adm financeira',
  'assistente administrativo': 'assistente administrativo',
  'producao mis/mumo/mhab': 'producao mis mumo mhab',
  'assessor de imprensa': 'assessor de imprensa',
  'rede social / marketing cultural': 'rede social marketing',
  'fotografo': 'fotografo',
  'designer': 'designer',
  // Manutenção e operação
  'manutencao mis': 'manutencao mis',
  'manutencao mumo': 'manutencao mumo',
  'manutencao mhab': 'manutencao mhab',
  'educador mis / mumo / mhab': 'educador mis mumo mhab',
  // Mostras e exposições
  'mostra de baixa complexidade mis': 'mostra baixa complexidade mis',
  'mostra de media complexidade mhab': 'mostra media complexidade mhab',
  'peca em destaque mhab': 'peca em destaque mhab',
  // Noturno
  'producao (ed. 2026)': 'producao noturno',
  'assistente de producao (ed. 2026)': 'assistente de producao noturno',
  'id / designer (ed. 2026)': 'id designer noturno',
  'sinalizacao (ed. 2026)': 'sinalizacao noturno',
  'monitores (ed. 2026)': 'monitores noturno',
  'kit de iluminacao (ed. 2026)': 'kit iluminacao noturno',
  'seguranca (ed. 2026)': 'seguranca noturno',
  'limpeza (ed. 2026)': 'limpeza noturno',
  'vans (ed. 2026)': 'vans noturno',
  'video e fotografia (ed. 2026)': 'video fotografia noturno',
  'apresentacoes – mis/mumo/mhab/3 museus pbh (ed. 2026)': 'apresentacoes mis mumo mhab noturno',
  'infraestrutura mis/mumo/mhab (ed. 2026)': 'infraestrutura mis mumo mhab noturno',
  'apresentacoes culturais – 3 museus pbh (ed. 2026)': 'apresentacoes culturais pbh noturno',
  'infraestrutura 3 museus pbh (ed. 2026)': 'infraestrutura 3 museus pbh noturno',
  // Diárias e publicações
  'diarias mis / mumo / mhab': 'diarias mis mumo mhab',
  'designer mhab': 'designer mhab publicacao',
  'fotografo mhab': 'fotografo mhab publicacao',
  'pesquisa e texto mhab (2a publicacao)': 'pesquisa e texto mhab',
  'revisao mhab': 'revisao mhab',
  'traducao mhab': 'traducao mhab',
  'impressao mhab': 'impressao mhab',
  // Alimentação, material e ações
  'lanches/buffet': 'lanches buffet',
  'alimentacao': 'alimentacao mensal',
  'material mis / mumo / mhab': 'material mis mumo mhab',
  'acoes educativo-culturais mis / mumo / mhab': 'acoes educativo culturais',
  'fornecimento de som e iluminacao': 'fornecimento som iluminacao',
  // Mostras
  'exposicao mumo': 'exposicao mumo',
  // Consultorias
  'consultorias de temas transversais diversos': 'consultorias transversais',
  'formacao sobre ambiente seguro, diversidade e inclusao': 'formacao diversidade',
  // Despesas Gerais
  'transporte': 'transporte despesas',
  'material de escritorio': 'material de escritorio',
  'assessoria juridica': 'assessoria juridica',
  'energia eletrica': 'energia eletrica',
  'contador': 'contador',
};

function norm(s) {
  return String(s || '').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[–—]/g, '-');
}

function resolverChaveCanonica(rubrica) {
  const n = norm(rubrica);
  // Regras em ordem de especificidade (mais específico primeiro)
  if (n.includes('coordenador geral')) return 'coordenador geral';
  if (n.includes('assistente de coordenac')) return 'assistente de coordenacao';
  if (n.includes('consultoria de programac')) return 'consultoria de programacao';
  if (n.includes('coordenad') && n.includes('comunicac')) return 'coordenador de comunicacao';
  if (n.includes('analista adm')) return 'analista adm financeira';
  if (n.includes('assistente administrativ')) return 'assistente administrativo';
  if (n.includes('producao') && (n.includes('mis') || n.includes('mumo') || n.includes('mhab')) && !n.includes('noturno') && !n.includes('ed.')) return 'producao mis mumo mhab';
  if (n.includes('assessor de imprensa')) return 'assessor de imprensa';
  if (n.includes('rede social') || n.includes('marketing cultural')) return 'rede social marketing';
  // Específicos primeiro (antes dos genéricos)
  if (n.includes('designer') && n.includes('mhab')) return 'designer mhab publicacao';
  if ((n.includes('fotografo') || n.includes('foto')) && n.includes('mhab')) return 'fotografo mhab publicacao';
  if ((n.includes('fotografo') || n.includes('foto')) && !n.includes('mhab') && !n.includes('video') && !n.includes('noturno') && !n.includes('ed.')) return 'fotografo';
  if (n.includes('designer') && !n.includes('mhab') && !n.includes('id') && !n.includes('noturno') && !n.includes('ed.')) return 'designer';
  if (n.includes('manutencao') && n.includes('mis') && !n.includes('mumo') && !n.includes('mhab')) return 'manutencao mis';
  if (n.includes('manutencao') && n.includes('mumo')) return 'manutencao mumo';
  if (n.includes('manutencao') && n.includes('mhab')) return 'manutencao mhab';
  if (n.includes('educador') && (n.includes('mis') || n.includes('mumo') || n.includes('mhab'))) return 'educador mis mumo mhab';
  if (n.includes('mostra') && n.includes('baixa')) return 'mostra baixa complexidade mis';
  if (n.includes('mostra') && n.includes('media')) return 'mostra media complexidade mhab';
  if (n.includes('peca em destaque') && n.includes('mhab')) return 'peca em destaque mhab';
  if (n.includes('sinalizac') && (n.includes('noturno') || n.includes('ed.'))) return 'sinalizacao noturno';
  if (n.includes('monitor') && (n.includes('noturno') || n.includes('ed.'))) return 'monitores noturno';
  if (n.includes('iluminac') && (n.includes('kit') || n.includes('noturno') || n.includes('ed.'))) return 'kit iluminacao noturno';
  if (n.includes('seguranca') && (n.includes('noturno') || n.includes('ed.'))) return 'seguranca noturno';
  if (n.includes('limpeza') && (n.includes('noturno') || n.includes('ed.'))) return 'limpeza noturno';
  if (n.includes('van') && (n.includes('noturno') || n.includes('ed.'))) return 'vans noturno';
  if (n.includes('video') && n.includes('fotografia') && (n.includes('noturno') || n.includes('ed.'))) return 'video fotografia noturno';
  if (n.includes('apresentac') && n.includes('pbh') && !n.includes('infraestrutura')) return 'apresentacoes culturais pbh noturno';
  if (n.includes('infraestrutura') && n.includes('pbh')) return 'infraestrutura 3 museus pbh noturno';
  if (n.includes('apresentac') && (n.includes('mis') || n.includes('mumo') || n.includes('mhab'))) return 'apresentacoes mis mumo mhab noturno';
  if (n.includes('infraestrutura') && (n.includes('mis') || n.includes('mumo') || n.includes('mhab'))) return 'infraestrutura mis mumo mhab noturno';
  if (n.includes('assistente de producao') && (n.includes('noturno') || n.includes('ed.'))) return 'assistente de producao noturno';
  if (n.includes('id') && n.includes('designer') && (n.includes('noturno') || n.includes('ed.'))) return 'id designer noturno';
  if (n.includes('producao') && (n.includes('noturno') || n.includes('ed.'))) return 'producao noturno';
  if (n.includes('diaria') && (n.includes('mis') || n.includes('mumo') || n.includes('mhab'))) return 'diarias mis mumo mhab';
  if (n.includes('designer') && n.includes('mhab')) return 'designer mhab publicacao';
  if ((n.includes('fotografo') || n.includes('foto')) && n.includes('mhab')) return 'fotografo mhab publicacao';
  if (n.includes('pesquisa') && n.includes('texto')) return 'pesquisa e texto mhab';
  if (n.includes('revisao') && n.includes('mhab')) return 'revisao mhab';
  if (n.includes('traducao') && n.includes('mhab')) return 'traducao mhab';
  if (n.includes('impressao') && n.includes('mhab')) return 'impressao mhab';
  if (n.includes('lanches') || n.includes('buffet')) return 'lanches buffet';
  if (n.includes('alimentacao') && !n.includes('noturno') && !n.includes('ed.')) return 'alimentacao mensal';
  if (n.includes('material') && (n.includes('mis') || n.includes('mumo') || n.includes('mhab'))) return 'material mis mumo mhab';
  if (n.includes('acoes educativo')) return 'acoes educativo culturais';
  if (n.includes('som e iluminac') || (n.includes('fornecimento') && n.includes('iluminac'))) return 'fornecimento som iluminacao';
  if (n.includes('exposicao') && n.includes('mumo')) return 'exposicao mumo';
  if (n.includes('consultoria') && n.includes('transversa')) return 'consultorias transversais';
  if (n.includes('formacao') && (n.includes('diversidade') || n.includes('inclusao') || n.includes('ambiente seguro'))) return 'formacao diversidade';
  if (n.includes('transporte') && !n.includes('van')) return 'transporte despesas';
  if (n.includes('material de escritorio') || n.includes('material de escritorio')) return 'material de escritorio';
  if (n.includes('assessoria juridica') || n.includes('juridica')) return 'assessoria juridica';
  if (n.includes('energia eletrica') || n.includes('energia')) return 'energia eletrica';
  if (n.includes('contador')) return 'contador';
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body?.dry_run === true;

    // Buscar todas as rubricas do 3º Aditivo
    const [r1, r2] = await Promise.all([
      base44.asServiceRole.entities.Rubrica.filter({ origem_recurso: '3º ADITIVO' }),
      base44.asServiceRole.entities.Rubrica.filter({ origem_recurso: '3º Aditivo' }),
    ]);
    const rubricas3 = [...(Array.isArray(r1) ? r1 : []), ...(Array.isArray(r2) ? r2 : [])];

    const totalAntes = rubricas3.reduce((s, r) => s + Number(r.valor_rubrica || r.valor_total || 0), 0);

    // Mapa canônico: chave → valor
    const mapaValores = new Map(TABELA_CANONICA.map(i => [i.chave, i.valor]));

    // Ordenar rubricas: as com valor mais próximo do canônico vêm primeiro
    // Isso garante que, em caso de duplicatas, a "melhor" instância seja preservada
    rubricas3.sort((a, b) => {
      const chaveA = resolverChaveCanonica(a.rubrica || a.nome || '');
      const chaveB = resolverChaveCanonica(b.rubrica || b.nome || '');
      const valorCanA = chaveA ? (mapaValores.get(chaveA) || 0) : 0;
      const valorCanB = chaveB ? (mapaValores.get(chaveB) || 0) : 0;
      const diffA = Math.abs(Number(a.valor_rubrica || a.valor_total || 0) - valorCanA);
      const diffB = Math.abs(Number(b.valor_rubrica || b.valor_total || 0) - valorCanB);
      return diffA - diffB; // menor diferença primeiro
    });

    const corrigidas = [];
    const desativadas = [];
    const visitados = new Set(); // chaves canônicas já processadas

    for (const r of rubricas3) {
      const chaveCanonica = resolverChaveCanonica(r.rubrica || r.nome || '');

      if (!chaveCanonica || !mapaValores.has(chaveCanonica)) {
        // Rubrica não identificada na tabela canônica → desativar
        if (r.ativo !== false) {
          desativadas.push({ id: r.id, rubrica: r.rubrica || r.nome, grupo: r.grupo, valor: Number(r.valor_rubrica || r.valor_total || 0) });
          if (!dryRun) await base44.asServiceRole.entities.Rubrica.update(r.id, { ativo: false });
        }
        continue;
      }

      if (visitados.has(chaveCanonica)) {
        // Duplicata → desativar
        desativadas.push({ id: r.id, rubrica: r.rubrica || r.nome, grupo: r.grupo, valor: Number(r.valor_rubrica || r.valor_total || 0), motivo: 'duplicata' });
        if (!dryRun) await base44.asServiceRole.entities.Rubrica.update(r.id, { ativo: false });
        continue;
      }

      // Se o valor desta rubrica está muito longe do canônico E já existe outra com valor próximo,
      // verificar se deveríamos preferir outra instância — aqui simplesmente registramos a primeira encontrada
      // e as demais serão duplicatas. Para garantir que pegamos a "melhor" instância, ordenar por
      // proximidade ao valor canônico já está implícito na ordenação natural do banco (criada mais recente por último).
      visitados.add(chaveCanonica);

      const valorCorreto = mapaValores.get(chaveCanonica);
      const valorAtual = Number(r.valor_rubrica || r.valor_total || 0);

      if (Math.abs(valorAtual - valorCorreto) > 0.01) {
        corrigidas.push({ id: r.id, rubrica: r.rubrica || r.nome, grupo: r.grupo, valor_anterior: valorAtual, valor_novo: valorCorreto });
        if (!dryRun) await base44.asServiceRole.entities.Rubrica.update(r.id, { valor_rubrica: valorCorreto, valor_total: valorCorreto });
      }
    }

    const totalDepois3 = TABELA_CANONICA.reduce((s, i) => s + i.valor, 0);

    const [r3, r4] = await Promise.all([
      base44.asServiceRole.entities.Rubrica.filter({ origem_recurso: '4º ADITIVO', ativo: true }),
      base44.asServiceRole.entities.Rubrica.filter({ origem_recurso: '4º Aditivo', ativo: true }),
    ]);
    const total4 = [...(r3 || []), ...(r4 || [])].reduce((s, r) => s + Number(r.valor_rubrica || r.valor_total || 0), 0);

    const totalDepois = totalDepois3 + total4;
    const alvo = 1401719.85;

    return Response.json({
      dry_run: dryRun,
      total_antes: totalAntes,
      total_depois: totalDepois,
      total_3_aditivo: totalDepois3,
      total_4_aditivo: total4,
      alvo,
      desvio_final: Math.abs(totalDepois - alvo),
      rubricas_3_aditivo_encontradas: rubricas3.length,
      corrigidas,
      desativadas,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});