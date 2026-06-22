import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

function parseValorBR(v) {
  const raw = String(v || '').trim().replace(/\s/g, '');
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(raw.replace(',', '.')) || 0;
}

async function extrairValorLiquidoDeXML(url) {
  try {
    const res = await fetch(url);
    const xml = await res.text();
    const tag = (regex) => { const m = xml.match(regex); return (m?.[1] || '').trim(); };
    return parseValorBR(
      tag(/<vLiquidoNfse[^>]*>([\d.,]+)<\/vLiquidoNfse>/i) ||
      tag(/<vLiq[^>]*>([\d.,]+)<\/vLiq>/i) ||
      tag(/<vLiquido[^>]*>([\d.,]+)<\/vLiquido>/i) ||
      tag(/<ValorLiquido[^>]*>([\d.,]+)<\/ValorLiquido>/i)
    );
  } catch { return 0; }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Apenas administradores.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const limite = body.limite || 30;
    const pular = body.pular || 0;

    const svc = base44.asServiceRole;
    const stats = { processados: 0, com_xml: 0, xml_liquido: 0, atualizados: 0, sem_xml: 0, erros: 0, proximo_pular: 0, detalhes: [] };

    // Buscar apenas um lote
    const purchases = await svc.entities.PurchaseRequest.list('-created_date', limite, pular);

    if (!purchases || !purchases.length) {
      return Response.json({ ...stats, concluido: true, mensagem: 'Nenhuma solicitação encontrada.' });
    }

    stats.proximo_pular = pular + purchases.length;

    for (const p of purchases) {
      try {
        // Coletar URLs de XML
        const xmlUrls = [];
        const addXml = (u) => { if (u && typeof u === 'string' && u.startsWith('http') && u.toLowerCase().endsWith('.xml')) xmlUrls.push(u); };
        addXml(p.nf_xml_url);
        addXml(p.arquivo_url);
        addXml(p.file_url);
        addXml(p.documento_url);

        // Coletar todas URLs para fallback de total
        const totalNF = parseValorBR(p.nf_valor_total || p.valor_solicitado || p.valor_total || 0);

        if (xmlUrls.length > 0) {
          stats.com_xml++;
          // Tentar cada XML
          let liquido = 0;
          for (const url of xmlUrls) {
            liquido = await extrairValorLiquidoDeXML(url);
            if (liquido > 0) break;
          }

          if (liquido > 0) {
            stats.xml_liquido++;
            await svc.entities.PurchaseRequest.update(p.id, {
              nf_valor_liquido: liquido,
            });
            stats.atualizados++;
            stats.detalhes.push({
              id: p.id,
              desc: (p.descricao_item || p.fornecedor_nome || '').slice(0, 50),
              valor_total: totalNF,
              valor_liquido: liquido,
              fonte: 'xml',
            });
          }
          // Se XML existe mas não tem vLiquidoNfse, usar total como líquido
          else if (totalNF > 0) {
            await svc.entities.PurchaseRequest.update(p.id, {
              nf_valor_liquido: totalNF,
            });
            stats.atualizados++;
            stats.detalhes.push({
              id: p.id,
              desc: (p.descricao_item || p.fornecedor_nome || '').slice(0, 50),
              valor_total: totalNF,
              valor_liquido: totalNF,
              fonte: 'total_sem_liquido_xml',
            });
          }
        } else {
          // Sem XML: se tem valor total, usa como líquido (sem retenções visíveis)
          stats.sem_xml++;
          if (totalNF > 0) {
            await svc.entities.PurchaseRequest.update(p.id, {
              nf_valor_liquido: totalNF,
            });
            stats.atualizados++;
            stats.detalhes.push({
              id: p.id,
              desc: (p.descricao_item || p.fornecedor_nome || '').slice(0, 50),
              valor_total: totalNF,
              valor_liquido: totalNF,
              fonte: 'total_sem_xml',
            });
          }
        }
      } catch (e) {
        stats.erros++;
        stats.detalhes.push({ id: p.id, erro: e.message?.slice(0, 150) });
      }
      stats.processados++;
    }

    const temMais = purchases.length === limite;
    return Response.json({
      ...stats,
      concluido: !temMais,
      mensagem: temMais
        ? `Processados ${stats.processados}. Execute novamente com pular=${stats.proximo_pular} para continuar.`
        : 'Lote concluído.',
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
});