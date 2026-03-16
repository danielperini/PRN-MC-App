import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

// Pasta Financeiro — planilha espelho de rubricas e movimentações
const FINANCEIRO_FOLDER_ID = '1KqVGVQDQPD6GSXpLxi4APaG8LWBTYy98';
const FILE_NAME = 'espelho_rubricas_movimentacoes.csv';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let authorized = false;
    try {
      const user = await base44.auth.me();
      authorized = !!user;
    } catch (_) {
      authorized = true; // chamado por automação
    }
    if (!authorized) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Buscar rubricas e lançamentos
    const [rubricas, lancamentos] = await Promise.all([
      base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 300),
      base44.asServiceRole.entities.LancamentoRubrica.list('-created_date', 2000)
    ]);

    // Buscar compras aprovadas vinculadas a rubricas
    const compras = await base44.asServiceRole.entities.PurchaseRequest.filter({}, '-created_date', 1000);

    // ---- Seção 1: Resumo de Rubricas ----
    const rubricaHeaders = ['Grupo', 'Rubrica', 'Nº Parcelas/Unidades', 'Valor Total (R$)', 'Valor Utilizado (R$)', 'Saldo (R$)', '% Utilizado', 'Obs Uso', 'Ativo'];
    const rubricaRows = rubricas.map(r => [
      `"${(r.grupo || '').replace(/"/g, '""')}"`,
      `"${(r.rubrica || '').replace(/"/g, '""')}"`,
      `"${(r.numero_parcelas_unidades || '').replace(/"/g, '""')}"`,
      (r.valor_rubrica || 0).toFixed(2),
      (r.valor_utilizado || 0).toFixed(2),
      (r.saldo || 0).toFixed(2),
      `${(r.percentual_utilizado || 0).toFixed(2)}%`,
      `"${(r.observacao_uso || '').replace(/"/g, '""')}"`,
      r.ativo ? 'Sim' : 'Não'
    ]);

    // ---- Seção 2: Lançamentos/Movimentações ----
    const lancHeaders = ['Data', 'Rubrica ID', 'Descrição', 'Valor (R$)', 'Tipo', 'Referência', 'Criado por'];
    const lancRows = lancamentos.map(l => {
      const rubrica = rubricas.find(r => r.id === l.rubrica_id);
      return [
        `"${(l.created_date || '').split('T')[0]}"`,
        `"${(rubrica?.rubrica || l.rubrica_id || '').replace(/"/g, '""')}"`,
        `"${(l.descricao || '').replace(/"/g, '""')}"`,
        (l.valor || 0).toFixed(2),
        `"${(l.tipo || 'debit').replace(/"/g, '""')}"`,
        `"${(l.referencia || '').replace(/"/g, '""')}"`,
        `"${(l.created_by || '').replace(/"/g, '""')}"`
      ];
    });

    // ---- Seção 3: Compras vinculadas a rubricas ----
    const compraHeaders = ['Data', 'Solicitante', 'Descrição', 'Fornecedor', 'Valor Solicitado (R$)', 'Valor Aprovado (R$)', 'Status', 'Rubrica'];
    const compraRows = compras.filter(c => c.rubrica_id || c.budget_line_id).map(c => {
      const rubrica = rubricas.find(r => r.id === (c.rubrica_id || c.budget_line_id));
      return [
        `"${(c.created_date || '').split('T')[0]}"`,
        `"${(c.solicitante_nome || c.created_by || '').replace(/"/g, '""')}"`,
        `"${(c.descricao_item || '').replace(/"/g, '""')}"`,
        `"${(c.fornecedor_nome || '').replace(/"/g, '""')}"`,
        (c.valor_solicitado || 0).toFixed(2),
        (c.valor_aprovado_admin || 0).toFixed(2),
        `"${(c.status || '').replace(/"/g, '""')}"`,
        `"${(rubrica?.rubrica || '').replace(/"/g, '""')}"`
      ];
    });

    // Montar CSV com seções separadas
    const lines = [
      '=== RUBRICAS - SALDOS E UTILIZACAO ===',
      rubricaHeaders.join(','),
      ...rubricaRows.map(r => r.join(',')),
      '',
      '=== LANCAMENTOS E MOVIMENTACOES ===',
      lancHeaders.join(','),
      ...lancRows.map(r => r.join(',')),
      '',
      '=== COMPRAS VINCULADAS A RUBRICAS ===',
      compraHeaders.join(','),
      ...compraRows.map(r => r.join(','))
    ];

    const csvContent = lines.join('\n');
    const csvBytes = new TextEncoder().encode('\uFEFF' + csvContent);

    // Verificar se planilha já existe e atualizar, senão criar
    const q = encodeURIComponent(`name='${FILE_NAME}' and '${FINANCEIRO_FOLDER_ID}' in parents and trashed=false`);
    const searchRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
      headers: { Authorization: `Bearer ${accessToken}` }
    });
    const searchData = await searchRes.json();
    const existingFile = searchData.files?.[0];

    let result;
    if (existingFile) {
      const updateRes = await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'text/csv; charset=UTF-8' },
        body: csvBytes
      });
      result = await updateRes.json();
    } else {
      const boundary = 'rubrica_espelho_boundary';
      const metaPart = JSON.stringify({ name: FILE_NAME, parents: [FINANCEIRO_FOLDER_ID], mimeType: 'text/csv' });
      const enc = new TextEncoder();
      const part1 = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaPart}\r\n`);
      const part2 = enc.encode(`--${boundary}\r\nContent-Type: text/csv; charset=UTF-8\r\n\r\n`);
      const part3 = enc.encode(`\r\n--${boundary}--`);
      const body = new Uint8Array(part1.length + part2.length + csvBytes.length + part3.length);
      body.set(part1, 0);
      body.set(part2, part1.length);
      body.set(csvBytes, part1.length + part2.length);
      body.set(part3, part1.length + part2.length + csvBytes.length);
      const createRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
        body
      });
      result = await createRes.json();
    }

    return Response.json({
      success: true,
      file_name: FILE_NAME,
      folder: 'Financeiro',
      folder_id: FINANCEIRO_FOLDER_ID,
      file_id: result.id,
      action: existingFile ? 'updated' : 'created',
      total_rubricas: rubricas.length,
      total_lancamentos: lancamentos.length,
      total_compras_vinculadas: compraRows.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});