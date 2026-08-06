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
  // XML da nota fiscal
  add(purchase.nf_xml_url, 'nf-xml');
  add(purchase.xml_url, 'nf-xml');
  add(purchase.nota_fiscal_xml_url, 'nf-xml');
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

    const { action, purchaseId, comentario, novaRubricaId, novoValor, novoCentroCusto } = body;

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
      const novoCentroCusto = body.novoCentroCusto as string | undefined;

      const rubricaAntigaId = purchase.rubrica_id;
      const jaDebitado = !!purchase.rubrica_debitada_em;
      const rubricaMudou = novaRubricaId !== rubricaAntigaId;
      const centroCustoMudou = novoCentroCusto && novoCentroCusto !== purchase.centro_custo;

      let debitou = false;

      if (jaDebitado) {
        if (rubricaMudou) {
          // Rubrica mudou: estorna antiga e debita nova
          if (rubricaAntigaId) {
            const rubricaAntiga = await getRubrica(base44, rubricaAntigaId);
            const valorEstorno = toNumber(purchase.rubrica_debitada_valor) || valorTroca;
            await estornarRubrica(base44, rubricaAntiga, valorEstorno);
          }
          const rubricaNova = await getRubrica(base44, novaRubricaId);
          await debitarRubrica(base44, rubricaNova, valorTroca);
          debitou = true;
        } else if (centroCustoMudou) {
          // Centro de custo mudou mas rubrica é a mesma:
          // sempre estorna o valor antigo e redebita, mesmo que o valor seja
          // idêntico, garantindo que rubrica_debitada_valor e o saldo fiquem
          // sempre consistentes
          const rubrica = await getRubrica(base44, novaRubricaId);
          const valorEstorno = toNumber(purchase.rubrica_debitada_valor) || valorTroca;
          await estornarRubrica(base44, rubrica, valorEstorno);
          await debitarRubrica(base44, rubrica, valorTroca);
          debitou = true;
        }
      } else if (rubricaMudou || centroCustoMudou) {
        // Não debitado ainda: apenas registra o vínculo sem mover saldo
        debitou = false;
      }

      const now = new Date().toISOString();
      const updateData: any = { rubrica_id: novaRubricaId };
      if (novoCentroCusto) updateData.centro_custo = novoCentroCusto;
      if (debitou) {
        updateData.rubrica_debitada_em = now;
        updateData.rubrica_debitada_valor = valorTroca;
        updateData.financeiro_lancado_em = purchase.financeiro_lancado_em || now;
      }

      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, updateData);

      return json({ success: true, purchase: updated, debitou, rubricaMudou, centroCustoMudou });
    }

    // =========================
    // ATUALIZAR APENAS CENTRO DE CUSTO
    // Payload mínimo: só o campo fornecido, sem spreads com undefined
    // =========================
    if (action === 'updateCentroCusto') {
      const novoCentro = novoCentroCusto as string | undefined;
      if (!novoCentro) {
        return json({ success: false, error: 'novoCentroCusto obrigatório.' }, 400);
      }

      const updatePayload: { centro_custo: string } = { centro_custo: novoCentro };
      const updated = await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, updatePayload);

      // Se a rubrica já foi debitada, faz reequilíbrio financeiro (estorno + redébito)
      // com o mesmo valor, pois somente o centro mudou
      if (purchase.rubrica_id && !!purchase.rubrica_debitada_em) {
        try {
          const valorTroca = getPurchaseValue(purchase);
          const rubrica = await getRubrica(base44, purchase.rubrica_id);
          const valorEstorno = toNumber(purchase.rubrica_debitada_valor) || valorTroca;
          await estornarRubrica(base44, rubrica, valorEstorno);
          await debitarRubrica(base44, rubrica, valorTroca);
        } catch (finErr) {
          console.warn('Reequilíbrio financeiro no updateCentroCusto falhou (não bloqueante):', finErr?.message);
        }
      }

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
      // ── Verificação de duplicidade antes de aprovar ──
      // Só verifica se não houver bypass explícito do coordenador
      const bypassDuplicate = body.bypass_duplicate_check === true;
      if (!bypassDuplicate && !purchase.rubrica_debitada_em) {
        const cnpj = String(purchase.fornecedor_cnpj || purchase.nf_emitente_cpf_cnpj || '').replace(/\D/g, '');
        const nfNum = String(purchase.nf_numero || '').trim();
        const chave = String(purchase.nf_chave_acesso || '').replace(/\D/g, '').slice(0, 44);

        if (cnpj && (nfNum || chave)) {
          try {
            const dupRes = await base44.asServiceRole.functions.invoke('validateNFDuplicate', {
              nf_numero: nfNum,
              nf_emitente_cpf_cnpj: cnpj,
              nf_valor_total: purchase.nf_valor_total || purchase.valor_solicitado,
              nf_data_emissao: purchase.nf_data_emissao || '',
              nf_chave_acesso: chave,
              exclude_id: purchase.id,
            });

            const dup = dupRes?.data || dupRes || {};
            if (dup.isDuplicate && dup.hasApprovedDuplicate) {
              // Marcar para auditoria mas NÃO bloquear — registrar e retornar erro
              await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, {
                duplicidade_status: 'suspeita',
                duplicidade_motivo: dup.motivo || dup.confidence,
                duplicidade_bloqueada: true,
                duplicidade_nota_original_id: dup.matches?.[0]?.id || '',
              }).catch(() => {});

              // Log de auditoria
              await base44.asServiceRole.entities.AuditLog.create({
                action: 'UPDATE',
                entity_type: 'REPORT',
                entity_id: purchase.id,
                actor_email: body.aprovadorEmail || 'sistema',
                actor_name: body.aprovadorNome || 'Sistema',
                details: `APROVAÇÃO BLOQUEADA POR DUPLICIDADE. Critério: ${dup.motivo}. Match: ${dup.matches?.[0]?.id || ''}`,
              }).catch(() => {});

              return json({
                success: false,
                blocked_by_duplicate: true,
                duplicate: dup,
                error: `Aprovação bloqueada: ${dup.message || 'Nota fiscal possivelmente duplicada — já aprovada anteriormente.'}`,
              }, 409);
            }

            // Se há suspeita mas não confirmada, registrar para auditoria mas não bloquear
            if (dup.isDuplicate && !dup.hasApprovedDuplicate) {
              await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, {
                duplicidade_status: 'suspeita',
                duplicidade_motivo: dup.motivo || dup.confidence,
                duplicidade_bloqueada: false,
              }).catch(() => {});
            }
          } catch (dupErr) {
            // Falha na verificação não bloqueia — registra aviso e continua
            console.warn('Falha na verificação de duplicidade (não bloqueante):', dupErr?.message);
          }
        }
      }

      // Se bypass ativo, registrar que coordenador assumiu responsabilidade
      if (bypassDuplicate) {
        await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, {
          duplicidade_status: 'revisada',
          duplicidade_revisado_por: body.aprovadorEmail || '',
          duplicidade_revisado_em: new Date().toISOString(),
          duplicidade_bloqueada: false,
        }).catch(() => {});
      }

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

      // Backup automático no Drive — fire-and-forget: nunca bloqueia o retorno de aprovação
      base44.asServiceRole.functions.invoke('driveBackupPurchase', { purchaseId: purchase.id }).catch((backupErr: any) => {
        console.warn('Backup Drive não concluído imediatamente:', backupErr?.message);
        base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, {
          drive_backup_status: 'pendente'
        }).catch(() => {});
      });

      // Notificações: suprimir se for aprovação direta (nunca passou por SOLICITADO)
      // Critério: submitted_at ausente/nulo → coordenador criou e aprovou sem submissão formal
      const isAprovacaoDireta = !purchase.submitted_at;
      if (!isAprovacaoDireta) {
        try {
          await base44.asServiceRole.functions.invoke('notifyPurchaseApprovedToFinanceiro', {
            purchaseId: purchase.id,
            aprovadorEmail: body.aprovadorEmail || '',
            aprovadorNome: body.aprovadorNome || '',
          });
        } catch (emailErr) {
          console.warn('E-mail financeiro não enviado:', emailErr?.message);
        }
      } else {
        console.log(`[purchaseActions] Aprovação direta (sem SOLICITADO) — notificações suprimidas para purchase ${purchase.id}`);
      }

      // Enfileirar para digest diário das 06h (fire-and-forget)
      base44.asServiceRole.functions.invoke('addPurchaseToNotificationQueue', {
        purchaseId: purchase.id
      }).catch((e: any) => console.warn('[purchaseActions] Falha ao enfileirar digest:', e?.message));

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

      // ── Alerta imediato de pagamento registrado (fire-and-forget) ──
      const PAYMENT_ALERT_RECIPIENTS = [
        'adm@viadutodasartes.org.br',
        'josianeamancio@viadutodasartes.org.br',
        'danielperini.mc@viadutodasartes.org.br',
      ];
      const valorPago = toNumber(updated.valor_pago || updated.valor_solicitado || 0);
      const fornecedor = updated.fornecedor_nome || 'Fornecedor não informado';
      const descricao = updated.descricao_item || updated.purchase_descricao || 'N/A';
      const dataHora = now.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const valorFormatado = `R$ ${valorPago.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;

      const emailSubject = `⚠️ Pagamento Registrado: ${fornecedor} — ${valorFormatado}`;
      const emailBody = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#b45309,#d97706);padding:20px 28px;">
      <div style="color:#ffffff;font-size:13px;font-weight:600;text-transform:uppercase;opacity:0.85;">Museus Centro · Sistema de Compras</div>
      <div style="color:#ffffff;font-size:20px;font-weight:700;margin-top:4px;">⚠️ Pagamento Registrado</div>
      <div style="color:rgba(255,255,255,0.8);font-size:13px;margin-top:2px;">${dataHora}</div>
    </div>
    <div style="padding:24px 28px;">
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;"><strong style="color:#64748b;font-size:12px;text-transform:uppercase;">Descrição</strong><div style="font-size:15px;margin-top:2px;">${descricao}</div></td></tr>
        <tr><td style="padding:8px 0;border-bottom:1px solid #f1f5f9;"><strong style="color:#64748b;font-size:12px;text-transform:uppercase;">Fornecedor</strong><div style="font-size:15px;margin-top:2px;">${fornecedor}</div></td></tr>
        <tr><td style="padding:8px 0;"><strong style="color:#64748b;font-size:12px;text-transform:uppercase;">Valor Pago</strong><div style="font-size:22px;font-weight:700;color:#059669;margin-top:2px;">${valorFormatado}</div></td></tr>
      </table>
      <div style="margin-top:20px;">
        <a href="https://periniprojetos.com.br/Compras" style="display:inline-block;background:#1e293b;color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:8px;text-decoration:none;">Ver no Sistema de Compras →</a>
      </div>
      <p style="margin-top:16px;font-size:12px;color:#94a3b8;">Este alerta é enviado automaticamente sempre que um pagamento é registrado. Verifique se o registro é esperado para evitar duplicidades.</p>
    </div>
  </div>
</body></html>`;

      Promise.all(
        PAYMENT_ALERT_RECIPIENTS.map(recipient =>
          base44.asServiceRole.integrations.Core.SendEmail({
            to: recipient,
            subject: emailSubject,
            body: emailBody,
            from_name: 'Museus Centro — Compras'
          }).catch((e: any) => console.warn(`[marcar_pago] Falha ao enviar alerta para ${recipient}:`, e?.message))
        )
      ).catch(() => {});

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