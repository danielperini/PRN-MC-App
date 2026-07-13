import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const DRIVE_FOLDER_ID = '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp';
const MESES_VALIDOS = ['fevereiro','marco','março','abril','maio','junho','julho','feb','mar','abr','mai','jun','jul'];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    // Tentar obter token do Drive (user-scoped primeiro, depois service role)
    let conn: any = null;
    try { conn = await base44.connectors.getConnection('googledrive'); } catch(_) {}
    if (!conn?.access_token) {
      try { conn = await base44.asServiceRole.connectors.getConnection('googledrive'); } catch(_) {}
    }
    if (!conn || !conn.access_token) {
      return Response.json({ error: 'Conector Google Drive não está autenticado. Reconecte o Drive em Configurações > Conectores.' }, { status: 401 });
    }
    const token = conn.access_token;

    // Teste de validação do token
    const testRes = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', { headers: { Authorization: `Bearer ${token}` } });
    const testData = await testRes.json();
    if (testData.error) {
      return Response.json({ error: `Token Drive inválido: ${testData.error.message}. Reconecte o Drive em Configurações > Conectores.`, details: testData.error }, { status: 401 });
    }
    console.log('[Drive] Autenticado como:', testData.user?.emailAddress);

    // ── 1. Carregar todas NFs existentes no app (fingerprints) ──
    const allPRs = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 500);
    const fpSet = new Set();
    const chaveSet = new Set();

    for (const pr of allPRs) {
      if (pr.nf_chave_acesso && pr.nf_chave_acesso.length >= 40) {
        chaveSet.add(pr.nf_chave_acesso.trim());
      }
      const num = (pr.nf_numero || '').toString().trim().toLowerCase();
      const emit = (pr.nf_emitente_nome || pr.fornecedor_nome || '').toString().trim().toLowerCase().substring(0, 30);
      const val = String(pr.nf_valor_total || pr.valor_solicitado || pr.valor_pago || '0');
      const data = (pr.nf_data_emissao || '').toString().substring(0, 10);
      const cnpj = (pr.fornecedor_cnpj || pr.nf_emitente_cpf_cnpj || '').replace(/\D/g, '');
      if (num && emit && val !== '0' && data) {
        fpSet.add(`${num}|${emit}|${val}|${data}|${cnpj}`);
      }
    }

    // Carregar intakes existentes por nome de arquivo
    const existingIntakes = await base44.asServiceRole.entities.DocumentIntake.list('-created_date', 500);
    const intakeNomes = new Set(existingIntakes.map(i => (i.file_name_original || '').toLowerCase().trim()));
    const intakeDriveIds = new Set(existingIntakes.map(i => i.resultado_ia?.drive_file_id).filter(Boolean));

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

    // ── 3. Para cada XML, baixar conteúdo e extrair dados ──
    const novas: any[] = [];
    const duplicatas: any[] = [];
    const erros: any[] = [];

    for (const xml of xmlsNF) {
      // Verificar se já está no intake por drive_file_id
      if (intakeDriveIds.has(xml.id)) {
        duplicatas.push({ arquivo: xml.name, motivo: 'Já importado (drive_file_id)' });
        continue;
      }
      if (intakeNomes.has(xml.name.toLowerCase().trim())) {
        duplicatas.push({ arquivo: xml.name, motivo: 'Já importado (nome do arquivo)' });
        continue;
      }

      // Baixar conteúdo XML
      let xmlContent = '';
      try {
        const dlUrl = `https://www.googleapis.com/drive/v3/files/${xml.id}?alt=media`;
        const dlRes = await fetch(dlUrl, { headers: { Authorization: `Bearer ${token}` } });
        xmlContent = await dlRes.text();
      } catch (e) {
        erros.push({ arquivo: xml.name, motivo: 'Erro ao baixar XML' });
        continue;
      }

      // Extrair dados do XML
      const getTag = (tag: string) => {
        const m = xmlContent.match(new RegExp(`<${tag}[^>]*>([^<]+)</${tag}>`, 'i'));
        return m ? m[1].trim() : '';
      };
      const nNF = getTag('nNF') || getTag('nnf');
      const dhEmi = (getTag('dhEmi') || getTag('dhemi') || '').substring(0, 10);
      const xNome = getTag('xNome') || getTag('xnome'); // emitente
      const vNF = getTag('vNF') || getTag('vnf');
      const chaveMatch = xmlContent.match(/Id="NFe(\d{44})"/i) || xmlContent.match(/chNFe[^>]*>(\d{44})/i);
      const chave = chaveMatch ? chaveMatch[1] : '';
      const cnpjMatch = xmlContent.match(/<emit>[\s\S]*?<CNPJ>(\d+)<\/CNPJ>/i);
      const cnpjEmit = cnpjMatch ? cnpjMatch[1] : '';

      // Verificar duplicata pelos 5 critérios
      if (chave && chaveSet.has(chave)) {
        duplicatas.push({ arquivo: xml.name, motivo: `Chave NF-e já existe: ${chave.substring(0, 15)}...` });
        continue;
      }

      const num = nNF.toLowerCase();
      const emit = xNome.toLowerCase().substring(0, 30);
      const val = String(parseFloat(vNF) || '0');
      const fp = `${num}|${emit}|${val}|${dhEmi}|${cnpjEmit}`;
      if (fpSet.has(fp)) {
        duplicatas.push({ arquivo: xml.name, motivo: `Duplicata por fingerprint: NF ${nNF} / ${xNome} / R$${vNF}` });
        continue;
      }

      // NF nova — buscar PDF correspondente na mesma pasta
      const pastaId = xml._path.split('/').slice(0, -1).join('/');
      const pdfCandidato = todosArquivos.find(f => {
        const nomePdf = f.name.toLowerCase();
        const nomeXml = xml.name.toLowerCase().replace('.xml', '');
        return nomePdf.endsWith('.pdf') && (nomePdf.includes(nomeXml.replace('.xml','')) || 
               (nNF && nomePdf.includes(`nf ${nNF}`) || nomePdf.includes(`nf_${nNF}`) || nomePdf.includes(`nf${nNF}`)));
      });

      novas.push({
        arquivo: xml.name,
        drive_file_id: xml.id,
        drive_url: xml.webViewLink,
        path: xml._path,
        nf_numero: nNF,
        nf_emitente: xNome,
        nf_valor: parseFloat(vNF) || 0,
        nf_data_emissao: dhEmi,
        nf_chave: chave,
        cnpj_emitente: cnpjEmit,
        pdf_drive_id: pdfCandidato?.id || null,
        pdf_drive_url: pdfCandidato?.webViewLink || null,
        xml_url: xml.webViewLink
      });
    }

    // ── 4. Criar DocumentIntake para cada NF nova ──
    const criados: any[] = [];
    const errosCriacao: any[] = [];

    for (const nf of novas) {
      try {
        // Montar URL pública de download do XML via Drive
        const xmlDownloadUrl = `https://drive.google.com/uc?export=download&id=${nf.drive_file_id}`;
        const pdfDownloadUrl = nf.pdf_drive_id ? `https://drive.google.com/uc?export=download&id=${nf.pdf_drive_id}` : null;

        const intake = await base44.asServiceRole.entities.DocumentIntake.create({
          user_email: 'sincronizacao_drive@sistema',
          user_name: 'Varredura Drive Automática',
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
          status_registro: 'ATIVO',
          grupo_status: 'COMPLETO',
          resultado_ia: {
            drive_file_id: nf.drive_file_id,
            drive_url: nf.drive_url,
            path: nf.path,
            nf_chave: nf.nf_chave,
            cnpj_emitente: nf.cnpj_emitente,
            nf_data_emissao: nf.nf_data_emissao,
            origem: 'varredura_drive_fev_jul_2026'
          },
          fornecedor_nome: nf.nf_emitente,
          nf_emitente_cpf_cnpj: nf.cnpj_emitente,
          revisado_pelo_usuario: false
        });
        criados.push({ arquivo: nf.arquivo, intake_id: intake.id });
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