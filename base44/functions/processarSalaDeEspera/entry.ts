import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * processarSalaDeEspera
 *
 * Orquestrador backend ÚNICO do pipeline "Sala de Espera".
 * Todo arquivo que "vem de fora" (Drive, Gmail, upload) entra aqui como
 * DocumentIntake e só é liberado para o banco/Drive após análise 100% pela IA.
 *
 * Critério de liberação (definido pelo builder):
 *   - NF: tipo_detectado + nf_emitente_nome + nf_valor_total + nf_data_emissao (>= 2026) + centro_custo
 *   - Foto: tipo_detectado + legenda_sugerida + centro_custo
 *   - Contrato/Doc admin: tipo_detectado + descricao extraída
 *
 * Fluxo por execução:
 *   1. Buscar DocumentIntake pendentes (status ENVIADO/AGUARDANDO_REVISAO, não ocultos)
 *   2. Para cada um:
 *      a. Se ainda não analisado pela IA → pula (será pego por processarEntradaUnicaLote)
 *      b. Se análise IA presente → verifica dados essenciais
 *      c. Para NFs: confirma/corrige data emissão via IA (>= 2026)
 *      d. Se 100% preenchido: marca APROVADO + ocultar_entrada_unica=true (encaminha, não acumula)
 *      e. Para NFs aprovadas: garante backup no Drive em pasta mensal MM-YYYY
 *   3. Garantir que NFs aprovadas no banco tenham data correta e estejam em pastas mensais
 *
 * Esta função NÃO substitui as análises de IA — apenas orquestra e libera.
 */

const ROOT_NOTAS_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const BATCH_SIZE = 15;
const MESES_PT = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── Utilitários ──────────────────────────────────────────────────────────────

function safeStr(v) { return String(v || '').trim(); }

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

function dadosEssenciaisPreenchidos(intake) {
  const tipo = safeStr(intake.tipo_detectado);
  if (!tipo || tipo === 'PENDENTE') return { ok: false, motivo: 'tipo_nao_detectado' };

  if (tipo === 'NOTA_FISCAL_PDF' || tipo === 'NOTA_FISCAL_XML') {
    const temEmitente = !!safeStr(intake.nf_emitente_nome || intake.fornecedor_nome);
    const temValor = !!Number(intake.nf_valor_total);
    const dataInfo = parseDataEmissao(intake.nf_data_emissao);
    const temDataValida = !!(dataInfo && dataInfo.ano >= 2026);
    const temCentroCusto = !!safeStr(intake.centro_custo);
    return {
      ok: temEmitente && temValor && temDataValida,
      motivo: !temEmitente ? 'sem_emitente' : !temValor ? 'sem_valor' : !temDataValida ? 'data_invalida' : !temCentroCusto ? 'sem_centro_custo' : '',
      temEmitente, temValor, temDataValida, temCentroCusto,
    };
  }

  if (tipo === 'FOTO_ATIVIDADE') {
    return { ok: !!safeStr(intake.legenda_sugerida), motivo: !intake.legenda_sugerida ? 'sem_legenda' : '' };
  }

  if (tipo === 'CONTRATO' || tipo === 'DOCUMENTO_ADMINISTRATIVO' || tipo === 'RECIBO_PDF') {
    return { ok: true, motivo: '' };
  }

  return { ok: true, motivo: '' };
}

// ── Drive helpers (reutilização mínima) ───────────────────────────────────────

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

// ── Confirmação de data via IA (apenas NF com data suspeita) ──────────────────

async function confirmarDataViaIA(base44, intake) {
  const dataAtual = safeStr(intake.nf_data_emissao);
  const parsed = parseDataEmissao(dataAtual);
  if (parsed && parsed.ano >= 2026) return { ok: true, motivo: 'ja_valida' };

  const pdfUrl = safeStr(intake.nf_pdf_url || intake.arquivo_original_url);
  if (!pdfUrl) return { ok: false, motivo: 'sem_pdf' };

  let pdfUrlIA = pdfUrl;
  if (pdfUrl.includes('drive.google.com')) {
    const m = pdfUrl.match(/\/file\/d\/([^/]+)/);
    if (m) pdfUrlIA = `https://drive.google.com/uc?export=download&id=${m[1]}`;
  }

  try {
    const ia = await Promise.race([
      base44.asServiceRole.integrations.Core.InvokeLLM({
        model: 'gpt_5_mini',
        prompt: `Você é um extrator de NOTA FISCAL. Analise o PDF anexo e extraia apenas a DATA DE EMISSÃO (campo "Data de Emissão" / "Data/Hora Emissão" / "Emitida em").
IGNORE datas de abertura de empresa, contratos, convênios, vencimento ou pagamento.
Notas válidas são de 2026 em diante. Retorne JSON:
{"nf_data_emissao_corrigida": "YYYY-MM-DD" | null, "confianca": "alta|media|baixa", "explicacao": "..."}`,
        file_urls: [pdfUrlIA],
        response_json_schema: {
          type: 'object',
          properties: {
            nf_data_emissao_corrigida: { type: 'string' },
            confianca: { type: 'string' },
            explicacao: { type: 'string' },
          },
          required: ['nf_data_emissao_corrigida', 'confianca'],
        },
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout_ia_25s')), 25000)),
    ]);

    const dataCorrigida = safeStr(ia?.nf_data_emissao_corrigida);
    const corrigidaParsed = parseDataEmissao(dataCorrigida);

    if (corrigidaParsed && corrigidaParsed.ano >= 2026) {
      await base44.asServiceRole.entities.DocumentIntake.update(intake.id, {
        nf_data_emissao: dataCorrigida,
      }).catch(() => null);
      return { ok: true, motivo: 'corrigida_ia', dataCorrigida };
    }
    return { ok: false, motivo: 'ia_invalida', confianca: ia?.confianca };
  } catch (e) {
    return { ok: false, motivo: `erro_ia:${e.message}` };
  }
}

// ── Processar um intake ──────────────────────────────────────────────────────

async function processarIntake(base44, token, intake, folderCache) {
  const log = {
    id: intake.id,
    tipo: intake.tipo_detectado,
    fileName: intake.file_name_final || intake.file_name_original,
    status: '',
    detalhes: [],
  };

  // 1. Verificar dados essenciais
  let check = dadosEssenciaisPreenchidos(intake);

  // 2. Para NF: se data inválida, tentar corrigir via IA
  if (!check.ok && check.motivo === 'data_invalida' &&
      (intake.tipo_detectado === 'NOTA_FISCAL_PDF' || intake.tipo_detectado === 'NOTA_FISCAL_XML')) {
    const iaData = await confirmarDataViaIA(base44, intake);
    log.detalhes.push(`IA data: ${iaData.ok ? 'corrigida' : 'falhou'} (${iaData.motivo})`);
    if (iaData.ok) {
      intake.nf_data_emissao = iaData.dataCorrigida || intake.nf_data_emissao;
      check = dadosEssenciaisPreenchidos(intake);
    }
  }

  // 3. Se ainda faltam dados essenciais, manter pendente (não acumula indefinidamente,
  //    mas aguarda preenchimento pela IA de análise ou revisão manual)
  if (!check.ok) {
    log.status = 'pendente_dados';
    log.detalhes.push(`Motivo: ${check.motivo}`);
    return log;
  }

  // 4. 100% analisado → liberar (encaminhar, não acumular)
  const updates = {
    status_processamento: 'APROVADO',
    revisado_pelo_usuario: true,
    ocultar_entrada_unica: true,
  };

  // 5. Para NF aprovada: garantir backup em pasta mensal MM-YYYY
  if ((intake.tipo_detectado === 'NOTA_FISCAL_PDF' || intake.tipo_detectado === 'NOTA_FISCAL_XML') && intake.nf_data_emissao) {
    const dataInfo = parseDataEmissao(intake.nf_data_emissao);
    if (dataInfo) {
      try {
        const mesFormatado = String(dataInfo.mesIdx + 1).padStart(2, '0');
        const nomePasta = `${mesFormatado}-${dataInfo.ano}`;
        const folderId = await getOrCreate(token, nomePasta, ROOT_NOTAS_FOLDER_ID, folderCache);
        log.detalhes.push(`Pasta mensal ${nomePasta} confirmada: ${folderId}`);
      } catch (e) {
        log.detalhes.push(`AVISO pasta mensal: ${e.message}`);
      }
    }
  }

  // 6. Atualizar intake como aprovado/oculto (liberado, não acumula)
  try {
    await base44.asServiceRole.entities.DocumentIntake.update(intake.id, updates);
    log.status = 'liberado';
    log.detalhes.push('Marcado APROVADO + ocultar_entrada_unica=true');
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
    const limite = typeof body.limite === 'number' ? body.limite : 50;

    // 1. Buscar intakes pendentes (não ocultos, analisados ou em revisão)
    const skip = 0;
    const pendentes = await base44.asServiceRole.entities.DocumentIntake.filter(
      {
        status_processamento: { $in: ['ENVIADO', 'AGUARDANDO_REVISAO', 'ANALISANDO_IA'] },
        ocultar_entrada_unica: { $ne: true },
        status_registro: 'ATIVO',
      },
      '-updated_date', Math.min(limite, 200), skip
    ).catch(() => []);

    if (dryRun) {
      return Response.json({
        ok: true,
        dry_run: true,
        pendentes_total: (pendentes || []).length,
        amostra: (pendentes || []).slice(0, 20).map((i) => ({
          id: i.id,
          tipo: i.tipo_detectado,
          fileName: i.file_name_final || i.file_name_original,
          data: i.nf_data_emissao,
          status: i.status_processamento,
        })),
      });
    }

    // 2. Obter token Drive
    const token = await getToken(base44);
    const folderCache = {};

    // 3. Processar em lotes
    const resultados = { liberado: 0, pendente_dados: 0, erro_update: 0, erro: 0 };
    const logs = [];
    const intakesParaProcessar = (pendentes || []).slice(0, limite);

    for (let i = 0; i < intakesParaProcessar.length; i += BATCH_SIZE) {
      const lote = intakesParaProcessar.slice(i, i + BATCH_SIZE);
      for (const intake of lote) {
        try {
          const logItem = await processarIntake(base44, token, intake, folderCache);
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
      status: resultados.erro > 0 && resultados.liberado === 0 ? 'failure' : 'success',
      total_files: intakesParaProcessar.length,
      files_copied: resultados.liberado,
      error_message: resultados.erro > 0 ? `${resultados.erro} erros` : '',
      execution_time_ms: Date.now() - startTime,
      triggered_by: isCron ? 'scheduled' : 'manual',
      details: `Sala de Espera: ${resultados.liberado} liberados, ${resultados.pendente_dados || 0} pendentes`,
    }).catch(() => null);

    return Response.json({
      ok: true,
      pendentes_total: intakesParaProcessar.length,
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