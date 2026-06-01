import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// ===== Drive Backup helpers =====
const DRIVE_ROOT_FOLDER_ID = '1aJ5nfpgXcpu6SrDVecmhIQ2eq4vexqe3';
const DRIVE_ROOT_FOLDER_NAME = 'notasfiscais-App';
const MESES_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

function resolverMesAno(purchase: any) {
  for (const campo of ['competencia','nf_data_emissao','created_date','approved_at']) {
    const v = purchase[campo];
    if (v) { const d = new Date(v); if (!isNaN(d.getTime())) return { mes: MESES_PT[d.getMonth()], ano: d.getFullYear() }; }
  }
  const now = new Date(); return { mes: MESES_PT[now.getMonth()], ano: now.getFullYear() };
}

function sanitizeStr(s: string) { return (s||'').replace(/[^a-zA-Z0-9À-ÿ\-_]/g,'_').replace(/_+/g,'_').slice(0,60); }

function gerarNomeArquivo(purchase: any, tipo: string, url: string) {
  const { mes, ano } = resolverMesAno(purchase);
  const mm = String(MESES_PT.indexOf(mes)+1).padStart(2,'0');
  const fornecedor = sanitizeStr(purchase.fornecedor_nome||'fornecedor-nao-informado');
  const nfNum = purchase.nf_numero ? `NF-${sanitizeStr(purchase.nf_numero)}` : 'sem-nf';
  const solId = (purchase.id||'sem-id').slice(-8);
  const ext = (url||'').split('?')[0].split('.').pop()?.toLowerCase().slice(0,6)||'bin';
  return `${ano}-${mm}__${fornecedor}__${nfNum}__${sanitizeStr(tipo)}__sol-${solId}.${ext}`;
}

async function driveGetOrCreateFolder(authHeader: any, parentId: string, folderName: string) {
  const q = encodeURIComponent(`name='${folderName}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`);
  const r = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)`, { headers: authHeader });
  const d = await r.json();
  if (d.files?.length > 0) return d.files[0];
  const cr = await fetch('https://www.googleapis.com/drive/v3/files?fields=id,name,webViewLink', {
    method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: folderName, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] })
  });
  return await cr.json();
}

async function driveUploadFile(authHeader: any, folderId: string, fileName: string, fileUrl: string) {
  const res = await fetch(fileUrl);
  if (!res.ok) throw new Error(`Download falhou: ${res.status}`);
  const buf = await res.arrayBuffer();
  const ext = (fileUrl.split('?')[0].split('.').pop()||'').toLowerCase();
  const mimeMap: any = { pdf:'application/pdf', xml:'application/xml', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg' };
  const mime = mimeMap[ext] || 'application/octet-stream';
  const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
  const boundary = 'boundary314159';
  const bytes = new Uint8Array(buf);
  let binary = ''; for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const body = `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mime}\r\nContent-Transfer-Encoding: base64\r\n\r\n${base64}\r\n--${boundary}--`;
  const ur = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
    method: 'POST',
    headers: { ...authHeader, 'Content-Type': `multipart/related; boundary="${boundary}"` },
    body
  });
  if (!ur.ok) { const e = await ur.text(); throw new Error(`Upload Drive: ${ur.status} - ${e.slice(0,200)}`); }
  return await ur.json();
}

function coletarUrlsArquivos(purchase: any) {
  const pares: { url: string; tipo: string }[] = [];
  const add = (url: any, tipo: string) => { if (url && typeof url === 'string' && url.startsWith('http')) pares.push({ url, tipo }); };
  add(purchase.nota_fiscal_url, 'nf-pdf');
  add(purchase.nf_pdf_url, 'nf-pdf');
  add(purchase.arquivo_url, 'arquivo');
  add(purchase.file_url, 'arquivo');
  add(purchase.documento_url, 'documento');
  add(purchase.comprovante_url, 'comprovante');
  add(purchase.comprovante_pagamento_url, 'comprovante-pagamento');
  add(purchase.orcamento_url, 'orcamento');
  const seen = new Set<string>();
  return pares.filter(a => { if (seen.has(a.url)) return false; seen.add(a.url); return true; });
}

async function dispararBackupDrive(base44: any, purchase: any) {
  if (purchase.drive_backup_status === 'concluido') return; // idempotente
  const arquivos = coletarUrlsArquivos(purchase);
  if (arquivos.length === 0) {
    await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, { drive_backup_status: 'sem_arquivos' });
    return;
  }
  // Dispara de forma assíncrona sem bloquear a aprovação
  (async () => {
    try {
      await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, { drive_backup_status: 'em_processamento' });
      const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      const authHeader = { Authorization: `Bearer ${conn.accessToken}` };
      const rootFolder = await driveGetOrCreateFolder(authHeader, DRIVE_ROOT_FOLDER_ID, DRIVE_ROOT_FOLDER_NAME);
      const { mes, ano } = resolverMesAno(purchase);
      const monthFolder = await driveGetOrCreateFolder(authHeader, rootFolder.id, `${mes} ${ano}`);
      const uploadados: any[] = [];
      for (const arq of arquivos) {
        const nome = gerarNomeArquivo(purchase, arq.tipo, arq.url);
        const uploaded = await driveUploadFile(authHeader, monthFolder.id, nome, arq.url);
        uploadados.push({ name: nome, fileId: uploaded.id, url: uploaded.webViewLink, tipo: arq.tipo });
      }
      await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, {
        drive_backup_status: 'concluido',
        drive_backup_folder_id: monthFolder.id,
        drive_backup_folder_url: monthFolder.webViewLink || `https://drive.google.com/drive/folders/${monthFolder.id}`,
        drive_backup_files: uploadados,
        drive_backup_at: new Date().toISOString(),
        drive_backup_error: null
      });
    } catch (err: any) {
      await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, {
        drive_backup_status: 'erro',
        drive_backup_error: err?.message || 'Erro desconhecido'
      }).catch(() => {});
    }
  })();
}
// ===== Fim Drive Backup helpers =====


function json(data: any, status = 200) {
  return Response.json(data, { status });
}

function toNumber(value: any): number {
  const raw = String(value ?? '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function getPurchaseValue(purchase: any): number {
  return toNumber(
    purchase?.valor_pago ||
      purchase?.valor_aprovado_admin ||
      purchase?.valor_aprovado ||
      purchase?.valor_final ||
      purchase?.valor_solicitado ||
      purchase?.valor_total ||
      purchase?.valor ||
      purchase?.rubrica_debitada_valor ||
      0
  );
}

async function getRubrica(base44: any, rubricaId: string) {
  if (!rubricaId) throw new Error('Rubrica obrigatória.');

  const rubrica = await base44.asServiceRole.entities.Rubrica.get(rubricaId);

  if (!rubrica) throw new Error('Rubrica inválida.');

  return rubrica;
}

async function debitarRubrica(base44: any, rubrica: any, valor: number) {
  const total = toNumber(rubrica.valor_total || rubrica.valor_rubrica);
  const utilizadoAtual = toNumber(rubrica.valor_utilizado);

  const novoUtilizado = utilizadoAtual + valor;
  const novoSaldo = total - novoUtilizado;
  const percentual = total > 0 ? (novoUtilizado / total) * 100 : 0;

  await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
    valor_utilizado: novoUtilizado,
    saldo_real: novoSaldo,
    saldo: novoSaldo,
    percentual_utilizado: percentual
  });
}

async function estornarRubrica(base44: any, rubrica: any, valor: number) {
  const total = toNumber(rubrica.valor_total || rubrica.valor_rubrica);
  const utilizadoAtual = toNumber(rubrica.valor_utilizado);

  const novoUtilizado = Math.max(0, utilizadoAtual - valor);
  const novoSaldo = total - novoUtilizado;
  const percentual = total > 0 ? (novoUtilizado / total) * 100 : 0;

  await base44.asServiceRole.entities.Rubrica.update(rubrica.id, {
    valor_utilizado: novoUtilizado,
    saldo_real: novoSaldo,
    saldo: novoSaldo,
    percentual_utilizado: percentual
  });
}

async function syncAttachments(base44: any, purchase: any, status: string) {
  try {
    const docs = await base44.asServiceRole.entities.Attachment.filter({
      purchase_id: purchase.id
    });

    for (const doc of docs || []) {
      await base44.asServiceRole.entities.Attachment.update(doc.id, {
        status,
        nf_status: status,
        ocultar_entrada_unica: true,
        inconsistencias: 0
      });
    }
  } catch (error) {
    console.error('Erro ao sincronizar anexos:', error);
  }
}

async function estornarSeNecessario(base44: any, purchase: any, valor: number) {
  const deveEstornar =
    !!purchase.rubrica_debitada_em ||
    !!purchase.financeiro_lancado_em;

  if (!deveEstornar || !purchase.rubrica_id) return;

  const rubrica = await getRubrica(base44, purchase.rubrica_id);
  const valorEstorno = toNumber(purchase.rubrica_debitada_valor) || valor;

  await estornarRubrica(base44, rubrica, valorEstorno);
}

// Troca de rubrica: estorna da antiga e debita na nova (ou apenas atualiza se ainda não debitado)
async function trocarRubricaSeNecessario(
  base44: any,
  purchase: any,
  novaRubricaId: string,
  novoValor: number
) {
  const rubricaAntigaId = purchase.rubrica_id;
  const jaDebitado = !!purchase.rubrica_debitada_em;

  if (!jaDebitado) {
    // Ainda não foi debitado: apenas atualiza o vínculo, sem movimentar saldo
    return { debitou: false };
  }

  // Já foi debitado: precisamos estornar a antiga e debitar na nova
  if (rubricaAntigaId && rubricaAntigaId !== novaRubricaId) {
    const rubricaAntiga = await getRubrica(base44, rubricaAntigaId);
    const valorEstorno = toNumber(purchase.rubrica_debitada_valor) || novoValor;
    await estornarRubrica(base44, rubricaAntiga, valorEstorno);
  }

  const rubricaNova = await getRubrica(base44, novaRubricaId);
  await debitarRubrica(base44, rubricaNova, novoValor);

  return { debitou: true };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const { action, purchaseId, comentario, novaRubricaId, novoValor } = body;

    if (!purchaseId) {
      return json({ success: false, error: 'purchaseId obrigatório.' }, 400);
    }

    const purchase = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseId);

    if (!purchase) {
      return json({ success: false, error: 'Solicitação não encontrada.' }, 404);
    }

    const valor = getPurchaseValue(purchase);

    // =========================
    // TROCAR RUBRICA
    // (estorna antiga, debita nova — mesmo se já aprovado)
    // =========================
    if (action === 'trocar_rubrica') {
      if (!novaRubricaId) {
        return json({ success: false, error: 'novaRubricaId obrigatório.' }, 400);
      }

      const valorTroca = novoValor != null ? toNumber(novoValor) : getPurchaseValue(purchase);

      const { debitou } = await trocarRubricaSeNecessario(base44, purchase, novaRubricaId, valorTroca);

      const now = new Date().toISOString();
      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, {
        rubrica_id: novaRubricaId,
        ...(debitou ? {
          rubrica_debitada_em: now,
          rubrica_debitada_valor: valorTroca,
          financeiro_lancado_em: purchase.financeiro_lancado_em || now
        } : {})
      });

      return json({ success: true, purchase: updated });
    }

    // Helper: gerar número de processamento único
    async function gerarNumeroProcessamento() {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const yyyy = now.getFullYear();
      const prefixo = `${mm}${dd}${yyyy}`;
      const todas = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 500);
      const deHoje = (todas || []).filter((p: any) => (p.numero_processamento || '').startsWith(prefixo));
      const seq = deHoje.length + 1;
      return `${prefixo}${String(seq).padStart(4, '0')}`;
    }

    // =========================
    // APROVAR (CORE CORRETO)
    // =========================
    if (action === 'aprovar') {
      // Verifica se a rubrica foi trocada antes de aprovar
      const rubricaAprovacaoId = novaRubricaId || purchase.rubrica_id;
      if (!rubricaAprovacaoId) {
        return json({ success: false, error: 'Rubrica obrigatória para aprovação.' }, 400);
      }

      const jaDebitado = !!purchase.rubrica_debitada_em;
      const rubricaMudou = jaDebitado && novaRubricaId && novaRubricaId !== purchase.rubrica_id;

      if (rubricaMudou) {
        // Estorna antiga e debita na nova
        await trocarRubricaSeNecessario(base44, purchase, novaRubricaId, valor);
      } else if (!jaDebitado) {
        const rubrica = await getRubrica(base44, rubricaAprovacaoId);
        await debitarRubrica(base44, rubrica, valor);
      }

      const numeroProcessamento = purchase.numero_processamento || await gerarNumeroProcessamento();

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(
        purchase.id,
        {
          status: 'APROVADO_COORD',
          rubrica_id: rubricaAprovacaoId,
          numero_processamento: numeroProcessamento,
          financeiro_lancado_em:
            purchase.financeiro_lancado_em || new Date().toISOString(),
          rubrica_debitada_em:
            purchase.rubrica_debitada_em || new Date().toISOString(),
          rubrica_debitada_valor:
            purchase.rubrica_debitada_valor || valor
        }
      );

      await syncAttachments(base44, updated, 'APROVADO');

      // Backup automático no Drive (não bloqueia aprovação)
      await dispararBackupDrive(base44, updated);

      // Disparar e-mail automático para setor financeiro (não bloqueia se falhar)
      try {
        await base44.asServiceRole.functions.invoke('notifyPurchaseApprovedToFinanceiro', {
          purchaseId: purchase.id,
          aprovadorEmail: body.aprovadorEmail || '',
          aprovadorNome: body.aprovadorNome || '',
        });
      } catch (emailErr) {
        console.warn('E-mail financeiro não enviado:', emailErr?.message);
      }

      return json({ success: true, purchase: updated });
    }

    // =========================
    // DESAPROVAR / REPROVAR
    // =========================
    if (action === 'desaprovar' || action === 'reprovar') {
      await estornarSeNecessario(base44, purchase, valor);

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(
        purchase.id,
        {
          status: action === 'reprovar' ? 'RECUSADO' : 'SOLICITADO',
          comentario_desaprovacao:
            comentario || 'Desaprovado pela coordenação.',
          financeiro_lancado_em: null,
          rubrica_debitada_em: null,
          rubrica_debitada_valor: 0
        }
      );

      await syncAttachments(base44, updated, action === 'reprovar' ? 'REPROVADO' : 'SOLICITADO');

      return json({ success: true, purchase: updated });
    }

    // =========================
    // DEVOLVER
    // =========================
    if (action === 'devolver' || action === 'rejeitar') {
      await estornarSeNecessario(base44, purchase, valor);

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(
        purchase.id,
        {
          status: 'DEVOLVIDO',
          comentario_devolucao:
            comentario || 'Devolvido pela coordenação.',
          financeiro_lancado_em: null,
          rubrica_debitada_em: null,
          rubrica_debitada_valor: 0
        }
      );

      await syncAttachments(base44, updated, 'DEVOLVIDO');

      return json({ success: true, purchase: updated });
    }

    // =========================
    // CANCELAR
    // =========================
    if (action === 'cancelar' || action === 'deletar') {
      await estornarSeNecessario(base44, purchase, valor);

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(
        purchase.id,
        {
          status: 'CANCELADO',
          financeiro_lancado_em: null,
          rubrica_debitada_em: null,
          rubrica_debitada_valor: 0
        }
      );

      await syncAttachments(base44, updated, 'CANCELADO');

      return json({ success: true, purchase: updated });
    }

    // =========================
    // MARCAR PAGO (sem comprovante — legado / equipe)
    // =========================
    if (action === 'marcar_pago') {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const yyyy = now.getFullYear();
      const prefixo = `${mm}${dd}${yyyy}`;

      let numeroProcessamento = purchase.numero_processamento;
      if (!numeroProcessamento) {
        const todas = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 500);
        const deHoje = (todas || []).filter((p: any) => (p.numero_processamento || '').startsWith(prefixo));
        const seq = deHoje.length + 1;
        numeroProcessamento = `${prefixo}${String(seq).padStart(4, '0')}`;
      }

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, {
        status: 'PAGO',
        pago: true,
        status_pagamento: 'pago',
        data_pagamento: now.toISOString(),
        numero_processamento: numeroProcessamento,
      });

      // Backup automático no Drive (não bloqueia)
      await dispararBackupDrive(base44, updated);

      return json({ success: true, purchase: updated });
    }

    return json({ success: false, error: 'Ação inválida.' }, 400);
  } catch (error: any) {
    console.error('purchaseActions error:', error);

    return json({
      success: false,
      error: error?.message || 'Erro ao processar ação.'
    }, 500);
  }
});