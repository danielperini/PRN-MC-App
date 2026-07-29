import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const APP_URL = 'https://periniprojetos.com.br';

const CAMPOS_OBRIGATORIOS = [
  { key: 'cpf', label: 'CPF / CNPJ' },
  { key: 'cnpj', label: 'CNPJ' },
  { key: 'banco', label: 'Banco' },
  { key: 'pix_key', label: 'Chave PIX' },
  { key: 'telefone', label: 'Telefone' },
  { key: 'endereco_residencial', label: 'Endereço residencial' },
];

function primeiroNome(nomeCompleto) {
  return (nomeCompleto || '').split(/\s+/)[0] || 'colega';
}

function buildEmail(nome, temContrato, camposFaltantes) {
  const primeiro = primeiroNome(nome);
  const camposHtml = camposFaltantes.length > 0
    ? `<ul style="margin:8px 0 16px;padding-left:20px;color:#b45309;">${camposFaltantes.map(c => `<li>${c}</li>`).join('')}</ul>`
    : '';

  const secaoContrato = temContrato
    ? `<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px;margin:16px 0;">
        ✅ <strong>Seu contrato já foi identificado e vinculado ao seu perfil!</strong><br/>
        <span style="font-size:13px;color:#166534;">Complete os dados restantes na sua Sala para finalizar o cadastro.</span>
       </div>`
    : `<div style="background:#fef9c3;border:1px solid #fde68a;border-radius:8px;padding:14px;margin:16px 0;">
        ⚠️ <strong>Contrato não encontrado automaticamente.</strong><br/>
        <span style="font-size:13px;color:#92400e;">Por favor, faça o upload do seu contrato assinado pela Entrada de Documentos. A IA irá ler e pré-preencher seus dados automaticamente.</span>
       </div>`;

  const passos = temContrato
    ? `<ol>
        <li>Acesse sua <strong>Sala pessoal</strong> na plataforma.</li>
        <li>Complete os campos faltantes listados acima.</li>
        <li>Salve suas informações ao finalizar.</li>
       </ol>`
    : `<ol>
        <li>Acesse a <strong>Entrada de Documentos</strong> e faça o upload do seu contrato assinado (PDF).</li>
        <li>A IA irá ler e pré-preencher seus dados automaticamente.</li>
        <li>Acesse sua <strong>Sala pessoal</strong> para conferir e completar os dados restantes.</li>
        <li>Salve suas informações ao finalizar.</li>
       </ol>`;

  const botoes = temContrato
    ? `<a href="${APP_URL}/MeusDados" style="display:inline-block;background:#111;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:14px;margin:4px 4px 4px 0;">Acessar minha Sala →</a>
       <a href="${APP_URL}/Agenda" style="display:inline-block;background:#0369a1;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:14px;margin:4px;">Ver Agenda →</a>`
    : `<a href="${APP_URL}/MeusDados" style="display:inline-block;background:#111;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:14px;margin:4px 4px 4px 0;">Acessar minha Sala →</a>
       <a href="${APP_URL}/EntradaUnica" style="display:inline-block;background:#6d28d9;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:14px;margin:4px;">Enviar Contrato →</a>
       <a href="${APP_URL}/Agenda" style="display:inline-block;background:#0369a1;color:#fff;padding:10px 22px;border-radius:6px;text-decoration:none;font-size:14px;margin:4px;">Ver Agenda →</a>`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"><style>
body{font-family:Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;}
h2{color:#111;}
.box{background:#f9f5ff;border:1px solid #ddd6fe;border-radius:8px;padding:16px;margin:16px 0;}
</style></head>
<body>
<h2>Olá, ${primeiro}! 👋</h2>
<p>Para garantir o correto processamento do seu vínculo contratual com o projeto <strong>Museus Centro</strong>, precisamos que você complete seu cadastro na plataforma.</p>

${secaoContrato}

${camposFaltantes.length > 0 ? `<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:14px;margin:16px 0;"><strong>Dados ainda não preenchidos:</strong>${camposHtml}</div>` : ''}

<p><strong>O que fazer:</strong></p>
${passos}

<div style="margin:24px 0;">${botoes}</div>

<div class="box">
  <p style="margin:0;font-size:13px;color:#555;">⏰ Prazo sugerido: <strong>7 dias</strong> para regularizar o cadastro. Em caso de dúvidas, entre em contato com a coordenação.</p>
</div>

<p style="color:#999;font-size:12px;margin-top:32px;">Museus Centro — Viaduto das Artes</p>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && !['admin', 'coordenador', 'coordinator'].includes((user.role || '').toLowerCase())) {
      return Response.json({ error: 'Acesso restrito a coordenadores e admins' }, { status: 403 });
    }

    const reqBody = await req.json().catch(() => ({}));
    const forceResend = reqBody.force_resend === true;

    // Buscar todos os TeamMembers ativos não-observadores
    const members = await base44.asServiceRole.entities.TeamMember.filter({ status: 'ATIVO' }, '', 500).catch(() => []);

    // Calcular janela de deduplicação: última semana (ignorada se force_resend)
    const umaSemanAtras = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

    // Buscar NotificationLog recentes do tipo TEAM_COMPLETAR_CADASTRO
    const logsRecentes = forceResend ? [] : await base44.asServiceRole.entities.NotificationLog.filter({
      notification_type: 'TEAM_COMPLETAR_CADASTRO',
    }, '-sent_at', 500).catch(() => []);

    const emailsEnviadosRecente = new Set(
      logsRecentes
        .filter(l => l.sent_at && l.sent_at > umaSemanAtras && l.status === 'SENT')
        .flatMap(l => l.recipients || [])
    );

    let enviados = 0;
    let pulados = 0;
    let erros = 0;
    const detalhes = [];

    for (const m of members) {
      const email = m.user_email;
      const nome = m.user_name;
      const role = (m.role || m.funcao_institucional || '').toLowerCase();

      // Pular observadores
      if (role.includes('observador') || role.includes('observer')) {
        pulados++;
        continue;
      }

      if (!email || !nome) { pulados++; continue; }

      // Deduplicação semanal
      if (emailsEnviadosRecente.has(email)) {
        pulados++;
        detalhes.push({ email, status: 'pulado', motivo: 'Já recebeu esta semana' });
        continue;
      }

      // Verificar campos faltantes
      const camposFaltantes = [];
      // Verificar CPF ou CNPJ
      const tipoPessoa = m.tipo_pessoa || 'PF';
      if (tipoPessoa === 'PF' && !m.cpf) camposFaltantes.push('CPF');
      if ((tipoPessoa === 'MEI' || tipoPessoa === 'ME') && !m.cnpj) camposFaltantes.push('CNPJ');
      if (!m.banco) camposFaltantes.push('Banco');
      if (!m.pix_key) camposFaltantes.push('Chave PIX');
      if (!m.telefone && !m.celular) camposFaltantes.push('Telefone / Celular');
      if (!m.endereco_residencial) camposFaltantes.push('Endereço residencial');

      const temContrato = !!m.contrato_url;

      // Se tudo preenchido E tem contrato, pular
      if (camposFaltantes.length === 0 && temContrato) {
        pulados++;
        detalhes.push({ email, status: 'pulado', motivo: 'Cadastro completo' });
        continue;
      }

      const emailBody = buildEmail(nome, temContrato, camposFaltantes);
      const assunto = temContrato
        ? `[Museus Centro] Complete sua Sala — ${camposFaltantes.length} campo(s) pendente(s)`
        : `[Museus Centro] Envie seu contrato e complete sua Sala`;

      try {
        await base44.asServiceRole.integrations.Core.SendEmail({ to: email, subject: assunto, body: emailBody });

        await base44.asServiceRole.entities.NotificationLog.create({
          notification_type: 'TEAM_COMPLETAR_CADASTRO',
          channel: 'EMAIL',
          recipients: [email],
          subject: assunto,
          entity_type: 'TeamMember',
          entity_id: m.id,
          status: 'SENT',
          sent_at: new Date().toISOString(),
          created_by: user?.email || 'system',
          metadata_json: { campos_faltantes: camposFaltantes, tem_contrato: temContrato },
        });

        enviados++;
        detalhes.push({ email, nome, status: 'enviado', tem_contrato: temContrato, campos_faltantes: camposFaltantes });
      } catch (err) {
        erros++;
        detalhes.push({ email, status: 'erro', erro: err.message });
      }
    }

    return Response.json({ success: true, enviados, pulados, erros, detalhes });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});