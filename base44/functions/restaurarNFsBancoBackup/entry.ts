/**
 * restaurarNFsBancoBackup
 *
 * Restauração inversa: parte dos PRs já gravados no banco (nf_emitente_cpf_cnpj
 * + nf_numero) e recria seus links para os arquivos XML/PDF na pasta de backup
 * do Google Drive (1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU).
 *
 * Estratégia de baixo custo:
 *   1. Lista recursivamente apenas XMLs (pasta-alvo, pulando subpastas "01-AAAA").
 *   2. Para cada XML: parse determinístico (sem OpenAI) → (cnpj, nf_numero, valor, data_emissao, emissor_nome).
 *   3. Monta chave `cnpj:nf_numero` e busca PR correspondente.
 *   4. Em match: encontra PDF par na mesma subpasta cujo nome contenha "NF <nf_numero>" (não-COMP).
 *   5. Renomeia XML e PDF par (se houver) ao padrão oficial (NF-{nf}_{emissor}_{rubrica}_R${valor}_{AAAA-MM}.ext).
 *   6. Atualiza PR: nf_pdf_url, nota_fiscal_url, drive_backup_nf_pdf_link, drive_backup_nf_xml_link, drive_backup_nf_ok=true, backup_last_synced_at=now.
 *   7. Atualiza DocumentIntake vinculado (se intake_id presente nas PRs).
 *
 * Idempotente: XML já com nome oficial e backup_last_synced_at nas últimas 24h → skip.
 * Sem match → mantém intacto. Budget 90s, lote 200 XMLs/execução.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

const FOLDER_ALVO = '1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MAX_PROFUNDIDADE = 4;
const MAX_XMLS_LIST = 2000;
const MAX_XMLS_PROC = 200;
const BUDGET_MS = 90_000;
const JANELA_24H_MS = 24 * 60 * 60 * 1000;
const COORD_GERAL_EMAILS = ['daniel@periniprojetos.com.br', 'danielperini@periniprojetos.com.br', 'periniprojetos@gmail.com'];

// ── Drive helpers ──────────────────────────────────────────────────────────────
async function drive(token: string, url: string, opts: any = {}) {
  return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
}
async function listFolder(token: string, folderId: string): Promise<any[]> {
  const items: any[] = [];
  let pt: string | null = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=name&fields=files(id,name,mimeType)&pageSize=1000&supportsAllDrives=true`;
    if (pt) url += `&pageToken=${encodeURIComponent(pt)}`;
    const r = await drive(token, url);
    if (!r.ok) break;
    const d = await r.json();
    if (Array.isArray(d.files)) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}
async function renameFile(token: string, fileId: string, newName: string): Promise<any> {
  const r = await drive(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name&supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  if (!r.ok) throw new Error(`Rename ${r.status}: ${(await r.text().catch(() => r.statusText)).slice(0, 120)}`);
  return await r.json();
}
async function getWebViewLink(token: string, fileId: string): Promise<string> {
  const r = await drive(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink&supportsAllDrives=true`);
  if (!r.ok) return `https://drive.google.com/file/d/${fileId}/view`;
  const d = await r.json().catch(() => ({}));
  return d?.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;
}
async function downloadBytes(token: string, fileId: string): Promise<Uint8Array> {
  const r = await drive(token, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`);
  if (!r.ok) throw new Error(`Download ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

// ── XML determinístico ─────────────────────────────────────────────────────────
function parseXmlNF(xml: string) {
  const emitBlock = xml.match(/<emit>[\s\S]*?<\/emit>/i);
  const block = emitBlock ? emitBlock[0] : xml;
  const mCnpj = block.match(/<CNPJ[^>]*>(\d{8,14})<\/CNPJ>/i);
  const emitCnpj = mCnpj ? mCnpj[1] : null;
  // NFS-e usa <nNFSe> (mixed case) — case-insensitive + inclui variantes
  const mNf = xml.match(/<nNFS[eE][^>]*>(\d+)<\/nNFS[eE][^>]*>/i)
    || xml.match(/<nNF[^>]*>(\d+)<\/nNF[^>]*>/i)
    || xml.match(/<NumeroNf[^>]*>(\d+)<\/NumeroNf[^>]*>/i)
    || xml.match(/<numeroNf[^>]*>(\d+)<\/numeroNf[^>]*>/i)
    || xml.match(/<nNfse[^>]*>(\d+)<\/nNfse[^>]*>/i)
    || xml.match(/<NumeroNFS[^>]*>(\d+)<\/NumeroNFS[^>]*>/i)
    || xml.match(/<Numero[^>]*>(\d+)<\/Numero[^>]*>/i);
  const nfNumero = mNf ? mNf[1].replace(/^0+/, '') : null;
  // Valor: vNF (NF-e comum) ou vLiq (NFS-e SPED)
  const mValor = xml.match(/<vNF[^>]*>([\d.,]+)<\/vNF>/i) || xml.match(/<vLiq[^>]*>([\d.,]+)<\/vLiq>/i) || xml.match(/<vServ[^>]*>([\d.,]+)<\/vServ>/i);
  const valor = mValor ? Number(mValor[1].replace(/\./g, '').replace(',', '.')) : null;
  const mDt = xml.match(/<dhEmi[^>]*>(\d{4})-(\d{2})-(\d{2})/) || xml.match(/<dEmi[^>]*>(\d{4})-(\d{2})-(\d{2})/) || xml.match(/<dCompet[^>]*>(\d{4})-(\d{2})-(\d{2})/);
  const data = mDt ? `${mDt[1]}-${mDt[2]}-${mDt[3]}` : null;
  const mNome = block.match(/<xNome[^>]*>([\s\S]*?)<\/xNome>/i);
  const nome = mNome ? mNome[1].trim() : null;
  return { emitCnpj, nfNumero, valor, data, nome };
}

// ── Normalização ──────────────────────────────────────────────────────────────
function normalizarNfNumero(raw: any): string {
  return String(raw || '').replace(/[^0-9A-Za-z]/g, '').replace(/^0+/, '').toLowerCase();
}
function normalizarCnpj(raw: any): string {
  return String(raw || '').replace(/[^0-9]/g, '');
}
function slugifyEmissor(s: any): string {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 12);
}
function nomeEsperado(pr: any, rubMap: Map<string, any>, ext: string): string {
  const nf = String(pr.nf_numero || '').replace(/^0+/, '').replace(/[^0-9A-Za-z]/g, '') || 'semNf';
  const emissor = slugifyEmissor(pr.nf_emitente_nome) || 'semEmissor';
  const r = pr.rubrica_id ? rubMap.get(String(pr.rubrica_id)) : null;
  const rubRaw = (r && (r.natureza_despesa || r.codigo)) || pr.natureza_despesa || pr.cod || 'semRubrica';
  const rub = String(rubRaw).replace(/[^0-9A-Za-z]/g, '').slice(0, 12) || 'semRubrica';
  const valor = Math.round(Number(pr.nf_valor_total) || 0);
  const anoMes = String(pr.nf_data_emissao || '').slice(0, 7) || 'semData';
  return `NF-${nf}_${emissor}_${rub}_R$${valor}_${anoMes}.${ext}`;
}
function pularMesJaneiro(nome: string): boolean {
  return /^01-\d{4}$/i.test(String(nome || '').trim());
}
// Procura um PDF na mesma subpasta cujo nome contenha "NF <nf_numero>"
// e que não seja comprovante (COMP). Prefere o que parecer conter o slug do emissor.
function findPdfPair(folderPdfs: any[], nfNumero: string, emissorSlug: string): any | null {
  if (!nfNumero) return null;
  const nfRegex = new RegExp(`NF\\s*${nfNumero}(\\D|$)`, 'i');
  const semComp = (folderPdfs || []).filter((p) => !/COMP/i.test(p.name || ''));
  const comNf = semComp.filter((p) => nfRegex.test(p.name || ''));
  if (comNf.length === 0) return null;
  if (emissorSlug && emissorSlug.length >= 4) {
    const sLow = emissorSlug.slice(0, 6).toLowerCase();
    const bySlug = comNf.filter((p) => String(p.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().includes(sLow));
    if (bySlug.length > 0) return bySlug[0];
  }
  return comNf[0];
}

// ── Handler ───────────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const start = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin' && !COORD_GERAL_EMAILS.includes(String(user.email || '').toLowerCase())) {
      return Response.json({ error: 'Forbidden — apenas administradores / coordenadores gerais' }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const folderId = String(body.folderId || FOLDER_ALVO);
    const dryRun = body.dryRun === true;
    const limite = Math.min(Number(body.limite || MAX_XMLS_PROC), 300);

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');

    // Pré-carrega PRs (status útil, ambos campos preenchidos) — indexa por chave cnpj:nf_numero
    const prs: any[] = await base44.asServiceRole.entities.PurchaseRequest
      .filter({ status: { $nin: ['CANCELADO', 'RASCUNHO'] } }, '-updated_date', 500)
      .catch(() => []);
    const prPorChave = new Map<string, any[]>();
    for (const p of prs) {
      if (!p.nf_numero || !p.nf_emitente_cpf_cnpj) continue;
      const k = `${normalizarCnpj(p.nf_emitente_cpf_cnpj)}:${normalizarNfNumero(p.nf_numero)}`;
      if (!prPorChave.has(k)) prPorChave.set(k, []);
      prPorChave.get(k)!.push(p);
    }

    const rubMap = new Map<string, any>();
    const rubs: any = await base44.asServiceRole.entities.Rubrica.list('-updated_date', 500).catch(() => []);
    for (const r of Array.isArray(rubs) ? rubs : []) {
      if (r?.id) rubMap.set(String(r.id), r);
    }

    // Walk única recolhendo XMLs (para parse) e PDFs por subpasta (para pareamento)
    const xmlsColetados: { file: any; folder_id: string }[] = [];
    const pdfsPorPasta = new Map<string, any[]>();
    const vistos = new Set<string>([folderId]);
    async function walk(fid: string, depth: number) {
      if (depth > MAX_PROFUNDIDADE || xmlsColetados.length >= MAX_XMLS_LIST) return;
      const items = await listFolder(accessToken, fid);
      if (!pdfsPorPasta.has(fid)) pdfsPorPasta.set(fid, []);
      for (const it of items) {
        if (it.mimeType === FOLDER_MIME) {
          if (depth < MAX_PROFUNDIDADE && !vistos.has(it.id) && !pularMesJaneiro(it.name)) {
            vistos.add(it.id);
            await walk(it.id, depth + 1);
            if (xmlsColetados.length >= MAX_XMLS_LIST) return;
          }
          continue;
        }
        const n = (it.name || '').toLowerCase();
        if (n.endsWith('.xml')) {
          xmlsColetados.push({ file: it, folder_id: fid });
        } else if (n.endsWith('.pdf')) {
          pdfsPorPasta.get(fid)!.push(it);
        }
      }
    }
    await walk(folderId, 0);

    const stats: any = {
      xmls_coletados: xmlsColetados.length,
      processados: 0,
      vinculados: 0,
      renomeados_xml: 0,
      renomeados_pdf: 0,
      ja_corretos: 0,
      sem_vinculo: 0,
      erros: 0,
      has_more: false,
      dry_run: dryRun,
    };
    const linhas: any[] = [];
    const agora = Date.now();

    for (const { file: f, folder_id } of xmlsColetados) {
      if (Date.now() - start >= BUDGET_MS) { stats.has_more = true; break; }
      if (stats.processados >= limite) { stats.has_more = true; break; }
      stats.processados++;
      const linha: any = { id: f.id, nome: f.name, status: 'skip' };
      try {
        const bytes = await downloadBytes(accessToken, f.id);
        const xml = new TextDecoder('utf-8').decode(bytes);
        const dados = parseXmlNF(xml);
        const cnpj = dados.emitCnpj ? normalizarCnpj(dados.emitCnpj) : null;
        const nf = dados.nfNumero ? String(dados.nfNumero).replace(/^0+/, '') : null;
        linha.emit_cnpj = cnpj;
        linha.nf_numero = nf;
        if (!cnpj || !nf) { stats.sem_vinculo++; linhas.push({ ...linha, status: 'sem_vinculo' }); continue; }

        const chave = `${cnpj}:${normalizarNfNumero(nf)}`;
        const matches = prPorChave.get(chave) || [];
        if (!matches.length) { stats.sem_vinculo++; linhas.push({ ...linha, status: 'sem_vinculo', chave }); continue; }
        linha.matches = matches.length;

        const umPr = matches[0];
        const sincTs = umPr.backup_last_synced_at ? new Date(umPr.backup_last_synced_at).getTime() : 0;
        const dentro24h = !!sincTs && (agora - sincTs) < JANELA_24H_MS;
        const xmlNomeEsp = nomeEsperado(umPr, rubMap, 'xml');
        const pdfPastaArr = pdfsPorPasta.get(folder_id) || [];
        const emissorSlug = slugifyEmissor(dados.nome || umPr.nf_emitente_nome);
        const pdfPair = findPdfPair(pdfPastaArr, nf, emissorSlug);
        const pdfNomeEsp = pdfPair ? nomeEsperado(umPr, rubMap, 'pdf') : null;
        const xmlJaOk = f.name === xmlNomeEsp;
        const pdfJaOk = pdfPair ? pdfPair.name === pdfNomeEsp : true;

        if (xmlJaOk && pdfJaOk && dentro24h) {
          stats.ja_corretos++;
          linhas.push({ ...linha, status: 'ja_correto', xml_nome_esperado: xmlNomeEsp, pdf_par_id: pdfPair?.id });
          continue;
        }

        if (!dryRun) {
          if (!xmlJaOk) {
            try { await renameFile(accessToken, f.id, xmlNomeEsp); stats.renomeados_xml++; }
            catch (e: any) { /* segue mesmo se rename falhar */ }
          }
          if (pdfPair && !pdfJaOk) {
            try { await renameFile(accessToken, pdfPair.id, pdfNomeEsp!); stats.renomeados_pdf++; }
            catch (e: any) { /* segue mesmo */ }
          }
          const xmlUrl = await getWebViewLink(accessToken, f.id);
          const pdfUrl = pdfPair ? await getWebViewLink(accessToken, pdfPair.id) : null;
          const updatePr: any = {
            drive_backup_nf_xml_link: xmlUrl,
            drive_backup_nf_ok: true,
            backup_last_synced_at: new Date().toISOString(),
          };
          if (pdfUrl) {
            updatePr.nf_pdf_url = pdfUrl;
            updatePr.nota_fiscal_url = pdfUrl;
            updatePr.drive_backup_nf_pdf_link = pdfUrl;
          }
          const bulk = matches.map((p) => ({ id: p.id, ...updatePr }));
          for (let i = 0; i < bulk.length; i += 100) {
            await base44.asServiceRole.entities.PurchaseRequest.bulkUpdate(bulk.slice(i, i + 100)).catch(() => {});
          }
          stats.vinculados += matches.length;

          const intakes = new Set<string>();
          for (const p of matches) {
            if (p.intake_id) intakes.add(String(p.intake_id));
          }
          for (const iid of intakes) {
            const u: any = { nf_xml_url: xmlUrl, arquivo_original_url: xmlUrl };
            if (pdfUrl) u.nf_pdf_url = pdfUrl;
            await base44.asServiceRole.entities.DocumentIntake.update(iid, u).catch(() => {});
          }
          linha.xml_url = xmlUrl;
          linha.pdf_url = pdfUrl;
          linha.pdf_par_id = pdfPair?.id;
          linha.novo_nome_xml = !xmlJaOk ? xmlNomeEsp : undefined;
          linha.novo_nome_pdf = (pdfPair && !pdfJaOk) ? pdfNomeEsp : undefined;
        } else {
          linha.novo_nome_xml = !xmlJaOk ? xmlNomeEsp : undefined;
          linha.novo_nome_pdf = (pdfPair && !pdfJaOk) ? pdfNomeEsp : undefined;
          linha.pdf_par_id = pdfPair?.id;
          stats.vinculados += matches.length;
        }
        linha.status = dryRun ? 'simulado' : (xmlJaOk && pdfJaOk ? 'vinculado_sem_rename' : 'renomeado_vinculado');
        linhas.push(linha);
      } catch (e: any) {
        stats.erros++;
        linhas.push({ ...linha, status: 'erro', erro: e.message });
      }
    }

    await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'drive_nf_sync_mensal',
      entity_type: 'restaurarNFsBancoBackup',
      status: stats.erros > 0 ? 'concluido' : 'success',
      total_files: stats.processados,
      files_copied: stats.vinculados,
      details: `XML pass | processados ${stats.processados}/${xmlsColetados.length} | vinculados ${stats.vinculados} | renomeados_xml ${stats.renomeados_xml} | renomeados_pdf ${stats.renomeados_pdf} | ja_corretos ${stats.ja_corretos} | sem_vinculo ${stats.sem_vinculo} | erros ${stats.erros} | has_more ${stats.has_more}${dryRun ? ' | DRY-RUN' : ''}`,
      triggered_by: 'scheduled',
      processed_at: new Date().toISOString(),
      execution_time_ms: Date.now() - start,
    }).catch(() => {});

    return Response.json({ ok: true, folder_id: folderId, stats, amostra: linhas.slice(0, 25) });
  } catch (e: any) {
    return Response.json({ error: e?.message || 'erro', stack: e?.stack }, { status: 500 });
  }
});