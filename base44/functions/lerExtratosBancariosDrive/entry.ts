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

    let user: any = null;
    try { user = await base44.auth.me(); } catch (_) {}
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const role = (user.role || '').toLowerCase();
    if (!['admin', 'coordenador', 'coordinator'].includes(role)) {
      return Response.json({ error: 'Apenas administradores ou coordenadores podem executar esta rotina.' }, { status: 403 });
    }

    // Obter token do Drive via service role (padrão correto do SDK)
    let token: string | null = null;
    try {
      const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
      if (accessToken) token = accessToken;
    } catch (_) {}

    if (!token) {
      return Response.json({
        error: 'Google Drive não está conectado.',
        code: 'DRIVE_NOT_CONNECTED'
      }, { status: 401 });
    }

    // Listar itens de uma pasta
    async function listFolder(folderId: string): Promise<any[]> {
      let files: any[] = [];
      let pageToken: string | null = null;
      do {
        const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,createdTime,modifiedTime,webViewLink)&pageSize=100${pageToken ? '&pageToken=' + pageToken : ''}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) break;
        const data = await res.json();
        files = files.concat(data.files || []);
        pageToken = data.nextPageToken || null;
      } while (pageToken);
      return files;
    }

    // Estrutura: pasta raiz → subpastas mensais → subpasta "extrato" → PDFs
    // O mês é extraído do nome da pasta mensal (pai), não do arquivo
    const pdfs: any[] = [];

    const pastasMensais = (await listFolder(DRIVE_FOLDER_ID))
      .filter((f: any) => f.mimeType === 'application/vnd.google-apps.folder');

    for (const pastaMensal of pastasMensais) {
      // Detecta mês/ano a partir da pasta mensal
      const mesInfoPasta = normalizarMes(pastaMensal.name);
      const anoPasta = extrairAno(pastaMensal.name);

      // Lista conteúdo da pasta mensal
      const conteudoMensal = await listFolder(pastaMensal.id);

      // Procura subpasta chamada "extrato" (case-insensitive)
      const subPastaExtrato = conteudoMensal.find((f: any) =>
        f.mimeType === 'application/vnd.google-apps.folder' &&
        f.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes('extrato')
      );

      let arquivosParaVarrer: any[] = [];
      if (subPastaExtrato) {
        // PDFs dentro da subpasta "extrato"
        arquivosParaVarrer = await listFolder(subPastaExtrato.id);
      } else {
        // Fallback: PDFs direto na pasta mensal
        arquivosParaVarrer = conteudoMensal;
      }

      for (const f of arquivosParaVarrer) {
        if (f.mimeType === 'application/pdf') {
          // Injeta contexto de mês/ano da pasta pai para uso posterior
          pdfs.push({
            ...f,
            _mesInfoPasta: mesInfoPasta,
            _anoPasta: anoPasta,
          });
        }
      }
    }

    // Fallback: se não encontrou nenhuma pasta mensal, varre direto a raiz
    if (pdfs.length === 0) {
      const raiz = await listFolder(DRIVE_FOLDER_ID);
      for (const f of raiz) {
        if (f.mimeType === 'application/pdf') pdfs.push(f);
      }
    }
    if (pdfs.length === 0) {
      return Response.json({
        success: true,
        message: 'Nenhum PDF encontrado na pasta de extratos.',
        resumo: { pdfs_encontrados: 0, novos_criados: 0, atualizados: 0, erros: 0 }
      });
    }

    // Carregar registros existentes
    const existentes = await base44.asServiceRole.entities.MovimentacaoBancaria.list('-created_date', 500);
    const idsProcessados = new Set(existentes.map((e: any) => e.drive_file_id).filter(Boolean));

    // Processar apenas PDFs novos (não processados ainda)
    const pdfsNovos = pdfs.filter((pdf: any) => !idsProcessados.has(pdf.id));

    // Limitar a 3 por chamada para não exceder timeout
    const lote = pdfsNovos.slice(0, 3);

    const novos: any[] = [];
    const erros: any[] = [];

    for (const pdf of lote) {
      const nomeL = pdf.name.toLowerCase();
      const isRendimento = nomeL.includes('rendimento') || nomeL.includes('aplicacao') ||
        nomeL.includes('aplicação') || nomeL.includes('investimento') ||
        nomeL.includes('cdb') || nomeL.includes('poupanca') || nomeL.includes('poupança');
      const tipo = isRendimento ? 'extrato_rendimento' : 'extrato_conta';

      // Prefere mês/ano da pasta mensal pai; fallback para nome do arquivo
      const mesInfo = pdf._mesInfoPasta || normalizarMes(pdf.name) || normalizarMes(pdf.createdTime || '');
      const ano = pdf._anoPasta || extrairAno(pdf.name) || new Date().getFullYear();
      const mes_num = mesInfo?.mes_num || (new Date(pdf.createdTime || Date.now()).getMonth() + 1);
      const mes = mesInfo?.mes || ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes_num - 1];

      let dadosExtraidos: any = {};

      // Baixar PDF como ArrayBuffer e fazer upload via SDK (sem converter para string longa)
      try {
        const dlUrl = `https://www.googleapis.com/drive/v3/files/${pdf.id}?alt=media`;
        const dlRes = await fetch(dlUrl, { headers: { Authorization: `Bearer ${token}` } });

        if (dlRes.ok) {
          const blob = await dlRes.blob();
          const uploadRes = await base44.asServiceRole.integrations.Core.UploadFile({ file: blob });
          const pdfFileUrl = uploadRes?.file_url;

          if (pdfFileUrl) {
            dadosExtraidos = await base44.asServiceRole.integrations.Core.InvokeLLM({
              prompt: `Analise este extrato bancário brasileiro e extraia os dados em JSON.
Arquivo: "${pdf.name}"
Tipo: ${tipo === 'extrato_rendimento' ? 'Extrato de Rendimento/Investimento' : 'Extrato de Conta Corrente'}

Extraia: banco, conta, saldos, totais de créditos/débitos/rendimentos e lançamentos.
Para cada lançamento: data (DD/MM/AAAA), descrição, tipo (credito/debito/rendimento), valor numérico positivo, saldo.
resumo_ia: uma frase descrevendo o período.`,
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
        }
      } catch (iaErr) {
        console.error(`[IA] Erro ao processar ${pdf.name}:`, iaErr);
        dadosExtraidos = { resumo_ia: `Erro ao processar: ${String(iaErr).substring(0, 100)}` };
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
        const criado = await base44.asServiceRole.entities.MovimentacaoBancaria.create(registro);
        novos.push({ arquivo: pdf.name, id: criado.id });
      } catch (dbErr) {
        erros.push({ arquivo: pdf.name, erro: String(dbErr) });
      }
    }

    return Response.json({
      success: true,
      resumo: {
        pdfs_encontrados: pdfs.length,
        novos_no_drive: pdfsNovos.length,
        processados_neste_lote: lote.length,
        novos_criados: novos.length,
        restantes: Math.max(0, pdfsNovos.length - lote.length),
        erros: erros.length
      },
      novos,
      erros
    });

  } catch (error) {
    console.error('[lerExtratosBancariosDrive] Erro geral:', error);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});