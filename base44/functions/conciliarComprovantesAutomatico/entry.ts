import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Conciliação automática de comprovantes de pagamento:
// percorre PurchaseRequests PAGO sem comprovante_url e cruza contra arquivos de
// comprovante encontrados em uma pasta manual do Google Drive (padrão: '2026').
// Sem guard de role — permite invocação headless por automação/service role.
// Processa em lotes de 20 para evitar timeout de 50s.

const DEFAULT_FOLDER_ID = ''; // prefixo '2026' resolved at runtime via payload
const PADROES_COMPROVANTE = ['COMP', 'COMPROVANTE', 'RECIBO'];
const SCORE_CORTE = 0.85;
const LOTE_SIZE = 20;

// --- helpers de parsing ---

function normalizeUpper(s) {
  return String(s || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().trim();
}

function extractValor(nome) {
  // Captura "R$ X.XXX,XX" ou "R$X.XXX,XX"
  const m = String(nome || '').match(/R\$\s*([\d\.]+\,\d{2})/i);
  if (!m) return null;
  const num = parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  return isNaN(num) ? null : num;
}

function extractMesAno(nome) {
  const s = String(nome || '');
  // "MM-AAAA" ex. 08-2026
  let m = s.match(/(\d{2})-(\d{4})/);
  if (m) return { mes: parseInt(m[1], 10), ano: parseInt(m[2], 10) };
  // "MM/AAAA"
  m = s.match(/(\d{2})\/(\d{4})/);
  if (m) return { mes: parseInt(m[1], 10), ano: parseInt(m[2], 10) };
  return null;
}

function extractNfNumero(nome) {
  // "NF 22 -" ou "NF-22" ou "NF 2026..." (evita 2026 isolado)
  const s = String(nome || '');
  const m = s.match(/NF[\s\-]*(\d{1,6})\b/i);
  if (!m) return null;
  const n = m[1];
  // ignora 4 dígitos que sejam ano (2026/2025)
  if (/^\d{4}$/.test(n) && (n === '2025' || n === '2026' || n === '2024')) return null;
  return n;
}

function levenshtein(a, b) {
  if (!a && !b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const m = a.length, n = b.length;
  const dp = new Array(n + 1);
  for (let j = 0; j <= n; j++) dp[j] = j;
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}

function similaridade(a, b) {
  const la = (a || '').length, lb = (b || '').length;
  if (!la && !lb) return 1;
  const d = levenshtein(a || '', b || '');
  return 1 - d / Math.max(la, lb);
}

function tokensFornecedor(nome) {
  return normalizeUpper(nome).split(/[\s\-_\.]+/).filter(t => t.length > 2 && !['LTDA','ME','EPP','EIRELI','MEI','DE','DA','DO','DAS','DOS','E','SA'].includes(t));
}

function scoreFornecedor(nomeArquivo, purchase) {
  const nomeComp = normalizeUpper(purchase.fornecedor_nome || purchase.nf_emitente_nome || '');
  if (!nomeComp) return 0;
  // tokens do nome do arquivo (tudo após prefixo NF/COMP) sem dígitos isolados
  const limpo = normalizeUpper(nomeArquivo).replace(/NF\s*\d+/gi, ' ').replace(/R\$\s*[\d\.,]+/gi, ' ');
  const tokensArq = limpo.split(/[\s\-_\.]+/).filter(t => t.length > 2);
  const tokensFor = tokensFornecedor(nomeComp);
  if (!tokensFor.length) return 0;

  let acertos = 0;
  for (const tf of tokensFor) {
    if (tokensArq.some(ta => ta === tf || similaridade(ta, tf) > 0.82)) acertos++;
  }
  const overlap = acertos / tokensFor.length;
  // Similaridade sobre a string inteira (defesa contra nomes curtos)
  const sim = similaridade(nomeComp, limpo);
  return Math.max(overlap, sim) >= 0.5 ? Math.max(overlap, sim * 0.85) : 0;
}

function scoreValor(nomeArquivo, purchase) {
  const valorArquivo = extractValor(nomeArquivo);
  if (valorArquivo == null) return 0;
  const candidato = [purchase.valor_pago, purchase.valor_aprovado_admin, purchase.valor_aprovado, purchase.nf_valor_total, purchase.valor_solicitado]
    .filter(v => typeof v === 'number' && v > 0);
  if (!candidato.length) return 0;
  const ref = candidato[0];
  const diff = Math.abs(valorArquivo - ref) / Math.max(ref, 1);
  return diff <= 0.05 ? 0.4 : (diff <= 0.15 ? 0.2 : 0);
}

function scoreMes(nomeArquivo, purchase) {
  const ma = extractMesAno(nomeArquivo);
  if (!ma) return 0;
  let refDate = null;
  for (const c of ['nf_data_emissao', 'data_pagamento_efetivo', 'competencia', 'created_date']) {
    if (purchase[c]) { const d = new Date(purchase[c]); if (!isNaN(d.getTime())) { refDate = d; break; } }
  }
  if (!refDate) return 0;
  return (refDate.getMonth() + 1 === ma.mes && refDate.getFullYear() === ma.ano) ? 0.2 : 0;
}

function scoreNfNumero(nomeArquivo, purchase) {
  const nf = extractNfNumero(nomeArquivo);
  if (!nf) return 0;
  const nfComp = String(purchase.nf_numero || '').replace(/\D/g, '');
  if (!nfComp) return 0;
  return nf === nfComp ? 0.2 : 0;
}

function pontuar(nomeArquivo, purchase) {
  const partes = [
    { peso: 0.4, val: scoreValor(nomeArquivo, purchase) },
    { peso: 0.2, val: scoreMes(nomeArquivo, purchase) },
    { peso: 0.25, val: scoreFornecedor(nomeArquivo, purchase) },
    { peso: 0.2, val: scoreNfNumero(nomeArquivo, purchase) }
  ];
  const score = partes.reduce((acc, p) => acc + Math.min(p.peso, p.val * p.peso / 0.4), 0);
  return {
    score: Math.round(score * 100) / 100,
    detalhes: { valor: partes[0].val, mes: partes[1].val, fornecedor: partes[2].val, nf: partes[3].val }
  };
}

function ehComprovante(nome) {
  const up = normalizeUpper(nome);
  return PADROES_COMPROVANTE.some(p => up.includes(p));
}

// --- drive helpers ---

async function listarArquivosPasta(authHeader, folderId) {
  const todos = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken,files(id,name,webViewLink,mimeType)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, { headers: authHeader });
    if (!r.ok) { const e = await r.text(); throw new Error(`Drive list: ${r.status} - ${e.slice(0,200)}`); }
    const d = await r.json();
    if (d.files) todos.push(...d.files);
    pageToken = d.nextPageToken;
  } while (pageToken);
  return todos;
}

async function buscarPasta2026(authHeader) {
  // busca pasta nome '2026' entre todas as subpastas acessíveis
  let pageToken = null;
  do {
    const params = new URLSearchParams({
      q: `mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'nextPageToken,files(id,name,parents)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const r = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, { headers: authHeader });
    const d = await r.json();
    const pasta = (d.files || []).find(f => f.name === '2026');
    if (pasta) return pasta;
    pageToken = d.nextPageToken;
  } while (pageToken);
  return null;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json().catch(() => ({}));
  const folderId = body.folderId || null; // se ausente, resolve '2026' automaticamente
  const lote = Math.min(parseInt(body.loteSize, 10) || LOTE_SIZE, LOTE_SIZE);

  let accessToken;
  try {
    const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
    accessToken = conn.accessToken;
  } catch (err) {
    return Response.json({ error: 'Google Drive não configurado' }, { status: 500 });
  }
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  // 1. Resolve pasta alvo
  let pasta = folderId;
  if (!pasta) {
    const encontrada = await buscarPasta2026(authHeader);
    if (!encontrada) return Response.json({ error: 'Pasta 2026 não encontrada' }, { status: 404 });
    pasta = encontrada.id;
  }

  // 2. Lista arquivos e filtra candidatos a comprovante
  const arquivos = await listarArquivosPasta(authHeader, pasta);
  const candidatos = (arquivos || []).filter(f => ehComprovante(f.name));
  console.log(`Conciliação: ${arquivos.length} arquivos na pasta, ${candidatos.length} candidatos a comprovante.`);

  // 3. PurchaseRequests PAGO sem comprovante_url (lote de 20)
  const pagos = await base44.asServiceRole.entities.PurchaseRequest.list('-updated_date', 200);
  const alvos = (pagos || []).filter(p =>
    p.status === 'PAGO' &&
    (!p.comprovante_url || String(p.comprovante_url).trim() === '') &&
    (!p.comprovante_pagamento_url || String(p.comprovante_pagamento_url).trim() === '')
  ).slice(0, lote);

  console.log(`Conciliação: ${alvos.length} PurchaseRequests PAGO sem comprovante.`);

  const vinculados = [];
  for (const purchase of alvos) {
    let melhor = null;
    for (const f of candidatos) {
      const { score, detalhes } = pontuar(f.name, purchase);
      if (!melhor || score > melhor.score) {
        melhor = { file: f, score, detalhes };
      }
    }
    if (melhor && melhor.score >= SCORE_CORTE) {
      const comprovanteUrl = melhor.file.webViewLink;
      const driveBackupFiles = Array.isArray(purchase.drive_backup_files) ? [...purchase.drive_backup_files] : [];
      // idempotência: evita duplicar entrada comprovante
      if (!driveBackupFiles.some(e => e.tipo === 'comprovante' && e.fileId === melhor.file.id)) {
        driveBackupFiles.push({
          name: melhor.file.name,
          fileId: melhor.file.id,
          url: comprovanteUrl,
          tipo: 'comprovante',
          origem: 'conciliacao-automatica',
          score: melhor.score
        });
      }
      await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, {
        comprovante_url: comprovanteUrl,
        comprovante_pagamento_url: comprovanteUrl,
        drive_backup_files: driveBackupFiles,
        drive_backup_status: 'concluido'
      });
      vinculados.push({
        purchase_id: purchase.id,
        fornecedor: purchase.fornecedor_nome,
        arquivo: melhor.file.name,
        score: melhor.score,
        detalhes: melhor.detalhes
      });
      console.log(`Vinculado: ${purchase.id} <- ${melhor.file.name} (score ${melhor.score})`);
    } else {
      console.log(`Sem match p/ ${purchase.id}: melhor=${melhor ? melhor.score : 'nenhum'} (${melhor ? melhor.file.name : ''})`);
    }
  }

  return Response.json({
    success: true,
    pasta_id: pasta,
    arquivos_total: arquivos.length,
    candidatos_comprovante: candidatos.length,
    alvos_selecionados: alvos.length,
    vinculados: vinculados.length,
    vinculados_detalhes: vinculados,
    pendentes: alvos.length - vinculados.length
  });
});