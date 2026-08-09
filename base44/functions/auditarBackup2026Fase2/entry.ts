// Auditoria Fase 2 — Varredura completa do Backup 2026 em lotes
// XMLs → parse determinístico de <dhEmi>/<dEmi> (sem LLM)
// PDFs → OpenAI GPT-4o (Files API + chat completions com input file)
// Arquivos sem data confiável → movidos para subpasta _REVISAO_DOCUMENTAL
// Arquivos com mês correto → marcados como "ok" (sem ação)
// Arquivos com data divergente + confiança >= 80% → movidos para a pasta do mês correto
// Estado persistido via Drive appProperties (AUDITORIA_FASE2_STATUS) — idempotente entre runs
// Pensado para rodar em automação agendada (a cada 5-10 min) para evitar timeout do backend

import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const PARENT_BACKUP_2026 = '1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU';
const PASTA_REVISAO_NAME = '_REVISAO_DOCUMENTAL';
const HARDCODED_MONTHS: Record<string, string> = {
  '12-2025': '1H-T2_rqFgNnY7jTjlm5wItq4yfLNFNtb',
};

// IDs dos 7 duplicados XML presos em 01-2026 (403 insuff. permissions — limpeza manual)
const DUPLICADOS_MANUAIS_2025 = [
  '12usSGIUV5GARGygB6WiOqokVdJncJeaw',
  '1wBx73R3ydSKfKzrdfYzAsJVm3G0dkWCr',
  '16b7Hw95eejP2bMOyv0DtQuPFqh2P2IDy',
  '1YgWpTjDDrZsrfIctp_BWCYzGkVa18ke8',
  '15gCeeZaRYxrWVJ3R5juQ1A9MCP1mVFc3',
  '1w88WA5q6ks-Por637aE-FtGWrecHf9QP',
  '1iiuenc4TAi1tP9N_zquO4_0vEAGdNhL-',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const svc = base44.asServiceRole;

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const batchSize = Math.max(1, Math.min(Number((body as any).batch_size || 10), 25));
    const maxPdfPerRun = Math.min(Number((body as any).max_pdfs || 3), 5);
    const dryRun = (body as any).dryRun === true || false;
    const forceFolder = (body as any).forceFolder || null; // ex.: '06-2026' ou '12-2025'

    // Token Drive
    const conn = await svc.connectors.getConnection('googledrive');
    const dtoken = (conn as any)?.accessToken || (conn as any)?.access_token || (conn as any)?.token;

    // Descobre pastas mensais no backup root
    const monthToId = await discoverMonthlyFolders(dtoken);

    // Cria/obtém pasta _REVISAO_DOCUMENTAL dentro do parent
    let pastaRevisaoId: string | null = null;
    if (!dryRun) {
      pastaRevisaoId = await getOrCreatePastaRevisao(dtoken, PARENT_BACKUP_2026, PASTA_REVISAO_NAME);
    }

    // Coleta arquivos pendentes em todas as pastas (ou apenas força uma)
    const collected: any[] = [];
    for (const [month, fid] of Object.entries(monthToId)) {
      if (forceFolder && month !== forceFolder) continue;
      const files = await collectFilesPendingInMonth(dtoken, fid as string, month);
      collected.push(...files);
      if (collected.length >= batchSize * 4 + maxPdfPerRun * 2) break;
    }

    const xmlList = collected.filter((f) => /\.xml$/i.test(f.name));
    const pdfList = collected.filter((f) => /\.pdf$/i.test(f.name));

    // XMLs são determinísticos e rápidos — processa até batchSize. PDFs custam caro (GPT-4o) — limita maxPdfPerRun.
    const xmlBatch = xmlList.slice(0, batchSize);
    const pdfBatch = pdfList.slice(0, Math.max(0, batchSize - xmlBatch.length) > 0 ? Math.max(0, batchSize - xmlBatch.length) : maxPdfPerRun);
    const batch = [...xmlBatch, ...pdfBatch];

    const stats = {
      processados: 0,
      movidos: 0,
      ja_ok: 0,
      revisao: 0,
      erros: 0,
      por_tipo: { xml: 0, pdf: 0 },
      movimentos: [] as string[],
      erros_lista: [] as string[],
      pendentes_restantes: 0,
    };

    for (const file of batch) {
      try {
        const result = await auditFile(dtoken, file, pastaRevisaoId, monthToId, dryRun);
        stats.processados++;
        stats[result.status as 'movidos' | 'ja_ok' | 'revisao' | 'erros'] = (stats as any)[result.status] + 1;
        stats.por_tipo[result.tipo as 'xml' | 'pdf'] = (stats.por_tipo as any)[result.tipo] + 1;
        if (result.action && result.action !== 'NENHUM') {
          stats.movimentos.push(`${file.logical_month_label}/${file.name} → ${result.action} (data=${result.actualDate} conf=${result.confidence})`);
        }
        if (result.error) stats.erros_lista.push(`${file.name}: ${result.error}`);
      } catch (e: any) {
        stats.processados++;
        stats.erros++;
        stats.erros_lista.push(`${file.name}: ${e?.message || String(e)}`);
      }
    }
    stats.pendentes_restantes = Math.max(0, collected.length - batch.length);

    // Checa duplicados manuais restantes (permissão 403) — apenas reporta
    let duplicadosManuaisStatus: any = null;
    try {
      const stillStuck: string[] = [];
      for (const did of DUPLICADOS_MANUAIS_2025) {
        const r = await fetch(`https://www.googleapis.com/drive/v3/files/${did}?fields=id,name,trashed&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${dtoken}` } });
        if (r.status === 404 || (r.ok && (await r.json()).trashed)) {
          // já removido pelo usuário
        } else if (r.ok) {
          stillStuck.push(did);
        }
      }
      duplicadosManuaisStatus = { total_lista: DUPLICADOS_MANUAIS_2025.length, ainda_presentes: stillStuck.length, ids_faltam: stillStuck };
    } catch (e) {
      duplicadosManuaisStatus = { erro: 'falhou ao verificar' };
    }

    // BackupLog
    try {
      await svc.entities.BackupLog.create({
        backup_type: 'auditoria_entrada_unica',
        entity_type: 'AUDITORIA_BACKUP_2026_FASE2_SWEEP',
        status: 'concluido',
        details: `Fase2 Sweep batch — Processados: ${stats.processados} (XML:${stats.por_tipo.xml} PDF:${stats.por_tipo.pdf}), Movidos: ${stats.movidos}, Já-OK: ${stats.ja_ok}, Revisão: ${stats.revisao}, Erros: ${stats.erros}, Restantes: ${stats.pendentes_restantes}, Dup-manuais pendentes: ${duplicadosManuaisStatus?.ainda_presentes ?? '?'}/${DUPLICADOS_MANUAIS_2025.length}${dryRun ? ' [DRY-RUN]' : ''}`,
        total_files: stats.processados,
        files_copied: stats.movidos,
        triggered_by: dryRun ? 'manual' : 'scheduled',
        error_message: stats.erros_lista.slice(0, 3).join(' | ') || null,
      });
    } catch (e) {
      console.warn('BackupLog create falhou:', (e as any)?.message);
    }

    return Response.json({
      ok: true,
      dryRun,
      stats,
      monthToId,
      duplicados_manuais_status: duplicadosManuaisStatus,
    });
  } catch (error: any) {
    console.error('auditarBackup2026Fase2 error:', error);
    return Response.json({ error: error?.message || String(error), stack: error?.stack }, { status: 500 });
  }
});

// -------------------------------- -------- -------------------------------
async function discoverMonthlyFolders(dtoken: string): Promise<Record<string, string>> {
  const all: Record<string, string> = { ...HARDCODED_MONTHS };
  let pt: string | null = null;
  do {
    let u = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${PARENT_BACKUP_2026}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder'`)}&fields=files(id,name),nextPageToken&pageSize=200&supportsAllDrives=true`;
    if (pt) u += `&pageToken=${pt}`;
    const r = await fetch(u, { headers: { Authorization: `Bearer ${dtoken}` } });
    if (!r.ok) break;
    const data = await r.json();
    for (const f of (data.files || [])) {
      const m = /^(\d{2}-\d{4})$/.exec(f.name);
      if (m) all[m[1]] = f.id;
    }
    pt = data.nextPageToken || null;
  } while (pt);
  return all;
}

async function listChildren(dtoken: string, parentFolderId: string): Promise<any[]> {
  const all: any[] = [];
  let pt: string | null = null;
  do {
    let u = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${parentFolderId}' in parents and trashed=false`)}&fields=files(id,name,mimeType,appProperties),nextPageToken&pageSize=200&supportsAllDrives=true`;
    if (pt) u += `&pageToken=${pt}`;
    const r = await fetch(u, { headers: { Authorization: `Bearer ${dtoken}` } });
    if (!r.ok) return all;
    const data = await r.json();
    for (const f of (data.files || [])) all.push(f);
    pt = data.nextPageToken || null;
  } while (pt);
  return all;
}

async function collectFilesPendingInMonth(dtoken: string, fid: string, monthLabel: string): Promise<any[]> {
  const targetYM = monthKeyToYYYYMM(monthLabel);
  const collected: any[] = [];
  const items = await listChildren(dtoken, fid);
  for (const item of items) {
    // Ignora pastas especiais
    if (item.name.startsWith('_') || item.name.startsWith('.')) continue;

    if (item.mimeType === 'application/vnd.google-apps.folder') {
      // Subpasta (ex.: "Pasta sem nome" dentro de 06-2026) — lista arquivos e marca mês lógico
      const subItems = await listChildren(dtoken, item.id);
      for (const sub of subItems) {
        if (sub.mimeType === 'application/vnd.google-apps.folder') continue;
        if (!/\.(xml|pdf)$/i.test(sub.name)) continue;
        if (isAlreadyAudited(sub)) continue;
        collected.push({
          id: sub.id, name: sub.name, mime: sub.mimeType,
          parent_id: item.id, logical_month: targetYM, logical_month_label: monthLabel,
        });
      }
    } else {
      if (!/\.(xml|pdf)$/i.test(item.name)) continue;
      if (isAlreadyAudited(item)) continue;
      collected.push({
        id: item.id, name: item.name, mime: item.mimeType,
        parent_id: fid, logical_month: targetYM, logical_month_label: monthLabel,
      });
    }
  }
  return collected;
}

function isAlreadyAudited(item: any): boolean {
  const s = item?.appProperties?.AUDITORIA_FASE2_STATUS;
  return s === 'ja_ok' || s === 'movidos' || s === 'movido' || s === 'revisao' || s === 'ok';
}

function monthKeyToYYYYMM(label: string): string {
  // '05-2026' → '2026-05', '12-2025' → '2025-12'
  const parts = label.split('-');
  if (parts.length !== 2) return '';
  return `${parts[1]}-${parts[0]}`;
}

async function auditFile(dtoken: string, file: any, pastaRevisaoId: string | null, monthToId: Record<string, string>, dryRun: boolean) {
  const isXml = /\.xml$/i.test(file.name);
  const isPdf = /\.pdf$/i.test(file.name);
  if (!isXml && !isPdf) return { status: 'erros', tipo: 'outro', action: 'NENHUM', error: 'não suportado', actualDate: null, confidence: 0 };

  let actualDate: string | null = null;
  let confidence = 0;
  let evidence = '';
  let erro: string | null = null;

  if (isXml) {
    try {
      const buf = await downloadFile(dtoken, file.id);
      const txt = new TextDecoder('utf-8').decode(buf);
      const m = txt.match(/<dhEmi>([^<]+)<\/dhEmi>/i) || txt.match(/<dEmi>([^<]+)<\/dEmi>/i);
      if (m) {
        actualDate = String(m[1]).substring(0, 10);
        confidence = 100;
        evidence = 'XML <dhEmi>/<dEmi> determinístico';
      } else {
        erro = 'XML sem dhEmi/dEmi detectado';
      }
    } catch (e: any) {
      erro = `Download XML falhou: ${e?.message || e}`;
    }
  } else if (isPdf) {
    try {
      const buf = await downloadFile(dtoken, file.id);
      if (buf.byteLength > 25 * 1024 * 1024) {
        return { status: 'erros', tipo: 'pdf', action: 'NENHUM', error: 'PDF > 25MB', actualDate: null, confidence: 0 };
      }
      const openaiKey = Deno.env.get('OPENAI_API_KEY');
      if (!openaiKey) {
        erro = 'OPENAI_API_KEY ausente';
      } else {
        const oaiId = await uploadToOpenAI(openaiKey, buf, file.name);
        const result = await askGPT4oForDate(openaiKey, oaiId, file.name);
        actualDate = result?.data_emissao_iso || null;
        confidence = Math.round(Number(result?.confianca || 0));
        evidence = `${result?.campo_usado || ''} (${confidence}%) · ${result?.data_emissao_verbatim || ''}`;
        if (!actualDate) erro = 'GPT-4o não conseguiu identificar data de emissão';
      }
    } catch (e: any) {
      erro = `OCR GPT-4o falhou: ${e?.message || e}`;
    }
  }

  if (erro) return { status: 'erros', tipo: isXml ? 'xml' : 'pdf', action: 'NENHUM', error: erro, actualDate: null, confidence };

  const actualMonth = actualDate ? actualDate.substring(0, 7) : null;
  const logicalMonth = file.logical_month;

  let status = 'ok';
  let action = 'NENHUM';

  if (actualMonth === logicalMonth) {
    status = 'ja_ok'; action = 'NENHUM';
  } else if (actualMonth && confidence >= 80) {
    status = 'movidos'; action = 'MOVER';
  } else if (actualMonth && confidence < 80) {
    status = 'revisao'; action = 'REVISAO';
  } else if (!actualDate) {
    status = 'revisao'; action = 'REVISAO';
  }

  if (dryRun) {
    return { status, tipo: isXml ? 'xml' : 'pdf', action, actualDate, confidence, evidence, error: null };
  }

  const result: any = { status, tipo: isXml ? 'xml' : 'pdf', action, actualDate, confidence, evidence, error: null };

  if (status === 'movidos' && actualDate) {
    const monthLabel = `${actualMonth!.substring(5, 7)}-${actualMonth!.substring(0, 4)}`;
    const dstId = monthToId[monthLabel];
    if (dstId) {
      const moved = await moveDriveFile(dtoken, file.id, dstId, file.parent_id);
      if (!moved.ok) {
        result.status = 'erros';
        result.action = 'ERRO_MOVER';
        result.error = `Move falhou: ${moved.body}`;
      }
    } else {
      result.status = 'erros';
      result.action = 'DESTINO_DESCONHECIDO';
      result.error = `Mês-alvo "${monthLabel}" não tem pasta conhecida`;
    }
  } else if (status === 'revisao' && pastaRevisaoId) {
    const moved = await moveDriveFile(dtoken, file.id, pastaRevisaoId, file.parent_id);
    if (!moved.ok) {
      result.error = `Move para revisão falhou: ${moved.body}`;
    }
  }

  // Marca appProperties (idempotente entre runs)
  await markAudited(dtoken, file.id, {
    AUDITORIA_FASE2_STATUS: result.status,
    AUDITORIA_FASE2_DATA: actualDate || 'SEM_DATA',
    AUDITORIA_FASE2_CONFIANCA: String(confidence),
    AUDITORIA_FASE2_PASTA_ORIG: file.logical_month_label,
    AUDITORIA_FASE2_PASTA_FINAL: status === 'movidos' && actualDate ? `${actualDate!.substring(5, 7)}-${actualDate!.substring(0, 4)}` : (status === 'revisao' ? '_REVISAO_DOCUMENTAL' : file.logical_month_label),
    AUDITORIA_FASE2_PROCESSED_AT: new Date().toISOString(),
    AUDITORIA_FASE2_ACTION: result.action || 'NENHUM',
  });

  return result;
}

async function downloadFile(dtoken: string, fileId: string): Promise<Uint8Array> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${dtoken}` } });
  if (!r.ok) throw new Error(`Download ${fileId} falhou: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

async function uploadToOpenAI(apiKey: string, buf: Uint8Array, filename: string): Promise<string> {
  const fd = new FormData();
  fd.append('purpose', 'user_data');
  fd.append('file', new Blob([buf as any], { type: 'application/pdf' }), filename || 'nf.pdf');
  const r = await fetch('https://api.openai.com/v1/files', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: fd });
  if (!r.ok) throw new Error(`OpenAI upload ${r.status}: ${(await r.text()).substring(0, 120)}`);
  const data = await r.json();
  if (!data?.id) throw new Error('Upload Files API não retornou id');
  return data.id as string;
}

async function askGPT4oForDate(apiKey: string, oaiId: string, filename: string): Promise<any> {
  const body = {
    model: 'gpt-4o',
    messages: [
      { role: 'system', content: 'Você é especialista em extrair a DATA DE EMISSÃO de documentos fiscais brasileiros (NF-e, NFS-e, DANFE, recibo, conta de energia). Identifique o campo rotulado "Data de Emissão", "Emissão", "Emitida em" ou similar. NÃO use data de vencimento, de competência mensal, ou de pagamento. Responda APENAS com JSON válido.' },
      {
        role: 'user', content: [
          { type: 'text', text: `Leia o documento em PDF anexo (${filename}). Extraia o mais fielmente possível a data de emissão fiscal. Retorne JSON exato: {"data_emissao_iso": "YYYY-MM-DD ou null", "data_emissao_verbatim": "texto como no documento", "campo_usado": "rótulo usado", "confianca": 0-100, "preocupacao": "qualquer nota"}` },
          { type: 'file', file: { file_id: oaiId } },
        ],
      },
    ],
    response_format: { type: 'json_object' },
    temperature: 0,
  };
  const r = await fetch('https://api.openai.com/v1/chat/completions', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`OpenAI chat ${r.status}: ${(await r.text()).substring(0, 200)}`);
  const j: any = await r.json();
  const content = j.choices?.[0]?.message?.content || '{}';
  try { return JSON.parse(content); } catch { return { data_emissao_iso: null, confianca: 0 }; }
}

async function moveDriveFile(dtoken: string, fileId: string, dstParent: string, srcParent: string): Promise<{ ok: boolean; status: number; body: string }> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${dstParent}&removeParents=${srcParent}&fields=id&supportsAllDrives=true`, { method: 'PATCH', headers: { Authorization: `Bearer ${dtoken}`, 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
  return { ok: r.ok, status: r.status, body: r.ok ? '' : (await r.text()).substring(0, 200) };
}

async function markAudited(dtoken: string, fileId: string, props: Record<string, string>): Promise<boolean> {
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,appProperties&supportsAllDrives=true`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${dtoken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ appProperties: props }),
    });
    return r.ok;
  } catch {
    return false;
  }
}

async function getOrCreatePastaRevisao(dtoken: string, parent: string, name: string): Promise<string | null> {
  try {
    const u = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(`'${parent}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and name='${name}'`)}&fields=files(id,name)&supportsAllDrives=true`;
    const r = await fetch(u, { headers: { Authorization: `Bearer ${dtoken}` } });
    const data: any = await r.json();
    if (data.files?.[0]?.id) return data.files[0].id as string;
    const create = await fetch(`https://www.googleapis.com/drive/v3/files?fields=id&supportsAllDrives=true`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${dtoken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }),
    });
    const cdata: any = await create.json();
    return cdata?.id || null;
  } catch {
    return null;
  }
}