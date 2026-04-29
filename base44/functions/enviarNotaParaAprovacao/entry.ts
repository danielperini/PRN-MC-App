import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function parseValor(v: any) {
  if (!v) return 0;
  if (typeof v === 'number') return v;

  return Number(
    String(v)
      .replace('R$', '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .trim()
  ) || 0;
}

function norm(v: any) {
  return String(v || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isEquipe(form: any) {
  return (
    norm(form?.tipo_pagamento) === 'equipe' ||
    norm(form?.destino_aprovacao) === 'equipe' ||
    norm(form?.tipo_gasto) === 'equipe'
  );
}

function mesReferencia(value: any) {
  const raw = norm(value);

  if (raw.includes('01') || raw.includes('janeiro')) return 'Janeiro';
  if (raw.includes('02') || raw.includes('fevereiro')) return 'Fevereiro';
  if (raw.includes('03') || raw.includes('marco')) return 'Março';
  if (raw.includes('04') || raw.includes('abril')) return 'Abril';
  if (raw.includes('05') || raw.includes('maio')) return 'Maio';
  if (raw.includes('06') || raw.includes('junho')) return 'Junho';
  if (raw.includes('07') || raw.includes('julho')) return 'Julho';
  if (raw.includes('08') || raw.includes('agosto')) return 'Agosto';
  if (raw.includes('09') || raw.includes('setembro')) return 'Setembro';
  if (raw.includes('10') || raw.includes('outubro')) return 'Outubro';
  if (raw.includes('11') || raw.includes('novembro')) return 'Novembro';
  if (raw.includes('12') || raw.includes('dezembro')) return 'Dezembro';

  return 'Abril';
}

function anoReferencia(value: any) {
  const match = String(value || '').match(/(\d{4})/);
  return match ? Number(match[1]) : new Date().getFullYear();
}

async function resolveBudgetLineId(base44: any, form: any, intake: any) {
  const direct =
    form.budgetline_id ||
    form.budgetLineId ||
    form.budget_line_id ||
    intake?.budgetline_id ||
    intake?.budgetLineId ||
    intake?.budget_line_id;

  if (direct) return direct;

  const rubricaId = form.rubrica_id || intake?.rubrica_id_sugerida || intake?.rubrica_id;
  const rubricaNome = form.rubrica_nome || intake?.rubrica_nome_sugerida || '';

  const linhas = await base44.asServiceRole.entities.BudgetLine.list('', 2000);

  const porRubricaId = (linhas || []).find((b: any) =>
    b?.rubrica_id === rubricaId ||
    b?.rubricaId === rubricaId ||
    b?.rubrica_ref_id === rubricaId ||
    b?.rubrica === rubricaId
  );

  if (porRubricaId?.id) return porRubricaId.id;

  const rubricaNomeNormalizado = norm(rubricaNome);

  if (rubricaNomeNormalizado) {
    const porNome = (linhas || []).find((b: any) => {
      const campos = [
        b?.rubrica_nome,
        b?.rubrica,
        b?.nome,
        b?.descricao,
        b?.item,
        b?.titulo,
      ].map(norm);

      return campos.some((campo) =>
        campo &&
        (campo === rubricaNomeNormalizado ||
          campo.includes(rubricaNomeNormalizado) ||
          rubricaNomeNormalizado.includes(campo))
      );
    });

    if (porNome?.id) return porNome.id;
  }

  const porCentro = (linhas || []).find((b: any) => {
    const mesmoCentro =
      norm(b?.centro_custo) === norm(form.centro_custo || intake?.centro_custo);

    return mesmoCentro && b?.id;
  });

  if (porCentro?.id) return porCentro.id;

  const primeira = (linhas || []).find((b: any) => b?.id);
  return primeira?.id || '';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { intakeId, form = {} } = body;

    if (!intakeId) return json({ success: false, error: 'intakeId obrigatório' }, 400);
    if (!form.rubrica_id) return json({ success: false, error: 'Rubrica obrigatória' }, 400);

    const valor = parseValor(form.nf_valor_total || form.valor_total || form.valor);
    if (!valor) return json({ success: false, error: 'Valor inválido' }, 400);

    const intake = await base44.asServiceRole.entities.DocumentIntake.get(intakeId);

    const fileUrl =
      form.file_url ||
      form.nota_fiscal_url ||
      intake?.arquivo_original_url ||
      intake?.file_url ||
      intake?.url ||
      '';

    const nomeFinal =
      form.nome_padronizado_arquivo ||
      form.nome_arquivo_padronizado ||
      intake?.file_name_final ||
      intake?.file_name_original ||
      intake?.file_name ||
      'nota-fiscal.pdf';

    const rubricaNome =
      form.rubrica_nome ||
      intake?.rubrica_nome_sugerida ||
      '';

    let created;

    if (isEquipe(form)) {
      created = await base44.asServiceRole.entities.TeamPayment.create({
        team_member_id: intake?.user_email || `entrada_unica_${intakeId}`,
        user_email: intake?.user_email || 'sem-email@entrada-unica.local',
        user_name: intake?.user_name || form.nf_emitente_nome || 'Profissional',
        funcao: form.tipo_gasto || 'Equipe',
        role: form.tipo_gasto || 'Equipe',

        mes_referencia: mesReferencia(form.nf_competencia),
        ano: anoReferencia(form.nf_competencia),

        rubrica_id: form.rubrica_id,
        rubrica_nome: rubricaNome,

        nota_fiscal_url: fileUrl,
        nota_fiscal_file_name: nomeFinal,
        file_url: fileUrl,

        xml_url: form.xml_url || '',
        xml_file_name: form.xml_vinculado_nome || '',

        numero_nf: form.nf_numero || '',
        valor_nf: valor,
        valor_total: valor,
        valor: valor,

        nf_numero_extraido: form.nf_numero || '',
        nf_valor_extraido: valor,
        nf_cnpj_emitente: form.nf_emitente_cpf_cnpj || '',
        nf_razao_social: form.nf_emitente_nome || '',
        nf_data_emissao: form.nf_data_emissao || '',
        nf_competencia: form.nf_competencia || '',

        status: 'AGUARDANDO_APROVACAO',
        observacoes: `Entrada Única. ${form.descricao_servico || ''}`,
        resultado_validacao: JSON.stringify({
          origem: 'entrada_unica',
          intake_id: intakeId,
        }),
      });

      await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
        status_processamento: 'ENVIADO_APROVACAO',
        grupo_status: 'ENVIADO_APROVACAO',
        file_name_final: nomeFinal,
        entidade_destino: 'TeamPayment',
        entidade_destino_id: created.id,
        rubrica_id_sugerida: form.rubrica_id,
        rubrica_nome_sugerida: rubricaNome,
        centro_custo: form.centro_custo || intake?.centro_custo || '',
        revisado_pelo_usuario: true,
      });

      return json({
        success: true,
        destino: 'equipe',
        id: created.id,
        data: created,
      });
    }

    const budgetlineId = await resolveBudgetLineId(base44, form, intake);

    if (!budgetlineId) {
      return json({
        success: false,
        error: 'Não foi encontrada nenhuma BudgetLine para vincular esta solicitação.',
      }, 400);
    }

    created = await base44.asServiceRole.entities.PurchaseRequest.create({
      descricao_item: form.descricao_servico || form.nf_emitente_nome || 'Nota Fiscal',
      fornecedor_nome: form.nf_emitente_nome || '',
      fornecedor_cnpj: form.nf_emitente_cpf_cnpj || '',

      budgetline_id: budgetlineId,

      valor_solicitado: valor,
      valor_total: valor,
      valor: valor,
      nf_valor_total: valor,

      meta_id: form.meta_id || 'MC3A-20',
      categoria: form.categoria || 'Nota Fiscal',
      tipo_gasto: form.tipo_gasto || 'Serviço',
      centro_custo: form.centro_custo || intake?.centro_custo || 'Geral',

      rubrica_id: form.rubrica_id,
      rubrica_nome: rubricaNome,

      nota_fiscal_url: fileUrl,
      file_url: fileUrl,
      xml_url: form.xml_url || '',

      status: 'SOLICITADO',
      origem: 'entrada_unica',
      tipo_origem: 'entrada_unica',

      solicitante_email: intake?.user_email || '',
      created_by: intake?.user_email || '',

      observacoes: `Entrada Única. NF ${form.nf_numero || ''}. Arquivo: ${nomeFinal}`,
    });

    await base44.asServiceRole.entities.DocumentIntake.update(intakeId, {
      status_processamento: 'ENVIADO_APROVACAO',
      grupo_status: 'ENVIADO_APROVACAO',
      file_name_final: nomeFinal,
      entidade_destino: 'PurchaseRequest',
      entidade_destino_id: created.id,
      budgetline_id: budgetlineId,
      rubrica_id_sugerida: form.rubrica_id,
      rubrica_nome_sugerida: rubricaNome,
      centro_custo: form.centro_custo || intake?.centro_custo || '',
      revisado_pelo_usuario: true,
    });

    return json({
      success: true,
      destino: 'solicitacao',
      id: created.id,
      data: created,
    });
  } catch (err: any) {
    return json({
      success: false,
      error: err?.message || 'Erro interno ao enviar para aprovação',
    }, 500);
  }
});
