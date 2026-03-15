import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Mapeamento de palavras-chave para categoria_key
const KEYWORD_TO_CATEGORIA = [
  ['exposi', 'exposicao'],
  ['expograf', 'exposicao'],
  ['som e luz', 'som_luz'],
  ['acao educativa', 'acoes_educativas'],
  ['ações educativas', 'acoes_educativas'],
  ['acoes educativas', 'acoes_educativas'],
  ['diaria', 'diarias_educador'],
  ['diária', 'diarias_educador'],
  ['lanche', 'lanches'],
  ['buffet', 'lanches'],
  ['alimentac', 'alimentacao_cartao'],
  ['cartao', 'alimentacao_cartao'],
  ['cartão', 'alimentacao_cartao'],
  ['material', 'material'],
  ['manutenc', 'manutencao'],
  ['manuten', 'manutencao'],
];

const MUSEUS = ['MHAB', 'MIS', 'MUMO'];

function inferirCategoria(rubrica) {
  const texto = ((rubrica.grupo || '') + ' ' + (rubrica.rubrica || '')).toLowerCase();
  for (const [keyword, cat] of KEYWORD_TO_CATEGORIA) {
    if (texto.includes(keyword)) return cat;
  }
  return null;
}

function inferirMuseus(rubrica) {
  const texto = ((rubrica.grupo || '') + ' ' + (rubrica.rubrica || '') + ' ' + (rubrica.observacao_uso || '')).toLowerCase();
  if (texto.includes('exposi') || texto.includes('expograf')) return ['MUMO'];
  const mencionados = MUSEUS.filter(m => texto.includes(m.toLowerCase()));
  if (mencionados.length > 0) return mencionados;
  return MUSEUS; // compartilhada
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

    // Permite coordenador, admin, ou quem tem gestao_compras / pode_gerenciar_rubricas
    const isAdminOrCoord = ['admin', 'ADMIN', 'COORDENADOR'].includes(user.role);
    if (!isAdminOrCoord) {
      const perms = await base44.asServiceRole.entities.UserPermission.filter({ user_email: user.email });
      const perm = perms?.[0];
      if (!perm?.gestao_compras && !perm?.pode_gerenciar_rubricas) {
        return Response.json({ error: 'Acesso negado' }, { status: 403 });
      }
    }

    const rubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 500);
    const configsExistentes = await base44.asServiceRole.entities.RubricaMuseuConfig.list('', 1000);

    // Indexar configs existentes
    const existentes = new Set(configsExistentes.map(c => `${c.rubrica_id}__${c.museu}`));

    const criados = [];
    const ignorados = [];

    for (const rubrica of rubricas.filter(r => r.ativo !== false)) {
      const categoria_key = inferirCategoria(rubrica);
      if (!categoria_key) { ignorados.push(rubrica.rubrica); continue; }

      const museus = inferirMuseus(rubrica);
      const divisor = museus.length > 1 ? museus.length : 1;

      for (const museu of museus) {
        const chave = `${rubrica.id}__${museu}`;
        if (existentes.has(chave)) continue; // Já existe

        await base44.asServiceRole.entities.RubricaMuseuConfig.create({
          rubrica_id: rubrica.id,
          museu,
          categoria_key,
          divisor,
        });
        criados.push({ rubrica: rubrica.rubrica, museu, categoria_key, divisor });
      }
    }

    return Response.json({
      success: true,
      message: `${criados.length} configurações criadas, ${ignorados.length} rubricas sem categoria inferida`,
      criados,
      ignorados,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});