import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function toNumber(v: any) {
  return Number(v) || 0;
}

function normalizeStatus(value: any) {
  return String(value || '').trim().toUpperCase();
}

function computeSaldo(rubrica: any) {
  const total =
    toNumber(rubrica?.valor_total) ||
    toNumber(rubrica?.valor_rubrica);

  const utilizado = toNumber(rubrica?.valor_utilizado);
  const comprometido = toNumber(rubrica?.saldo_comprometido);

  return total - utilizado - comprometido;
}

function pickRubricaId(payment: any, member: any) {
  return (
    payment?.rubrica_id ||
    payment?.rubricaId ||
    payment?.budget_rubrica_id ||
    payment?.linha_rubrica_id ||
    member?.rubrica_id ||
    null
  );
}

function pickRubricaNome(payment: any, rubrica: any) {
  return (
    payment?.rubrica_nome ||
    payment?.rubrica ||
    rubrica?.nome ||
    rubrica?.rubrica ||
    ''
  );
}

function buildComprasLink(req: Request, paymentId: string) {
  const url = new URL(req.url);
  return `${url.origin}/Compras?payment_id=${paymentId}`;
}

function addBusinessDays(start: Date, days: number) {
  const d = new Date(start);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added += 1;
  }
  return d;
}

function formatDateBR(date: Date) {
  return date.toLocaleDateString('pt-BR');
}

async function logMovimentacao(base44: any, data: any) {
  try {
    await base44.entities.RubricaMovimentacao.create({
      tipo: data.tipo,
      valor: data.valor,
      rubrica_id: data.rubrica_id,
      rubrica_nome: data.rubrica_nome || '',
      payment_id: data.payment_id,
      user_email: data.user_email,
      user_name: data.user_name || '',
      mes: data.mes,
      ano: data.ano,
      observacao: data.observacao || '',
      created_at: new Date().toISOString()
    });
  } catch (e) {
    console.error('Erro ao registrar log financeiro', e);
  }
}

async function removeDuplicados(base44: any, payment: any) {
  const duplicates = await base44.entities.TeamPayment.filter({
    user_email: payment.user_email,
    mes_referencia: payment.mes_referencia,
    ano: payment.ano
  });

  if (!duplicates || duplicates.length <= 1) return true;

  const sorted = duplicates.sort((a: any, b: any) => {
    const va = toNumber(a.valor_nf || a.valor_parcela_previsto);
    const vb = toNumber(b.valor_nf || b.valor_parcela_previsto);

    if (vb !== va) return vb - va;

    return new Date(b.created_date || b.created_at || 0).getTime() -
      new Date(a.created_date || a.created_at || 0).getTime();
  });

  const keep = sorted[0];
  const toDelete = sorted.slice(1);

  for (const d of toDelete) {
    try {
      await base44.entities.TeamPayment.delete(d.id);
    } catch (e) {
      console.error('Erro ao deletar duplicado:', d.id, e);
    }
  }

  return keep.id === payment.id;
}

async function sendApprovalEmails(base44: any, req: Request, payment: any, rubricaNome: string) {
  const appLink = buildComprasLink(req, payment.id);
  const pagamentoPrevisto = addBusinessDays(new Date(), 5);

  const subject = `Nota fiscal aprovada • ${payment.user_name || payment.user_email} • ${payment.mes_referencia}/${payment.ano}`;

  const body = `
<p>Olá,</p>

<p>A nota fiscal abaixo foi <strong>aprovada</strong> no módulo de Compras.</p>

<table border="1" cellpadding="8" cellspacing="0" style="border-collapse: collapse;">
  <tr><td><strong>Profissional</strong></td><td>${payment.user_name || payment.user_email || '-'}</td></tr>
  <tr><td><strong>E-mail</strong></td><td>${payment.user_email || '-'}</td></tr>
  <tr><td><strong>Competência</strong></td><td>${payment.mes_referencia || '-'}/${payment.ano || '-'}</td></tr>
  <tr><td><strong>Valor</strong></td><td>R$ ${toNumber(payment.valor_nf || payment.valor_parcela_previsto).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>
  <tr><td><strong>Rubrica</strong></td><td>${rubricaNome || '-'}</td></tr>
  <tr><td><strong>Número da NF</strong></td><td>${payment.numero_nf || '-'}</td></tr>
</table>

<p>O pagamento será efetuado em prazo máximo de <strong>5 dias úteis</strong>, com previsão até <strong>${formatDateBR(pagamentoPrevisto)}</strong>.</p>

<p>
  <a href="${appLink}">Acessar pedido no sistema</a>
</p>

<p>Arquivos:</p>
<ul>
  ${payment.nota_fiscal_url ? `<li><a href="${payment.nota_fiscal_url}">Nota fiscal (PDF)</a></li>` : ''}
  ${payment.xml_url ? `<li><a href="${payment.xml_url}">XML da nota fiscal</a></li>` : ''}
</ul>

<p>Atenciosamente,<br/>Projeto Museus Centro</p>
  `.trim();

  const recipients = [
    'notasfiscais@viadutodasartes.org.br',
    'danielperini.mc@viadutodasartes.org.br',
    payment.user_email
  ].filter(Boolean);

  for (const to of recipients) {
    try {
      await base44.integrations.Core.SendEmail({
        to,
        subject,
        html: body
      });
    } catch (e) {
      console.error('Erro ao enviar e-mail para', to, e);
    }
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { payment_id, action, comment } = body;

    if (!payment_id || !action) {
      return Response.json({ error: 'payment_id e action obrigatórios' }, { status: 400 });
    }

    let payment = await base44.entities.TeamPayment.get(payment_id);

    if (!payment) {
      return Response.json({ error: 'Pagamento não encontrado' }, { status: 404 });
    }

    const valor = toNumber(payment?.valor_nf || payment?.valor_parcela_previsto);

    if (valor <= 0) {
      return Response.json({
        error: 'Pagamento com valor inválido',
        invalid_value: true
      }, { status: 400 });
    }

    const stillValid = await removeDuplicados(base44, payment);

    if (!stillValid) {
      return Response.json({
        error: 'Pagamento duplicado removido automaticamente',
        removed_duplicate: true
      }, { status: 409 });
    }

    payment = await base44.entities.TeamPayment.get(payment_id);

    if (!payment) {
      return Response.json({
        error: 'Pagamento removido durante a deduplicação',
        removed_duplicate: true
      }, { status: 409 });
    }

    const member = (await base44.entities.TeamMember.filter({
      user_email: payment?.user_email
    }))?.[0] || null;

    const rubricaId = pickRubricaId(payment, member);

    if (!rubricaId) {
      return Response.json({
        error: 'Pagamento sem rubrica vinculada',
        blocked_by_rubrica: true
      }, { status: 400 });
    }

    const rubrica = await base44.entities.Rubrica.get(rubricaId);

    if (!rubrica?.id) {
      return Response.json({
        error: 'Rubrica vinculada não encontrada',
        blocked_by_rubrica: true
      }, { status: 404 });
    }

    const rubricaNome = pickRubricaNome(payment, rubrica);
    const currentStatus = normalizeStatus(payment.status);
    const requestedAction = String(action || '').trim().toLowerCase();

    if (requestedAction === 'approve') {
      if (currentStatus !== 'AGUARDANDO_APROVACAO') {
        return Response.json({ error: 'Status inválido para aprovação' }, { status: 400 });
      }

      const saldo = computeSaldo(rubrica);

      if (saldo < valor) {
        return Response.json({
          error: 'Saldo insuficiente',
          saldo_insuficiente: true
        }, { status: 400 });
      }

      await base44.entities.Rubrica.update(rubrica.id, {
        saldo_comprometido: toNumber(rubrica?.saldo_comprometido) + valor
      });

      await logMovimentacao(base44, {
        tipo: 'COMPROMETIDO',
        valor,
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome,
        payment_id: payment.id,
        user_email: payment.user_email,
        user_name: payment.user_name,
        mes: payment.mes_referencia,
        ano: payment.ano,
        observacao: comment || 'Pagamento de equipe aprovado'
      });

      await base44.entities.TeamPayment.update(payment.id, {
        status: 'APROVADO_COORD',
        aprov_coord_data: new Date().toISOString(),
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });

      const updatedPayment = {
        ...payment,
        status: 'APROVADO_COORD',
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      };

      await sendApprovalEmails(base44, req, updatedPayment, rubricaNome);

      return Response.json({
        ok: true,
        action: 'approved',
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });
    }

    if (requestedAction === 'pay') {
      if (currentStatus !== 'APROVADO_COORD') {
        return Response.json({ error: 'Pagamento só permitido após aprovação' }, { status: 400 });
      }

      const comprometido = toNumber(rubrica?.saldo_comprometido);

      if (comprometido < valor) {
        const saldo = computeSaldo(rubrica);

        if (saldo < valor) {
          return Response.json({
            error: 'Saldo insuficiente para pagamento',
            saldo_insuficiente: true
          }, { status: 400 });
        }
      }

      await base44.entities.Rubrica.update(rubrica.id, {
        valor_utilizado: toNumber(rubrica?.valor_utilizado) + valor,
        saldo_comprometido: Math.max(0, comprometido - valor)
      });

      await logMovimentacao(base44, {
        tipo: 'PAGO',
        valor,
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome,
        payment_id: payment.id,
        user_email: payment.user_email,
        user_name: payment.user_name,
        mes: payment.mes_referencia,
        ano: payment.ano,
        observacao: comment || 'Pagamento de equipe realizado'
      });

      await base44.entities.TeamPayment.update(payment.id, {
        status: 'PAGO',
        valor_pago: valor,
        data_pagamento: new Date().toISOString(),
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });

      return Response.json({
        ok: true,
        action: 'paid',
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });
    }

    if (requestedAction === 'return') {
      if (!['AGUARDANDO_APROVACAO', 'APROVADO_COORD'].includes(currentStatus)) {
        return Response.json({ error: 'Status inválido para devolução' }, { status: 400 });
      }

      if (currentStatus === 'APROVADO_COORD') {
        await base44.entities.Rubrica.update(rubrica.id, {
          saldo_comprometido: Math.max(0, toNumber(rubrica?.saldo_comprometido) - valor)
        });

        await logMovimentacao(base44, {
          tipo: 'ESTORNO',
          valor,
          rubrica_id: rubrica.id,
          rubrica_nome: rubricaNome,
          payment_id: payment.id,
          user_email: payment.user_email,
          user_name: payment.user_name,
          mes: payment.mes_referencia,
          ano: payment.ano,
          observacao: comment || 'Pagamento de equipe devolvido após aprovação'
        });
      }

      await base44.entities.TeamPayment.update(payment.id, {
        status: 'DEVOLVIDO_REVISAO',
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });

      return Response.json({
        ok: true,
        action: 'returned',
        rubrica_id: rubrica.id,
        rubrica_nome: rubricaNome
      });
    }

    return Response.json({ error: 'Ação inválida' }, { status: 400 });
  } catch (e: any) {
    return Response.json({ error: e?.message || 'Erro interno' }, { status: 500 });
  }
});
