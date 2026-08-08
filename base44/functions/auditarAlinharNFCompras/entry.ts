/**
 * auditarAlinharNFCompras
 *
 * Auditoria automática cruzando Notas Fiscais no Google Drive com
 * PurchaseRequests no banco. Garante alinhamento de valores e datas de
 * emissão, corrigindo divergências encontradas.
 *
 * Regras:
 *   - XML vinculado: parse determinístico (confiança 100% — dados
 *     estruturados regulados). Usa como fonte de verdade.
 *   - Sem XML (apenas PDF): InvokeLLM lê o PDF, extrai número/valor/data
 *     com confiança informada. Retenta até atingir 95% ou esgotar 3
 *     tentativas.
 *   - Quando divergente E confiança >= confianca_minima → atualiza o banco.
 *   - Quando divergente E confianca < confianca_minima → marca
 *     revisao_manual, NÃO altera o banco.
 *   - dryRun=true (padrão): apenas reporta, sem alterar o banco.
 *
 * Função backend acionada manualmente — sem interface.
 */
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.41';
import { invokeLLM } from '../_shared/gatewayIA.ts';

const CONFIANCA_MINIMA_DEFAULT = 95;
const MAXIMO_TENTATIVAS_DEFAULT = 3;
const TIMEOUT_MS = 55000;
const LIMITE_PADRAO = 20;

// ── Helpers ─────────────────────────────────────────────────────────────────

async function driveReq(token: string, url: string) {
  return fetch(url, { headers: { Authorization: `Bearer ${token}` } });
}

function extrairDriveFileId(url: string): string | null {
  if (!url) return null;
  const m =
    url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) ||
    url.match(/[?&]id=([a-zA-Z0-9_-]+)/) ||
    url.match(/\/d\/([a-zA-Z0-9_-]{20,})/) ||
    url.match(/^([a-zA-Z0-9_-]{20,})$/);
  return m ? m[1] : null;
}

async function downloadDrive(token: string, url: string): Promise<ArrayBuffer | null> {
  const fileId = extrairDriveFileId(url);
  if (!fileId) return null;
  const r = await driveReq(
    token,
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`,
  );
  if (!r.ok) return null;
  return await r.arrayBuffer();
}

async function downloadXmlText(token: string, url: string): Promise<string> {
  const buf = await downloadDrive(token, url);
  if (!buf) return '';
  return new TextDecoder('utf-8').decode(buf);
}

function parseXmlSimples(xml: string): {
  nf_numero?: string;
  nf_valor_total?: number;
  nf_emitente_nome?: string;
  nf_data_emissao?: string;
} {
  if (!xml) return {};
  const tag = (re: RegExp) => {
    const m = xml.match(re);
    return m ? m[1].trim() : '';
  };
  const result: any = {};
  const num =
    tag(/<nNF[^>]*>(\d+)<\/nNF>/i) || tag(/<nNfse[^>]*>(\d+)<\/nNfse>/i) || tag(/<Numero[^>]*>(\d+)<\/Numero>/i);
  if (num) result.nf_numero = num.replace(/^0+(\d)/, '$1');
  const valorRaw =
    tag(/<vNF[^>]*>([\d.,]+)<\/vNF>/i) ||
    tag(/<vPag[^>]*>([\d.,]+)<\/vPag>/i) ||
    tag(/<ValorServicos[^>]*>([\d.,]+)<\/ValorServicos>/i) ||
    tag(/<ValorTotal[^>]*>([\d.,]+)<\/ValorTotal>/i);
  if (valorRaw) {
    const s = String(valorRaw).replace(/\s/g, '');
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) result.nf_valor_total = parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    else result.nf_valor_total = parseFloat(s.replace(',', '.')) || 0;
  }
  const nome = tag(/<xNome[^>]*>([^<]+)<\/xNome>/i) || tag(/<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i);
  if (nome) result.nf_emitente_nome = nome;
  const data =
    (tag(/<dhEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<dEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) ||
      tag(/<DataEmissao[^>]*>(\d{4}-\d{2}-\d{2})/i)) as string;
  if (data) result.nf_data_emissao = data;
  return result;
}

function valoresEquivalentes(a: any, b: any): boolean {
  return Math.abs(Number(a || 0) - Number(b || 0)) < 0.01;
}

function datasEquivalentes(a: any, b: any): boolean {
  if (!a || !b) return false;
  const pa = String(a).substring(0, 10);
  const pb = String(b).substring(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(pa) && /^\d{4}-\d{2}-\d{2}/.test(pb)) return pa === pb;
  const brA = String(a).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  const brB = String(b).match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brA && brB) return `${brA[3]}-${brA[2]}-${brA[1]}` === `${brB[3]}-${brB[2]}-${brB[1]}`;
  return pa === pb;
}

// ── IA: extrai via InvokeLLM do PDF, retentando até confianca_minima ────────

const IA_JSON_SCHEMA = {
  type: 'object',
  properties: {
    nf_numero: { type: 'string', description: 'Número da Nota Fiscal (apenas dígitos)' },
    nf_valor_total: { type: 'number', description: 'Valor total da NF em reais' },
    nf_data_emissao: { type: 'string', description: 'Data de emissão em formato YYYY-MM-DD' },
    nf_emitente_nome: { type: 'string', description: 'Razão social do emitente' },
    confianca: { type: 'number', description: 'Confiança da extração 0-100' },
    justificativa: { type: 'string', description: 'Breve justificativa da confiança' },
  },
};

function montarPrompt(tentativa: number): string {
  return [
    `Tentativa ${tentativa}. Você é um auditor fiscal preciso.`,
    'Analise a Nota Fiscal em anexo (PDF) e extraia os seguintes campos exatamente como aparecem no documento:',
    '- nf_numero: número da Nota Fiscal (apenas dígitos, sem zeros à esquerda)',
    '- nf_valor_total: valor total da NF (número decimal em reais, ex: 4200.50)',
    '- nf_data_emissao: data de emissão em formato YYYY-MM-DD',
    '- nf_emitente_nome: razão social do emitente',
    '- confianca: de 0 a 100 indique sua confiança na extração (100 = leitura inequívoca de todos os campos).',
    '- justificativa: explicação curta quando confianca < 100.',
    'Retorne APENAS o JSON conforme o schema fornecido. Não invente dados — se um campo não estiver visível, use null e abaixe a confianca.',
  ].join('\n');
}

async function extrairViaIA(
  base44: any,
  pdfUrl: string,
  confiancaMinima: number = CONFIANCA_MINIMA_DEFAULT,
  maxTentativas: number = MAXIMO_TENTATIVAS_DEFAULT,
): Promise<{ dados: any; tentativas: number; confianca: number }> {
  let tentativa = 0;
  let melhor: any = null;
  let melhorConfianca = -1;
  while (tentativa < maxTentativas) {
    tentativa++;
    try {
      const resp: any = await invokeLLM(base44,{
        prompt: montarPrompt(tentativa),
        file_urls: [pdfUrl],
        add_context_from_internet: false,
        response_json_schema: IA_JSON_SCHEMA,
        model: 'gpt_5_mini',
      });
      const dados = resp || {};
      const confianca = Number(dados.confianca || 0);
      if (confianca > melhorConfianca) {
        melhorConfianca = confianca;
        melhor = dados;
      }
      if (confianca >= confiancaMinima) break;
    } catch (e) {
      console.warn('[auditarAlinharNFCompras] IA erro:', (e as any)?.message || e);
    }
  }
  return { dados: melhor, tentativas: tentativa, confianca: melhorConfianca };
}

// ── Reanálise de centro_custo ────────────────────────────────────────────────
// Corrige atribuições erradas que usuário denunciou (ex.: "Coordenador Geral /
// Perini Projetos" marcado como "Noturno Pampulha" deveria ser "Geral").
// 1) Regras determinísticas (confiança 100, sem custo de IA) cobrem casos óbvios.
// 2) Para casos ambíguos, IA lê a nota anexa (se houver PDF) + metadados.

function regraDeterministicaCentroCusto(pr: any): { centro_custo_correto: string; confianca: number; justificativa: string } | null {
  const rubrica = String(pr.rubrica_nome || pr.rubrica || '').toLowerCase();
  const categoria = String(pr.categoria || '').toLowerCase();
  const descricao = String(pr.descricao_item || pr.observacoes || '').toLowerCase();
  const fornecedor = String(pr.fornecedor_nome || pr.nf_emitente_nome || '').toLowerCase();
  const atual = String(pr.centro_custo || '').trim();
  const bag = `${rubrica} ${categoria} ${descricao} ${fornecedor}`;

  // Coordenação Geral / Coordenador Geral / Perini Projetos / Daniel Perini → Geral (transversal)
  if (
    rubrica.includes('coordenador geral') ||
    rubrica.includes('coordenacao geral') ||
    rubrica.includes('coordenação geral') ||
    fornecedor.includes('perini projetos') ||
    fornecedor.includes('daniel perini') ||
    (categoria.includes('coordenacao') && !bag.includes('noturno'))
  ) {
    if (atual !== 'Geral') {
      return { centro_custo_correto: 'Geral', confianca: 100, justificativa: 'Regra determinística: coordenação geral/Perini Projetos é sempre Geral (transversal)' };
    }
    return null; // já correto
  }

  // Publicações — rubrica/editorial explícita
  if (rubrica.includes('publicac') || rubrica.includes('catálogo') || rubrica.includes('catalogo') || rubrica.includes('livro') || categoria.includes('publicac')) {
    if (atual !== 'Publicações' && atual !== 'Geral') {
      return { centro_custo_correto: 'Publicações', confianca: 95, justificativa: 'Regra determinística: rubrica editorial → Publicações' };
    }
  }

  // Noturno Pampulha — apenas se rubrica menciona explicitamente Pampulha
  if (rubrica.includes('pampulha')) {
    if (atual !== 'Noturno Pampulha') {
      return { centro_custo_correto: 'Noturno Pampulha', confianca: 100, justificativa: 'Regra determinística: rubrica menciona Pampulha explicitamente' };
    }
    return null;
  }

  // Noturno nos Museus 2026 — rubrica de projeto noturno (shows/monitores noturnos)
  if (rubrica.includes('noturno') && !rubrica.includes('pampulha')) {
    if (atual !== 'Noturno nos Museus 2026' && atual !== 'Noturno 2026') {
      return { centro_custo_correto: 'Noturno nos Museus 2026', confianca: 95, justificativa: 'Regra determinística: rubrica de projeto noturno' };
    }
    return null;
  }

  return null;
}

const CENTROS_CUSTO_VALIDOS = [
  'MHAB',
  'MIS',
  'MUMO',
  'Noturno nos Museus 2026',
  'Noturno 2026',
  'Noturno Pampulha',
  'Publicações',
  'Geral',
];

const SCHEMA_CENTRO_CUSTO = {
  type: 'object',
  properties: {
    centro_custo_correto: { type: 'string', description: 'Um dos valores da lista CENTROS_CUSTO_VALIDOS' },
    rubrica_id_correto: { type: 'string', description: 'ID da rubrica sugerida (ou string vazia se manter)' },
    confianca: { type: 'number', description: 'Confiança 0-100 na determinação' },
    justificativa: { type: 'string', description: 'Breve justificativa' },
  },
};

function montarPromptCentroCusto(pr: any, rubricasMenuTxt: string): string {
  return [
    'Você é o auditor administrativo do projeto Museus Centro. Reanalise o CENTRO DE CUSTO e a RUBRICA mais adequados para esta Nota Fiscal, considerando que atribuições automáticas anteriores podem ter sido corrompidas.',
    '',
    'Dados atuais da solicitação:',
    `- Fornecedor: ${pr.fornecedor_nome || pr.nf_emitente_nome || '—'}`,
    `- Descrição do item: ${pr.descricao_item || '—'}`,
    `- Categoria: ${pr.categoria || '—'}`,
    `- Rubrica atual: ${pr.rubrica_nome || '—'} (id: ${pr.rubrica_id || '—'})`,
    `- Centro de custo atual (possivelmente errado): ${pr.centro_custo || '—'}`,
    `- Valor: ${pr.nf_valor_total ?? pr.valor_solicitado ?? '—'}`,
    '',
    'CENTROS DE CUSTO VÁLIDOS (escolha OBRIGATORIAMENTE UM destes):',
    CENTROS_CUSTO_VALIDOS.join(', '),
    '',
    'RUBRICAS DISPONÍVEIS (formato "id|nome|centro_custo"). Escolha a mais aderente ao serviço prestado e retorne o id em rubrica_id_correto. Se a rubrica atual for correta, retorne string vazia em rubrica_id_correto:',
    rubricasMenuTxt || '(sem rubricas cadastradas)',
    '',
    'Regras de ouro (use quando se aplicar):',
    '- "Coordenador Geral", "Coordenação Geral", "Perini Projetos", "Daniel Perini" → "Geral" (transversal). NUNCA "Noturno Pampulha".',
    '- "Noturno Pampulha" apenas se a rubrica considerar explicitamente a ed. Pampulha 2026 (projeto Noturno Pampulha específico).',
    '- "Noturno nos Museus 2026" para rubricas do projeto Noturno nos Museus (shows noturnos, agentes, monitores noturnos).',
    '- "Noturno 2026" para despesas gerais do projeto Noturno 2026.',
    '- "MHAB", "MIS", "MUMO" para atividades/contratações diretamente executadas naquele museu específico.',
    '- "Publicações" para produção editorial, catálogos, livros.',
    '- Em caso de dúvida entre museus específicos e transversal, prefira "Geral" quando o fornecedor é uma empresa/contratado que atende múltiplos museus (ex.: Perini Projetos).',
    '',
    'Leia o documento fiscal anexo para confirmar o emitente e o serviço prestado. Retorne JSON conforme schema. centro_custo_correto deve ser EXATAMENTE um dos valores listados. rubrica_id_correto deve ser um id válido da lista acima (ou string vazia para manter a atual). confianca=100 quando inequívoco pelas regras; <95 quando houver ambiguidade.',
  ].join('\n');
}

async function reanalisarCentroCusto(
  base44: any,
  pr: any,
  fileUrl: string | null,
  confiancaMinima: number = CONFIANCA_MINIMA_DEFAULT,
  maxTentativas: number = MAXIMO_TENTATIVAS_DEFAULT,
  rubricasMenuTxt: string = '',
): Promise<{ dados: any; tentativas: number; confianca: number }> {
  let tentativa = 0;
  let melhor: any = null;
  let melhorConfianca = -1;
  const prompt = montarPromptCentroCusto(pr, rubricasMenuTxt);
  while (tentativa < maxTentativas) {
    tentativa++;
    try {
      const payload: any = {
        prompt,
        add_context_from_internet: false,
        response_json_schema: SCHEMA_CENTRO_CUSTO,
        model: 'gpt_5_mini',
      };
      if (fileUrl) payload.file_urls = [fileUrl];
      const resp: any = await invokeLLM(base44,payload);
      const dados = resp || {};
      const confianca = Number(dados.confianca || 0);
      // Validação: campo deve ser um dos válidos
      const centro = String(dados.centro_custo_correto || '').trim();
      if (centro && !CENTROS_CUSTO_VALIDOS.includes(centro)) {
        dados.centro_custo_correto = '';
        dados.confianca = Math.min(confianca, 50);
      }
      if (Number(dados.confianca) > melhorConfianca) {
        melhorConfianca = Number(dados.confianca);
        melhor = dados;
      }
      if (melhorConfianca >= confiancaMinima && melhor?.centro_custo_correto) break;
    } catch (e) {
      console.warn('[auditarAlinharNFCompras] IA centro_custo erro:', (e as any)?.message || e);
    }
  }
  return { dados: melhor, tentativas: tentativa, confianca: melhorConfianca };
}

// ── Handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const start = Date.now();
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me().catch(() => null);
    if (!user || String((user as any).role || '').toUpperCase() !== 'ADMIN') {
      return Response.json({ ok: false, error: 'Apenas admin' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    // padrão: automatizar correções (dryRun=false). Use dryRun=true para simular.
    const dryRun = body.dryRun === true;
    const skipPR = Math.max(0, Number(body.skip || 0));
    const limite = Math.min(Number(body.limite || LIMITE_PADRAO), 50);
    const confiancaMin = Number(body.confianca_minima || CONFIANCA_MINIMA_DEFAULT);
    const maxTentativas = Math.min(Number(body.max_tentativas || MAXIMO_TENTATIVAS_DEFAULT), 5);
    // padrão: reanalisa centro_custo via IA lendo a nota. Use false para pular.
    const reanalisarCentroCusto = body.reanalisar_centro_custo !== false;

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = accessToken;

    // ── Carrega rubricas para o menu da IA (id + nome curto + centro_custo) ─
    let rubricasMenuTxt = '';
    try {
      const rs: any[] = await base44.asServiceRole.entities.Rubrica.list('', 800);
      rubricasMenuTxt = (rs || [])
        .filter((r) => r?.id && (r.rubrica || r.nome || r.descricao))
        .filter((r) => r.ativo !== false)
        .slice(0, 60)
        .map((r) => {
          const nome = String(r.rubrica || r.nome || r.descricao || '').trim().substring(0, 55);
          return `${r.id}|${nome}|${String(r.centro_custo || '-')}`;
        })
        .join(' || ');
    } catch { /* segue sem menu */ }

    // ── Carrega PRs com link de NF Drive (PDF ou XML) ──────────────────────
    const prsTotais: any[] = [];
    let skipAcum = 0;
    while (Date.now() - start < TIMEOUT_MS) {
      const lote = await base44.asServiceRole.entities.PurchaseRequest
        .filter({}, '-updated_date', 200, skipAcum)
        .catch(() => []);
      if (!lote?.length) break;
      for (const pr of lote) {
        const pdfUrl = pr.drive_backup_nf_pdf_link || pr.nf_pdf_url || pr.nota_fiscal_url || '';
        const xmlUrl = pr.nf_xml_url || pr.nota_fiscal_xml_url || pr.xml_url || '';
        if (pdfUrl || xmlUrl) prsTotais.push(pr);
      }
      if (lote.length < 200) break;
      skipAcum += 200;
    }

    const fatia = prsTotais.slice(skipPR, skipPR + limite);
    const hasMore = skipPR + limite < prsTotais.length;

    const stats = {
      total_disponivel: prsTotais.length,
      processados: 0,
      alinhados: 0,
      divergentes_corrigidos: 0,
      divergentes_nao_corrigidos: 0,
      correcoes_centro_custo: 0,
      correcoes_rubrica: 0,
      centro_custo_ok: 0,
      sem_arquivo: 0,
      erros: 0,
    };
    const detalhes: any[] = [];

    for (const pr of fatia) {
      if (Date.now() - start > TIMEOUT_MS) break;
      stats.processados++;
      const pdfUrl = pr.drive_backup_nf_pdf_link || pr.nf_pdf_url || pr.nota_fiscal_url || '';
      const xmlUrl = pr.nf_xml_url || pr.nota_fiscal_xml_url || pr.xml_url || '';

      const item: any = {
        pr_id: pr.id,
        nf_numero_db: pr.nf_numero || '',
        fornecedor_db: pr.fornecedor_nome || pr.nf_emitente_nome || '',
        nf_data_emissao_db: pr.nf_data_emissao || '',
        nf_valor_total_db: pr.nf_valor_total ?? pr.valor_solicitado ?? null,
        fonte: 'sem_arquivo',
        acao: 'nenhuma',
        divergencia: false,
        confianca: 0,
        tentativas: 0,
        erro: '',
      };

      try {
        // ── Caminho XML (parse determinístico, confiança 100) ────────────
        if (xmlUrl) {
          const xmlText = await downloadXmlText(token, xmlUrl);
          if (xmlText) {
            const parsed = parseXmlSimples(xmlText);
            const valorExtraido = parsed.nf_valor_total;
            const dataExtraida = parsed.nf_data_emissao;
            item.fonte = 'xml_deterministico';
            item.confianca = 100;
            item.nf_numero_extraido = parsed.nf_numero || '';
            item.nf_valor_total_extraido = valorExtraido;
            item.nf_data_emissao_extraido = dataExtraida;
            item.nf_emitente_extraido = parsed.nf_emitente_nome || '';
            item.tentativas = 1;

            const divValor = valorExtraido != null && !valoresEquivalentes(valorExtraido, pr.nf_valor_total);
            const divData = !!(dataExtraida && !datasEquivalentes(dataExtraida, pr.nf_data_emissao));
            item.divergencia = !!(divValor || divData);
            item.divergencia_valor = divValor;
            item.divergencia_data = divData;

            if (item.divergencia && !dryRun) {
              const update: any = {};
              if (divValor && valorExtraido != null) update.nf_valor_total = valorExtraido;
              if (divData && dataExtraida) update.nf_data_emissao = dataExtraida;
              if (parsed.nf_numero && !pr.nf_numero) update.nf_numero = parsed.nf_numero;
              if (Object.keys(update).length) {
                await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, update);
                item.acao = 'corrigido_xml';
                stats.divergentes_corrigidos++;
              } else {
                item.acao = 'sem_dados_para_corrigir';
              }
            } else if (item.divergencia) {
              item.acao = 'divergente_simulado';
              stats.divergentes_nao_corrigidos++;
            } else {
              item.acao = 'alinhado';
              stats.alinhados++;
            }
          } else {
            item.acao = 'sem_arquivo_xml';
            stats.sem_arquivo++;
          }
        } else if (pdfUrl) {
          // ── Caminho PDF via IA (retentando até confianca_minima) ────────
          item.fonte = 'pdf_ia';
          const buf = await downloadDrive(token, pdfUrl);
          if (!buf) {
            item.acao = 'sem_arquivo_pdf';
            item.erro = 'PDF não baixável do Drive';
            stats.sem_arquivo++;
            detalhes.push(item);
            continue;
          }
          let fileUrl = pdfUrl;
          try {
            const file = new File([buf], 'nf.pdf', { type: 'application/pdf' });
            const up: any = await base44.integrations.Core.UploadFile({ file });
            if (up?.file_url) fileUrl = up.file_url;
          } catch (e: any) {
            item.erro = `upload: ${e.message}`;
          }
          item._pdf_file_url = fileUrl; // reutilizado na reanálise de centro_custo
          const { dados, tentativas, confianca } = await extrairViaIA(
            base44,
            fileUrl,
            confiancaMin,
            maxTentativas,
          );
          item.tentativas = tentativas;
          item.confianca = confianca;
          if (!dados) {
            item.acao = 'erro_ia';
            item.erro = 'IA não retornou dados após tentativas';
            stats.erros++;
            detalhes.push(item);
            continue;
          }
          item.nf_numero_extraido = dados.nf_numero || '';
          item.nf_valor_total_extraido = dados.nf_valor_total ?? null;
          item.nf_data_emissao_extraido = dados.nf_data_emissao || '';
          item.nf_emitente_extraido = dados.nf_emitente_nome || '';
          item.justificativa = dados.justificativa || '';

          const divValor = dados.nf_valor_total != null && !valoresEquivalentes(dados.nf_valor_total, pr.nf_valor_total);
          const divData = !!(dados.nf_data_emissao && !datasEquivalentes(dados.nf_data_emissao, pr.nf_data_emissao));
          item.divergencia = !!(divValor || divData);
          item.divergencia_valor = divValor;
          item.divergencia_data = divData;

          if (item.divergencia && confianca >= confiancaMin && !dryRun) {
            const update: any = {};
            if (divValor && dados.nf_valor_total != null) update.nf_valor_total = dados.nf_valor_total;
            if (divData && dados.nf_data_emissao) update.nf_data_emissao = dados.nf_data_emissao;
            if (dados.nf_numero && !pr.nf_numero) update.nf_numero = dados.nf_numero;
            if (dados.nf_emitente_nome && !pr.fornecedor_nome && !pr.nf_emitente_nome) {
              update.nf_emitente_nome = dados.nf_emitente_nome;
            }
            if (Object.keys(update).length) {
              await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, update);
              item.acao = 'corrigido_ia';
              stats.divergentes_corrigidos++;
            } else {
              item.acao = 'sem_dados_para_corrigir';
            }
          } else if (item.divergencia && confianca < confiancaMin) {
            item.acao = 'revisao_manual';
            stats.divergentes_nao_corrigidos++;
          } else if (item.divergencia && dryRun) {
            item.acao = 'divergente_simulado';
            stats.divergentes_nao_corrigidos++;
          } else if (!item.divergencia) {
            item.acao = 'alinhado';
            stats.alinhados++;
          }
        } else {
          stats.sem_arquivo++;
          item.acao = 'sem_arquivo';
        }

        // ── Reanálise de centro_custo (determinístico primeiro, IA depois) ────
        if (reanalisarCentroCusto && Date.now() - start < TIMEOUT_MS) {
          try {
            item.centro_custo_atual = pr.centro_custo || '';
            // 1) Regra determinística (gratuita, confiança 100)
            const regra = regraDeterministicaCentroCusto(pr);
            let cc: any = regra ? { centro_custo_correto: regra.centro_custo_correto, justificativa: regra.justificativa } : null;
            let ccc = regra ? regra.confianca : 0;
            let tcc = regra ? 0 : 0;
            // 2) Se a regra não decidiu, usa IA (com PDF se houver)
            if (!cc && (pdfUrl || pr.rubrica_nome || pr.descricao_item)) {
              let iaFileUrl: string | null = item._pdf_file_url || null;
              if (!iaFileUrl && pdfUrl) {
                const bufCc = await downloadDrive(token, pdfUrl);
                if (bufCc) {
                  const blobCc = new Blob([bufCc], { type: 'application/pdf' });
                  const upCc: any = await base44.integrations.Core.UploadFile({ file: blobCc });
                  if (upCc?.file_url) iaFileUrl = upCc.file_url;
                }
              }
              const rCc = await reanalisarCentroCusto(base44, pr, iaFileUrl, confiancaMin, maxTentativas, rubricasMenuTxt);
              cc = rCc.dados;
              tcc = rCc.tentativas;
              ccc = rCc.confianca;
            }
            item.centro_custo_correto = cc?.centro_custo_correto || '';
            item.centro_custo_confianca = ccc;
            item.centro_custo_tentativas = tcc;
            item.centro_custo_justificativa = cc?.justificativa || '';
            item.centro_custo_origem = regra ? 'regra_deterministica' : (cc ? 'ia' : 'nenhuma');
            const ccDivergente = !!(cc?.centro_custo_correto && cc.centro_custo_correto !== pr.centro_custo);
            item.divergencia_centro_custo = ccDivergente;
            const rubCorreta = String(cc?.rubrica_id_correto || '').trim();
            const rubValida = !!(rubCorreta && /^[a-f0-9]{24}$/i.test(rubCorreta) && rubCorreta !== (pr.rubrica_id || ''));
            const deveAplicar = (ccDivergente || rubValida) && ccc >= confiancaMin && !dryRun;
            if (deveAplicar) {
              const updateCC: any = {};
              if (ccDivergente) updateCC.centro_custo = cc.centro_custo_correto;
              if (rubValida) {
                updateCC.rubrica_id = rubCorreta;
                updateCC.rubrica_ia_validada = true;
                updateCC.rubrica_ia_score = ccc;
                updateCC.rubrica_ia_justificativa = cc?.justificativa || 'Auditoria automatica - auditarAlinharNFCompras';
                updateCC.rubrica_ia_divergente = false;
                updateCC.rubrica_ia_corrigida_de = pr.rubrica_id || '';
                try {
                  const rub: any = await base44.asServiceRole.entities.Rubrica.get(rubCorreta);
                  if (rub) {
                    updateCC.rubrica_nome = rub.rubrica || rub.nome || '';
                    if (rub.natureza_despesa) {
                      updateCC.natureza_despesa = rub.natureza_despesa;
                      updateCC.natureza_despesa_purchase = rub.natureza_despesa;
                    }
                  }
                } catch { /* mantém apenas o id */ }
                item.rubrica_corrigida_de = pr.rubrica_id || '';
                item.rubrica_corrigida_para = rubCorreta;
                stats.correcoes_rubrica = (stats.correcoes_rubrica || 0) + 1;
              }
              if (Object.keys(updateCC).length) {
                await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, updateCC);
              }
              item.acao_cc = rubValida ? 'corrigido_centro_custo_e_rubrica' : 'corrigido_centro_custo';
              if (ccDivergente) stats.correcoes_centro_custo++;
            } else if (ccDivergente && ccc >= confiancaMin && dryRun) {
              item.acao_cc = 'divergente_simulado_cc';
            } else if (ccDivergente && ccc < confiancaMin) {
              item.acao_cc = 'revisao_manual_cc';
            } else if (!cc?.centro_custo_correto) {
              item.acao_cc = 'sem_resposta_cc';
            } else {
              item.acao_cc = 'centro_custo_ok';
              stats.centro_custo_ok++;
            }
          } catch (e: any) {
            item.acao_cc = 'erro_cc';
            item.erro_cc = e.message || String(e);
          }
        }
      } catch (e: any) {
        stats.erros++;
        item.erro = e.message || String(e);
        item.acao = 'erro';
      }
      detalhes.push(item);
    }

    // ── Log ─────────────────────────────────────────────────────────────────
    try {
      await base44.asServiceRole.entities.BackupLog.create({
        backup_type: 'auditoria_entrada_unica',
        entity_type: 'auditarAlinharNFCompras',
        status: stats.erros > 0 ? 'concluido' : 'success',
        total_files: stats.processados,
        files_copied: stats.divergentes_corrigidos,
        details: `DryRun: ${dryRun} | Alinhados: ${stats.alinhados} | Corrigidos valor/data: ${stats.divergentes_corrigidos} | Pendentes revisão: ${stats.divergentes_nao_corrigidos} | Centro de custo corrigidos: ${stats.correcoes_centro_custo} | Rubricas corrigidas: ${stats.correcoes_rubrica || 0} | Centro de custo ok: ${stats.centro_custo_ok} | Sem arquivo: ${stats.sem_arquivo} | Erros: ${stats.erros}`,
        triggered_by: 'manual',
        processed_at: new Date().toISOString(),
        execution_time_ms: Date.now() - start,
      });
    } catch { /* log não bloqueia */ }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      confianca_minima: confiancaMin,
      execution_ms: Date.now() - start,
      stats,
      has_more: hasMore,
      proximo_skip: skipPR + limite,
      detalhes,
    });
  } catch (err) {
    console.error('[auditarAlinharNFCompras] erro:', err);
    return Response.json({ ok: false, error: (err as any)?.message || 'Erro interno' }, { status: 500 });
  }
});