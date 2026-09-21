// Helpers shared by Compras, relatórios e backup.  Pastas do Drive nunca são
// links de arquivo: tratar as duas coisas de forma separada evita que o botão
// "PDF" abra uma pasta (ou fique apontando para um URL inválido).

function text(value) {
  return String(value || '').trim();
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(text(value));
}

export function isGoogleDriveFolderUrl(value) {
  return /drive\.google\.com\/drive\/folders\//i.test(text(value));
}

export function getGoogleDriveFileId(value) {
  const raw = text(value);
  if (!raw || isGoogleDriveFolderUrl(raw)) return '';

  // URLs retornados pela API do Drive (webViewLink), links /file/d/:id e
  // formatos antigos open?id=:id são todos aceitos.
  const pathMatch = raw.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/i);
  if (pathMatch) return pathMatch[1];
  const queryMatch = raw.match(/[?&]id=([A-Za-z0-9_-]+)/i);
  return queryMatch?.[1] || '';
}

function backupFiles(purchase) {
  return Array.isArray(purchase?.drive_backup_files) ? purchase.drive_backup_files : [];
}

function backupFileUrl(purchase, kind) {
  const match = backupFiles(purchase).find((file) => {
    const type = text(file?.tipo).toLowerCase();
    const name = text(file?.name).toLowerCase();
    if (kind === 'pdf') return type === 'nf-pdf' || type === 'pdf' || /\.pdf(?:$|[?#])/.test(name);
    if (kind === 'xml') return type === 'nf-xml' || type === 'xml' || /\.xml(?:$|[?#])/.test(name);
    return false;
  });
  if (!match) return '';
  return text(match.url || match.webViewLink || match.web_view_link || (match.fileId ? `https://drive.google.com/file/d/${match.fileId}/view` : ''));
}

function backupFileId(purchase, kind) {
  const match = backupFiles(purchase).find((file) => {
    const type = text(file?.tipo).toLowerCase();
    const name = text(file?.name).toLowerCase();
    if (kind === 'pdf') return type === 'nf-pdf' || type === 'pdf' || /\.pdf(?:$|[?#])/.test(name);
    if (kind === 'xml') return type === 'nf-xml' || type === 'xml' || /\.xml(?:$|[?#])/.test(name);
    return false;
  });
  return text(match?.fileId || match?.file_id || getGoogleDriveFileId(match?.url));
}

function firstUsable(...values) {
  return values.map(text).find((value) => value && !isGoogleDriveFolderUrl(value)) || '';
}

export function getPurchasePdfUrl(purchase = {}) {
  return firstUsable(
    purchase.drive_backup_nf_pdf_link,
    purchase.drive_file_url,
    backupFileUrl(purchase, 'pdf'),
    purchase.nf_pdf_link,
    purchase.nota_fiscal_pdf_url,
    purchase.nota_fiscal_url,
    purchase.nf_pdf_url,
    purchase.arquivo_url,
    purchase.file_url,
    purchase.documento_url,
  );
}

export function getPurchaseXmlUrl(purchase = {}) {
  return firstUsable(
    purchase.drive_backup_nf_xml_link,
    backupFileUrl(purchase, 'xml'),
    purchase.nf_xml_link,
    purchase.nota_fiscal_xml_url,
    purchase.xml_url,
    purchase.nf_xml_url,
  );
}

export function getPurchasePdfDriveFileId(purchase = {}) {
  return text(purchase.drive_file_id) || backupFileId(purchase, 'pdf') || getGoogleDriveFileId(getPurchasePdfUrl(purchase));
}

export function getPurchaseXmlDriveFileId(purchase = {}) {
  return backupFileId(purchase, 'xml') || getGoogleDriveFileId(getPurchaseXmlUrl(purchase));
}

// O backend usa a credencial do projeto para fazer streaming do arquivo. Assim
// o usuário autorizado do Gestor não precisa ter uma sessão no Google Drive.
export function getAuthenticatedDriveFileUrl(fileId, fallbackUrl = '') {
  const id = text(fileId);
  if (/^[A-Za-z0-9_-]{5,200}$/.test(id)) return `/api/drive-files/${encodeURIComponent(id)}`;
  return isHttpUrl(fallbackUrl) ? text(fallbackUrl) : '';
}

export function getPurchaseDriveFolderUrl(purchase = {}) {
  const value = text(purchase.drive_backup_folder_url);
  return isGoogleDriveFolderUrl(value) ? value : '';
}

export function hasPurchaseBackup(purchase = {}) {
  const status = text(purchase.drive_backup_status).toUpperCase();
  return status === 'CONCLUIDO' || Boolean(
    getPurchasePdfUrl(purchase) ||
    getPurchasePdfDriveFileId(purchase) ||
    getPurchaseDriveFolderUrl(purchase),
  );
}
