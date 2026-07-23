import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

function norm(v) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[-–—\/]/g, ' ').replace(/\s+/g, ' ').trim();
}

const MAPA_N4 = [
  { c: '02', t: ['seguranca','locacao de mao de obra seguranca','vigilancia','vigia','servico de seguranca'] },
  { c: '03', t: ['projeto expografico','expografia','identidade visual exposicao','identidade visual meta 12','identidade visual meta 13','montagem expografica'] },
  { c: '04', t: ['combustivel','energia eletrica','conta de luz','gasolina','abastecimento','transporte combustivel'] },
  { c: '12', t: ['lanche','lanches','alimentacao','coffee break','cafe','refeicao','buffet','lanchonete','fornecimento de lanches','fornecimento de alimentacao','material de escritorio','material de consumo escritorio'] },
  { c: '13', t: ['sinalizacao','impressao mis','impressao mumo','impressao mhab','impressao material','impressao 2a publicacao','impressao 2 publicacao'] },
  { c: '15', t: ['material mis','material mumo','material mhab','material consumo','material educativo','material grafico'] },
  { c: '17', t: ['kit de iluminacao','kit iluminacao','infraestrutura e iluminacao','infraestrutura iluminacao','locacao de iluminacao','iluminacao e infraestrutura noturno','iluminacao pampulha'] },
  { c: '18', t: ['van','vans','onibus','micro onibus','microonibus','transporte escolar','locacao de veiculo','onibus micro onibus'] },
  { c: '22', t: ['assistente administrativo','assistente administrativa','acoes educativas','acao educativa','acoes culturais','acao cultural','acoes educativo culturais','apresentacoes mis','apresentacoes mumo','apresentacoes mhab','apresentacoes 3 museus','apresentacoes 2 museus','apresentacoes culturais','curadoria','curadora','pesquisa e texto','pesquisa e producao de texto','consultoria de programacao','consultoria pedagogica','consultoria acessibilidade','consultoria temas transversais','programacao meta 19','programacao iemanja'] },
  { c: '23', t: ['assessor de imprensa','assessora de imprensa','assessoria de imprensa','rede social','redes sociais','marketing cultural','social media','criacao de site','redator','redatora','redacao','designer','web designer','webdesigner','id designer','design grafico','designer e web designer','identidade visual comunicacao'] },
  { c: '24', t: ['fotografo','fotografia','fotografa','video e fotografia','video fotografia','cobertura fotografica','cobertura de video','fotografo mhab'] },
  { c: '31', t: ['mostras mis','mostras mumo','mostras mhab','mostra mis','mostra mumo','mostra mhab','mostra baixa complexidade','mostra media complexidade','peca em destaque','mostra de cinema','mostra de video','mostra de arte'] },
  { c: '33', t: ['manutencao mis','manutencao mumo','manutencao mhab','manutencao dos museus','manutencao uma exposicao','manutencao 2 expo','manutencao expo'] },
  { c: '34', t: ['alteracao sala expo','alteracao sala exposicao','alteracao da sala','alteracao do espaco expositivo','reforma sala expo'] },
  { c: '38', t: ['exposicao mhab','exposicao abilio barreto','exposicao historico municipal'] },
  { c: '39', t: ['exposicao mis','exposicao imagem e som'] },
  { c: '41', t: ['limpeza','servico de limpeza','higienizacao'] },
  { c: '42', t: ['coordenador geral','coordenadora geral','coordenador producao','coordenador de producao','coordenadora de producao','coordenador programacao','coordenador de programacao','analista adm','analista administrativo financeiro','analista adm financeiro','gestor administrativo financeiro','gestor adm financeiro','gestora adm','assistente de coordenacao','assistente de coordenacao e producao','assistente de producao','mobilizador','mobilizadora','producao mis','producao mumo','producao mhab','producao noturno','educador mis','educador mumo','educador mhab','educadora','monitor noturno','monitores noturno','monitores ed','monitores educacao','monitores','diarias mis','diarias mumo','diarias mhab','diarias meta','contador','contadora','produtor pampulha','produtor 4 aditivo','producao meta 19'] },
  { c: '46', t: ['assessoria juridica','assessor juridico','advogado','advocacia'] },
  { c: '53', t: ['coordenador comunicacao','coordenadora comunicacao','coordenador de comunicacao','coordenadora de comunicacao'] },
  { c: '99', t: ['infraestrutura noturno','infraestrutura mis','infraestrutura mumo','infraestrutura mhab','infraestrutura 3 museus','infraestrutura ed','infraestrutura educacao','revisao mis','revisao mumo','revisao mhab','revisao de texto','revisao textual','traducao','tradutor','tradutora','traducao mhab','maquete tatil','video com libras','audio descricao','dispositivos acessiveis','dispositivo acessivel','fornecimento de som e iluminacao','fornecimento de som','som e iluminacao','equipamentos de som','equipamentos audiovisuais'] },
];

const VALIDOS = new Set(['02','03','04','12','13','15','17','18','22','23','24','31','33','34','38','39','41','42','46','53','99']);

function buscar(rubrica) {
  const txt = norm([rubrica.rubrica || rubrica.nome || '', rubrica.grupo || '', rubrica.meta || '', rubrica.descricao || ''].join(' '));
  const hits = new Set();
  for (const e of MAPA_N4) {
    if (e.t.some(t => txt.includes(t))) hits.add(e.c);
  }
  if (hits.size === 0) return { codigo: null, status: 'nao_encontrado' };
  if (hits.size === 1) return { codigo: [...hits][0], status: 'ok' };
  return { codigo: null, status: 'ambiguo', candidatos: [...hits] };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;
    const force  = body.force === true;

    const lista = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 2000);
    const rubricas = (Array.isArray(lista) ? lista : []).filter(r => r?.ativo !== false);

    const stats = { total: 0, ja_tinham: 0, preenchidos: 0, ambiguos: 0, sem_correspondencia: 0 };
    const logs = [];

    for (const r of rubricas) {
      stats.total++;
      if (r.codigo && VALIDOS.has(r.codigo) && !force) {
        stats.ja_tinham++;
        logs.push({ id: r.id, nome: r.rubrica || r.nome || '?', grupo: r.grupo || '', codigo_atribuido: r.codigo, status: 'JA_TINHA' });
        continue;
      }
      const res = buscar(r);
      if (res.status === 'ok') {
        if (!dryRun) await base44.asServiceRole.entities.Rubrica.update(r.id, { codigo: res.codigo });
        stats.preenchidos++;
        logs.push({ id: r.id, nome: r.rubrica || r.nome || '?', grupo: r.grupo || '', codigo_atribuido: res.codigo, status: dryRun ? 'SERIA_PREENCHIDO' : 'PREENCHIDO' });
      } else if (res.status === 'ambiguo') {
        stats.ambiguos++;
        logs.push({ id: r.id, nome: r.rubrica || r.nome || '?', grupo: r.grupo || '', codigo_atribuido: null, status: 'AMBIGUO', candidatos: res.candidatos });
      } else {
        stats.sem_correspondencia++;
        logs.push({ id: r.id, nome: r.rubrica || r.nome || '?', grupo: r.grupo || '', codigo_atribuido: null, status: 'SEM_CORRESPONDENCIA' });
      }
    }

    return Response.json({ ok: true, dry_run: dryRun, force, stats, logs });
  } catch (err) {
    console.error('[preencherCodigosRubricas]', err);
    return Response.json({ ok: false, error: String(err?.message || err) }, { status: 500 });
  }
});