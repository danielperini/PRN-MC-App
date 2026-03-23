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

function chunkText(text: string, maxSize = 3500) {
  const normalized = normalizeText(text);
  if (!normalized) return [];

  const paragraphs = normalized.split('\n\n');
  const chunks: string[] = [];
  let current = '';

  for (const paragraph of paragraphs) {
    const next = current ? `${current}\n\n${paragraph}` : paragraph;

    if (next.length <= maxSize) {
      current = next;
      continue;
    }

    if (current) chunks.push(current);

    if (paragraph.length <= maxSize) {
      current = paragraph;
      continue;
    }

    let rest = paragraph;
    while (rest.length > maxSize) {
      chunks.push(rest.slice(0, maxSize));
      rest = rest.slice(maxSize);
    }
    current = rest;
  }

  if (current) chunks.push(current);
  return chunks;
}

function isRelevantFile(path: string) {
  const lower = path.toLowerCase();

  if (
    lower.includes('node_modules/') ||
    lower.includes('.git/') ||
    lower.includes('dist/') ||
    lower.includes('build/') ||
    lower.includes('coverage/') ||
    lower.includes('.next/') ||
    lower.includes('package-lock.json') ||
    lower.includes('pnpm-lock.yaml') ||
    lower.includes('yarn.lock')
  ) {
    return false;
  }

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
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'MuseusCentro-Base44',
    },
  });

  if (!res.ok) {
    throw new Error(`GitHub API ${res.status} em ${url}`);
  }

  return await res.json();
}

async function fetchRepoTree(repo: string, branch = 'main') {
  const refData = await githubJson(`${GITHUB_API}/repos/${repo}/git/refs/heads/${branch}`);
  const treeSha = refData?.object?.sha;

  if (!treeSha) {
    throw new Error('Não foi possível obter o SHA da branch');
  }

  const commitData = await githubJson(`${GITHUB_API}/repos/${repo}/git/commits/${treeSha}`);
  const rootTreeSha = commitData?.tree?.sha;

  if (!rootTreeSha) {
    throw new Error('Não foi possível obter a árvore do repositório');
  }

  const treeData = await githubJson(
    `${GITHUB_API}/repos/${repo}/git/trees/${rootTreeSha}?recursive=1`
  );

  return Array.isArray(treeData?.tree) ? treeData.tree : [];
}

async function fetchFileContent(repo: string, path: string, branch = 'main') {
  const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${path}`;
  const res = await fetch(rawUrl);

  if (!res.ok) {
    throw new Error(`Falha ao baixar ${path}: ${res.status}`);
  }

  return await res.text();
}

function rankPaths(paths: string[]) {
  const priorityTerms = [
    'src/pages/',
    'src/components/',
    'functions/',
    'layout',
    'auth',
    'compras',
    'reports',
    'rubricas',
    'baseconhecimento',
    'assistente',
    'plataforma',
    'pages.config',
    'readme',
  ];

  return [...paths].sort((a, b) => {
    const score = (path: string) =>
      priorityTerms.reduce((acc, term, idx) => {
        if (path.toLowerCase().includes(term.toLowerCase())) {
          return acc + (priorityTerms.length - idx) * 10;
        }
        return acc;
      }, 0);

    return score(b) - score(a);
  });
}

async function buildRepositoryDigest(repo: string, branch = 'main', maxFiles = 35) {
  const tree = await fetchRepoTree(repo, branch);

  const relevantPaths = rankPaths(
    tree
      .filter((item: any) => item?.type === 'blob' && isRelevantFile(item?.path || ''))
      .map((item: any) => item.path)
  ).slice(0, maxFiles);

  const collected: Array<{ path: string; content: string }> = [];

  for (const path of relevantPaths) {
    try {
      const content = await fetchFileContent(repo, path, branch);
      collected.push({
        path,
        content: content.slice(0, 18000),
      });
    } catch (error) {
      console.error(`Erro ao ler ${path}:`, error);
    }
  }

  const digest = collected
    .map(
      (file, index) => `
[Arquivo ${index + 1}]
Caminho: ${file.path}

Conteúdo:
${file.content}
`.trim()
    )
    .join('\n\n------------------------------\n\n');

  return {
    files: collected,
    digest,
  };
}

async function generateManualWithLLM(base44: any, repo: string, digest: string) {
  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `
Você é um analista técnico do sistema Museus Centro.

Sua tarefa é ler a amostra do repositório abaixo e gerar um MANUAL DE INSTRUÇÕES COMPLETO em português do Brasil.

Objetivos do manual:
1. Explicar o sistema de forma operacional.
2. Explicar página por página e módulo por módulo.
3. Explicar fluxos de relatório, compras, pagamentos, equipe, rubricas, documentos, biblioteca de conhecimento e assistente.
4. Explicar como o usuário deve operar o sistema.
5. Explicar regras, bloqueios e validações observadas no código.
6. Ser útil tanto para profissionais quanto para coordenação.

Regras:
- Baseie-se SOMENTE no conteúdo fornecido.
- Não invente páginas ou funções que não apareçam no repositório analisado.
- Escreva em português do Brasil.
- Organize com títulos, subtítulos e linguagem objetiva.
- Gere também um resumo executivo curto.

Repositório analisado: ${repo}

AMOSTRA DO REPOSITÓRIO:
${digest}
`,
    response_json_schema: {
      type: 'object',
      properties: {
        resumo: { type: 'string' },
        manual_completo: { type: 'string' },
        modulos_identificados: {
          type: 'array',
          items: { type: 'string' },
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  });

  return {
    resumo: normalizeText(result?.resumo || ''),
    manual: normalizeText(result?.manual_completo || ''),
    modulos: Array.isArray(result?.modulos_identificados)
      ? result.modulos_identificados
      : [],
    tags: Array.isArray(result?.tags) ? result.tags : [],
  };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Não autenticado' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const repo = String(body?.repo || DEFAULT_REPO).trim();
    const branch = String(body?.branch || 'main').trim() || 'main';

    const digestData = await buildRepositoryDigest(repo, branch, 35);

    if (!digestData.files.length) {
      return Response.json(
        { error: 'Nenhum arquivo relevante foi lido do repositório.' },
        { status: 422 }
      );
    }

    const llm = await generateManualWithLLM(base44, repo, digestData.digest);

    if (!llm.manual) {
      return Response.json(
        { error: 'A IA não conseguiu gerar o manual do repositório.' },
        { status: 422 }
      );
    }

    const tags = Array.from(
      new Set([
        'manual',
        'repositorio',
        'github',
        'instrucoes',
        ...llm.modulos,
        ...llm.tags,
      ])
    );

    const doc = await base44.asServiceRole.entities.KnowledgeDocument.create({
      titulo: `Manual do Repositório — ${repo}`,
      descricao: `Manual técnico e operacional gerado por IA a partir do repositório ${repo}`,
      categoria: 'Manual',
      conteudo_extraido: llm.manual,
      resumo_ia: llm.resumo,
      tags: tags.join(', '),
      tipo_arquivo: 'repositorio',
      ativo: true,
      processado_por_ia: true,
      status_processamento: 'processado',
      created_by_email: user.email || '',
      file_url: `https://github.com/${repo}`,
      file_name: `${repo.replace('/', '_')}_manual.md`,
    });

    const chunks = chunkText(llm.manual, 3500);

    for (let i = 0; i < chunks.length; i++) {
      try {
        await base44.asServiceRole.entities.KnowledgeChunk.create({
          knowledge_document_id: doc.id,
          chunk_index: i + 1,
          titulo: `Manual do Repositório — trecho ${i + 1}`,
          texto_chunk: chunks[i],
          categoria: 'Manual',
          tags: tags.join(', '),
          ativo: true,
          document_title: doc.titulo,
        });
      } catch (chunkError) {
        console.error(`Erro ao criar chunk ${i + 1}:`, chunkError);
      }
    }

    return Response.json({
      success: true,
      document: doc,
      arquivos_lidos: digestData.files.length,
      chunks: chunks.length,
      repo,
      branch,
    });
  } catch (error: any) {
    console.error('generateRepositoryManual error:', error);
    return Response.json(
      { error: error?.message || 'Erro ao gerar manual do repositório' },
      { status: 500 }
    );
  }
});
