import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';

// ── UTILS ──
const onlyDigits = (v) => String(v || '').replace(/\D/g, '');
const safeStr = (v) => String(v || '').trim();
const norm = (v) => safeStr(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

function parseValorBR(v) {
  const raw = String(v || '').trim().replace(/\s/g, '');
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(raw.replace(',', '.')) || 0;
}

// ── Extrai file ID de URL do Google Drive ──
function extrairDriveFileId(url) {
  if (!url) return null;
  const s = String(url);
  let m = s.match(/\/file\/d\/([^/?#]+)/);
  if (m) return m[1];
  m = s.match(/[?&]id=([^&]+)/);
  if (m) return m[1];
  m = s.match(/\/d\/([^/?#]+)/);
  if (m) return m[1];
  return null;
}

// ── PARSE DE XML RAW (determinístico, sem OpenAI) ──
async function parseXmlRaw(url, driveToken) {
  try {
    let xml = '';
    let res;
    const fileId = extrairDriveFileId(url);
    // Se for URL do Google Drive, baixa via Drive API (conteúdo real)
    if (fileId && driveToken) {
      res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${driveToken}` },
        signal: AbortSignal.timeout(20_000),
      });
    } else {
      res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    }
    if (!res.ok) return { _erro: `HTTP ${res.status}` };
    xml = await res.text();
    const tag = (regex) => { const m = xml.match(regex); return (m?.[1] || '').trim(); };
    const emitenteNome = tag(/<xNome[^>]*>([^<]+)<\/xNome>/i) || tag(/<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i);
    const emitenteDoc = onlyDigits(tag(/<CNPJ[^>]*>(\d+)<\/CNPJ>/i) || tag(/<CPF[^>]*>(\d+)<\/CPF>/i));
    return {
      nf_emitente_nome: emitenteNome,
      fornecedor_nome: emitenteNome,
      nf_emitente_cpf_cnpj: emitenteDoc,
      fornecedor_cpf_cnpj: emitenteDoc,
      nf_numero: onlyDigits(tag(/<nNF[^>]*>(\d+)<\/nNF>/i) || tag(/<Numero[^>]*>(\d+)<\/Numero>/i) || tag(/<nNfse[^>]*>(\d+)<\/nNfse>/i)),
      nf_valor_total: parseValorBR(tag(/<vNF[^>]*>([\d.,]+)<\/vNF>/i) || tag(/<ValorTotal[^>]*>([\d.,]+)<\/ValorTotal>/i)),
      nf_valor_liquido: parseValorBR(tag(/<vLiquidoNfse[^>]*>([\d.,]+)<\/vLiquidoNfse>/i) || tag(/<vLiq[^>]*>([\d.,]+)<\/vLiq>/i) || tag(/<vLiquido[^>]*>([\d.,]+)<\/vLiquido>/i) || tag(/<ValorLiquido[^>]*>([\d.,]+)<\/ValorLiquido>/i)),
      nf_data_emissao: (tag(/<dhEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<dEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<DataEmissao[^>]*>(\d{4}-\d{2}-\d{2})/i)).slice(0, 10),
      nf_chave_acesso: onlyDigits(tag(/<chNFe[^>]*>(\d{44})<\/chNFe>/i) || tag(/<ChaveAcesso[^>]*>(\d+)<\/ChaveAcesso>/i)),
      competencia: tag(/<Competencia[^>]*>([^<]+)<\/Competencia>/i),
      municipio: tag(/<xMun[^>]*>([^<]+)<\/xMun>/i) || tag(/<Municipio[^>]*>([^<]+)<\/Municipio>/i),
      descricao_servico: tag(/<xServ[^>]*>([^<]+)<\/xServ>/i) || tag(/<Discriminacao[^>]*>([^<]+)<\/Discriminacao>/i) || tag(/<Descricao[^>]*>([^<]+)<\/Descricao>/i),
      dados_bancarios: `${tag(/<banco[^>]*>([^<]+)<\/banco>/i)} ${tag(/<agencia[^>]*>([^<]+)<\/agencia>/i)} ${tag(/<conta[^>]*>([^<]+)<\/conta>/i)}`.trim(),
      chave_pix: tag(/<PIX[^>]*>([^<]+)<\/PIX>/i) || tag(/<chavePIX[^>]*>([^<]+)<\/chavePIX>/i),
      _tamanho_xml: xml.length,
    };
  } catch (e) {
    return { _erro: String(e?.message || e || 'fetch failed') };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    const isAdmin = user.role === 'admin';

    const body = await req.json().catch(() => ({}));
    const limite = Math.min(Number(body?.limite) || 60, 100);
    const forcarReprocessar = !!body?.forcar;

    // Token do Google Drive (conector autorizado)
    let driveToken = null;
    try {
      const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      driveToken = typeof conn === 'string' ? conn : (conn?.access_token || conn?.token || conn?.accessToken || null);
    } catch (e) {
      console.warn('[preencherResultadoIA] Drive token indisponível:', e?.message || e);
    }

    // Lista NFs pendentes (AGUARDANDO_REVISAO) — status_registro ATIVO, tipo NF
    const intakes = await base44.asServiceRole.entities.DocumentIntake.filter(
      { status_registro: 'ATIVO', status_processamento: 'AGUARDANDO_REVISAO' },
      '-created_date',
      limite
    );

    const nfs = (intakes || []).filter((i) => {
      const t = String(i.tipo_detectado || '').toUpperCase();
      return t === 'NOTA_FISCAL_XML' || t === 'NOTA_FISCAL_PDF';
    });

    const jaTemResultado = (i) => {
      if (forcarReprocessar) return false;
      const r = i.resultado_ia || {};
      return !!(r && typeof r === 'object' && Object.keys(r).length > 0 && (r.fornecedor_nome || r.nf_emitente_nome || r.nf_emitente_cpf_cnpj || r.fornecedor_cpf_cnpj));
    };

    const ps = [];
    let analisados = 0, preenchidos = 0,	sem_arquivo = 0, com_erro = 0, ja_preenchidos = 0;
    const erros = [];

    for (const intake of nfs) {
      if (jaTemResultado(intake)) { ja_preenchidos++; continue; }

      const xmlUrl = intake.nf_xml_url || (String(intake.tipo_detectado || '').toUpperCase() === 'NOTA_FISCAL_XML' ? intake.arquivo_original_url : null);
      if (!xmlUrl) {
        // PDF sem XML — sem parse determinístico possível; marca como sem_arquivo para IA futura
        sem_arquivo++;
        continue;
      }

      analisados++;
      // Pausa entre requisições para não estourar limite concorrente
      ps.push((async () => {
        const parsed = await parseXmlRaw(xmlUrl, driveToken);
        if (parsed._erro) {
          com_erro++;
          erros.push({ id: intake.id, nome: intake.file_name_final || intake.file_name_original, erro: parsed._erro });
          return;
        }
        if (!parsed.nf_emitente_nome && !parsed.nf_emitente_cpf_cnpj && !parsed.nf_numero) {
          com_erro++;
          erros.push({ id: intake.id, nome: intake.file_name_final || intake.file_name_original, erro: 'XML sem dados extraíveis' });
          return;
        }
        const resultado_ia = {
          nf_numero: parsed.nf_numero || '',
          nf_valor_total: parsed.nf_valor_total || 0,
          nf_valor_liquido: parsed.nf_valor_liquido || 0,
          nf_data_emissao: parsed.nf_data_emissao || '',
          nf_chave_acesso: parsed.nf_chave_acesso || '',
          nf_emitente_nome: parsed.nf_emitente_nome || '',
          fornecedor_nome: parsed.fornecedor_nome || '',
          nf_emitente_cpf_cnpj: parsed.nf_emitente_cpf_cnpj || '',
          fornecedor_cpf_cnpj: parsed.fornecedor_cpf_cnpj || '',
          municipio: parsed.municipio || '',
          competencia: parsed.competencia || '',
          descricao_servico: parsed.descricao_servico || '',
          dados_bancarios: parsed.dados_bancarios || '',
          chave_pix: parsed.chave_pix || '',
          origem_analise: 'xml_deterministico',
          analisado_em: new Date().toISOString(),
          _tamanho_xml: parsed._tamanho_xml || 0,
        };
        try {
          await base44.asServiceRole.entities.DocumentIntake.update(intake.id, { resultado_ia });
          preenchidos++;
        } catch (e) {
          com_erro++;
          erros.push({ id: intake.id, erro: `update falhou: ${e?.message || e}` });
        }
      })());
      // Processa em lotes de 8 para evitar timeout/concorrência
      if (ps.length >= 8) {
        await Promise.all(ps.splice(0));
      }
    }
    if (ps.length) await Promise.all(ps);

    return Response.json({
      success: true,
      total_candidatos: nfs.length,
      ja_preenchidos,
      analisados,
      preenchidos,
      sem_arquivo,
      com_erro,
      erros: erros.slice(0, 20),
      iniciado_por: user.email,
    });
  } catch (error) {
    console.error('preencherResultadoIANFsPendentes error:', error);
    return Response.json({ success: false, error: error?.message || 'Erro interno' }, { status: 500 });
  }
});