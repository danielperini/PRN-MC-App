// Exportações locais: recebem exatamente a lista já filtrada pela tela.
// Dados de fornecedores nunca são interpretados como fórmulas no Excel.
const safeCell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
};

const safeName = (value) => String(value || 'exportacao')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, '') || 'exportacao';

const valueFor = (row, column) => safeCell(typeof column.value === 'function' ? column.value(row) : row?.[column.key]);

export async function exportFilteredXlsx({ rows, columns, fileName, sheetName = 'Dados' }) {
  const XLSX = await import('xlsx');
  const matrix = [
    columns.map((column) => column.label),
    ...rows.map((row) => columns.map((column) => valueFor(row, column))),
  ];
  const worksheet = XLSX.utils.aoa_to_sheet(matrix);
  worksheet['!cols'] = columns.map((column) => ({ wch: Math.min(Math.max(column.label.length + 2, column.width || 16), 48) }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, `${safeName(fileName)}.xlsx`);
}

export async function exportFilteredPdf({ title, filtersLabel = '', rows, columns, fileName }) {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 14;
  const lineHeight = 4.6;
  let y = margin;
  const newPage = () => { doc.addPage(); y = margin; };
  const ensure = (height) => { if (y + height > 282) newPage(); };

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(title, margin, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Gerado em ${new Date().toLocaleString('pt-BR')} · ${rows.length} registro(s)`, margin, y);
  y += 5;
  if (filtersLabel) {
    const filterLines = doc.splitTextToSize(`Filtros: ${filtersLabel}`, 182);
    ensure(filterLines.length * lineHeight + 4);
    doc.text(filterLines, margin, y);
    y += filterLines.length * lineHeight + 3;
  }
  doc.setDrawColor(200);
  doc.line(margin, y, 196, y);
  y += 5;

  rows.forEach((row, index) => {
    const fields = columns.map((column) => ({ label: column.label, value: valueFor(row, column) })).filter((field) => field.value);
    const height = fields.reduce((total, field) => total + Math.max(1, doc.splitTextToSize(`${field.label}: ${field.value}`, 180).length) * lineHeight, lineHeight + 2);
    ensure(height + 4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.text(`${index + 1}.`, margin, y);
    y += lineHeight;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.2);
    fields.forEach((field) => {
      const lines = doc.splitTextToSize(`${field.label}: ${field.value}`, 180);
      doc.text(lines, margin + 5, y);
      y += lines.length * lineHeight;
    });
    y += 2;
  });
  doc.save(`${safeName(fileName)}.pdf`);
}
