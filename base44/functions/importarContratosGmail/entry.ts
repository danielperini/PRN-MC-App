import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { invokeLLM } from '../_shared/gatewayIA.ts';

const GMAIL_ACCOUNT = 'danielperini.mc@viadutodasartes.org.br';
const CONTRATOS_FOLDER_ID = '1lUvhkeMp-yZ4nNnS33jDw3eekhbpp1R7';

// Palavras-chave para identificar contratos no assunto/remetente/snippet
const CONTRATO_KEYWORDS = [
  'contrato', 'termo', 'tc-', 'tc_', 'aditivo', 'acordo', 'prestação',
  'prestacao', 'servico', 'serviço', 'fornecedor', 'parceria', 'assinado',
];
const BLOCKED_KEYWORDS = ['spam', 'newsletter', 'promoção', 'marketing', 'propaganda'];

function normalize(str: string) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function isContratoRelevant(subject: string, from: string, snippet: string) {
  const combined = normalize(`${subject} ${from} ${snippet}`);
  for (const kw of BLOCKED_KEYWORDS) if (combined.includes(normalize(kw))) return false;
  for (const kw of CONTRATO_KEYWORDS) if (combined.includes(normalize(kw))) return true;
  return false;
}

function isPdfOrDoc(mimeType: string, filename: string) {
  const m = (mimeType || '').toLowerCase();
  const f = normalize(filename || '');
  return m.includes('pdf') || m.includes('word') || m.includes('document') ||
    f.endsWith('.pdf') || f.endsWith('.doc') || f.endsWith('.docx');
}

function toNumber(v: unknown) {
  const n = Number(String(v || '').replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

// Upload de arquivo para o Google Drive via multipart
async function uploadToDrive(accessToken: string, fileBuffer: ArrayBuffer, filename: string, folderId: string) {
  const boundary = 'boundary_contrato_' + Date.now();
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const enc = new TextEncoder();
  const part1 = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`);
  const part2 = enc.encode(`\r\n--${boundary}--`);
  const combined = new Uint8Array(part1.byteLength + fileBuffer.byteLength + part2.byteLength);
  combined.set(part1, 0);
  combined.set(new Uint8Array(fileBuffer), part1.byteLength);
  combined.set(part2, part1.byteLength + fileBuffer.byteLength);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink,name', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body: combined,
  });
  return await res.json();
}

// Cria ou busca pasta no Drive
async function getOrCreateFolder(accessToken: string, name: string, parentId: string): Promise<string> {
  const q = encodeURIComponent(`'${parentId}' in parents and name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const data = await res.json();
  if (data.files?.length > 0) return data.files[0].id;

  const createRes = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const folder = await createRes.json();
  return folder.id;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const role = String(user.role || '').toLowerCase();
    if (!['admin', 'coordenador', 'coordinator'].includes(role)) {
      return Response.json({ error: 'Acesso restrito a admins e coordenadores.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    // Data inicial padrão: 1 de fevereiro de 2026
    const dataInicio = body.data_inicio || '2026/02/01';
    const maxMessages = body.max_messages || 100;
    const dryRun = body.dry_run === true;

    // 1. Obter token do Gmail
    const { accessToken: gmailToken } = await base44.asServiceRole.connectors.getConnection('gmail');
    const gmailHeaders = { Authorization: `Bearer ${gmailToken}` };

    // 2. Obter token do Drive para backup
    let driveToken: string | null = null;
    try {
      const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      driveToken = conn?.accessToken || null;
    } catch (_) {}

    // 3. Buscar e-mails com anexo desde fevereiro
    const searchQuery = `has:attachment after:${dataInicio}`;
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=${maxMessages}`;
    const listRes = await fetch(listUrl, { headers: gmailHeaders });
    if (!listRes.ok) {
      const err = await listRes.text();
      return Response.json({ error: `Erro Gmail: ${err}` }, { status: 500 });
    }

    const listData = await listRes.json();
    const messages: any[] = listData.messages || [];

    let processados = 0;
    let importados = 0;
    let duplicados = 0;
    let erros_count = 0;
    const resultados: any[] = [];

    // Pasta de contratos no Drive
    let pastaContratosId: string | null = null;
    if (driveToken) {
      try {
        pastaContratosId = await getOrCreateFolder(driveToken, 'Contratos Gmail', CONTRATOS_FOLDER_ID);
      } catch (_) {}
    }

    for (const msg of messages) {
      try {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
          { headers: gmailHeaders }
        );
        if (!msgRes.ok) continue;

        const message = await msgRes.json();
        const hdrs: Record<string, string> = {};
        (message.payload?.headers || []).forEach((h: any) => { hdrs[h.name?.toLowerCase()] = h.value; });

        const subject = hdrs['subject'] || '';
        const from = hdrs['from'] || '';
        const dateStr = hdrs['date'] || '';

        // Filtrar apenas e-mails com assunto/remetente relacionado a contratos
        if (!isContratoRelevant(subject, from, message.snippet || '')) continue;

        // Coletar partes com anexos PDF/DOC
        const parts: any[] = [];
        function collectParts(part: any) {
          if (part.parts) part.parts.forEach(collectParts);
          else if (part.filename && part.body?.attachmentId) parts.push(part);
        }
        collectParts(message.payload);
        if (parts.length === 0) continue;

        for (const part of parts) {
          const filename = part.filename || `contrato_${Date.now()}.pdf`;
          const mimeType = part.mimeType || '';

          if (!isPdfOrDoc(mimeType, filename)) continue;
          processados++;

          // Checar duplicidade no DocumentIntake
          const existing = await base44.asServiceRole.entities.DocumentIntake.filter({
            file_name_original: filename,
            user_email: GMAIL_ACCOUNT,
            tipo_detectado: 'CONTRATO',
            status_registro: 'ATIVO',
          }, '', 1).catch(() => []);

          if ((existing as any[]).length > 0) {
            duplicados++;
            resultados.push({ filename, status: 'duplicado', subject });
            continue;
          }

          if (dryRun) {
            resultados.push({ filename, status: 'dry_run', subject, from, date: dateStr });
            importados++;
            continue;
          }

          // Baixar o anexo
          const attRes = await fetch(
            `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/attachments/${part.body.attachmentId}`,
            { headers: gmailHeaders }
          );
          if (!attRes.ok) { erros_count++; continue; }

          const attData = await attRes.json();
          const rawBytes = Uint8Array.from(
            atob((attData.data || '').replace(/-/g, '+').replace(/_/g, '/')),
            (c: string) => c.charCodeAt(0)
          );

          // Upload para storage Base44
          const file = new File([rawBytes], filename, { type: mimeType || 'application/pdf' });
          const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file });
          if (!uploadRes?.file_url) { erros_count++; continue; }

          // 4. Analisar contrato com IA (Claude Sonnet para máxima precisão)
          let dadosIA: any = null;
          try {
            dadosIA = await invokeLLM(base44.asServiceRole,{
              prompt: `Você é especialista jurídico em contratos de prestação de serviços culturais do Projeto Museus Centro (BH).

Analise INTEGRALMENTE este documento (contrato ou termo de compromisso) e extraia TODOS os campos abaixo.
Retorne null para campos não encontrados. Seja preciso — esta informação preenche automaticamente fichas de equipe.

Campos obrigatórios de extração:
- numero_contrato: número/identificador do contrato (ex: TC-MC-2026-001)
- tipo_documento: "CONTRATO" | "TERMO_COMPROMISSO" | "TERMO_ADITIVO" | "OUTRO"
- data_assinatura: data no formato YYYY-MM-DD
- vigencia_inicio: data de início (YYYY-MM-DD)
- vigencia_fim: data de fim/término (YYYY-MM-DD)
- data_rescisao: data de rescisão se houver (YYYY-MM-DD ou null)
- objeto_contrato: descrição completa do serviço/objeto contratado
- escopo_atividades: lista detalhada de atividades previstas
- valor_total: valor total numérico (somente número)
- numero_parcelas: número de parcelas (inteiro)
- valor_parcela: valor de cada parcela (número)
- datas_pagamento: array de datas YYYY-MM-DD de cada parcela
- forma_pagamento: descrição da forma de pagamento

Dados do CONTRATADO (prestador de serviços):
- contratado_nome: nome completo ou razão social
- contratado_tipo: "PF" (CPF) ou "PJ" (CNPJ) ou "MEI"
- contratado_cpf: CPF sem formatação (somente números) — se PF ou MEI
- contratado_cnpj: CNPJ sem formatação (somente números) — se PJ
- contratado_representante: nome do representante legal (se PJ)
- contratado_cpf_representante: CPF do representante (se PJ)
- contratado_endereco: endereço completo (rua, número, bairro, cidade, CEP)
- contratado_telefone: telefone de contato
- contratado_email: e-mail do contratado
- contratado_banco: banco para pagamento
- contratado_agencia: agência bancária
- contratado_conta: número da conta
- contratado_tipo_conta: "Corrente" ou "Poupança"
- contratado_pix: chave PIX

Função e vínculo:
- funcao_projeto: função exercida no projeto (ex: Educadora, Designer, Fotógrafo, Coordenador)
- museu_relacionado: MIS | MHAB | MUMO | Viaduto das Artes | Geral
- centro_custo: MIS | MHAB | MUMO | Geral | Noturno nos Museus 2026 | Publicações

Dados da CONTRATANTE:
- contratante_nome: nome da contratante (ex: Associação Viaduto das Artes)
- contratante_cnpj: CNPJ da contratante

Testemunhas:
- testemunha1_nome, testemunha1_cpf
- testemunha2_nome, testemunha2_cpf

Membros adicionais da equipe mencionados no contrato:
- membros_equipe: array de objetos {nome, funcao, cpf, cnpj, telefone, email, endereco, valor_mensal}

Divergências ou pendências:
- divergencias: array de strings descrevendo inconsistências ou campos ilegíveis`,
              file_urls: [uploadRes.file_url],
              model: 'claude_sonnet_4_6',
              response_json_schema: {
                type: 'object',
                properties: {
                  numero_contrato: { type: 'string' },
                  tipo_documento: { type: 'string' },
                  data_assinatura: { type: 'string' },
                  vigencia_inicio: { type: 'string' },
                  vigencia_fim: { type: 'string' },
                  data_rescisao: { type: 'string' },
                  objeto_contrato: { type: 'string' },
                  escopo_atividades: { type: 'string' },
                  valor_total: { type: 'number' },
                  numero_parcelas: { type: 'number' },
                  valor_parcela: { type: 'number' },
                  datas_pagamento: { type: 'array', items: { type: 'string' } },
                  forma_pagamento: { type: 'string' },
                  contratado_nome: { type: 'string' },
                  contratado_tipo: { type: 'string' },
                  contratado_cpf: { type: 'string' },
                  contratado_cnpj: { type: 'string' },
                  contratado_representante: { type: 'string' },
                  contratado_cpf_representante: { type: 'string' },
                  contratado_endereco: { type: 'string' },
                  contratado_telefone: { type: 'string' },
                  contratado_email: { type: 'string' },
                  contratado_banco: { type: 'string' },
                  contratado_agencia: { type: 'string' },
                  contratado_conta: { type: 'string' },
                  contratado_tipo_conta: { type: 'string' },
                  contratado_pix: { type: 'string' },
                  funcao_projeto: { type: 'string' },
                  museu_relacionado: { type: 'string' },
                  centro_custo: { type: 'string' },
                  contratante_nome: { type: 'string' },
                  contratante_cnpj: { type: 'string' },
                  testemunha1_nome: { type: 'string' },
                  testemunha1_cpf: { type: 'string' },
                  testemunha2_nome: { type: 'string' },
                  testemunha2_cpf: { type: 'string' },
                  membros_equipe: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        nome: { type: 'string' },
                        funcao: { type: 'string' },
                        cpf: { type: 'string' },
                        cnpj: { type: 'string' },
                        telefone: { type: 'string' },
                        email: { type: 'string' },
                        endereco: { type: 'string' },
                        valor_mensal: { type: 'number' },
                      }
                    }
                  },
                  divergencias: { type: 'array', items: { type: 'string' } },
                }
              }
            });
          } catch (iaErr) {
            console.error(`[IA] Contrato ${filename}:`, iaErr);
          }

          // 5. Backup no Drive
          let driveFileId: string | null = null;
          let driveFileUrl: string | null = null;
          if (driveToken && pastaContratosId) {
            try {
              const nomeArquivoDrive = dadosIA?.contratado_nome
                ? `CONTRATO - ${String(dadosIA.contratado_nome).substring(0, 40).toUpperCase()} - ${dadosIA.numero_contrato || 'SEM-NUM'}.pdf`
                : filename;
              const driveFile = await uploadToDrive(driveToken, rawBytes.buffer, nomeArquivoDrive, pastaContratosId);
              driveFileId = driveFile?.id || null;
              driveFileUrl = driveFile?.webViewLink || null;
            } catch (driveErr) {
              console.error(`[Drive] Backup falhou para ${filename}:`, driveErr);
            }
          }

          // 6. Criar DocumentIntake — status AGUARDANDO_REVISAO para validação em Entrada de Documentos
          const cpfLimpo = String(dadosIA?.contratado_cpf || '').replace(/\D/g, '');
          const cnpjLimpo = String(dadosIA?.contratado_cnpj || '').replace(/\D/g, '');

          const intakeCreated = await base44.asServiceRole.entities.DocumentIntake.create({
            user_email: GMAIL_ACCOUNT,
            user_name: dadosIA?.contratado_nome || GMAIL_ACCOUNT,
            arquivo_original_url: uploadRes.file_url,
            file_name_original: filename,
            file_name_final: dadosIA?.contratado_nome
              ? `CONTRATO - ${String(dadosIA.contratado_nome).substring(0, 40).toUpperCase()}.pdf`
              : filename,
            mime_type: mimeType || 'application/pdf',
            tipo_detectado: 'CONTRATO',
            status_processamento: 'AGUARDANDO_REVISAO',
            status_registro: 'ATIVO',
            grupo_status: 'COMPLETO',
            origem: 'gmail_contratos',
            revisado_pelo_usuario: false,
            resultado_ia: dadosIA ? { ...dadosIA, drive_file_id: driveFileId, drive_file_url: driveFileUrl } : null,
            erros_validacao: dadosIA?.divergencias || [],
            // Campos normalizados para exibição em Entrada de Documentos
            fornecedor_nome: dadosIA?.contratado_nome || '',
            nf_emitente_nome: dadosIA?.contratado_nome || '',
            nf_emitente_cpf_cnpj: cpfLimpo || cnpjLimpo,
            fornecedor_cpf_cnpj: cpfLimpo || cnpjLimpo,
            centro_custo: dadosIA?.centro_custo || '',
            contrato_numero: dadosIA?.numero_contrato || '',
            contrato_drive_url: driveFileUrl || '',
            contrato_drive_folder_id: pastaContratosId || '',
          });

          // 7. Criar/atualizar TeamMember com ficha completa
          if (dadosIA?.contratado_nome) {
            await criarOuAtualizarTeamMember(base44, dadosIA, uploadRes.file_url, intakeCreated?.id);
          }

          // Processar membros adicionais da equipe mencionados no contrato
          const membrosExtras = Array.isArray(dadosIA?.membros_equipe) ? dadosIA.membros_equipe : [];
          for (const membro of membrosExtras) {
            if (!membro?.nome || normalize(membro.nome) === normalize(dadosIA?.contratado_nome || '')) continue;
            await criarOuAtualizarTeamMember(base44, {
              contratado_nome: membro.nome,
              contratado_tipo: membro.contratado_tipo || 'PF',
              contratado_cpf: membro.cpf,
              contratado_cnpj: membro.cnpj,
              contratado_telefone: membro.telefone,
              contratado_email: membro.email,
              contratado_endereco: membro.endereco,
              funcao_projeto: membro.funcao,
              valor_parcela: membro.valor_mensal,
              museu_relacionado: dadosIA?.museu_relacionado,
              centro_custo: dadosIA?.centro_custo,
              vigencia_inicio: dadosIA?.vigencia_inicio,
              vigencia_fim: dadosIA?.vigencia_fim,
              objeto_contrato: dadosIA?.objeto_contrato,
            }, uploadRes.file_url, intakeCreated?.id);
          }

          importados++;
          resultados.push({
            filename,
            status: 'importado',
            subject,
            from,
            contratado: dadosIA?.contratado_nome || '?',
            tipo: dadosIA?.tipo_documento || 'CONTRATO',
            drive_backup: !!driveFileId,
            intake_id: intakeCreated?.id,
            membros_extras: membrosExtras.length,
          });
        }
      } catch (msgErr) {
        console.error(`[Gmail Contratos] Erro mensagem ${msg.id}:`, msgErr);
        erros_count++;
      }
    }

    return Response.json({
      success: true,
      resumo: {
        total_emails_verificados: messages.length,
        contratos_processados: processados,
        importados,
        duplicados,
        erros: erros_count,
        dry_run: dryRun,
      },
      resultados,
    });

  } catch (error) {
    console.error('[importarContratosGmail] Erro geral:', error);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});

// Cria ou atualiza TeamMember com ficha completa extraída do contrato
async function criarOuAtualizarTeamMember(base44: any, dadosIA: any, fileUrl: string, intakeId?: string) {
  try {
    const cpfLimpo = String(dadosIA.contratado_cpf || '').replace(/\D/g, '');
    const cnpjLimpo = String(dadosIA.contratado_cnpj || '').replace(/\D/g, '');
    const nome = String(dadosIA.contratado_nome || '').trim();
    if (!nome) return null;

    // Determinar tipo
    const tipoPessoa = dadosIA.contratado_tipo === 'PJ' ? 'ME'
      : dadosIA.contratado_tipo === 'MEI' ? 'MEI'
      : 'PF';

    // Buscar membro existente por CPF, CNPJ ou nome
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

    const fichaBase = {
      user_name: nome,
      tipo_pessoa: tipoPessoa,
      cpf: cpfLimpo || null,
      cnpj: cnpjLimpo || null,
      funcao: dadosIA.funcao_projeto || '',
      empresa_nome: tipoPessoa !== 'PF' ? nome : null,
      representante_legal_nome: dadosIA.contratado_representante || null,
      representante_legal_cpf: String(dadosIA.contratado_cpf_representante || '').replace(/\D/g, '') || null,
      empresa_endereco: dadosIA.contratado_endereco || null,
      telefone: dadosIA.contratado_telefone || null,
      email_pessoal: dadosIA.contratado_email || null,
      banco: dadosIA.contratado_banco || '',
      agencia: dadosIA.contratado_agencia || '',
      conta: dadosIA.contratado_conta || '',
      tipo_conta: dadosIA.contratado_tipo_conta || 'Corrente',
      pix_key: dadosIA.contratado_pix || '',
      valor_total: toNumber(dadosIA.valor_total),
      numero_parcelas: toNumber(dadosIA.numero_parcelas) || 1,
      valor_parcela: toNumber(dadosIA.valor_parcela),
      data_assinatura: dadosIA.data_assinatura || null,
      data_inicio_contrato: dadosIA.vigencia_inicio || null,
      data_fim_contrato: dadosIA.vigencia_fim || null,
      contrato_url: fileUrl,
      objeto_contrato: dadosIA.objeto_contrato || '',
      escopo_descricao: dadosIA.escopo_atividades || '',
      museu_projeto: dadosIA.museu_relacionado || '',
      centro_custo: dadosIA.centro_custo || '',
      status: 'ATIVO',
      status_contrato: 'VIGENTE',
      // Número do contrato mapeado para numero_contrato
      numero_contrato: dadosIA.numero_contrato || '',
      // Cronograma de parcelas
      cronograma_parcelas: Array.isArray(dadosIA.datas_pagamento) && dadosIA.datas_pagamento.length > 0
        ? dadosIA.datas_pagamento.map((d: string, i: number) => ({
            numero: i + 1,
            valor: toNumber(dadosIA.valor_parcela),
            vencimento: d,
            status: 'pendente',
          }))
        : [],
    };

    if (existente) {
      // Só atualiza campos que estão vazios — não sobrescreve dados manuais
      const updates: Record<string, any> = {};
      const campos = [
        'funcao', 'empresa_endereco', 'telefone', 'email_pessoal',
        'banco', 'agencia', 'conta', 'pix_key', 'tipo_conta',
        'valor_total', 'numero_parcelas', 'valor_parcela',
        'data_assinatura', 'data_inicio_contrato', 'data_fim_contrato',
        'contrato_url', 'objeto_contrato', 'escopo_descricao',
        'museu_projeto', 'centro_custo', 'numero_contrato', 'tipo_pessoa',
        'representante_legal_nome', 'representante_legal_cpf',
        'empresa_nome', 'status_contrato',
      ];
      for (const campo of campos) {
        if (!existente[campo] && fichaBase[campo as keyof typeof fichaBase]) updates[campo] = fichaBase[campo as keyof typeof fichaBase];
      }
      // CPF/CNPJ: preenche se encontrado pelo nome e estava vazio
      if (!existente.cpf && cpfLimpo) updates.cpf = cpfLimpo;
      if (!existente.cnpj && cnpjLimpo) updates.cnpj = cnpjLimpo;
      // email_pessoal: preenche se vazio
      if (!existente.email_pessoal && dadosIA.contratado_email) updates.email_pessoal = dadosIA.contratado_email;
      // telefone: preenche se vazio
      if (!existente.telefone && dadosIA.contratado_telefone) updates.telefone = dadosIA.contratado_telefone;
      // Sempre atualiza contrato_url se novo
      if (fileUrl && existente.contrato_url !== fileUrl) updates.contrato_url = fileUrl;
      // Cronograma: só preenche se vazio
      if (!existente.cronograma_parcelas?.length && fichaBase.cronograma_parcelas.length > 0) {
        updates.cronograma_parcelas = fichaBase.cronograma_parcelas;
      }

      if (Object.keys(updates).length > 0) {
        await base44.asServiceRole.entities.TeamMember.update(existente.id, updates);
      }
      return { acao: 'atualizado', id: existente.id, nome };
    } else {
      // Criar novo membro — email interno derivado do CPF/CNPJ ou nome
      const emailInterno = cpfLimpo
        ? `cpf.${cpfLimpo}@contrato.interno`
        : cnpjLimpo
        ? `cnpj.${cnpjLimpo}@contrato.interno`
        : `membro.${normalize(nome).replace(/\s+/g, '.')}.${Date.now()}@contrato.interno`;

      const criado = await base44.asServiceRole.entities.TeamMember.create({
        ...fichaBase,
        user_email: emailInterno,
      });
      return { acao: 'criado', id: criado?.id, nome };
    }
  } catch (err) {
    console.error('[criarOuAtualizarTeamMember]', dadosIA?.contratado_nome, err);
    return null;
  }
}