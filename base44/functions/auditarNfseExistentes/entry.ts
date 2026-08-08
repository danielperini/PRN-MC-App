import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';
import { invokeLLM } from '../_shared/gatewayIA.ts';

const AUDIT_VERSION = '2026-07-cascata-v1';
const STATUS_APROVADOS = new Set(['APROVADO', 'APROVADO_COORD', 'APROVADO_ADMIN', 'PAGO']);

function normalizar(v: any) {
  return String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}
function digitos(v: any) { return String(v || '').replace(/\D/g, ''); }
function numero(v: any) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const t = String(v || '').trim();
  if (!t) return 0;
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t);
  return Number.isFinite(n) ? n : 0;
}
function pdfUrl(item: any) {
  const ia = item?.resultado_ia || {};
  return item?.arquivo_original_url || ia?.drive_pdf_url || ia?.arquivos_fiscais?.pdf || '';
}
function ehNotaFiscal(item: any) {
  const nome = normalizar(item?.file_name_final || item?.file_name_original);
  const tipo = normalizar(item?.tipo_detectado || item?.resultado_ia?.tipo_documento);
  if (['extrato', 'rendimento', 'comprovante', 'recibo', 'contrato', 'aditivo', 'orcamento'].some(t => nome.includes(t))) return false;
  return Boolean(pdfUrl(item)) && (tipo.includes('nota') || tipo.includes('nf') || /\bnf\b/.test(nome) || digitos(item?.nf_numero));
}
function chaveFiscal(dados: any) {
  const chave = digitos(dados?.nf_chave_acesso);
  if (chave.length === 44 || chave.length === 50) return `chave:${chave}`;
  const cnpj = digitos(dados?.nf_emitente_cpf_cnpj || dados?.fornecedor_cpf_cnpj);
  const nf = digitos(dados?.nf_numero);
  return cnpj && nf ? `cnpj-nf:${cnpj}:${nf}` : null;
}
function validarCascata(dados: any) {
  const bruto = numero(dados.valor_servico_bruto || dados.nf_valor_bruto || dados.nf_valor_total);
  const desconto = numero(dados.desconto_incondicionado);
  const irrf = numero(dados.irrf_retido);
  const inss = numero(dados.inss_retido);
  const pis = numero(dados.pis_retido);
  const cofins = numero(dados.cofins_retido);
  const csll = numero(dados.csll_retido);
  const iss = dados.issqn_retido === true || normalizar(dados.issqn_retido).includes('sim') || normalizar(dados.issqn_situacao).includes('retido')
    ? numero(dados.issqn_valor)
    : 0;
  const totalFederais = irrf + inss + pis + cofins + csll;
  const liquidoCalculado = bruto - desconto - totalFederais - iss;
  const liquidoDocumento = numero(dados.valor_liquido_nfse || dados.nf_valor_liquido || dados.nf_valor_total);
  const diferenca = Math.abs(liquidoCalculado - liquidoDocumento);
  return {
    valor_servico_bruto: bruto,
    desconto_incondicionado: desconto,
    irrf_retido: irrf,
    inss_retido: inss,
    pis_retido: pis,
    cofins_retido: cofins,
    csll_retido: csll,
    issqn_valor_retido: iss,
    total_retencoes_federais: totalFederais,
    total_retencoes: totalFederais + iss,
    valor_liquido_calculado: liquidoCalculado,
    valor_liquido_documento: liquidoDocumento,
    diferenca_validacao: diferenca,
    cascata_valida: diferenca <= 0.01,
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (!['admin', 'coordenador', 'coordinator'].includes(normalizar(user.role))) {
      return Response.json({ success: false, error: 'Apenas administradores ou coordenadores podem auditar NFS-e.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const batchSize = Math.max(1, Math.min(10, Number(body.batch_size || 5)));
    const incluirAprovadas = Boolean(body.incluir_aprovadas);
    const intakes = await base44.asServiceRole.entities.DocumentIntake.list('-created_date', 3000);
    const candidatos = intakes.filter((item: any) => {
      if (!ehNotaFiscal(item)) return false;
      if (!incluirAprovadas && STATUS_APROVADOS.has(String(item.status_processamento || '').toUpperCase())) return false;
      return item?.resultado_ia?.auditoria_nfse_versao !== AUDIT_VERSION;
    });

    const lote = candidatos.slice(0, batchSize);
    const atualizados: any[] = [];
    const erros: any[] = [];

    for (const item of lote) {
      try {
        const url = pdfUrl(item);
        const extraido = await invokeLLM(base44.asServiceRole,{
          model: 'claude_sonnet_4_6',
          prompt: `Leia esta NFS-e brasileira com precisão contábil e fiscal. Não aprove, não rejeite e não altere status.

1. Identidade e autenticidade:
- extraia chave de acesso completa de 44 ou 50 dígitos, número da nota, série, competência e data/hora de emissão;
- extraia referências a termo de parceria, convênio ou contrato.

2. Partes:
- PRESTADOR/EMITENTE: razão social, CNPJ/CPF e optante pelo Simples Nacional;
- TOMADOR/CLIENTE: razão social e CNPJ/CPF;
- nunca troque prestador por tomador.

3. Serviço e território:
- código de tributação nacional, código municipal, descrição do serviço e município/local da prestação;
- situação do ISSQN e município competente.

4. Cascata financeira:
- valor bruto do serviço;
- desconto incondicionado;
- ISSQN retido (booleano e valor);
- IRRF, INSS, PIS, COFINS e CSLL retidos;
- valor líquido exato da NFS-e.

5. Retorne apenas dados presentes no documento. Não invente zeros quando o campo estiver ilegível; use null e explique em inconsistencias.
`,
          file_urls: [url],
          response_json_schema: {
            type: 'object',
            properties: {
              nf_chave_acesso: { type: 'string' }, nf_numero: { type: 'string' }, nf_serie: { type: 'string' },
              nf_competencia: { type: 'string' }, nf_data_emissao: { type: 'string' }, nf_hora_emissao: { type: 'string' },
              referencia_projeto: { type: 'string' },
              nf_emitente_nome: { type: 'string' }, nf_emitente_cpf_cnpj: { type: 'string' }, emitente_simples_nacional: { type: 'boolean' },
              tomador_nome: { type: 'string' }, tomador_cpf_cnpj: { type: 'string' },
              codigo_tributacao_nacional: { type: 'string' }, codigo_tributacao_municipal: { type: 'string' },
              descricao_servico: { type: 'string' }, municipio_prestacao: { type: 'string' }, municipio_issqn: { type: 'string' },
              valor_servico_bruto: { type: 'number' }, desconto_incondicionado: { type: 'number' },
              issqn_retido: { type: 'boolean' }, issqn_situacao: { type: 'string' }, issqn_valor: { type: 'number' },
              irrf_retido: { type: 'number' }, inss_retido: { type: 'number' }, pis_retido: { type: 'number' },
              cofins_retido: { type: 'number' }, csll_retido: { type: 'number' }, valor_liquido_nfse: { type: 'number' },
              inconsistencias: { type: 'array', items: { type: 'string' } }, score_confiabilidade: { type: 'number' },
            },
          },
        }) || {};

        const validacao = validarCascata(extraido);
        const chave = chaveFiscal(extraido) || item?.resultado_ia?.chave_fiscal_deterministica || null;
        const resultado = {
          ...(item.resultado_ia || {}),
          ...extraido,
          ...validacao,
          auditoria_nfse_versao: AUDIT_VERSION,
          auditoria_nfse_em: new Date().toISOString(),
          chave_fiscal_deterministica: chave,
          conciliacao_bancaria_valor_esperado: validacao.valor_liquido_documento,
          requer_revisao_humana: !validacao.cascata_valida || (extraido.inconsistencias || []).length > 0,
        };

        await base44.asServiceRole.entities.DocumentIntake.update(item.id, {
          nf_numero: extraido.nf_numero || item.nf_numero || '',
          nf_chave_acesso: extraido.nf_chave_acesso || item.nf_chave_acesso || '',
          nf_emitente_nome: extraido.nf_emitente_nome || item.nf_emitente_nome || '',
          nf_emitente_cpf_cnpj: extraido.nf_emitente_cpf_cnpj || item.nf_emitente_cpf_cnpj || '',
          fornecedor_nome: extraido.nf_emitente_nome || item.fornecedor_nome || '',
          fornecedor_cpf_cnpj: extraido.nf_emitente_cpf_cnpj || item.fornecedor_cpf_cnpj || '',
          nf_valor_total: validacao.valor_liquido_documento || validacao.valor_servico_bruto || numero(item.nf_valor_total),
          municipio: extraido.municipio_prestacao || item.municipio || '',
          resultado_ia: resultado,
        });

        atualizados.push({
          id: item.id,
          arquivo: item.file_name_original,
          nf_numero: extraido.nf_numero,
          valor_bruto: validacao.valor_servico_bruto,
          valor_liquido: validacao.valor_liquido_documento,
          total_retencoes: validacao.total_retencoes,
          cascata_valida: validacao.cascata_valida,
        });
      } catch (error: any) {
        erros.push({ id: item.id, arquivo: item.file_name_original, erro: String(error?.message || error) });
      }
    }

    return Response.json({
      success: true,
      resumo: {
        candidatos: candidatos.length,
        processados: lote.length,
        atualizados: atualizados.length,
        erros: erros.length,
        restantes: Math.max(0, candidatos.length - lote.length),
      },
      atualizados,
      erros,
    });
  } catch (error: any) {
    return Response.json({ success: false, error: String(error?.message || error) }, { status: 500 });
  }
});