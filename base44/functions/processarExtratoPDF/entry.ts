import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { invokeLLM } from '../_shared/gatewayIA.ts';

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

    const body = await req.json().catch(() => ({}));
    const { file_url, file_name } = body;

    if (!file_url || !file_name) {
      return Response.json({ error: 'file_url e file_name são obrigatórios' }, { status: 400 });
    }

    const nomeL = file_name.toLowerCase();
    const isRendimento = nomeL.includes('rendimento') || nomeL.includes('aplicacao') ||
      nomeL.includes('aplicação') || nomeL.includes('investimento') ||
      nomeL.includes('cdb') || nomeL.includes('poupanca') || nomeL.includes('poupança') ||
      nomeL.includes('extrato de investimento');
    const tipo = isRendimento ? 'extrato_rendimento' : 'extrato_conta';

    const mesInfo = normalizarMes(file_name);
    const ano = extrairAno(file_name) || new Date().getFullYear();
    const mes_num = mesInfo?.mes_num || (new Date().getMonth() + 1);
    const mes = mesInfo?.mes || ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'][mes_num - 1];

    let dadosExtraidos: any = {};

    try {
      dadosExtraidos = await invokeLLM(base44.asServiceRole,{
        prompt: `Analise este extrato bancário brasileiro e extraia os dados em JSON.
Arquivo: "${file_name}"
Tipo: ${tipo === 'extrato_rendimento' ? 'Extrato de Rendimento/Investimento' : 'Extrato de Conta Corrente'}

Extraia: banco, conta, saldos, totais de créditos/débitos/rendimentos e lançamentos detalhados.
Para cada lançamento: data (DD/MM/AAAA), descrição, tipo (credito/debito/rendimento), valor numérico positivo, saldo após.
resumo_ia: uma frase descrevendo o período financeiro.`,
        file_urls: [file_url],
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
    } catch (iaErr) {
      console.error('[IA] Erro ao processar extrato:', iaErr);
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
      drive_file_url: file_url,
      drive_file_name: file_name,
      processado_em: new Date().toISOString(),
      resumo_ia: dadosExtraidos.resumo_ia || ''
    };

    const criado = await base44.asServiceRole.entities.MovimentacaoBancaria.create(registro);

    return Response.json({
      success: true,
      id: criado.id,
      tipo,
      mes,
      mes_num,
      ano,
      banco: registro.banco,
      lancamentos: registro.lancamentos.length,
      resumo_ia: registro.resumo_ia
    });

  } catch (error) {
    console.error('[processarExtratoPDF] Erro:', error);
    return Response.json({ error: String(error?.message || error) }, { status: 500 });
  }
});