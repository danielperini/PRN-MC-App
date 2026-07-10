import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Status que entram no cálculo financeiro
const STATUS_VALIDOS = new Set(['PAGO', 'APROVADO', 'APROVADO_ADMIN', 'APROVADO_COORD', 'PAID', 'APPROVED', 'APROVADA']);
// Status que NÃO entram
const STATUS_INVALIDOS = new Set(['RASCUNHO', 'PENDENTE', 'EM_REVISAO', 'REJEITADO', 'CANCELADO', 'ARQUIVADO', 'DELETADO', 'RECUSADO', 'DEVOLVIDO']);

function normCC(raw) {
  const v = String(raw || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (!v) return 'geral';
  if (v.includes('pampulha')) return 'noturno_pampulha';
  if (v.includes('noturno nos museus') || v === 'noturno 2026' || v === 'noturno nos museus 2026') return 'noturno_2026';
  if (v.includes('noturno')) return 'noturno_2026';
  if (v === 'mis' || v.includes('imagem e som')) return 'mis';
  if (v === 'mhab' || v.includes('abilio barreto')) return 'mhab';
  if (v === 'mumo' || v.includes('moda')) return 'mumo';
  return 'geral';
}

function getAditivo(ccNorm) {
  if (ccNorm === 'noturno_pampulha' || ccNorm === 'noturno_2026') return '4_aditivo';
  return '3_aditivo';
}

function getFinancialValue(p) {
  const toN = (v) => { const n = Number(String(v || '').replace(/[^\d.,-]/g, '').replace(',', '.')); return isFinite(n) ? n : 0; };
  return toN(p.valor_pago) || toN(p.valor_aprovado_admin) || toN(p.valor_aprovado) || toN(p.valor_solicitado) || toN(p.valor_total) || 0;
}

function getDedupKey(p) {
  if (p.nf_chave_acesso && p.nf_chave_acesso.length >= 44) return `chave:${p.nf_chave_acesso}`;
  const cnpj = String(p.fornecedor_cnpj || p.nf_emitente_cpf_cnpj || '').replace(/\D/g, '');
  const nf = String(p.nf_numero || '').trim();
  const val = getFinancialValue(p).toFixed(2);
  const dt = String(p.nf_data_emissao || '').split('T')[0];
  if (cnpj && nf) return `nf:${cnpj}:${nf}:${val}:${dt}`;
  const forn = String(p.fornecedor_nome || '').toLowerCase().replace(/\s+/g, '');
  if (forn && val !== '0.00') return `forn:${forn}:${val}:${dt}`;
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const action = body?.action || 'auditar';
    const autoCorrigir = body?.auto_corrigir === true;

    // Carregar dados
    const [purchases, rubricas] = await Promise.all([
      base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 1000),
      base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 500),
    ]);

    // Mapas auxiliares
    const rubricaMap = new Map(rubricas.map(r => [r.id, r]));

    // Filtrar apenas status válidos (ativas)
    const ativas = (purchases || []).filter(p => STATUS_VALIDOS.has(String(p.status || '').toUpperCase()));

    // Detectar duplicatas por chave de dedup
    const dedupSeen = new Map();
    for (const p of ativas) {
      const key = getDedupKey(p);
      if (!key) continue;
      if (!dedupSeen.has(key)) {
        dedupSeen.set(key, p.id);
      }
    }

    // Resultados da auditoria
    const resultados = [];
    const logEntries = [];
    const today = new Date().toISOString();

    let totalAuditadas = 0;
    let vinculadasCorreto = 0;
    let semMeta = 0;
    let rubricaIncompativel = 0;
    let duplicatasIgnoradas = 0;
    let revisaoNecessaria = 0;
    let valorTotal3Aditivo = 0;
    let valorTotal4Aditivo = 0;
    let valorForaDeMeta = 0;
    let valorIgnoradoDuplicidade = 0;
    let corrigidasAuto = 0;

    for (const p of ativas) {
      totalAuditadas++;
      const valor = getFinancialValue(p);
      const ccNorm = normCC(p.centro_custo);
      const aditivo = getAditivo(ccNorm);

      // Verificar duplicata
      const dedupKey = getDedupKey(p);
      const isDuplicate = dedupKey && dedupSeen.get(dedupKey) !== p.id;
      if (isDuplicate) {
        duplicatasIgnoradas++;
        valorIgnoradoDuplicidade += valor;
        resultados.push({ id: p.id, status: 'duplicata', motivo: 'Duplicata detectada — não entra no somatório', valor, ccNorm, aditivo });
        continue;
      }

      // Verificar centro de custo
      if (!p.centro_custo) {
        semMeta++;
        valorForaDeMeta += valor;
        resultados.push({ id: p.id, status: 'revisao_necessaria', motivo: 'Sem centro de custo', valor, ccNorm, aditivo });
        if (action === 'corrigir' && autoCorrigir) {
          revisaoNecessaria++;
        }
        continue;
      }

      // Verificar rubrica
      if (!p.rubrica_id) {
        semMeta++;
        valorForaDeMeta += valor;
        resultados.push({ id: p.id, status: 'revisao_necessaria', motivo: 'Sem rubrica vinculada', valor, ccNorm, aditivo });
        continue;
      }

      const rubrica = rubricaMap.get(p.rubrica_id);
      if (!rubrica) {
        semMeta++;
        valorForaDeMeta += valor;
        resultados.push({ id: p.id, status: 'revisao_necessaria', motivo: 'Rubrica não encontrada no banco', valor, ccNorm, aditivo });
        continue;
      }

      // Verificar compatibilidade CC da NF com CC da rubrica
      const rubricaCC = normCC(rubrica.centro_custo);
      const rubricaAditivo = getAditivo(rubricaCC);

      // Regra de incompatibilidade: noturno pampulha não pode ser rubrica geral
      const incompativel = (
        (ccNorm === 'noturno_pampulha' && rubricaAditivo !== '4_aditivo') ||
        (ccNorm === 'noturno_2026' && rubricaAditivo !== '4_aditivo') ||
        (ccNorm === 'noturno_pampulha' && rubricaCC !== 'noturno_pampulha' && rubricaCC !== 'geral')
      );

      if (incompativel) {
        rubricaIncompativel++;
        valorForaDeMeta += valor;
        resultados.push({
          id: p.id,
          status: 'rubrica_incompativel',
          motivo: `CC da NF (${ccNorm}) incompatível com rubrica (${rubricaCC})`,
          valor, ccNorm, aditivo,
          rubrica_cc: rubricaCC,
          rubrica_nome: rubrica.rubrica || rubrica.nome
        });

        if (action === 'corrigir' && autoCorrigir) {
          // Tentar autocorrigir: marcar como revisão necessária no banco
          await base44.asServiceRole.entities.PurchaseRequest.update(p.id, {
            duplicidade_status: 'revisada',
            observacoes: (p.observacoes || '') + ' [AUDITORIA: rubrica incompatível com centro de custo]'
          });
          logEntries.push({
            nf_id: p.id,
            acao: 'RUBRICA_CORRIGIDA',
            campo: 'centro_custo',
            valor_anterior: p.centro_custo,
            valor_novo: rubrica.centro_custo,
            motivo: `Incompatibilidade detectada: NF ${ccNorm} / Rubrica ${rubricaCC}`,
            executado_por: user.email,
            lote_id: today
          });
          corrigidasAuto++;
        }
        continue;
      }

      // NF válida e vinculada corretamente
      vinculadasCorreto++;
      if (aditivo === '3_aditivo') valorTotal3Aditivo += valor;
      else valorTotal4Aditivo += valor;

      resultados.push({
        id: p.id,
        status: 'ok',
        motivo: 'Vinculada corretamente',
        valor, ccNorm, aditivo,
        rubrica_nome: rubrica.rubrica || rubrica.nome
      });
    }

    // Salvar logs se ação de correção
    if (action === 'corrigir' && logEntries.length > 0) {
      for (const entry of logEntries) {
        await base44.asServiceRole.entities.FinanceiroAuditLog.create(entry).catch(() => {});
      }
    }

    // Calcular por meta (agrupado por rubrica)
    const metaMap = new Map();
    for (const r of resultados) {
      if (r.status !== 'ok') continue;
      const rubrica = rubricaMap.get(purchases.find(p => p.id === r.id)?.rubrica_id || '');
      if (!rubrica) continue;
      const metaKey = rubrica.grupo || rubrica.meta || 'Sem meta';
      if (!metaMap.has(metaKey)) {
        metaMap.set(metaKey, { meta: metaKey, aditivo: r.aditivo, valor_utilizado: 0, qtd_notas: 0 });
      }
      metaMap.get(metaKey).valor_utilizado += r.valor;
      metaMap.get(metaKey).qtd_notas++;
    }

    const resumoPorMeta = Array.from(metaMap.values()).sort((a, b) => b.valor_utilizado - a.valor_utilizado);

    return Response.json({
      success: true,
      auditado_em: today,
      resumo: {
        total_auditadas: totalAuditadas,
        vinculadas_correto: vinculadasCorreto,
        sem_meta: semMeta,
        rubrica_incompativel: rubricaIncompativel,
        duplicatas_ignoradas: duplicatasIgnoradas,
        revisao_necessaria: revisaoNecessaria,
        corrigidas_auto: corrigidasAuto,
        valor_3_aditivo: valorTotal3Aditivo,
        valor_4_aditivo: valorTotal4Aditivo,
        valor_fora_de_meta: valorForaDeMeta,
        valor_ignorado_duplicidade: valorIgnoradoDuplicidade,
      },
      por_meta: resumoPorMeta,
      detalhes: resultados.slice(0, 200),
    });
  } catch (error) {
    console.error('[auditarVinculosMetasNFs] Erro:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});