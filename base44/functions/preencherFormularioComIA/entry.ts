import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { invokeLLM } from '../_shared/gatewayIA.ts';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { purchaseId } = body;

    if (!purchaseId) {
      return Response.json({ success: false, error: 'purchaseId obrigatório.' }, { status: 400 });
    }

    // 1. Buscar PurchaseRequest
    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);
    if (!purchase) {
      return Response.json({ success: false, error: 'Solicitação não encontrada.' }, { status: 404 });
    }

    // 2. Coletar URLs de arquivos (do PurchaseRequest + DocumentIntake vinculado)
    const fileUrls = [];
    const addUrl = (url) => { if (url && typeof url === 'string' && url.startsWith('http')) fileUrls.push(url); };

    addUrl(purchase.nf_pdf_url);
    addUrl(purchase.nota_fiscal_url);
    addUrl(purchase.arquivo_url);
    addUrl(purchase.file_url);
    addUrl(purchase.documento_url);
    addUrl(purchase.orcamento_url);
    addUrl(purchase.comprovante_url);

    // Buscar DocumentIntake vinculado
    const intakeId = purchase.intake_id || purchase.documento_intake_id || purchase.entidade_destino_id || '';
    let intake = null;
    if (intakeId) {
      try {
        intake = await base44.asServiceRole.entities.DocumentIntake.get(intakeId);
      } catch { /* intake pode não existir mais */ }
    }

    if (intake) {
      addUrl(intake.arquivo_original_url);
      addUrl(intake.nf_xml_url);
      addUrl(intake.nf_pdf_url);
      addUrl(intake.recibo_url);
    }

    // Buscar Attachment vinculado
    try {
      const attachments = await base44.asServiceRole.entities.Attachment.filter(
        { purchase_request_id: purchaseId },
        '-created_date',
        10
      );
      for (const att of attachments || []) {
        addUrl(att.file_url);
        addUrl(att.url);
      }
    } catch { /* sem attachments */ }

    // Deduplicar URLs
    const uniqueUrls = [...new Set(fileUrls)];
    if (uniqueUrls.length === 0) {
      return Response.json({ success: false, error: 'Nenhum arquivo encontrado para análise.' }, { status: 400 });
    }

    // 3. Analisar com IA — extrair TODOS os campos possíveis
    const hoje = new Date().toISOString().slice(0, 10);

    const prompt = `Você é um especialista em documentos fiscais brasileiros (NF-e, XML, DANFE, recibos, comprovantes, contratos).
Analise TODOS os arquivos anexados e extraia CADA campo abaixo. Se houver XML e PDF juntos, prefira os dados do XML (é a fonte oficial).

Data atual: ${hoje}

INSTRUÇÕES CRÍTICAS:
- Extraia TODOS os campos, mesmo que parcialmente visíveis. Não deixe nada em branco se existir no documento.
- Para XML: leia as tags <emit>, <dest>, <ide>, <total>, <det>, <prod>, <pag>, <cobr>.
- Para PDF/DANFE: leia o quadro do emitente, destinatário, valores, dados bancários, chave de acesso.
- O CPF/CNPJ do EMITENTE (fornecedor) é OBRIGATÓRIO.
- O valor total da NF é OBRIGATÓRIO.
- Se for recibo/comprovante: extraia quem pagou, quem recebeu, valor, data, banco/PIX.
- Para XML de NF-e (modelo 55) ou NFC-e (modelo 65), extraia também: CFOP, natureza da operação, dados bancários se houver.
- Classifique o centro de custo com base no conteúdo: se menciona museu específico (MIS, MUMO, MHAB, MAB), use esse. Se menciona "Noturno" ou "Pampulha", use "Noturno Pampulha". Caso contrário, "Geral".
- Sugira a rubrica orçamentária mais adequada com base na descrição do serviço/produto.
- Extraia dados bancários: banco, agência, conta, chave PIX — se visíveis no documento.

Retorne APENAS um JSON válido com esta estrutura exata:
{
  "descricao_servico": "descrição completa e detalhada do serviço/produto",
  "fornecedor_nome": "razão social ou nome completo do emitente/fornecedor",
  "fornecedor_cpf_cnpj": "CPF ou CNPJ do emitente, apenas dígitos",
  "nf_numero": "número da nota fiscal",
  "nf_data_emissao": "YYYY-MM-DD",
  "nf_horario_emissao": "HH:MM:SS se disponível, senão vazio",
  "nf_valor_total": número,
  "nf_chave_acesso": "chave de acesso de 44 dígitos se for NF-e, senão vazio",
  "competencia": "Mês/Ano de referência (ex: Março/2026)",
  "centro_custo": "MIS | MHAB | MUMO | Geral | Noturno Pampulha | Noturno nos Museus 2026",
  "categoria": "Serviços (equipe/coordenação) | Serviços (comunicação) | Serviços (produção) | Serviços (eventos) | Logística | Alimentação | Consultoria | Materiais de consumo | Outros",
  "tipo_gasto": "Produto | Serviço",
  "meta_sugerida": "nome da meta/contratação (ex: Contratação da equipe principal)",
  "rubrica_nome": "nome da rubrica orçamentária mais provável",
  "rubrica_justificativa": "justificativa curta da sugestão de rubrica",
  "meio_pagamento": "PIX | TED/Transferência | Boleto | Cartão | Dinheiro",
  "dados_bancarios": "banco, agência, conta se disponível",
  "chave_pix": "chave PIX se informada",
  "observacoes": "informações relevantes adicionais",
  "municipio_emitente": "município do emitente",
  "nome_arquivo_origem": "nome do arquivo de onde extraiu os dados"
}`;

    const resultado = await invokeLLM(base44.asServiceRole,{
      prompt,
      file_urls: uniqueUrls,
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          descricao_servico: { type: 'string' },
          fornecedor_nome: { type: 'string' },
          fornecedor_cpf_cnpj: { type: 'string' },
          nf_numero: { type: 'string' },
          nf_data_emissao: { type: 'string' },
          nf_horario_emissao: { type: 'string' },
          nf_valor_total: { type: 'number' },
          nf_chave_acesso: { type: 'string' },
          competencia: { type: 'string' },
          centro_custo: { type: 'string' },
          categoria: { type: 'string' },
          tipo_gasto: { type: 'string' },
          meta_sugerida: { type: 'string' },
          rubrica_nome: { type: 'string' },
          rubrica_justificativa: { type: 'string' },
          meio_pagamento: { type: 'string' },
          dados_bancarios: { type: 'string' },
          chave_pix: { type: 'string' },
          observacoes: { type: 'string' },
          municipio_emitente: { type: 'string' },
          nome_arquivo_origem: { type: 'string' },
        },
      },
    });

    // 4. Persistir dados extraídos no PurchaseRequest (atualiza campos vazios ou sobrescreve)
    // InvokeLLM pode retornar { response: {...} } quando chamado via asServiceRole
    const extras = resultado?.response || resultado || {};

    const updateData = {};
    const fields = [
      ['descricao_item', extras.descricao_servico],
      ['fornecedor_nome', extras.fornecedor_nome],
      ['fornecedor_cnpj', extras.fornecedor_cpf_cnpj],
      ['fornecedor_cpf_cnpj', extras.fornecedor_cpf_cnpj],
      ['nf_emitente_nome', extras.fornecedor_nome],
      ['nf_emitente_cpf_cnpj', extras.fornecedor_cpf_cnpj],
      ['nf_numero', extras.nf_numero],
      ['nf_data_emissao', extras.nf_data_emissao],
      ['nf_valor_total', extras.nf_valor_total],
      ['nf_chave_acesso', extras.nf_chave_acesso],
      ['valor_solicitado', extras.nf_valor_total],
      ['valor_total', extras.nf_valor_total],
      ['centro_custo', extras.centro_custo],
      ['categoria', extras.categoria],
      ['tipo_gasto', extras.tipo_gasto],
      ['meta_id', extras.meta_sugerida],
      ['rubrica_nome', extras.rubrica_nome],
      ['meio_pagamento', extras.meio_pagamento],
      ['detalhe_pagamento', extras.dados_bancarios || extras.chave_pix],
      ['observacoes', extras.observacoes],
    ];

    const PLACEHOLDERS = new Set([
      'fornecedor não informado', 'fornecedor nao informado',
      'não informado', 'nao informado', 'desconhecido',
    ]);

    function isPlaceholder(v) {
      if (!v || (typeof v === 'string' && v.trim() === '')) return true;
      if (typeof v === 'number' && (v === 0 || !Number.isFinite(v))) return true;
      if (typeof v === 'string' && PLACEHOLDERS.has(v.toLowerCase().trim())) return true;
      return false;
    }

    for (const [key, value] of fields) {
      if (value !== undefined && value !== null && value !== '') {
        const atual = purchase[key];
        if (isPlaceholder(atual)) {
          updateData[key] = value;
        }
      }
    }

    // Sempre atualiza resultado_ia para auditoria
    updateData.resultado_ia = {
      ...(purchase.resultado_ia || {}),
      preenchimento_auto_ia: extras,
      preenchido_em: new Date().toISOString(),
      preenchido_por: user.email,
    };

    // Se não tinha valor e a IA encontrou, atualiza
    if (!purchase.valor_solicitado && extras.nf_valor_total) {
      updateData.valor_solicitado = extras.nf_valor_total;
      updateData.valor_total = extras.nf_valor_total;
    }

    if (Object.keys(updateData).length > 1) { // >1 porque resultado_ia sempre entra
      await base44.asServiceRole.entities.PurchaseRequest.update(purchaseId, updateData);
    }

    // Recupera o registro atualizado
    const updated = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

    return Response.json({
      success: true,
      purchase: updated,
      dados_extraidos: extras,
      arquivos_analisados: uniqueUrls.length,
    });

  } catch (error) {
    console.error('preencherFormularioComIA error:', error);
    return Response.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
});