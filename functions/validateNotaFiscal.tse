import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

function toNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;

  const normalized = String(value)
    .trim()
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function normalizeString(value: unknown): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function onlyDigits(value: unknown): string {
  return String(value || '').replace(/\D/g, '');
}

function compareFornecedor(a: unknown, b: unknown): boolean {
  const na = normalizeString(a);
  const nb = normalizeString(b);

  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const tokensA = new Set(na.split(' ').filter((t) => t.length >= 3));
  const tokensB = new Set(nb.split(' ').filter((t) => t.length >= 3));

  let hits = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) hits++;
  }

  const base = Math.max(tokensA.size, 1);
  return hits / base >= 0.6;
}

function compareCnpj(a: unknown, b: unknown): boolean {
  const da = onlyDigits(a);
  const db = onlyDigits(b);
  if (!da || !db) return false;
  return da === db;
}

function compareValor(nfValor: number, compraValor: number): {
  divergencia: boolean;
  diferencaAbsoluta: number;
  diferencaPercentual: number;
} {
  const a = toNumber(nfValor);
  const b = toNumber(compraValor);

  const diferencaAbsoluta = Math.abs(a - b);
  const base = b > 0 ? b : a > 0 ? a : 1;
  const diferencaPercentual = (diferencaAbsoluta / base) * 100;

  return {
    divergencia: diferencaAbsoluta > 0.01 && diferencaPercentual > 5,
    diferencaAbsoluta,
    diferencaPercentual: Math.round(diferencaPercentual * 100) / 100,
  };
}

function safeJsonParse(value: unknown): any | null {
  if (!value) return null;
  if (typeof value === 'object') return value;

  const text = String(value).trim();

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function getPurchaseValue(purchase: any): number {
  return (
    toNumber(purchase?.valor_pago) ||
    toNumber(purchase?.valor_aprovado_admin) ||
    toNumber(purchase?.valor_aprovado) ||
    toNumber(purchase?.valor_final) ||
    toNumber(purchase?.valor_solicitado) ||
    0
  );
}

function buildPrompt(document: any, purchase: any) {
  return `
Você está validando uma nota fiscal ou XML de nota fiscal contra uma compra registrada.

Sua tarefa é extrair do documento, com a melhor precisão possível:
- fornecedor
- cnpj_fornecedor
- numero_nota
- data_emissao
- valor_total

Depois compare com a compra e devolva SOMENTE JSON válido.

Contexto da compra:
- descricao_item: ${purchase?.descricao_item || ''}
- fornecedor_nome: ${purchase?.fornecedor_nome || ''}
- fornecedor_cnpj: ${purchase?.fornecedor_cnpj || ''}
- valor_compra: ${getPurchaseValue(purchase)}
- centro_custo: ${purchase?.centro_custo || ''}
- observacoes: ${purchase?.observacoes || ''}

Contexto do documento:
- tipo_documento: ${document?.tipo_documento || ''}
- nome_arquivo: ${document?.nome_arquivo || ''}
- file_url: ${document?.file_url || ''}
- descricao: ${document?.descricao || ''}
- numero_documento: ${document?.numero_documento || ''}
- data_documento: ${document?.data_documento || ''}
- fornecedor_informado: ${document?.fornecedor || ''}
- valor_documento_informado: ${document?.valor_documento || ''}

Responda SOMENTE neste formato JSON:
{
  "fornecedor": "",
  "cnpj_fornecedor": "",
  "numero_nota": "",
  "data_emissao": "",
  "valor_total": 0,
  "observacoes_extracao": "",
  "confianca_extracao": 0
}
`.trim();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) {
      return Response.json(
        { success: false, error: 'Não autenticado' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const documentId = body?.documentId || '';
    const purchaseIdFromBody = body?.purchaseId || '';

    if (!documentId) {
      return Response.json(
        { success: false, error: 'documentId é obrigatório' },
        { status: 400 }
      );
    }

    const document = await base44.asServiceRole.entities.PurchaseDocument.get(documentId);

    if (!document) {
      return Response.json(
        { success: false, error: 'Documento não encontrado' },
        { status: 404 }
      );
    }

    const purchaseId = purchaseIdFromBody || document?.purchase_id || '';
    if (!purchaseId) {
      return Response.json(
        { success: false, error: 'purchaseId não encontrado para o documento' },
        { status: 400 }
      );
    }

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

    if (!purchase) {
      return Response.json(
        { success: false, error: 'Compra não encontrada' },
        { status: 404 }
      );
    }

    let extraction: any = null;

    try {
      const llmRaw = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: buildPrompt(document, purchase),
      });

      extraction =
        safeJsonParse(llmRaw?.output) ||
        safeJsonParse(llmRaw?.result) ||
        safeJsonParse(llmRaw?.text) ||
        safeJsonParse(llmRaw);
    } catch (e) {
      console.error('Erro ao extrair dados da NF com IA:', e);
    }

    const fornecedorExtraido =
      extraction?.fornecedor ||
      document?.fornecedor ||
      '';

    const cnpjExtraido =
      extraction?.cnpj_fornecedor || '';

    const numeroNota =
      extraction?.numero_nota ||
      document?.numero_documento ||
      '';

    const dataEmissao =
      extraction?.data_emissao ||
      document?.data_documento ||
      '';

    const valorExtraido =
      toNumber(extraction?.valor_total) ||
      toNumber(document?.valor_documento);

    const compraValor = getPurchaseValue(purchase);

    const fornecedorCompra =
      purchase?.fornecedor_nome || '';

    const cnpjCompra =
      purchase?.fornecedor_cnpj || '';

    const fornecedorCompativel =
      compareFornecedor(fornecedorExtraido, fornecedorCompra) ||
      compareFornecedor(document?.fornecedor, fornecedorCompra) ||
      (cnpjExtraido && cnpjCompra ? compareCnpj(cnpjExtraido, cnpjCompra) : false);

    const valorComparacao = compareValor(valorExtraido, compraValor);

    const divergenciaFornecedor =
      !!fornecedorCompra &&
      !!fornecedorExtraido &&
      !fornecedorCompativel;

    const divergenciaValor =
      valorExtraido > 0 &&
      compraValor > 0 &&
      valorComparacao.divergencia;

    let confianca = 60;

    if (toNumber(extraction?.confianca_extracao) > 0) {
      confianca = Math.min(100, Math.max(0, toNumber(extraction.confianca_extracao)));
    } else {
      if (fornecedorExtraido) confianca += 10;
      if (valorExtraido > 0) confianca += 10;
      if (numeroNota) confianca += 5;
      if (dataEmissao) confianca += 5;
      if (!divergenciaFornecedor) confianca += 5;
      if (!divergenciaValor) confianca += 5;
      if (confianca > 95) confianca = 95;
    }

    const status =
      divergenciaFornecedor || divergenciaValor
        ? 'divergente'
        : 'validado';

    const result = {
      status,
      fornecedor: fornecedorExtraido,
      cnpj_fornecedor: cnpjExtraido,
      numero_nota: numeroNota,
      data_emissao: dataEmissao,
      valor: valorExtraido || null,
      valor_compra: compraValor || null,
      confianca,
      divergencia_valor: divergenciaValor,
      divergencia_fornecedor: divergenciaFornecedor,
      diferenca_valor_absoluta: valorComparacao.diferencaAbsoluta,
      diferenca_valor_percentual: valorComparacao.diferencaPercentual,
      justificativa: [
        divergenciaFornecedor ? 'Fornecedor divergente' : 'Fornecedor compatível',
        divergenciaValor ? 'Valor divergente' : 'Valor compatível',
      ].join(' | '),
      observacoes_extracao: extraction?.observacoes_extracao || '',
      documento_id: documentId,
      purchase_id: purchaseId,
    };

    return Response.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('validateNotaFiscal error:', error);

    return Response.json(
      {
        success: false,
        error: error?.message || String(error),
      },
      { status: 500 }
    );
  }
});
