import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const CONTRATOS_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';

function toNumber(value) {
  if (!value && value !== 0) return 0;
  const n = Number(String(value).replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

async function criarOuBuscarPastaContratos(accessToken) {
  // Busca se já existe pasta "Contratos" dentro do folder pai
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
    `'${CONTRATOS_FOLDER_ID}' in parents and name='Contratos' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  )}&fields=files(id,name)`;

  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const searchData = await searchRes.json();

  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Cria a pasta "Contratos"
  const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: 'Contratos',
      mimeType: 'application/vnd.google-apps.folder',
      parents: [CONTRATOS_FOLDER_ID],
    }),
  });
  const folder = await createRes.json();
  return folder.id;
}

async function uploadFileToDrive(accessToken, fileUrl, fileName, pastaId) {
  // Baixa o arquivo
  const fileRes = await fetch(fileUrl);
  const fileBlob = await fileRes.blob();
  const fileBuffer = await fileBlob.arrayBuffer();

  // Upload multipart no Drive
  const boundary = '-------314159265358979323846';
  const metadata = JSON.stringify({ name: fileName, parents: [pastaId] });
  const mimeType = 'application/pdf';

  const body = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  ];

  const encoder = new TextEncoder();
  const part1 = encoder.encode(body[0]);
  const part2 = encoder.encode(body[1]);
  const ending = encoder.encode(`\r\n--${boundary}--`);

  const combined = new Uint8Array(part1.byteLength + part2.byteLength + fileBuffer.byteLength + ending.byteLength);
  combined.set(part1, 0);
  combined.set(part2, part1.byteLength);
  combined.set(new Uint8Array(fileBuffer), part1.byteLength + part2.byteLength);
  combined.set(ending, part1.byteLength + part2.byteLength + fileBuffer.byteLength);

  const uploadRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,name', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body: combined,
  });

  return await uploadRes.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ success: false, error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const { intake_id, file_url, file_name } = body;

    if (!file_url || !intake_id) {
      return Response.json({ success: false, error: 'intake_id e file_url são obrigatórios' }, { status: 400 });
    }

    // 1. Extrair dados do contrato via IA (Claude para melhor precisão)
    const resultado = await base44.integrations.Core.InvokeLLM({
      prompt: `Você está analisando um contrato de prestação de serviços ou documento equivalente do Projeto Museus Centro (BH).

Leia o documento completo e extraia TODOS os campos abaixo com máxima precisão.
Se um campo não existir, retorne string vazia ou 0.

Campos obrigatórios:
- numero_contrato: número ou identificador do contrato
- tipo_documento: "CONTRATO" | "TERMO_ADITIVO" | "OUTRO"
- data_assinatura: YYYY-MM-DD
- vigencia_inicio: YYYY-MM-DD
- vigencia_fim: YYYY-MM-DD
- objeto_contrato: descrição completa do objeto/serviço contratado
- valor_total: número total do contrato
- numero_parcelas: número inteiro de parcelas
- valor_parcela: valor de cada parcela (número)
- datas_pagamento: array de strings YYYY-MM-DD de cada parcela
- fornecedor_nome: razão social ou nome completo do prestador/fornecedor
- fornecedor_cpf_cnpj: CPF ou CNPJ do fornecedor (somente dígitos)
- fornecedor_tipo: "PF" ou "PJ"
- fornecedor_banco: banco do fornecedor
- fornecedor_agencia: agência
- fornecedor_conta: conta
- fornecedor_pix: chave PIX
- responsavel_tecnico: nome do responsável técnico indicado no contrato
- membros_equipe: array de objetos {nome, funcao, cpf, valor_mensal}
- centro_custo: MIS | MHAB | MUMO | Geral | Publicações | Noturno nos Museus 2026
- museu_relacionado: nome do museu (MIS, MHAB, MUMO ou vazio)
- meta_contrato: MC3A-20 | MC3A-21 | MC3A-22 | MC3A-23 | MC3A-24 | MC3A-25 | MC3A-EXTRA
- rubrica_sugerida: nome da rubrica orçamentária
- contratante_nome: nome da contratante (ex: Associação Viaduto das Artes)
- contratante_cnpj: CNPJ da contratante
- justificativa_classificacao: breve justificativa`,
      file_urls: [file_url],
      model: 'claude_sonnet_4_6',
      response_json_schema: {
        type: 'object',
        properties: {
          numero_contrato: { type: 'string' },
          tipo_documento: { type: 'string' },
          data_assinatura: { type: 'string' },
          vigencia_inicio: { type: 'string' },
          vigencia_fim: { type: 'string' },
          objeto_contrato: { type: 'string' },
          valor_total: { type: 'number' },
          numero_parcelas: { type: 'number' },
          valor_parcela: { type: 'number' },
          datas_pagamento: { type: 'array', items: { type: 'string' } },
          fornecedor_nome: { type: 'string' },
          fornecedor_cpf_cnpj: { type: 'string' },
          fornecedor_tipo: { type: 'string' },
          fornecedor_banco: { type: 'string' },
          fornecedor_agencia: { type: 'string' },
          fornecedor_conta: { type: 'string' },
          fornecedor_pix: { type: 'string' },
          responsavel_tecnico: { type: 'string' },
          membros_equipe: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                nome: { type: 'string' },
                funcao: { type: 'string' },
                cpf: { type: 'string' },
                valor_mensal: { type: 'number' },
              },
            },
          },
          centro_custo: { type: 'string' },
          museu_relacionado: { type: 'string' },
          meta_contrato: { type: 'string' },
          rubrica_sugerida: { type: 'string' },
          contratante_nome: { type: 'string' },
          contratante_cnpj: { type: 'string' },
          justificativa_classificacao: { type: 'string' },
        },
      },
    });

    // 2. Salvar no Drive
    let drive_folder_id = null;
    let drive_file_id = null;
    let drive_file_url = null;

    try {
      const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
      const pastaId = await criarOuBuscarPastaContratos(accessToken);
      drive_folder_id = pastaId;

      const nomeArquivo = file_name || `contrato_${resultado?.fornecedor_nome || 'sem_nome'}_${Date.now()}.pdf`;
      const driveFile = await uploadFileToDrive(accessToken, file_url, nomeArquivo, pastaId);
      drive_file_id = driveFile?.id;
      drive_file_url = driveFile?.webViewLink;
    } catch (driveErr) {
      console.error('Erro ao salvar no Drive (não crítico):', driveErr.message);
    }

    // 3. Atualizar o DocumentIntake com os dados extraídos
    const dadosContrato = {
      tipo_detectado: 'CONTRATO',
      status_processamento: 'AGUARDANDO_REVISAO',
      resultado_ia: {
        ...resultado,
        tipo_documento: resultado?.tipo_documento || 'CONTRATO',
        drive_folder_id,
        drive_file_id,
        drive_file_url,
      },
      // Campos normalizados para uso direto
      fornecedor_nome: resultado?.fornecedor_nome || '',
      fornecedor_cpf_cnpj: String(resultado?.fornecedor_cpf_cnpj || '').replace(/\D/g, ''),
      nf_emitente_nome: resultado?.fornecedor_nome || '',
      nf_emitente_cpf_cnpj: String(resultado?.fornecedor_cpf_cnpj || '').replace(/\D/g, ''),
      centro_custo: resultado?.centro_custo || '',
      drive_file_id,
      drive_folder_id,
      backup_done: !!drive_file_id,
    };

    await base44.asServiceRole.entities.DocumentIntake.update(intake_id, dadosContrato);

    // 4. Tentar criar/atualizar Fornecedor
    if (resultado?.fornecedor_cpf_cnpj) {
      const cnpjLimpo = String(resultado.fornecedor_cpf_cnpj).replace(/\D/g, '');
      try {
        const fornecedoresExistentes = await base44.asServiceRole.entities.Fornecedor.filter({ cnpj: cnpjLimpo });
        if (!fornecedoresExistentes || fornecedoresExistentes.length === 0) {
          await base44.asServiceRole.entities.Fornecedor.create({
            nome: resultado.fornecedor_nome || '',
            cnpj: cnpjLimpo,
            tipo_pessoa: resultado.fornecedor_tipo || 'PJ',
            banco: resultado.fornecedor_banco || '',
            agencia: resultado.fornecedor_agencia || '',
            conta: resultado.fornecedor_conta || '',
            pix: resultado.fornecedor_pix || '',
            ativo: true,
          }).catch(() => {});
        }
      } catch (_) {}
    }

    // 5. Criar TeamMember automaticamente se não existir
    // Determina os candidatos: membros_equipe extraídos OU o próprio fornecedor (PF)
    const candidatos = [];

    // Membros explicitamente listados no contrato
    const membrosIA = Array.isArray(resultado?.membros_equipe) ? resultado.membros_equipe : [];
    for (const m of membrosIA) {
      if (m?.nome && String(m.nome).trim()) {
        candidatos.push({
          user_name: String(m.nome).trim(),
          cpf: String(m.cpf || '').replace(/\D/g, '') || null,
          funcao: String(m.funcao || '').trim(),
          valor_mensal: toNumber(m.valor_mensal),
          tipo_pessoa: 'PF',
        });
      }
    }

    // Se nenhum membro foi encontrado, usa o próprio fornecedor como membro
    if (candidatos.length === 0 && resultado?.fornecedor_nome) {
      const cpfFornecedor = String(resultado.fornecedor_cpf_cnpj || '').replace(/\D/g, '');
      const tipoPessoa = resultado.fornecedor_tipo === 'PJ' ? 'ME' : 'PF';
      candidatos.push({
        user_name: String(resultado.fornecedor_nome).trim(),
        cpf: tipoPessoa === 'PF' ? cpfFornecedor : null,
        cnpj: tipoPessoa !== 'PF' ? cpfFornecedor : null,
        funcao: String(resultado.responsavel_tecnico || resultado.objeto_contrato || 'Prestador de Serviço').slice(0, 80),
        valor_mensal: toNumber(resultado.valor_parcela || resultado.valor_total),
        tipo_pessoa: tipoPessoa,
        empresa_nome: tipoPessoa !== 'PF' ? String(resultado.fornecedor_nome).trim() : null,
      });
    }

    const membrisCriados = [];

    for (const candidato of candidatos) {
      try {
        // Chave de busca: CPF ou nome normalizado
        let existente = null;

        if (candidato.cpf) {
          const porCpf = await base44.asServiceRole.entities.TeamMember.filter({ cpf: candidato.cpf });
          existente = (porCpf || [])[0] || null;
        }

        if (!existente && candidato.cnpj) {
          const porCnpj = await base44.asServiceRole.entities.TeamMember.filter({ cnpj: candidato.cnpj });
          existente = (porCnpj || [])[0] || null;
        }

        if (!existente) {
          // Busca por nome (fallback)
          const porNome = await base44.asServiceRole.entities.TeamMember.filter({ user_name: candidato.user_name });
          existente = (porNome || [])[0] || null;
        }

        if (existente) {
          // Atualiza dados bancários/contrato se estiverem vazios
          const updates = {};
          if (!existente.banco       && resultado.fornecedor_banco)  updates.banco        = resultado.fornecedor_banco;
          if (!existente.agencia     && resultado.fornecedor_agencia) updates.agencia      = resultado.fornecedor_agencia;
          if (!existente.conta       && resultado.fornecedor_conta)   updates.conta        = resultado.fornecedor_conta;
          if (!existente.pix_key     && resultado.fornecedor_pix)    updates.pix_key      = resultado.fornecedor_pix;
          if (!existente.contrato_url && file_url)                    updates.contrato_url = file_url;
          if (!existente.objeto_contrato && resultado.objeto_contrato) updates.objeto_contrato = resultado.objeto_contrato;
          if (Object.keys(updates).length > 0) {
            await base44.asServiceRole.entities.TeamMember.update(existente.id, updates).catch(() => {});
          }
          membrisCriados.push({ acao: 'atualizado', id: existente.id, nome: candidato.user_name });
        } else {
          // Cria novo TeamMember
          const novoMembro = {
            user_email: candidato.cpf
              ? `cpf.${candidato.cpf}@contrato.interno`
              : `membro.${String(candidato.user_name).toLowerCase().replace(/\s+/g, '.')}.${Date.now()}@contrato.interno`,
            user_name: candidato.user_name,
            tipo_pessoa: candidato.tipo_pessoa || 'PF',
            cpf:   candidato.cpf   || null,
            cnpj:  candidato.cnpj  || null,
            funcao: candidato.funcao || '',
            empresa_nome: candidato.empresa_nome || null,
            banco:    resultado.fornecedor_banco    || '',
            agencia:  resultado.fornecedor_agencia  || '',
            conta:    resultado.fornecedor_conta    || '',
            pix_key:  resultado.fornecedor_pix      || '',
            valor_total:     toNumber(resultado.valor_total),
            numero_parcelas: toNumber(resultado.numero_parcelas) || 1,
            valor_parcela:   candidato.valor_mensal || toNumber(resultado.valor_parcela),
            data_inicio_contrato: resultado.vigencia_inicio || null,
            data_fim_contrato:    resultado.vigencia_fim    || null,
            contrato_url:         file_url                  || '',
            objeto_contrato:      resultado.objeto_contrato || '',
            status: 'ATIVO',
          };

          const criado = await base44.asServiceRole.entities.TeamMember.create(novoMembro);
          membrisCriados.push({ acao: 'criado', id: criado?.id, nome: candidato.user_name });
        }
      } catch (membroErr) {
        console.error('Erro ao criar/atualizar TeamMember:', candidato.user_name, membroErr.message);
      }
    }

    return Response.json({
      success: true,
      tipo_documento: resultado?.tipo_documento || 'CONTRATO',
      dados_extraidos: resultado,
      drive_folder_id,
      drive_file_id,
      drive_file_url,
      membros_criados: membrisCriados,
    });
  } catch (error) {
    console.error('processarContratoEntradaUnica error:', error);
    return Response.json(
      { success: false, error: error?.message || 'Erro interno' },
      { status: 500 }
    );
  }
});