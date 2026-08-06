import { base44 } from '@/api/base44Client';
import { COORD_GERAL_EMAILS } from '@/components/auth/permissions';

function parseValorBR(value) {
  const raw = String(value ?? '').trim().replace(/\s/g, '');
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) {
    return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return Number(raw.replace(',', '.')) || 0;
}

// Cria PurchaseRequest (SOLICITADO), Attachment, atualiza DocumentIntake
// para ENVIADO_APROVACAO + ocultar_entrada_unica=true e notifica coordenadores
// in-app. Reutilizado pelo pipeline de reprocessamento da Entrada Única.
// Retorna { ok, motivo }.
export async function enviarIntakeParaAprovacao(intake) {
  try {
    const ia = intake.resultado_ia || {};
    const rubrica_id = intake.rubrica_id_sugerida || intake.rubrica_id || ia.rubrica_id;
    const centro_custo = intake.centro_custo || ia.centro_custo_sugerido;
    const valor = parseValorBR(ia.nf_valor_total || ia.valor || ia.valor_total || intake.nf_valor_total || 0);
    const fileName = intake.file_name_final || intake.file_name_original || 'Arquivo';

    if (!rubrica_id || !centro_custo || !valor) {
      return { ok: false, motivo: 'rubrica/centro_custo/valor ausente' };
    }

    const rubrica = await base44.entities.Rubrica.get(rubrica_id).catch(() => null);
    const rubrica_nome =
      rubrica?.rubrica || rubrica?.nome || rubrica?.descricao || intake.rubrica_nome_sugerida || '';

    const novaPurchase = await base44.entities.PurchaseRequest.create({
      descricao_item: ia.descricao_servico || ia.nf_emitente_nome || intake.fornecedor_nome || fileName,
      fornecedor_nome: ia.nf_emitente_nome || intake.fornecedor_nome || '',
      fornecedor_cpf_cnpj: ia.nf_emitente_cpf_cnpj || intake.fornecedor_cpf_cnpj || '',
      valor_solicitado: valor,
      valor_total: valor,
      valor: valor,
      rubrica_id,
      rubrica_nome,
      budgetline_id: rubrica_id,
      centro_custo,
      nota_fiscal_url: intake.arquivo_original_url || '',
      arquivo_url: intake.arquivo_original_url || '',
      status: 'SOLICITADO',
      origem: 'EntradaUnica',
      intake_id: intake.id,
      documento_intake_id: intake.id,
      nf_numero: ia.nf_numero || intake.nf_numero || '',
      nf_emitente_nome: ia.nf_emitente_nome || intake.fornecedor_nome || '',
      nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || intake.fornecedor_cpf_cnpj || '',
      nf_valor_total: valor,
      nf_data_emissao: ia.nf_data_emissao || ia.data_emissao || intake.nf_data_emissao || '',
    });

    await base44.entities.Attachment.create({
      purchase_request_id: novaPurchase?.id || '',
      document_intake_id: intake.id,
      file_name: fileName,
      file_url: intake.arquivo_original_url || '',
      file_type: intake.mime_type || 'application/pdf',
      description: 'Entrada Única — auto-envio (pipeline de reprocessamento)',
      nf_tipo_documento: 'pdf_nf',
      nf_numero: ia.nf_numero || intake.nf_numero || '',
      nf_valor_total: valor,
      nf_data_emissao: ia.nf_data_emissao || ia.data_emissao || intake.nf_data_emissao || '',
      nf_emitente_nome: ia.nf_emitente_nome || intake.fornecedor_nome || '',
      nf_emitente_cpf_cnpj: ia.nf_emitente_cpf_cnpj || intake.fornecedor_cpf_cnpj || '',
      rubrica_id,
      rubrica_nome,
    }).catch(() => null);

    await base44.entities.DocumentIntake.update(intake.id, {
      status_processamento: 'ENVIADO_APROVACAO',
      ocultar_entrada_unica: true,
      entidade_destino: 'PurchaseRequest',
      entidade_destino_id: novaPurchase?.id || '',
    });

    if (intake.nf_xml_intake_id) {
      await base44.entities.DocumentIntake.update(intake.nf_xml_intake_id, {
        entidade_destino: 'PurchaseRequest',
        entidade_destino_id: novaPurchase?.id || '',
      }).catch(() => null);
    }

    await Promise.all(
      COORD_GERAL_EMAILS.map((email) =>
        base44.entities.Notification
          .create({
            user_email: email,
            type: 'INVOICE_SUBMITTED',
            title: 'NF enviada para aprovação (auto-pipeline)',
            message: `${fileName} — R$ ${valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })} — ${
              ia.nf_emitente_nome || intake.fornecedor_nome || ''
            }`,
            entity_type: 'PurchaseRequest',
            entity_id: novaPurchase?.id || '',
            action_url: '/Compras',
            read: false,
            email_sent: false,
          })
          .catch(() => {})
      )
    );

    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: String(e?.message || e) };
  }
}

export { parseValorBR };