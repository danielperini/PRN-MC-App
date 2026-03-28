import { base44 } from "base44";

export default async function handler(req: any, res: any) {
  try {
    const startedAt = new Date();

    // busca documentos ordenados por data de criação
    const raw = await base44.entities.KnowledgeDocument.list(
      "-created_date",
      500
    );

    const items = Array.isArray(raw)
      ? raw
      : Array.isArray(raw?.data)
      ? raw.data
      : Array.isArray(raw?.items)
      ? raw.items
      : [];

    const normalized = items.map((doc: any) => ({
      id: doc.id,
      title: doc.title || doc.titulo || doc.name || doc.file_name || "Sem título",
      file_name: doc.file_name || doc.filename || "",
      mime_type: doc.mime_type || "",
      categoria: doc.categoria || "Sem categoria",
      ativo: doc.ativo ?? doc.active ?? true,
      created_date: doc.created_date,
      updated_date: doc.updated_date,
      extracted_text:
        doc.extracted_text ||
        doc.conteudo_extraido ||
        doc.description ||
        "",
    }));

    const active_count = normalized.filter((d) => d.ativo).length;

    return res.status(200).json({
      ok: true,
      total: normalized.length,
      active_count,
      items: normalized,
      debug: {
        source: "KnowledgeDocument",
        fetched: items.length,
        returned: normalized.length,
        started_at: startedAt.toISOString(),
        finished_at: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error("Erro em listKnowledgeDocuments:", error);

    return res.status(500).json({
      ok: false,
      error: error?.message || "Erro ao listar documentos.",
    });
  }
}
