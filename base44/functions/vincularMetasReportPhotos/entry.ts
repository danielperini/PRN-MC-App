import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Mapeamento semântico: palavras-chave → meta_id / nome da meta
// Prioridade: primeiro match ganha
const REGRAS_META = [
  // Noturno Pampulha
  { palavras: ['pampulha', 'noturno pampulha', 'noturno_pampulha'], meta_nome_contains: '11B' },
  // Noturno Centro (genérico)
  { palavras: ['noturno', 'noturno 2026', 'noturno_2026', 'noturno nos museus'], meta_nome_contains: '11A' },
  // Ações educativas (meta 5) — ANTES das regras genéricas de museu
  { palavras: ['acao educativa', 'acoes educativas', 'educacao', 'visitas mediadas', 'visita mediada', 'oficina', 'mediacao', 'visita educativa', 'visita guiada', 'educativo aberto', 'acao educativa aberta'], meta_nome_contains: '5 -' },
  { palavras: ['acao cultural', 'acoes culturais', 'apresentacao cultural', 'show', 'espetaculo', 'performance', 'concerto', 'festival'], meta_nome_contains: '6 -' },
  // Exposições específicas
  { palavras: ['exposição mis', 'abertura mis', 'mostra mis'], meta_nome_contains: '9 -' },
  { palavras: ['exposição mhab', 'casarão', 'casarao', 'abílio barreto', 'abilio barreto'], meta_nome_contains: '8 -' },
  { palavras: ['exposição mumo', 'museu da moda', 'mumo'], meta_nome_contains: '21 -' },
  // Comunicação
  { palavras: ['comunicação', 'comunicacao', 'post', 'redes sociais', 'divulgação', 'divulgacao', 'imprensa', 'clipping', 'release'], meta_nome_contains: '2 -' },
  // Acessibilidade
  { palavras: ['acessibilidade', 'libras', 'audiodescrição', 'audiodescricao', 'braile'], meta_nome_contains: '14 -' },
  // Manutenção
  { palavras: ['manutenção', 'manutencao', 'reparo', 'conservação', 'conservacao'], meta_nome_contains: '3 -' },
  // Publicações
  { palavras: ['publicação', 'publicacao', 'catálogo', 'catalogo', 'livro', 'folder', 'impresso'], meta_nome_contains: '17 -' },
  // Mostras
  { palavras: ['mostra', 'mostras', 'projeção', 'projecao', 'cinema', 'audiovisual'], meta_nome_contains: '10 -' },
  // Equipe/pessoal
  { palavras: ['educador', 'educadora', 'profissional', 'contratação', 'contratacao'], meta_nome_contains: '7 -' },
  // Diárias
  { palavras: ['diária', 'diaria', 'deslocamento', 'viagem'], meta_nome_contains: '16 -' },
  // Consultoria
  { palavras: ['consultoria', 'consultor', 'formação profissional'], meta_nome_contains: '22 -' },
  // Presente de Iemanjá
  { palavras: ['iemanjá', 'iemanja', 'presente de iemanjá'], meta_nome_contains: '19 -' },
  // Pesquisa identidade visual MUMO
  { palavras: ['identidade visual mumo', 'curatorial mumo', 'expografia mumo'], meta_nome_contains: '13 -' },
  // Pesquisa identidade visual MHAB
  { palavras: ['identidade visual mhab', 'curatorial mhab', 'expografia mhab'], meta_nome_contains: '12 -' },
  // Leis de incentivo — só palavras bem específicas
  { palavras: ['lei de incentivo', 'edital captacao', 'patrocinio externo', 'lei rouanet'], meta_nome_contains: '15 -' },
  // Alterações exposições MUMO/MIS
  { palavras: ['alteração sala', 'renovação sala', 'núcleo expositivo'], meta_nome_contains: '4 -' },
  // Custeios educativos
  { palavras: ['custeio educativo', 'material educativo', 'recurso educativo'], meta_nome_contains: '18 -' },
  // Rotina genérica
  { palavras: ['rotina', 'administrativo', 'reunião', 'reuniao', 'gestão', 'gestao'], meta_nome_contains: 'Rotina' },
];

function normalizarTexto(texto) {
  return (texto || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function inferirMetaDaFoto(foto, metas) {
  const textos = [
    foto.file_name || '',
    foto.caption || '',
    foto.legenda || '',
    foto.contexto_ia || '',
    foto.museu || '',
    foto.mes_referencia || '',
  ].map(normalizarTexto).join(' ');

  for (const regra of REGRAS_META) {
    for (const palavra of regra.palavras) {
      const palavraNorm = normalizarTexto(palavra);
      if (textos.includes(palavraNorm)) {
        const meta = metas.find(m => m.nome.includes(regra.meta_nome_contains));
        if (meta) return { meta_id: meta.id, meta_nome: meta.nome, confianca: 'alta', regra: palavra };
      }
    }
  }

  // Fallback por museu principal para ações culturais/educativas genéricas
  const museu = normalizarTexto(foto.museu || '');
  if (museu.includes('mis')) {
    const meta = metas.find(m => m.nome.includes('9 -'));
    if (meta) return { meta_id: meta.id, meta_nome: meta.nome, confianca: 'baixa', regra: 'museu_mis' };
  }
  if (museu.includes('mhab') || museu.includes('abilio')) {
    const meta = metas.find(m => m.nome.includes('8 -'));
    if (meta) return { meta_id: meta.id, meta_nome: meta.nome, confianca: 'baixa', regra: 'museu_mhab' };
  }
  if (museu.includes('mumo') || museu.includes('moda')) {
    const meta = metas.find(m => m.nome.includes('21 -'));
    if (meta) return { meta_id: meta.id, meta_nome: meta.nome, confianca: 'baixa', regra: 'museu_mumo' };
  }

  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Permitir acesso autenticado + automações via header
    let user = null;
    const headerToken = req.headers.get('x-system-token');
    if (!headerToken) {
      user = await base44.auth.me();
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const { foto_id, limite = 200, apenas_sem_meta = true } = body;

    // Buscar metas cadastradas
    const metas = await base44.asServiceRole.entities.ProjectMeta.list();
    if (!metas.length) {
      return Response.json({ error: 'Nenhuma meta cadastrada' }, { status: 400 });
    }

    // Buscar fotos para processar
    let fotos = [];
    if (foto_id) {
      const foto = await base44.asServiceRole.entities.ReportPhoto.get(foto_id);
      fotos = foto ? [foto] : [];
    } else {
      const query = apenas_sem_meta
        ? { meta_id: { $exists: false } }
        : {};
      fotos = await base44.asServiceRole.entities.ReportPhoto.filter(query, '-created_date', limite);
    }

    const resultados = { vinculadas: 0, sem_correspondencia: 0, erros: 0, detalhes: [] };

    for (const foto of fotos) {
      try {
        const inferencia = inferirMetaDaFoto(foto, metas);
        if (inferencia) {
          await base44.asServiceRole.entities.ReportPhoto.update(foto.id, {
            meta_id: inferencia.meta_id,
            contexto_ia: [
              foto.contexto_ia || '',
              `[meta_vinculada_auto: ${inferencia.meta_nome} | confianca: ${inferencia.confianca} | regra: ${inferencia.regra}]`,
            ].filter(Boolean).join(' | '),
          });
          resultados.vinculadas++;
          if (resultados.detalhes.length < 30) {
            resultados.detalhes.push({
              foto_id: foto.id,
              file_name: foto.file_name,
              meta_vinculada: inferencia.meta_nome,
              confianca: inferencia.confianca,
              regra: inferencia.regra,
            });
          }
        } else {
          resultados.sem_correspondencia++;
        }
      } catch (e) {
        resultados.erros++;
        console.error('Erro ao processar foto:', foto.id, e.message);
      }
    }

    return Response.json({
      sucesso: true,
      total_processadas: fotos.length,
      ...resultados,
      metas_disponiveis: metas.length,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});