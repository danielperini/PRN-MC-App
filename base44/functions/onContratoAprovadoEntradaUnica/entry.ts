import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

/**
 * onContratoAprovadoEntradaUnica
 *
 * Automação de entidade: dispara quando um DocumentIntake de CONTRATO
 * tem status_processamento alterado para 'APROVADO'.
 *
 * Fluxo:
 * 1. Valida que é um contrato aprovado
 * 2. Chama processarContratoEntradaUnica para criar/atualizar TeamMember e backup no Drive
 * 3. Atualiza status do intake para ENVIADO_APROVACAO
 * 4. Registra no AuditLog
 */

function toNumber(v: unknown) {
  const n = Number(String(v || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const entityId = body?.event?.entity_id || body?.data?.id;
    if (!entityId) {
      return Response.json({ skipped: true, reason: 'sem entity_id' });
    }

    // Carregar o intake atualizado
    const intake = await base44.asServiceRole.entities.DocumentIntake.get(entityId).catch(() => null);
    if (!intake) return Response.json({ skipped: true, reason: 'intake_nao_encontrado' });

    // Só processa contratos aprovados
    const tipo = String(intake.tipo_detectado || '').toUpperCase();
    const status = String(intake.status_processamento || '').toUpperCase();

    if (tipo !== 'CONTRATO') {
      return Response.json({ skipped: true, reason: 'nao_e_contrato', tipo });
    }
    if (status !== 'APROVADO') {
      return Response.json({ skipped: true, reason: 'nao_aprovado', status });
    }

    const dadosIA = intake.resultado_ia || {};
    const fileUrl = intake.arquivo_original_url || '';
    const filename = intake.file_name_original || intake.file_name_final || 'contrato.pdf';

    // --- Criar/atualizar TeamMember completo ---
    const cpfLimpo = String(dadosIA.contratado_cpf || dadosIA.fornecedor_cpf_cnpj || intake.nf_emitente_cpf_cnpj || '').replace(/\D/g, '');
    const cnpjLimpo = String(dadosIA.contratado_cnpj || '').replace(/\D/g, '');
    const nome = String(dadosIA.contratado_nome || dadosIA.fornecedor_nome || intake.fornecedor_nome || '').trim();

    let teamMemberResult: any = null;

    if (nome) {
      // Buscar membro existente
      let existente: any = null;
      if (cpfLimpo) {
        const r = await base44.asServiceRole.entities.TeamMember.filter({ cpf: cpfLimpo }).catch(() => []);
        existente = (r as any[])[0] || null;
      }
      if (!existente && cnpjLimpo) {
        const r = await base44.asServiceRole.entities.TeamMember.filter({ cnpj: cnpjLimpo }).catch(() => []);
        existente = (r as any[])[0] || null;
      }
      if (!existente) {
        const r = await base44.asServiceRole.entities.TeamMember.filter({ user_name: nome }).catch(() => []);
        existente = (r as any[])[0] || null;
      }

      const tipoPessoa = String(dadosIA.contratado_tipo || dadosIA.fornecedor_tipo || 'PF') === 'PJ' ? 'ME' : 'PF';

      const fichaCompleta = {
        user_name: nome,
        tipo_pessoa: tipoPessoa,
        cpf: cpfLimpo || null,
        cnpj: cnpjLimpo || null,
        funcao: dadosIA.funcao_projeto || dadosIA.responsavel_tecnico || dadosIA.funcao || '',
        empresa_nome: tipoPessoa !== 'PF' ? nome : null,
        representante_legal_nome: dadosIA.contratado_representante || null,
        representante_legal_cpf: String(dadosIA.contratado_cpf_representante || '').replace(/\D/g, '') || null,
        empresa_endereco: dadosIA.contratado_endereco || null,
        telefone: dadosIA.contratado_telefone || null,
        email_pessoal: dadosIA.contratado_email || null,
        banco: dadosIA.contratado_banco || dadosIA.fornecedor_banco || '',
        agencia: dadosIA.contratado_agencia || dadosIA.fornecedor_agencia || '',
        conta: dadosIA.contratado_conta || dadosIA.fornecedor_conta || '',
        tipo_conta: dadosIA.contratado_tipo_conta || 'Corrente',
        pix_key: dadosIA.contratado_pix || dadosIA.fornecedor_pix || '',
        valor_total: toNumber(dadosIA.valor_total),
        numero_parcelas: toNumber(dadosIA.numero_parcelas) || 1,
        valor_parcela: toNumber(dadosIA.valor_parcela),
        data_assinatura: dadosIA.data_assinatura || null,
        data_inicio_contrato: dadosIA.vigencia_inicio || dadosIA.data_inicio || null,
        data_fim_contrato: dadosIA.vigencia_fim || dadosIA.data_fim || null,
        contrato_url: fileUrl,
        objeto_contrato: dadosIA.objeto_contrato || dadosIA.escopo || '',
        escopo_descricao: dadosIA.escopo_atividades || dadosIA.escopo || '',
        museu_projeto: dadosIA.museu_relacionado || dadosIA.museu_local || '',
        centro_custo: dadosIA.centro_custo || '',
        numero_contrato: dadosIA.numero_contrato || dadosIA.contrato_numero || '',
        status: 'ATIVO',
        status_contrato: 'VIGENTE',
        cronograma_parcelas: Array.isArray(dadosIA.datas_pagamento) && dadosIA.datas_pagamento.length > 0
          ? dadosIA.datas_pagamento.map((d: string, i: number) => ({
              numero: i + 1,
              valor: toNumber(dadosIA.valor_parcela),
              vencimento: d,
              status: 'pendente',
            }))
          : Array.isArray(dadosIA.datas_vencimento) && dadosIA.datas_vencimento.length > 0
          ? dadosIA.datas_vencimento.map((d: string, i: number) => ({
              numero: i + 1,
              valor: toNumber(dadosIA.valor_parcela),
              vencimento: d,
              status: 'pendente',
            }))
          : [],
      };

      if (existente) {
        const updates: Record<string, any> = {};
        for (const [k, v] of Object.entries(fichaCompleta)) {
          if (!existente[k] && v) updates[k] = v;
        }
        // Sempre atualiza contrato_url
        if (fileUrl) updates.contrato_url = fileUrl;
        if (Object.keys(updates).length > 0) {
          await base44.asServiceRole.entities.TeamMember.update(existente.id, updates);
        }
        teamMemberResult = { acao: 'atualizado', id: existente.id, nome };
      } else {
        const emailInterno = cpfLimpo
          ? `cpf.${cpfLimpo}@contrato.interno`
          : cnpjLimpo
          ? `cnpj.${cnpjLimpo}@contrato.interno`
          : `membro.${nome.toLowerCase().replace(/\s+/g, '.')}.${Date.now()}@contrato.interno`;

        const criado = await base44.asServiceRole.entities.TeamMember.create({
          ...fichaCompleta,
          user_email: emailInterno,
        });
        teamMemberResult = { acao: 'criado', id: criado?.id, nome };
      }
    }

    // Processar membros adicionais da equipe mencionados no contrato
    const membrosExtras = Array.isArray(dadosIA.membros_equipe) ? dadosIA.membros_equipe : [];
    const membrosResultados: any[] = [teamMemberResult].filter(Boolean);

    for (const membro of membrosExtras) {
      if (!membro?.nome) continue;
      if (membro.nome.toLowerCase() === nome.toLowerCase()) continue;
      try {
        const cpfM = String(membro.cpf || '').replace(/\D/g, '');
        let existeM: any = null;
        if (cpfM) {
          const r = await base44.asServiceRole.entities.TeamMember.filter({ cpf: cpfM }).catch(() => []);
          existeM = (r as any[])[0] || null;
        }
        if (!existeM) {
          const r = await base44.asServiceRole.entities.TeamMember.filter({ user_name: membro.nome }).catch(() => []);
          existeM = (r as any[])[0] || null;
        }

        if (existeM) {
          const upd: Record<string, any> = {};
          if (!existeM.funcao && membro.funcao) upd.funcao = membro.funcao;
          if (!existeM.centro_custo && dadosIA.centro_custo) upd.centro_custo = dadosIA.centro_custo;
          if (!existeM.museu_projeto && dadosIA.museu_relacionado) upd.museu_projeto = dadosIA.museu_relacionado;
          if (!existeM.contrato_url && fileUrl) upd.contrato_url = fileUrl;
          if (Object.keys(upd).length > 0) {
            await base44.asServiceRole.entities.TeamMember.update(existeM.id, upd);
          }
          membrosResultados.push({ acao: 'atualizado', id: existeM.id, nome: membro.nome });
        } else {
          const emailM = cpfM
            ? `cpf.${cpfM}@contrato.interno`
            : `membro.${membro.nome.toLowerCase().replace(/\s+/g, '.')}.${Date.now()}@contrato.interno`;
          const criadoM = await base44.asServiceRole.entities.TeamMember.create({
            user_email: emailM,
            user_name: membro.nome,
            tipo_pessoa: 'PF',
            cpf: cpfM || null,
            funcao: membro.funcao || '',
            valor_parcela: toNumber(membro.valor_mensal),
            museu_projeto: dadosIA.museu_relacionado || '',
            centro_custo: dadosIA.centro_custo || '',
            contrato_url: fileUrl,
            status: 'ATIVO',
          });
          membrosResultados.push({ acao: 'criado', id: criadoM?.id, nome: membro.nome });
        }
      } catch (e) {
        console.error('[Membro extra]', membro.nome, e);
      }
    }

    // --- Backup no Drive via processarContratoEntradaUnica ---
    let driveResult: any = null;
    try {
      driveResult = await base44.asServiceRole.functions.invoke('processarContratoEntradaUnica', {
        intake_id: entityId,
        file_url: fileUrl,
        file_name: filename,
      });
    } catch (driveErr) {
      console.error('[Drive backup]', driveErr);
    }

    // --- Atualizar intake para ENVIADO_APROVACAO ---
    await base44.asServiceRole.entities.DocumentIntake.update(entityId, {
      status_processamento: 'ENVIADO_APROVACAO',
      grupo_status: 'VINCULADO',
      entidade_destino: 'TeamMember',
      entidade_destino_id: teamMemberResult?.id || intake.entidade_destino_id || '',
      revisado_pelo_usuario: true,
      contrato_drive_url: driveResult?.data?.drive_file_url || intake.contrato_drive_url || '',
      contrato_drive_folder_id: driveResult?.data?.drive_folder_id || intake.contrato_drive_folder_id || '',
    });

    // --- AuditLog ---
    await base44.asServiceRole.entities.AuditLog.create({
      action: 'APPROVE',
      entity_type: 'CONTRATO',
      entity_id: entityId,
      actor_email: 'system@automation',
      actor_name: 'Automação - Contrato Aprovado',
      details: `Contrato aprovado em Entrada de Documentos. TeamMembers: ${membrosResultados.map(m => `${m.nome} (${m.acao})`).join(', ')}. Drive backup: ${driveResult?.data?.drive_file_url ? 'OK' : 'falhou'}.`,
    }).catch(() => {});

    return Response.json({
      success: true,
      intake_id: entityId,
      membros: membrosResultados,
      drive_backup: driveResult?.data || null,
    });

  } catch (error) {
    console.error('[onContratoAprovadoEntradaUnica]', error);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});