import * as XLSX from "xlsx";

export default async function handler(context: any) {
  const { entities } = context;

  let total_items = 0;
  let created = 0;
  let deleted_previous = 0;
  let errors: any[] = [];
  let debug_sheets: any[] = [];

  try {
    // 1. Buscar documento mais recente
    const docs = await entities.KnowledgeDocument.list({
      filter: { categoria: "Programação" },
      sort: { created_at: -1 },
      limit: 1,
    });

    if (!docs.data.length) {
      return { ok: false, error: "Nenhum documento encontrado" };
    }

    const doc = docs.data[0];

    // 2. Baixar arquivo
    const response = await fetch(doc.file_url);
    const buffer = await response.arrayBuffer();

    // 3. Ler XLSX
    const workbook = XLSX.read(buffer, { type: "array" });

    const allItems: any[] = [];

    // 4. Percorrer abas
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      let headerIndex = -1;
      let headers: string[] = [];

      // detectar header
      for (let i = 0; i < json.length; i++) {
        const row = json[i] as any[];

        const normalized = row.map((c) =>
          String(c || "").toLowerCase()
        );

        if (
          normalized.some((c) => c.includes("data")) &&
          normalized.some((c) => c.includes("atividade") || c.includes("evento"))
        ) {
          headerIndex = i;
          headers = normalized;
          break;
        }
      }

      if (headerIndex === -1) {
        debug_sheets.push({ sheetName, status: "no_header" });
        continue;
      }

      let count = 0;

      for (let i = headerIndex + 1; i < json.length; i++) {
        const row = json[i] as any[];

        if (!row || row.length === 0) continue;

        const obj: any = {};

        headers.forEach((h, idx) => {
          obj[h] = row[idx];
        });

        const rawDate = obj["data"] || obj["dia"];
        const titulo = obj["atividade"] || obj["evento"];

        if (!rawDate || !titulo) continue;

        let date: Date;

        try {
          date = new Date(rawDate);
          if (isNaN(date.getTime())) throw new Error();
        } catch {
          errors.push({ row, error: "invalid_date" });
          continue;
        }

        allItems.push({
          data: date.toISOString(),
          titulo: String(titulo),
          descricao: String(obj["descricao"] || ""),
          local: String(obj["local"] || ""),
        });

        count++;
      }

      debug_sheets.push({ sheetName, rows: count });
    }

    // 6. Deduplicar
    const map = new Map();

    for (const item of allItems) {
      const key = `${item.data}-${item.titulo}`;
      map.set(key, item);
    }

    const uniqueItems = Array.from(map.values());
    total_items = uniqueItems.length;

    // 7. Escolher entity
    const targetEntity =
      entities.Programacao || entities.Activity;

    // 8. Deletar anteriores
    const existing = await targetEntity.list({ limit: 10000 });

    for (const item of existing.data) {
      await targetEntity.delete(item.id);
      deleted_previous++;
    }

    // 9. Inserir novos
    for (const item of uniqueItems) {
      await targetEntity.create(item);
      created++;
    }

    return {
      ok: true,
      total_items,
      created,
      deleted_previous,
      errors,
      debug_sheets,
    };
  } catch (error: any) {
    return {
      ok: false,
      error: error.message,
      errors,
    };
  }
}
