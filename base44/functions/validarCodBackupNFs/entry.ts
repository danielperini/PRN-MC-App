import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * validarCodBackupNFs
 *
 * Atualiza MAPA_N4 oficial completo e valida/preenche o campo `cod` (N4 oficial)
 * de cada PurchaseRequest. Usa `centro_custo` da Compra para desempate em casos ambíguos.
 *
 * Params: { dryRun?: boolean, force?: boolean, purchaseIds?: string[] }
 * - dryRun=false → grava no banco (DEFAULT agora é false)
 * - force=false  → não sobrescreve cod já com status_cod=OK (default: false)
 * - purchaseIds  → array de IDs específicos (vazio = todos)
 */

// ── Normalização canônica ──────────────────────────────────────────────────────
function norm(v: string): string {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[-–—\/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function pad2(s: string | number): string {
  return String(s).padStart(2, '0');
}

// ── MAPA N4 OFICIAL COMPLETO ──────────────────────────────────────────────────
// Termos normalizados (sem acentos, lowercase, barra/hífen→espaço).
// Substituição integral do mapa anterior.
const MAPA_N4: Array<{ codigo: string; termos: string[] }> = [
  {
    codigo: '01',
    termos: [
      'consultoria de programacao',
      'consultorias de temas transversais',
      'consultoria temas transversais',
      'formacao sobre ambiente seguro diversidade e inclusao',
      'formacao ambiente seguro diversidade e inclusao',
      'formacao ambiente seguro',
      'consultoria acessibilidade',
      'consultoria pedagogica',
    ],
  },
  {
    codigo: '02',
    termos: [
      'seguranca',
      'locacao de mao de obra seguranca',
      'vigilancia',
      'vigia',
      'servico de seguranca',
      'seguranca ed 2026',
      'seguranca noturno',
    ],
  },
  {
    codigo: '03',
    termos: [
      'manutencao mis',
      'manutencao mumo',
      'manutencao mhab',
      'mostra baixa complexidade',
      'mostra media complexidade',
      'peca em destaque',
      'exposicao mumo',
    ],
  },
  {
    codigo: '04',
    termos: [
      'transporte',
      'combustivel',
      'energia eletrica',
      'conta de luz',
      'gasolina',
      'abastecimento',
    ],
  },
  {
    codigo: '12',
    termos: [
      'lanche',
      'lanches',
      'alimentacao',
      'coffee break',
      'cafe',
      'refeicao',
      'buffet',
      'lanchonete',
      'fornecimento de lanches',
      'material de escritorio',
      'material escritorio',
    ],
  },
  {
    codigo: '13',
    termos: [
      'sinalizacao',
      'sinalizacao ed 2026',
      'sinalizacao noturno',
      'impressao mhab',
      'impressao mis',
      'impressao mumo',
    ],
  },
  {
    codigo: '15',
    termos: [
      'material mis',
      'material mumo',
      'material mhab',
    ],
  },
  {
    codigo: '17',
    termos: [
      'kit de iluminacao',
      'kit iluminacao',
      'kit de iluminacao ed 2026',
      'locacao de iluminacao',
      'iluminacao pampulha',
    ],
  },
  {
    codigo: '18',
    termos: [
      'van',
      'vans',
      'onibus',
      'micro onibus',
      'microonibus',
      'transporte escolar',
      'locacao de veiculo',
    ],
  },
  {
    codigo: '22',
    termos: [
      'assistente administrativo',
      'assistente administrativa',
      'acoes educativo culturais',
      'acoes educativas',
      'acoes culturais',
      'apresentacoes mis mumo mhab',
      'apresentacoes culturais 3 museus pbh',
      'apresentacoes culturais',
      'pesquisa e texto mhab',
      'pesquisa e texto',
    ],
  },
  {
    codigo: '23',
    termos: [
      'assessor de imprensa',
      'assessoria de imprensa',
      'rede social',
      'redes sociais',
      'marketing cultural',
      'social media',
      'designer mhab',
      'designer mis',
      'designer mumo',
      'id designer',
      'id design',
      'design grafico',
      'identidade visual comunicacao',
      'redacao',
      'redator',
    ],
  },
  {
    codigo: '24',
    termos: [
      'fotografo',
      'fotografia',
      'fotografa',
      'video e fotografia',
      'video fotografia',
      'cobertura fotografica',
      'cobertura de video',
      'fotografo mhab',
    ],
  },
  {
    codigo: '41',
    termos: [
      'limpeza',
      'servico de limpeza',
      'higienizacao',
      'limpeza ed 2026',
      'limpeza noturno',
    ],
  },
  {
    codigo: '42',
    termos: [
      'coordenador geral',
      'assistente de coordenacao e producao',
      'analista adm financeira',
      'producao mis mumo mhab',
      'educador mis mumo mhab',
      'producao ed 2026',
      'assistente de producao ed 2026',
      'monitores ed 2026',
      'diarias mis mumo mhab',
      'contador',
      'coordenador producao',
      'analista adm',
      'gestor administrativo financeiro',
      'assistente de coordenacao',
      'assistente de producao',
      'mobilizador',
      'producao mis',
      'producao mumo',
      'producao mhab',
      'producao noturno',
      'educador mis',
      'educador mumo',
      'educador mhab',
      'educadora',
      'monitor noturno',
      'monitores noturno',
      'monitores ed',
      'monitores educacao',
      'monitores',
      'diarias mis',
      'diarias mumo',
      'diarias mhab',
      'diarias meta',
      'diarias',
      'contadora',
      'produtor pampulha',
    ],
  },
  {
    codigo: '46',
    termos: [
      'assessoria juridica',
      'assessor juridico',
      'advogado',
      'advocacia',
    ],
  },
  {
    codigo: '53',
    termos: [
      'coordenador comunicacao',
      'coordenadora comunicacao',
      'coordenador de comunicacao',
    ],
  },
  {
    codigo: '99',
    termos: [
      'infraestrutura mis mumo mhab',
      'infraestrutura 3 museus pbh',
      'infraestrutura ed 2026',
      'revisao mhab',
      'traducao mhab',
      'fornecimento de som e iluminacao',
      'som e iluminacao',
      'revisao de texto',
      'revisao textual',
      'traducao',
      'tradutor',
      'tradutora',
      'maquete tatil',
      'video com libras',
      'audio descricao',
    ],
  },
];

// Conjunto oficial de códigos válidos
const CODIGOS_OFICIAIS = new Set(['01','02','03','04','12','13','15','17','18','22','23','24','41','42','46','53','99']);

// Centros que indicam museu físico (para desempate)
const CENTROS_MUSEU_FISICO = new Set(['MHAB','MIS','MUMO','MIS BH']);

// ── Busca de código pelo nome/grupo da rubrica ────────────────────────────────
function buscarCodigoPorNome(rubrica: any): { codigo: string | null; matches: string[]; status: 'ok' | 'ambiguo' | 'nao_encontrado' } {
  const texto = norm([
    rubrica.rubrica || rubrica.nome || '',
    rubrica.grupo || '',
    rubrica.descricao || '',
  ].join(' '));

  const matchedCodes = new Set<string>();
  for (const entrada of MAPA_N4) {
    if (entrada.termos.some(t => texto.includes(t))) {
      matchedCodes.add(entrada.codigo);
    }
  }

  const matches = [...matchedCodes];
  if (matches.length === 0) return { codigo: null, matches, status: 'nao_encontrado' };
  if (matches.length === 1) return { codigo: matches[0], matches, status: 'ok' };
  return { codigo: null, matches, status: 'ambiguo' };
}

// ── Desempate por centro_custo da Compra ──────────────────────────────────────
function desempatarPorCentroCusto(rubrica: any, centroCustoCompra: string, codigosAmbiguos: string[]): string | null {
  const textoRubrica = norm(rubrica.rubrica || rubrica.nome || '');
  const centro = norm(centroCustoCompra || '');
  const ambSet = new Set(codigosAmbiguos);

  // Regra 1: 'Material' + museu físico → '15'; senão → '12'
  if (textoRubrica.includes('material') && ambSet.has('12') && ambSet.has('15')) {
    const ehMuseuFisico = CENTROS_MUSEU_FISICO.has(String(centroCustoCompra || '').toUpperCase().trim());
    return ehMuseuFisico ? '15' : '12';
  }

  // Regra 2: 'Designer'/'design' sem museu específico + centro Comunicação/Geral → '23'
  if ((textoRubrica.includes('designer') || textoRubrica.includes('design')) && ambSet.has('23')) {
    if (centro.includes('comunicac') || centro.includes('geral') || !centroCustoCompra) {
      return '23';
    }
  }

  // Regra 3: 'Infraestrutura' + museu específico → '99'
  if (textoRubrica.includes('infraestrutura') && ambSet.has('99')) {
    const ehMuseuFisico = CENTROS_MUSEU_FISICO.has(String(centroCustoCompra || '').toUpperCase().trim());
    if (ehMuseuFisico) return '99';
  }

  // Regra 4: 'Apresentações' + múltiplos museus ou '3 museus' → '22'
  if ((textoRubrica.includes('apresentac') || textoRubrica.includes('apresentacao')) && ambSet.has('22')) {
    if (textoRubrica.includes('3 museus') || textoRubrica.includes('mis') || textoRubrica.includes('mumo') || textoRubrica.includes('mhab')) {
      return '22';
    }
  }

  return null;
}

// ── Verifica se o código aparece como token separado no nome do arquivo ────────
function codigoNoNomeArquivo(nomeArquivo: string, cod: string): boolean {
  if (!nomeArquivo || !cod) return false;
  const nome = norm(nomeArquivo);
  const regex = new RegExp(`(^|[_\\-\\s])${cod}([_\\-\\s]|$)`);
  return regex.test(nome);
}

// ── Extrai nome do arquivo de uma URL ─────────────────────────────────────────
function extrairNomeArquivo(url: string): string {
  if (!url) return '';
  try {
    const decoded = decodeURIComponent(url);
    const partes = decoded.split(/[/?#]/);
    for (let i = partes.length - 1; i >= 0; i--) {
      const p = partes[i].trim();
      if (p && p.includes('.')) return p;
    }
    return partes[partes.length - 1] || '';
  } catch {
    return '';
  }
}

// ── Constrói novo nome padronizado ────────────────────────────────────────────
function construirNovoNome(purchase: any, cod: string, tipo: 'NF' | 'XML'): string {
  const fornecedor = norm(purchase.fornecedor_nome || purchase.nf_emitente_nome || 'FORNECEDOR')
    .replace(/\s+/g, '_').toUpperCase().substring(0, 20);
  const numero = (purchase.nf_numero || '').replace(/[^0-9]/g, '') || '000';
  const data = (purchase.nf_data_emissao || purchase.data_pagamento_efetivo || '').substring(0, 10) || 'S-DATA';
  const ext = tipo === 'XML' ? 'xml' : 'pdf';
  return `${cod}_${tipo}_${fornecedor}_${numero}_${data}.${ext}`;
}

// ── Renomeia arquivo no Drive via API PATCH ───────────────────────────────────
async function renomearNoDrive(driveToken: string, fileId: string, novoNome: string): Promise<boolean> {
  try {
    const resp = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${driveToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: novoNome }),
      }
    );
    return resp.ok;
  } catch {
    return false;
  }
}

// ── Extrai fileId de URL do Drive ────────────────────────────────────────────
function extrairDriveFileId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/\/d\/([a-zA-Z0-9_-]{10,})/);
  if (m) return m[1];
  const m2 = url.match(/id=([a-zA-Z0-9_-]{10,})/);
  if (m2) return m2[1];
  return null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    // DEFAULT AGORA É dryRun=false (grava no banco)
    const dryRun: boolean = body.dryRun === true;
    const force: boolean = body.force === true;
    const purchaseIds: string[] = Array.isArray(body.purchaseIds) ? body.purchaseIds : [];

    // ── Buscar compras ─────────────────────────────────────────────────────────
    let compras: any[];
    if (purchaseIds.length > 0) {
      const results = await Promise.all(purchaseIds.map(id => base44.asServiceRole.entities.PurchaseRequest.get(id).catch(() => null)));
      compras = results.filter(Boolean);
    } else {
      compras = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 2000);
    }

    // ── Buscar rubricas ────────────────────────────────────────────────────────
    const todasRubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 2000);
    const rubricaMap = new Map<string, any>();
    for (const r of todasRubricas) rubricaMap.set(r.id, r);

    // ── Token do Drive ─────────────────────────────────────────────────────────
    let driveToken: string | null = null;
    try {
      const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      driveToken = conn?.access_token || null;
    } catch { /* sem token — renomeação indisponível */ }

    // ── Estatísticas ──────────────────────────────────────────────────────────
    const stats = {
      total_analisado: 0,
      codigos_preenchidos: 0,
      codigos_corretos: 0,
      codigos_corrigidos: 0,
      rubricas_nao_encontradas: 0,
      associacoes_ambiguas: 0,
      arquivos_sem_codigo: 0,
      arquivos_com_codigo_divergente: 0,
      backup_validado_sim: 0,
      arquivos_renomeados: 0,
    };

    const logs: any[] = [];

    for (const purchase of compras) {
      stats.total_analisado++;

      const log: any = {
        id: purchase.id,
        descricao: (purchase.descricao_item || '').substring(0, 80),
        fornecedor: purchase.fornecedor_nome || '',
        cod_anterior: purchase.cod || null,
        status_cod_anterior: purchase.status_cod || null,
        cod_final: null,
        status_cod: null,
        codigo_pdf_ok: 'NÃO_SE_APLICA',
        codigo_xml_ok: 'NÃO_SE_APLICA',
        backup_validado: 'NÃO',
        motivo_revisao: null,
        acoes: [],
      };

      // ── Determinar código ──────────────────────────────────────────────────
      let cod: string | null = purchase.cod || null;
      let statusCod: string = purchase.status_cod || '';

      // Normalizar código existente para 2 dígitos
      if (cod) {
        const padded = pad2(cod);
        if (CODIGOS_OFICIAIS.has(padded)) cod = padded;
      }

      // Pular se já OK e não force
      if (cod && statusCod === 'OK' && !force) {
        log.cod_final = cod;
        log.status_cod = 'OK';
        stats.codigos_corretos++;
      } else {
        const codAnterior = purchase.cod || null;

        // Buscar rubrica vinculada
        const rubrica = purchase.rubrica_id ? (rubricaMap.get(purchase.rubrica_id) || null) : null;

        if (!purchase.rubrica_id) {
          cod = null;
          statusCod = 'SEM_RUBRICA';
          log.motivo_revisao = 'Sem rubrica vinculada';
          stats.rubricas_nao_encontradas++;
        } else if (!rubrica) {
          cod = null;
          statusCod = 'SEM_RUBRICA';
          log.motivo_revisao = `Rubrica ID ${purchase.rubrica_id} não encontrada`;
          stats.rubricas_nao_encontradas++;
        } else {
          // 1. Rubrica.codigo já preenchido e oficial?
          if (rubrica.codigo && CODIGOS_OFICIAIS.has(pad2(rubrica.codigo))) {
            cod = pad2(rubrica.codigo);
            statusCod = 'OK';
          } else {
            // 2. Buscar no mapa N4
            const resultado = buscarCodigoPorNome(rubrica);

            if (resultado.status === 'ok' && resultado.codigo) {
              cod = resultado.codigo;
              statusCod = 'OK';
              log.acoes.push(`cod inferido do mapa N4: ${cod}`);
              // Sincronizar Rubrica.codigo se vazio
              if (!rubrica.codigo && !dryRun) {
                await base44.asServiceRole.entities.Rubrica.update(rubrica.id, { codigo: cod }).catch(() => null);
                log.acoes.push(`Rubrica ${rubrica.id} atualizada: codigo=${cod}`);
              }
            } else if (resultado.status === 'ambiguo') {
              // Tentar desempate por centro_custo da compra
              const codDesempate = desempatarPorCentroCusto(rubrica, purchase.centro_custo || '', resultado.matches);
              if (codDesempate) {
                cod = codDesempate;
                statusCod = 'OK';
                log.acoes.push(`cod desempatado por centro_custo (${purchase.centro_custo}): ${cod}`);
                if (!rubrica.codigo && !dryRun) {
                  await base44.asServiceRole.entities.Rubrica.update(rubrica.id, { codigo: cod }).catch(() => null);
                }
              } else {
                cod = null;
                statusCod = 'REVISAR';
                log.motivo_revisao = `Código ambíguo no mapa N4 (candidatos: ${resultado.matches.join(', ')}) — revisar manualmente`;
                stats.associacoes_ambiguas++;
              }
            } else {
              cod = null;
              statusCod = 'SEM_CODIGO';
              log.motivo_revisao = 'Rubrica sem correspondência no mapa N4';
              stats.rubricas_nao_encontradas++;
            }
          }
        }

        // Contabilizar tipo de atualização
        if (cod && statusCod === 'OK') {
          log.cod_final = cod;
          log.status_cod = 'OK';
          if (!codAnterior) {
            stats.codigos_preenchidos++;
            log.acoes.push(`cod preenchido: ${cod}`);
          } else if (pad2(codAnterior) !== cod) {
            stats.codigos_corrigidos++;
            log.acoes.push(`cod corrigido: ${codAnterior} → ${cod}`);
          } else {
            stats.codigos_corretos++;
          }
        } else {
          log.cod_final = cod;
          log.status_cod = statusCod || 'REVISAR';
        }
      }

      // ── Validação de arquivos PDF/XML ──────────────────────────────────────
      const pdfUrlFinal = !String(purchase.nota_fiscal_url || '').toLowerCase().endsWith('.xml')
        ? (purchase.nota_fiscal_url || purchase.nf_pdf_url || purchase.arquivo_url || '')
        : (purchase.nf_pdf_url || '');

      const xmlUrlFinal = String(purchase.nota_fiscal_url || '').toLowerCase().endsWith('.xml')
        ? purchase.nota_fiscal_url
        : '';

      let codigoPdfOk = 'NÃO_SE_APLICA';
      let codigoXmlOk = 'NÃO_SE_APLICA';
      let motivoRevisao = log.motivo_revisao || '';

      if (cod) {
        // PDF
        if (pdfUrlFinal) {
          const nomeArquivoPdf = extrairNomeArquivo(pdfUrlFinal);
          const temCod = codigoNoNomeArquivo(nomeArquivoPdf, cod);
          codigoPdfOk = temCod ? 'SIM' : 'NÃO';
          if (!temCod) {
            stats.arquivos_sem_codigo++;
            log.acoes.push(`PDF sem cod no nome: "${nomeArquivoPdf}"`);
            if (!dryRun && driveToken) {
              const fileId = extrairDriveFileId(pdfUrlFinal);
              if (fileId) {
                const novoNome = construirNovoNome(purchase, cod, 'NF');
                const ok = await renomearNoDrive(driveToken, fileId, novoNome);
                if (ok) {
                  codigoPdfOk = 'SIM';
                  stats.arquivos_renomeados++;
                  log.acoes.push(`PDF renomeado → ${novoNome}`);
                }
              }
            }
          }
        }

        // XML
        if (xmlUrlFinal) {
          const nomeArquivoXml = extrairNomeArquivo(xmlUrlFinal);
          const temCod = codigoNoNomeArquivo(nomeArquivoXml, cod);
          codigoXmlOk = temCod ? 'SIM' : 'NÃO';
          if (!temCod) {
            log.acoes.push(`XML sem cod no nome: "${nomeArquivoXml}"`);
            if (!dryRun && driveToken) {
              const fileId = extrairDriveFileId(xmlUrlFinal);
              if (fileId) {
                const novoNome = construirNovoNome(purchase, cod, 'XML');
                const ok = await renomearNoDrive(driveToken, fileId, novoNome);
                if (ok) {
                  codigoXmlOk = 'SIM';
                  stats.arquivos_renomeados++;
                  log.acoes.push(`XML renomeado → ${novoNome}`);
                }
              }
            }
          }
        }

        // Detectar divergência entre PDF e XML
        if (pdfUrlFinal && xmlUrlFinal) {
          let codNoPdf: string | null = null;
          let codNoXml: string | null = null;
          const nomePdf = extrairNomeArquivo(pdfUrlFinal);
          const nomeXml = extrairNomeArquivo(xmlUrlFinal);
          for (const c of CODIGOS_OFICIAIS) {
            if (!codNoPdf && codigoNoNomeArquivo(nomePdf, c)) codNoPdf = c;
            if (!codNoXml && codigoNoNomeArquivo(nomeXml, c)) codNoXml = c;
          }
          if (codNoPdf && codNoXml && codNoPdf !== codNoXml) {
            stats.arquivos_com_codigo_divergente++;
            motivoRevisao = (motivoRevisao ? motivoRevisao + ' | ' : '') + `Código divergente: PDF=${codNoPdf} vs XML=${codNoXml}`;
            if (log.status_cod === 'OK') log.status_cod = 'REVISAR';
          }
        }
      }

      log.codigo_pdf_ok = codigoPdfOk;
      log.codigo_xml_ok = codigoXmlOk;
      log.motivo_revisao = motivoRevisao || null;

      // ── backup_validado ────────────────────────────────────────────────────
      const backupValidado = (
        cod &&
        CODIGOS_OFICIAIS.has(cod) &&
        log.status_cod === 'OK' &&
        codigoPdfOk === 'SIM' &&
        (codigoXmlOk === 'SIM' || codigoXmlOk === 'NÃO_SE_APLICA') &&
        !String(motivoRevisao || '').includes('divergente')
      ) ? 'SIM' : 'NÃO';

      log.backup_validado = backupValidado;
      if (backupValidado === 'SIM') stats.backup_validado_sim++;

      // ── Persistir (dryRun=false) ───────────────────────────────────────────
      if (!dryRun) {
        const updates: any = {
          status_cod: log.status_cod,
          codigo_pdf_ok: codigoPdfOk,
          codigo_xml_ok: codigoXmlOk,
          backup_validado: backupValidado,
        };
        if (log.cod_final) updates.cod = log.cod_final;
        if (log.motivo_revisao) updates.motivo_revisao = log.motivo_revisao;
        else updates.motivo_revisao = null;

        await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, updates).catch(e => {
          log.acoes.push(`ERRO ao salvar: ${e?.message || e}`);
        });
      }

      logs.push(log);
    }

    // ── Relatório final ────────────────────────────────────────────────────────
    return Response.json({
      ok: true,
      dry_run: dryRun,
      force,
      stats: {
        total_analisado: stats.total_analisado,
        codigos_preenchidos: stats.codigos_preenchidos,
        codigos_corretos: stats.codigos_corretos,
        codigos_corrigidos: stats.codigos_corrigidos,
        rubricas_nao_encontradas: stats.rubricas_nao_encontradas,
        associacoes_ambiguas: stats.associacoes_ambiguas,
        arquivos_sem_codigo: stats.arquivos_sem_codigo,
        arquivos_com_codigo_divergente: stats.arquivos_com_codigo_divergente,
        backup_validado_sim: stats.backup_validado_sim,
        arquivos_renomeados: stats.arquivos_renomeados,
      },
      logs,
    });

  } catch (err) {
    console.error('[validarCodBackupNFs]', err);
    return Response.json({ ok: false, error: String((err as any)?.message || err) }, { status: 500 });
  }
});