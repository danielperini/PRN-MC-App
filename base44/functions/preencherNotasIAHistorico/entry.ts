import { createClientFromRequest } from "npm:@base44/sdk@0.8.41";

function norm(v: any): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}
function digits(v: any): string {
  return String(v ?? "").replace(/\D/g, "");
}
function isValidDate(s?: string | null): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");
}
function extractDriveId(url: any): string | null {
  if (!url) return null;
  const u = String(url);
  const m = u.match(/(?:\/file\/d\/|id=|fileId=)([a-zA-Z0-9_-]{20,})/);
  if (m) return m[1];
  const m2 = u.match(/^([a-zA-Z0-9_-]{25,})$/);
  return m2 ? m2[1] : null;
}
const CENTROS_VALIDOS = [
  "MUMO",
  "MIS",
  "MHAB",
  "Noturno nos Museus 2026",
  "Noturno 2026",
  "Noturno Pampulha",
  "Publicações",
  "Geral",
];
function classifyCentro(raw: any): string | null {
  if (!raw) return null;
  const n = norm(raw);
  const map: [string, string][] = [
    ["mumo", "MUMO"],
    ["mhab", "MHAB"],
    ["mhaab", "MHAB"],
    ["mha b", "MHAB"],
    ["noturno pampulha", "Noturno Pampulha"],
    ["noturno nos museus", "Noturno nos Museus 2026"],
    ["noturno na", "Noturno nos Museus 2026"],
    ["noturno 2026", "Noturno 2026"],
    ["publicac", "Publicações"],
    [" coord", "Geral"],
    ["coordenacao", "Geral"],
    ["transversal", "Geral"],
    ["geral", "Geral"],
    ["mis", "MIS"],
  ];
  for (const [k, v] of map) {
    if (n.includes(k)) return v;
  }
  if (CENTROS_VALIDOS.includes(String(raw))) return String(raw);
  return null;
}
function limpaCnpj(s: any): string {
  const d = digits(s);
  if (d.length !== 11 && d.length !== 14) return "";
  if (/^0+$/.test(d)) return "";
  if (/^12345678/.test(d)) return "";
  if (/0123456789/.test(d)) return "";
  if (/^(\d)\1+$/.test(d)) return "";
  return d;
}
function limpaNumero(s: any): string {
  const d = String(s || "").replace(/\D/g, "");
  if (d.length < 3) return "";
  if (/^0+$/.test(d)) return "";
  return d.slice(0, 20);
}
function bufToB64(buf: Uint8Array): string {
  const CHUNK = 0x8000;
  let bin = "";
  for (let i = 0; i < buf.length; i += CHUNK) {
    bin += String.fromCharCode(...buf.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    // Observacao: o gating de admin fica na UI (botao na pagina Compras,
    // visivel apenas para admins). A funcao roda em service-role para
    // processar todas as PRs do banco.

    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit || 60), 1), 120);
    const dryRun = !!body.dry_run;
    const idsOnly: string[] | null = Array.isArray(body.ids)
      ? body.ids.filter(Boolean)
      : null;

    // === Carrega PRs (historico base) ===
    const prs = await base44.asServiceRole.entities.PurchaseRequest.list(
      "-updated_date",
      300
    );

    // Historico: aprovadas/pagas com rubrica ou centro_custo
    const historico: any[] = [];
    for (const p of prs || []) {
      const s = String(p?.status || "").toUpperCase();
      if (
        ["APROVADO_COORD", "APROVADO_ADMIN", "PAGO"].includes(s) &&
        (p.rubrica_id || p.centro_custo) &&
        (p.nf_emitente_cpf_cnpj || p.fornecedor_cnpj || p.nf_emitente_nome)
      ) {
        historico.push(p);
      }
    }

    // Candidatos: com campos criticos faltando E com arquivo
    let cand: any[] = (prs || []).filter(
      (p) =>
        (!p.nf_numero ||
          !p.nf_data_emissao ||
          p.nf_valor_total == null ||
          !p.nf_emitente_nome ||
          !p.rubrica_id ||
          !p.centro_custo) &&
        (p.nota_fiscal_url ||
          p.arquivo_url ||
          p.file_url ||
          p.nf_pdf_url ||
          p.documento_url)
    );
    if (idsOnly && idsOnly.length) {
      const set = new Set(idsOnly);
      cand = cand.filter((p) => set.has(p.id));
    }
    cand = cand.slice(0, limit);

    // Rubricas: carregamos somente se houver candidatos que precisarem preencher
    // rubrica_nome (evitamos leitura pesada quando nao necessario).
    let rubricaNomePorId = new Map<string, string>();
    const precisaRubricaNome = cand.some((p) => !p.rubrica_id);
    if (precisaRubricaNome) {
      const rubricas =
        await base44.asServiceRole.entities.Rubrica.list("", 500).catch(() => []);
      for (const r of rubricas || []) {
        if (r?.id)
          rubricaNomePorId.set(r.id, String(r.rubrica || r.nome || r.descricao || ""));
      }
    }

    // === Drive token ===
    let driveToken: string | null = null;
    try {
      const conn: any = await base44.asServiceRole.connectors.getConnection(
        "googledrive"
      );
      driveToken =
        conn?.accessToken ||
        conn?.access_token ||
        conn?.token ||
        (typeof conn === "string" ? conn : null);
    } catch (_) {
      driveToken = null;
    }

    // === OpenAI ===
    let openai: any = null;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (openaiKey) {
      try {
        const M: any = await import("npm:openai@4.20.0");
        openai = new (M.default || M)({ apiKey: openaiKey });
      } catch (_) {}
    }

    function historicoMatch(
      cnpj: string,
      emitenteNorm: string
    ): {
      rubrica_id: string;
      centro_custo: string;
      meta_id: string;
      score: number;
      fonte: string;
    } | null {
      if (cnpj) {
        const m = historico.find(
          (p) =>
            digits(
              p.nf_emitente_cpf_cnpj || p.fornecedor_cnpj || p.fornecedor_cpf_cnpj || ""
            ) === cnpj &&
            (p.rubrica_id || p.centro_custo)
        );
        if (m)
          return {
            rubrica_id: m.rubrica_id,
            centro_custo: m.centro_custo,
            meta_id: m.meta_id || "",
            score: 95,
            fonte: "historico_cnpj",
          };
      }
      if (emitenteNorm) {
        const token = emitenteNorm.slice(0, 20);
        const m = historico.find((p) => {
          const n = norm(p.nf_emitente_nome || p.fornecedor_nome || "");
          if (!n) return false;
          return n.includes(token) || emitenteNorm.includes(n.slice(0, 20));
        });
        if (m && (m.rubrica_id || m.centro_custo))
          return {
            rubrica_id: m.rubrica_id || "",
            centro_custo: m.centro_custo || "",
            meta_id: m.meta_id || "",
            score: 80,
            fonte: "historico_emitente",
          };
      }
      return null;
    }

    async function iaExtract(pdfUrl: string, fid: string | null) {
      let buf: Uint8Array | null = null;
      const mime = "application/pdf";
      // tenta download via Drive API se tiver id
      if (fid && driveToken) {
        try {
          const r = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fid}?alt=media&supportsAllDrives=true`,
            { headers: { Authorization: `Bearer ${driveToken}` } }
          );
          if (r.ok) {
            buf = new Uint8Array(await r.arrayBuffer());
            const ct = r.headers.get("content-type") || "";
            if (ct) mime = ct.split(";")[0];
          }
        } catch (_) {}
      }
      // fallback: fetch direto (URLs publicas / assinadas)
      if (!buf) {
        try {
          const r = await fetch(pdfUrl);
          if (r.ok) {
            buf = new Uint8Array(await r.arrayBuffer());
            const ct = r.headers.get("content-type") || "";
            if (ct) mime = ct.split(";")[0];
          }
        } catch (_) {}
      }
      if (!buf) return { skip: "no_download" };
      if (buf.length > 18 * 1024 * 1024) return { skip: "too_big" };
      const b64 = bufToB64(buf);
      const dataUrl = `data:${mime};base64,${b64}`;
      if (!openai) return { skip: "no_openai" };

      const messages: any[] = [
        {
          role: "system",
          content:
            "Voce extrai dados estruturados de Notas Fiscais (PDF). Retorne APENAS um JSON valido com os campos solicitados. Use null quando o dado nao estiver visivel.",
        },
        {
          role: "user",
          content: [
            {
              type: "file",
              file: { filename: "nf.pdf", file_data: dataUrl },
            },
            {
              type: "text",
              text: "Extraia desta Nota Fiscal e retorne JSON com: nf_numero (apenas digitos), nf_valor_total (numero em reais, use ponto decimal), nf_emitente_nome (razao social do prestador), nf_emitente_cnpj (apenas digitos 11 ou 14), nf_data_emissao (YYYY-MM-DD), descricao_servico (uma frase curta do servico prestado), natureza_despesa (codigo da natureza ex 339039 se visivel), centro_custo (sugestao entre: MUMO, MIS, MHAB, Noturno Pampulha, Noturno 2026, Noturno nos Museus 2026, Publicacoes, Geral).",
            },
          ],
        },
      ];
      let resp: any;
      try {
        resp = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          response_format: { type: "json_object" },
        });
      } catch (e: any) {
        return { skip: "openai_err:" + String(e?.message || e).slice(0, 120) };
      }
      const content = resp?.choices?.[0]?.message?.content || "{}";
      let data: any = {};
      try {
        data = JSON.parse(content);
      } catch (_) {
        const m = String(content).match(/\{[\s\S]*\}/);
        if (m) {
          try {
            data = JSON.parse(m[0]);
          } catch (__) {}
        }
      }
      return { ia: data };
    }

    const updates: any[] = [];
    const logs: any[] = [];
    let semArquivo = 0;
    let iaFalhou = 0;

    // processa em paralelo de 8 em 8
    for (let i = 0; i < cand.length; i += 8) {
      const batch = cand.slice(i, i + 8);
      const rs = await Promise.all(
        batch.map(async (p) => {
          const url =
            p.nota_fiscal_url ||
            p.arquivo_url ||
            p.file_url ||
            p.nf_pdf_url ||
            p.documento_url;
          const fid = extractDriveId(url);
          if (!url) return { p, ext: { skip: "no_url" } };
          let ext: any = null;
          try {
            ext = await iaExtract(url, fid);
          } catch (e: any) {
            ext = { skip: "err:" + String(e?.message || e).slice(0, 100) };
          }
          return { p, ext, fid };
        })
      );

      for (const { p, ext, fid } of rs) {
        if (!ext?.ia) {
          if (ext?.skip === "no_url") semArquivo++;
          else iaFalhou++;
          logs.push({ id: p.id, skip: ext?.skip || "no_ia" });
          continue;
        }
        const ia = ext.ia;
        const patch: any = { id: p.id };
        if (!p.nf_numero && ia.nf_numero) {
          const n = limpaNumero(ia.nf_numero);
          if (n) patch.nf_numero = n;
        }
        if (p.nf_valor_total == null && ia.nf_valor_total != null)
          patch.nf_valor_total = Number(ia.nf_valor_total) || 0;
        if (!p.nf_emitente_nome && ia.nf_emitente_nome)
          patch.nf_emitente_nome = String(ia.nf_emitente_nome)
            .toUpperCase()
            .slice(0, 120);
        const cnpjIa = ia.nf_emitente_cnpj ? limpaCnpj(ia.nf_emitente_cnpj) : "";
        const cnpjHist =
          cnpjIa ||
          (p.nf_emitente_cpf_cnpj ? digits(p.nf_emitente_cpf_cnpj) : "") ||
          (p.fornecedor_cnpj ? digits(p.fornecedor_cnpj) : "") ||
          "";
        if (!p.nf_emitente_cpf_cnpj && cnpjIa)
          patch.nf_emitente_cpf_cnpj = cnpjIa;
        if (!p.fornecedor_cnpj && cnpjIa) patch.fornecedor_cnpj = cnpjIa;
        if (!p.nf_data_emissao && isValidDate(ia.nf_data_emissao)) {
          const ano = Number(ia.nf_data_emissao.slice(0, 4));
          if (ano >= 2020 && ano <= 2027) patch.nf_data_emissao = ia.nf_data_emissao;
        }
        if (!p.natureza_despesa && ia.natureza_despesa) {
          const nd = digits(ia.natureza_despesa);
          if (nd.length >= 6) patch.natureza_despesa = nd.slice(0, 6);
        }
        if (
          (!p.descricao_item || String(p.descricao_item).length < 8) &&
          ia.descricao_servico
        )
          patch.descricao_item = String(ia.descricao_servico).slice(0, 180);

        // rubrica / centro de custo: historico (preferencia) -> IA
        if (!p.rubrica_id || !p.centro_custo) {
          const emitenteNorm = norm(
            ia.nf_emitente_nome || p.nf_emitente_nome || p.fornecedor_nome || ""
          );
          const hm = historicoMatch(cnpjHist, emitenteNorm);
          let rubId = p.rubrica_id || "";
          let cc = p.centro_custo || "";
          let meta = p.meta_id || "";
          if (hm) {
            if (!rubId) rubId = hm.rubrica_id;
            if (!cc) cc = hm.centro_custo;
            if (!meta) meta = hm.meta_id;
          }
          if (!cc) {
            const ccSug = classifyCentro(ia.centro_custo);
            if (ccSug) cc = ccSug;
          }
          if (rubId && cc) {
            patch.rubrica_id = rubId;
            patch.rubrica_nome = rubricaNomePorId.get(rubId) || p.rubrica_nome || "";
            patch.centro_custo = cc;
            if (meta) patch.meta_id = meta;
          } else if (cc && !p.centro_custo) {
            patch.centro_custo = cc;
          }
        }

        if (Object.keys(patch).length > 1) updates.push(patch);
        logs.push({
          id: p.id,
          ia_num: ia.nf_numero || null,
          ia_data: ia.nf_data_emissao || null,
          ia_valor: ia.nf_valor_total ?? null,
          emit: ia.nf_emitente_nome ? String(ia.nf_emitente_nome).slice(0, 28) : null,
          cnpj: cnpjIa || null,
          cc: patch.centro_custo || null,
          rubrica: !!patch.rubrica_id,
        });
      }
    }

    let bulkRes: any = null;
    if (updates.length && !dryRun) {
      bulkRes = await base44.asServiceRole.entities.PurchaseRequest.bulkUpdate(
        updates
      );
    }

    return Response.json({
      success: true,
      processados: cand.length,
      extraidos_ok: updates.length,
      atualizados: dryRun ? 0 : bulkRes?.updated ?? updates.length,
      sem_arquivo: semArquivo,
      ia_falhou: iaFalhou,
      dry_run: dryRun,
      amostra: logs.slice(0, 25),
    });
  } catch (error: any) {
    return Response.json(
      { error: error.message, stack: error.stack ?? null },
      { status: 500 }
    );
  }
});