import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * validarCodBackupNFs
 *
 * Fluxo completo de preenchimento e validação do campo `cod` (N4 oficial)
 * para cada PurchaseRequest, com verificação de arquivos PDF/XML no Drive.
 *
 * Params: { dryRun?: boolean, force?: boolean, purchaseIds?: string[] }
 * - dryRun=true → apenas preview, sem salvar (default: true)
 * - force=false → não sobrescreve cod já preenchido com status_cod=OK (default: false)
 * - purchaseIds → array de IDs específicos (opcional; vazio = todos)
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

// ── Mapa N4 oficial (tabela exata do Plano de Trabalho — 3º Aditivo) ───────────
// Todos os códigos com 2 dígitos (zero à esquerda). Termos normalizados (sem acentos, lowercase).
const MAPA_N4: Array<{ codigo: string; termos: string[] }> = [
  // 01 — Consultorias (Programação, Temas Transversais, Formação Ambiente Seguro)
  { codigo: '01', termos: [
    'consultoria de programacao', 'consultorias de temas transversais', 'consultoria temas transversais',
    'formacao ambiente seguro', 'formacao de ambiente seguro', 'consultoria acessibilidade', 'consultoria pedagogica',
  ]},

  // 02 — Segurança (Ed. 2026)
  { codigo: '02', termos: [
    'seguranca', 'locacao de mao de obra seguranca', 'vigilancia', 'vigia', 'servico de seguranca',
    'seguranca ed 2026', 'seguranca noturno',
  ]},

  // 03 — Manutenção MIS/MUMO/MHAB, Mostras, Peça em destaque, Exposição MUMO
  { codigo: '03', termos: [
    'manutencao mis', 'manutencao mumo', 'manutencao mhab', 'manutencao dos museus',
    'manutencao uma exposicao', 'manutencao 2 expo', 'manutencao expo',
    'mostras mis', 'mostras mumo', 'mostras mhab', 'mostra mis', 'mostra mumo', 'mostra mhab',
    'mostra baixa complexidade', 'mostra media complexidade',
    'peca em destaque',
    'exposicao mumo',
  ]},

  // 04 — Transporte, Energia elétrica
  { codigo: '04', termos: [
    'transporte', 'combustivel', 'energia eletrica', 'conta de luz', 'gasolina',
    'abastecimento', 'transporte combustivel',
  ]},

  // 12 — Lanches/buffet, Alimentação, Material escritório
  { codigo: '12', termos: [
    'lanche', 'lanches', 'alimentacao', 'coffee break', 'cafe', 'refeicao', 'buffet', 'lanchonete',
    'fornecimento de lanches', 'fornecimento de alimentacao',
    'material de escritorio', 'material de consumo escritorio',
  ]},

  // 13 — Sinalização (Ed. 2026), Impressão MHAB
  { codigo: '13', termos: [
    'sinalizacao', 'sinalizacao ed 2026', 'sinalizacao noturno',
    'impressao mhab', 'impressao mis', 'impressao mumo', 'impressao material',
    'impressao 2a publicacao', 'impressao 2 publicacao',
  ]},

  // 15 — Material MIS/MUMO/MHAB
  { codigo: '15', termos: [
    'material mis', 'material mumo', 'material mhab', 'material consumo',
    'material educativo', 'material grafico',
  ]},

  // 17 — Kit de Iluminação (Ed. 2026)
  { codigo: '17', termos: [
    'kit de iluminacao', 'kit iluminacao', 'infraestrutura e iluminacao', 'infraestrutura iluminacao',
    'locacao de iluminacao', 'iluminacao e infraestrutura noturno', 'iluminacao pampulha',
    'kit de iluminacao ed 2026',
  ]},

  // 18 — Vans (Ed. 2026)
  { codigo: '18', termos: [
    'van', 'vans', 'onibus', 'micro onibus', 'microonibus', 'transporte escolar',
    'locacao de veiculo', 'onibus micro onibus', 'vans ed 2026',
  ]},

  // 22 — Assistente Administrativo, Ações Educativo-culturais, Apresentações MIS/MUMO/MHAB,
  //       Apresentações Culturais 3 museus PBH, Pesquisa e texto
  { codigo: '22', termos: [
    'assistente administrativo', 'assistente administrativa',
    'acoes educativas', 'acao educativa',
    'acoes culturais', 'acao cultural',
    'acoes educativo culturais', 'acoes educativo-culturais',
    'apresentacoes mis', 'apresentacoes mumo', 'apresentacoes mhab',
    'apresentacoes 3 museus', 'apresentacoes 2 museus',
    'apresentacoes culturais', 'apresentacoes culturais 3 museus pbh',
    'apresentacoes culturais mck', 'apresentacoes culturais map', 'apresentacoes culturais casa do baile',
    'pesquisa e texto', 'pesquisa e producao de texto',
  ]},

  // 23 — Assessor de Imprensa, Rede Social/Marketing Cultural, Designer MHAB
  { codigo: '23', termos: [
    'assessor de imprensa', 'assessora de imprensa', 'assessoria de imprensa',
    'rede social', 'redes sociais', 'marketing cultural', 'social media',
    'criacao de site',
    'redator', 'redatora', 'redacao',
    'designer mhab', 'designer mis', 'designer mumo',
    'web designer', 'webdesigner', 'id designer', 'design grafico', 'designer e web designer',
    'identidade visual comunicacao',
  ]},

  // 24 — Fotógrafo, Vídeo e Fotografia
  { codigo: '24', termos: [
    'fotografo', 'fotografia', 'fotografa',
    'video e fotografia', 'video fotografia', 'cobertura fotografica', 'cobertura de video',
    'fotografo mhab',
  ]},

  // 41 — Limpeza (Ed. 2026)
  { codigo: '41', termos: [
    'limpeza', 'servico de limpeza', 'higienizacao', 'limpeza ed 2026',
  ]},

  // 42 — Coordenador Geral, Assistente de Coordenação e Produção, Analista Adm. Financeira,
  //       Produção MIS/MUMO/MHAB, Educador, Produção Ed. 2026, Assistente de Produção Ed. 2026,
  //       Monitores Ed. 2026, Diárias, Contador
  { codigo: '42', termos: [
    'coordenador geral', 'coordenadora geral',
    'coordenador producao', 'coordenador de producao', 'coordenadora de producao',
    'coordenador programacao', 'coordenador de programacao',
    'analista adm', 'analista administrativo financeiro', 'analista adm financeiro',
    'gestor administrativo financeiro', 'gestor adm financeiro', 'gestora adm',
    'assistente de coordenacao', 'assistente de coordenacao e producao',
    'assistente de producao',
    'mobilizador', 'mobilizadora',
    'producao mis', 'producao mumo', 'producao mhab',
    'producao noturno', 'producao ed 2026', 'assistente de producao ed 2026',
    'educador mis', 'educador mumo', 'educador mhab', 'educadora',
    'monitor noturno', 'monitores noturno', 'monitores ed', 'monitores educacao', 'monitores',
    'monitores ed 2026',
    'diarias mis', 'diarias mumo', 'diarias mhab', 'diarias meta', 'diarias',
    'contador', 'contadora',
    'produtor pampulha', 'produtor 4 aditivo', 'producao meta 19',
  ]},

  // 46 — Assessoria Jurídica
  { codigo: '46', termos: [
    'assessoria juridica', 'assessor juridico', 'advogado', 'advocacia',
  ]},

  // 53 — Coordenador Comunicação
  { codigo: '53', termos: [
    'coordenador comunicacao', 'coordenadora comunicacao',
    'coordenador de comunicacao', 'coordenadora de comunicacao',
  ]},

  // 99 — Infraestrutura MIS/MUMO/MHAB (Ed. 2026), Infraestrutura 3 museus PBH,
  //       Revisão MHAB, Tradução MHAB, Fornecimento de som e iluminação
  { codigo: '99', termos: [
    'infraestrutura noturno', 'infraestrutura mis', 'infraestrutura mumo', 'infraestrutura mhab',
    'infraestrutura 3 museus', 'infraestrutura 3 museus pbh', 'infraestrutura ed', 'infraestrutura educacao',
    'infraestrutura ed 2026',
    'revisao mhab', 'revisao de texto', 'revisao textual',
    'traducao mhab', 'traducao', 'tradutor', 'tradutora',
    'maquete tatil', 'video com libras', 'audio descricao',
    'dispositivos acessiveis', 'dispositivo acessivel',
    'fornecimento de som e iluminacao', 'fornecimento de som', 'som e iluminacao',
    'equipamentos de som', 'equipamentos audiovisuais',
  ]},
];

// Conjunto de códigos oficiais válidos (tabela oficial 3º Aditivo — zero à esquerda)
const CODIGOS_OFICIAIS = new Set(['01','02','03','04','12','13','15','17','18','22','23','24','41','42','46','53','99']);

// ── Busca de código pelo nome/grupo da rubrica ────────────────────────────────
function buscarCodigoPorNome(rubrica: any): { codigo: string | null; status: 'ok' | 'ambiguo' | 'nao_encontrado' } {
  const texto = norm([
    rubrica.rubrica || rubrica.nome || '',
    rubrica.grupo || '',
    rubrica.meta || '',
    rubrica.descricao || '',
  ].join(' '));

  const matches = new Set<string>();
  for (const entrada of MAPA_N4) {
    if (entrada.termos.some(t => texto.includes(t))) {
      matches.add(entrada.codigo);
    }
  }

  if (matches.size === 0) return { codigo: null, status: 'nao_encontrado' };
  if (matches.size === 1) return { codigo: [...matches][0], status: 'ok' };
  return { codigo: null, status: 'ambiguo' };
}

// ── Verifica se o código aparece como token separado no nome do arquivo ────────
function codigoNoNomeArquivo(nomeArquivo: string, cod: string): boolean {
  if (!nomeArquivo || !cod) return false;
  const nome = norm(nomeArquivo);
  // Código deve estar separado por delimitador ou no início/fim
  const regex = new RegExp(`(^|[_\\-\\s])${cod}([_\\-\\s]|$)`);
  return regex.test(nome);
}

// ── Extrai nome do arquivo de uma URL ─────────────────────────────────────────
function extrairNomeArquivo(url: string): string {
  if (!url) return '';
  try {
    const decoded = decodeURIComponent(url);
    const partes = decoded.split(/[/?#]/);
    // Pega o último segmento que parece ser um nome de arquivo
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
        headers: {
          Authorization: `Bearer ${driveToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: novoNome }),
      }
    );
    return resp.ok;
  } catch {
    return false;
  }
}

// ── Extrai fileId de uma URL do Drive ────────────────────────────────────────
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
    const dryRun: boolean = body.dryRun !== false; // default true (seguro)
    const force: boolean = body.force === true;     // default false
    const purchaseIds: string[] = Array.isArray(body.purchaseIds) ? body.purchaseIds : [];

    // ── Buscar compras ─────────────────────────────────────────────────────────
    let compras: any[];
    if (purchaseIds.length > 0) {
      compras = await Promise.all(purchaseIds.map(id => base44.asServiceRole.entities.PurchaseRequest.get(id)));
      compras = compras.filter(Boolean);
    } else {
      compras = await base44.asServiceRole.entities.PurchaseRequest.list('-created_date', 2000);
    }

    // ── Buscar rubricas (mapa id → rubrica) ───────────────────────────────────
    const todasRubricas = await base44.asServiceRole.entities.Rubrica.list('ordem_exibicao', 2000);
    const rubricaMap = new Map<string, any>();
    for (const r of todasRubricas) rubricaMap.set(r.id, r);

    // ── Tentar obter token do Drive ────────────────────────────────────────────
    let driveToken: string | null = null;
    try {
      const conn = await base44.asServiceRole.connectors.getConnection('googledrive');
      driveToken = conn?.access_token || null;
    } catch { /* sem Drive token — renomeação não disponível */ }

    // ── Estatísticas ──────────────────────────────────────────────────────────
    const stats = {
      total: 0,
      cod_ok: 0,
      preenchidos_agora: 0,
      revisar: 0,
      sem_rubrica: 0,
      pdf_verificados: 0,
      xml_verificados: 0,
      pdf_ok: 0,
      xml_ok: 0,
      arquivos_renomeados: 0,
      divergencia_pdf_xml: 0,
      backup_validado: 0,
    };

    const logs: any[] = [];

    for (const purchase of compras) {
      stats.total++;

      const log: any = {
        id: purchase.id,
        descricao: purchase.descricao_item || '?',
        fornecedor: purchase.fornecedor_nome || '',
        cod_anterior: purchase.cod || null,
        status_cod_anterior: purchase.status_cod || null,
        cod_final: null,
        status_cod: null,
        codigo_pdf_ok: null,
        codigo_xml_ok: null,
        backup_validado: null,
        motivo_revisao: null,
        acoes: [],
      };

      // ── FLUXO 2: Determinar código ─────────────────────────────────────────
      let cod: string | null = purchase.cod || null;
      let statusCod: string = purchase.status_cod || '';

      // Pular se já OK e não force
      if (cod && statusCod === 'OK' && !force) {
        log.cod_final = cod;
        log.status_cod = 'OK';
        stats.cod_ok++;
      } else {
        // 2a. Tentar via rubrica vinculada
        let rubrica: any = null;
        if (purchase.rubrica_id) {
          rubrica = rubricaMap.get(purchase.rubrica_id) || null;
        }

        if (!rubrica && !purchase.rubrica_id) {
          // Sem rubrica
          cod = null;
          statusCod = 'SEM_RUBRICA';
          log.motivo_revisao = 'Sem rubrica vinculada';
          stats.revisar++;
        } else if (rubrica) {
          // 2b. rubrica.codigo já preenchido?
          if (rubrica.codigo && CODIGOS_OFICIAIS.has(rubrica.codigo)) {
            cod = rubrica.codigo;
            statusCod = 'OK';
          } else {
            // 2c. Fallback: mapa N4 pelo nome
            const resultado = buscarCodigoPorNome(rubrica);
            if (resultado.status === 'ok' && resultado.codigo) {
              cod = resultado.codigo;
              statusCod = 'OK';
              log.acoes.push(`cod inferido do mapa N4: ${cod}`);
              // Preencher também Rubrica.codigo se vazio
              if (!rubrica.codigo && !dryRun) {
                await base44.asServiceRole.entities.Rubrica.update(rubrica.id, { codigo: cod });
                log.acoes.push(`Rubrica ${rubrica.id} atualizada com codigo=${cod}`);
              }
            } else if (resultado.status === 'ambiguo') {
              cod = null;
              statusCod = 'REVISAR';
              log.motivo_revisao = 'Código ambíguo no mapa N4 — revisar manualmente';
              stats.revisar++;
            } else {
              cod = null;
              statusCod = 'SEM_CODIGO';
              log.motivo_revisao = 'Rubrica sem código e sem correspondência no mapa N4';
              stats.revisar++;
            }
          }
        }

        if (cod && statusCod === 'OK') {
          log.cod_final = cod;
          log.status_cod = 'OK';
          if (cod !== purchase.cod || statusCod !== purchase.status_cod) {
            stats.preenchidos_agora++;
            log.acoes.push(`cod atribuído: ${cod}`);
          } else {
            stats.cod_ok++;
          }
        } else {
          log.cod_final = cod;
          log.status_cod = statusCod || 'REVISAR';
        }
      }

      // ── FLUXO 3: Validação de arquivos PDF/XML ─────────────────────────────
      const pdfUrl = purchase.nota_fiscal_url || purchase.nf_pdf_url || purchase.arquivo_url || '';
      const xmlUrl = purchase.nota_fiscal_url?.toLowerCase().endsWith('.xml')
        ? purchase.nota_fiscal_url
        : (purchase.nf_chave_acesso ? '' : ''); // XML pode não ter URL separada

      // Detectar URL XML separada
      const xmlUrlFinal = purchase.nota_fiscal_url?.toLowerCase().endsWith('.xml')
        ? purchase.nota_fiscal_url
        : '';

      const pdfUrlFinal = !purchase.nota_fiscal_url?.toLowerCase().endsWith('.xml')
        ? (purchase.nota_fiscal_url || purchase.nf_pdf_url || purchase.arquivo_url || '')
        : (purchase.nf_pdf_url || '');

      let codigoPdfOk = 'NÃO_SE_APLICA';
      let codigoXmlOk = 'NÃO_SE_APLICA';
      let motivoRevisao = log.motivo_revisao || '';

      if (cod) {
        // PDF
        if (pdfUrlFinal) {
          stats.pdf_verificados++;
          const nomeArquivoPdf = extrairNomeArquivo(pdfUrlFinal);
          const temCod = codigoNoNomeArquivo(nomeArquivoPdf, cod);
          codigoPdfOk = temCod ? 'SIM' : 'NÃO';
          if (temCod) stats.pdf_ok++;
          log.acoes.push(`PDF: "${nomeArquivoPdf}" → cod ${temCod ? '✓' : '✗'}`);

          // Renomear se necessário
          if (!temCod && !dryRun && driveToken) {
            const fileId = extrairDriveFileId(pdfUrlFinal);
            if (fileId) {
              const novoNome = construirNovoNome(purchase, cod, 'NF');
              const ok = await renomearNoDrive(driveToken, fileId, novoNome);
              if (ok) {
                codigoPdfOk = 'SIM';
                stats.arquivos_renomeados++;
                log.acoes.push(`PDF renomeado para: ${novoNome}`);
              }
            }
          }
        }

        // XML
        if (xmlUrlFinal) {
          stats.xml_verificados++;
          const nomeArquivoXml = extrairNomeArquivo(xmlUrlFinal);
          const temCod = codigoNoNomeArquivo(nomeArquivoXml, cod);
          codigoXmlOk = temCod ? 'SIM' : 'NÃO';
          if (temCod) stats.xml_ok++;
          log.acoes.push(`XML: "${nomeArquivoXml}" → cod ${temCod ? '✓' : '✗'}`);

          // Renomear se necessário
          if (!temCod && !dryRun && driveToken) {
            const fileId = extrairDriveFileId(xmlUrlFinal);
            if (fileId) {
              const novoNome = construirNovoNome(purchase, cod, 'XML');
              const ok = await renomearNoDrive(driveToken, fileId, novoNome);
              if (ok) {
                codigoXmlOk = 'SIM';
                stats.arquivos_renomeados++;
                log.acoes.push(`XML renomeado para: ${novoNome}`);
              }
            }
          }
        }

        // Verificar divergência
        if (pdfUrlFinal && xmlUrlFinal) {
          const nomePdf = extrairNomeArquivo(pdfUrlFinal);
          const nomeXml = extrairNomeArquivo(xmlUrlFinal);
          // Extrair código detectado em cada arquivo
          const codPdfEncontrado = CODIGOS_OFICIAIS.has(cod) && codigoNoNomeArquivo(nomePdf, cod);
          const codXmlEncontrado = CODIGOS_OFICIAIS.has(cod) && codigoNoNomeArquivo(nomeXml, cod);
          // Divergência: ambos têm códigos mas são diferentes (buscar qualquer código oficial nos nomes)
          let codNoPdf: string | null = null;
          let codNoXml: string | null = null;
          for (const c of CODIGOS_OFICIAIS) {
            if (codigoNoNomeArquivo(nomePdf, c)) { codNoPdf = c; break; }
          }
          for (const c of CODIGOS_OFICIAIS) {
            if (codigoNoNomeArquivo(nomeXml, c)) { codNoXml = c; break; }
          }
          if (codNoPdf && codNoXml && codNoPdf !== codNoXml) {
            stats.divergencia_pdf_xml++;
            if (log.status_cod === 'OK') log.status_cod = 'REVISAR';
            motivoRevisao = (motivoRevisao ? motivoRevisao + ' | ' : '') + `CÓDIGO DIVERGENTE ENTRE NOTA E XML (PDF: ${codNoPdf}, XML: ${codNoXml})`;
          }
        }
      }

      log.codigo_pdf_ok = codigoPdfOk;
      log.codigo_xml_ok = codigoXmlOk;
      log.motivo_revisao = motivoRevisao || null;

      // ── FLUXO 5: backup_validado ───────────────────────────────────────────
      const backupValidado = (
        cod &&
        CODIGOS_OFICIAIS.has(cod) &&
        log.status_cod === 'OK' &&
        codigoPdfOk === 'SIM' &&
        (codigoXmlOk === 'SIM' || codigoXmlOk === 'NÃO_SE_APLICA') &&
        !motivoRevisao?.includes('DIVERGENTE')
      ) ? 'SIM' : 'NÃO';

      log.backup_validado = backupValidado;
      if (backupValidado === 'SIM') stats.backup_validado++;

      // ── Persistir no banco (se não dryRun) ────────────────────────────────
      if (!dryRun) {
        const updates: any = {
          status_cod: log.status_cod,
          codigo_pdf_ok: codigoPdfOk,
          codigo_xml_ok: codigoXmlOk,
          backup_validado: backupValidado,
        };
        if (log.cod_final) updates.cod = log.cod_final;
        if (log.motivo_revisao) updates.motivo_revisao = log.motivo_revisao;

        await base44.asServiceRole.entities.PurchaseRequest.update(purchase.id, updates);
      }

      logs.push(log);
    }

    // ── FLUXO 6: Relatório final ───────────────────────────────────────────────
    return Response.json({
      ok: true,
      dry_run: dryRun,
      force,
      stats: {
        total_analisadas: stats.total,
        cod_correto: stats.cod_ok,
        preenchidos_nesta_execucao: stats.preenchidos_agora,
        marcados_revisar: stats.revisar,
        pdf_verificados: stats.pdf_verificados,
        xml_verificados: stats.xml_verificados,
        codigo_pdf_ok_sim: stats.pdf_ok,
        codigo_xml_ok_sim: stats.xml_ok,
        arquivos_renomeados: stats.arquivos_renomeados,
        divergencia_pdf_xml: stats.divergencia_pdf_xml,
        backup_validado_sim: stats.backup_validado,
      },
      logs,
    });

  } catch (err) {
    console.error('[validarCodBackupNFs]', err);
    return Response.json({ ok: false, error: String((err as any)?.message || err) }, { status: 500 });
  }
});