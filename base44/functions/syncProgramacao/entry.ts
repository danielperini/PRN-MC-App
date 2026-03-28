import { base44 } from "base44";
import * as XLSX from "xlsx";

function normalize(str: any) {
  return String(str || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function parseExcelDate(value: any): string | null {
  if (!value) return null;

  // Excel serial
  if (typeof value === "number") {
    const date = XLSX.SSF.parse_date_code(value);
    if (!date) return null;

    const d = new Date(date.y, date.m - 1, date.d);
    return d.toISOString();
  }

  // DD/MM/YYYY
  if (typeof value === "string") {
    const parts = value.split("/");
    if (parts.length === 3) {
      const [d, m, y] = parts.map(Number);
      const date = new Date(y, m - 1, d);
      if (!isNaN(date.getTime())) {
        return date.toISOString();
      }
    }

    // fallback ISO
    const date = new Date(value);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
}

function mapHeaders(headers: string[]) {
  const map: Record<string, number> = {};

  headers.forEach((h, i) => {
    const n = normalize(h);

    if (["data", "data inicio", "data_inicial"].includes(n)) map.data = i;
    if (["titulo", "nome", "atividade"].includes(n)) map.titulo = i;
    if (["museu"].includes(n)) map.museu = i;
    if (["horario", "hora"].includes(n)) map.horario = i;
    if (["local"].includes(n)) map.local = i;
    if (["sinopse", "descricao"].includes(n)) map.sinopse = i;
  });

  return map;
}

export default async function handler(req: any, res: any) {
  const debug_sheets: any[] = [];
  const errors: any[] = [];

  try {
    const url = process.env.PROGRAMACAO_SHEET_URL;

    if (!url) {
      throw new Error("PROGRAMACAO_SHEET_URL não configurada");
    }

    const response = await fetch(url);
    const buffer = await response.arrayBuffer();

    const workbook = XLSX.read(buffer, { type: "buffer" });

    let total_items = 0;
    let created = 0;
    let deleted_previous = 0;

    // 🔥 delete seguro: só origem desta função
    const antigos = await base44.entities.Programacao.filter({
      origem: "syncProgramacao",
    });

    const antigosList = Array.isArray(antigos)
      ? antigos
      : antigos?.items || [];

    for (const item of antigosList) {
      await base44.entities.Programacao.delete(item.id);
      deleted_previous++;
    }

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (!rows.length) continue;

      const headers = rows[0];
      const map = mapHeaders(headers);

      debug_sheets.push({
        sheet: sheetName,
        headers,
        mapped: map,
      });

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        try {
          const titulo = row[map.titulo] || "Sem título";
          const dataRaw = row[map.data];
          const data_inicio = parseExcelDate(dataRaw);

          if (!data_inicio) continue;

          const item = {
            titulo,
            nome: titulo,
            data_inicio,
            data: dataRaw,
            museu: row[map.museu] || "",
            horario: row[map.horario] || "",
            local: row[map.local] || "",
            sinopse: row[map.sinopse] || "",
            origem: "syncProgramacao",
          };

          await base44.entities.Programacao.create(item);

          created++;
          total_items++;
        } catch (e: any) {
          errors.push({
            row: i,
            error: e?.message,
          });
        }
      }
    }

    return res.status(200).json({
      ok: true,
      total_items,
      created,
      deleted_previous,
      errors,
      debug_sheets,
    });
  } catch (error: any) {
    console.error("Erro syncProgramacao:", error);

    return res.status(500).json({
      ok: false,
      error: error?.message,
      debug_sheets,
      errors,
    });
  }
}
