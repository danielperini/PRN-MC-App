import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function toNumber(value: any): number {
  const raw = String(value ?? '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function getPurchaseValue(purchase: any): number {
  return toNumber(
    purchase?.valor_pago ||
      purchase?.valor_aprovado_admin ||
      purchase?.valor_aprovado ||
      purchase?.valor_final ||
      purchase?.valor_solicitado ||
      purchase?.valor_total ||
      purchase?.valor ||
      purchase?.rubrica_debitada_valor ||
      0
  );
}

async function getRubrica(base44: any, rubricaId: string) {
  if (!rubricaId) throw new Error('Rubrica obrigatória.');

  const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId);

  if (!rubrica) throw new Error('Rubrica inválida.');

  return rubrica;
}

async function debitarRubrica(base44: any, rubrica: any, valor: number) {
  const total = toNumber(rubrica.valor_total || rubrica.valor_rubrica);
  const utilizadoAtual = toNumber(rubrica.valor_utilizado);

  const novoUtilizado = utilizadoAtual + valor;
  const novoSaldo = total - novoUtilizado;
  const percentual = total > 0 ? (novoUtilizado / total) * 100 : 0;

  await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
    valor_utilizado: novoUtilizado,
    saldo_real: novoSaldo,
    saldo: novoSaldo,
    percentual_utilizado: percentual
  });
}

async function estornarRubrica(base44: any, rubrica: any, valor: number) {
  const total = toNumber(rubrica.valor_total || rubrica.valor_rubrica);
  const utilizadoAtual = toNumber(rubrica.valor_utilizado);

  const novoUtilizado = Math.max(0, utilizadoAtual - valor);
  const novoSaldo = total - novoUtilizado;
  const percentual = total > 0 ? (novoUtilizado / total) * 100 : 0;

  await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
    valor_utilizado: novoUtilizado,
    saldo_real: novoSaldo,
    saldo: novoSaldo,
    percentual_utilizado: percentual
  });
}

async function syncAttachments(base44: any, purchase: any, status: string) {
  try {
    const docs = await base44.asServiceRole.entities.Attachment.filter({
      purchase_id: purchase.id
    });

    for (const doc of docs || []) {
      await base44.asServiceRole.entities.Attachment.update(doc.id, {
        status,
        nf_status: status,
        ocultar_entrada_unica: true,
        inconsistencias: 0
      });
    }
  } catch (error) {
    console.error('Erro ao sincronizar anexos:', error);
  }
}

async function estornarSeNecessario(base44: any, purchase: any, valor: number) {
  const deveEstornar =
    !!purchase.rubrica_debitada_em ||
    !!purchase.financeiro_lancado_em;

  if (!deveEstornar || !purchase.rubrica_id) return;

  const rubrica = await getRubrica(base44, purchase.rubrica_id);
  const valorEstorno = toNumber(purchase.rubrica_debitada_valor) || valor;

  await estornarRubrica(base44, rubrica, valorEstorno);
}

// Troca de rubrica: estorna da antiga e debita na nova (ou apenas atualiza se ainda não debitado)
async function trocarRubricaSeNecessario(
  base44: any,
  purchase: any,
  novaRubricaId: string,
  novoValor: number
) {
  const rubricaAntigaId = purchase.rubrica_id;
  const jaDebitado = !!purchase.rubrica_debitada_em;

  if (!jaDebitado) {
    // Ainda não foi debitado: apenas atualiza o vínculo, sem movimentar saldo
    return { debitou: false };
  }

  // Já foi debitado: precisamos estornar a antiga e debitar na nova
  if (rubricaAntigaId && rubricaAntigaId !== novaRubricaId) {
    const rubricaAntiga = await getRubrica(base44, rubricaAntigaId);
    const valorEstorno = toNumber(purchase.rubrica_debitada_valor) || novoValor;
    await estornarRubrica(base44, rubricaAntiga, valorEstorno);
  }

  const rubricaNova = await getRubrica(base44, novaRubricaId);
  await debitarRubrica(base44, rubricaNova, novoValor);

  return { debitou: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const { action, purchaseId, comentario, novaRubricaId, novoValor } = body;

    if (!purchaseId) {
      return json({ success: false, error: 'purchaseId obrigatório.' }, 400);
    }

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

    if (!purchase) {
      return json({ success: false, error: 'Solicitação não encontrada.' }, 404);
    }

    const valor = getPurchaseValue(purchase);

    // =========================
    // TROCAR RUBRICA
    // (estorna antiga, debita nova — mesmo se já aprovado)
    // =========================
    if (action === 'trocar_rubrica') {
      if (!novaRubricaId) {
        return json({ success: false, error: 'novaRubricaId obrigatório.' }, 400);
      }

      const valorTroca = novoValor != null ? toNumber(novoValor) : getPurchaseValue(purchase);

      const { debitou } = await trocarRubricaSeNecessario(base44, purchase, novaRubricaId, valorTroca);

      const now = new Date().toISOString();
      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, {
        rubrica_id: novaRubricaId,
        ...(debitou ? {
          rubrica_debitada_em: now,
          rubrica_debitada_valor: valorTroca,
          financeiro_lancado_em: purchase.financeiro_lancado_em || now
        } : {})
      });

      return json({ success: true, purchase: updated });
    }

    // Helper: gerar número de processamento único
    async function gerarNumeroProcessamento() {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const yyyy = now.getFullYear();
      const prefixo = `${mm}${dd}${yyyy}`;
      const todas = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 500);
      const deHoje = (todas || []).filter((p: any) => (p.numero_processamento || '').startsWith(prefixo));
      const seq = deHoje.length + 1;
      return `${prefixo}${String(seq).padStart(4, '0')}`;
    }

    // =========================
    // APROVAR (CORE CORRETO)
    // =========================
    if (action === 'aprovar') {
      // Verifica se a rubrica foi trocada antes de aprovar
      const rubricaAprovacaoId = novaRubricaId || purchase.rubrica_id;
      if (!rubricaAprovacaoId) {
        return json({ success: false, error: 'Rubrica obrigatória para aprovação.' }, 400);
      }

      const jaDebitado = !!purchase.rubrica_debitada_em;
      const rubricaMudou = jaDebitado && novaRubricaId && novaRubricaId !== purchase.rubrica_id;

      if (rubricaMudou) {
        // Estorna antiga e debita na nova
        await trocarRubricaSeNecessario(base44, purchase, novaRubricaId, valor);
      } else if (!jaDebitado) {
        const rubrica = await getRubrica(base44, rubricaAprovacaoId);
        await debitarRubrica(base44, rubrica, valor);
      }

      const numeroProcessamento = purchase.numero_processamento || await gerarNumeroProcessamento();

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(
        purchase.id,
        {
          status: 'APROVADO_COORD',
          rubrica_id: rubricaAprovacaoId,
          numero_processamento: numeroProcessamento,
          financeiro_lancado_em:
            purchase.financeiro_lancado_em || new Date().toISOString(),
          rubrica_debitada_em:
            purchase.rubrica_debitada_em || new Date().toISOString(),
          rubrica_debitada_valor:
            purchase.rubrica_debitada_valor || valor
        }
      );

      await syncAttachments(base44, updated, 'APROVADO');

      // Disparar e-mail automático para setor financeiro (não bloqueia se falhar)
      try {
        await base44.asServiceRole.functions.invoke('notifyPurchaseApprovedToFinanceiro', {
          purchaseId: purchase.id,
          aprovadorEmail: body.aprovadorEmail || '',
          aprovadorNome: body.aprovadorNome || '',
        });
      } catch (emailErr) {
        console.warn('E-mail financeiro não enviado:', emailErr?.message);
      }

      return json({ success: true, purchase: updated });
    }

    // =========================
    // DESAPROVAR / REPROVAR
    // =========================
    if (action === 'desaprovar' || action === 'reprovar') {
      await estornarSeNecessario(base44, purchase, valor);

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(
        purchase.id,
        {
          status: action === 'reprovar' ? 'RECUSADO' : 'SOLICITADO',
          comentario_desaprovacao:
            comentario || 'Desaprovado pela coordenação.',
          financeiro_lancado_em: null,
          rubrica_debitada_em: null,
          rubrica_debitada_valor: 0
        }
      );

      await syncAttachments(base44, updated, action === 'reprovar' ? 'REPROVADO' : 'SOLICITADO');

      return json({ success: true, purchase: updated });
    }

    // =========================
    // DEVOLVER
    // =========================
    if (action === 'devolver' || action === 'rejeitar') {
      await estornarSeNecessario(base44, purchase, valor);

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(
        purchase.id,
        {
          status: 'DEVOLVIDO',
          comentario_devolucao:
            comentario || 'Devolvido pela coordenação.',
          financeiro_lancado_em: null,
          rubrica_debitada_em: null,
          rubrica_debitada_valor: 0
        }
      );

      await syncAttachments(base44, updated, 'DEVOLVIDO');

      return json({ success: true, purchase: updated });
    }

    // =========================
    // CANCELAR
    // =========================
    if (action === 'cancelar' || action === 'deletar') {
      await estornarSeNecessario(base44, purchase, valor);

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(
        purchase.id,
        {
          status: 'CANCELADO',
          financeiro_lancado_em: null,
          rubrica_debitada_em: null,
          rubrica_debitada_valor: 0
        }
      );

      await syncAttachments(base44, updated, 'CANCELADO');

      return json({ success: true, purchase: updated });
    }

    // =========================
    // MARCAR PAGO (sem comprovante — legado / equipe)
    // =========================
    if (action === 'marcar_pago') {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const yyyy = now.getFullYear();
      const prefixo = `${mm}${dd}${yyyy}`;

      let numeroProcessamento = purchase.numero_processamento;
      if (!numeroProcessamento) {
        const todas = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 500);
        const deHoje = (todas || []).filter((p: any) => (p.numero_processamento || '').startsWith(prefixo));
        const seq = deHoje.length + 1;
        numeroProcessamento = `${prefixo}${String(seq).padStart(4, '0')}`;
      }

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, {
        status: 'PAGO',
        pago: true,
        status_pagamento: 'pago',
        data_pagamento: now.toISOString(),
        numero_processamento: numeroProcessamento,
      });

      return json({ success: true, purchase: updated });
    }

    return json({ success: false, error: 'Ação inválida.' }, 400);
  } catch (error: any) {
    console.error('purchaseActions error:', error);

    return json({
      success: false,
      error: error?.message || 'Erro ao processar ação.'
    }, 500);
  }
});