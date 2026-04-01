export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error('Falha ao converter arquivo para base64.'));
    };

    reader.readAsDataURL(file);
  });
}

function getExt(fileName = '') {
  const parts = String(fileName).split('.');
  return parts.length > 1 ? parts.pop().toLowerCase() : '';
}

function inferCategoria(file) {
  const ext = getExt(file?.name || '');
  if (ext === 'xml') return 'XML';
  return 'NF';
}

function sanitizeDateForFile(value) {
  if (!value) {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return String(value).trim();
}

function monthFromDate(dateStr) {
  if (!dateStr) return String(new Date().getMonth() + 1).padStart(2, '0');

  const raw = String(dateStr).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw.slice(5, 7);
  }

  return String(new Date().getMonth() + 1).padStart(2, '0');
}

function yearFromDate(dateStr) {
  if (!dateStr) return String(new Date().getFullYear());

  const raw = String(dateStr).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw.slice(0, 4);
  }

  return String(new Date().getFullYear());
}

export async function uploadNotaFiscalToDrive(file, dados = {}) {
  if (!file) {
    throw new Error('Arquivo não informado.');
  }

  const webAppUrl =
    dados.webAppUrl ||
    'COLE_AQUI_A_URL_DO_SEU_GOOGLE_APPS_SCRIPT';

  const token =
    dados.token ||
    'COLE_AQUI_O_MESMO_TOKEN_DO_APPS_SCRIPT';

  if (!webAppUrl || webAppUrl.includes('COLE_AQUI')) {
    throw new Error('URL do Apps Script não configurada.');
  }

  if (!token || token.includes('COLE_AQUI')) {
    throw new Error('Token do Apps Script não configurado.');
  }

  const dataReferencia = sanitizeDateForFile(dados.dataReferencia);
  const ano = String(dados.ano || yearFromDate(dataReferencia));
  const mes = String(dados.mes || monthFromDate(dataReferencia)).padStart(2, '0');

  const base64Data = await fileToBase64(file);

  const payload = {
    token,
    fileName: file.name,
    mimeType: file.type || 'application/octet-stream',
    base64Data,
    categoria: dados.categoria || inferCategoria(file),
    ano,
    mes,
    fornecedor: dados.fornecedor || '',
    valor: dados.valor || '',
    dataReferencia,
  };

  const response = await fetch(webAppUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();

  let result = null;
  try {
    result = JSON.parse(text);
  } catch (_err) {
    throw new Error(`Resposta inválida do Apps Script: ${text}`);
  }

  if (!result?.ok) {
    throw new Error(result?.error || 'Falha no upload para o Google Drive.');
  }

  return result;
}

export async function uploadNotasFiscaisToDrive(files = [], dados = {}) {
  const lista = Array.isArray(files) ? files : [];
  const results = [];

  for (const file of lista) {
    const result = await uploadNotaFiscalToDrive(file, dados);
    results.push(result);
  }

  return results;
}
