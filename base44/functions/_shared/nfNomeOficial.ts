/**
 * nfNomeOficial.ts
 *
 * Fonte de verdade única para nomenclatura canônica de arquivos de
 * Notas Fiscais (NF/XML/Comprovante) no projeto Museus Centro.
 *
 * Padrão oficial:
 *   {prefixo} {num} {descricao} - {NomeExibicao} - MUSEUS CENTRO - R$ {valor}.{ext}
 *
 * Onde:
 *   - prefixo: "NF" | "XML" | "COMP NF"
 *   - NomeExibicao (equipe/pessoal): "{empresa_nome || PESSOA FISICA} - {user_name} - {funcao}"
 *   - NomeExibicao (fornecedor): "{fornecedor_nome || nf_emitente_nome}"
 *
 * Usado por:
 *   - syncNotaFiscalDriveBackup (novos backups já sobem com nome correto)
 *   - renomearNFsDrive (migração de arquivos legados)
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

export function sanitize(v: unknown, max = 60): string {
  return String(v || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, max)
    .trim();
}

export function parseValor(v: unknown): number {
  const s = String(v || '').replace(/\s/g, '');
  if (!s) return 0;
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s.replace(',', '.')) || 0;
}

export function formatValor(v: unknown): string {
  return parseValor(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Detecção de equipe/pessoal ─────────────────────────────────────────────────

const EQUIPE_KEYWORDS = [
  'equipe',
  'coordenação',
  'coordenacao',
  'pessoal',
  'serviços (equipe',
  'servicos (equipe',
  'serviços (equipe/coordenação)',
];

export function isEquipe(pr: any): boolean {
  if (!pr) return false;
  const cat = String(pr.categoria || '').toLowerCase();
  return EQUIPE_KEYWORDS.some((k) => cat.includes(k));
}

/**
 * Resolve o TeamMember vinculado à PurchaseRequest quando esta for
 * classificada como equipe/pessoal. Retorna null caso não seja equipe
 * ou não haja TeamMember correspondente.
 *
 * Cache opcional (Map<prId, TeamMember|null>) para evitar consultas
 * repetidas durante migrações em lote.
 */
export async function resolveTeamMemberForPR(
  base44: any,
  pr: any,
  cache?: Map<string, any>,
): Promise<any | null> {
  if (!pr || !isEquipe(pr)) return null;
  const prId = String(pr.id || '');
  if (cache && prId && cache.has(prId)) return cache.get(prId) || null;

  let userEmail = String(pr.user_email || pr.solicitante_email || '').trim();
  if (!userEmail && pr.created_by_id) {
    try {
      const user = await base44.asServiceRole.entities.User.get(pr.created_by_id);
      userEmail = String(user?.email || '').trim();
    } catch {
      /* ignore */
    }
  }

  let result: any = null;
  if (userEmail) {
    try {
      const list = await base44.asServiceRole.entities.TeamMember.filter(
        { user_email: userEmail },
        '-updated_date',
        5,
      );
      result = Array.isArray(list) && list.length ? list[0] : null;
    } catch {
      result = null;
    }
  }

  if (cache && prId) cache.set(prId, result);
  return result;
}

// ── Construção do nome canônico ───────────────────────────────────────────────

export type TipoNFArquivo = 'NF' | 'XML' | 'COMP NF';

/**
 * Monta o nome oficial canônico do arquivo.
 *
 * @param pr          PurchaseRequest (opcional — usado como fonte primária)
 * @param intake      DocumentIntake associado (opcional — fallback de campos)
 * @param tipo        'NF' | 'XML' | 'COMP NF'
 * @param teamMember  TeamMember resolvido (para regime de equipe/pessoal)
 */
export function buildNomeOficial(
  pr: any,
  intake: any,
  tipo: TipoNFArquivo,
  teamMember: any | null = null,
): string {
  const ext = tipo === 'XML' ? 'xml' : 'pdf';
  const prefixo: string = tipo === 'XML' ? 'XML' : tipo === 'COMP NF' ? 'COMP NF' : 'NF';

  // Número (sem zeros à esquerda excessivos)
  const numRaw = sanitize(
    pr?.nf_numero || intake?.nf_numero || pr?.id?.substring(0, 8) || 'SN',
    10,
  );
  const num = numRaw === 'SN' ? 'SN' : numRaw.replace(/^0+(\d)/, '$1');

  // Descrição/natureza curta (máx 30 chars, sem acentos)
  const descricao = sanitize(
    pr?.rubrica_nome || pr?.categoria || pr?.natureza_despesa || intake?.rubrica_nome_sugerida || 'Despesa',
    30,
  );

  // Nome de exibição (regra equipe vs fornecedor)
  let nomeExibicao: string;
  if (isEquipe(pr) && teamMember) {
    const empresa = sanitize(teamMember.empresa_nome || 'PESSOA FISICA', 60);
    const userName = sanitize(teamMember.user_name || '', 60);
    const funcao = sanitize(teamMember.funcao || teamMember.role || '', 40);
    nomeExibicao = [empresa, userName, funcao].filter(Boolean).join(' - ');
  } else {
    nomeExibicao = sanitize(
      pr?.fornecedor_nome ||
        pr?.nf_emitente_nome ||
        intake?.fornecedor_nome ||
        intake?.nf_emitente_nome ||
        'FORNECEDOR',
      60,
    );
  }

  const valor = formatValor(
    pr?.valor_pago ||
      pr?.valor_aprovado_admin ||
      pr?.nf_valor_total ||
      pr?.valor_solicitado ||
      intake?.nf_valor_total ||
      0,
  );

  return `${prefixo} ${num} ${descricao} - ${nomeExibicao} - MUSEUS CENTRO - R$ ${valor}.${ext}`;
}

// ── Parsers de padrões legados ─────────────────────────────────────────────────

/**
 * Detecta padrão máquina: "2026-07__FORNECEDOR__NF-12__nf-pdf__sol-abc.pdf"
 */
export function isMachineName(nome: string): boolean {
  return /^\d{4}-\d{2}__/.test(nome);
}

export function parseMachineName(
  nome: string,
): { nfNum: string; fornecedor: string; tipo: TipoNFArquivo; ext: string } | null {
  if (!isMachineName(nome)) return null;
  const ext = nome.toLowerCase().endsWith('.xml') ? 'xml' : 'pdf';
  const tipo: TipoNFArquivo = nome.includes('__xml__')
    ? 'XML'
    : nome.includes('__comp')
      ? 'COMP NF'
      : 'NF';
  const nfMatch = nome.match(/NF-?(\d+)/i);
  const nfNum = nfMatch ? nfMatch[1] : '';
  const partes = nome.replace(/\.[^.]+$/, '').split('__');
  const rawFornecedor = partes[1] || '';
  const fornecedor = rawFornecedor.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return { nfNum, fornecedor, tipo, ext };
}

/**
 * Detecta padrão legível legado: "NF 03 Producao - FORNECEDOR - R$ 4.200,00.pdf"
 * Também aceita XML/COMP no lugar de NF.
 */
export function parseLegacyName(
  nome: string,
): { nfNum: string; fornecedorHint: string; tipo: TipoNFArquivo; ext: string } | null {
  const m = nome.match(/^(NF|XML|COMP)\s+(\d+)\s+[-–]?\s*(.+?)\s+-\s+R\$/i);
  if (!m) return null;
  const prefix = m[1].toUpperCase();
  const tipo: TipoNFArquivo = prefix === 'XML' ? 'XML' : prefix === 'COMP' ? 'COMP NF' : 'NF';
  const nfNum = m[2];
  const rest = m[3];
  // O rest pode conter "Producao - FORNECEDOR" — split no último " - "
  const parts = rest.split(/\s+-\s+/);
  const fornecedorHint = parts[parts.length - 1] || parts[0] || '';
  const ext = nome.toLowerCase().endsWith('.xml') ? 'xml' : 'pdf';
  return { nfNum, fornecedorHint, tipo, ext };
}

/**
 * Tenta extrair número de NF de um arquivo não reconhecido via regex genérico.
 */
export function extractNfNumGeneric(nome: string): string {
  const m = nome.match(/NF-?(\d+)/i);
  return m ? m[1] : '';
}

/**
 * Verifica se um nome já está no padrão oficial (não precisa renomear).
 */
export function isNomeOficial(nome: string): boolean {
  return /^(NF|XML|COMP NF)\s+\d+\s+.+\s+-\s+.+\s+-\s+MUSEUS CENTRO\s+-\s+R\$\s+[\d.,]+\.(pdf|xml)$/i.test(nome);
}

/**
 * Garante unicidade do nome dentro da pasta. Se já existir arquivo com o
 * mesmo nome, acrescenta sufixo " (2)", " (3)" etc. antes da extensão.
 *
 * @param nomeDesejado  Nome alvo
 * @param nomesExistentes  Set de nomes já presentes na pasta (pós-renomeações feitas)
 */
export function ensureUniqueName(nomeDesejado: string, nomesExistentes: Set<string>): string {
  if (!nomesExistentes.has(nomeDesejado)) return nomeDesejado;
  const pontoExt = nomeDesejado.lastIndexOf('.');
  const base = pontoExt > 0 ? nomeDesejado.substring(0, pontoExt) : nomeDesejado;
  const ext = pontoExt > 0 ? nomeDesejado.substring(pontoExt) : '';
  let i = 2;
  let candidato = `${base} (${i})${ext}`;
  while (nomesExistentes.has(candidato)) {
    i++;
    candidato = `${base} (${i})${ext}`;
  }
  return candidato;
}