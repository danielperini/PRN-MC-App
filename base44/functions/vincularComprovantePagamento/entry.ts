import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';
import Anthropic from 'npm:@anthropic-ai/sdk@0.27.3';

const anthropic = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

function toNum(v) {
  const n = Number(String(v ?? '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function gerarNumeroProcessamento(seq) {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const yyyy = now.getFullYear();
  const xxxx = String(seq).padStart(4, '0');
  return `${mm}${dd}${yyyy}${xxxx}`;
}

async function gerarNumeroUnico(base44) {
  const hoje = new Date();
  const mm = String(hoje.getMonth() + 1).padStart(2, '0');
  const dd = String(hoje.getDate()).padStart(2, '0');
  const yyyy = hoje.getFullYear();
  const prefixo = `${mm}${dd}${yyyy}`;

  const todas = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 500);
  const deHoje = (todas || []).filter(p => (p.numero_processamento || '').startsWith(prefixo));
  const seq = deHoje.length + 1;
  return `${prefixo}${String(seq).padStart(4, '0')}`;
}

async function extrairDadosComprovante(fileUrl) {
  try {
    const resp = await fetch(fileUrl);
    const buf = await resp.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));

    const msg = await anthropic.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data: base64 }
          },
          {
            type: 'text',
            text: `Extraia do comprovante de pagamento (PDF) os seguintes dados em JSON:
{
  "valor": number (valor do pagamento),
  "data": "YYYY-MM-DD",
  "favorecido": "nome do beneficiário/favorecido",
  "cnpj_cpf_favorecido": "somente dígitos",
  "banco_favorecido": "banco do favorecido se disponível",
  "agencia_conta": "agência e conta se disponível",
  "chave_pix": "chave pix se disponível",
  "descricao": "descrição/histórico do pagamento",
  "tipo": "PIX|TED|DOC|BOLETO|outro"
}
Responda APENAS o JSON, sem markdown.`
          }
        ]
      }]
    });

    const text = msg.content[0]?.text || '{}';
    return JSON.parse(text.trim());
  } catch (e) {
    console.error('Erro ao extrair comprovante:', e.message);
    return {};
  }
}

function calcularConfianca(comprovante, purchase) {
  let score = 0;
  const valorComp = toNum(comprovante.valor);
  const valorSolic = toNum(purchase.valor_solicitado || purchase.valor_total || purchase.valor_aprovado);

  if (valorComp > 0 && Math.abs(valorComp - valorSolic) < 0.02) score += 40;
  else if (valorComp > 0 && Math.abs(valorComp - valorSolic) / Math.max(valorComp, valorSolic) < 0.05) score += 20;

  const cnpjComp = (comprovante.cnpj_cpf_favorecido || '').replace(/\D/g, '');
  const cnpjSolic = (purchase.fornecedor_cnpj || purchase.nf_emitente_cpf_cnpj || '').replace(/\D/g, '');
  if (cnpjComp && cnpjSolic && cnpjComp === cnpjSolic) score += 35;

  const favComp = (comprovante.favorecido || '').toLowerCase();
  const fornSolic = (purchase.fornecedor_nome || purchase.nf_emitente_nome || '').toLowerCase();
  if (favComp && fornSolic && (favComp.includes(fornSolic.split(' ')[0]) || fornSolic.includes(favComp.split(' ')[0]))) score += 15;

  const pixComp = (comprovante.chave_pix || '').toLowerCase();
  const pixSolic = (purchase.detalhe_pagamento || '').toLowerCase();
  if (pixComp && pixSolic && pixComp.length > 5 && pixSolic.includes(pixComp.substring(0, 8))) score += 10;

  return Math.min(100, score);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { comprovanteUrl, purchaseId, forcarVinculo } = body;

    if (!comprovanteUrl) {
      return Response.json({ error: 'comprovanteUrl obrigatório' }, { status: 400 });
    }

    // Modo 1: vincular a uma solicitação específica (sem IA)
    if (purchaseId) {
      const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
      if (!purchase) return Response.json({ error: 'Solicitação não encontrada' }, { status: 404 });

      const numeroProcessamento = purchase.numero_processamento || await gerarNumeroUnico(base44);
      const now = new Date().toISOString();

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, {
        status: 'PAGO',
        pago: true,
        status_pagamento: 'pago',
        comprovante_pagamento_url: comprovanteUrl,
        comprovante_url: comprovanteUrl,
        data_pagamento: now,
        usuario_pagamento: user.email,
        usuario_pagamento_nome: user.full_name || user.email,
        numero_processamento: numeroProcessamento,
        confianca_vinculo_pagamento: 100,
        vinculo_automatico_ia: false,
      });

      return Response.json({ success: true, purchase: updated, modo: 'manual' });
    }

    // Modo 2: entrada única — IA tenta vincular automaticamente
    const dadosComprovante = await extrairDadosComprovante(comprovanteUrl);
    console.log('Dados extraídos do comprovante:', JSON.stringify(dadosComprovante));

    // Busca solicitações aprovadas sem comprovante
    const candidatos = await base44.asServiceRole.entities.PurchaseRequest.filter({
      status: 'APROVADO_COORD'
    });

    let melhorMatch = null;
    let melhorScore = 0;

    for (const p of candidatos || []) {
      const score = calcularConfianca(dadosComprovante, p);
      if (score > melhorScore) {
        melhorScore = score;
        melhorMatch = p;
      }
    }

    const LIMIAR_AUTO = 70;
    const now = new Date().toISOString();

    if (melhorMatch && melhorScore >= LIMIAR_AUTO) {
      const numeroProcessamento = melhorMatch.numero_processamento || await gerarNumeroUnico(base44);

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(melhorMatch.id, {
        status: 'PAGO',
        pago: true,
        status_pagamento: 'pago',
        comprovante_pagamento_url: comprovanteUrl,
        comprovante_url: comprovanteUrl,
        data_pagamento: now,
        usuario_pagamento: user.email,
        usuario_pagamento_nome: user.full_name || user.email,
        numero_processamento: numeroProcessamento,
        confianca_vinculo_pagamento: melhorScore,
        vinculo_automatico_ia: true,
      });

      return Response.json({
        success: true,
        purchase: updated,
        modo: 'automatico',
        confianca: melhorScore,
        dados_comprovante: dadosComprovante,
      });
    }

    // Confiança baixa — retorna candidatos para revisão manual
    const topCandidatos = (candidatos || [])
      .map(p => ({ ...p, _score: calcularConfianca(dadosComprovante, p) }))
      .filter(p => p._score > 20)
      .sort((a, b) => b._score - a._score)
      .slice(0, 5);

    return Response.json({
      success: false,
      revisao_manual: true,
      confianca: melhorScore,
      dados_comprovante: dadosComprovante,
      candidatos: topCandidatos,
      mensagem: melhorScore > 0
        ? `Correspondência parcial (${melhorScore}%). Selecione manualmente.`
        : 'Nenhuma correspondência encontrada. Vincule manualmente.',
    });

  } catch (error) {
    console.error('vincularComprovantePagamento error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});