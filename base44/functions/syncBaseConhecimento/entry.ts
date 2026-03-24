function normalizeSheet(sheetName: string, matrix: any[][], rowOffset = 0) {
  if (!Array.isArray(matrix) || !matrix.length) return [];

  let items: any[] = [];
  let currentHeaders: string[] = [];

  for (let i = 0; i < matrix.length; i++) {
    const row = matrix[i] || [];

    const isHeader = row.some((cell) =>
      String(cell || '').toLowerCase().includes('data')
    );

    // 🔥 detecta novos blocos (meses)
    if (isHeader) {
      currentHeaders = row.map((h, idx) => normalizeHeader(h, idx));
      continue;
    }

    if (!currentHeaders.length) continue;

    const values: Record<string, any> = {};

    currentHeaders.forEach((header, colIndex) => {
      values[header] = row[colIndex] ?? '';
    });

    const firstText =
      row.find((cell) => String(cell || '').trim() !== '') || '';

    // ignora linhas vazias
    if (!firstText) continue;

    const structured = mapStructuredFields(
      values,
      firstText,
      i + rowOffset,
      sheetName
    );

    items.push({
      row_index: i + rowOffset,
      sheet_name: sheetName,
      first_text: firstText,
      values,
      raw: row,
      ...structured,
    });
  }

  return items;
}
