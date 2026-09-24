const PUBLIC_PURCHASE_FIELDS = [
  'id','base44_id','numero_solicitacao','nf_numero','descricao','descricao_servico','objeto',
  'fornecedor_nome','nf_emitente_nome','fornecedor','solicitante_nome','user_email','created_by',
  'nf_data_emissao','data_solicitacao','created_at','created_date','centro_custo','meta_nome',
  'meta_id','natureza_despesa','codigo_item_pbh','status','nf_pdf_url','nota_fiscal_url',
  'arquivo_url','drive_file_url','purchase_document_id',
];

export function buildRubricaComposition(rubricas, rows) {
  const byRubrica = Object.fromEntries(rubricas.map(r => [String(r.id), {
    id: String(r.id), grupo: r.grupo, rubrica: r.rubrica,
    centro_custo: r.centro_custo, orcado: Number(r.orcado || 0),
    total_cents: 0, solicitacoes: [],
  }]));
  for (const row of rows) {
    const group = byRubrica[row.rubrica_id];
    if (!group) continue;
    const cents = Number(row.amount_cents);
    if (!Number.isSafeInteger(cents)) throw new Error('purchase_amount_out_of_range');
    group.total_cents += cents;
    const p = row.purchase || {};
    group.solicitacoes.push(Object.fromEntries([...PUBLIC_PURCHASE_FIELDS.map(field => [field, p[field]]), ['valor_composicao', cents / 100]]));
  }
  for (const group of Object.values(byRubrica)) {
    if (!Number.isSafeInteger(group.total_cents)) throw new Error('rubrica_amount_out_of_range');
    group.utilizado = group.total_cents / 100;
    group.saldo = Math.round(group.orcado * 100 - group.total_cents) / 100;
    group.percentual = group.orcado > 0 ? group.utilizado / group.orcado * 100 : 0;
  }
  return byRubrica;
}
