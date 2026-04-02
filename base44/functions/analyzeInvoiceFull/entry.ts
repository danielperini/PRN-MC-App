import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const DRIVE_FOLDER_ID = '1HlhZvINo-j29SqZ3OInEtxNktp6IlKl9';

function sanitize(name) {
  return String(name || '').replace(/[<>:"/\\|?*\n\r]/g, '').trim();
}

function buildFileName(numero, cargo, nome, valor, ext) {
  const nomeClean = sanitize(nome).toUpperCase();
  const cargoClean = sanitize(cargo).toUpperCase();
  const valorStr = Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `NF ${numero} ${cargoClean} - ${nomeClean} - MUSEUS CENTRO - R$ ${valorStr}.${ext}`;
}

async function findOrCreateFolder(token, name, parentId) {
  const q = encodeURIComponent(`name='${sanitize(name)}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const d = await res.json();
  if (d.files?.[0]?.id) return d.files[0].id;
  const cr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: sanitize(name), mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const cd = await cr.json();
  if (cd.error) throw new Error('Erro pasta Drive: ' + cd.error.message);
  return cd.id;
}

async function uploadToDrive(token, fileName, fileUrl, mimeType, folderId) {
  const fileRes = await fetch(fileUrl);
  if (!fileRes.ok) throw new Error('Falha ao baixar arquivo: ' + fileRes.status);
  const fileBytes = new Uint8Array(await fileRes.arrayBuffer());
  const boundary = 'inv_upload_boundary';
  const meta = JSON.stringify({ name: fileName, parents: [folderId] });
  const enc = new TextEncoder();
  const p1 = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`);
  const p2 = enc.encode(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
  const p3 = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(p1.length + p2.length + fileBytes.length + p3.length);
  body.set(p1, 0); body.set(p2, p1.length);
  body.set(fileBytes, p1.length + p2.length);
  body.set(p3, p1.length + p2.length + fileBytes.length);
  const up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const d = await up.json();
  if (d.error) throw new Error('Erro upload Drive: ' + d.error.message);
  return d;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { submissionId, pdfFileUrl, xmlFileUrl, aiExtracted } = await req.json();

    // --- 1. Obter contexto de rubricas e usuário ---
    const [rubricas, teamMembers, userPermission] = await Promise.all([
      base44.asServiceRole.entities.Rubrica.list('-created_date', 200).catch(() => []),
      base44.asServiceRole.entities.TeamMember.list('-created_date', 200).catch(() => []),
      base44.asServiceRole.entities.UserPermission.filter({ user_email: user.email }, '-created_date', 1).catch(() => []),
    ]);

    const rubricasResumo = (rubricas || []).map(r => ({
      id: r.id, nome: r.nome || r.descricao, saldo: r.saldo_disponivel || r.saldo || 0, tipo: r.tipo
    }));

    // Encontrar membro de equipe associado
    const teamMember = (teamMembers || []).find(m =>
      m.user_email === user.email || m.email === user.email ||
      (m.user_name || '').toLowerCase().includes((user.full_name || '').toLowerCase())
    );

    const perm = (userPermission || [])[0];
    const cargo = perm?.base_role || user.role || user.funcao || 'PROFISSIONAL';

    // --- 2. Análise COMPLETA pela IA com internet ---
    let analysis;
    try {
      analysis = await base44.asServiceRole.integrations.Core.InvokeLLM({
        model: 'gemini_3_pro',
        add_context_from_internet: true,
        response_json_schema: {
          type: 'object',
          properties: {
            // Dados completos do emissor
            emitente_nome: { type: 'string' },
            emitente_cnpj_cpf: { type: 'string' },
            emitente_endereco: { type: 'string' },
            emitente_municipio: { type: 'string' },
            emitente_uf: { type: 'string' },
            emitente_regime_tributario: { type: 'string' },
            emitente_cnae_codigo: { type: 'string' },
            emitente_cnae_descricao: { type: 'string' },
            emitente_cnae_permite_servico: { type: 'boolean' },
            emitente_situacao_cadastral: { type: 'string' },
            emitente_data_abertura: { type: 'string' },
            emitente_capital_social: { type: 'string' },
            emitente_porte_empresa: { type: 'string' },
            emitente_email: { type: 'string' },
            emitente_telefone: { type: 'string' },
            // Dados da nota
            numero_nota: { type: 'string' },
            serie_nota: { type: 'string' },
            data_emissao: { type: 'string' },
            valor_total: { type: 'number' },
            valor_liquido: { type: 'number' },
            valor_iss: { type: 'number' },
            valor_ir: { type: 'number' },
            valor_pis: { type: 'number' },
            valor_cofins: { type: 'number' },
            descricao_servico: { type: 'string' },
            codigo_servico_lc116: { type: 'string' },
            chave_acesso: { type: 'string' },
            // Destinatário
            destinatario_nome: { type: 'string' },
            destinatario_cnpj: { type: 'string' },
            // Dados bancários
            banco_nome: { type: 'string' },
            banco_agencia: { type: 'string' },
            banco_conta: { type: 'string' },
            banco_pix: { type: 'string' },
            banco_favorecido: { type: 'string' },
            banco_favorecido_cpf_cnpj: { type: 'string' },
            // Análises
            xml_obrigatorio: { type: 'boolean' },
            xml_obrigatorio_motivo: { type: 'string' },
            legislacao_aplicavel: { type: 'string' },
            conta_bancaria_confere_emissor: { type: 'boolean' },
            conta_bancaria_divergencia: { type: 'string' },
            rubrica_sugerida_nome: { type: 'string' },
            rubrica_saldo_suficiente: { type: 'boolean' },
            rubrica_observacao: { type: 'string' },
            // Conformidade
            is_nota_valida: { type: 'boolean' },
            pontos_criticos: { type: 'array', items: { type: 'string' } },
            alertas: { type: 'array', items: { type: 'string' } },
            resumo_conformidade: { type: 'string' },
            recomendacao_final: { type: 'string' },
            eh_servico_cultural: { type: 'boolean' },
            enquadramento_cadeia_produtiva: { type: 'string' },
          }
        },
        prompt: `Você é um especialista em conformidade fiscal e legislação tributária brasileira.

Analise esta nota fiscal (PDF${xmlFileUrl ? ' e XML' : ''}) e faça uma análise COMPLETA:

DADOS JÁ EXTRAÍDOS PELA IA:
${JSON.stringify(aiExtracted, null, 2)}

PROFISSIONAL EMISSOR (dados da plataforma):
- Nome: ${user.full_name}
- Email: ${user.email}  
- Cargo: ${cargo}
- Função: ${perm?.base_role || '-'}

RUBRICAS DISPONÍVEIS COM SALDOS:
${rubricasResumo.map(r => `- ${r.nome}: R$ ${Number(r.saldo).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (${r.tipo || '-'})`).join('\n') || 'Nenhuma rubrica cadastrada'}

ANALISE E RESPONDA:

1. DADOS COMPLETOS DO EMISSOR: Pesquise o CNPJ/CPF na internet. Retorne situação cadastral, CNAE, porte, regime tributário, capital social, data de abertura, endereço.

2. XML OBRIGATÓRIO?: Com base no tipo de nota (NFS-e, NF-e, NFC-e), valor e legislação municipal/federal vigente, determine se o XML é obrigatório para esta nota. Cite a lei/decreto aplicável.

3. CONTA BANCÁRIA x EMISSOR: Verifique se o banco_favorecido e banco_favorecido_cpf_cnpj coincidem com o emitente da nota. Se divergir, aponte a divergência.

4. CNAE x SERVIÇO PRESTADO: O CNAE do emitente é compatível com o serviço descrito na nota? É da cadeia produtiva cultural?

5. RUBRICA SUGERIDA: Com base no serviço descrito, sugira qual rubrica melhor se encaixa. Verifique se o saldo é suficiente.

6. CONFORMIDADE GERAL: Liste pontos críticos (bloqueantes) e alertas (atenção). Dê uma recomendação final.

Responda em português. Seja preciso e técnico.`,
        file_urls: [pdfFileUrl, ...(xmlFileUrl ? [xmlFileUrl] : [])],
      });
    } catch (err) {
      console.error('Análise IA falhou:', err.message);
      analysis = {
        is_nota_valida: false,
        pontos_criticos: ['Análise automática falhou: ' + err.message],
        alertas: [],
        resumo_conformidade: 'Não foi possível completar análise automática.',
        recomendacao_final: 'Revisar manualmente.',
        xml_obrigatorio: !xmlFileUrl,
        xml_obrigatorio_motivo: 'Não determinado',
        numero_nota: aiExtracted?.numero_nota || '',
        valor_total: aiExtracted?.valor_total || 0,
        emitente_nome: aiExtracted?.fornecedor_nome || '',
        emitente_cnpj_cpf: aiExtracted?.fornecedor_cnpj || '',
        banco_nome: aiExtracted?.banco_nome || '',
        banco_pix: aiExtracted?.banco_pix || '',
        banco_conta: aiExtracted?.banco_conta || '',
        banco_favorecido: aiExtracted?.banco_favorecido || '',
        conta_bancaria_confere_emissor: false,
        conta_bancaria_divergencia: 'Não verificado',
      };
    }

    // Garantir que analysis nunca é null
    if (!analysis) {
      analysis = {
        is_nota_valida: false,
        pontos_criticos: ['Análise automática retornou vazio'],
        alertas: [],
        resumo_conformidade: 'Não foi possível completar análise automática.',
        recomendacao_final: 'Revisar manualmente.',
        numero_nota: aiExtracted?.numero_nota || '',
        valor_total: aiExtracted?.valor_total || 0,
        emitente_nome: aiExtracted?.fornecedor_nome || '',
        emitente_cnpj_cpf: aiExtracted?.fornecedor_cnpj || '',
        banco_nome: '', banco_pix: '', banco_conta: '', banco_favorecido: '',
        conta_bancaria_confere_emissor: false,
        conta_bancaria_divergencia: 'Não verificado',
        xml_obrigatorio: !xmlFileUrl,
        xml_obrigatorio_motivo: 'XML não fornecido',
      };
    }

    // --- 3. Salvar análise completa no banco ---
    const numero = (analysis?.numero_nota || aiExtracted?.numero_nota || '000');
    const valor = analysis.valor_total || aiExtracted?.valor_total || 0;
    const nome = user.full_name || user.email;
    const mes = new Date().toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
    const nomeArquivoPadrao = buildFileName(numero, cargo, nome, valor, 'pdf');

    // Atualizar ou criar submission
    let savedSubmission;
    if (submissionId) {
      savedSubmission = await base44.asServiceRole.entities.InvoiceSubmission.update(submissionId, {
        // Dados emissor
        emitente_nome: analysis.emitente_nome,
        emitente_cnpj_cpf: analysis.emitente_cnpj_cpf,
        emitente_cnae_codigo: analysis.emitente_cnae_codigo,
        emitente_cnae_descricao: analysis.emitente_cnae_descricao,
        emitente_situacao_cadastral: analysis.emitente_situacao_cadastral,
        emitente_regime_tributario: analysis.emitente_regime_tributario,
        emitente_municipio: analysis.emitente_municipio,
        emitente_uf: analysis.emitente_uf,
        emitente_porte_empresa: analysis.emitente_porte_empresa,
        // Dados nota
        numero_nota: numero,
        serie_nota: analysis.serie_nota,
        data_emissao: analysis.data_emissao,
        valor_total: valor,
        valor_liquido: analysis.valor_liquido,
        valor_iss: analysis.valor_iss,
        valor_ir: analysis.valor_ir,
        descricao_servico: analysis.descricao_servico,
        codigo_servico_lc116: analysis.codigo_servico_lc116,
        chave_acesso: analysis.chave_acesso,
        // Dados bancários
        banco_nome: analysis.banco_nome,
        banco_agencia: analysis.banco_agencia,
        banco_conta: analysis.banco_conta,
        banco_pix: analysis.banco_pix,
        banco_favorecido: analysis.banco_favorecido,
        banco_favorecido_cpf_cnpj: analysis.banco_favorecido_cpf_cnpj,
        // Análises
        xml_obrigatorio: analysis.xml_obrigatorio,
        xml_obrigatorio_motivo: analysis.xml_obrigatorio_motivo,
        legislacao_aplicavel: analysis.legislacao_aplicavel,
        conta_bancaria_confere_emissor: analysis.conta_bancaria_confere_emissor,
        conta_bancaria_divergencia: analysis.conta_bancaria_divergencia,
        rubrica_sugerida_nome: analysis.rubrica_sugerida_nome,
        rubrica_saldo_suficiente: analysis.rubrica_saldo_suficiente,
        rubrica_observacao: analysis.rubrica_observacao,
        // Conformidade
        analysis_is_valid: analysis.is_nota_valida,
        analysis_critical_issues: analysis.pontos_criticos || [],
        analysis_warnings: analysis.alertas || [],
        analysis_summary: analysis.resumo_conformidade,
        analysis_recommendation: analysis.recomendacao_final,
        eh_servico_cultural: analysis.eh_servico_cultural,
        enquadramento_cadeia_produtiva: analysis.enquadramento_cadeia_produtiva,
        // Vinculação
        team_member_id: teamMember?.id || null,
        team_member_name: teamMember?.user_name || nome,
        user_cargo: cargo,
        nome_arquivo_padrao: nomeArquivoPadrao,
        pdf_url: pdfFileUrl,
        xml_url: xmlFileUrl || null,
        status: 'PENDENTE_APROVACAO',
        analysis_done: true,
        analysis_date: new Date().toISOString(),
      });
      savedSubmission = { id: submissionId };
    } else {
      savedSubmission = await base44.asServiceRole.entities.InvoiceSubmission.create({
        user_email: user.email,
        user_name: nome,
        user_cargo: cargo,
        mes_referencia: mes,
        data_submissao: new Date().toISOString(),
        numero_nota: numero,
        valor_total: valor,
        pdf_url: pdfFileUrl,
        xml_url: xmlFileUrl || null,
        dados_extraidos: aiExtracted,
        status: 'PENDENTE_APROVACAO',
        nome_arquivo_padrao: nomeArquivoPadrao,
        analysis_done: true,
        analysis_date: new Date().toISOString(),
        emitente_nome: analysis.emitente_nome,
        emitente_cnpj_cpf: analysis.emitente_cnpj_cpf,
        emitente_cnae_codigo: analysis.emitente_cnae_codigo,
        emitente_cnae_descricao: analysis.emitente_cnae_descricao,
        emitente_situacao_cadastral: analysis.emitente_situacao_cadastral,
        emitente_regime_tributario: analysis.emitente_regime_tributario,
        emitente_municipio: analysis.emitente_municipio,
        emitente_uf: analysis.emitente_uf,
        banco_nome: analysis.banco_nome,
        banco_agencia: analysis.banco_agencia,
        banco_conta: analysis.banco_conta,
        banco_pix: analysis.banco_pix,
        banco_favorecido: analysis.banco_favorecido,
        banco_favorecido_cpf_cnpj: analysis.banco_favorecido_cpf_cnpj,
        xml_obrigatorio: analysis.xml_obrigatorio,
        xml_obrigatorio_motivo: analysis.xml_obrigatorio_motivo,
        legislacao_aplicavel: analysis.legislacao_aplicavel,
        conta_bancaria_confere_emissor: analysis.conta_bancaria_confere_emissor,
        conta_bancaria_divergencia: analysis.conta_bancaria_divergencia,
        rubrica_sugerida_nome: analysis.rubrica_sugerida_nome,
        rubrica_saldo_suficiente: analysis.rubrica_saldo_suficiente,
        rubrica_observacao: analysis.rubrica_observacao,
        analysis_is_valid: analysis.is_nota_valida,
        analysis_critical_issues: analysis.pontos_criticos || [],
        analysis_warnings: analysis.alertas || [],
        analysis_summary: analysis.resumo_conformidade,
        analysis_recommendation: analysis.recomendacao_final,
        eh_servico_cultural: analysis.eh_servico_cultural,
        team_member_id: teamMember?.id || null,
        team_member_name: teamMember?.user_name || nome,
      });
    }

    // --- 4. Backup no Drive ---
    let driveResults = {};
    let backupError = null;
    try {
      const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
      const userFolderId = await findOrCreateFolder(accessToken, nome, DRIVE_FOLDER_ID);
      const mesFolderId = await findOrCreateFolder(accessToken, mes, userFolderId);

      const pdfFileName = buildFileName(numero, cargo, nome, valor, 'pdf');
      driveResults.pdf = await uploadToDrive(accessToken, pdfFileName, pdfFileUrl, 'application/pdf', mesFolderId);

      if (xmlFileUrl) {
        const xmlFileName = buildFileName(numero, cargo, nome, valor, 'xml');
        driveResults.xml = await uploadToDrive(accessToken, xmlFileName, xmlFileUrl, 'application/xml', mesFolderId);
      }

      await base44.asServiceRole.entities.InvoiceSubmission.update(savedSubmission.id, {
        drive_pdf_id: driveResults.pdf?.id,
        drive_xml_id: driveResults.xml?.id,
        drive_pdf_link: driveResults.pdf?.webViewLink,
        drive_xml_link: driveResults.xml?.webViewLink,
        backup_done: true,
      });
    } catch (err) {
      backupError = err.message;
      console.warn('Drive backup falhou:', err.message);
    }

    // --- 5. Detectar se é equipe ---
    const isEquipe = !!teamMember || (perm?.base_role === 'PROFISSIONAL' && cargo !== 'COORDENADOR');
    const equipeMsg = isEquipe && teamMember
      ? `✅ Nota vinculada ao membro de equipe: ${teamMember.user_name || nome} (${teamMember.funcao || cargo})`
      : null;

    return Response.json({
      success: true,
      submission_id: savedSubmission.id,
      backup_done: !!driveResults.pdf?.id,
      backup_error: backupError,
      drive_pdf_link: driveResults.pdf?.webViewLink || null,
      drive_xml_link: driveResults.xml?.webViewLink || null,
      nome_arquivo: buildFileName(numero, cargo, nome, valor, 'pdf'),
      equipe_msg: equipeMsg,
      is_equipe: isEquipe,
      xml_obrigatorio: analysis.xml_obrigatorio,
      xml_obrigatorio_motivo: analysis.xml_obrigatorio_motivo,
      is_nota_valida: analysis.is_nota_valida,
      pontos_criticos: analysis.pontos_criticos || [],
      alertas: analysis.alertas || [],
      resumo_conformidade: analysis.resumo_conformidade,
      recomendacao_final: analysis.recomendacao_final,
      emitente: {
        nome: analysis.emitente_nome,
        cnpj_cpf: analysis.emitente_cnpj_cpf,
        cnae_codigo: analysis.emitente_cnae_codigo,
        cnae_descricao: analysis.emitente_cnae_descricao,
        situacao_cadastral: analysis.emitente_situacao_cadastral,
        regime_tributario: analysis.emitente_regime_tributario,
        municipio: analysis.emitente_municipio,
        uf: analysis.emitente_uf,
        porte: analysis.emitente_porte_empresa,
      },
      nota: {
        numero: numero,
        serie: analysis.serie_nota,
        data_emissao: analysis.data_emissao,
        valor_total: valor,
        valor_liquido: analysis.valor_liquido,
        valor_iss: analysis.valor_iss,
        descricao_servico: analysis.descricao_servico,
        legislacao_aplicavel: analysis.legislacao_aplicavel,
        eh_servico_cultural: analysis.eh_servico_cultural,
      },
      banco: {
        nome: analysis.banco_nome,
        agencia: analysis.banco_agencia,
        conta: analysis.banco_conta,
        pix: analysis.banco_pix,
        favorecido: analysis.banco_favorecido,
        cpf_cnpj: analysis.banco_favorecido_cpf_cnpj,
        confere_emissor: analysis.conta_bancaria_confere_emissor,
        divergencia: analysis.conta_bancaria_divergencia,
      },
      rubrica: {
        sugerida: analysis.rubrica_sugerida_nome,
        saldo_suficiente: analysis.rubrica_saldo_suficiente,
        observacao: analysis.rubrica_observacao,
      },
    });
  } catch (error) {
    console.error('analyzeInvoiceFull error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});