import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Pasta raiz: https://drive.google.com/drive/folders/1MuP2BxtlYPNBfcaDi6cFRhtAufj0cFWY
const ROOT_FOLDER_ID = '1MuP2BxtlYPNBfcaDi6cFRhtAufj0cFWY';

// ─── Drive helpers ────────────────────────────────────────────────────────────

async function findFolder(token, name, parentId) {
  const q = encodeURIComponent(`name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.files?.[0]?.id || null;
}

async function createFolder(token, name, parentId) {
  const res = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const d = await res.json();
  if (d.error) throw new Error(`Criar pasta "${name}": ${d.error.message}`);
  return d.id;
}

async function getOrCreateFolder(token, name, parentId) {
  return (await findFolder(token, name, parentId)) || (await createFolder(token, name, parentId));
}

async function fileExistsInFolder(token, fileName, folderId) {
  const q = encodeURIComponent(`name='${fileName}' and '${folderId}' in parents and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,webViewLink)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await res.json();
  return data.files?.[0] || null;
}

async function uploadHtml(token, fileName, htmlContent, folderId, existingFileId = null) {
  const enc = new TextEncoder();
  const htmlBytes = enc.encode(htmlContent);

  if (existingFileId) {
    // Substituir arquivo existente
    const res = await fetch(
      `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media&fields=id,webViewLink`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/html; charset=UTF-8' },
        body: htmlBytes
      }
    );
    return await res.json();
  }

  // Criar novo arquivo via multipart
  const boundary = 'rpt_backup_boundary';
  const meta = JSON.stringify({ name: fileName, parents: [folderId], mimeType: 'text/html' });
  const part1 = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n`);
  const part2 = enc.encode(`--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n`);
  const part3 = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(part1.length + part2.length + htmlBytes.length + part3.length);
  body.set(part1, 0);
  body.set(part2, part1.length);
  body.set(htmlBytes, part1.length + part2.length);
  body.set(part3, part1.length + part2.length + htmlBytes.length);

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  return await res.json();
}

// ─── HTML do relatório ────────────────────────────────────────────────────────

function esc(v) { return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function buildReportHtml(report, activities = []) {
  const ativsList = activities.map((a, i) => `
    <div class="act">
      <div class="act-header">Atividade ${i+1} — <b>${esc(a.titulo || a.nome || 'Sem título')}</b>
        <span class="badge">${esc(a.classificacao || '')}</span>
      </div>
      <p><b>Data:</b> ${esc(a.data_realizacao || a.data_inicio || '-')} &nbsp;|&nbsp; <b>Público total:</b> ${Number(a.publico_total)||0}</p>
      <p><b>Descrição:</b> ${esc(a.descricao || '-')}</p>
      ${a.meta_codigo ? `<p><b>Meta:</b> ${esc(a.meta_codigo)}</p>` : ''}
      ${a.resultado_alcancado ? `<p><b>Resultado alcançado:</b> ${esc(a.resultado_alcancado)}</p>` : ''}
    </div>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><title>Relatório — ${esc(report.author_name)} ${esc(report.mes_referencia)}/${esc(report.ano)}</title>
<style>
  body{font-family:Arial,sans-serif;margin:0;padding:32px;color:#111;background:#fff}
  h1{font-size:24px;border-bottom:2px solid #111;padding-bottom:8px}
  h2{font-size:18px;margin-top:24px;border-bottom:1px solid #ddd;padding-bottom:4px}
  .meta{display:grid;grid-template-columns:1fr 1fr;gap:8px;background:#f5f5f5;padding:16px;border-radius:6px;margin-bottom:16px}
  .meta span{font-size:13px}<br/>
  .text-block{margin-top:12px}
  .text-block p{white-space:pre-wrap;line-height:1.6;margin-top:4px}
  .act{border:1px solid #ddd;border-radius:8px;padding:14px;margin-bottom:12px}
  .act-header{font-weight:600;margin-bottom:6px;display:flex;align-items:center;gap:8px}
  .badge{font-size:11px;border:1px solid #666;border-radius:999px;padding:2px 8px;color:#444}
  footer{margin-top:48px;border-top:1px solid #ddd;padding-top:12px;font-size:11px;color:#888}
</style>
</head>
<body>
<h1>Relatório Mensal — ${esc(report.mes_referencia)} ${esc(report.ano)}</h1>
<div class="meta">
  <span><b>Autor:</b> ${esc(report.author_name)}</span>
  <span><b>Função:</b> ${esc(report.funcao||'-')}</span>
  <span><b>Museu:</b> ${esc(report.museu||'-')}</span>
  <span><b>Equipe:</b> ${esc(report.equipe||'-')}</span>
  <span><b>Status:</b> ${esc(report.status)}</span>
  <span><b>Protocolo:</b> ${esc(report.numero_protocolo||'-')}</span>
</div>

<h2>Resumo do Período</h2>
<div class="text-block"><p>${esc(report.resumo_periodo||'-')}</p></div>

<h2>Resumo Executivo</h2>
<div class="text-block"><p>${esc(report.resumo_executivo||'-')}</p></div>

${report.avaliacao_pontos_positivos ? `<h2>Pontos Positivos</h2><div class="text-block"><p>${esc(report.avaliacao_pontos_positivos)}</p></div>` : ''}
${report.avaliacao_desafios ? `<h2>Desafios</h2><div class="text-block"><p>${esc(report.avaliacao_desafios)}</p></div>` : ''}
${report.avaliacao_sugestoes ? `<h2>Sugestões</h2><div class="text-block"><p>${esc(report.avaliacao_sugestoes)}</p></div>` : ''}
${report.comentarios_gerais ? `<h2>Comentários Gerais</h2><div class="text-block"><p>${esc(report.comentarios_gerais)}</p></div>` : ''}

${activities.length > 0 ? `<h2>Atividades (${activities.length})</h2>${ativsList}` : '<h2>Atividades</h2><p style="color:#888">Nenhuma atividade vinculada.</p>'}

<footer>Gerado automaticamente em ${new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'})} | Museus Centro — Viaduto das Artes</footer>
</body></html>`;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

function sanitize(str = '') {
  return String(str).replace(/[\/\\:*?"<>|]/g,'_').replace(/\s+/g,' ').trim();
}

function museuLabel(museu = '') {
  const m = String(museu).toUpperCase();
  if (m.includes('MHAB')||m.includes('ABILIO')||m.includes('HISTORICO')) return 'MHAB';
  if (m.includes('MIS')||m.includes('IMAGEM')||m.includes('SOM')) return 'MIS';
  if (m.includes('MUMO')||m.includes('MODA')) return 'MUMO';
  if (m.includes('BAILE')) return 'Casa-do-Baile';
  if (m.includes('KUBITSCHEK')) return 'Casa-Kubitschek';
  if (m.includes('MAP')) return 'MAP';
  return 'Outros';
}

const MES_NUM = {
  'Janeiro':'01','Fevereiro':'02','Março':'03','Abril':'04','Maio':'05','Junho':'06',
  'Julho':'07','Agosto':'08','Setembro':'09','Outubro':'10','Novembro':'11','Dezembro':'12'
};

function mesAnoLabel(mes = '', ano = '') {
  const num = MES_NUM[mes] || '00';
  return `${num}-${ano || new Date().getFullYear()}`;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin','ADMIN','COORDENADOR'].includes(user.role)) {
      return Response.json({ error: 'Apenas admins/coordenadores podem executar backup de relatórios' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = Number(body.batchSize) || 50;
    const skip = Number(body.skip) || 0;
    // Se forceAll=true, refaz mesmo os que já têm backup
    const forceAll = body.forceAll === true;
    // Filtrar por status (padrão: SUBMITTED, IN_REVIEW, APPROVED, ARCHIVED)
    const targetStatuses = body.statuses || ['SUBMITTED','IN_REVIEW','APPROVED','ARCHIVED'];

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Buscar todos os relatórios mensais
    const allReports = await base44.asServiceRole.entities.Report.list('-updated_date', 1000);
    const filtered = (allReports || []).filter(r =>
      r.tipo === 'mensal' || !r.tipo // tipo mensal ou sem tipo
    ).filter(r => targetStatuses.includes(r.status));

    // Pular os que já têm backup (a menos que forceAll)
    const pending = forceAll
      ? filtered
      : filtered.filter(r => !r.drive_backup_relatorio_url && !r.drive_backup_relatorio_id);

    const batch = pending.slice(skip, skip + batchSize);

    let enviados = 0;
    let atualizados = 0;
    const errors = [];

    for (const report of batch) {
      try {
        // Buscar atividades vinculadas
        const activities = await base44.asServiceRole.entities.Activity.filter(
          { report_id: report.id }, '-created_date', 200
        ).catch(() => []);

        const museu = museuLabel(report.museu || '');
        const periodo = mesAnoLabel(report.mes_referencia, String(report.ano || ''));
        const autor = sanitize(report.author_name || 'SemAutor');
        const protocolo = sanitize(report.numero_protocolo || report.id.slice(-8));
        const fileName = `${periodo}_${autor}_${protocolo}.html`;

        // Estrutura: ROOT / MUSEU / AAAA-MM / arquivo.html
        const museuFolderId = await getOrCreateFolder(accessToken, museu, ROOT_FOLDER_ID);
        const periodoFolderId = await getOrCreateFolder(accessToken, periodo, museuFolderId);

        // Verificar se já existe para atualizar
        const existing = await fileExistsInFolder(accessToken, fileName, periodoFolderId);

        const html = buildReportHtml(report, activities);
        const result = await uploadHtml(accessToken, fileName, html, periodoFolderId, existing?.id || null);

        if (result.error) throw new Error(result.error.message);

        const driveUrl = result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`;

        // Atualizar o Report com os dados do backup
        await base44.asServiceRole.entities.Report.update(report.id, {
          drive_backup_relatorio_url: driveUrl,
          drive_backup_relatorio_id: result.id,
          drive_backup_status: 'concluido',
          drive_backup_at: new Date().toISOString(),
        }).catch(() => null);

        if (existing) atualizados++; else enviados++;

      } catch (e) {
        errors.push(`${report.numero_protocolo || report.id}: ${e.message}`);
        // Marcar como erro para não travar o loop
        await base44.asServiceRole.entities.Report.update(report.id, {
          drive_backup_status: 'erro',
          drive_backup_at: new Date().toISOString(),
        }).catch(() => null);
      }
    }

    const hasMore = pending.length > skip + batchSize;

    return Response.json({
      success: true,
      total_elegíveis: filtered.length,
      total_pendentes: pending.length,
      processados: batch.length,
      novos_enviados: enviados,
      atualizados,
      erros: errors.length > 0 ? errors.slice(0, 10) : [],
      has_more: hasMore,
      next_skip: hasMore ? skip + batchSize : null,
      pasta_drive: `https://drive.google.com/drive/folders/${ROOT_FOLDER_ID}`,
      message: `Backup: ${enviados} novos + ${atualizados} atualizados. ${hasMore ? `Restam ${pending.length - skip - batchSize}.` : 'Lote concluído.'}`,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});