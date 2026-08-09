import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

/**
 * Auditoria EntradaUnica Deterministica + GPT Direto
 * ====================================================
 * Economiza creditos de integracao Base44:
 *  - XMLs: parser deterministico (sem IA)
 *  - PDFs: thumbnail do Drive -> OpenAI direto (sem InvokeLLM, sem UploadFile)
 *  - Sem UploadFile: nenhum gasto de credito de integracao Base44
 *  - Sem InvokeLLM: nenhuma chamada a integracao Base44 Core
 *  - Apenas GPT API direta via OPENAI_API_KEY (custo OpenAI, nao Base44)
 *  - Move+renomeia via Google Drive API (conector, sem custo de integracao)
 *
 * Operacao:
 *  1. Le BackupLog registros com backup_type='auditoria_entrada_unica'
 *     e entity_type = op_id informado (default ORD_EXTRAORD_08_2026_v1)
 *  2. Filtra pendentes (processing_stage ausente) e primarios (dedup_is_primary)
 *  3. Para XMLs: extrai dhEmi deterministico -> mover para pasta mensal correta
 *  4. Para PDFs: baixa thumbnail do Drive -> GPT direto (api.openai.com) ->
 *     parse JSON -> mover para pasta mensal correta se data_emissao valida
 *  5. Limite maximo 10 PDFs por execucao (economia de tokens OpenAI)
 *  6. Atualiza BackupLog com resultado (processing_stage, parsed, movimentacao)
 *
 * Modo:
 *  - agendado (sem user): service role
 *  - manual (qualquer user autenticado): igual
 */

const REVISAO_PARENT_ID = "1sGMRycQEFrD6f4FtGGWdUbJKyWNFMXGy";

const PASTAS_MENSAIS: Record<string, string> = {
  "01-2026": "1HirPi1rH0jhSgjLiz_kubx3i3Gpnbckg",
  "02-2026": "1Y48i4Z_iCRF0f1XmfQwPWWItCXxeiZgu",
  "03-2026": "1oXuaJDLdjlnJBp7yKnVITtKzZALomNpr",
  "04-2026": "1jeXrnnOpI6ZRnRuzxK8mvVDV7g69roCu",
  "05-2026": "1fii-JPB7MOPS9EUrLAcU6tpWJnJoLOAt",
  "06-2026": "1Uj245-tnBpEzz8UI26_wl0Ea_eKZlArJ",
  "07-2026": "14M_tOHjYwikb-DbQqYGy2xtLum7GN5fH",
  "08-2026": "1zLdKkd0CSyCGjZgjchmRooJl6MgdVvi7"
};

const OP_ID_DEFAULT = "ORD_EXTRAORD_08_2026_v1";

// ─── Helpers deterministicos ─────────────────────────────────
const onlyDigits = (v: any) => String(v ?? "").replace(/\D+/g, "");
const safeStr = (v: any) => String(v ?? "").trim();

function parseMoneyBR(v: any) {
  const raw = safeStr(v).replace(/[R$\s]/g, "").replace(/\.(?=\d{3}(?:\D|$))/g, "").replace(",", ".");
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function sanitizeNome(v: any, m = 60) {
  return String(v || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9\s\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, m)
    .trim();
}
function sanitizeNum(v: any) {
  const n = String(v || "").match(/\d+/g);
  return n ? n[n.length - 1].replace(/^0+(\d)/, "$1") : "SN";
}
function fmtVal(v: any) {
  return Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function computeMonth(e: any) {
  const m = String(e || "").match(/^(\d{4})-(\d{2})/);
  return m ? `${m[2]}-${m[1]}` : null;
}

function extrairDhEmi(xml: string): string | null {
  if (!xml) return null;
  const matches = [
    xml.match(/<dhEmi[^>]*>([^<]+)<\/dhEmi>/i),
    xml.match(/<dEmi[^>]*>([^<]+)<\/dEmi>/i),
    xml.match(/<DataEmissao[^>]*>([^<]+)<\/DataEmissao>/i),
    xml.match(/<Competencia[^>]*>([^<]+)<\/Competencia>/i),
  ].filter(Boolean);
  if (!matches.length) return null;
  const raw = matches[0][1];
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function parseXmlDeterministico(xml: string) {
  const tag = (re: RegExp) => {
    const m = xml.match(re);
    return (m?.[1] || "").trim();
  };
  const block = (name: string) => {
    const m = xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, "i"));
    return m?.[1] || "";
  };
  const tEmit = block("emit");
  return {
    nf_emitente_cpf_cnpj:
      onlyDigits(tag(/<CNPJ[^>]*>(\d+)<\/CNPJ>/i) || tEmit.match(/<CNPJ[^>]*>(\d+)<\/CNPJ>/i)?.[1] || tag(/<CPF[^>]*>(\d+)<\/CPF>/i)),
    nf_emitente_nome: tag(/<xNome[^>]*>([^<]+)<\/xNome>/i) || tEmit.match(/<xNome[^>]*>([^<]+)<\/xNome>/i)?.[1] || tag(/<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i),
    nf_numero: onlyDigits(tag(/<nNF[^>]*>(\d+)<\/nNF>/i) || tag(/<Numero[^>]*>(\d+)<\/Numero>/i) || tag(/<nNfse[^>]*>(\d+)<\/nNfse>/i)),
    nf_serie: tag(/<serie[^>]*>([^<]+)<\/serie>/i) || tag(/<Serie[^>]*>([^<]+)<\/Serie>/i) || "",
    nf_valor_total: parseMoneyBR(tag(/<vNF[^>]*>([\d.,]+)<\/vNF>/i) || tag(/<ValorTotal[^>]*>([\d.,]+)<\/ValorTotal>/i) || tag(/<ValorServicos[^>]*>([\d.,]+)<\/ValorServicos>/i)),
    nf_chave_acesso: onlyDigits(tag(/<chNFe[^>]*>(\d{44})<\/chNFe>/i) || tag(/<ChaveAcesso[^>]*>(\d+)<\/ChaveAcesso>/i)).slice(0, 44),
    nf_data_emissao: extrairDhEmi(xml),
    descricao_servico: tag(/<xServ[^>]*>([^<]+)<\/xServ>/i) || tag(/<Discriminacao[^>]*>([^<]+)/i),
    municipio: tag(/<xMun[^>]*>([^<]+)<\/xMun>/i) || tag(/<Municipio[^>]*>([^<]+)<\/Municipio>/i),
  };
}

// ─── Download XML/PDF do Drive ───────────────────────────────
async function downloadTextFromDrive(token: string, fileId: string): Promise<string> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`download_${r.status}`);
  const buf = new Uint8Array(await r.arrayBuffer());
  return new TextDecoder("utf-8").decode(buf);
}

// ─── Download PDF bytes do Drive ────────────────────────────
async function baixarPdfBytes(token: string, fileId: string): Promise<Uint8Array> {
  const r = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(`download_pdf_${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

// ─── Upload direto OpenAI Files API (sem Base44 UploadFile) ───
async function uploadToOpenAIFiles(openaiKey: string, bytes: Uint8Array, filename: string): Promise<string> {
  const fd = new FormData();
  fd.append("purpose", "user_data");
  fd.append("file", new Blob([bytes], { type: "application/pdf" }), filename || "nf.pdf");
  const r = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}` },
    body: fd,
    signal: AbortSignal.timeout(90_000),
  });
  if (!r.ok) throw new Error(`OpenAI Files ${r.status}: ${(await r.text().catch(() => r.statusText)).slice(0, 200)}`);
  const data: any = await r.json();
  if (!data?.id) throw new Error("OpenAI Files sem id");
  return data.id;
}

// ─── OpenAI direto via Files API (sem InvokeLLM) ─────────────
async function gptPdfDataEmissao(openaiKey: string, pdfFileId: string): Promise<any> {
  const prompt =
    "Analise este PDF (nota fiscal brasileira). Encontre a DATA DE EMISSAO da nota fiscal —" +
    " normalmente aparece como \"Data de Emissao\", \"Data Emissao\", \"Emitida em\"," +
    " \"Data de geracao da NFS-e\" ou \"Data de autorizacao\"." +
    " A \"data de emissao\" e a data em que a NF foi emitida, NAO a data de abertura/fundacao da empresa." +
    " Extraia tambem: nf_numero (digitos), emitente_nome, valor_total (numero em reais, NAO multiplicar por 100)," +
    " tipo (NF-e|NFS-e|NFC-e|boleto|recibo|comprovante|outro), nivel_confianca (0-100)," +
    " parece_invalido (true se NAO for PDF valido / for HTML wrapper / placeholder)." +
    ' Responda APENAS JSON: {"data_emissao":"YYYY-MM-DD"|null,"nf_numero":"...","emitente_nome":"...","valor_total":0,"tipo":"...","nivel_confianca":0,"parece_invalido":false,"motivo":null}.';

  const body = {
    model: "gpt-4o",
    messages: [
      {
        role: "user",
        content: [
          { type: "file", file: { file_id: pdfFileId } },
          { type: "text", text: prompt },
        ],
      },
    ],
    temperature: 0,
    max_tokens: 200,
  };

  let lastErr: any = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(90_000),
      });
      if (!r.ok) {
        const t = await r.text().catch(() => r.statusText);
        throw new Error(`OpenAI ${r.status}: ${t.slice(0, 200)}`);
      }
      const data: any = await r.json();
      const txt: string = data?.choices?.[0]?.message?.content || "";
      const m = txt.match(/\{[\s\S]+\}/);
      if (!m) return { data_emissao: null, nf_numero: null, emitente_nome: null, valor_total: 0, tipo: null, nivel_confianca: 0, parece_invalido: true, motivo: "sem_json" };
      const j = JSON.parse(m[0]);
      return j;
    } catch (e: any) {
      lastErr = e;
      await new Promise((rr) => setTimeout(rr, 1500));
    }
  }
  throw lastErr;
}

// ─── Move+rename via Drive API ───────────────────────────────
async function moverArquivo(token: string, fileId: string, destinoFolderId: string, novoNome: string, mimeSuffix: "pdf" | "xml"): Promise<{ ok: boolean; motivo?: string; novo_nome?: string }> {
  const url = `https://www.googleapis.com/drive/v3/files/${fileId}?addParents=${encodeURIComponent(destinoFolderId)}&removeParents=${encodeURIComponent(REVISAO_PARENT_ID)}&supportsAllDrives=true&fields=id,name,parents`;
  try {
    const r = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: novoNome }),
    });
    if (!r.ok) return { ok: false, motivo: `move_http_${r.status}` };
    const data = await r.json();
    return { ok: true, novo_nome: data.name };
  } catch (e: any) {
    return { ok: false, motivo: e.message };
  }
}

// ─── Orquestracao principal ──────────────────────────────────
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    let user: any = null;
    try { user = await base44.auth.me(); } catch (_e) { user = null; }
    const isScheduled = !user;

    let params: any = {};
    try {
      const text = await req.text();
      if (text) params = JSON.parse(text);
    } catch (_e) { params = {}; }

    const opId = params.op_id || OP_ID_DEFAULT;
    const batchPdfMax = typeof params.batch_pdf === "number" ? params.batch_pdf : 10;
    const dryRun = params.dry_run === true;

    const conn: any = await base44.asServiceRole.connectors.getConnection("googledrive");
    const token = conn?.accessToken || conn?.access_token || conn?.token;
    if (!token) return Response.json({ error: "Sem token Google Drive" }, { status: 500 });

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) return Response.json({ error: "Sem OPENAI_API_KEY" }, { status: 500 });

    // Carrega BackupLog da operacao
    const allLogs = await base44.asServiceRole.entities.BackupLog.filter(
      { backup_type: "auditoria_entrada_unica", entity_type: opId },
      "created_date",
      1000
    );

    const pendentesXml: any[] = [];
    const pendentesPdf: any[] = [];
    for (const log of allLogs) {
      let d: any;
      try { d = JSON.parse(log.details || "{}"); } catch { continue; }
      if (d.eh_xml) {
        if (d.processing_stage === "xml_parsed" || d.processing_stage === "parse_error") continue;
        if (!d.dedup_is_primary) continue;
        pendentesXml.push({
          log_id: log.id,
          file_id: log.drive_file_id,
          file_name: log.file_name,
          meta: d,
        });
      } else {
        if (d.processing_stage === "pdf_parsed" || d.processing_stage === "parse_error") continue;
        if (!d.dedup_is_primary) continue;
        if (d.mime !== "application/pdf") continue;
        pendentesPdf.push({
          log_id: log.id,
          file_id: log.drive_file_id,
          file_name: log.file_name,
          meta: d,
        });
      }
    }

    // ─── XMLs: parse deterministico (sem IA) ──────────────
    const xmlProcessados: any[] = [];
    const xmlMovidos: any[] = [];
    for (const item of pendentesXml) {
      try {
        const xmlText = await downloadTextFromDrive(token, item.file_id);
        // Detectar HTML disfarcado
        if (!xmlText.includes("<") || xmlText.toLowerCase().includes("<html")) {
          const merged = { ...item.meta, processing_stage: "parse_error", error_msg: "xml_invalido_html" };
          await base44.asServiceRole.entities.BackupLog.update(item.log_id, {
            status: "erro_ia",
            details: JSON.stringify(merged),
          });
          xmlProcessados.push({ name: item.file_name.slice(0, 40), ok: false, motivo: "xml_invalido" });
          continue;
        }
        const parsed = parseXmlDeterministico(xmlText);
        if (!parsed.nf_data_emissao) {
          const merged = { ...item.meta, processing_stage: "parse_error", error_msg: "sem_dhEmi", parsed };
          await base44.asServiceRole.entities.BackupLog.update(item.log_id, {
            status: "erro_ia",
            details: JSON.stringify(merged),
          });
          xmlProcessados.push({ name: item.file_name.slice(0, 40), ok: false, motivo: "sem_dhEmi" });
          continue;
        }
        const mm = computeMonth(parsed.nf_data_emissao);
        const destinoFolderId = mm ? PASTAS_MENSAIS[mm] : null;
        const moved = destinoFolderId && !dryRun
          ? await moverArquivo(token, item.file_id, destinoFolderId, `XML ${sanitizeNum(parsed.nf_numero)} Despesa - ${sanitizeNome(parsed.nf_emitente_nome) || "FORNECEDOR"} - MUSEUS CENTRO - R$ ${fmtVal(parsed.nf_valor_total)}.xml`, "xml")
          : { ok: false, motivo: dryRun ? "dry_run" : "sem_pasta_destino" };
        const merged = {
          ...item.meta,
          processing_stage: "xml_parsed",
          ...parsed,
          movido_para_pasta: moved.ok ? mm : null,
          novo_nome_canonico: moved.ok ? moved.novo_nome : null,
          movimentacao_status: moved.ok ? "movido_renomeado" : "nao_movido",
          movimentacao_motivo: moved.ok ? null : moved.motivo,
        };
        await base44.asServiceRole.entities.BackupLog.update(item.log_id, {
          status: "concluido",
          details: JSON.stringify(merged),
        });
        xmlProcessados.push({ name: item.file_name.slice(0, 40), ok: true, mm });
        if (moved.ok) xmlMovidos.push({ name: item.file_name.slice(0, 40), mm, novo_nome: moved.novo_nome });
      } catch (e: any) {
        const merged = { ...item.meta, processing_stage: "parse_error", error_msg: e.message };
        await base44.asServiceRole.entities.BackupLog.update(item.log_id, {
          status: "erro_ia",
          error_message: e.message,
          details: JSON.stringify(merged),
        });
        xmlProcessados.push({ name: item.file_name.slice(0, 40), ok: false, motivo: e.message.slice(0, 100) });
      }
    }

    // ─── PDFs: thumbnail -> GPT direto ─────────────────────
    const batch = pendentesPdf.slice(0, batchPdfMax);
    const pdfProcessados: any[] = [];
    const pdfMovidos: any[] = [];
    let gptChamadas = 0;
    for (const item of batch) {
      try {
        let pdfBytes: Uint8Array;
        try {
          pdfBytes = await baixarPdfBytes(token, item.file_id);
        } catch (e: any) {
          const merged = { ...item.meta, processing_stage: "parse_error", error_msg: "download_pdf_falhou: " + e.message };
          await base44.asServiceRole.entities.BackupLog.update(item.log_id, {
            status: "erro_ia",
            details: JSON.stringify(merged),
          });
          pdfProcessados.push({ name: item.file_name.slice(0, 40), ok: false, motivo: "download_pdf_falhou" });
          continue;
        }
        if (pdfBytes.length > 25 * 1024 * 1024) {
          const merged = { ...item.meta, processing_stage: "parse_error", error_msg: "pdf_grande_25mb" };
          await base44.asServiceRole.entities.BackupLog.update(item.log_id, {
            status: "erro_ia",
            details: JSON.stringify(merged),
          });
          pdfProcessados.push({ name: item.file_name.slice(0, 40), ok: false, motivo: "pdf_grande" });
          continue;
        }

        let openaiFileId: string;
        try {
          openaiFileId = await uploadToOpenAIFiles(openaiKey, pdfBytes, item.file_name || "nf.pdf");
        } catch (e: any) {
          const merged = { ...item.meta, processing_stage: "parse_error", error_msg: "upload_openai_files_falhou: " + e.message };
          await base44.asServiceRole.entities.BackupLog.update(item.log_id, {
            status: "erro_ia",
            details: JSON.stringify(merged),
          });
          pdfProcessados.push({ name: item.file_name.slice(0, 40), ok: false, motivo: "upload_openai_files_falhou" });
          continue;
        }

        const parsed: any = await gptPdfDataEmissao(openaiKey, openaiFileId);
        gptChamadas++;

        if (!parsed || parsed.parece_invalido || !parsed.data_emissao || (parsed.nivel_confianca || 0) < 80) {
          const merged = {
            ...item.meta,
            processing_stage: "pdf_parsed",
            ...parsed,
            eh_pdf: true,
            movimentacao_status: "nao_movido",
            movimentacao_motivo: parsed?.parece_invalido ? "invalido" : !parsed?.data_emissao ? "sem_data" : "confianca_baixa",
          };
          await base44.asServiceRole.entities.BackupLog.update(item.log_id, {
            status: "concluido",
            details: JSON.stringify(merged),
          });
          pdfProcessados.push({
            name: item.file_name.slice(0, 40),
            ok: true,
            movido: false,
            motivo: parsed?.parece_invalido ? "invalido" : !parsed?.data_emissao ? "sem_data" : "confianca_baixa",
          });
          continue;
        }

        const mm = computeMonth(parsed.data_emissao);
        const destinoFolderId = mm ? PASTAS_MENSAIS[mm] : null;
        const moved = destinoFolderId && !dryRun
          ? await moverArquivo(token, item.file_id, destinoFolderId, `NF ${sanitizeNum(parsed.nf_numero)} Despesa - ${sanitizeNome(parsed.emitente_nome) || "FORNECEDOR"} - MUSEUS CENTRO - R$ ${fmtVal(parsed.valor_total)}.pdf`, "pdf")
          : { ok: false, motivo: dryRun ? "dry_run" : "sem_pasta_destino" };
        const merged = {
          ...item.meta,
          processing_stage: "pdf_parsed",
          ...parsed,
          eh_pdf: true,
          movido_para_pasta: moved.ok ? mm : null,
          novo_nome_canonico: moved.ok ? moved.novo_nome : null,
          movimentacao_status: moved.ok ? "movido_renomeado" : "nao_movido",
          movimentacao_motivo: moved.ok ? null : moved.motivo,
        };
        await base44.asServiceRole.entities.BackupLog.update(item.log_id, {
          status: "concluido",
          details: JSON.stringify(merged),
        });
        pdfProcessados.push({ name: item.file_name.slice(0, 40), ok: true, movido: moved.ok, mm });
        if (moved.ok) pdfMovidos.push({ name: item.file_name.slice(0, 40), mm, novo_nome: moved.novo_nome });
        await new Promise((r) => setTimeout(r, 2500));
      } catch (e: any) {
        const merged = { ...item.meta, processing_stage: "parse_error", error_msg: e.message };
        await base44.asServiceRole.entities.BackupLog.update(item.log_id, {
          status: "erro_ia",
          error_message: e.message,
          details: JSON.stringify(merged),
        });
        pdfProcessados.push({ name: item.file_name.slice(0, 40), ok: false, motivo: e.message.slice(0, 100) });
      }
    }

    // Log consolidado
    try {
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: "auditoria_entrada_unica",
        entity_type: "AUDITORIA_DETERMINISTICA_RESUMO",
        status: "concluido",
        details: `op_id=${opId} | xml_pendentes=${pendentesXml.length} xml_movidos=${xmlMovidos.length} | pdf_batch=${batch.length}/${pendentesPdf.length} pdf_movidos=${pdfMovidos.length} gpt_chamadas=${gptChamadas} dry_run=${dryRun}`,
        total_files: pendentesXml.length + batch.length,
        files_copied: xmlMovidos.length + pdfMovidos.length,
        triggered_by: isScheduled ? "scheduled" : "manual",
      });
    } catch (_e) { /* log falhou nao bloqueia */ }

    const pdfMotivos = pdfProcessados.filter((x) => !x.movido).reduce((a: any, x: any) => {
      const m = x.motivo || (x.ok ? "sem_classificacao" : "parse_error");
      a[m] = (a[m] || 0) + 1;
      return a;
    }, {});

    return Response.json({
      status: "concluido",
      op_id: opId,
      economia_integracao: {
        invoke_llm_evitado: true,
        upload_file_evitado: true,
        openai_direto_chamadas: gptChamadas,
        xml_deterministico_sem_ia: pendentesXml.length,
      },
      xml: {
        pendentes: pendentesXml.length,
        processados: xmlProcessados.length,
        ok: xmlProcessados.filter((x) => x.ok).length,
        movidos: xmlMovidos.length,
      },
      pdf: {
        pendentes_total: pendentesPdf.length,
        batch_max: batchPdfMax,
        processados: pdfProcessados.length,
        ok: pdfProcessados.filter((x) => x.ok).length,
        movidos: pdfMovidos.length,
        gpt_chamadas: gptChamadas,
        nao_movidos_por_motivo: pdfMotivos,
        detalhes: pdfProcessados.slice(0, batchPdfMax),
      },
      dry_run: dryRun,
      triggered_by: isScheduled ? "scheduled" : "manual",
      preview_pdf: pdfMovidos.slice(0, 10),
      preview_xml: xmlMovidos.slice(0, 10),
    });
  } catch (error: any) {
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
});