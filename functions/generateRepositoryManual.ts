import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const DEFAULT_REPO = 'danielperini/museus-centro-relat-rio-mensal';
const GITHUB_API = 'https://api.github.com';

function normalizeText(value: unknown) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function chunkText(text: string, maxSize = 3000) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const chunks: string[] = [];
  let i = 0;

  while (i < normalized.length) {
    chunks.push(normalized.slice(i, i + maxSize));
    i += maxSize;
  }

  return chunks;
}

function isRelevantFile(path: string) {
  const lower = path.toLowerCase();

  if (
    lower.includes('node_modules') ||
    lower.includes('.git') ||
    lower.includes('dist') ||
    lower.includes('build')
  ) return false;

  return (
    lower.endsWith('.jsx') ||
    lower.endsWith('.js') ||
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.json') ||
    lower.endsWith('.md')
  );
}

async function githubJson(url: string) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'MuseusCentro' },
  });

  if (!res.ok) throw new Error(`GitHub error ${res.status}`);
  return res.json();
}

async function fetchTree(repo: string, branch: string) {
  const ref = await githubJson(`${GITHUB_API}/repos/${repo}/git/refs/heads/${branch}`);
  const commit = await githubJson(`${GITHUB_API}/repos/${repo}/git/commits/${ref.object.sha}`);
  const tree = await githubJson(`${GITHUB_API}/repos/${repo}/git/trees/${commit.tree.sha}?recursive=1`);
  return tree.tree;
}

async function getRepoFiles(repo: string) {
  try {
    return await fetchTree(repo, 'main');
  } catch {
    return await fetchTree(repo, 'master');
  }
}

async function fetchFile(repo: string, path: string) {
  const url = `https://raw.githubusercontent.com/${repo}/main/${path}`;
  const res = await fetch(url);
  if (!res.ok) return '';
  return await res.text();
}

async function buildDigest(repo: string) {
  const tree = await getRepoFiles(repo);

  const files = tree
    .filter((f: any) => f.type === 'blob' && isRelevantFile(f.path))
    .slice(0, 80);

  const collected = [];

  for (const f of files) {
    try {
      const content = await fetchFile(repo, f.path);
      if (content) {
        collected.push({
          path: f.path,
          content: content.slice(0, 20000),
        });
      }
    } catch {}
  }

  const digest = collected
    .map((f, i) => `
[Arquivo ${i + 1}]
${f.path}

${f.content}
`)
    .join('\n\n');

  return { collected, digest };
}

async function generateManual(base44: any, repo: string, digest: string) {
  return await base44.integrations.Core.InvokeLLM({
    prompt: `
Você é especialista no sistema Museus Centro.

Crie um MANUAL COMPLETO baseado no código abaixo.

OBRIGATÓRIO:
- Explicar TODAS as páginas detectadas
- Explicar fluxo de compras, pagamentos, equipe
- Explicar relatórios e rubricas
- Explicar assistente e base de conhecimento
- Explicar erros e validações
- Explicar uso real do sistema

ESTILO:
- Manual técnico + operacional
- Direto e prático
- Português Brasil

CÓDIGO:
${digest}
`,
    response_json_schema: {
      type: 'object',
      properties: {
        manual: { type: 'string' },
        resumo: { type: 'string' },
      },
    },
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) return Response.json({ error: 'Não autenticado' }, { status: 401 });

    const { repo = DEFAULT_REPO } = await req.json().catch(() => ({}));

    const { collected, digest } = await buildDigest(repo);

    if (!digest) {
      return Response.json({ error: 'Falha ao ler repositório' }, { status: 500 });
    }

    const ai = await generateManual(base44, repo, digest);

    const manual = normalizeText(ai.manual || '');
    const resumo = normalizeText(ai.resumo || '');

    if (!manual) {
      return Response.json({ error: 'IA não gerou manual' }, { status: 500 });
    }

    const doc = await base44.asServiceRole.entities.KnowledgeDocument.create({
      titulo: `Manual do Sistema`,
      categoria: 'Manual',
      conteudo_extraido: manual,
      resumo_ia: resumo,
      tags: 'manual,sistema,operacao',
      ativo: true,
      processado_por_ia: true,
      file_url: `https://github.com/${repo}`,
    });

    const chunks = chunkText(manual);

    for (let i = 0; i < chunks.length; i++) {
      await base44.asServiceRole.entities.KnowledgeChunk.create({
        knowledge_document_id: doc.id,
        chunk_index: i,
        texto_chunk: chunks[i],
        categoria: 'Manual',
      });
    }

    return Response.json({
      success: true,
      arquivos: collected.length,
      chunks: chunks.length,
    });

  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});
