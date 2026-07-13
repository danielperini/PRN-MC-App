import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

// Mesma pasta raiz dos extratos
const DRIVE_FOLDER_ID = '1sI_XEZpUo3W5gcs2Nik3rGm1v6bAbKTh';
const SYSTEM_EMAIL = 'sistema@museus-centro.org.br';

const MESES_MAP: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12,
};

function normalizarStr(v: string): string {
  return String(v || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function normalizarMes(texto: string): { mes: string; mes_num: number } | null {
  const n = normalizarStr(texto);
  for (const [k, v] of Object.entries(MESES_MAP)) {
    if (n.includes(normalizarStr(k))) {
      return { mes: k.charAt(0).toUpperCase() + k.slice(1), mes_num: v };
    }
  }
  return null;
}

function extrairAno(texto: string): number {
  const m = texto.match(/20\d{2}/);
  return m ? parseInt(m[0]) : new Date().getFullYear();
}

// Detecta que tipo de subpasta é pelo nome
function detectarTipoPasta(nome: string): 'nf' | 'contrato' | 'extrato' | 'outro' {
  const n = normalizarStr(nome);
  if (n.includes('nota') || n.includes('nf') || n.includes('fiscal') || n.includes('invoice')) return 'nf';
  if (n.includes('contrato') || n.includes('contract') || n.includes('termo')) return 'contrato';
  if (n.includes('extrato') || n.includes('bancario') || n.includes('banco') || n.includes('rendimento')) return 'extrato';
  return 'outro';
}

// Detecta tipo de arquivo pelo nome/mime
function detectarTipoDocumento(nome: string, mime: string): string {
  const n = normalizarStr(nome);
  if (mime === 'text/xml' || mime === 'application/xml' || nome.toLowerCase().endsWith('.xml')) return 'NOTA_FISCAL_XML';
  if (n.includes('contrato') || n.includes('termo')) return 'CONTRATO';
  if (n.includes('recibo')) return 'RECIBO_PDF';
  if (n.includes('nota') || n.includes('nf') || n.includes('nfse')) return 'NOTA_FISCAL_PDF';
  return 'PENDENTE';
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Suporta execução via automação (sem sessão de usuário) ou via UI (com usuário)
    let isScheduled = false;
    try {
      const user = await base44.auth.me();
      const role = (user?.role || '').toLowerCase();
      if (!['admin', 'coordenador', 'coordinator'].includes(role)) {
        return Response.json({ error: 'Apenas administradores ou coordenadores.' }, { status: 403 });
      }
    } catch (_) {
      isScheduled = true; // sem sessão = automação agendada, permitido
    }

    // Token do Drive via service role (padrão correto do SDK)
    let token: string | null = null;
    try {
      const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
      if (accessToken) token = accessToken;
    } catch (_) {}
    if (!token) {
      return Response.json({ error: 'Google Drive não conectado.', code: 'DRIVE_NOT_CONNECTED' }, { status: 401 });
    }

    // Listar itens de uma pasta
    async function listFolder(folderId: string): Promise<any[]> {
      let files: any[] = [];
      let pageToken: string | null = null;
      do {
        const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,createdTime,modifiedTime,webViewLink,size)&pageSize=100${pageToken ? '&pageToken=' + pageToken : ''}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) break;
        const data = await res.json();
        files = files.concat(data.files || []);
        pageToken = data.nextPageToken || null;
      } while (pageToken);
      return files;
    }

    // Carregar IDs já processados na DocumentIntake
    const existentes = await base44.asServiceRole.entities.DocumentIntake.list('-created_date', 500);
    const driveIdsProcessados = new Set(
      existentes
        .map((e: any) => e.resultado_ia?.drive_file_id)
        .filter(Boolean)
    );

    const body = await req.json().catch(() => ({}));
    const maxPorLote = parseInt(body.maxPorLote, 10) || 5;

    // Varrer estrutura: raiz → pastas mensais → subpastas (nf/contrato/extrato) → arquivos
    const candidatos: any[] = [];

    const pastasMensais = (await listFolder(DRIVE_FOLDER_ID))
      .filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder');

    for (const pastaMensal of pastasMensais) {
      const mesInfo = normalizarMes(pastaMensal.name);
      const ano = extrairAno(pastaMensal.name);
      const conteudo = await listFolder(pastaMensal.id);

      for (const item of conteudo) {
        if (item.mimeType === 'application/vnd.google-apps.folder') {
          const tipoPasta = detectarTipoPasta(item.name);
          if (tipoPasta === 'extrato') continue; // extratos já tratados por lerExtratosBancariosDrive

          const arquivos = await listFolder(item.id);
          for (const arq of arquivos) {
            if (!['application/pdf', 'text/xml', 'application/xml'].includes(arq.mimeType) &&
                !arq.name.toLowerCase().endsWith('.xml')) continue;
            candidatos.push({ ...arq, _mesInfo: mesInfo, _ano: ano, _pastaTipo: tipoPasta, _pastaPath: `${pastaMensal.name}/${item.name}` });
          }
        } else {
          // Arquivo direto na pasta mensal (sem subpasta)
          if (!['application/pdf', 'text/xml', 'application/xml'].includes(item.mimeType) &&
              !item.name.toLowerCase().endsWith('.xml')) continue;
          const tipoPasta = detectarTipoPasta(item.name);
          if (tipoPasta === 'extrato') continue;
          candidatos.push({ ...item, _mesInfo: mesInfo, _ano: ano, _pastaTipo: tipoPasta, _pastaPath: pastaMensal.name });
        }
      }
    }

    const novos = candidatos.filter((c: any) => !driveIdsProcessados.has(c.id));
    const lote = novos.slice(0, maxPorLote);

    const criados: any[] = [];
    const erros: any[] = [];

    for (const arquivo of lote) {
      try {
        // Download
        const dlRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${arquivo.id}?alt=media`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!dlRes.ok) {
          erros.push({ arquivo: arquivo.name, erro: `Download falhou: ${dlRes.status}` });
          continue;
        }
        const arrayBuf = await dlRes.arrayBuffer();
        const fileObj = new File([arrayBuf], arquivo.name, { type: arquivo.mimeType || 'application/octet-stream' });

        // Upload para storage Base44
        const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file: fileObj });
        const fileUrl = uploadRes?.file_url;
        if (!fileUrl) {
          erros.push({ arquivo: arquivo.name, erro: 'Upload storage falhou' });
          continue;
        }

        const tipoDetectado = detectarTipoDocumento(arquivo.name, arquivo.mimeType);

        // Análise IA
        let dadosIA: any = {};
        try {
          const isXML = arquivo.mimeType === 'text/xml' || arquivo.mimeType === 'application/xml' || arquivo.name.toLowerCase().endsWith('.xml');

          if (isXML) {
            // Para XML: lê texto direto e extrai via regex
            const xmlBlob = await fetch(`https://www.googleapis.com/drive/v3/files/${arquivo.id}?alt=media`,
              { headers: { Authorization: `Bearer ${token}` } });
            const xmlText = await xmlBlob.text();
            const onlyD = (v: string) => String(v || '').replace(/\D/g, '');
            const cnpj = xmlText.match(/<CNPJ[^>]*>(\d+)<\/CNPJ>/i)?.[1] || xmlText.match(/<cnpj>(\d+)<\/cnpj>/i)?.[1] || '';
            const nf = xmlText.match(/<nNF[^>]*>(\d+)<\/nNF>/i)?.[1] || xmlText.match(/<nNfse[^>]*>(\d+)<\/nNfse>/i)?.[1] || '';
            const valor = xmlText.match(/<vNF[^>]*>([\d.,]+)<\/vNF>/i)?.[1] || xmlText.match(/<vLiquidoNfse[^>]*>([\d.,]+)<\/vLiquidoNfse>/i)?.[1] || '';
            const data = xmlText.match(/<dhEmi[^>]*>(\d{4}-\d{2}-\d{2})/i)?.[1] || xmlText.match(/<DataEmissao[^>]*>(\d{4}-\d{2}-\d{2})/i)?.[1] || '';
            const nome = xmlText.match(/<xNome[^>]*>([^<]+)<\/xNome>/i)?.[1] || xmlText.match(/<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i)?.[1] || '';
            const chave = (xmlText.match(/[0-9]{44}/) || [])[0] || '';
            dadosIA = {
              nf_emitente_cpf_cnpj: onlyD(cnpj),
              nf_emitente_nome: nome.trim(),
              nf_numero: onlyD(nf),
              nf_valor_total: parseFloat(String(valor).replace(/\./g, '').replace(',', '.')) || 0,
              nf_data_emissao: data,
              nf_chave_acesso: chave,
              eh_nota_fiscal: true,
            };
          } else {
            // Para PDF (NF ou contrato): análise via IA com Claude
            const hoje = new Date().toISOString().slice(0, 10);
            const isContrato = tipoDetectado === 'CONTRATO';
            dadosIA = await base44.asServiceRole.integrations.Core.InvokeLLM({
              model: 'claude_sonnet_4_6',
              prompt: isContrato
                ? `VOCÊ É UM ESPECIALISTA EM CONTRATOS. Data atual: ${hoje}.
Leia este documento e extraia em JSON:
{
  "tipo_documento": "CONTRATO|TERMO_ADITIVO|RECIBO",
  "contratado_nome": "",
  "contratado_cpf_cnpj": "",
  "contratante_nome": "",
  "contratante_cnpj": "",
  "objeto": "",
  "valor_total": 0,
  "data_inicio": "",
  "data_fim": "",
  "data_assinatura": "",
  "numero_parcelas": 0,
  "descricao": ""
}`
                : `VOCÊ É UM ESPECIALISTA EM DOCUMENTOS FISCAIS. Tomador: Viaduto das Artes CNPJ 23.843.648/0001-25. Data: ${hoje}.
Extraia em JSON:
{
  "eh_nota_fiscal": true,
  "nf_numero": "",
  "nf_chave_acesso": "",
  "nf_data_emissao": "",
  "nf_valor_total": 0,
  "nf_emitente_nome": "",
  "nf_emitente_cpf_cnpj": "",
  "descricao_servico": "",
  "municipio_emissao": "",
  "centro_custo_sugerido": "",
  "score_confiabilidade": 0
}`,
              file_urls: [fileUrl],
              response_json_schema: { type: 'object', properties: {} },
            }) || {};
          }
        } catch (iaErr) {
          console.warn(`[IA] Erro em ${arquivo.name}:`, (iaErr as any)?.message);
          dadosIA = { erro_ia: String((iaErr as any)?.message || '').substring(0, 100) };
        }

        // Criar DocumentIntake
        const intake = await base44.asServiceRole.entities.DocumentIntake.create({
          user_email: SYSTEM_EMAIL,
          user_name: 'Sistema — Sincronização Drive',
          tipo_detectado: tipoDetectado,
          status_processamento: 'AGUARDANDO_REVISAO',
          arquivo_original_url: fileUrl,
          file_name_original: arquivo.name,
          file_name_final: arquivo.name,
          mime_type: arquivo.mimeType,
          origem: 'DRIVE_SYNC',
          nf_emitente_cpf_cnpj: dadosIA.nf_emitente_cpf_cnpj || '',
          fornecedor_cpf_cnpj: dadosIA.nf_emitente_cpf_cnpj || dadosIA.contratado_cpf_cnpj || '',
          nf_emitente_nome: dadosIA.nf_emitente_nome || '',
          fornecedor_nome: dadosIA.nf_emitente_nome || dadosIA.contratado_nome || '',
          nf_numero: dadosIA.nf_numero || '',
          nf_valor_total: dadosIA.nf_valor_total || 0,
          nf_chave_acesso: dadosIA.nf_chave_acesso || '',
          municipio: dadosIA.municipio_emissao || '',
          centro_custo: dadosIA.centro_custo_sugerido || '',
          resultado_ia: {
            ...dadosIA,
            drive_file_id: arquivo.id,
            drive_folder_path: arquivo._pastaPath,
            drive_modified_time: arquivo.modifiedTime,
          },
        });

        criados.push({ arquivo: arquivo.name, id: intake.id, tipo: tipoDetectado });
      } catch (e) {
        erros.push({ arquivo: arquivo.name, erro: String((e as any)?.message || e) });
      }
    }

    return Response.json({
      success: true,
      resumo: {
        encontrados_total: candidatos.length,
        novos_no_drive: novos.length,
        processados_neste_lote: lote.length,
        criados: criados.length,
        restantes: Math.max(0, novos.length - lote.length),
        erros: erros.length,
      },
      criados,
      erros,
    });

  } catch (error) {
    console.error('[sincronizarDocumentosDrive] Erro:', error);
    return Response.json({ error: String((error as any)?.message || error) }, { status: 500 });
  }
});