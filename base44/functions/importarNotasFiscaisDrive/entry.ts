import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admin' }, { status: 403 });
    }

    const body = await req.json();
    const { folderId, skipAI } = body || {};

    if (!folderId) return Response.json({ error: 'folderId obrigatório' }, { status: 400 });

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const authHeader = { Authorization: `Bearer ${accessToken}` };

    async function listAll(parentId, depth = 0): Promise<any[]> {
      if (depth > 8) return [];
      let files: any[] = [], pt: string | null = null;
      do {
        const url = `https://www.googleapis.com/drive/v3/files?q='${parentId}'+in+parents+and+trashed=false&fields=nextPageToken,files(id,name,mimeType,size)&pageSize=500&orderBy=name` + (pt ? `&pageToken=${pt}` : '');
        const r = await fetch(url, { headers: authHeader });
        const d = await r.json();
        for (const f of (d.files || [])) {
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            files.push(...await listAll(f.id, depth + 1));
          } else {
            files.push(f);
          }
        }
        pt = d.nextPageToken || null;
      } while (pt);
      return files;
    }

    const allFiles = await listAll(folderId);

    function normalizeName(name) {
      return name.replace(/\.(pdf|xml)$/i, '').replace(/\bCOMP\b/i, '').replace(/\bMUSEUS CENTRO\b/gi, '')
        .replace(/\bMHAB\b|\bMUMO\b|\bMIS\b/gi, '').replace(/R\$\s*[\d.,]+/gi, '').replace(/\s+/g, ' ').trim();
    }

    function extractNumber(filename) {
      const base = filename.replace(/\.(pdf|xml)$/i, '');
      const nfMatch = base.match(/NF\s*[nN°]*\s*(\d+)/i);
      if (nfMatch) return nfMatch[1];
      const startMatch = base.match(/^(\d+)\s/);
      if (startMatch) return startMatch[1];
      return null;
    }

    function extractValue(filename) {
      const valMatch = filename.match(/R\$\s*([\d.,]+)/i);
      return valMatch ? parseFloat(valMatch[1].replace(/\./g, '').replace(',', '.')) : null;
    }

    const groups = {};
    const nfFiles = allFiles.filter(f => {
      const n = String(f.name || '');
      return n.toLowerCase().endsWith('.pdf') || n.toLowerCase().endsWith('.xml');
    });

    for (const file of nfFiles) {
      const nfNum = extractNumber(file.name);
      const normName = normalizeName(file.name);
      const nameParts = normName.split(' ').slice(0, 4).join(' ');
      const key = `${nfNum || 'NO_NUM'}__${nameParts}`;

      if (!groups[key]) {
        groups[key] = { nfNum, normName, pdfNf: null, pdfComp: null, xml: null };
      }
      const grp = groups[key];
      const nm = file.name.toLowerCase();
      if (nm.endsWith('.pdf')) {
        if (nm.includes('comp') || nm.includes('comprovante')) {
          if (!grp.pdfComp) grp.pdfComp = file;
        } else {
          if (!grp.pdfNf) grp.pdfNf = file;
        }
      } else if (nm.endsWith('.xml')) {
        if (!grp.xml) grp.xml = file;
      }
    }

    // Filtrar: apenas grupos com PDF de NF e que não sejam extratos
    const validGroups = Object.values(groups).filter(g => {
      if (!g.pdfNf) return false;
      const name = g.pdfNf.name.toLowerCase();
      if (name.includes('extrato') || name.includes('boleto')) return false;
      return true;
    });

    const log = [];
    const results = [];
    log.push(`${allFiles.length} arquivos → ${validGroups.length} grupos NF para processar`);

    for (const group of validGroups) {
      const { nfNum, pdfNf, pdfComp, xml } = group;
      const valFromName = extractValue(pdfNf.name);
      log.push(`\n📄 NF ${nfNum}: ${pdfNf.name.substring(0, 80)}`);

      // Upload PDF
      let pdfUrl = null, xmlUrl = null, compUrl = null;
      try {
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfNf.id}?alt=media`, { headers: authHeader });
        if (!res.ok) throw new Error(`Drive: ${res.status}`);
        const blob = await res.blob();
        const file = new File([blob], pdfNf.name, { type: 'application/pdf' });
        const up = await base44.asServiceRole.integrations.Core.UploadFile({ file });
        pdfUrl = up.file_url;
        log.push(`  PDF ✓`);
      } catch (e) { log.push(`  Erro PDF: ${e.message}`); results.push({ nfNum, error: e.message }); continue; }

      if (xml) {
        try {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${xml.id}?alt=media`, { headers: authHeader });
          if (res.ok) {
            const blob = await res.blob();
            const file = new File([blob], xml.name, { type: 'text/xml' });
            xmlUrl = (await base44.asServiceRole.integrations.Core.UploadFile({ file })).file_url;
            log.push(`  XML ✓`);
          }
        } catch (e) { log.push(`  Erro XML: ${e.message}`); }
      }

      if (pdfComp) {
        try {
          const res = await fetch(`https://www.googleapis.com/drive/v3/files/${pdfComp.id}?alt=media`, { headers: authHeader });
          if (res.ok) {
            const blob = await res.blob();
            const file = new File([blob], pdfComp.name, { type: 'application/pdf' });
            compUrl = (await base44.asServiceRole.integrations.Core.UploadFile({ file })).file_url;
            log.push(`  COMP ✓`);
          }
        } catch (e) { log.push(`  Erro COMP: ${e.message}`); }
      }

      // Extrair dados (IA ou nome do arquivo)
      let emitente = '', nfNumFinal = nfNum || '', valorFinal = valFromName || 0;

      if (!skipAI) {
        try {
          const ai = await base44.asServiceRole.integrations.Core.InvokeLLM({
            prompt: `Extraia da nota fiscal: numero, data (YYYY-MM-DD), valor total, nome do emitente, CNPJ (só dígitos). Arquivo: ${pdfNf.name}`,
            response_json_schema: {
              type: "object",
              properties: {
                nf_numero: { type: "string" },
                nf_data_emissao: { type: "string" },
                nf_valor_total: { type: "number" },
                nf_emitente_nome: { type: "string" },
                nf_emitente_cpf_cnpj: { type: "string" }
              }
            },
            file_urls: [pdfUrl]
          });
          if (ai) {
            nfNumFinal = ai.nf_numero || nfNumFinal;
            emitente = ai.nf_emitente_nome || '';
            valorFinal = ai.nf_valor_total || valorFinal;
          }
        } catch (e) { log.push(`  IA: ${e.message}`); }
      }

      // Criar PurchaseRequest
      try {
        const pr = await base44.asServiceRole.entities.PurchaseRequest.create({
          descricao_item: pdfNf.name.substring(0, 200),
          valor_solicitado: valorFinal,
          valor_total: valorFinal,
          nf_numero: nfNumFinal,
          nf_valor_total: valorFinal,
          nf_emitente_nome: emitente,
          nf_pdf_url: pdfUrl,
          fornecedor_nome: emitente,
          status: 'APROVADO_ADMIN',
          pago: true,
          status_pagamento: 'pago',
          comprovante_url: compUrl || '',
          arquivo_url: pdfUrl,
          arquivo_nome: pdfNf.name,
          arquivo_tipo: 'application/pdf',
          origem: 'importacao_drive',
          observacoes: `Drive: ${[pdfNf.name, xml?.name, pdfComp?.name].filter(Boolean).join(' | ')}`
        });
        log.push(`  ✅ PR ${pr.id} - R$ ${valorFinal}`);
        results.push({ nfNum: nfNumFinal, id: pr.id, valor: valorFinal, emitente, status: 'OK' });
      } catch (e) {
        log.push(`  ❌ ${e.message}`);
        results.push({ nfNum, error: e.message, status: 'erro' });
      }
    }

    return Response.json({ total: results.length, ok: results.filter(r => r.status === 'OK').length, log, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});