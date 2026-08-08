import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const DRIVE_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const MESES_VALIDOS = ['fevereiro','marco','março','abril','maio','junho','julho','feb','mar','abr','mai','jun','jul'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    let conn: any = null;
    try { conn = await base44.connectors.getConnection('googledrive'); } catch(_) {}
    if (!conn?.accessToken && !conn?.access_token) {
      try { conn = await base44.asServiceRole.connectors.getConnection('googledrive'); } catch(_) {}
    }
    if (!conn || (!conn.accessToken && !conn.access_token)) {
      return Response.json({ error: 'Conector Google Drive não está autenticado. Reconecte o Drive em Configurações > Conectores.' }, { status: 401 });
    }
    const token = conn.accessToken || conn.access_token;

    const testRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', { headers: { Authorization: `Bearer ${token}` } });
    const testData = await testRes.json();
    if (testData.error) {
      return Response.json({ error: `Token Drive inválido: ${testData.error.message}. Reconecte o Drive em Configurações > Conectores.`, details: testData.error }, { status: 401 });
    }
    console.log('[Drive] Autenticado como:', testData.user?.emailAddress);

    // ── 1. Carregar fingerprints das NFs existentes ──
    const allPRs = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 500);
    const fpSet = new Set();
    const chaveSet = new Set();

    for (const pr of allPRs) {
      if (pr.nf_chave_acesso && pr.nf_chave_acesso.length >= 40) {
        chaveSet.add(pr.nf_chave_acesso.trim());
      }
      const num = (pr.nf_numero || '').toString().trim().toLowerCase();
      const emit = (pr.nf_emitente_nome || pr.fornecedor_nome || '').toString().trim().toLowerCase().substring(0, 30);
      const val = String(Math.round((Number(pr.nf_valor_total) || Number(pr.valor_solicitado) || Number(pr.valor_pago) || 0) * 100));
      const data = (pr.nf_data_emissao || '').toString().substring(0, 10);
      const cnpj = (pr.fornecedor_cnpj || pr.nf_emitente_cpf_cnpj || '').replace(/\D/g, '');
      if (num && emit && val !== '0' && data) {
        fpSet.add(`${num}|${emit}|${val}|${data}|${cnpj}`);
      }
    }

    // Carregar intakes existentes para dedup
    const existingIntakes = await base44.asServiceRole.entities.DocumentIntake.list('-created_date', 1000);
    const intakeNomes = new Set(existingIntakes.map(i => (i.file_name_original || '').toLowerCase().trim()));
    const intakeDriveIds = new Set(existingIntakes.map(i => i.resultado_ia?.drive_file_id).filter(Boolean));
    // Também adicionar chaves de intakes existentes
    for (const intake of existingIntakes) {
      if (intake.resultado_ia?.nf_chave && intake.resultado_ia.nf_chave.length >= 40) {
        chaveSet.add(intake.resultado_ia.nf_chave.trim());
      }
    }

    // ── 2. Varrer pasta Drive recursivamente ──
    async function listDriveFiles(folderId: string, path = '', depth = 0): Promise<any[]> {
      if (depth > 6) return [];
      let files: any[] = [];
      let pageToken: string | null = null;
      do {
        const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,createdTime,size,webViewLink)&pageSize=200${pageToken ? '&pageToken=' + pageToken : ''}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.error) { console.error('[Drive]', data.error.message); break; }
        for (const f of (data.files || [])) {
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            const sub = await listDriveFiles(f.id, `${path}/${f.name}`, depth + 1);
            files = files.concat(sub);
          } else {
            files.push({ ...f, _path: `${path}/${f.name}` });
          }
        }
        pageToken = data.nextPageToken || null;
      } while (pageToken);
      return files;
    }

    const todosArquivos = await listDriveFiles(DRIVE_FOLDER_ID);

    // Filtrar XMLs de NF no período fev-jul
    const xmlsNF = todosArquivos.filter(f => {
      const nome = f.name.toLowerCase();
      const pathLower = f._path.toLowerCase();
      const isXml = nome.endsWith('.xml');
      const isNF = nome.includes('nf') || nome.includes('nota') || nome.includes('nfe') || nome.includes('fiscal');
      const periodoOk = MESES_VALIDOS.some(m => pathLower.includes(m)) ||
        (() => { const d = new Date(f.createdTime); return d.getFullYear() === 2026 && d.getMonth() + 1 >= 2 && d.getMonth() + 1 <= 7; })();
      return isXml && isNF && periodoOk;
    });

    // ── 3. Para cada XML, baixar e extrair dados ──
    const novas: any[] = [];
    const duplicatas: any[] = [];
    const erros: any[] = [];

    // Helper para extrair tag XML com múltiplos prefixos de namespace
    function getTag(xml: string, tag: string): string {
      // Tenta sem namespace
      let m = xml.match(new RegExp(`<${tag}>([^<]+)<\/${tag}>`, 'i'));
      if (m) return m[1].trim();
      // Tenta com namespace (ex: <nfe:nNF>)
      m = xml.match(new RegExp(`<[^:>]+:${tag}>([^<]+)<\/[^:>]+:${tag}>`, 'i'));
      if (m) return m[1].trim();
      return '';
    }

    for (const xml of xmlsNF) {
      if (intakeDriveIds.has(xml.id)) {
        duplicatas.push({ arquivo: xml.name, motivo: 'Já importado (drive_file_id)' });
        continue;
      }
      if (intakeNomes.has(xml.name.toLowerCase().trim())) {
        duplicatas.push({ arquivo: xml.name, motivo: 'Já importado (nome do arquivo)' });
        continue;
      }

      let xmlContent = '';
      try {
        const dlUrl = `https://www.googleapis.com/drive/v3/files/${xml.id}?alt=media`;
        const dlRes = await fetch(dlUrl, { headers: { Authorization: `Bearer ${token}` } });
        xmlContent = await dlRes.text();
      } catch (e) {
        erros.push({ arquivo: xml.name, motivo: 'Erro ao baixar XML' });
        continue;
      }

      if (!xmlContent || xmlContent.length < 100) {
        erros.push({ arquivo: xml.name, motivo: 'XML vazio ou inválido' });
        continue;
      }

      // Extrair campos principais
      const nNF = getTag(xmlContent, 'nNF');
      const dhEmi = (getTag(xmlContent, 'dhEmi') || getTag(xmlContent, 'dEmi') || '').substring(0, 10);
      const xNome = getTag(xmlContent, 'xNome'); // nome emitente (1ª ocorrência = emit)
      
      // Valor total: tentar vários campos
      const vNFStr = getTag(xmlContent, 'vNF') || getTag(xmlContent, 'vProd') || getTag(xmlContent, 'vTotTrib') || '';
      const vNF = parseFloat(vNFStr.replace(',', '.')) || 0;

      // Chave de acesso
      const chaveMatch = xmlContent.match(/Id="NFe(\d{44})"/i) || 
                         xmlContent.match(/chNFe[^>]*>(\d{44})/i) ||
                         xmlContent.match(/chave[^>]*>(\d{44})/i);
      const chave = chaveMatch ? chaveMatch[1] : '';

      // CNPJ emitente (dentro da tag emit)
      const emitBlock = xmlContent.match(/<emit>([\s\S]*?)<\/emit>/i);
      const cnpjEmit = emitBlock ? (emitBlock[1].match(/<CNPJ>(\d+)<\/CNPJ>/i)?.[1] || '') : '';

      // Verificar duplicata por chave
      if (chave && chaveSet.has(chave)) {
        duplicatas.push({ arquivo: xml.name, motivo: `Chave NF-e já existe: ${chave.substring(0, 15)}...` });
        continue;
      }

      // Verificar duplicata por fingerprint
      const num = nNF.toLowerCase();
      const emit = xNome.toLowerCase().substring(0, 30);
      const valInt = String(Math.round(vNF * 100));
      const fp = `${num}|${emit}|${valInt}|${dhEmi}|${cnpjEmit}`;
      if (num && emit && valInt !== '0' && dhEmi && fpSet.has(fp)) {
        duplicatas.push({ arquivo: xml.name, motivo: `Duplicata por fingerprint: NF ${nNF} / ${xNome} / R$${vNF}` });
        continue;
      }

      // Buscar PDF correspondente na mesma pasta do Drive
      const pdfCandidato = todosArquivos.find(f => {
        if (!f.name.toLowerCase().endsWith('.pdf')) return false;
        const nomePdf = f.name.toLowerCase().replace('.pdf', '');
        const nomeXml = xml.name.toLowerCase().replace('.xml', '');
        // Mesmo radical de nome
        if (nomePdf === nomeXml) return true;
        if (nNF && (nomePdf.includes(`nf ${nNF}`) || nomePdf.includes(`nf_${nNF}`) || nomePdf.includes(`nf${nNF}`) || nomePdf.includes(nNF.padStart(3, '0')))) return true;
        // Mesma pasta (pelo path)
        const xmlDir = xml._path.split('/').slice(0, -1).join('/');
        const pdfDir = f._path.split('/').slice(0, -1).join('/');
        return xmlDir === pdfDir && nomePdf.includes(nomeXml.substring(0, Math.min(15, nomeXml.length)));
      });

      novas.push({
        arquivo: xml.name,
        drive_file_id: xml.id,
        drive_url: xml.webViewLink,
        path: xml._path,
        nf_numero: nNF,
        nf_emitente: xNome,
        nf_valor: vNF,
        nf_data_emissao: dhEmi,
        nf_chave: chave,
        cnpj_emitente: cnpjEmit,
        pdf_drive_id: pdfCandidato?.id || null,
        pdf_drive_url: pdfCandidato?.webViewLink || null,
        xml_url: xml.webViewLink
      });

      // Registrar fingerprint para evitar criar a mesma NF 2x nesta execução
      if (chave) chaveSet.add(chave);
      if (num && emit && valInt !== '0' && dhEmi) fpSet.add(fp);
    }

    // ── 4. Criar DocumentIntake para cada NF nova ──
    const criados: any[] = [];
    const errosCriacao: any[] = [];

    for (const nf of novas) {
      try {
        const xmlDownloadUrl = `https://drive.google.com/uc?export=download&id=${nf.drive_file_id}`;
        const pdfDownloadUrl = nf.pdf_drive_id ? `https://drive.google.com/uc?export=download&id=${nf.pdf_drive_id}` : null;

        // Derivar mês/período do path ou data de emissão
        let mesRef = '';
        const pathLower = nf.path.toLowerCase();
        for (const m of MESES_VALIDOS) {
          if (pathLower.includes(m)) { mesRef = m; break; }
        }
        if (!mesRef && nf.nf_data_emissao) {
          const d = new Date(nf.nf_data_emissao);
          const meses = ['','jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
          mesRef = meses[d.getMonth() + 1] || '';
        }

        const intake = await base44.asServiceRole.entities.DocumentIntake.create({
          user_email: 'sincronizacao_drive@sistema',
          user_name: 'Varredura Drive Fev-Jul 2026',
          tipo_detectado: 'NOTA_FISCAL_XML',
          status_processamento: 'AGUARDANDO_REVISAO',
          arquivo_original_url: xmlDownloadUrl,
          file_name_original: nf.arquivo,
          file_name_final: nf.arquivo,
          mime_type: 'application/xml',
          nf_numero: nf.nf_numero,
          nf_emitente_nome: nf.nf_emitente,
          nf_valor_total: nf.nf_valor,
          nf_xml_url: xmlDownloadUrl,
          nf_pdf_url: pdfDownloadUrl,
          nf_emitente_cpf_cnpj: nf.cnpj_emitente,
          fornecedor_nome: nf.nf_emitente,
          fornecedor_cpf_cnpj: nf.cnpj_emitente,
          status_registro: 'ATIVO',
          grupo_status: pdfDownloadUrl ? 'COMPLETO' : 'INCOMPLETO',
          revisado_pelo_usuario: false,
          resultado_ia: {
            drive_file_id: nf.drive_file_id,
            drive_url: nf.drive_url,
            path: nf.path,
            nf_chave: nf.nf_chave,
            cnpj_emitente: nf.cnpj_emitente,
            nf_data_emissao: nf.nf_data_emissao,
            mes_referencia: mesRef,
            pdf_drive_id: nf.pdf_drive_id,
            pdf_drive_url: nf.pdf_drive_url,
            origem: 'varredura_drive_fev_jul_2026'
          }
        });
        criados.push({ arquivo: nf.arquivo, intake_id: intake.id, nf_valor: nf.nf_valor, nf_numero: nf.nf_numero });
      } catch (e) {
        errosCriacao.push({ arquivo: nf.arquivo, erro: String(e) });
      }
    }

    return Response.json({
      success: true,
      resumo: {
        xmls_encontrados_drive: xmlsNF.length,
        duplicatas_descartadas: duplicatas.length,
        novas_nfs_encontradas: novas.length,
        intakes_criados: criados.length,
        erros: erros.length + errosCriacao.length
      },
      duplicatas,
      novas_importadas: criados,
      erros: [...erros, ...errosCriacao]
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});