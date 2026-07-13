import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const DRIVE_FOLDER_ID = '1sI_XEZpUo3W5gcs2Nik3rGm1v6bAbKTh';

const MESES_MAP: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, março: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
  jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6,
  jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12
};

function normalizarMes(texto: string): { mes: string; mes_num: number } | null {
  const lower = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  for (const [k, v] of Object.entries(MESES_MAP)) {
    const kn = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (lower.includes(kn)) {
      return { mes: k.charAt(0).toUpperCase() + k.slice(1), mes_num: v };
    }
  }
  return null;
}

function extrairAno(texto: string): number {
  const m = texto.match(/20\d{2}/);
  return m ? parseInt(m[0]) : new Date().getFullYear();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Auth — permite admin ou coordenador
    let user: any = null;
    try {
      user = await base44.auth.me();
    } catch (_) {}
    if (!user) return Response.json({ error: 'Unauthorized — faça login primeiro.' }, { status: 401 });

    const role = (user.role || '').toLowerCase();
    if (!['admin', 'coordenador', 'coordinator'].includes(role)) {
      return Response.json({ error: 'Apenas administradores ou coordenadores podem executar esta rotina.' }, { status: 403 });
    }

    // Obter token do Drive — tenta conexão do usuário primeiro, depois service role
    let token: string | null = null;
    const tryConn = async (client: any) => {
      try {
        const c = await client.connectors.getConnection('googledrive');
        if (c?.access_token) return c.access_token;
      } catch (_) {}
      return null;
    };
    token = await tryConn(base44) || await tryConn(base44.asServiceRole);

    if (!token) {
      return Response.json({
        error: 'Google Drive não está conectado. Acesse Configurações → Integrações e conecte o Google Drive.',
        code: 'DRIVE_NOT_CONNECTED'
      }, { status: 401 });
    }

    // Listar PDFs recursivamente
    async function listPDFs(folderId: string, depth = 0): Promise<any[]> {
      if (depth > 4) return [];
      let files: any[] = [];
      let pageToken: string | null = null;
      do {
        const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,createdTime,webViewLink)&pageSize=100${pageToken ? '&pageToken=' + pageToken : ''}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          const errText = await res.text();
          console.error(`[Drive] Erro ao listar pasta ${folderId}: ${res.status} ${errText}`);
          break;
        }
        const data = await res.json();
        if (data.error) {
          console.error(`[Drive] API error:`, data.error);
          break;
        }
        for (const f of (data.files || [])) {
          if (f.mimeType === 'application/vnd.google-apps.folder') {
            const sub = await listPDFs(f.id, depth + 1);
            files = files.concat(sub);
          } else if (f.mimeType === 'application/pdf') {
            files.push(f);
          }
        }
        pageToken = data.nextPageToken || null;
      } while (pageToken);
      return files;
    }

    // Fazer download do PDF como base64 para enviar à IA
    async function downloadPDFBase64(fileId: string): Promise<string | null> {
      try {
        const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          console.error(`[Drive] Falha ao baixar PDF ${fileId}: ${res.status}`);
          return null;
        }
        const buffer = await res.arrayBuffer();
        // Converter para base64 data URI
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const b64 = btoa(binary);
        return `data:application/pdf;base64,${b64}`;
      } catch (e) {
        console.error(`[Drive] Erro ao baixar PDF:`, e);
        return null;
      }
    }

    const pdfs = await listPDFs(DRIVE_FOLDER_ID);
    if (pdfs.length === 0) {
      return Response.json({
        success: true,
        message: 'Nenhum PDF encontrado na pasta de extratos.',
        resumo: { pdfs_encontrados: 0, novos_criados: 0, atualizados: 0, erros: 0 }
      });
    }

    // Carregar IDs já processados
    const existentes = await base44.asServiceRole.entities.MovimentacaoBancaria.list('-created_date', 500);
    const idsProcessados = new Set(existentes.map((e: any) => e.drive_file_id).filter(Boolean));

    const novos: any[] = [];
    const atualizados: any[] = [];
    const erros: any[] = [];

    for (const pdf of pdfs) {
      const jaExiste = idsProcessados.has(pdf.id);

      // Determinar tipo pelo nome
      const nomeL = pdf.name.toLowerCase();
      const isRendimento = nomeL.includes('rendimento') || nomeL.includes('aplicacao') ||
        nomeL.includes('aplicação') || nomeL.includes('investimento') ||
        nomeL.includes('cdb') || nomeL.includes('poupanca') || nomeL.includes('poupança');
      const tipo = isRendimento ? 'extrato_rendimento' : 'extrato_conta';

      const mesInfo = normalizarMes(pdf.name) || normalizarMes(pdf.createdTime || '');
      const ano = extrairAno(pdf.name) || new Date().getFullYear();
      const mes_num = mesInfo?.mes_num || (new Date(pdf.createdTime || Date.now()).getMonth() + 1);
      const mes = mesInfo?.mes || ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes_num - 1];

      // Tentar baixar o PDF para processamento pela IA
      let dadosExtraidos: any = {};
      const pdfBase64 = await downloadPDFBase64(pdf.id);

      if (pdfBase64) {
        try {
          // Fazer upload do PDF para storage temporário para usar como file_url
          const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file: pdfBase64 });
          const pdfFileUrl = uploadRes?.file_url;

          if (pdfFileUrl) {
            dadosExtraidos = await base44.asServiceRole.integrations.Core.InvokeLLM({
              prompt: `Analise este extrato bancário/financeiro brasileiro e extraia os dados em JSON.
Arquivo: "${pdf.name}"
Tipo detectado: ${tipo === 'extrato_rendimento' ? 'Extrato de Rendimento/Investimento' : 'Extrato de Conta Corrente'}

Extraia com precisão: banco, conta, saldos, totais de créditos/débitos/rendimentos e todos os lançamentos.
Para cada lançamento: data no formato DD/MM/AAAA, descrição completa, tipo (credito/debito/rendimento), valor numérico positivo, saldo após o lançamento.
O campo resumo_ia deve ser uma frase descrevendo o período (ex: "Extrato de janeiro/2026 com 12 créditos e 8 débitos, saldo final positivo").`,
              file_urls: [pdfFileUrl],
              response_json_schema: {
                type: 'object',
                properties: {
                  banco: { type: 'string' },
                  conta: { type: 'string' },
                  saldo_inicial: { type: 'number' },
                  saldo_final: { type: 'number' },
                  total_creditos: { type: 'number' },
                  total_debitos: { type: 'number' },
                  total_rendimento: { type: 'number' },
                  lancamentos: {
                    type: 'array',
                    items: {
                      type: 'object',
                      properties: {
                        data: { type: 'string' },
                        descricao: { type: 'string' },
                        tipo: { type: 'string' },
                        valor: { type: 'number' },
                        saldo: { type: 'number' }
                      }
                    }
                  },
                  resumo_ia: { type: 'string' }
                }
              }
            }) || {};
          }
        } catch (iaErr) {
          console.error(`[IA] Erro ao processar ${pdf.name}:`, iaErr);
          dadosExtraidos = { banco: 'Erro IA', resumo_ia: `Erro ao processar: ${String(iaErr).substring(0, 100)}` };
        }
      } else {
        // Sem PDF baixado — registra só os metadados com aviso
        dadosExtraidos = {
          banco: 'Não processado',
          resumo_ia: 'PDF não pôde ser baixado do Drive para análise pela IA.'
        };
      }

      const registro = {
        mes,
        mes_num,
        ano,
        tipo,
        banco: dadosExtraidos.banco || 'Não identificado',
        conta: dadosExtraidos.conta || '',
        saldo_inicial: Number(dadosExtraidos.saldo_inicial) || 0,
        saldo_final: Number(dadosExtraidos.saldo_final) || 0,
        total_creditos: Number(dadosExtraidos.total_creditos) || 0,
        total_debitos: Number(dadosExtraidos.total_debitos) || 0,
        total_rendimento: Number(dadosExtraidos.total_rendimento) || 0,
        lancamentos: Array.isArray(dadosExtraidos.lancamentos) ? dadosExtraidos.lancamentos : [],
        drive_file_id: pdf.id,
        drive_file_url: pdf.webViewLink || `https://drive.google.com/file/d/${pdf.id}/view`,
        drive_file_name: pdf.name,
        processado_em: new Date().toISOString(),
        resumo_ia: dadosExtraidos.resumo_ia || ''
      };

      try {
        if (jaExiste) {
          const existente = existentes.find((e: any) => e.drive_file_id === pdf.id);
          if (existente) {
            await base44.asServiceRole.entities.MovimentacaoBancaria.update(existente.id, registro);
            atualizados.push({ arquivo: pdf.name, id: existente.id });
          }
        } else {
          const criado = await base44.asServiceRole.entities.MovimentacaoBancaria.create(registro);
          novos.push({ arquivo: pdf.name, id: criado.id });
        }
      } catch (dbErr) {
        erros.push({ arquivo: pdf.name, erro: String(dbErr) });
      }
    }

    return Response.json({
      success: true,
      resumo: {
        pdfs_encontrados: pdfs.length,
        novos_criados: novos.length,
        atualizados: atualizados.length,
        erros: erros.length
      },
      novos,
      atualizados,
      erros
    });

  } catch (error) {
    console.error('[lerExtratosBancariosDrive] Erro geral:', error);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});