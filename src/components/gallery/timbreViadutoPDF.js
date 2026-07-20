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
export function drawTimbreViaduto(doc, pageW, margin, dark = false) {
  const retW = 20;   // largura do retângulo preto
  const retH = 30;   // altura do retângulo preto
  const rectX = margin;
  const rectY = 8;    // topo com pequena margem

  // Cores conforme tema
  const rectFill = dark ? [240, 240, 240] : [10, 10, 10];
  const rectText = dark ? [20, 20, 20] : [255, 255, 255];
  const instTitle = dark ? [255, 255, 255] : [40, 40, 40];
  const instBody = dark ? [200, 200, 200] : [90, 90, 90];
  const sepColor = dark ? [120, 120, 120] : [180, 180, 180];

  // Retângulo (preto no tema claro, branco no tema escuro)
  doc.setFillColor(...rectFill);
  doc.rect(rectX, rectY, retW, retH, 'F');

  // Texto no retângulo — "VIA / DU / TO / DAS ARTES" centralizado
  doc.setTextColor(...rectText);
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
  doc.setTextColor(...instTitle);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text(TIMBRE_DADOS[0], textX, rectY + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(...instBody);
  TIMBRE_DADOS.slice(1).forEach((linha, i) => {
    doc.text(linha, textX, rectY + 11 + i * 4);
  });

  // Linha horizontal separadora
  const sepY = rectY + retH + 2;
  doc.setDrawColor(...sepColor);
  doc.setLineWidth(0.3);
  doc.line(margin, sepY, pageW - margin, sepY);

  // Retorna altura total ocupada (topo + retângulo + linha)
  return sepY + 2; // conteúdo começa após a linha separadora
}

export { TIMBRE_DADOS };