import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Readable } from 'node:stream';
import pg from 'pg';
import PDFDocument from 'pdfkit';
import { google } from 'googleapis';

// One PDF and one restorable JSON snapshot per monthly report from February
// 2026 onward. Re-running updates the same Drive objects; photo shortcuts point
// to canonical image backups and never duplicate the image bytes.
const apply = process.argv.includes('--apply');
const reportId = process.argv.find(arg => arg.startsWith('--report-id='))?.slice(12) || '';
const rootId = process.env.GOOGLE_DRIVE_FOLDER_ID || '1qVwpSypPHyQ_IK_H2yTho46MVCzj0FrU';
const uploadDir = process.env.UPLOAD_DIR || '/app/uploads';
const pool = new pg.Pool({
  host: process.env.DB_HOST || 'db', port: Number(process.env.DB_PORT || 5432),
  database: process.env.POSTGRES_DB || 'appgestor', user: process.env.POSTGRES_USER || 'appgestor',
  password: process.env.POSTGRES_PASSWORD || '',
});
const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const clean = value => String(value ?? '').replace(/[\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim();
const filePart = value => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 -]+/g, '').replace(/\s+/g, ' ').trim().replace(/ /g, '_').slice(0, 80) || 'SEM_NOME';
const monthIndex = value => {
  const normalized = filePart(value).toLowerCase();
  const index = monthNames.findIndex(name => filePart(name).toLowerCase() === normalized);
  return index >= 0 ? index + 1 : Number(value) || 0;
};
function periodKey(report) {
  const year = Number(report.ano);
  const normalized = filePart(report.mes_referencia).toLowerCase();
  if (!Number.isInteger(year) || year < 2026 || year > 2100) return '';
  if (normalized.includes('maio') && normalized.includes('junho')) return `${year}-05-06`;
  const month = monthIndex(report.mes_referencia);
  return Number.isInteger(month) && month >= 1 && month <= 12 ? `${year}-${String(month).padStart(2,'0')}` : '';
}
const driveEsc = value => String(value).replace(/'/g, "\\'");
const sha256 = buffer => crypto.createHash('sha256').update(buffer).digest('hex');

async function ensureFolder(drive, parent, name) {
  const q = `'${parent}' in parents and name='${driveEsc(name)}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const found = await drive.files.list({ q, fields: 'files(id,name),nextPageToken', pageSize: 100, supportsAllDrives: true, includeItemsFromAllDrives: true });
  if (found.data.files?.length > 1) throw new Error(`Pastas duplicadas: ${name}`);
  if (found.data.files?.[0]) return found.data.files[0].id;
  return (await drive.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] }, fields: 'id', supportsAllDrives: true })).data.id;
}

async function listFolder(drive, parent) {
  const files = [];
  let pageToken;
  do {
    const result = await drive.files.list({
      q: `'${parent}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,mimeType,appProperties,webViewLink)',
      pageSize: 1000, pageToken, supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    files.push(...(result.data.files || []));
    pageToken = result.data.nextPageToken;
  } while (pageToken);
  return files;
}

function addLabeledText(doc, label, value) {
  const text = clean(value);
  if (!text) return;
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#142234').text(label, { continued: false });
  doc.font('Helvetica').fontSize(10).fillColor('#242424').text(text, { paragraphGap: 8 });
}

async function photoBytes(drive, photo) {
  for (const candidate of [photo.local_path, photo.file_url]) {
    if (!candidate) continue;
    const local = String(candidate).match(/\/api\/files\/([^/?#]+)/i)?.[1];
    const resolved = local ? path.join(uploadDir, path.basename(decodeURIComponent(local))) : path.resolve(String(candidate));
    if (resolved.startsWith(uploadDir) && fs.existsSync(resolved)) return fs.promises.readFile(resolved);
  }
  if (photo.drive_file_id) {
    const response = await drive.files.get({ fileId: photo.drive_file_id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
    return Buffer.from(response.data);
  }
  return null;
}

async function renderReport(drive, report, activities, photos, photoFolderId) {
  const chunks = [];
  const doc = new PDFDocument({ size: 'A4', margin: 48, compress: true, info: { Title: `Relatório Mensal Aprovado - ${report.author_name} - ${report.mes_referencia}/${report.ano}`, Author: 'Museus Centro' } });
  doc.on('data', chunk => chunks.push(chunk));
  const done = new Promise((resolve, reject) => { doc.on('end', resolve); doc.on('error', reject); });
  doc.font('Helvetica-Bold').fontSize(19).fillColor('#142234').text('MUSEUS CENTRO');
  doc.fontSize(15).text(`Relatório Mensal - ${clean(report.status)}`);
  doc.moveDown(0.5).font('Helvetica').fontSize(9).fillColor('#666').text(`ID canônico: ${report.id}  |  Protocolo: ${clean(report.numero_protocolo) || '-'}  |  Gerado em: ${new Date().toISOString().slice(0,10)}`);
  doc.moveDown(1);
  for (const [label, value] of [
    ['Profissional', report.author_name], ['E-mail do autor', report.author_email || report.created_by],
    ['Função', report.funcao || report.author_role], ['Equipe', report.equipe],
    ['Museu', report.museu], ['Museu secundário', report.museu_secundario],
    ['Mês de referência', `${report.mes_referencia} ${report.ano}`],
    ['Status', report.status], ['Revisão', report.review_status],
    ['Pasta das fotos deste relatório', `https://drive.google.com/drive/folders/${photoFolderId}`],
    ['Enviado em', report.submitted_at], ['Público declarado', report.publico_geral_declarado],
    ['Resumo do período', report.resumo_periodo], ['Resumo executivo', report.resumo_executivo],
    ['Pontos positivos', report.raw_data?.avaliacao_pontos_positivos],
    ['Desafios', report.raw_data?.avaliacao_desafios],
    ['Sugestões', report.raw_data?.avaliacao_sugestoes],
    ['Comentários gerais', report.comentarios_gerais],
    ['Comentários da coordenação', report.comentarios_coordenacao],
  ]) addLabeledText(doc, label, value);
  doc.addPage().font('Helvetica-Bold').fontSize(16).fillColor('#142234').text(`Atividades (${activities.length})`);
  doc.moveDown(0.5);
  for (const [index, item] of activities.entries()) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#142234').text(`${index + 1}. ${clean(item.nome) || 'Atividade sem título'}`);
    doc.font('Helvetica').fontSize(9).fillColor('#444').text([
      item.data_inicio && `Início: ${item.data_inicio}`, item.data_fim && `Fim: ${item.data_fim}`,
      item.museu_lista && `Museu: ${Array.isArray(item.museu_lista) ? item.museu_lista.join(', ') : item.museu_lista}`,
      item.publico_estimado != null && `Público: ${item.publico_estimado}`,
    ].filter(Boolean).join('  |  '));
    if (item.descricao) doc.fontSize(9).text(clean(item.descricao), { paragraphGap: 8 });
    doc.moveDown(0.5);
  }
  doc.addPage().font('Helvetica-Bold').fontSize(16).fillColor('#142234').text(`Evidências fotográficas (${photos.length})`);
  doc.font('Helvetica').fontSize(9).fillColor('#555').text('Os arquivos completos ficam na pasta de fotos indicada na capa. Este PDF inclui até 20 prévias e a referência de todas as fotos. Os vínculos reproduzem o estado atual do banco e não atestam autoria individual.');
  doc.moveDown(0.5);
  let imagesEmbedded = 0;
  let imagesUnavailable = 0;
  for (const [index, photo] of photos.entries()) {
    const label = `${index + 1}. ${clean(photo.legenda || photo.caption || photo.file_name) || 'Foto sem legenda'}`;
    if (doc.y > 520) doc.addPage();
    doc.font('Helvetica-Bold').fontSize(10).fillColor('#142234').text(label);
    doc.font('Helvetica').fontSize(8).fillColor('#555').text(`Atividade: ${clean(photo.activity_id) || 'não identificada'} | Museu: ${clean(photo.museu) || '-'} | Arquivo: ${clean(photo.file_name) || '-'}`);
    const backupId = photo.raw_data?.monthly_backup_file_id || photo.drive_file_id;
    if (backupId) doc.fontSize(8).fillColor('#255882').text(`Backup da foto: https://drive.google.com/file/d/${backupId}/view`);
    if (imagesEmbedded >= 20) { doc.moveDown(0.5); continue; }
    try {
      const bytes = await photoBytes(drive, photo);
      const jpeg = bytes?.[0] === 0xff && bytes?.[1] === 0xd8;
      const png = bytes?.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      if (!bytes || bytes.length > 15_000_000 || (!jpeg && !png)) throw new Error('imagem indisponível ou formato não compatível');
      if (doc.y > 505) doc.addPage();
      doc.image(bytes, 50, doc.y + 5, { fit: [495, 215], align: 'center', valign: 'center' });
      doc.y += 225;
      imagesEmbedded++;
    } catch (error) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor('#9a3412').text(`Imagem não incorporada: ${clean(error.message)}. Referência: ${clean(photo.file_url) || clean(photo.drive_file_id) || '-'}`);
      imagesUnavailable++;
    }
    doc.moveDown(0.5);
  }
  doc.end();
  await done;
  return { bytes: Buffer.concat(chunks), imagesEmbedded, imagesUnavailable };
}

async function upsertBytes(drive, parent, listing, name, properties, bytes, mimeType) {
  const same = listing.filter(file => (file.appProperties?.reportId === properties.reportId && file.appProperties?.kind === properties.kind) || file.name === name);
  if (same.length > 1) throw new Error(`Arquivos duplicados: ${name}`);
  if (same[0]?.appProperties?.sha256 === properties.sha256 && same[0].name === name) return { file: same[0], action: 'unchanged' };
  const media = { mimeType, body: Readable.from(bytes) };
  if (same[0]) {
    const file = (await drive.files.update({ fileId: same[0].id, requestBody: { name, appProperties: properties }, media, fields: 'id,name,webViewLink', supportsAllDrives: true })).data;
    return { file, action: 'updated' };
  }
  const file = (await drive.files.create({ requestBody: { name, parents: [parent], appProperties: properties }, media, fields: 'id,name,webViewLink', supportsAllDrives: true })).data;
  listing.push({ ...file, appProperties: properties });
  return { file, action: 'created' };
}

async function linkPhotos(drive, photoFolder, report, photos) {
  const files = await listFolder(drive, photoFolder);
  let linked = 0;
  let missing = 0;
  for (const photo of photos) {
    const targetId = photo.raw_data?.monthly_backup_file_id || photo.drive_file_id;
    if (!targetId) { missing++; continue; }
    const name = `Foto_${photo.id}_${filePart(photo.file_name)}`;
    const same = files.filter(file => file.appProperties?.photoId === String(photo.id) || file.name === name);
    if (same.length > 1) { missing++; continue; }
    if (same[0]?.shortcutDetails?.targetId === targetId || same[0]?.appProperties?.targetId === targetId) { linked++; continue; }
    try {
      const target = (await drive.files.get({ fileId: targetId, fields: 'id,mimeType,trashed', supportsAllDrives: true })).data;
      if (target.trashed || !String(target.mimeType || '').startsWith('image/')) throw new Error('Destino não é uma foto ativa');
      if (same[0]) {
        // Drive shortcut targets are immutable. A mismatch requires review;
        // mutating the pointer would risk presenting another report's image.
        throw new Error(`Atalho existente aponta para outra foto (${same[0].id})`);
      } else {
        const shortcut = (await drive.files.create({ requestBody: { name, mimeType: 'application/vnd.google-apps.shortcut', parents: [photoFolder], shortcutDetails: { targetId }, appProperties: { reportId: String(report.id), photoId: String(photo.id), targetId } }, fields: 'id,name,appProperties', supportsAllDrives: true })).data;
        files.push(shortcut);
      }
      linked++;
    } catch (error) {
      missing++;
      console.error('REPORT_PHOTO_LINK_FAILED', JSON.stringify({ reportId: report.id, photoId: photo.id, targetId, error: error.message }));
    }
  }
  return { linked, missing };
}

async function main() {
  if (!process.env.GOOGLE_DRIVE_CLIENT_ID || !process.env.GOOGLE_DRIVE_CLIENT_SECRET || !process.env.GOOGLE_DRIVE_REFRESH_TOKEN) throw new Error('Google Drive não configurado');
  const auth = new google.auth.OAuth2(process.env.GOOGLE_DRIVE_CLIENT_ID, process.env.GOOGLE_DRIVE_CLIENT_SECRET);
  auth.setCredentials({ refresh_token: process.env.GOOGLE_DRIVE_REFRESH_TOKEN });
  const drive = google.drive({ version: 'v3', auth });
  const reports = (await pool.query(`SELECT * FROM reports WHERE ($1::text='' OR id::text=$1) ORDER BY ano,mes_referencia,author_name,id`, [reportId])).rows.filter(report => {
    const key = periodKey(report);
    return key && key >= '2026-02' && key <= new Date().toISOString().slice(0,7);
  });
  const summary = { mode: apply ? 'apply' : 'dry_run', reports: reports.length, approved: reports.filter(report => report.status === 'APPROVED').length, created: 0, updated: 0, unchanged: 0, photoLinks: 0, missingPhotoBackups: 0, failed: 0, imagesEmbedded: 0, imagesUnavailable: 0, folderId: '' };
  if (!apply) { console.log('APPROVED_REPORT_BACKUP', JSON.stringify(summary)); return; }
  const baseFolder = await ensureFolder(drive, rootId, 'Relatorios Mensais - Backup PDF e Fotos');
  summary.folderId = baseFolder;
  const approvedFolder = await ensureFolder(drive, baseFolder, 'Aprovados');
  const pendingFolder = await ensureFolder(drive, baseFolder, 'Em andamento');
  const folderCache = new Map();
  for (const report of reports) {
    try {
      const key = periodKey(report);
      const top = report.status === 'APPROVED' ? approvedFolder : pendingFolder;
      const cacheKey = `${top}|${key}`;
      const monthFolder = folderCache.get(cacheKey) || await ensureFolder(drive, top, key);
      folderCache.set(cacheKey, monthFolder);
      const folder = await ensureFolder(drive, monthFolder, `ID-${report.id}_${filePart(report.author_name)}_${filePart(report.museu)}`);
      const photoFolder = await ensureFolder(drive, folder, 'Fotos - atalhos para backup canonico');
      const name = `Relatorio_Mensal_${filePart(report.status)}_${key}_${filePart(report.museu)}_${filePart(report.author_name)}_ID-${report.id}.pdf`;
      const listing = await listFolder(drive, folder);
      const activities = (await pool.query('SELECT * FROM report_activities WHERE report_id=$1 ORDER BY data_inicio NULLS LAST,id', [String(report.id)])).rows;
      const photos = (await pool.query('SELECT * FROM report_photos WHERE report_id=$1 AND duplicada_de IS NULL ORDER BY ordem NULLS LAST,created_date,id', [String(report.id)])).rows;
      const snapshotReport = { ...report };
      for (const key of ['drive_backup_relatorio_id','drive_backup_relatorio_url','drive_backup_status','drive_backup_at']) delete snapshotReport[key];
      const snapshot = Buffer.from(JSON.stringify({ report: snapshotReport, activities, photos }, null, 2));
      const sourceHash = sha256(Buffer.from(JSON.stringify({ report: snapshotReport, activities, photos })));
      const pdfExisting = listing.find(file => (file.appProperties?.reportId === String(report.id) && file.appProperties?.kind === 'pdf') || file.name === name);
      let rendered = { imagesEmbedded: 0, imagesUnavailable: 0 };
      let pdfResult;
      if (pdfExisting?.appProperties?.sourceHash === sourceHash && pdfExisting.name === name) {
        pdfResult = { file: pdfExisting, action: 'unchanged' };
      } else {
        rendered = await renderReport(drive, report, activities, photos, photoFolder);
        pdfResult = await upsertBytes(drive, folder, listing, name, { reportId: String(report.id), kind: 'pdf', sourceHash, sha256: sha256(rendered.bytes) }, rendered.bytes, 'application/pdf');
      }
      const jsonName = `Dados_e_Atividades_ID-${report.id}.json`;
      const jsonResult = await upsertBytes(drive, folder, listing, jsonName, { reportId: String(report.id), kind: 'json', sourceHash, sha256: sha256(snapshot) }, snapshot, 'application/json');
      for (const action of [pdfResult.action, jsonResult.action]) summary[action]++;
      const links = await linkPhotos(drive, photoFolder, report, photos);
      summary.photoLinks += links.linked;
      summary.missingPhotoBackups += links.missing;
      const file = pdfResult.file;
      const url = file.webViewLink || `https://drive.google.com/file/d/${file.id}/view`;
      if (report.status === 'APPROVED') await pool.query(`UPDATE reports SET drive_backup_relatorio_id=$1,drive_backup_relatorio_url=$2,drive_backup_status='concluido',drive_backup_at=NOW() WHERE id=$3 AND status='APPROVED'`, [file.id, url, report.id]);
      summary.imagesEmbedded += rendered.imagesEmbedded;
      summary.imagesUnavailable += rendered.imagesUnavailable;
      console.log('REPORT_BACKUP_ITEM', JSON.stringify({ id: report.id, status: report.status, folderId: folder, name, driveId: file.id, activities: activities.length, photos: photos.length, photoLinks: links.linked, missingPhotoBackups: links.missing, imagesEmbedded: rendered.imagesEmbedded, imagesUnavailable: rendered.imagesUnavailable }));
    } catch (error) {
      summary.failed++;
      console.error('REPORT_BACKUP_FAILED', JSON.stringify({ id: report.id, error: error.message }));
    }
  }
  console.log('REPORT_BACKUP', JSON.stringify(summary));
  if (summary.failed || summary.missingPhotoBackups) process.exitCode = 1;
}

try { await main(); } finally { await pool.end(); }
