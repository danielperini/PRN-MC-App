import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const DRIVE_FOLDER_ID = '1sI_XEZpUo3W5gcs2Nik3rGm1v6bAbKTh';
const SYSTEM_EMAIL = 'sistema@museus-centro.org.br';
const MIME_PDF = 'application/pdf';
const MIME_XML = new Set(['text/xml', 'application/xml']);

const MESES_MAP: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function normalizarStr(v: any): string {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ');
}
function soDigitos(v: any): string { return String(v || '').replace(/\D/g, ''); }
function numero(v: any): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const texto = String(v || '').trim();
  if (!texto) return 0;
  const normalizado = texto.includes(',') ? texto.replace(/\./g, '').replace(',', '.') : texto;
  const n = Number(normalizado);
  return Number.isFinite(n) ? n : 0;
}
function normalizarMes(texto: string) {
  const n = normalizarStr(texto);
  for (const [k, v] of Object.entries(MESES_MAP)) if (n.includes(normalizarStr(k))) return { mes: k.charAt(0).toUpperCase() + k.slice(1), mes_num: v };
  return null;
}
function extrairAno(texto: string): number {
  const m = String(texto || '').match(/20\d{2}/);
  return m ? Number(m[0]) : new Date().getFullYear();
}
function detectarTipoPasta(nome: string): 'nf' | 'contrato' | 'extrato' | 'outro' {
  const n = normalizarStr(nome);
  if (n.includes('nota') || n.includes('nf') || n.includes('fiscal') || n.includes('invoice')) return 'nf';
  if (n.includes('contrato') || n.includes('contract') || n.includes('termo')) return 'contrato';
  if (n.includes('extrato') || n.includes('bancario') || n.includes('banco') || n.includes('rendimento')) return 'extrato';
  return 'outro';
}
function isXML(arquivo: any): boolean {
  return MIME_XML.has(arquivo?.mimeType) || String(arquivo?.name || '').toLowerCase().endsWith('.xml');
}
function detectarTipoDocumento(nome: string, mime: string): string {
  const n = normalizarStr(nome);
  if (MIME_XML.has(mime) || nome.toLowerCase().endsWith('.xml')) return 'NOTA_FISCAL_XML';
  if (n.includes('contrato') || n.includes('termo')) return 'CONTRATO';
  if (n.includes('recibo')) return 'RECIBO_PDF';
  if (n.includes('nota') || n.includes('nf') || n.includes('nfse')) return 'NOTA_FISCAL_PDF';
  return 'PENDENTE';
}
function baseNome(nome: string): string {
  return normalizarStr(nome)
    .replace(/\.(pdf|xml)$/i, '')
    .replace(/\b(nota fiscal|nfse|nfe|nf|xml|pdf|danfe)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function tokensNumericos(nome: string): string[] {
  return Array.from(new Set((String(nome || '').match(/\d{2,}/g) || []).map(v => v.replace(/^0+/, '') || '0')));
}
function chaveFiscal(dados: any): string | null {
  const chave = soDigitos(dados?.nf_chave_acesso);
  if (chave.length === 44) return `chave:${chave}`;
  const cnpj = soDigitos(dados?.nf_emitente_cpf_cnpj || dados?.fornecedor_cpf_cnpj);
  const nf = soDigitos(dados?.nf_numero);
  if (cnpj && nf) return `cnpj-nf:${cnpj}:${nf}`;
  const valor = numero(dados?.nf_valor_total).toFixed(2);
  const data = String(dados?.nf_data_emissao || '').slice(0, 10);
  if (nf && valor !== '0.00') return `nf-valor:${nf}:${valor}:${data}`;
  return null;
}
function arquivosRelacionados(pdf: any, xml: any): boolean {
  if (pdf._pastaPath !== xml._pastaPath) return false;
  const basePdf = baseNome(pdf.name);
  const baseXml = baseNome(xml.name);
  if (basePdf && baseXml && (basePdf === baseXml || basePdf.includes(baseXml) || baseXml.includes(basePdf))) return true;
  const a = tokensNumericos(pdf.name);
  const b = new Set(tokensNumericos(xml.name));
  return a.some(token => token.length >= 2 && b.has(token));
}
function dadosXML(xmlText: string) {
  const extrair = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const match = xmlText.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
    return '';
  };
  const cnpj = extrair([/<CNPJ[^>]*>(\d+)<\/CNPJ>/i, /<cnpj[^>]*>(\d+)<\/cnpj>/i, /<CpfCnpj>\s*<Cnpj>(\d+)<\/Cnpj>/i]);
  const nf = extrair([/<nNF[^>]*>(\d+)<\/nNF>/i, /<nNfse[^>]*>(\d+)<\/nNfse>/i, /<Numero[^>]*>(\d+)<\/Numero>/i]);
  const valor = extrair([/<vNF[^>]*>([\d.,]+)<\/vNF>/i, /<vLiquidoNfse[^>]*>([\d.,]+)<\/vLiquidoNfse>/i, /<ValorLiquidoNfse[^>]*>([\d.,]+)<\/ValorLiquidoNfse>/i]);
  const data = extrair([/<dhEmi[^>]*>(\d{4}-\d{2}-\d{2})/i, /<dEmi[^>]*>(\d{4}-\d{2}-\d{2})/i, /<DataEmissao[^>]*>(\d{4}-\d{2}-\d{2})/i]);
  const nome = extrair([/<xNome[^>]*>([^<]+)<\/xNome>/i, /<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i]);
  const chave = extrair([/<chNFe[^>]*>(\d{44})<\/chNFe>/i, /<ChaveAcesso[^>]*>(\d{44})<\/ChaveAcesso>/i]) || (xmlText.match(/\b\d{44}\b/) || [])[0] || '';
  return {
    nf_emitente_cpf_cnpj: soDigitos(cnpj), nf_emitente_nome: nome,
    nf_numero: soDigitos(nf), nf_valor_total: numero(valor), nf_data_emissao: data,
    nf_chave_acesso: soDigitos(chave), eh_nota_fiscal: true,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    try {
      const user = await base44.auth.me();
      const role = normalizarStr(user?.role);
      if (!['admin', 'coordenador', 'coordinator'].includes(role)) return Response.json({ error: 'Apenas administradores ou coordenadores.' }, { status: 403 });
    } catch (_) {
      // execução agendada sem sessão
    }

    let token: string | null = null;
    try { token = (await base44.asServiceRole.connectors.getConnection('googledrive'))?.accessToken || null; } catch (_) {}
    if (!token) return Response.json({ error: 'Google Drive não conectado.', code: 'DRIVE_NOT_CONNECTED' }, { status: 401 });

    async function listFolder(folderId: string): Promise<any[]> {
      const files: any[] = [];
      let pageToken = '';
      do {
        const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
        const fields = encodeURIComponent('nextPageToken,files(id,name,mimeType,createdTime,modifiedTime,webViewLink,size,md5Checksum)');
        const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=${fields}&pageSize=100&supportsAllDrives=true&includeItemsFromAllDrives=true${pageToken ? `&pageToken=${pageToken}` : ''}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) throw new Error(`Drive listagem HTTP ${res.status}: ${await res.text()}`);
        const data = await res.json();
        files.push(...(data.files || []));
        pageToken = data.nextPageToken || '';
      } while (pageToken);
      return files;
    }
    async function download(arquivo: any): Promise<ArrayBuffer> {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${arquivo.id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`Download de ${arquivo.name} falhou: HTTP ${res.status}`);
      return await res.arrayBuffer();
    }
    async function upload(arquivo: any, bytes: ArrayBuffer): Promise<string> {
      const file = new File([bytes], arquivo.name, { type: arquivo.mimeType || 'application/octet-stream' });
      const result = await base44.asServiceRole.integrations.Core.UploadFile({ file });
      const url = result?.file_url || result?.url || result?.data?.file_url;
      if (!url) throw new Error(`Upload de ${arquivo.name} não retornou URL`);
      return url;
    }

    const body = await req.json().catch(() => ({}));
    const maxPorLote = Math.max(1, Math.min(20, Number(body.maxPorLote || 5)));
    const existentes = await base44.asServiceRole.entities.DocumentIntake.list('-created_date', 3000);
    const porDriveId = new Map<string, any>();
    const porChaveFiscal = new Map<string, any>();
    for (const item of existentes) {
      const ids = [item?.resultado_ia?.drive_file_id, ...(item?.resultado_ia?.drive_file_ids || [])].filter(Boolean);
      ids.forEach((id: string) => porDriveId.set(id, item));
      const key = item?.resultado_ia?.chave_fiscal_deterministica || chaveFiscal(item);
      if (key && !porChaveFiscal.has(key)) porChaveFiscal.set(key, item);
    }

    const candidatos: any[] = [];

    // Varre recursivamente QUALQUER subpasta — não depende de padrão mensal na raiz.
    // mês/ano são inferidos a partir do caminho acumulado (primeiro match vence).
    async function varrerPasta(folderId: string, pastaPath: string, depth = 0): Promise<void> {
      if (depth > 10) return; // limite de profundidade aumentado
      let conteudo: any[];
      try {
        conteudo = await listFolder(folderId);
      } catch (e) {
        console.warn(`[varrer] Erro ao listar pasta ${folderId}: ${(e as any)?.message}`);
        return;
      }

      // Inferir mês/ano do caminho completo acumulado
      const mesInfo = normalizarMes(pastaPath) || null;
      const ano = extrairAno(pastaPath) || new Date().getFullYear();

      for (const item of conteudo) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          // Pular pastas de extratos bancários — não são NFs nem contratos
          if (detectarTipoPasta(item.name) === 'extrato') continue;
          const subPath = pastaPath ? `${pastaPath}/${item.name}` : item.name;
          await varrerPasta(item.id, subPath, depth + 1);
        } else {
          if (item.mimeType !== MIME_PDF && !isXML(item)) continue;
          if (detectarTipoPasta(item.name) === 'extrato') continue;
          candidatos.push({
            ...item,
            _mesInfo: mesInfo,
            _ano: ano,
            _pastaTipo: detectarTipoPasta(item.name),
            _pastaPath: pastaPath,
          });
        }
      }
    }

    // Ponto de entrada: varre a raiz inteira, incluindo todas as subpastas em qualquer nível
    await varrerPasta(DRIVE_FOLDER_ID, '');

    const xmlPendentes = candidatos.filter(isXML).filter(a => !porDriveId.has(a.id));
    const xmlMetadados = new Map<string, any>();
    for (const xml of xmlPendentes) {
      try {
        const bytes = await download(xml);
        const text = new TextDecoder('utf-8').decode(bytes);
        xmlMetadados.set(xml.id, { arquivo: xml, bytes, dados: dadosXML(text) });
      } catch (_) {}
    }

    const arquivosPendentes = candidatos.filter(a => !porDriveId.has(a.id));
    const pdfs = arquivosPendentes.filter(a => !isXML(a));
    const unidades: any[] = pdfs.map(pdf => ({ pdf, xml: null }));
    const xmlUsados = new Set<string>();
    for (const unidade of unidades) {
      const match = xmlPendentes.find(xml => !xmlUsados.has(xml.id) && arquivosRelacionados(unidade.pdf, xml));
      if (match) { unidade.xml = match; xmlUsados.add(match.id); }
    }
    xmlPendentes.filter(xml => !xmlUsados.has(xml.id)).forEach(xml => unidades.push({ pdf: null, xml }));

    const lote = unidades.slice(0, maxPorLote);
    const criados: any[] = [], atualizados: any[] = [], erros: any[] = [];
    let paresUnidos = 0;

    for (const unidade of lote) {
      const principal = unidade.pdf || unidade.xml;
      try {
        const tipoPDF = unidade.pdf ? detectarTipoDocumento(unidade.pdf.name, unidade.pdf.mimeType) : null;
        let pdfBytes: ArrayBuffer | null = null, pdfUrl = '';
        let xmlBytes: ArrayBuffer | null = null, xmlUrl = '';
        let dadosPDF: any = {}, dadosXml: any = {};

        if (unidade.xml) {
          const cache = xmlMetadados.get(unidade.xml.id);
          xmlBytes = cache?.bytes || await download(unidade.xml);
          dadosXml = cache?.dados || dadosXML(new TextDecoder('utf-8').decode(xmlBytes));
          xmlUrl = await upload(unidade.xml, xmlBytes);
        }
        if (unidade.pdf) {
          pdfBytes = await download(unidade.pdf);
          pdfUrl = await upload(unidade.pdf, pdfBytes);
          const hoje = new Date().toISOString().slice(0, 10);
          const isContrato = tipoPDF === 'CONTRATO';
          dadosPDF = await base44.asServiceRole.integrations.Core.InvokeLLM({
            model: 'claude_sonnet_4_6',
            prompt: isContrato
              ? `VOCÊ É UM ESPECIALISTA EM CONTRATOS. Data atual: ${hoje}. Extraia tipo_documento, contratado_nome, contratado_cpf_cnpj, contratante_nome, contratante_cnpj, objeto, valor_total, data_inicio, data_fim, data_assinatura, numero_parcelas e descricao.`
              : `VOCÊ É UM ESPECIALISTA EM DOCUMENTOS FISCAIS. Tomador: Viaduto das Artes CNPJ 23.843.648/0001-25. Data: ${hoje}. Extraia eh_nota_fiscal, nf_numero, nf_chave_acesso, nf_data_emissao, nf_valor_total, nf_emitente_nome, nf_emitente_cpf_cnpj, descricao_servico, municipio_emissao, centro_custo_sugerido e score_confiabilidade.`,
            file_urls: [pdfUrl], response_json_schema: { type: 'object', properties: {} },
          }) || {};
        }

        let dados = { ...dadosPDF };
        for (const [key, value] of Object.entries(dadosXml)) {
          if (value !== '' && value !== 0 && value != null) dados[key] = value;
        }

        if (unidade.pdf && !unidade.xml && tipoPDF === 'NOTA_FISCAL_PDF') {
          const keyPdf = chaveFiscal(dadosPDF);
          const xmlMatch = Array.from(xmlMetadados.values()).find((entry: any) => {
            if (xmlUsados.has(entry.arquivo.id)) return false;
            const keyXml = chaveFiscal(entry.dados);
            return keyPdf && keyXml && keyPdf === keyXml;
          });
          if (xmlMatch) {
            unidade.xml = xmlMatch.arquivo;
            xmlUsados.add(xmlMatch.arquivo.id);
            xmlBytes = xmlMatch.bytes;
            dadosXml = xmlMatch.dados;
            xmlUrl = await upload(unidade.xml, xmlBytes);
            dados = { ...dadosPDF, ...Object.fromEntries(Object.entries(dadosXml).filter(([, v]) => v !== '' && v !== 0 && v != null)) };
          }
        }

        const fiscalKey = chaveFiscal(dados);
        const ids = [unidade.pdf?.id, unidade.xml?.id].filter(Boolean);
        const urls = { pdf: pdfUrl || null, xml: xmlUrl || null };
        const intakeExistente = ids.map((id: string) => porDriveId.get(id)).find(Boolean) || (fiscalKey ? porChaveFiscal.get(fiscalKey) : null);
        const tipoDetectado = unidade.pdf ? tipoPDF : 'NOTA_FISCAL_XML';
        const nomePrincipal = unidade.pdf?.name || unidade.xml?.name;
        const payload = {
          user_email: SYSTEM_EMAIL,
          user_name: 'Sistema — Sincronização Drive',
          tipo_detectado: tipoDetectado,
          status_processamento: 'AGUARDANDO_REVISAO',
          arquivo_original_url: pdfUrl || xmlUrl,
          file_name_original: nomePrincipal,
          file_name_final: nomePrincipal,
          mime_type: unidade.pdf?.mimeType || unidade.xml?.mimeType,
          origem: 'DRIVE_SYNC',
          nf_emitente_cpf_cnpj: dados.nf_emitente_cpf_cnpj || '',
          fornecedor_cpf_cnpj: dados.nf_emitente_cpf_cnpj || dados.contratado_cpf_cnpj || '',
          nf_emitente_nome: dados.nf_emitente_nome || '',
          fornecedor_nome: dados.nf_emitente_nome || dados.contratado_nome || '',
          nf_numero: dados.nf_numero || '',
          nf_valor_total: numero(dados.nf_valor_total || dados.valor_total),
          nf_chave_acesso: dados.nf_chave_acesso || '',
          municipio: dados.municipio_emissao || '',
          centro_custo: dados.centro_custo_sugerido || '',
          resultado_ia: {
            ...(intakeExistente?.resultado_ia || {}), ...dados,
            drive_file_id: unidade.pdf?.id || unidade.xml?.id,
            drive_file_ids: Array.from(new Set([...(intakeExistente?.resultado_ia?.drive_file_ids || []), ...ids])),
            drive_pdf_file_id: unidade.pdf?.id || intakeExistente?.resultado_ia?.drive_pdf_file_id || null,
            drive_xml_file_id: unidade.xml?.id || intakeExistente?.resultado_ia?.drive_xml_file_id || null,
            drive_pdf_url: pdfUrl || intakeExistente?.resultado_ia?.drive_pdf_url || null,
            drive_xml_url: xmlUrl || intakeExistente?.resultado_ia?.drive_xml_url || null,
            arquivos_fiscais: urls,
            pdf_xml_unidos: Boolean(unidade.pdf && unidade.xml),
            chave_fiscal_deterministica: fiscalKey,
            drive_folder_path: principal._pastaPath,
            drive_modified_time: principal.modifiedTime,
          },
        };

        let intake;
        if (intakeExistente) {
          intake = await base44.asServiceRole.entities.DocumentIntake.update(intakeExistente.id, payload);
          atualizados.push({ arquivo: nomePrincipal, id: intakeExistente.id, tipo: tipoDetectado, pdf_xml_unidos: Boolean(unidade.pdf && unidade.xml) });
        } else {
          intake = await base44.asServiceRole.entities.DocumentIntake.create(payload);
          criados.push({ arquivo: nomePrincipal, id: intake.id, tipo: tipoDetectado, pdf_xml_unidos: Boolean(unidade.pdf && unidade.xml) });
        }
        ids.forEach((id: string) => porDriveId.set(id, intake));
        if (fiscalKey) porChaveFiscal.set(fiscalKey, intake);
        if (unidade.pdf && unidade.xml) paresUnidos += 1;
      } catch (e) {
        erros.push({ arquivo: principal?.name || 'Arquivo sem nome', erro: String((e as any)?.message || e) });
      }
    }

    return Response.json({
      success: true,
      resumo: {
        encontrados_total: candidatos.length,
        novos_no_drive: arquivosPendentes.length,
        unidades_fiscais: unidades.length,
        processados_neste_lote: lote.length,
        criados: criados.length,
        atualizados: atualizados.length,
        pares_pdf_xml_unidos: paresUnidos,
        restantes: Math.max(0, unidades.length - lote.length),
        erros: erros.length,
      },
      criados, atualizados, erros,
    });
  } catch (error) {
    console.error('[sincronizarDocumentosDrive] Erro:', error);
    return Response.json({ success: false, error: String((error as any)?.message || error) }, { status: 500 });
  }
});