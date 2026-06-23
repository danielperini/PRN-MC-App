import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const MAX_POR_CHAMADA = 10;
const DELAY_ENTRE_BATCHES_MS = 1500;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function safeStr(v) { return String(v || '').trim(); }
function onlyDigits(v) { return String(v || '').replace(/\D/g, ''); }
function parseValorBR(v) {
  const raw = String(v || '').trim().replace(/\s/g, '');
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(raw.replace(',', '.')) || 0;
}

async function parseXmlRaw(url) {
  try {
    const res = await fetch(url);
    const xml = await res.text();
    const tag = (regex) => { const m = xml.match(regex); return (m?.[1] || '').trim(); };
    return {
      nf_emitente_cpf_cnpj: onlyDigits(tag(/<CNPJ[^>]*>(\d+)<\/CNPJ>/i) || tag(/<CPF[^>]*>(\d+)<\/CPF>/i)),
      nf_emitente_nome: tag(/<xNome[^>]*>([^<]+)<\/xNome>/i) || tag(/<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i),
      nf_numero: onlyDigits(tag(/<nNF[^>]*>(\d+)<\/nNF>/i) || tag(/<Numero[^>]*>(\d+)<\/Numero>/i) || tag(/<nNfse[^>]*>(\d+)<\/nNfse>/i)),
      nf_valor_total: parseValorBR(tag(/<vNF[^>]*>([\d.,]+)<\/vNF>/i) || tag(/<ValorTotal[^>]*>([\d.,]+)<\/ValorTotal>/i)),
      nf_valor_liquido: parseValorBR(tag(/<vLiquidoNfse[^>]*>([\d.,]+)<\/vLiquidoNfse>/i) || tag(/<vLiq[^>]*>([\d.,]+)<\/vLiq>/i) || tag(/<vLiquido[^>]*>([\d.,]+)<\/vLiquido>/i) || tag(/<ValorLiquido[^>]*>([\d.,]+)<\/ValorLiquido>/i)),
      nf_data_emissao: (tag(/<dhEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<dEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<DataEmissao[^>]*>(\d{4}-\d{2}-\d{2})/i)).slice(0,10),
      nf_chave_acesso: tag(/<chNFe[^>]*>(\d{44})<\/chNFe>/i) || tag(/<ChaveAcesso[^>]*>(\d+)<\/ChaveAcesso>/i),
      competencia: tag(/<Competencia[^>]*>([^<]+)<\/Competencia>/i),
      municipio: tag(/<xMun[^>]*>([^<]+)<\/xMun>/i) || tag(/<Municipio[^>]*>([^<]+)<\/Municipio>/i),
      dados_bancarios: (tag(/<banco[^>]*>([^<]+)<\/banco>/i) + ' ' + tag(/<agencia[^>]*>([^<]+)<\/agencia>/i) + ' ' + tag(/<conta[^>]*>([^<]+)<\/conta>/i)).trim(),
      chave_pix: tag(/<PIX[^>]*>([^<]+)<\/PIX>/i) || tag(/<chavePIX[^>]*>([^<]+)<\/chavePIX>/i),
    };
  } catch { return {}; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas admin' }, { status: 403 });
    }

    const svc = base44.asServiceRole;

    // Buscar intakes pendentes que PRECISAM de análise (sem dados completos no resultado_ia)
    const pendentes = [];
    let skip = 0;
    while (true) {
      const batch = await svc.entities.DocumentIntake.filter(
        {
          status_processamento: { $in: ['AGUARDANDO_REVISAO', 'ERRO_PROCESSAMENTO', 'ENVIADO'] },
          status_registro: { $ne: 'REMOVIDO' },
          tipo_detectado: { $in: ['NOTA_FISCAL_PDF', 'NOTA_FISCAL_XML', 'PENDENTE'] },
          ocultar_entrada_unica: { $ne: true },
        },
        '-created_date',
        50,
        skip
      );
      if (!batch || !batch.length) break;
      // Filtrar: só incluir se NÃO tem dados completos no resultado_ia
      for (const intake of batch) {
        const ria = intake.resultado_ia;
        const temDadosCompletos = ria && (
          (ria.nf_emitente_cpf_cnpj || ria.fornecedor_cpf_cnpj) &&
          (ria.nf_numero || ria.numero_nf) &&
          (ria.nf_valor_total || ria.valor_total) &&
          (ria.nf_emitente_nome || ria.fornecedor_nome)
        );
        if (!temDadosCompletos) {
          pendentes.push(intake);
        }
      }
      skip += 50;
    }

    const totalDisponivel = pendentes.length;
    const paraProcessar = pendentes.slice(0, MAX_POR_CHAMADA);
    
    console.log(`Total pendentes: ${totalDisponivel}, processando ${paraProcessar.length} nesta chamada`);

    const resultados = {
      total_disponivel: totalDisponivel,
      nesta_chamada: paraProcessar.length,
      processados: 0,
      com_erro: 0,
      detalhes: [],
    };

    // Processar um por um
    for (const intake of paraProcessar) {
      try {
        const urls = [];
        if (intake.arquivo_original_url?.startsWith('http')) urls.push(intake.arquivo_original_url);
        if (intake.nf_xml_url?.startsWith('http')) urls.push(intake.nf_xml_url);
        if (intake.nf_xml_intake_id) {
          try {
            const xmlIntake = await svc.entities.DocumentIntake.get(intake.nf_xml_intake_id);
            if (xmlIntake?.arquivo_original_url?.startsWith('http')) urls.push(xmlIntake.arquivo_original_url);
            if (xmlIntake?.nf_xml_url?.startsWith('http')) urls.push(xmlIntake.nf_xml_url);
          } catch { /* ok */ }
        }

        if (urls.length === 0) {
          resultados.detalhes.push({ id: intake.id, file: intake.file_name_original, erro: 'Sem URLs' });
          resultados.com_erro++;
          continue;
        }

        let dadosXML = {};
        for (const url of urls) {
          if (url.toLowerCase().endsWith('.xml')) { dadosXML = await parseXmlRaw(url); break; }
        }

        const hoje = new Date().toISOString().slice(0, 10);
        const iaResult = await svc.integrations.Core.InvokeLLM({
          prompt: `Você é um especialista em documentos fiscais brasileiros. Analise TODOS os arquivos anexados e extraia CADA campo abaixo.

INSTRUÇÕES:
- Leia TODAS as páginas do PDF. Não pule nenhuma.
- Se houver XML, prefira os dados do XML (fonte oficial).
- Extraia TODOS os campos. NÃO DEIXE CAMPOS EM BRANCO se existir no documento.
- CPF/CNPJ do emitente e valor total são OBRIGATÓRIOS.
- Dados bancários e PIX: procure em todas as páginas.
- Classifique centro de custo: MHAB/MAB → "MHAB", MIS → "MIS", MUMO → "MUMO", Noturno/Pampulha → "Noturno Pampulha", senão "Geral".

Dados já extraídos do XML: ${JSON.stringify(dadosXML)}
Data atual: ${hoje}`,
          file_urls: urls.filter(u => !u.toLowerCase().endsWith('.xml')),
          model: 'claude_sonnet_4_6',
          response_json_schema: {
            type: 'object',
            properties: {
              tipo_documento: { type: 'string' },
              descricao_servico: { type: 'string' },
              fornecedor_nome: { type: 'string' },
              fornecedor_cpf_cnpj: { type: 'string' },
              nf_numero: { type: 'string' },
              nf_data_emissao: { type: 'string' },
              nf_valor_total: { type: 'number' },
              nf_valor_liquido: { type: 'number' },
              nf_chave_acesso: { type: 'string' },
              competencia: { type: 'string' },
              municipio: { type: 'string' },
              centro_custo: { type: 'string' },
              categoria: { type: 'string' },
              tipo_gasto: { type: 'string' },
              meta_sugerida: { type: 'string' },
              rubrica_nome: { type: 'string' },
              rubrica_justificativa: { type: 'string' },
              meio_pagamento: { type: 'string' },
              dados_bancarios: { type: 'string' },
              chave_pix: { type: 'string' },
              observacoes: { type: 'string' },
            },
          },
        });

        const ia = iaResult?.response || iaResult || {};
        const m = (a, b) => (b && b !== '') ? b : (a || '');

        const resultadoIA = {
          nf_emitente_cpf_cnpj: m(ia.fornecedor_cpf_cnpj, dadosXML.nf_emitente_cpf_cnpj),
          nf_emitente_nome: m(ia.fornecedor_nome, dadosXML.nf_emitente_nome),
          nf_numero: m(ia.nf_numero, dadosXML.nf_numero),
          nf_valor_total: dadosXML.nf_valor_total || ia.nf_valor_total || 0,
          nf_valor_liquido: dadosXML.nf_valor_liquido || ia.nf_valor_liquido || 0,
          nf_data_emissao: m(ia.nf_data_emissao, dadosXML.nf_data_emissao),
          nf_chave_acesso: m(ia.nf_chave_acesso, dadosXML.nf_chave_acesso),
          competencia: m(ia.competencia, dadosXML.competencia),
          municipio: m(ia.municipio, dadosXML.municipio),
          descricao_servico: ia.descricao_servico || '',
          centro_custo: ia.centro_custo || '',
          categoria: ia.categoria || '',
          tipo_gasto: ia.tipo_gasto || 'Serviço',
          meta_sugerida: ia.meta_sugerida || '',
          rubrica_nome: ia.rubrica_nome || '',
          rubrica_justificativa: ia.rubrica_justificativa || '',
          meio_pagamento: ia.meio_pagamento || '',
          dados_bancarios: m(ia.dados_bancarios, dadosXML.dados_bancarios),
          chave_pix: m(ia.chave_pix, dadosXML.chave_pix),
          observacoes: ia.observacoes || '',
          processado_em_lote: new Date().toISOString(),
        };

        await svc.entities.DocumentIntake.update(intake.id, {
          resultado_ia: resultadoIA,
          status_processamento: 'AGUARDANDO_REVISAO',
          tipo_detectado: 'NOTA_FISCAL_PDF',
          fornecedor_nome: resultadoIA.nf_emitente_nome,
          fornecedor_cpf_cnpj: safeStr(resultadoIA.nf_emitente_cpf_cnpj),
          nf_emitente_nome: resultadoIA.nf_emitente_nome,
          nf_emitente_cpf_cnpj: safeStr(resultadoIA.nf_emitente_cpf_cnpj),
          nf_numero: safeStr(resultadoIA.nf_numero),
          nf_valor_total: resultadoIA.nf_valor_total || 0,
          centro_custo: resultadoIA.centro_custo,
          rubrica_nome_sugerida: resultadoIA.rubrica_nome,
          rubrica_justificativa: resultadoIA.rubrica_justificativa,
          erros_validacao: [],
        });

        resultados.detalhes.push({
          id: intake.id, file: intake.file_name_original, status: 'OK',
          fornecedor: resultadoIA.nf_emitente_nome, nf: resultadoIA.nf_numero, valor: resultadoIA.nf_valor_total,
        });
        resultados.processados++;

      } catch (e) {
        console.error(`Erro intake ${intake.id}:`, e.message);
        resultados.detalhes.push({ id: intake.id, file: intake.file_name_original, erro: e.message });
        resultados.com_erro++;
        try {
          await svc.entities.DocumentIntake.update(intake.id, {
            status_processamento: 'ERRO_PROCESSAMENTO',
            erros_validacao: [`Erro IA: ${e.message}`],
          });
        } catch { /* ok */ }
      }
    }

    return Response.json(resultados);

  } catch (error) {
    console.error('processarPendentesEmLote error:', error);
    return Response.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
});