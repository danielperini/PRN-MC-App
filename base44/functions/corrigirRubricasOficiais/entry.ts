/**
 * corrigirRubricasOficiais
 * 
 * FASES (passar 'fase' no body):
 *   'dry_run'   — apenas analisa, não altera nada
 *   'fase1'     — arquiva duplicatas e rubricas não-oficiais
 *   'fase2'     — migra vínculos de PurchaseRequest
 *   'fase3'     — recalcula valor_utilizado/saldo nas rubricas oficiais
 * 
 * Requer: role admin
 */

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const RUBRICAS_OFICIAIS_NOMES = [
  'Coordenador Geral (mês 19 ao mês 28)',
  'Assistente de Coordenação e produção',
  'Consultoria de programação',
  'Coordenador Comunicação (mês 19 ao mês 28)',
  'Analista Adm. Financeira (mês 19 ao mês 28)',
  'Assistente Administrativo (mês 19 ao mês 28)',
  'Produção MIS (mês 19 ao mês 28)',
  'Produção MUMO (mês 19 ao mês 28)',
  'Produção MHAB (mês 19 ao mês 28)',
  'Assessor de Imprensa (mês 19 ao mês 28)',
  'Rede Social / Marketing Cultural (mês 19 ao mês 28)',
  'Fotógrafo (mês 19 ao mês 28)',
  'Designer (mês 19 ao mês 28)',
  'Manutenção MIS (mês 19 ao mês 28)',
  'Manutenção MUMO (mês 19 ao mês 28)',
  'Manutenção MHAB (mês 19 ao mês 28)',
  'Educador MIS (mês 19 ao mês 28)',
  'Educador MUMO (mês 19 ao mês 28)',
  'Educador MHAB (mês 19 ao mês 28)',
  'Mostra baixa complexidade MIS',
  'Mostra média complexidade MHAB',
  'Peça em destaque MHAB',
  'Produção (Ed. 2026)',
  'Assistente de Produção (Ed. 2026)',
  'ID (designer) (Ed. 2026)',
  'Sinalização (Ed. 2026)',
  'Monitores (Ed. 2026)',
  'Kit de Iluminação (Ed. 2026)',
  'Segurança (Ed. 2026)',
  'Limpeza (Ed. 2026)',
  'Vans (Ed. 2026)',
  'Vídeo e Fotografia (Ed. 2026)',
  'Apresentações MIS (Ed. 2026)',
  'Apresentações MUMO (Ed. 2026)',
  'Apresentações MHAB (Ed. 2026)',
  'Infraestrutura MIS (Ed. 2026)',
  'Infraestrutura MUMO (Ed. 2026)',
  'Infraestrutura MHAB (Ed. 2026)',
  'Apresentação cultural MIS (Ed. 2026)',
  'Apresentação cultural MUMO (Ed. 2026)',
  'Apresentação cultural MHAB (Ed. 2026)',
  'Infraestrutura MIS - 3 museus PBH (Ed. 2026)',
  'Infraestrutura MUMO - 3 museus PBH (Ed. 2026)',
  'Infraestrutura MHAB - 3 museus PBH (Ed. 2026)',
  'Diárias MIS',
  'Diárias MUMO',
  'Diárias MHAB',
  'Designer MHAB',
  'Fotógrafo MHAB',
  'Pesquisa e texto MHAB (2ª publicação)',
  'Revisão MHAB',
  'Tradução MHAB',
  'Impressão MHAB',
  'Lanches/buffet MIS (mês 19 ao mês 28)',
  'Lanches/buffet MUMO (mês 19 ao mês 28)',
  'Lanches/buffet MHAB (mês 19 ao mês 28)',
  'Alimentação (mês 19 ao mês 28)',
  'Material MIS (mês 19 ao mês 28)',
  'Material MUMO (mês 19 ao mês 28)',
  'Material MHAB (mês 19 ao mês 28)',
  'Ações Educativo-culturais MIS / MUMO / MHAB',
  'Fornecimento de som e iluminação MIS',
  'Fornecimento de som e iluminação MUMO',
  'Fornecimento de som e iluminação MHAB',
  'Exposição MUMO',
  'Consultorias de temas transversais diversos',
  'Formação sobre Ambiente Seguro, Diversidade e Inclusão',
  'Transporte',
  'Material escritório',
  'Assessoria Jurídica',
  'Energia elétrica',
  'Contador',
];

// Nomes alternativos/abreviados que mapeiam para um nome oficial
const ALIAS_MAPA = {
  'Designer (mês 19 ao 28)': 'Designer (mês 19 ao mês 28)',
  'Fotógrafo (mês 19 ao 28)': 'Fotógrafo (mês 19 ao mês 28)',
  'Coordenador de Comunicação (mês 19 ao 28)': 'Coordenador Comunicação (mês 19 ao mês 28)',
  'Analista Adm. Financeira (mês 19 ao 28)': 'Analista Adm. Financeira (mês 19 ao mês 28)',
  'Assistente Administrativo (mês 19 ao 28)': 'Assistente Administrativo (mês 19 ao mês 28)',
  'Coordenador Geral (mês 19 ao 28)': 'Coordenador Geral (mês 19 ao mês 28)',
  'Material de escritório': 'Material escritório',
};

function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function toNumber(v) {
  const n = parseFloat(String(v || 0).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function scoreRubrica(r) {
  let s = 0;
  if (r.meta) s += 10;
  if (r.museu_codigo) s += 5;
  if (r.natureza_despesa) s += 3;
  if (r.pagina_pdf) s += 2;
  if ((r.valor_utilizado || 0) > 0) s += 20;
  if (r.escopo_orcamentario) s += 2;
  return s;
}

function classificar(todasRubricas) {
  const nomeOficialSet = new Set(RUBRICAS_OFICIAIS_NOMES.map(n => norm(n)));

  // Resolver aliases: mapear nome alternativo → nome oficial normalizado
  const aliasNorm = {};
  for (const [de, para] of Object.entries(ALIAS_MAPA)) {
    aliasNorm[norm(de)] = norm(para);
  }

  // Agrupar por nome normalizado (resolvendo aliases)
  const grupos = {};
  for (const r of todasRubricas) {
    let nomeNorm = norm(r.rubrica || r.nome || '');
    if (aliasNorm[nomeNorm]) nomeNorm = aliasNorm[nomeNorm];
    if (!grupos[nomeNorm]) grupos[nomeNorm] = [];
    grupos[nomeNorm].push({ ...r, _nomeNorm: nomeNorm });
  }

  const oficiais = []; // melhor exemplar de cada nome oficial
  const naoOficiais = []; // não pertencem ao 3º Aditivo
  const duplicatas = []; // cópias extras de rubricas oficiais

  for (const [nomeNorm, grupo] of Object.entries(grupos)) {
    const ehOficial = nomeOficialSet.has(nomeNorm);
    if (!ehOficial) {
      for (const r of grupo) naoOficiais.push(r);
    } else if (grupo.length === 1) {
      oficiais.push(grupo[0]);
    } else {
      // Múltiplas: eleger a melhor, o resto são duplicatas
      const ordenados = [...grupo].sort((a, b) => scoreRubrica(b) - scoreRubrica(a));
      oficiais.push(ordenados[0]);
      for (let i = 1; i < ordenados.length; i++) duplicatas.push(ordenados[i]);
    }
  }

  return { oficiais, naoOficiais, duplicatas };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores podem executar esta operação.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const fase = body.fase || body.modo || 'dry_run';
    const agora = new Date().toISOString();
    const executor = user.email;

    // Carregar dados base
    const todasRubricas = await base44.asServiceRole.entities.Rubrica.list();
    const { oficiais, naoOficiais, duplicatas } = classificar(todasRubricas);

    const paraArquivar = [...naoOficiais, ...duplicatas].filter(r => r.ativo === true || r.ativo === undefined || r.ativo === null);

    // ── DRY RUN ──────────────────────────────────────────────────────────────
    if (fase === 'dry_run') {
      const totalOficiais = oficiais.reduce((acc, r) => acc + toNumber(r.valor_rubrica || r.valor_total), 0);
      const todasCompras = await base44.asServiceRole.entities.PurchaseRequest.list();

      // Rubricas alias com compras para migrar
      const migracoes = [];
      const naoOficiaisComCompras = naoOficiais.filter(r => {
        return todasCompras.some(c => c.rubrica_id === r.id);
      });
      for (const rAlias of naoOficiaisComCompras) {
        const nomeNormAlias = ALIAS_MAPA[rAlias.rubrica || rAlias.nome || '']
          ? norm(ALIAS_MAPA[rAlias.rubrica || rAlias.nome || ''])
          : null;
        if (nomeNormAlias) {
          const destino = oficiais.find(r => r._nomeNorm === nomeNormAlias);
          if (destino) {
            const comprasVinc = todasCompras.filter(c => c.rubrica_id === rAlias.id);
            migracoes.push({
              de: rAlias.rubrica || rAlias.nome,
              para: destino.rubrica || destino.nome,
              compras: comprasVinc.length,
              valor: comprasVinc.reduce((a, c) => a + toNumber(c.valor_pago || c.valor_aprovado_admin || c.valor_aprovado || c.valor_solicitado), 0),
            });
          }
        }
      }

      return Response.json({
        fase: 'dry_run',
        resumo: {
          total_banco: todasRubricas.length,
          rubricas_oficiais_a_manter: oficiais.length,
          duplicatas_a_arquivar: duplicatas.filter(r => r.ativo === true || r.ativo === undefined || r.ativo === null).length,
          nao_oficiais_a_arquivar: naoOficiais.filter(r => r.ativo === true || r.ativo === undefined || r.ativo === null).length,
          total_para_arquivar: paraArquivar.length,
          migracoes_de_alias: migracoes.length,
          total_previsto_oficiais: totalOficiais,
          meta_esperada: 1320000,
          diferenca: totalOficiais - 1320000,
          ok: Math.abs(totalOficiais - 1320000) < 1,
        },
        detalhes: {
          migracoes,
          nao_oficiais: naoOficiais.map(r => ({ id: r.id, nome: r.rubrica || r.nome, valor: r.valor_rubrica || r.valor_total })),
          duplicatas: duplicatas.map(r => ({ id: r.id, nome: r.rubrica || r.nome, score: scoreRubrica(r) })),
        },
      });
    }

    // ── FASE 1: Arquivar duplicatas e não-oficiais ────────────────────────────
    if (fase === 'fase1') {
      const lote = paraArquivar.slice(0, 40); // máximo 40 por chamada
      let arquivadas = 0;
      const erros = [];

      for (const r of lote) {
        try {
          await base44.asServiceRole.entities.Rubrica.update(r.id, {
            ativo: false,
            observacao_uso: `[ARQUIVADA ${agora}] ${duplicatas.some(d => d.id === r.id) ? 'Duplicata' : 'Não pertence ao 3º Aditivo'}. Executor: ${executor}`,
          });
          arquivadas++;
        } catch (e) {
          erros.push({ id: r.id, nome: r.rubrica, erro: e.message });
        }
      }

      const restantes = paraArquivar.length - lote.length;
      return Response.json({
        fase: 'fase1',
        arquivadas,
        erros: erros.length,
        restantes,
        total_para_arquivar: paraArquivar.length,
        continuar: restantes > 0,
        msg: restantes > 0 ? `Execute fase1 novamente para arquivar as ${restantes} restantes` : 'Fase 1 concluída',
      });
    }

    // ── FASE 2: Migrar vínculos de PurchaseRequest (alias → oficial) ──────────
    if (fase === 'fase2') {
      const todasCompras = await base44.asServiceRole.entities.PurchaseRequest.list();
      const migradas = [];
      const erros = [];

      for (const rAlias of naoOficiais) {
        const nomeBruto = rAlias.rubrica || rAlias.nome || '';
        const nomeOficialAlias = ALIAS_MAPA[nomeBruto];
        if (!nomeOficialAlias) continue;

        const nomeNormDestino = norm(nomeOficialAlias);
        const destino = oficiais.find(r => r._nomeNorm === nomeNormDestino);
        if (!destino) continue;

        const comprasVinc = todasCompras.filter(c => c.rubrica_id === rAlias.id);
        for (const c of comprasVinc) {
          try {
            await base44.asServiceRole.entities.PurchaseRequest.update(c.id, {
              rubrica_id: destino.id,
              rubrica_nome: destino.rubrica || destino.nome,
            });
            migradas.push({ compra_id: c.id, de: rAlias.rubrica, para: destino.rubrica });
          } catch (e) {
            erros.push({ compra_id: c.id, erro: e.message });
          }
        }
      }

      return Response.json({
        fase: 'fase2',
        migradas: migradas.length,
        erros: erros.length,
        detalhes: migradas,
      });
    }

    // ── FASE 3: Recalcular valor_utilizado/saldo nas rubricas oficiais ─────────
    if (fase === 'fase3') {
      const todasCompras = await base44.asServiceRole.entities.PurchaseRequest.list();
      const statusAprovados = new Set(['APROVADO_ADMIN', 'PAGO', 'APROVADO_COORD']);

      // Somar compras aprovadas por rubrica_id
      const utilizadoPorId = {};
      for (const c of todasCompras) {
        if (!statusAprovados.has(c.status)) continue;
        const rid = c.rubrica_id;
        if (!rid) continue;
        const val = toNumber(c.valor_pago || c.valor_aprovado_admin || c.valor_aprovado || c.valor_solicitado);
        utilizadoPorId[rid] = (utilizadoPorId[rid] || 0) + val;
      }

      let recalculos = 0;
      const erros = [];
      const offset = body.offset || 0;
      const lote = oficiais.slice(offset, offset + 30);

      for (const r of lote) {
        const valorTotal = toNumber(r.valor_rubrica || r.valor_total);
        const utilizado = utilizadoPorId[r.id] || 0;
        const saldo = valorTotal - utilizado;
        const pct = valorTotal > 0 ? (utilizado / valorTotal) * 100 : 0;

        try {
          await base44.asServiceRole.entities.Rubrica.update(r.id, {
            valor_utilizado: utilizado,
            saldo,
            saldo_real: saldo,
            percentual_utilizado: pct,
            ativo: true,
            origem_recurso: '3º ADITIVO',
          });
          recalculos++;
        } catch (e) {
          erros.push({ id: r.id, rubrica: r.rubrica, erro: e.message });
        }
      }

      const proximoOffset = offset + lote.length;
      const continuar = proximoOffset < oficiais.length;

      return Response.json({
        fase: 'fase3',
        processados: recalculos,
        erros: erros.length,
        offset,
        proximo_offset: proximoOffset,
        total_oficiais: oficiais.length,
        continuar,
        msg: continuar ? `Execute fase3 com offset=${proximoOffset} para continuar` : 'Fase 3 concluída. Recálculo completo.',
      });
    }

    return Response.json({ error: `Fase inválida: "${fase}". Use dry_run, fase1, fase2 ou fase3.` }, { status: 400 });

  } catch (error) {
    return Response.json({ error: error.message, stack: error.stack }, { status: 500 });
  }
});