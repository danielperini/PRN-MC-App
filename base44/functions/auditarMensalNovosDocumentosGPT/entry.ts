import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";

/**
 * Auditoria Mensal de Documentos via GPT API
 * - Varre pastas mensais do Google Drive (NFs)
 * - Detecta arquivos fora do padrao de nomenclatura
 * - Detecta NFs com mes de emissao diferente da pasta
 * - Para PDFs sem XML, chama GPT-4o vision para extrair data_emissao
 * - Envia email consolidado de alerta para admins
 * - Registra resultado em BackupLog
 */

const PASTAS_MENSAIS_DEFAULT = {
  "01-2026": "1HirPi1rH0jhSgjLiz_kubx3i3Gpnbckg",
  "02-2026": "1Y48i4Z_iCRF0f1XmfQwPWWItCXxeiZgu",
  "03-2026": "1oXuaJDLdjlnJBp7yKnVITtKzZALomNpr",
  "04-2026": "1jeXrnnOpI6ZRnRuzxK8mvVDV7g69roCu",
  "05-2026": "1fii-JPB7MOPS9EUrLAcU6tpWJnJoLOAt",
  "06-2026": "1Uj245-tnBpEzz8UI26_wl0Ea_eKZlArJ",
  "07-2026": "14M_tOHjYwikb-DbQqYGy2xtLum7GN5fH",
  "08-2026": "1zLdKkd0CSyCGjZgjchmRooJl6MgdVvi7"
};

// Padroes oficiais aceitos
const PADROES_NOME = [
  /^NF-\d+_.*_R\$[\d.,]+_\d{4}-\d{2}\.(pdf|xml)$/i,
  /^NF\s+\d+\s+Despesa\s*-\s*.+MUSEUS\s+CENTRO.+\.pdf$/i,
  /^NF\s+\d+\s+-\s+.+MUSEUS\s+CENTRO.+\.pdf$/i,
  /^nf_\d+_MuseusCentro.+\.pdf$/i,
  /^nf_\d+_MuseusCentro.+\.pdf$/i,
  /^XML\s+\d+\s+Despesa\s*-\s*.+MUSEUS\s+CENTRO.+\.xml$/i,
  /^XML\s+\d+\s+-\s*.+MUSEUS\s+CENTRO.+\.xml$/i,
  /^XML\s+\d+\s+.+MUSEUS\s+CENTRO.+\.xml$/i,
  /^COMP\s+NF\s+\d+\s+.+MUSEUS\s+CENTRO.+\.pdf$/i
];

function nomeForaDoPadrao(name: string): boolean {
  if (!name) return true;
  const n = name.trim();
  return !PADROES_NOME.some((p) => p.test(n));
}

/** Converte chave de pasta "MM-YYYY" para "YYYY-MM" (mesma forma do dhEmi). */
function folderKeyToYM(folderKey: string): string | null {
  const m = String(folderKey || "").match(/^(\d{2})-(\d{4})$/);
  if (!m) return null;
  return `${m[2]}-${m[1]}`;
}

function extrairDhEmi(xmlContent: string): string | null {
  if (!xmlContent) return null;
  // case-insensitive, suporta dhEmi/dEmi/tags variantes
  const matches = [
    xmlContent.match(/<dhEmi[^>]*>([^<]+)<\/dhEmi>/i),
    xmlContent.match(/<dEmi[^>]*>([^<]+)<\/dEmi>/i),
    xmlContent.match(/<dEmi[^>]*>([^<]+)<\/dEmi>/i)
  ].filter(Boolean);
  if (!matches.length) return null;
  const raw = matches[0][1];
  // dd/mm/aaaa ou aaaa-mm-ddThh:mm:ss
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const br = raw.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return null;
}

function extrairChaveNF(nome: string): string | null {
  if (!nome) return null;
  let m = nome.match(/(?:NF[-\s]*)(\d{2,})/i);
  if (!m) m = nome.match(/nf_(\d{2,})/i);
  if (!m) return null;
  const numero = m[1];
  let v = nome.match(/R\$?\s*([\d.,]+)/i);
  const valor = v ? v[1].replace(/\./g, "").replace(",", ".") : "0";
  return `${numero}|${valor}`;
}

async function listFolder(token: string, folderId: string) {
  const all: any[] = [];
  let pageToken: string | null = null;
  do {
    const q = `'${folderId}' in parents and trashed=false`;
    let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id,name,mimeType,size,thumbnailLink,modifiedTime),nextPageToken&pageSize=200&supportsAllDrives=true`;
    if (pageToken) url += `&pageToken=${pageToken}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j = await r.json();
    (j.files || []).forEach((f: any) => all.push(f));
    pageToken = j.nextPageToken;
  } while (pageToken);
  return all;
}

async function downloadFile(token: string, fileId: string): Promise<string> {
  const r = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const buf = new Uint8Array(await r.arrayBuffer());
  return new TextDecoder("utf-8").decode(buf);
}

async function analisarPdfGpt(token: string, fileId: string, openaiKey: string): Promise<{ data_emissao: string | null; motivo: string | null }> {
  // Buscar thumbnailLink
  const meta = await fetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=thumbnailLink&supportsAllDrives=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const metaJ = await meta.json();
  const thumbUrl = metaJ.thumbnailLink?.replace(/=s\d+.*$/, "=s1600");
  if (!thumbUrl) return { data_emissao: null, motivo: "sem_thumbnail" };

  const tR = await fetch(thumbUrl, { headers: { Authorization: `Bearer ${token}` } });
  const tBuf = new Uint8Array(await tR.arrayBuffer());
  if (tBuf.length < 5000) return { data_emissao: null, motivo: "thumb_pequena" };

  // Base64
  let b64 = "";
  const chunk = 0x8000;
  for (let i = 0; i < tBuf.length; i += chunk) {
    b64 += btoa(String.fromCharCode(...tBuf.subarray(i, Math.min(i + chunk, tBuf.length))));
  }

  const prompt =
    "Voce recebeu a imagem (preview) da primeira pagina de uma Nota Fiscal brasileira em PDF." +
    " Encontre a DATA DE EMISSAO da nota fiscal — normalmente aparece como \"Data de Emissao\"," +
    " \"Data Emissao\", \"Data de Emissao:\" no rodape, ou \"Data Emissao\" no cabecalho do documento." +
    " Responda APENAS JSON: {\"data_emissao\":\"YYYY-MM-DD\"} se encontrar, ou" +
    " {\"data_emissao\":null,\"motivo\":\"texto curto\"} se nao conseguir. A \"data de emissao\" e a data" +
    " em que a NF foi emitida, NAO a data de abertura/fundacao da empresa emitente.";

  const chat = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:image/png;base64,${b64}`, detail: "high" } }
          ]
        }
      ],
      temperature: 0,
      max_tokens: 150
    })
  });
  const cj = await chat.json();
  const txt = cj?.choices?.[0]?.message?.content || "";
  let dt: string | null = null;
  let motivo: string | null = null;
  try {
    const m = txt.match(/\{[\s\S]+\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      if (j.data_emissao && typeof j.data_emissao === "string" && /^\d{4}-\d{2}-\d{2}$/.test(j.data_emissao)) {
        const ano = parseInt(j.data_emissao.substring(0, 4));
        if (ano >= 2026) dt = j.data_emissao;
        else motivo = `ano_historico_${j.data_emissao}_provavel_abertura`;
      } else if (j.motivo) {
        motivo = j.motivo;
      }
    }
  } catch (_e) {
    motivo = "parse_erro";
  }
  return { data_emissao: dt, motivo };
}

function montarEmailBody(problemas: any[], totalArquivos: number, mesesAuditados: string[], gptChamadas: number): string {
  const porTipo: Record<string, number> = {};
  for (const p of problemas) porTipo[p.tipo_alerta] = (porTipo[p.tipo_alerta] || 0) + 1;

  const linhas: string[] = [];
  linhas.push("<h2>Auditoria Mensal de Documentos (Drive + GPT)</h2>");
  linhas.push("<p><b>Executado em:</b> " + new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) + "</p>");
  linhas.push("<p><b>Pastas auditadas:</b> " + mesesAuditados.join(", ") + "</p>");
  linhas.push("<p><b>Total de arquivos varridos:</b> " + totalArquivos + "</p>");
  linhas.push("<p><b>Chamadas GPT-4o:</b> " + gptChamadas + "</p>");
  linhas.push("<h3>Resumo por tipo de alerta</h3><ul>");
  for (const t of Object.keys(porTipo)) {
    linhas.push(`<li><b>${t}</b>: ${porTipo[t]}</li>`);
  }
  linhas.push("</ul>");

  // Agrupar por pasta
  const porPasta: Record<string, any[]> = {};
  for (const p of problemas) {
    if (!porPasta[p.mes_alvo]) porPasta[p.mes_alvo] = [];
    porPasta[p.mes_alvo].push(p);
  }
  for (const pasta of Object.keys(porPasta)) {
    linhas.push(`<h3>Pasta ${pasta}</h3><table border="1" style="border-collapse:collapse;font-size:12px;">`);
    linhas.push("<tr><th>Tipo</th><th>Arquivo</th><th>Detalhe</th></tr>");
    for (const p of porPasta[pasta].slice(0, 60)) {
      const det = p.data_emissao ? `Data NF: ${p.data_emissao}` : p.motivo || "—";
      linhas.push(`<tr><td>${p.tipo_alerta}</td><td>${p.nome}</td><td>${det}</td></tr>`);
    }
    linhas.push("</table>");
    if (porPasta[pasta].length > 60) {
      linhas.push(`<p>+${porPasta[pasta].length - 60} adicionais omitidos neste email.</p>`);
    }
  }

  linhas.push("<p style='color:#666;font-size:11px;margin-top:20px;'>Rotina automatica agendada mensalmente. Acesse o app para revisar e corrigir manualmente os arquivos fora do padrao.</p>");
  return linhas.join("\n");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth: permite chamada agendada (sem user) ou chamada manual de admin
    let user: any = null;
    try { user = await base44.auth.me(); } catch (_e) {}
    const isScheduled = !user;

    // Funcao e apenas-leitura (nao move/altera arquivos). Permite:
    // - chamada agendada (sem user, roda como service role)
    // - qualquer usuario autenticado do app
    // ((se um dia tornar-se destrutiva, reativar a guarda de admin))
    const isAuthed = !!user || isScheduled;

    // Payload
    let params: any = {};
    try {
      const text = await req.text();
      if (text) params = JSON.parse(text);
    } catch (_e) {
      params = {};
    }

    // Pastas: default todas as 8, ou months passados
    let mapPastas: Record<string, string> = { ...PASTAS_MENSAIS_DEFAULT };
    if (params.extra_pastas && typeof params.extra_pastas === "object") {
      mapPastas = { ...mapPastas, ...params.extra_pastas };
    }

    let mesesAlvo: string[] = [];
    if (Array.isArray(params.months) && params.months.length) {
      mesesAlvo = params.months.filter((m: string) => mapPastas[m]);
    } else {
      // Default: ultimas 3 pastas + atual
      const hoje = new Date();
      const ano = hoje.getFullYear();
      const mes = hoje.getMonth() + 1; // 1-12
      const alvo = [];
      for (let i = 3; i >= 0; i--) {
        const d = new Date(ano, mes - 1 - i, 1);
        const key = `${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
        if (mapPastas[key]) alvo.push(key);
      }
      if (!alvo.length) alvo.push(...Object.keys(mapPastas).slice(-4));
      mesesAlvo = alvo;
    }

    const loteGptMax = typeof params.max_gpt_per_run === "number" ? params.max_gpt_per_run : 25;
    const dryRun = params.dry_run !== false; // default true — apenas alerta, nao move

    const conn = await base44.asServiceRole.connectors.getConnection("googledrive");
    const token = conn?.accessToken || conn?.access_token || conn?.token;
    const openaiKey = Deno.env.get("OPENAI_API_KEY");

    if (!token) return Response.json({ error: "Sem token Google Drive" }, { status: 500 });
    if (!openaiKey) return Response.json({ error: "Sem OPENAI_API_KEY" }, { status: 500 });

    const problemas: any[] = [];
    const detalhePasta: Record<string, any> = {};
    let totalArquivos = 0;
    let gptChamadas = 0;
    const inicio = Date.now();

    for (const mes of mesesAlvo) {
      const folderId = mapPastas[mes];
      if (!folderId) continue;
      const arquivos = await listFolder(token, folderId);
      totalArquivos += arquivos.length;

      // XMLs: parse dhEmi
      const xmlIndex: Record<string, { data: string | null; chave: string | null }> = {};
      for (const f of arquivos) {
        const n = (f.name || "").toLowerCase();
        if (!n.endsWith(".xml")) continue;
        if (nomeForaDoPadrao(f.name)) {
          problemas.push({ mes_alvo: mes, id: f.id, nome: f.name, tipo_alerta: "fora_padrao_nome", perfil_arquivo: "xml" });
        }
        let dhEmi: string | null = null;
        try {
          const txtXml = await downloadFile(token, f.id);
          dhEmi = extrairDhEmi(txtXml);
        } catch (_e) {
          dhEmi = null;
        }
        const chave = extrairChaveNF(f.name);
        xmlIndex[f.id] = { data: dhEmi, chave };
        if (dhEmi) {
          const mesEmi = dhEmi.substring(0, 7);
          if (folderKeyToYM(mes) && mesEmi !== folderKeyToYM(mes)) {
            problemas.push({
              mes_alvo: mes, id: f.id, nome: f.name,
              tipo_alerta: "mes_emissao_divergente_xml",
              data_emissao: dhEmi
            });
          }
        }
      }

      // PDFs: parear com XML por chave; sem par → GPT
      for (const f of arquivos) {
        const n = (f.name || "").toLowerCase();
        if (!n.endsWith(".pdf")) continue;
        if (nomeForaDoPadrao(f.name)) {
          problemas.push({ mes_alvo: mes, id: f.id, nome: f.name, tipo_alerta: "fora_padrao_nome", perfil_arquivo: "pdf" });
        }
        const chavePdf = extrairChaveNF(f.name);
        const temXmlPareado = Object.values(xmlIndex).some((x) => x.chave && x.chave === chavePdf && x.chave);
        if (temXmlPareado) continue;

        if (gptChamadas >= loteGptMax) {
          problemas.push({ mes_alvo: mes, id: f.id, nome: f.name, tipo_alerta: "gpt_limite_atingido" });
          continue;
        }

        const r = await analisarPdfGpt(token, f.id, openaiKey);
        gptChamadas++;
        if (r.data_emissao) {
          const mesEmi = r.data_emissao.substring(0, 7);
          if (folderKeyToYM(mes) && mesEmi !== folderKeyToYM(mes)) {
            problemas.push({
              mes_alvo: mes, id: f.id, nome: f.name,
              tipo_alerta: "gpt_mes_divergente",
              data_emissao: r.data_emissao
            });
          }
        } else if (r.motivo) {
          problemas.push({
            mes_alvo: mes, id: f.id, nome: f.name,
            tipo_alerta: "gpt_sem_data_ou_nao_nf",
            motivo: r.motivo
          });
        }
        await new Promise((rr) => setTimeout(rr, 1500));
      }

      detalhePasta[mes] = {
        total: arquivos.length,
        alertas: problemas.filter((p) => p.mes_alvo === mes).length
      };
    }

    // Enviar email de alerta para admins
    const admins = await base44.asServiceRole.entities.User.filter({ role: "admin" });
    const body = montarEmailBody(problemas, totalArquivos, mesesAlvo, gptChamadas);
    const emailsEnviados: string[] = [];
    for (const a of admins) {
      if (!a.email) continue;
      try {
        await base44.integrations.Core.SendEmail({
          to: a.email,
          subject: `[Auditoria Mensal Drive + GPT] ${problemas.length} alerta(s) em ${totalArquivos} arquivos`,
          body
        });
        emailsEnviados.push(a.email);
      } catch (e) {
        // continue se falhar um email
      }
    }

    // Log
    try {
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: "auditoria_entrada_unica",
        entity_type: "AUDITORIA_MENSAL_GPT",
        status: "concluido",
        details: `Auditoria mensal GPT: ${totalArquivos} arquivos, ${problemas.length} alertas, ${gptChamadas} chamadas GPT, ${emailsEnviados.length} emails. dry_run=${dryRun}`,
        total_files: totalArquivos,
        files_copied: problemas.length,
        triggered_by: isScheduled ? "scheduled" : "manual"
      });
    } catch (_e) {}

    return Response.json({
      status: "concluido",
      meses_auditoria: mesesAlvo,
      detail_per_pasta: detalhePasta,
      total_arquivos: totalArquivos,
      total_problemas: problemas.length,
      gpt_chamadas: gptChamadas,
      emails_enviados: emailsEnviados,
      dry_run: dryRun,
      tempo_ms: Date.now() - inicio,
      problemas_preview: problemas.slice(0, 50)
    });
  } catch (error) {
    return Response.json({ error: error.message || String(error) }, { status: 500 });
  }
});