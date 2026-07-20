// Timbre oficial do Viaduto das Artes desenhado com primitivas jsPDF (offline)
// Retângulo preto à esquerda com "VIA / DU / TO / DAS ARTES" + dados institucionais à direita

const TIMBRE_DADOS = [
  'Viaduto das Artes',
  'Fundado em 16 de junho de 2015',
  'Av. Olinto Meireles, 45 – Barreiro – BH/MG',
  'CEP 30640-010',
];

/**
 * Desenha o timbre do Viaduto das Artes no topo da página.
 * @param {jsPDF} doc
 * @param {number} pageW - largura da página em mm
 * @param {number} margin - margem lateral em mm
 * @returns {number} altura ocupada pelo timbre (mm) — conteúdo deve começar após este valor
 */
export function drawTimbreViaduto(doc, pageW, margin) {
  const retW = 20;   // largura do retângulo preto
  const retH = 30;   // altura do retângulo preto
  const rectX = margin;
  const rectY = 8;    // topo com pequena margem

  // Retângulo preto
  doc.setFillColor(10, 10, 10);
  doc.rect(rectX, rectY, retW, retH, 'F');

  // Texto branco no retângulo — "VIA / DU / TO / DAS ARTES" centralizado
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  const linhas = ['VIA', 'DU', 'TO', 'DAS ARTES'];
  const cx = rectX + retW / 2;
  let ty = rectY + 7;
  linhas.forEach((linha) => {
    doc.text(linha, cx, ty, { align: 'center' });
    ty += 5;
  });

  // Dados institucionais à direita do retângulo
  const textX = rectX + retW + 4;
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(TIMBRE_DADOS[0], textX, rectY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(90, 90, 90);
  TIMBRE_DADOS.slice(1).forEach((linha, i) => {
    doc.text(linha, textX, rectY + 11 + i * 4);
  });

  // Linha horizontal separadora
  const sepY = rectY + retH + 2;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(margin, sepY, pageW - margin, sepY);

  // Retorna altura total ocupada (topo + retângulo + linha)
  return sepY + 2 - 0; // conteúdo começa após a linha separadora
}

export { TIMBRE_DADOS };