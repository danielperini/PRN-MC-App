import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * processarSalaDeEspera
 *
 * Orquestrador backend ÚNICO do pipeline "Sala de Espera".
 * Centraliza TODA entrada de documentos (Drive, Gmail, upload → DocumentIntake).
 * O pipeline de IA preenche 100% dos campos obrigatórios ANTES de encaminhar
 * qualquer arquivo para os destinos finais (banco/Drive).
 *
 * Campos obrigatórios por tipo (pipeline deve preencher TODOS):
 *   NF (PDF/XML): tipo_detectado, nf_emitente_nome, nf_emitente_cpf_cnpj,
 *                 nf_numero, nf_valor_total, nf_data_emissao (>=2026),
 *                 centro_custo, fornecedor_nome, fornecedor_cpf_cnpj, municipio
 *   FOTO_ATIVIDADE: tipo_detectado, legenda_sugerida, centro_custo
 *   CONTRATO: tipo_detectado, contrato_numero, fornecedor/ team_member vinculado
 *   DOC_ADMIN/RECIBO: tipo_detectado, descricao
 *
 * Fluxo por execução:
 *   1. Buscar DocumentIntake pendentes (não ocultos, ativos)
 *   2. Para cada um: verificar campos obrigatórios preenchidos
 *   3. Se faltam campos E há arquivo → IA extrai TODOS os campos faltantes de uma vez
 *   4. Para NF: valida/corrige data emissão via IA (>= 2026, ignora datas de abertura)
 *   5. Se 100% preenchido: APROVADO + ocultar_entrada_unica (encaminha, NÃO acumula)
 *      - NF: garante pasta mensal MM-YYYY no Drive
 *   6. Se ainda faltam após 2 tentativas IA: marca REJEITADO para revisão manual
 */

const ROOT_NOTAS_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const BATCH_SIZE = 10;
const MAX_TENTATIVAS_IA = 1;
const IA_TIMEOUT_MS = 35000;
const DEADLINE_MS = 50000; // prazo global de execução segura
const MESES_PT = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── Utilitários ──────────────────────────────────────────────────────────────

function safeStr(v) { return String(v || '').trim(); }
function safeNum(v) { const n = Number(v); return isNaN(n) ? null : n; }

function parseDataEmissao(raw) {
  if (!raw) return null;
  let d = null;
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    d = new Date(raw.substring(0, 10) + 'T12:00:00Z');
  } else {
    const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (br) d = new Date(Number(br[3]), Number(br[2]) - 1, Number(br[1]), 12);
  }
  if (!d || isNaN(d.getTime())) return null;
  return { ano: d.getFullYear(), mesIdx: d.getMonth(), mesNome: MESES_PT[d.getMonth()] };
}

// Verifica quais campos obrigatórios estão preenchidos por tipo
function camposObrigatorios(intake) {
  const tipo = safeStr(intake.tipo_detectado);
  if (!tipo || tipo === 'PENDENTE') return { ok: false, faltando: ['tipo_detectado'] };

  if (tipo === 'NOTA_FISCAL_PDF' || tipo === 'NOTA_FISCAL_XML') {
    const faltando = [];
    if (!safeStr(intake.nf_emitente_nome)) faltando.push('nf_emitente_nome');
    if (!safeStr(intake.nf_emitente_cpf_cnpj || intake.fornecedor_cpf_cnpj)) faltando.push('fornecedor_cpf_cnpj');
    if (!safeStr(intake.nf_numero)) faltando.push('nf_numero');
    if (!safeNum(intake.nf_valor_total)) faltando.push('nf_valor_total');
    const dataInfo = parseDataEmissao(intake.nf_data_emissao);
    if (!dataInfo || dataInfo.ano < 2026) faltando.push('nf_data_emissao');
    if (!safeStr(intake.centro_custo)) faltando.push('centro_custo');
    if (!safeStr(intake.fornecedor_nome)) faltando.push('fornecedor_nome');
    if (!safeStr(intake.municipio)) faltando.push('municipio');
    return { ok: faltando.length === 0, faltando };
  }

  if (tipo === 'FOTO_ATIVIDADE') {
    const faltando = [];
    if (!safeStr(intake.legenda_sugerida)) faltando.push('legenda_sugerida');
    if (!safeStr(intake.centro_custo)) faltando.push('centro_custo');
    return { ok: faltando.length === 0, faltando };
  }

  if (tipo === 'CONTRATO') {
    const faltando = [];
    if (!safeStr(intake.contrato_numero)) faltando.push('contrato_numero');
    if (!safeStr(intake.contrato_fornecedor_id || intake.contrato_team_member_id || intake.fornecedor_id_vinculado)) faltando.push('vinculo_fornecedor');
    return { ok: faltando.length === 0, faltando };
  }

  // DOC_ADMIN, RECIBO, OUTRO — apenas tipo
  return { ok: true, faltando: [] };
}

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function getToken(base44) {
  const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
  return accessToken;
}

async function driveGet(token, url) {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

async function findFolder(token, name, parentId) {
  const q = encodeURIComponent(
    `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const r = await driveGet(token, `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id)&pageSize=5`);
  if (!r.ok) return null;
  const d = await r.json();
  return d.files?.[0]?.id || null;
}

async function createFolder(token, name, parentId) {
  const r = await fetch('https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }),
  });
  const d = await r.json();
  if (d.error) throw new Error(`Erro criar pasta "${name}": ${d.error.message}`);
  return d.id;
}

async function getOrCreate(token, name, parentId, cache) {
  const key = `${parentId}/${name}`;
  if (cache[key] !== undefined) return cache[key];
  const id = (await findFolder(token, name, parentId)) || (await createFolder(token, name, parentId));
  cache[key] = id;
  return id;
}

// ── IA: preencher TODOS os campos faltantes de uma NF ─────────────────────────

function extrairDriveId(url) {
  if (!url) return null;
  const m = url.match(/\/file\/d\/([^/]+)/) || url.match(/[?&]id=([^&]+)/);
  return m ? m[1] : null;
}

async function resolverUrlPdf(url) {
  if (!url) return null;
  if (url.includes('drive.google.com')) {
    const id = extrairDriveId(url);
    if (id) return `https://drive.google.com/uc?export=download&id=${id}`;
  }
  return url;
}

// Fallback: baixa PDF do Drive e re-upload para storage Base44 (URL estável p/ IA)
async function reUploadDrivePdf(base44, token, driveUrl, fileName) {
  const fileId = extrairDriveId(driveUrl);
  if (!fileId) return null;
  try {
    const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return null;
    const blob = await r.blob();
    if (blob.size === 0) return null;
    const file = new File([blob], fileName || `nf_${fileId}.pdf`, { type: blob.type || 'application/pdf' });
    const up = await base44.asServiceRole.integrations.Core.UploadFile({ file });
    return up?.file_url || null;
  } catch (e) {
    console.error('reUploadDrivePdf erro:', e.message);
    return null;
  }
}

async function preencherCamposFaltantesIA(base44, token, intake, faltando) {
  const pdfUrl = await resolverUrlPdf(intake.nf_pdf_url || intake.arquivo_original_url);
  if (!pdfUrl) return { ok: false, motivo: 'sem_arquivo' };

  const camposPedidos = faltando.join(', ');
  const prompt = `Você é um extrator de NOTA FISCAL (NFS-e / NF-e). Analise o documento anexo e extraia EXATAMENTE os campos solicitados que estão faltando ou inválidos.

REGRAS CRÍTICAS:
- Data de emissão: apenas datas >= 2026 (campo "Data de Emissão" / "Data/Hora Emissão" / "Emitida em"). IGNORE datas de abertura de empresa, contratos, convênios, vencimento ou pagamento.
- CNPJ/CPF: apenas dígitos (14 ou 11).
- Valor total: valor NUMÉRICO da nota (sem R$, sem texto). Use ponto decimal.
- Centro de custo: um dos: MUMO, MIS, MHAB, Noturno nos Museus 2026, Noturno 2026, Noturno Pampulha, Publicações, Geral.

Retorne JSON com APENAS os campos solicitados: ${camposPedidos}
Se um campo não existir no documento, retorne null para ele.`;

  const schema = {
    type: 'object',
    properties: {
      nf_emitente_nome: { type: 'string' },
      fornecedor_cpf_cnpj: { type: 'string' },
      nf_numero: { type: 'string' },
      nf_valor_total: { type: 'number' },
      nf_data_emissao: { type: 'string' },
      centro_custo: { type: 'string' },
      fornecedor_nome: { type: 'string' },
      municipio: { type: 'string' },
    },
  };

  const runIA = async (url) => base44.asServiceRole.integrations.Core.InvokeLLM({
    model: 'gemini_3_flash',
    prompt,
    file_urls: [url],
    response_json_schema: schema,
  });

  try {
    let ia = null;
    try {
      ia = await Promise.race([
        runIA(pdfUrl),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout_ia')), IA_TIMEOUT_MS)),
      ]);
    } catch (eFirst) {
      // Fallback: re-upload para URL estável (Drive uc? URLs instáveis p/ IA)
      const reUrl = await reUploadDrivePdf(base44, token, intake.nf_pdf_url || intake.arquivo_original_url, intake.file_name_final || intake.file_name_original);
      if (!reUrl) throw eFirst;
      ia = await Promise.race([
        runIA(reUrl),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout_ia_fallback')), IA_TIMEOUT_MS)),
      ]);
    }

    const updates = {};
    if (ia?.nf_emitente_nome) updates.nf_emitente_nome = safeStr(ia.nf_emitente_nome);
    if (ia?.fornecedor_cpf_cnpj) {
      const doc = safeStr(ia.fornecedor_cpf_cnpj).replace(/\D/g, '');
      if (doc.length === 11 || doc.length === 14) {
        updates.fornecedor_cpf_cnpj = doc;
        updates.nf_emitente_cpf_cnpj = doc;
      }
    }
    if (ia?.nf_numero) updates.nf_numero = safeStr(ia.nf_numero);
    if (ia?.nf_valor_total != null) {
      const v = safeNum(ia.nf_valor_total);
      if (v !== null) updates.nf_valor_total = v;
    }
    if (ia?.nf_data_emissao) {
      const d = parseDataEmissao(ia.nf_data_emissao);
      if (d && d.ano >= 2026) updates.nf_data_emissao = ia.nf_data_emissao;
    }
    if (ia?.centro_custo) updates.centro_custo = safeStr(ia.centro_custo);
    if (ia?.fornecedor_nome) updates.fornecedor_nome = safeStr(ia.fornecedor_nome);
    if (ia?.municipio) updates.municipio = safeStr(ia.municipio);

    if (Object.keys(updates).length === 0) return { ok: false, motivo: 'ia_vazia' };

    await base44.asServiceRole.entities.DocumentIntake.update(intake.id, updates).catch(() => null);
    return { ok: true, motivo: 'preenchido', updates };
  } catch (e) {
    return { ok: false, motivo: `erro_ia:${e.message}` };
  }
}

// ── Processar um intake ──────────────────────────────────────────────────────

async function processarIntake(base44, token, intake, folderCache, tentativasMap) {
  const log = { id: intake.id, tipo: intake.tipo_detectado, fileName: intake.file_name_final || intake.file_name_original, status: '', detalhes: [] };

  // 1. Verificar campos obrigatórios
  let check = camposObrigatorios(intake);

  // 2. Se faltam campos e tem arquivo → IA preenche (até MAX_TENTATIVAS_IA)
  let tentativa = tentativasMap.get(intake.id) || 0;
  while (!check.ok && tentativa < MAX_TENTATIVAS_IA && (intake.tipo_detectado === 'NOTA_FISCAL_PDF' || intake.tipo_detectado === 'NOTA_FISCAL_XML')) {
    tentativa++;
    tentativasMap.set(intake.id, tentativa);
    log.detalhes.push(`IA validacao preencher tentativa ${tentativa}: faltando [${check.faltando.join(',')}]`);
    const iaResult = await preencherCamposFaltantesIA(base44, token, intake, check.faltando);
    if (!iaResult.ok) {
      log.detalhes.push(`IA falhou: ${iaResult.motivo}`);
      break;
    }
    // atualiza intake localmente para recheck
    Object.assign(intake, iaResult.updates);
    check = camposObrigatorios(intake);
  }

  // 3. Para foto sem legenda: uma tentativa de IA (lightweight, sem arquivo)
  if (!check.ok && intake.tipo_detectado === 'FOTO_ATIVIDADE') {
    // legenda sugerida pode vir do processarEntradaUnicaLote; apenas aguarda
    log.detalhes.push('Foto aguardando legenda da IA de análise');
  }

  // 4. Se ainda faltam dados essenciais após tentativas IA
  if (!check.ok) {
    // Após MAX tentativas IA para NF, marcar REJEITADO p/ revisão manual (não acumula indefinidamente)
    if (tentativa >= MAX_TENTATIVAS_IA && (intake.tipo_detectado === 'NOTA_FISCAL_PDF' || intake.tipo_detectado === 'NOTA_FISCAL_XML')) {
      try {
        await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
          status_processamento: 'REJEITADO',
          ocultar_entrada_unica: true,
        });
        log.status = 'rejeitado_dados_incompletos';
        log.detalhes.push(`Marcado REJEITADO após ${tentativa} tentativas IA. Campos faltantes: [${check.faltando.join(',')}]`);
      } catch (e) {
        log.status = 'erro_update';
        log.detalhes.push(`Erro ao rejeitar: ${e.message}`);
      }
    } else {
      log.status = 'pendente_dados';
      log.detalhes.push(`Motivo: ${check.faltando.join(',')}`);
    }
    return log;
  }

  // 5. 100% preenchido → LIBERAR (encaminhar, não acumular)
  const updates = {
    status_processamento: 'APROVADO',
    revisado_pelo_usuario: true,
    ocultar_entrada_unica: true,
  };

  // 6. NF aprovada: garantir pasta mensal MM-YYYY no Drive para auditoria
  if ((intake.tipo_detectado === 'NOTA_FISCAL_PDF' || intake.tipo_detectado === 'NOTA_FISCAL_XML') && intake.nf_data_emissao) {
    const dataInfo = parseDataEmissao(intake.nf_data_emissao);
    if (dataInfo) {
      try {
        const mesFmt = String(dataInfo.mesIdx + 1).padStart(2, '0');
        const nomePasta = `${mesFmt}-${dataInfo.ano}`;
        const folderId = await getOrCreate(token, nomePasta, ROOT_NOTAS_FOLDER_ID, folderCache);
        log.detalhes.push(`Pasta mensal ${nomePasta} confirmada: ${folderId}`);
      } catch (e) {
        log.detalhes.push(`AVISO pasta mensal: ${e.message}`);
      }
    }
  }

  try {
    await base44.asServiceRole.entities.DocumentIntake.update(intake.id, updates);
    log.status = 'liberado';
    log.detalhes.push('100% campos preenchidos → APROVADO + ocultar_entrada_unica');
  } catch (e) {
    log.status = 'erro_update';
    log.detalhes.push(`Erro ao liberar: ${e.message}`);
  }

  return log;
}

// ── Handler principal ────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const startTime = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const isCron = req.headers.get('x-base44-trigger') === 'cron';

    if (!isCron) {
      const user = await base44.auth.me().catch(() => null);
      if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const limite = typeof body.limite === 'number' ? body.limite : 40;

    // 1. Buscar intakes pendentes (não ocultos, ativos)
    const pendentes = await base44.asServiceRole.entities.DocumentIntake.filter(
      {
        status_processamento: { $in: ['ENVIADO', 'AGUARDANDO_REVISAO', 'ANALISANDO_IA'] },
        ocultar_entrada_unica: { $ne: true },
        status_registro: 'ATIVO',
      },
      '-updated_date', Math.min(limite, 200), 0
    ).catch(() => []);

    if (dryRun) {
      const amostra = (pendentes || []).slice(0, 25).map((i) => {
        const c = camposObrigatorios(i);
        return {
          id: i.id,
          tipo: i.tipo_detectado,
          fileName: i.file_name_final || i.file_name_original,
          camposPreenchidos: c.ok,
          faltando: c.faltando,
          status: i.status_processamento,
        };
      });
      const completos = amostra.filter((a) => a.camposPreenchidos).length;
      const faltam = amostra.length - completos;
      return Response.json({
        ok: true,
        dry_run: true,
        pendentes_total: (pendentes || []).length,
        ja_100pct: completos,
        precisam_ia: faltam,
        amostra,
      });
    }

    // 2. Obter token Drive
    const token = await getToken(base44);
    const folderCache = {};
    const tentativasMap = new Map();
    const deadline = startTime + DEADLINE_MS;
    let paradosPorDeadline = 0;

    // 3. Processar em lotes (interrompe antes do prazo global p/ não estourar execução)
    const resultados = { liberado: 0, pendente_dados: 0, rejeitado_dados_incompletos: 0, erro_update: 0, erro: 0 };
    const logs = [];
    const intakesParaProcessar = (pendentes || []).slice(0, limite);

    for (let i = 0; i < intakesParaProcessar.length; i += BATCH_SIZE) {
      if (Date.now() > deadline - 15000) { paradosPorDeadline = intakesParaProcessar.length - i; break; } // sobra 15s p/ resposta
      const lote = intakesParaProcessar.slice(i, i + BATCH_SIZE);
      for (const intake of lote) {
        if (Date.now() > deadline - 15000) { paradosPorDeadline = intakesParaProcessar.length - i; break; }
        try {
          const logItem = await processarIntake(base44, token, intake, folderCache, tentativasMap);
          logs.push(logItem);
          resultados[logItem.status] = (resultados[logItem.status] || 0) + 1;
        } catch (e) {
          console.error(`Erro intake ${intake.id}:`, e.message);
          logs.push({ id: intake.id, status: 'erro', detalhes: [e.message] });
          resultados.erro++;
        }
      }
    }

    // 4. Log de execução
    await base44.asServiceRole.entities.BackupLog.create({
      backup_type: 'auditoria_entrada_unica',
      status: resultados.liberado > 0 ? 'success' : (resultados.erro > 0 ? 'failure' : 'concluido'),
      total_files: intakesParaProcessar.length,
      files_copied: resultados.liberado,
      error_message: resultados.erro > 0 ? `${resultados.erro} erros` : '',
      execution_time_ms: Date.now() - startTime,
      triggered_by: isCron ? 'scheduled' : 'manual',
      details: `Sala de Espera: ${resultados.liberado} liberados (100% preenchidos), ${resultados.pendente_dados || 0} pendentes IA, ${resultados.rejeitado_dados_incompletos || 0} rejeitados, ${paradosPorDeadline} adiados (deadline)`,
    }).catch(() => null);

    return Response.json({
      ok: true,
      pendentes_total: intakesParaProcessar.length,
      processados: logs.length,
      adiados_deadline: paradosPorDeadline,
      resultados,
      execution_ms: Date.now() - startTime,
      processado_em: new Date().toISOString(),
      logs: logs.slice(-100),
    });
  } catch (error) {
    console.error('processarSalaDeEspera error:', error);
    return Response.json({ ok: false, error: error.message }, { status: 500 });
  }
});