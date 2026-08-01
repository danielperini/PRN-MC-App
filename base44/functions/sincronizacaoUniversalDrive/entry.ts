import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const LOTE = 20;
const TIMEOUT_BUDGET_MS = 200000; // 200s de 240s max — 80% do timeout

const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function sanitize(str) {
  return (str || '').replace(/[^a-zA-Z0-9À-ÿ\-_]/g, '_').replace(/_+/g, '_').slice(0, 60);
}

function resolverMesAno(record) {
  const campos = [record.nf_data_emissao, record.data_pagamento, record.created_date, record.approved_at];
  for (const c of campos) {
    if (c) {
      const d = new Date(c);
      if (!isNaN(d)) return { mes: MESES_PT[d.getMonth()], ano: d.getFullYear() };
    }
  }
  const now = new Date();
  return { mes: MESES_PT[now.getMonth()], ano: now.getFullYear() };
}

function nomesPadrao(record, tipo, originalUrl) {
  const { mes, ano } = resolverMesAno(record);
  const mm = String(MESES_PT.indexOf(mes) + 1).padStart(2, '0');
  const fornecedor = sanitize(record.fornecedor_nome || record.author_name || record.user_name || 'sem-fornecedor');
  const nfNum = record.nf_numero ? `NF-${sanitize(record.nf_numero)}` : (record.numero_protocolo ? sanitize(record.numero_protocolo) : 'sem-ref');
  const tipoS = sanitize(tipo);
  const solId = (record.id || 'sem-id').slice(-8);
  const ext = (originalUrl || '').split('?')[0].split('.').pop().toLowerCase().slice(0, 6) || 'bin';
  return `${ano}-${mm}__${fornecedor}__${nfNum}__${tipoS}__${solId}.${ext}`;
}

function ehNomeFora(name) {
  if (!name) return false;
  const n = name.toLowerCase();
  return (
    n.startsWith('sem título') ||
    n === 'download.pdf' ||
    n === 'document.pdf' ||
    n.match(/^[a-f0-9-]{30,}\./) || // UUID
    n.match(/^untitled/) ||
    n.match(/^file\d*\./)
  );
}

// Drive helpers
async function driveGet(authHeader, fileId, fields = 'id,name,md5Checksum,size,parents,trashed') {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=${fields}`, { headers: authHeader });
  if (!res.ok) return null;
  return res.json();
}

async function driveListFolder(authHeader, folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,md5Checksum,size,createdTime,modifiedTime)&pageSize=1000`,
    { headers: authHeader }
  );
  if (!res.ok) return [];
  const data = await res.json();
  return data.files || [];
}

async function driveGetOrCreateFolder(authHeader, parentId, name) {
  const q = encodeURIComponent(`name='${name}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`, { headers: authHeader });
  const data = await res.json();
  if (data.files && data.files.length > 0) return data.files[0].id;
  const cr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  const cf = await cr.json();
  return cf.id;
}

async function driveMoveFile(authHeader, fileId, targetFolderId, newName) {
  // Get current parents
  const meta = await driveGet(authHeader, fileId, 'id,parents');
  if (!meta) return false;
  const oldParents = (meta.parents || []).join(',');
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${targetFolderId}&removeParents=${oldParents}&fields=id`;
  const body = newName ? JSON.stringify({ name: newName }) : JSON.stringify({});
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body
  });
  return res.ok;
}

async function driveRenameFile(authHeader, fileId, newName) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id`, {
    method: 'PATCH',
    headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName })
  });
  return res.ok;
}

// Normaliza nome para deduplicação (remove sufixos _1, _2, " (1)", " (2)", "cópia de", etc.)
function nomeBase(name) {
  if (!name) return '';
  const ext = name.includes('.') ? '.' + name.split('.').pop() : '';
  let base = name.replace(/\.[^.]+$/, '');
  base = base.replace(/[\s_\-]*(cópia|copy|copia)[\s_\-]*(de)?[\s_\-]*/gi, '');
  base = base.replace(/[\s_\-]*\(\d+\)$/, '');
  base = base.replace(/[\s_\-]+\d+$/, '');
  return (base + ext).toLowerCase().trim();
}

// Deduplica arquivos dentro de uma pasta do Drive
async function deduplicarPasta(authHeader, folderId, duplicatasFolderId, stats) {
  const files = await driveListFolder(authHeader, folderId);
  if (files.length < 2) return;

  // Agrupa por (md5 ou nomeBase)
  const grupos = {};
  for (const f of files) {
    const chave = f.md5Checksum || nomeBase(f.name);
    if (!grupos[chave]) grupos[chave] = [];
    grupos[chave].push(f);
  }

  for (const [, grupo] of Object.entries(grupos)) {
    if (grupo.length < 2) continue;
    // Mantém o mais recente
    grupo.sort((a, b) => new Date(b.modifiedTime || b.createdTime || 0) - new Date(a.modifiedTime || a.createdTime || 0));
    const [, ...duplicatas] = grupo;
    for (const dup of duplicatas) {
      const moved = await driveMoveFile(authHeader, dup.id, duplicatasFolderId, dup.name);
      if (moved) stats.duplicatasDrive++;
    }
  }
}

// Processa PurchaseRequests: verifica arquivos no Drive, renomeia fora do padrão, deduplicação no banco
async function processarPurchaseRequests(base44, authHeader, duplicatasPastaId, cursor, stats, startTime) {
  const registros = await base44.asServiceRole.entities.PurchaseRequest.filter(
    { drive_backup_status: 'concluido' },
    '-updated_date',
    LOTE,
    cursor
  );

  for (const p of registros || []) {
    if (Date.now() - startTime > TIMEOUT_BUDGET_MS) return { parou: true, cursor: cursor + (registros || []).indexOf(p) };

    stats.verificados++;

    // Verifica se pasta do Drive ainda existe
    if (p.drive_backup_folder_id) {
      const pasta = await driveGet(authHeader, p.drive_backup_folder_id, 'id,trashed');
      if (!pasta || pasta.trashed) {
        await base44.asServiceRole.entities.PurchaseRequest.update(p.id, {
          drive_backup_status: 'pendente',
          drive_backup_folder_id: null,
          drive_backup_folder_url: null
        });
        stats.arquivosInvalidos++;
        continue;
      }

      // Renomeia arquivos fora do padrão dentro da pasta
      const files = await driveListFolder(authHeader, p.drive_backup_folder_id);
      for (const f of files) {
        if (ehNomeFora(f.name)) {
          const tipo = f.name.toLowerCase().includes('xml') ? 'nf-xml' : 'nf-pdf';
          const novoNome = nomesPadrao(p, tipo, f.name);
          await driveRenameFile(authHeader, f.id, novoNome);
          stats.renomeados++;
        }
      }

      // Deduplica pasta
      await deduplicarPasta(authHeader, p.drive_backup_folder_id, duplicatasPastaId, stats);
    }

    // Deduplicação no banco por nf_chave_acesso
    if (p.nf_chave_acesso && p.nf_chave_acesso.length === 44) {
      const iguais = await base44.asServiceRole.entities.PurchaseRequest.filter(
        { nf_chave_acesso: p.nf_chave_acesso },
        'created_date',
        10
      );
      if (iguais && iguais.length > 1) {
        // Mantém o original (mais antigo), marca os demais
        const [, ...duplicatas] = iguais;
        for (const dup of duplicatas) {
          if (!dup.duplicada_financeira) {
            await base44.asServiceRole.entities.PurchaseRequest.update(dup.id, {
              duplicada_financeira: true,
              incluir_no_somatorio: false,
              duplicidade_status: 'confirmada',
              duplicidade_nota_original_id: iguais[0].id,
              duplicidade_motivo: 'Mesma chave de acesso NF-e detectada na sincronização universal'
            });
            stats.duplicatasBanco++;
          }
        }
      }
    } else if (p.fornecedor_cnpj && p.nf_numero && p.nf_valor_total) {
      // Hash composto
      const iguais = await base44.asServiceRole.entities.PurchaseRequest.filter(
        { fornecedor_cnpj: p.fornecedor_cnpj, nf_numero: p.nf_numero, nf_valor_total: p.nf_valor_total },
        'created_date',
        10
      );
      if (iguais && iguais.length > 1) {
        const [, ...duplicatas] = iguais;
        for (const dup of duplicatas) {
          if (!dup.duplicada_financeira) {
            await base44.asServiceRole.entities.PurchaseRequest.update(dup.id, {
              duplicada_financeira: true,
              incluir_no_somatorio: false,
              duplicidade_status: 'confirmada',
              duplicidade_nota_original_id: iguais[0].id,
              duplicidade_motivo: 'Hash composto (CNPJ+NF+Valor) duplicado na sincronização universal'
            });
            stats.duplicatasBanco++;
          }
        }
      }
    }
  }

  return { parou: false, cursor: cursor + (registros || []).length, temMais: (registros || []).length === LOTE };
}

// Processa Reports
async function processarReports(base44, authHeader, cursor, stats, startTime) {
  const registros = await base44.asServiceRole.entities.Report.filter(
    { drive_backup_status: 'concluido' },
    '-updated_date',
    LOTE,
    cursor
  );

  for (const r of registros || []) {
    if (Date.now() - startTime > TIMEOUT_BUDGET_MS) return { parou: true };
    stats.verificados++;

    if (r.drive_backup_relatorio_id) {
      const file = await driveGet(authHeader, r.drive_backup_relatorio_id, 'id,trashed');
      if (!file || file.trashed) {
        await base44.asServiceRole.entities.Report.update(r.id, {
          drive_backup_status: 'pendente',
          drive_backup_relatorio_id: null,
          drive_backup_relatorio_url: null
        });
        stats.arquivosInvalidos++;
      }
    }
  }

  return { parou: false, cursor: cursor + (registros || []).length, temMais: (registros || []).length === LOTE };
}

// Processa ReportPhotos
async function processarReportPhotos(base44, authHeader, cursor, stats, startTime) {
  const registros = await base44.asServiceRole.entities.ReportPhoto.filter(
    { drive_backup_status: 'concluido' },
    '-updated_date',
    LOTE,
    cursor
  );

  for (const r of registros || []) {
    if (Date.now() - startTime > TIMEOUT_BUDGET_MS) return { parou: true };
    stats.verificados++;

    if (r.drive_file_id) {
      const file = await driveGet(authHeader, r.drive_file_id, 'id,trashed');
      if (!file || file.trashed) {
        await base44.asServiceRole.entities.ReportPhoto.update(r.id, {
          drive_backup_status: 'pendente',
          drive_file_id: null
        });
        stats.arquivosInvalidos++;
      }
    }
  }

  return { parou: false, cursor: cursor + (registros || []).length, temMais: (registros || []).length === LOTE };
}

// Processa DocumentIntakes
async function processarDocumentIntakes(base44, authHeader, cursor, stats, startTime) {
  const registros = await base44.asServiceRole.entities.DocumentIntake.filter(
    { contrato_drive_folder_id: { $exists: true } },
    '-updated_date',
    LOTE,
    cursor
  );

  for (const r of registros || []) {
    if (Date.now() - startTime > TIMEOUT_BUDGET_MS) return { parou: true };
    stats.verificados++;

    if (r.contrato_drive_folder_id) {
      const pasta = await driveGet(authHeader, r.contrato_drive_folder_id, 'id,trashed');
      if (!pasta || pasta.trashed) {
        await base44.asServiceRole.entities.DocumentIntake.update(r.id, {
          contrato_drive_folder_id: null,
          contrato_drive_url: null
        });
        stats.arquivosInvalidos++;
      }
    }
  }

  return { parou: false, cursor: cursor + (registros || []).length, temMais: (registros || []).length === LOTE };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Função de uso interno — disparada por automação agendada ou admin via dashboard

    const body = await req.json().catch(() => ({}));
    const startTime = Date.now();

    // Cursor incremental por categoria
    const cursors = body.cursors || { purchase: 0, report: 0, photo: 0, intake: 0 };

    const stats = {
      verificados: 0,
      renomeados: 0,
      duplicatasDrive: 0,
      duplicatasBanco: 0,
      arquivosInvalidos: 0,
      erros: []
    };

    // Obtém token do Drive
    let accessToken;
    try {
      const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      accessToken = conn.accessToken;
    } catch (err) {
      return Response.json({ error: 'Google Drive não configurado: ' + err.message }, { status: 500 });
    }
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    // Pasta raiz _Duplicatas
    const ROOT_FOLDER_ID = '1aJ5nfpgXcpu6SrDVecmhIQ2eq4vexqe3';
    const agora = new Date();
    const mesAnoLabel = `${MESES_PT[agora.getMonth()]} ${agora.getFullYear()}`;
    let duplicatasFolderId;
    try {
      const rootDupId = await driveGetOrCreateFolder(authHeader, ROOT_FOLDER_ID, '_Duplicatas');
      duplicatasFolderId = await driveGetOrCreateFolder(authHeader, rootDupId, mesAnoLabel);
    } catch (err) {
      stats.erros.push('Erro ao criar pasta _Duplicatas: ' + err.message);
      duplicatasFolderId = ROOT_FOLDER_ID; // fallback
    }

    // Processa cada categoria em sequência
    let pausado = false;
    const novoCursors = { ...cursors };

    // 1. PurchaseRequests
    try {
      const r = await processarPurchaseRequests(base44, authHeader, duplicatasFolderId, cursors.purchase, stats, startTime);
      novoCursors.purchase = r.cursor;
      if (r.parou || !r.temMais) {
        if (!r.temMais) novoCursors.purchase = 0; // reset para próxima execução
      }
      if (r.parou) pausado = true;
    } catch (err) {
      stats.erros.push('PurchaseRequest: ' + err.message);
    }

    // 2. Reports
    if (!pausado) {
      try {
        const r = await processarReports(base44, authHeader, cursors.report, stats, startTime);
        novoCursors.report = r.cursor;
        if (!r.temMais) novoCursors.report = 0;
        if (r.parou) pausado = true;
      } catch (err) {
        stats.erros.push('Report: ' + err.message);
      }
    }

    // 3. ReportPhotos
    if (!pausado) {
      try {
        const r = await processarReportPhotos(base44, authHeader, cursors.photo, stats, startTime);
        novoCursors.photo = r.cursor;
        if (!r.temMais) novoCursors.photo = 0;
        if (r.parou) pausado = true;
      } catch (err) {
        stats.erros.push('ReportPhoto: ' + err.message);
      }
    }

    // 4. DocumentIntakes
    if (!pausado) {
      try {
        const r = await processarDocumentIntakes(base44, authHeader, cursors.intake, stats, startTime);
        novoCursors.intake = r.cursor;
        if (!r.temMais) novoCursors.intake = 0;
        if (r.parou) pausado = true;
      } catch (err) {
        stats.erros.push('DocumentIntake: ' + err.message);
      }
    }

    const duracao = Math.round((Date.now() - startTime) / 1000);

    // Registra BackupLog
    try {
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: 'drive_folders',
        entity_type: 'SYNC_UNIVERSAL',
        status: stats.erros.length > 0 ? (pausado ? 'concluido' : 'concluido') : 'concluido',
        processed_at: new Date().toISOString(),
        total_files: stats.verificados,
        files_copied: stats.renomeados,
        execution_time_ms: duracao * 1000,
        triggered_by: body.triggered_by || 'scheduled',
        details: JSON.stringify({
          verificados: stats.verificados,
          renomeados: stats.renomeados,
          duplicatasDrive: stats.duplicatasDrive,
          duplicatasBanco: stats.duplicatasBanco,
          arquivosInvalidos: stats.arquivosInvalidos,
          pausado,
          cursors: novoCursors,
          erros: stats.erros
        })
      });
    } catch (logErr) {
      console.error('Erro ao salvar BackupLog:', logErr.message);
    }

    return Response.json({
      success: true,
      duracao_segundos: duracao,
      stats,
      pausado,
      cursors: novoCursors,
      mensagem: pausado
        ? `Execução pausada por timeout. Continue com cursors: ${JSON.stringify(novoCursors)}`
        : 'Sincronização universal concluída.'
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});