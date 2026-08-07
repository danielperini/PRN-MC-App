import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

import {
  buildNomeOficial,
  isMachineName,
  parseMachineName,
  parseLegacyName,
  extractNfNumGeneric,
  ensureUniqueName,
  resolveTeamMemberForPR,
  isEquipe,
} from '../_shared/nfNomeOficial.ts';

type TipoNFArquivo = 'NF' | 'XML' | 'COMP NF';

/**
 * renomearNFsDrive
 *
 * Percorre as pastas raiz do Drive e renomeia arquivos de NF/XML/Comprovante
 * para o padrão oficial canônico:
 *
 *   NF 12 Producao - PERINI PROJETOS - DANIEL PERINI - Coordenador - MUSEUS CENTRO - R$ 4.200,00.pdf
 *
 * Reconhece 3 padrões legados:
 *   (1) máquina: "2026-07__FORNECEDOR__NF-12__nf-pdf__sol-abc.pdf"
 *   (2) legível:  "NF 03 Producao - FORNECEDOR - R$ 4.200,00.pdf"
 *   (3) não reconhecido: tenta lookup genérico por nf_numero; se não achar PR,
 *       mantém o arquivo intocado (sem_vinculo).
 *
 * Antes de renomear, verifica duplicidade de nome na pasta e acrescenta
 * sufixo " (2)", " (3)" se necessário.
 *
 * dryRun: true (padrão, seguro) | false (efetiva)
 */

const ROOT_FOLDERS = [
  '1LgC94VhIomQZBS7kfkQqgBX8MVzwQqzp', // pastas MM-YYYY
  '13Lkf42UMaHsyLb8T7Cd0TGUkM3_3YH2T', // pastas "Mês YYYY"
  '10udE1viTbqEtoGdpMZVcRA97SkpcWNsn', // pasta flat (julho 2026)
  '1jhZBWsOltRSjtdKHPG64PovnxygKLuW-', // pasta extra (notas fiscais)
];

const FOLDER_MIME = 'application/vnd.google-apps.folder';

// ── Drive helpers ─────────────────────────────────────────────────────────────

async function driveReq(token: string, url: string, opts: any = {}) {
  return fetch(url, { ...opts, headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) } });
}

async function listAllInFolder(token: string, folderId: string) {
  const items: any[] = [];
  let pt: string | null = null;
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    let url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType)&pageSize=1000`;
    if (pt) url += `&pageToken=${encodeURIComponent(pt)}`;
    const r = await driveReq(token, url);
    if (!r.ok) break;
    const d = await r.json();
    if (d.files) items.push(...d.files);
    pt = d.nextPageToken || null;
  } while (pt);
  return items;
}

async function renameFile(token: string, fileId: string, newName: string) {
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: newName }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.name;
}

async function downloadFile(token: string, fileId: string): Promise<ArrayBuffer | null> {
  const r = await driveReq(token, `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`);
  if (!r.ok) return null;
  return await r.arrayBuffer();
}

function parseXmlNFConteudo(xml: string): { nf_numero?: string; nf_valor_total?: number; nf_data_emissao?: string; nf_emitente_nome?: string } {
  if (!xml) return {};
  const tag = (re: RegExp) => { const m = xml.match(re); return m ? m[1].trim() : ''; };
  const result: any = {};
  const num = tag(/<nNF[^>]*>(\d+)<\/nNF>/i) || tag(/<nNfse[^>]*>(\d+)<\/nNfse>/i) || tag(/<Numero[^>]*>(\d+)<\/Numero>/i);
  if (num) result.nf_numero = num.replace(/^0+(\d)/, '$1');
  const valorRaw = tag(/<vNF[^>]*>([\d.,]+)<\/vNF>/i) || tag(/<vPag[^>]*>([\d.,]+)<\/vPag>/i) || tag(/<ValorServicos[^>]*>([\d.,]+)<\/ValorServicos>/i) || tag(/<ValorTotal[^>]*>([\d.,]+)<\/ValorTotal>/i);
  if (valorRaw) {
    const s = String(valorRaw).replace(/\s/g, '');
    if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) result.nf_valor_total = parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
    else result.nf_valor_total = parseFloat(s.replace(',', '.')) || 0;
  }
  const nome = tag(/<xNome[^>]*>([^<]+)<\/xNome>/i) || tag(/<RazaoSocial[^>]*>([^<]+)<\/RazaoSocial>/i);
  if (nome) result.nf_emitente_nome = nome;
  const data = tag(/<dhEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<dEmi[^>]*>(\d{4}-\d{2}-\d{2})/i) || tag(/<DataEmissao[^>]*>(\d{4}-\d{2}-\d{2})/i);
  if (data) result.nf_data_emissao = data;
  return result;
}

const IA_CONTEUDO_SCHEMA = {
  type: 'object',
  properties: {
    nf_numero: { type: 'string', description: 'Número da Nota Fiscal (apenas dígitos)' },
    nf_valor_total: { type: 'number', description: 'Valor total em reais' },
    nf_data_emissao: { type: 'string', description: 'Data de emissão YYYY-MM-DD' },
    nf_emitente_nome: { type: 'string', description: 'Razão social do emitente' },
    confianca: { type: 'number' },
  },
};

async function extrairConteudoArquivo(
  base44: any,
  token: string,
  item: any,
  ext: string,
): Promise<{ nf_numero?: string; nf_valor_total?: number; nf_data_emissao?: string; nf_emitente_nome?: string } | null> {
  try {
    const buf = await downloadFile(token, item.id);
    if (!buf) return null;
    if (ext === 'xml') {
      const txt = new TextDecoder('utf-8').decode(buf);
      return parseXmlNFConteudo(txt);
    }
    // PDF → IA
    const blob = new Blob([buf], { type: 'application/pdf' });
    const up: any = await base44.integrations.Core.UploadFile({ file: blob });
    if (!up?.file_url) return null;
    const resp: any = await base44.integrations.Core.InvokeLLM({
      prompt: 'Analise a Nota Fiscal em anexo (PDF) e extraia: nf_numero (apenas dígitos), nf_valor_total (número em reais), nf_data_emissao (YYYY-MM-DD), nf_emitente_nome (razão social). Retorne APENAS o JSON conforme o schema.',
      file_urls: [up.file_url],
      add_context_from_internet: false,
      response_json_schema: IA_CONTEUDO_SCHEMA,
      model: 'gpt_5_mini',
    });
    return resp || null;
  } catch (e) {
    console.warn('[renomearNFsDrive] extrairConteudo erro:', (e as any)?.message || e);
    return null;
  }
}

function fmtBRLConteudo(v: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
}

function buildNomeFromConteudo(c: any, tipo: TipoNFArquivo, ext: string): string {
  const num = String(c?.nf_numero || '').replace(/^0+(\d)/, '$1');
  const emit = String(c?.nf_emitente_nome || 'EMITENTE DESCONHECIDO').trim().substring(0, 40).toUpperCase();
  const valor = fmtBRLConteudo(c?.nf_valor_total || 0);
  const data = String(c?.nf_data_emissao || '').substring(0, 10);
  const prefixo = tipo === 'XML' ? 'XML' : tipo === 'COMP NF' ? 'COMP' : 'NF';
  const partes = [`${prefixo} ${num || '??'}`, emit, valor];
  if (data) partes.push(data);
  partes.push('MUSEUS CENTRO');
  return partes.join(' - ') + '.' + ext;
}

// ── Busca PurchaseRequest por número de NF + hint de fornecedor ─────────────────

async function findPR(base44: any, nfNum: string, fornecedorHint: string, cache?: Map<string, any>): Promise<any | null> {
  if (!nfNum) return null;
  const cacheKey = `${nfNum}::${fornecedorHint || '*'}`;
  if (cache && cache.has(cacheKey)) return cache.get(cacheKey) || null;

  let result: any = null;
  try {
    const results = await base44.asServiceRole.entities.PurchaseRequest.filter({ nf_numero: nfNum }, '-created_date', 10);
    if (results?.length === 1) {
      result = results[0];
    } else if (results?.length > 1 && fornecedorHint) {
      const hint = fornecedorHint.toLowerCase();
      const tokens = hint.split(' ').filter((t: string) => t.length > 3);
      const match = results.find((p: any) => {
        const fn = String(p.fornecedor_nome || p.nf_emitente_nome || '').toLowerCase();
        return tokens.some((t: string) => fn.includes(t));
      });
      result = match || results[0];
    } else {
      result = results?.[0] || null;
    }
  } catch {
    result = null;
  }

  if (cache) cache.set(cacheKey, result);
  return result;
}

// ── Classifica o arquivo legado em um dos 3 padrões ──────────────────────────────

type ParsedLegacy = { nfNum: string; fornecedorHint: string; tipo: TipoNFArquivo; ext: string; padrao: 'maquina' | 'legivel' | 'nao_reconhecido' };

function classificarArquivo(nome: string): ParsedLegacy {
  const lowerNome = nome.toLowerCase();
  const ext = lowerNome.endsWith('.xml') ? 'xml' : 'pdf';

  // (1) máquina
  if (isMachineName(nome)) {
    const parsed = parseMachineName(nome);
    if (parsed) {
      return {
        nfNum: parsed.nfNum,
        fornecedorHint: parsed.fornecedor,
        tipo: parsed.tipo,
        ext: parsed.ext,
        padrao: 'maquina',
      };
    }
  }

  // (2) legível legado
  const legacy = parseLegacyName(nome);
  if (legacy) {
    return { ...legacy, padrao: 'legivel' };
  }

  // (3) não reconhecido — tenta extrair NF-XX genericamente
  const nfNumGeneric = extractNfNumGeneric(nome);
  const tipoGeneric: TipoNFArquivo = lowerNome.startsWith('xml') ? 'XML' : lowerNome.startsWith('comp') ? 'COMP NF' : 'NF';
  return {
    nfNum: nfNumGeneric,
    fornecedorHint: '',
    tipo: tipoGeneric,
    ext,
    padrao: 'nao_reconhecido',
  };
}

// ── Centro de custo: ajusta PR.centro_custo a partir do TeamMember (equipe) ou Rubrica (fornecedor)
const CC_EQUIPE_MAP: Record<string, string> = {
  'MUMO': 'MUMO',
  'MIS': 'MIS',
  'MHAB': 'MHAB',
  'Geral/Transversal': 'Geral',
};

const CC_RUBRICA_MUSEU_MAP: Record<string, string> = {
  'MIS': 'MIS',
  'MUMO': 'MUMO',
  'MHAB': 'MHAB',
  'MAB': 'MHAB',
  'GERAL': 'Geral',
  'NOTURNO': 'Noturno nos Museus 2026',
};

const CC_RUBRICA_CC_MAP: Record<string, string> = {
  'MUMO': 'MUMO',
  'MIS BH': 'MIS',
  'MHAB': 'MHAB',
  'Noturno nos Museus': 'Noturno nos Museus 2026',
  'Noturno 2026': 'Noturno 2026',
  'Noturno Pampulha': 'Noturno Pampulha',
  'Publicações': 'Publicações',
  'Geral/Transversal': 'Geral',
};

function rubricaToCentroCusto(r: any): string | null {
  if (!r) return null;
  const mc = String(r.museu_codigo || '').trim();
  if (mc && CC_RUBRICA_MUSEU_MAP[mc]) return CC_RUBRICA_MUSEU_MAP[mc];
  const cc = String(r.centro_custo || '').trim();
  if (cc && CC_RUBRICA_CC_MAP[cc]) return CC_RUBRICA_CC_MAP[cc];
  return null;
}

async function resolverCentroCustoAlvo(
  base44: any,
  pr: any,
  teamMember: any,
  rubricaCache: Map<string, any>,
): Promise<string | null> {
  if (isEquipe(pr) && teamMember) {
    const mv = String(teamMember.museu_vinculado || '').trim();
    return CC_EQUIPE_MAP[mv] || null;
  }
  const rubricaId = String(pr?.rubrica_id || '').trim();
  if (!rubricaId) return null;
  if (rubricaCache.has(rubricaId)) {
    return rubricaToCentroCusto(rubricaCache.get(rubricaId));
  }
  let r: any = null;
  try {
    r = await base44.asServiceRole.entities.Rubrica.get(rubricaId);
  } catch {
    r = null;
  }
  rubricaCache.set(rubricaId, r);
  return rubricaToCentroCusto(r);
}

// ── Processar pasta (flat ou com subpastas) ───────────────────────────────────

async function processarPasta(
  base44: any,
  token: string,
  folderId: string,
  dryRun: boolean,
  stats: any,
  logs: any[],
  prCache: Map<string, any>,
  tmCache: Map<string, any>,
  rubricaCache: Map<string, any>,
) {
  const items = await listAllInFolder(token, folderId);

  // Set de nomes existentes na pasta para verificação de duplicidade
  const nomesExistentes = new Set(items.map((i) => i.name));

  for (const item of items) {
    // Recursivo para subpastas
    if (item.mimeType === FOLDER_MIME) {
      await processarPasta(base44, token, item.id, dryRun, stats, logs, prCache, tmCache, rubricaCache);
      continue;
    }

    const nome = item.name;

    // Re-rename sempre que necessário (remove nomes legados não-canônicos,
    // incluindo nomes antigos que ainda continham user_name como "DANIEL PERINI").
    // A verificação final novoNome === nome decide se há renomeio a fazer.

    const parsed = classificarArquivo(nome);

    // Sem número de NF extraído → sem_vinculo, não renomeia
    if (!parsed.nfNum) {
      stats.sem_vinculo++;
      logs.push({ de: nome, para: null, fonte: 'arquivo', status: 'sem_vinculo', padrao: parsed.padrao, erro: 'sem numero de NF' });
      continue;
    }

    // Busca PR no banco
    const pr = await findPR(base44, parsed.nfNum, parsed.fornecedorHint, prCache);

    // Sem PR vinculado → sem_vinculo, não renomeia (mantém arquivo intocado)
    if (!pr) {
      stats.sem_vinculo++;
      logs.push({ de: nome, para: null, fonte: 'arquivo', status: 'sem_vinculo', padrao: parsed.padrao, erro: 'PR nao encontrado' });
      continue;
    }

    // Resolve TeamMember se for equipe
    const teamMember = await resolveTeamMemberForPR(base44, pr, tmCache);

    // Ajusta centro_custo automaticamente (equipe via TeamMember · fornecedor via Rubrica).
    try {
      const alvoCc = await resolverCentroCustoAlvo(base44, pr, teamMember, rubricaCache);
      if (alvoCc && String(pr.centro_custo || '').trim() !== alvoCc) {
        const anterior = String(pr.centro_custo || '');
        if (!dryRun) {
          try {
            await base44.asServiceRole.entities.PurchaseRequest.update(pr.id, { centro_custo: alvoCc });
            pr.centro_custo = alvoCc;
            stats.centro_custo_ajustado = (stats.centro_custo_ajustado || 0) + 1;
            logs.push({
              de: `centro_custo: ${anterior || '(vazio)'}`,
              para: `centro_custo: ${alvoCc}`,
              pr_id: pr.id,
              nf_numero: parsed.nfNum,
              status: 'centro_ajustado',
              fonte: 'banco',
            });
          } catch (e: any) {
            logs.push({
              de: `centro_custo: ${anterior || '(vazio)'}`,
              para: `centro_custo: ${alvoCc}`,
              pr_id: pr.id,
              status: 'erro_centro',
              erro: e?.message || String(e),
            });
            stats.erros = (stats.erros || 0) + 1;
          }
        } else {
          stats.centro_custo_simulado = (stats.centro_custo_simulado || 0) + 1;
          logs.push({
            de: `centro_custo: ${anterior || '(vazio)'}`,
            para: `centro_custo: ${alvoCc}`,
            pr_id: pr.id,
            nf_numero: parsed.nfNum,
            status: 'simulado',
            fonte: 'banco',
          });
        }
      }
    } catch {
      // não interrompe renomeação por falha de centro_custo
    }

    // Monta nome canônico
    let novoNome = buildNomeOficial(pr, null, parsed.tipo, teamMember);

    // Garante extensão correta
    if (!novoNome.toLowerCase().endsWith('.' + parsed.ext.toLowerCase())) {
      novoNome = novoNome.replace(/\.[^.]+$/, '') + '.' + parsed.ext;
    }

    // Nome não mudou — já está padronizado
    if (novoNome === nome) {
      stats.ja_padrao++;
      continue;
    }

    // Verificação de duplicidade: se outro arquivo (não o atual) tem o mesmo nome
    const alvoEmUso = nomesExistentes.has(novoNome) && novoNome !== nome;
    if (alvoEmUso) {
      novoNome = ensureUniqueName(novoNome, nomesExistentes);
    }

    // Reserva o novo nome no set para a próxima iteração
    nomesExistentes.add(novoNome);
    if (novoNome !== nome) nomesExistentes.delete(nome);

    const logEntry = {
      de: nome,
      para: novoNome,
      fonte: 'banco' as const,
      status: dryRun ? 'simulado' : 'pendente',
      padrao: parsed.padrao,
    };
    logs.push(logEntry);

    if (!dryRun) {
      try {
        await renameFile(token, item.id, novoNome);
        logEntry.status = 'renomeado';
        stats.renomeados++;
      } catch (e) {
        logEntry.status = 'erro';
        logEntry.erro = e.message;
        stats.erros++;
        // Reverte reserva no set em caso de erro
        nomesExistentes.delete(novoNome);
        if (novoNome !== nome) nomesExistentes.add(nome);
      }
    } else {
      stats.renomeados++;
    }
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Permite tanto chamadas HTTP autenticadas (admin) quanto invocações
    // automáticas (service role) — automações de entidade não trazem user.
    let isServiceCall = false;
    try {
      const user = await base44.auth.me();
      if (!user) isServiceCall = true;
    } catch {
      isServiceCall = true;
    }

    const body = await req.json().catch(() => ({}));
    const dryRun = body.dryRun !== false; // padrão: true (seguro)

    // Aceita tanto chamada direta (purchase_request_id) quanto evento de
    // automação (event.entity_id / data.id).
    const purchaseRequestId: string =
      body.purchase_request_id ||
      body.purchaseId ||
      (body.event && body.event.entity_id) ||
      (body.data && body.data.id) ||
      '';

    // Se um purchase_request_id foi fornecido, escaneia apenas a pasta de backup
    // vinculada a esta PR (deixa a automação de aprovação chamar este handler
    // no padrão oficial). Se o backup ainda não foi concluído, retorna skipped.
    let folderIds: string[] = body.folderIds || ROOT_FOLDERS;
    if (purchaseRequestId) {
      const pr = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseRequestId).catch(() => null);
      if (!pr) {
        return Response.json({ ok: false, error: 'PurchaseRequest não encontrada' }, { status: 404 });
      }
      if (!pr.drive_backup_folder_id || pr.drive_backup_status !== 'concluido') {
        // Backup pendente — syncNotaFiscalDriveBackup usará buildNomeOficial no
        // upload futuro, então não há nada a renomear no Drive ainda.
        return Response.json({
          ok: true,
          skipped: true,
          reason: 'backup_pendente',
          purchase_id: pr.id,
          drive_backup_status: pr.drive_backup_status || null,
        });
      }
      folderIds = [pr.drive_backup_folder_id];
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    const token = accessToken;
    const start = Date.now();

    const stats = {
      renomeados: 0,
      ja_padrao: 0,
      sem_vinculo: 0,
      nao_reconhecido: 0,
      erros: 0,
    };
    const logs: any[] = [];
    const prCache = new Map<string, any>();
    const tmCache = new Map<string, any>();
    const rubricaCache = new Map<string, any>();

    for (const folderId of folderIds) {
      await processarPasta(base44, token, folderId, dryRun, stats, logs, prCache, tmCache, rubricaCache);
    }

    // Se escopado a uma PR, atualiza drive_backup_files com os novos nomes
    if (purchaseRequestId && !dryRun && stats.renomeados > 0) {
      try {
        const pr = await base44.asServiceRole.entities.PurchaseRequest.get(purchaseRequestId);
        if (pr?.drive_backup_files && Array.isArray(pr.drive_backup_files)) {
          const updated = pr.drive_backup_files.map((f: any) => {
            const r = logs.find((l: any) => l.de === f.name && l.para);
            return r ? { ...f, name: r.para } : f;
          });
          await base44.asServiceRole.entities.PurchaseRequest.update(purchaseRequestId, {
            drive_backup_files: updated,
          });
        }
      } catch (updateErr: any) {
        console.warn('[renomearNFsDrive] Falha ao atualizar drive_backup_files:', updateErr?.message);
      }
    }

    return Response.json({
      ok: true,
      dry_run: dryRun,
      scoped_to_pr: !!purchaseRequestId,
      purchase_id: purchaseRequestId || null,
      stats,
      execution_ms: Date.now() - start,
      logs: logs.slice(0, 200),
    });
  } catch (err) {
    console.error(err);
    return Response.json({ ok: false, error: err.message }, { status: 500 });
  }
});