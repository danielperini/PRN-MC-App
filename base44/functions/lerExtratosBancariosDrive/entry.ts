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
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'ADMIN'].includes(user.role || '')) {
      return Response.json({ error: 'Apenas administradores podem executar esta rotina.' }, { status: 403 });
    }

    // Obter token do Drive
    let conn: any = null;
    try { conn = await base44.connectors.getConnection('googledrive'); } catch (_) {}
    if (!conn?.access_token) {
      try { conn = await base44.asServiceRole.connectors.getConnection('googledrive'); } catch (_) {}
    }
    if (!conn?.access_token) {
      return Response.json({ error: 'Conector Google Drive não autenticado.' }, { status: 401 });
    }
    const token = conn.access_token;

    // Listar arquivos PDF na pasta e subpastas
    async function listPDFs(folderId: string, depth = 0): Promise<any[]> {
      if (depth > 4) return [];
      let files: any[] = [];
      let pageToken: string | null = null;
      do {
        const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
        const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,createdTime,webViewLink)&pageSize=100${pageToken ? '&pageToken=' + pageToken : ''}`;
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json();
        if (data.error) break;
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

    const pdfs = await listPDFs(DRIVE_FOLDER_ID);
    if (pdfs.length === 0) {
      return Response.json({ success: true, message: 'Nenhum PDF encontrado na pasta.', processados: 0, criados: 0 });
    }

    // Carregar IDs já processados
    const existentes = await base44.asServiceRole.entities.MovimentacaoBancaria.list('-created_date', 500);
    const idsProcessados = new Set(existentes.map((e: any) => e.drive_file_id).filter(Boolean));

    const novos: any[] = [];
    const atualizados: any[] = [];
    const erros: any[] = [];

    for (const pdf of pdfs) {
      // Verificar se já foi processado
      const jaExiste = idsProcessados.has(pdf.id);

      // Baixar conteúdo do PDF como base64 para enviar à IA
      let pdfUrl: string;
      try {
        // Usar URL de download direto para IA processar
        pdfUrl = `https://drive.google.com/uc?export=download&id=${pdf.id}`;
      } catch (_) {
        erros.push({ arquivo: pdf.name, erro: 'Falha ao obter URL do PDF' });
        continue;
      }

      // Determinar tipo pelo nome do arquivo
      const nomeL = pdf.name.toLowerCase();
      const isRendimento = nomeL.includes('rendimento') || nomeL.includes('aplicacao') || nomeL.includes('aplicação') || nomeL.includes('investimento') || nomeL.includes('cdb') || nomeL.includes('poupanca');
      const tipo = isRendimento ? 'extrato_rendimento' : 'extrato_conta';

      // Extrair mês/ano do nome ou usar data de criação
      const mesInfo = normalizarMes(pdf.name) || normalizarMes(pdf.createdTime || '');
      const ano = extrairAno(pdf.name) || extrairAno(pdf.createdTime || '') || new Date().getFullYear();
      const mes_num = mesInfo?.mes_num || (new Date(pdf.createdTime || Date.now()).getMonth() + 1);
      const mes = mesInfo?.mes || ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes_num - 1];

      // Usar IA para extrair dados do PDF
      let dadosExtraidos: any = {};
      try {
        const resultado = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `Você é um especialista em extratos bancários brasileiros. Analise este extrato bancário/financeiro e extraia as informações em JSON estruturado.

Arquivo: ${pdf.name}
URL do arquivo: ${pdfUrl}

Retorne APENAS o JSON com a estrutura abaixo. Se não conseguir acessar o arquivo, use valores zerados mas retorne a estrutura corretamente.

Estrutura esperada:
{
  "banco": "Nome do banco ou instituição financeira",
  "conta": "Número ou identificação da conta (se disponível)",
  "saldo_inicial": 0.00,
  "saldo_final": 0.00,
  "total_creditos": 0.00,
  "total_debitos": 0.00,
  "total_rendimento": 0.00,
  "lancamentos": [
    {
      "data": "DD/MM/AAAA",
      "descricao": "Descrição do lançamento",
      "tipo": "credito | debito | rendimento",
      "valor": 0.00,
      "saldo": 0.00
    }
  ],
  "resumo_ia": "Resumo breve do período em 1-2 frases"
}`,
          file_urls: [pdfUrl],
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
              lancamentos: { type: 'array', items: { type: 'object' } },
              resumo_ia: { type: 'string' }
            }
          }
        });
        dadosExtraidos = resultado || {};
      } catch (iaErr) {
        console.error(`[IA] Erro ao processar ${pdf.name}:`, iaErr);
        dadosExtraidos = { banco: 'Não identificado', resumo_ia: 'Erro ao processar com IA' };
      }

      const registro = {
        mes,
        mes_num,
        ano,
        tipo,
        banco: dadosExtraidos.banco || 'Não identificado',
        conta: dadosExtraidos.conta || '',
        saldo_inicial: dadosExtraidos.saldo_inicial || 0,
        saldo_final: dadosExtraidos.saldo_final || 0,
        total_creditos: dadosExtraidos.total_creditos || 0,
        total_debitos: dadosExtraidos.total_debitos || 0,
        total_rendimento: dadosExtraidos.total_rendimento || 0,
        lancamentos: dadosExtraidos.lancamentos || [],
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
    return Response.json({ error: error.message }, { status: 500 });
  }
});