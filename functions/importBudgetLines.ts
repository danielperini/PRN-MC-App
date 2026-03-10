import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import * as xlsx from 'npm:xlsx@0.18.5';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores podem importar rubricas.' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file');
    if (!file) return Response.json({ error: 'Arquivo não enviado.' }, { status: 400 });

    const buffer = await file.arrayBuffer();
    const workbook = xlsx.read(new Uint8Array(buffer), { type: 'array' });

    const sheetName = workbook.SheetNames.find(n => n.includes('ORCAMENTO')) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(sheet, { defval: null });

    const lines = rows
      .filter(r => r['Item_ID'] || r['Código'] || r['codigo'])
      .map(r => ({
        codigo: String(r['Item_ID'] || r['Código'] || r['codigo'] || '').trim(),
        natureza_codigo: String(r['Natureza'] || r['natureza_codigo'] || '').trim(),
        natureza_nome: String(r['Natureza (nome)'] || r['natureza_nome'] || '').trim(),
        item_numero: String(r['Item (nº)'] || r['item_numero'] || '').trim(),
        descricao: String(r['Descrição'] || r['Descricao'] || r['descricao'] || '').trim(),
        unidade: String(r['Unidade'] || r['unidade'] || 'un').trim(),
        qtd: parseFloat(r['Qtd'] || r['qtd'] || 1) || 1,
        periodo_meses: parseFloat(r['Período (meses)'] || r['periodo_meses'] || 0) || 0,
        valor_unit_medio: parseFloat(r['Valor unit. médio'] || r['valor_unit_medio'] || 0) || 0,
        valor_total_previsto: parseFloat(r['Valor total previsto'] || r['valor_total_previsto'] || 0) || 0,
        saldo_inicial: parseFloat(r['Saldo inicial (editável)'] || r['Saldo inicial'] || r['saldo_inicial'] || r['Valor total previsto'] || 0) || 0,
        saldo_comprometido: 0,
        ativo: true,
      }))
      .filter(l => l.codigo && l.descricao);

    if (lines.length === 0) {
      return Response.json({ error: 'Nenhum item válido encontrado. Verifique a aba ORCAMENTO_3A.' }, { status: 400 });
    }

    // Apagar existentes e reimportar
    const existing = await base44.asServiceRole.entities.BudgetLine.list('codigo', 500);
    await Promise.all(existing.map(e => base44.asServiceRole.entities.BudgetLine.delete(e.id)));

    // Criar novos em lotes
    const created = await base44.asServiceRole.entities.BudgetLine.bulkCreate(lines);

    return Response.json({ success: true, imported: lines.length, items: lines.map(l => l.codigo) });
  } catch (error) {
    console.error('importBudgetLines error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});