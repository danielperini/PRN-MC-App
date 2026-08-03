import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const APP_URL = (typeof process !== 'undefined' && process.env && process.env.APP_URL) || 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app';
const COMPRAS_URL = `${APP_URL}/Compras`;

function buildEmailBody(nome, museu, funcao) {
  const primeiroNome = (nome || 'Profissional').split(' ')[0];
  const museuLabel = museu ? museu : 'Museus Centro';
  const funcaoLabel = funcao ? funcao : 'Profissional';

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;">
  <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e3a8a,#2563eb);padding:28px;">
      <div style="color:rgba(255,255,255,0.8);font-size:12px;font-weight:600;letter-spacing:1px;text-transform:uppercase;">Museus Centro · Viaduto das Artes</div>
      <div style="color:#ffffff;font-size:22px;font-weight:700;margin-top:6px;">⚠️ Lembrete: Envie sua Nota Fiscal para Aprovação</div>
    </div>

    <!-- Body -->
    <div style="padding:28px;">
      <p style="font-size:16px;font-weight:600;color:#1e293b;margin:0 0 8px 0;">Olá, ${primeiroNome}!</p>

      <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 16px 0;">
        Esta é uma comunicação institucional da Coordenação do projeto <strong>Museus Centro</strong>.
        Solicitamos que você revise e envie suas <strong>notas fiscais</strong> para aprovação na plataforma,
        para que possam tramitar para pagamento junto à administração financeira.
      </p>

      <p style="font-size:14px;color:#475569;line-height:1.7;margin:0 0 16px 0;">
        Lembre-se: notas fiscais somente ingressam no fluxo de pagamento após serem enviadas e aprovadas
        no sistema. Pendências de envio podem atrasar seu repasse financeiro.
      </p>

      <!-- Destaque -->
      <div style="background:#fffbeb;border-left:4px solid #d97706;border-radius:6px;padding:14px 16px;margin-bottom:24px;">
        <p style="font-size:14px;font-weight:700;color:#92400e;margin:0;">
          📌 Acesse a página de Suprimentos e envie suas NFs para aprovação
        </p>
        <p style="font-size:13px;color:#b45309;margin:6px 0 0 0;">
          Vá em "Compras / Suprimentos" → localize sua solicitação → anexe a NF revisada e confirme o envio.
        </p>
      </div>

      <!-- Identificação -->
      <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:24px;">
        <p style="font-size:13px;color:#64748b;margin:0 0 4px 0;">Identificação do destinatário:</p>
        <p style="font-size:14px;font-weight:600;color:#1e293b;margin:0;">${nome || 'Profissional'}</p>
        <p style="font-size:13px;color:#475569;margin:4px 0 0 0;">${funcaoLabel} · ${museuLabel}</p>
      </div>

      <!-- CTA -->
      <div style="text-align:center;margin-top:24px;">
        <a href="${COMPRAS_URL}"
           style="display:inline-block;background:#1e293b;color:#ffffff;font-size:15px;font-weight:700;padding:14px 32px;border-radius:8px;text-decoration:none;">
          Acessar Suprimentos →
        </a>
      </div>

      <p style="font-size:13px;color:#94a3b8;text-align:center;margin-top:20px;line-height:1.6;">
        Em caso de dúvidas, entre em contato com a Coordenação do projeto.<br>
        Este e-mail foi gerado automaticamente pela plataforma Museus Centro.
      </p>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e2e8f0;text-align:center;">
      <p style="font-size:11px;color:#94a3b8;margin:0;">
        Coordenação Museus Centro — Viaduto das Artes
      </p>
    </div>
  </div>
</body>
</html>`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Buscar todos os TeamMembers ativos
    const teamMembers = await base44.asServiceRole.entities.TeamMember.filter({ status: 'ATIVO' }, '-created_date', 1000);

    if (!teamMembers || teamMembers.length === 0) {
      return Response.json({
        success: true,
        total: 0,
        enviados: 0,
        erros: [],
        message: 'Nenhum TeamMember ativo encontrado.'
      });
    }

    let enviados = 0;
    const erros = [];
    const enviadosLista = [];

    for (const member of teamMembers) {
      const email = (member.user_email || member.email_pessoal || '').trim();
      if (!email) {
        erros.push({
          member_id: member.id,
          nome: member.user_name,
          motivo: 'Sem e-mail válido (user_email e email_pessoal vazios)'
        });
        continue;
      }

      const nome = member.user_name || 'Profissional';
      const museu = member.museu_vinculado || '';
      const funcao = member.funcao || member.role || '';

      try {
        await base44.asServiceRole.integrations.Core.SendEmail({
          to: email,
          subject: '⚠️ Lembrete: Envie sua Nota Fiscal para Aprovação — Museus Centro',
          body: buildEmailBody(nome, museu, funcao),
          from_name: 'Museus Centro — Coordenação'
        });
        enviados++;
        enviadosLista.push({ email, nome });
        console.log(`[notifyEquipeEnviarNFAprovacao] Enviado para ${email} (${nome})`);
      } catch (e) {
        console.warn(`[notifyEquipeEnviarNFAprovacao] Falha para ${email}:`, e?.message);
        erros.push({
          email,
          nome,
          motivo: e?.message || String(e)
        });
      }
    }

    return Response.json({
      success: true,
      total: teamMembers.length,
      enviados,
      erros,
      enviados_lista: enviadosLista
    });

  } catch (error) {
    console.error('[notifyEquipeEnviarNFAprovacao] Erro:', error);
    return Response.json({
      success: false,
      error: error?.message || String(error)
    }, { status: 500 });
  }
});