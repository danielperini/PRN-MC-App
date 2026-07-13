import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ── helpers ──
function onlyDigits(v) { return String(v || '').replace(/\D/g, ''); }

function normalizeText(v) {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseValorBR(v) {
  const raw = String(v || '').trim().replace(/\s/g, '');
  if (!raw) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(raw)) return Number(raw.replace(/\./g, '').replace(',', '.')) || 0;
  return Number(raw.replace(',', '.')) || 0;
}

function getFileExt(intake) {
  const name = String(intake?.file_name_original || '').toLowerCase();
  if (name.endsWith('.xml')) return 'xml';
  if (name.endsWith('.pdf')) return 'pdf';
  return '';
}

// ── EXTRAIR DADOS DO XML (fetch + parse via regex) ──
async function extrairDadosXML(url) {
  try {
    const res = await fetch(url);
    const xml = await res.text();

    // CNPJ emitente — procura em várias tags comuns
    const cnpjMatch =
      xml.match(/<CNPJ[^>]*>(\d+)<\/CNPJ>/i) ||
      xml.match(/<cnpj[^>]*>(\d+)<\/cnpj>/i) ||
      xml.match(/<Cnpj[^>]*>(\d+)<\/Cnpj>/i) ||
      xml.match(/cpfCnpj["']?\s*[:=]\s*["']?(\d+)/i);

    // CPF emitente
    const cpfMatch =
      xml.match(/<CPF[^>]*>(\d+)<\/CPF>/i) ||
      xml.match(/<cpf[^>]*>(\d+)<\/cpf>/i);

    // Nome do emitente
    const nomeMatch =
      xml.match(/<xNome[^>]*>([^<]+)<\/xNome>/i) ||
      xml.match(/<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i) ||
      xml.match(/<Nome[^>]*>([^<]+)<\/Nome>/i);

    // Número NF
    const nfMatch =
      xml.match(/<nNF[^>]*>(\d+)<\/nNF>/i) ||
      xml.match(/<Numero[^>]*>(\d+)<\/Numero>/i) ||
      xml.match(/<numero[^>]*>(\d+)<\/numero>/i) ||
      xml.match(/<nNfse[^>]*>(\d+)<\/nNfse>/i);

    // Valor total
    const valorMatch =
      xml.match(/<vNF[^>]*>([\d.,]+)<\/vNF>/i) ||
      xml.match(/<Valor[^>]*>([\d.,]+)<\/Valor>/i) ||
      xml.match(/<valor[^>]*>([\d.,]+)<\/valor>/i) ||
      xml.match(/<ValorTotal[^>]*>([\d.,]+)<\/ValorTotal>/i) ||
      xml.match(/<vLiquidoNfse[^>]*>([\d.,]+)<\/vLiquidoNfse>/i);

    // Data emissão
    const dataMatch =
      xml.match(/<dhEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) ||
      xml.match(/<dEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) ||
      xml.match(/<DataEmissao[^>]*>(\d{4}-\d{2}-\d{2})/i) ||
      xml.match(/<Data[^>]*>(\d{4}-\d{2}-\d{2})/i) ||
      xml.match(/<dataEmissao[^>]*>(\d{4}-\d{2}-\d{2})/i);

    // Competencia
    const compMatch =
      xml.match(/<Competencia[^>]*>([^<]+)<\/Competencia>/i) ||
      xml.match(/<competencia[^>]*>([^<]+)<\/competencia>/i);

    // Municipio
    const munMatch =
      xml.match(/<cMunFG[^>]*>\d+<[^>]*>([^<]+)</i) ||
      xml.match(/<Municipio[^>]*>([^<]+)<\/Municipio>/i) ||
      xml.match(/<municipio[^>]*>([^<]+)<\/municipio>/i) ||
      xml.match(/<xMun[^>]*>([^<]+)<\/xMun>/i);

    return {
      nf_emitente_cpf_cnpj: onlyDigits(cnpjMatch?.[1] || cpfMatch?.[1] || ''),
      nf_emitente_nome: (nomeMatch?.[1] || '').trim(),
      nf_numero: onlyDigits(nfMatch?.[1] || ''),
      nf_valor_total: parseValorBR(valorMatch?.[1] || '0'),
      nf_data_emissao: (dataMatch?.[1] || '').trim(),
      competencia: (compMatch?.[1] || '').trim(),
      municipio: (munMatch?.[1] || '').trim(),
    };
  } catch {
    return {};
  }
}

// ── GETTERS (usam dados enriquecidos) ──
function getNFNumero(intake) {
  const ia = intake?.resultado_ia || intake?._dados_xml || {};
  return onlyDigits(ia.nf_numero || intake?.nf_numero || '');
}

function getValorNF(intake) {
  const ia = intake?.resultado_ia || intake?._dados_xml || {};
  return parseValorBR(ia.nf_valor_total || ia.valor_total || ia.valor || intake?.nf_valor_total || '');
}

function getCnpj(intake) {
  const ia = intake?.resultado_ia || intake?._dados_xml || {};
  return onlyDigits(ia.nf_emitente_cpf_cnpj || ia.fornecedor_cpf_cnpj || intake?.nf_emitente_cpf_cnpj || intake?.fornecedor_cpf_cnpj || '');
}

function getEmitenteNome(intake) {
  const ia = intake?.resultado_ia || intake?._dados_xml || {};
  return normalizeText(ia.nf_emitente_nome || ia.fornecedor_nome || intake?.nf_emitente_nome || intake?.fornecedor_nome || '');
}

function getDataEmissao(intake) {
  const ia = intake?.resultado_ia || intake?._dados_xml || {};
  return (ia.nf_data_emissao || intake?.nf_data_emissao || '').slice(0, 7);
}

function getCompetencia(intake) {
  const ia = intake?.resultado_ia || intake?._dados_xml || {};
  const comp = normalizeText(ia.competencia || '');
  const meses = {janeiro:'01',fevereiro:'02',marco:'03',abril:'04',maio:'05',junho:'06',
                 julho:'07',agosto:'08',setembro:'09',outubro:'10',novembro:'11',dezembro:'12'};
  for (const [nome, num] of Object.entries(meses)) {
    if (comp.includes(nome)) {
      const ano = (comp.match(/20\d{2}/) || [])[0];
      if (ano) return `${ano}-${num}`;
    }
  }
  return '';
}

function getNomeBase(intake) {
  return normalizeText(intake?.file_name_original || intake?.file_name_final || '')
    .replace(/\.pdf$/i, '').replace(/\.xml$/i, '')
    .replace(/\bpdf\b/g, '').replace(/\bxml\b/g, '')
    .replace(/\s+/g, ' ').trim();
}

// ── SCORING (0–20+) ──
function calcularScoreVinculo(a, b) {
  let score = 0;

  const cnpjA = getCnpj(a), cnpjB = getCnpj(b);
  if (cnpjA && cnpjB && cnpjA === cnpjB) score += 6;

  const nfA = getNFNumero(a), nfB = getNFNumero(b);
  if (nfA && nfB && nfA === nfB) score += 6;

  const valA = getValorNF(a), valB = getValorNF(b);
  if (valA > 0 && valB > 0 && Math.abs(valA - valB) < 0.06) score += 4;

  const dataA = getDataEmissao(a), dataB = getDataEmissao(b);
  if (dataA && dataB && dataA === dataB) score += 3;

  const compA = getCompetencia(a), compB = getCompetencia(b);
  if (compA && compB && compA === compB) score += 2;

  const nomeA = getEmitenteNome(a), nomeB = getEmitenteNome(b);
  if (nomeA && nomeB) {
    if (nomeA === nomeB) score += 2;
    else if (nomeA.includes(nomeB.slice(0, 10)) || nomeB.includes(nomeA.slice(0, 10))) score += 1;
  }

  // Nome base idêntico (sem extensão) — forte indicador de par PDF+XML
  const rawNomeA = (a?.file_name_original || '').toLowerCase().replace(/\.(pdf|xml)$/i, '').trim();
  const rawNomeB = (b?.file_name_original || '').toLowerCase().replace(/\.(pdf|xml)$/i, '').trim();
  if (rawNomeA && rawNomeB && rawNomeA === rawNomeB) score += 8;

  // Pasta do Drive em comum
  const pastaA = normalizeText((a?.resultado_ia || {}).drive_folder_path || '');
  const pastaB = normalizeText((b?.resultado_ia || {}).drive_folder_path || '');
  if (pastaA && pastaB && pastaA === pastaB) score += 2;

  const baseA = getNomeBase(a), baseB = getNomeBase(b);
  if (baseA && baseB) {
    const palavrasA = baseA.split(' ').filter(p => p.length > 2);
    const palavrasB = baseB.split(' ').filter(p => p.length > 2);
    const comuns = palavrasA.filter(p => palavrasB.includes(p));
    if (comuns.length >= 3) score += 1;
  }

  return score;
}

// ── DUPLICATE DETECTION (CNPJ + NF nº + valor + data) ──
function isDuplicate(a, b) {
  const cnpjA = getCnpj(a), cnpjB = getCnpj(b);
  const nfA = getNFNumero(a), nfB = getNFNumero(b);
  const valA = getValorNF(a), valB = getValorNF(b);
  const dataA = getDataEmissao(a), dataB = getDataEmissao(b);

  if (!cnpjA || !cnpjB || cnpjA !== cnpjB) return false;
  if (!nfA || !nfB || nfA !== nfB) return false;
  if (valA <= 0 || valB <= 0 || Math.abs(valA - valB) >= 0.06) return false;
  if (!dataA || !dataB || dataA !== dataB) return false;

  return true;
}

// ── HANDLER ──
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || !['admin', 'ADMIN', 'COORDENADOR'].includes(user.role)) {
      return Response.json({ error: 'Apenas administradores e coordenadores.' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false;

    const resultado = {
      mode: dryRun ? 'PREVIEW' : 'EXECUCAO',
      pdfs_total: 0, xmls_total: 0, recibos_total: 0,
      xmls_com_dados_extraidos: 0,
      vinculos_xml_criados: 0, vinculos_recibo_criados: 0,
      duplicatas_detectadas: 0, duplicatas_excluidas: 0,
      erros: [], detalhes: [],
    };

    // 1. Carregar todos os DocumentIntake ATIVOS
    const allIntakes = [];
    let skip = 0, hasMore = true;
    while (hasMore) {
      const batch = await base44.asServiceRole.entities.DocumentIntake.list('-created_date', 500, skip);
      if (!batch || batch.length === 0) { hasMore = false; break; }
      allIntakes.push(...batch.filter(d => d.status_registro !== 'REMOVIDO'));
      skip += 500;
      if (batch.length < 500) hasMore = false;
    }

    // Classificar
    const pdfsNF = allIntakes.filter(i => {
      const ext = getFileExt(i);
      const tipo = i.tipo_detectado || '';
      if (ext === 'pdf' && tipo !== 'CONTRATO' && tipo !== 'DOCUMENTO_ADMINISTRATIVO' && tipo !== 'FOTO_ATIVIDADE') return true;
      if (tipo === 'NOTA_FISCAL_PDF') return true;
      return false;
    });

    const xmls = allIntakes.filter(i => {
      return getFileExt(i) === 'xml' || i.tipo_detectado === 'NOTA_FISCAL_XML' || i.tipo_detectado === 'PENDENTE';
    }).filter(x => getFileExt(x) === 'xml'); // só XML de verdade

    const recibos = allIntakes.filter(i => {
      const tipo = i.tipo_detectado || '';
      const nome = normalizeText(i.file_name_original || '');
      return tipo === 'RECIBO_PDF' || nome.includes('recibo') || nome.includes('comprovante') || nome.includes('boleto') || nome.includes('pix');
    });

    resultado.pdfs_total = pdfsNF.length;
    resultado.xmls_total = xmls.length;
    resultado.recibos_total = recibos.length;

    // 1.5 EXTRAIR DADOS DE XMLs SEM resultado_ia
    for (const xml of xmls) {
      if (xml._dados_xml) continue;
      const temIA = xml.resultado_ia && Object.keys(xml.resultado_ia).length > 0;
      const temDados = getCnpj(xml) || getNFNumero(xml);
      if (temIA && temDados) continue; // já tem dados

      const dados = await extrairDadosXML(xml.arquivo_original_url);
      if (dados.nf_emitente_cpf_cnpj || dados.nf_numero) {
        xml._dados_xml = dados;
        resultado.xmls_com_dados_extraidos++;
        // Persistir no registro para futuras execuções
        if (!dryRun) {
          try {
            await base44.asServiceRole.entities.DocumentIntake.update(xml.id, {
              resultado_ia: { ...(xml.resultado_ia || {}), ...dados },
              nf_emitente_cpf_cnpj: dados.nf_emitente_cpf_cnpj || xml.nf_emitente_cpf_cnpj || '',
              fornecedor_cpf_cnpj: dados.nf_emitente_cpf_cnpj || xml.fornecedor_cpf_cnpj || '',
              nf_emitente_nome: dados.nf_emitente_nome || xml.nf_emitente_nome || '',
              fornecedor_nome: dados.nf_emitente_nome || xml.fornecedor_nome || '',
              nf_numero: dados.nf_numero || xml.nf_numero || '',
              nf_valor_total: dados.nf_valor_total || xml.nf_valor_total || 0,
              municipio: dados.municipio || xml.municipio || '',
              tipo_detectado: 'NOTA_FISCAL_XML',
              status_processamento: 'AGUARDANDO_REVISAO',
            });
          } catch (e) {
            resultado.erros.push({ tipo: 'SALVAR_DADOS_XML', xml_id: xml.id, erro: e?.message });
          }
        }
      }
    }

    // 2. VINCULAR XMLs a PDFs
    for (const pdf of pdfsNF) {
      if (pdf.nf_xml_intake_id) continue;

      let melhorXml = null, melhorScore = 0;
      for (const xml of xmls) {
        if (xml.nf_pdf_intake_id || xml.grupo_status === 'COMPLETO') continue;
        const score = calcularScoreVinculo(pdf, xml);
        if (score > melhorScore) { melhorScore = score; melhorXml = xml; }
      }

      if (melhorXml && melhorScore >= 5) {
        resultado.detalhes.push({
          tipo: 'XML_VINCULO', pdf_id: pdf.id, xml_id: melhorXml.id,
          score: melhorScore, pdf_nome: pdf.file_name_original, xml_nome: melhorXml.file_name_original,
        });
        if (!dryRun) {
          try {
            await base44.asServiceRole.entities.DocumentIntake.update(pdf.id, {
              nf_xml_intake_id: melhorXml.id, nf_xml_url: melhorXml.arquivo_original_url,
            });
            await base44.asServiceRole.entities.DocumentIntake.update(melhorXml.id, {
              grupo_status: 'COMPLETO', nf_pdf_intake_id: pdf.id, nf_pdf_url: pdf.arquivo_original_url,
              ocultar_entrada_unica: true,
            });
            resultado.vinculos_xml_criados++;
          } catch (e) {
            resultado.erros.push({ tipo: 'XML_VINCULO', pdf_id: pdf.id, erro: e?.message });
          }
        } else {
          resultado.vinculos_xml_criados++;
        }
      }
    }

    // 3. VINCULAR RECIBOS a PDFs
    for (const pdf of pdfsNF) {
      if (pdf.recibo_intake_id) continue;

      let melhorRecibo = null, melhorScore = 0;
      for (const recibo of recibos) {
        if (recibo.nf_pdf_intake_id || recibo.grupo_status === 'COMPLETO') continue;
        const score = calcularScoreVinculo(pdf, recibo);
        if (score > melhorScore) { melhorScore = score; melhorRecibo = recibo; }
      }

      if (melhorRecibo && melhorScore >= 6) {
        resultado.detalhes.push({
          tipo: 'RECIBO_VINCULO', pdf_id: pdf.id, recibo_id: melhorRecibo.id,
          score: melhorScore, pdf_nome: pdf.file_name_original, recibo_nome: melhorRecibo.file_name_original,
        });
        if (!dryRun) {
          try {
            await base44.asServiceRole.entities.DocumentIntake.update(pdf.id, {
              recibo_intake_id: melhorRecibo.id, recibo_url: melhorRecibo.arquivo_original_url,
            });
            await base44.asServiceRole.entities.DocumentIntake.update(melhorRecibo.id, {
              grupo_status: 'COMPLETO', nf_pdf_intake_id: pdf.id, nf_pdf_url: pdf.arquivo_original_url,
              ocultar_entrada_unica: true,
              ...(pdf.entidade_destino_id ? { entidade_destino_id: pdf.entidade_destino_id, entidade_destino: 'PurchaseRequest' } : {}),
            });
            resultado.vinculos_recibo_criados++;
          } catch (e) {
            resultado.erros.push({ tipo: 'RECIBO_VINCULO', pdf_id: pdf.id, erro: e?.message });
          }
        } else {
          resultado.vinculos_recibo_criados++;
        }
      }
    }

    // 4. DETECTAR E EXCLUIR DUPLICATAS
    const jaExcluidas = new Set();
    for (let i = 0; i < pdfsNF.length; i++) {
      if (jaExcluidas.has(pdfsNF[i].id)) continue;
      for (let j = i + 1; j < pdfsNF.length; j++) {
        if (jaExcluidas.has(pdfsNF[j].id)) continue;
        if (pdfsNF[i].id === pdfsNF[j].id) continue;
        if (isDuplicate(pdfsNF[i], pdfsNF[j])) {
          const dateI = new Date(pdfsNF[i].created_date || 0).getTime();
          const dateJ = new Date(pdfsNF[j].created_date || 0).getTime();
          const manter = dateI <= dateJ ? pdfsNF[i] : pdfsNF[j];
          const excluir = dateI <= dateJ ? pdfsNF[j] : pdfsNF[i];
          resultado.duplicatas_detectadas++;
          resultado.detalhes.push({
            tipo: 'DUPLICATA', manter_id: manter.id, excluir_id: excluir.id,
            manter_nome: manter.file_name_original, excluir_nome: excluir.file_name_original,
            criterio: 'CNPJ + NF nº + valor + data emissão',
          });
          if (!dryRun) {
            try {
              await base44.asServiceRole.entities.DocumentIntake.update(excluir.id, {
                status_registro: 'REMOVIDO', status_processamento: 'DELETADO', ocultar_entrada_unica: true,
              });
              resultado.duplicatas_excluidas++;
              jaExcluidas.add(excluir.id);
            } catch (e) {
              resultado.erros.push({ tipo: 'EXCLUIR_DUPLICATA', id: excluir.id, erro: e?.message });
            }
          } else {
            resultado.duplicatas_excluidas++;
            jaExcluidas.add(excluir.id);
          }
        }
      }
    }

    return Response.json(resultado);
  } catch (error) {
    console.error('vincularDocumentosAutomatico error:', error);
    return Response.json({ error: error?.message || 'Erro interno' }, { status: 500 });
  }
});