import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const CONTRATOS_FOLDER_ID = '1sI_XEZpUo3W5gcs2Nik3rGm1v6bAbKTh';
const APP_URL = 'https://relatorios-perini-pro-mc-viadutodasartes.base44.app';

function normalize(str) {
  return (str || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

const IGNORE_TOKENS = new Set([
  'contrato', 'termo', 'acordo', 'aditivo', 'assinado', 'assinada', 'signed',
  'mc', 'museu', 'museus', 'centro', 'viaduto', 'artes', 'de', 'da', 'do',
  'e', 'com', '2024', '2025', '2026', 'pdf', 'doc',
]);

function extractNameTokens(filename) {
  return normalize(filename)
    .replace(/\.(pdf|docx|doc)$/i, '')
    .replace(/[-_]+/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !IGNORE_TOKENS.has(t));
}

function scoreMatch(fileTokens, memberName) {
  const memberTokens = normalize(memberName).split(/\s+/).filter(t => t.length > 1);
  if (memberTokens.length === 0) return 0;
  let matched = 0;
  for (const mt of memberTokens) {
    if (fileTokens.some(ft => ft.includes(mt) || mt.includes(ft))) matched++;
  }
  return matched / memberTokens.length;
}

function isContrato(nome) {
  const n = normalize(nome);
  return ['contrato', 'termo', 'acordo', 'convenio', 'tc-', 'tc_', ' tc ', 'aditivo'].some(k => n.includes(normalize(k)));
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Permite chamada agendada (sem user) ou por admin
    const user = await base44.auth.me().catch(() => null);
    if (user && !['admin', 'coordenador', 'coordinator'].includes((user.role || '').toLowerCase())) {
      return Response.json({ error: 'Acesso restrito.' }, { status: 403 });
    }

    // ── 1. Token do Drive ───────────────────────────────────────────────────
    let driveToken = null;
    try { const c = await base44.asServiceRole.connectors.getConnection('googledrive'); driveToken = c?.access_token || null; } catch (_) {}
    if (!driveToken) return Response.json({ error: 'Google Drive não conectado.' }, { status: 401 });

    // ── 2. Token do Gmail ───────────────────────────────────────────────────
    let gmailToken = null;
    try { const c = await base44.asServiceRole.connectors.getConnection('gmail'); gmailToken = c?.access_token || null; } catch (_) {}

    // ── 3. Buscar TeamMembers ativos ────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const notifyMember = body.notify_member !== false; // default true

    const members = await base44.asServiceRole.entities.TeamMember.filter({ status: 'ATIVO' }, '', 500).catch(() => []);

    // ── 4. Listar contratos no Drive recursivamente ────────────────────────
    async function listFiles(fid, depth = 0) {
      if (depth > 5) return [];
      let files = [];
      let pageToken = null;
      do {
        const q = encodeURIComponent(`'${fid}' in parents and trashed=false`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,createdTime,modifiedTime,webViewLink)&pageSize=100${pageToken ? '&pageToken=' + pageToken : ''}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${driveToken}` } });
        if (!res.ok) break;
        const data = await res.json();
        if (data.error) break;
        for (const f of (data.files || [])) {
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            files = files.concat(await listFiles(f.id, depth + 1));
          } else if ((f.name || '').match(/\.(pdf|docx?)/i) && isContrato(f.name)) {
            files.push(f);
          }
        }
        pageToken = data.nextPageToken || null;
      } while (pageToken);
      return files;
    }

    const driveContratos = await listFiles(CONTRATOS_FOLDER_ID);

    // ── 5. Buscar contratos no Gmail (anexos PDF) ───────────────────────────
    const gmailContratos = [];
    if (gmailToken) {
      try {
        const since = Math.floor((Date.now() - 365 * 24 * 3600 * 1000) / 1000);
        const query = encodeURIComponent(`has:attachment filename:contrato OR filename:termo OR filename:acordo after:${since}`);
        const listRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=50`, {
          headers: { Authorization: `Bearer ${gmailToken}` },
        });
        if (listRes.ok) {
          const listData = await listRes.json();
          for (const msg of (listData.messages || [])) {
            const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`, {
              headers: { Authorization: `Bearer ${gmailToken}` },
            });
            if (!msgRes.ok) continue;
            const msgData = await msgRes.json();
            const parts = msgData.payload?.parts || [];
            for (const part of parts) {
              if (part.mimeType === 'application/pdf' && part.filename && isContrato(part.filename)) {
                gmailContratos.push({ id: `gmail_${msg.id}_${part.partId}`, name: part.filename, source: 'gmail' });
              }
            }
          }
        }
      } catch (gmailErr) {
        console.warn('[sincronizarContratosCompleto] Gmail error:', gmailErr.message);
      }
    }

    // ── 6. Vincular contratos a TeamMembers ────────────────────────────────
    const vinculados = [];
    const semContrato = [];
    const SCORE_THRESHOLD_DRIVE = 0.50;
    const SCORE_THRESHOLD_GMAIL = 0.90;

    // Indexar membros já vinculados para não sobrescrever
    const membersMap = new Map(members.map(m => [m.id, m]));

    for (const f of [...driveContratos, ...gmailContratos]) {
      const fileTokens = extractNameTokens(f.name);
      if (fileTokens.length === 0) continue;
      const threshold = f.source === 'gmail' ? SCORE_THRESHOLD_GMAIL : SCORE_THRESHOLD_DRIVE;

      let bestMember = null;
      let bestScore = 0;
      for (const m of members) {
        if (!m.user_name) continue;
        const score = scoreMatch(fileTokens, m.user_name);
        if (score > bestScore) { bestScore = score; bestMember = m; }
      }

      if (!bestMember || bestScore < threshold) continue;

      const driveUrl = f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`;
      // Só atualizar se contrato_url estiver vazio
      if (bestMember.contrato_url) continue;

      try {
        await base44.asServiceRole.entities.TeamMember.update(bestMember.id, { contrato_url: driveUrl });
        // Atualizar no map local
        membersMap.get(bestMember.id).contrato_url = driveUrl;

        await base44.asServiceRole.entities.BackupLog.create({
          backup_type: 'drive_folders',
          entity_type: 'CONTRACT_AUTO_SYNC',
          entity_id: bestMember.id,
          drive_file_id: f.id,
          file_name: f.name,
          status: 'success',
          processed_at: new Date().toISOString(),
          details: `Contrato vinculado a ${bestMember.user_name} (score: ${Math.round(bestScore * 100)}%, fonte: ${f.source || 'drive'})`,
          triggered_by: 'scheduled',
        }).catch(() => {});

        // Enviar e-mail de confirmação ao membro (se notify_member ativo)
        if (notifyMember && bestMember.user_email) {
          await base44.asServiceRole.integrations.Core.SendEmail({
            to: bestMember.user_email,
            subject: '✅ Seu contrato foi localizado e vinculado ao seu cadastro',
            body: `
              <p>Olá, <strong>${bestMember.user_name}</strong>!</p>
              <p>Identificamos e vinculamos automaticamente o seu contrato ao seu cadastro na plataforma <strong>Museus Centro</strong>.</p>
              <p><strong>Arquivo:</strong> ${f.name}</p>
              <p><a href="${driveUrl}" style="background:#1a1a1a;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600;">Ver documento no Drive</a></p>
              <p style="margin-top:16px;">Você pode acessar seu cadastro completo acessando sua <strong>Sala</strong> na plataforma.</p>
              <p style="color:#888;font-size:12px;">Museus Centro — Viaduto das Artes</p>
            `,
          }).catch(err => console.warn(`[sincronizarContratosCompleto] Email não enviado para ${bestMember.user_email}:`, err.message));
        }

        vinculados.push({ membro: bestMember.user_name, arquivo: f.name, score: bestScore, fonte: f.source || 'drive' });
      } catch (e) {
        console.error(`[sincronizarContratosCompleto] Erro ao vincular ${f.name}:`, e.message);
      }
    }

    // ── 7. Identificar membros sem contrato (após sync) ───────────────────
    const membersAtualizados = await base44.asServiceRole.entities.TeamMember.filter({ status: 'ATIVO' }, '', 500).catch(() => []);
    for (const m of membersAtualizados) {
      if (!m.contrato_url) semContrato.push({ id: m.id, nome: m.user_name, email: m.user_email });
    }

    return Response.json({
      success: true,
      contratos_drive: driveContratos.length,
      contratos_gmail: gmailContratos.length,
      vinculados,
      sem_contrato: semContrato,
      total_members: members.length,
    });
  } catch (error) {
    console.error('[sincronizarContratosCompleto]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});