import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

/**
 * Importa os PDFs do Plano de Trabalho para a Base de Conhecimento.
 * Processa cada PDF, extrai o conteúdo e salva no KnowledgeDocument.
 * Restrito a admins.
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || !['admin', 'ADMIN'].includes(user.role)) {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const { file_url, titulo, categoria, versao, descricao } = body;

    if (!file_url || !titulo) {
      return Response.json({ error: 'file_url e titulo são obrigatórios' }, { status: 400 });
    }

    // Extrair conteúdo do PDF via LLM
    const extracted = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `Extraia TODO o conteúdo textual deste documento PDF do Plano de Trabalho do Projeto Museus Centro.
Inclua:
- Todos os quadros de metas com seus campos completos
- Toda a equipe de trabalho (cargos, atribuições, valores, número de meses)
- Toda a previsão de despesas detalhada por meta
- Cronograma de desembolso
- Metodologia de execução por meta
- Dados cadastrais e dados do projeto

Preserve a estrutura hierárquica e numérica (Meta 1, Meta 2, etc.).
Extraia o máximo possível de forma fiel ao documento.`,
      file_urls: [file_url],
    });

    // Salvar no KnowledgeDocument
    const doc = await base44.asServiceRole.entities.KnowledgeDocument.create({
      titulo,
      categoria: categoria || 'Plano de Trabalho',
      versao: versao || 'Jan/2026 — 3º Aditivo',
      descricao: descricao || '3º Termo Aditivo — Projeto Museus Centro — OSC Viaduto das Artes',
      file_url,
      conteudo_extraido: typeof extracted === 'string' ? extracted : JSON.stringify(extracted),
      ativo: true,
      created_by_email: user.email,
    });

    return Response.json({
      success: true,
      doc_id: doc.id,
      titulo: doc.titulo,
      chars: doc.conteudo_extraido?.length || 0,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});