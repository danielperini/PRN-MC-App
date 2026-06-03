import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { jsPDF } from 'npm:jspdf@4.0.0';

const DADOS_CONTRATANTE_PADRAO = {
  nome: 'OSC Viaduto das Artes',
  cnpj: '16.911.508/0001-81',
  cnpj_nf: '23.843.648/0001-25',
  inscricao_municipal: '0.745.690/001-X',
  endereco: 'Avenida Olinto Meireles, 45, Belo Horizonte, MG, CEP: 30.640-010',
  endereco_nf: 'Av. Olinto Meireles, 45 - Barreiro, Belo Horizonte - MG, 30640-010',
  telefone: '(31) 98802-5140',
  email: 'viadutodasartes@viadutodasartes.org.br',
  representante: 'Leandro Gabriel',
  representante_completo: 'Leandro Gabriel Coelho Pereira',
  cargo: 'Presidente',
};

function formatarData(data) {
  if (!data) return '';
  const d = new Date(data + 'T12:00:00');
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatarValor(valor) {
  const num = parseFloat(valor || 0);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Não autorizado' }, { status: 401 });

    const termo = await req.json();
    const contratante = termo.dados_contratante || DADOS_CONTRATANTE_PADRAO;
    const projeto = termo.projeto_config || {};
    const numTermo = termo.numero_termo || '';

    // ── Configuração do documento ──────────────────────────────────────────
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pW = doc.internal.pageSize.getWidth();   // 210
    const pH = doc.internal.pageSize.getHeight();  // 297
    const mL = 20; // margem esquerda
    const mR = 20; // margem direita
    const textW = pW - mL - mR; // 170
    let y = 20;

    function checkPage(needed = 10) {
      if (y + needed > pH - 20) {
        doc.addPage();
        y = 20;
      }
    }

    function addLine(h = 5) {
      y += h;
      checkPage();
    }

    // Escreve parágrafo justificado com quebra automática
    function para(text, fontSize = 10, bold = false, indent = 0) {
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const x = mL + indent;
      const w = textW - indent;
      const lines = doc.splitTextToSize(text || '', w);
      lines.forEach(line => {
        checkPage(fontSize * 0.4 + 1);
        doc.text(line, x, y);
        y += fontSize * 0.38;
      });
    }

    function hLine(yy) {
      doc.setDrawColor(180);
      doc.setLineWidth(0.3);
      doc.line(mL, yy, pW - mR, yy);
    }

    function hLine2(yy, x1, x2) {
      doc.setDrawColor(180);
      doc.setLineWidth(0.3);
      doc.line(x1, yy, x2, yy);
    }

    // ── TÍTULO ─────────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(`TERMO DE COMPROMISSO DE PRESTAÇÃO DE SERVIÇO ${numTermo}`, pW / 2, y, { align: 'center' });
    y += 10;

    // ── CONTRATANTE (tabela) ───────────────────────────────────────────────
    // Borda da tabela
    const tableTop = y;
    const rowH = 7;
    const rows = [
      [`CONTRATANTE: ${contratante.nome}`],
      [`Endereço: ${contratante.endereco}`],
      [`Contato: ${contratante.telefone}`, `Email: ${contratante.email}`],
      [`CNPJ: ${contratante.cnpj}`],
      [`Representante Legal: ${contratante.representante}`, `Cargo/Função: ${contratante.cargo}`],
    ];

    doc.setDrawColor(100);
    doc.setLineWidth(0.4);

    rows.forEach((cols, i) => {
      doc.rect(mL, y, textW, rowH);
      doc.setFont('helvetica', i === 0 ? 'bold' : 'normal');
      doc.setFontSize(9);
      if (cols.length === 2) {
        doc.text(cols[0], mL + 2, y + 4.8);
        doc.text(cols[1], mL + textW / 2 + 2, y + 4.8);
        // linha vertical divisória
        doc.line(mL + textW / 2, y, mL + textW / 2, y + rowH);
      } else {
        doc.text(cols[0], mL + 2, y + 4.8);
      }
      y += rowH;
    });

    addLine(6);

    // ── CONTRATADO ─────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const contratadoHeader = `CONTRATADO: ${termo.contratado_nome || ''}`;
    let contratadoDetalhe = `CNPJ: ${termo.contratado_cpf_cnpj || ''}`;
    if (termo.contratado_cpf_cnpj && !termo.contratado_cpf_cnpj.includes('/')) {
      contratadoDetalhe = `CPF: ${termo.contratado_cpf_cnpj}`;
    }
    if (termo.contratado_endereco) contratadoDetalhe += `, ${termo.contratado_endereco}`;
    if (termo.contratado_representante) {
      contratadoDetalhe += `, representante legal ${termo.contratado_representante}`;
      if (termo.contratado_cpf_representante) contratadoDetalhe += `, CPF ${termo.contratado_cpf_representante}`;
      contratadoDetalhe += ', mesmo endereço';
    }
    if (termo.contratado_telefone) contratadoDetalhe += `, celular: ${termo.contratado_telefone}`;
    if (termo.contratado_email) contratadoDetalhe += ` e-mail ${termo.contratado_email}`;

    para(contratadoHeader + ', ' + contratadoDetalhe, 10);
    addLine(6);

    // ── 1. OBJETO ──────────────────────────────────────────────────────────
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    checkPage(12);
    doc.text('1', mL, y);
    doc.setFont('helvetica', 'bold');
    doc.text('OBJETO:', mL + 8, y);
    doc.setFont('helvetica', 'normal');
    const objetoText = termo.objeto || '';
    const objetoLines = doc.splitTextToSize(objetoText, textW - 30);
    doc.text(objetoLines[0] || '', mL + 24, y);
    y += 5;
    if (objetoLines.length > 1) {
      objetoLines.slice(1).forEach(l => {
        checkPage(5);
        doc.text(l, mL + 8, y);
        y += 5;
      });
    }

    // ── 2. ESCOPO ──────────────────────────────────────────────────────────
    addLine(4);
    checkPage(12);
    doc.setFont('helvetica', 'bold');
    doc.text('2', mL, y);
    doc.text('ESCOPO:', mL + 8, y);
    doc.setFont('helvetica', 'normal');
    const escopoLines = doc.splitTextToSize(termo.escopo || '', textW - 30);
    if (escopoLines[0]) {
      doc.text(escopoLines[0], mL + 24, y);
      y += 5;
    }
    if (escopoLines.length > 1) {
      escopoLines.slice(1).forEach(l => {
        checkPage(5);
        doc.text(l, mL + 8, y);
        y += 5;
      });
    }

    // 2.1 Vinculação institucional
    addLine(3);
    const vinculacaoText = termo.texto_vinculacao_editavel || projeto.texto_vinculacao || '';
    if (vinculacaoText) {
      para('2.1 ' + vinculacaoText, 10, false, 8);
    }

    // ── 3. PRAZO E LOCAL ───────────────────────────────────────────────────
    addLine(5);
    checkPage(12);
    doc.setFont('helvetica', 'bold');
    doc.text('3', mL, y);
    doc.text('PRAZO E LOCAL DA PRESTAÇÃO:', mL + 8, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    const prazoText = `O serviço será prestado em ${termo.periodo_execucao || 'período a definir'}${termo.museu_local ? `, no ${termo.museu_local}` : ''}. O local da prestação do serviço será no ${termo.museu_local || 'local a definir'}.`;
    para(prazoText, 10, false, 8);

    // ── 4. VALORES ─────────────────────────────────────────────────────────
    addLine(5);
    checkPage(14);
    doc.setFont('helvetica', 'bold');
    doc.text('4', mL, y);
    doc.text('VALORES, PAGAMENTO E RESPONSABILIDADES', mL + 8, y);
    y += 6;

    // 4.1
    let pagamentoText = `Pela prestação do serviço acima definido, o CONTRATANTE pagará ao(à) CONTRATADO(A) a quantia de `;
    pagamentoText += `${formatarValor(termo.valor_total)}`;
    if (termo.detalhamento_valores) pagamentoText += `, sendo ${termo.detalhamento_valores}`;
    pagamentoText += `. O pagamento se dará por meio de ${termo.forma_pagamento || 'PIX, transferência online ou depósito bancário'} em conta de exclusiva titularidade do(a) CONTRATADO(A), conforme dados bancários destacados na Nota Fiscal, mediante a emissão da referida nota fiscal.`;
    para('4.1  ' + pagamentoText, 10, false, 0);

    // Dados bancários em destaque
    if (termo.banco || termo.pix) {
      addLine(3);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('Dados para pagamento:', mL, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      const bancoDados = [
        termo.banco ? `Banco: ${termo.banco}` : null,
        termo.agencia ? `Agência: ${termo.agencia}` : null,
        termo.conta ? `Conta: ${termo.conta}` : null,
        termo.pix ? `Chave PIX: ${termo.pix}` : null,
      ].filter(Boolean).join(';  ');
      para(bancoDados, 10, false, 4);
    }

    // 4.2 Nota Fiscal
    addLine(4);
    para('4.2  O(A) CONTRATADO(A) deverá disponibilizar nota fiscal do serviço executado com os seguintes dados:', 10, false, 0);
    addLine(2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const nfDados = [
      `Razão Social: ${contratante.nome}`,
      `Endereço: ${contratante.endereco_nf}`,
      `CNPJ: ${contratante.cnpj_nf}`,
      `Inscrição Municipal: ${contratante.inscricao_municipal}`,
      `Tel.: ${contratante.telefone}`,
      `Email: ${contratante.email}`,
      `Descrição: favor incluir na descrição: "${termo.descricao_nf_editavel || projeto.descricao_nf || ''}"`,
    ];
    nfDados.forEach(linha => {
      para(linha, 9, false, 10);
      y += 1;
    });

    addLine(3);
    para('4.3  O pagamento será após a conclusão dos serviços e se dará em até 5 (cinco) dias úteis a partir da emissão da nota fiscal.', 10, false, 0);
    addLine(3);
    para('4.4  Incorrerão por conta do(a) CONTRATADO(A) e estão incluídos no valor pago acima todos os custos, despesas, taxas e impostos necessários para a prestação dos serviços objeto do presente instrumento (inclusive transporte, locomoção, alimentação, hospedagem, diárias, exceto quando para fora de Belo Horizonte).', 10, false, 0);

    // ── 5. DEMAIS CONDIÇÕES ────────────────────────────────────────────────
    addLine(6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    checkPage(14);
    doc.text('5', mL, y);
    doc.text('DEMAIS CONDIÇÕES', mL + 8, y);
    y += 6;

    // 5.1 Imagem
    para('5.1  O CONTRATADO autoriza que o CONTRATANTE realize o registro fotográfico, videográfico e de áudio das atividades e serviços por ele prestadas, inclusive para fins de divulgação e veiculação por quaisquer meios e cede desde já os direitos autorais e de imagem referentes a tais registros ao CONTRATANTE ou a quem ele ceder, no âmbito do ' + (projeto.nome_projeto || 'Projeto Museus Centro') + '.', 10, false, 0);

    // 5.2 Vínculo trabalhista
    addLine(4);
    para('5.2  Da Inexistência de Vínculo Trabalhista: Não se estabelece, por força deste Contrato, qualquer vínculo empregatício entre o CONTRATANTE e o CONTRATADO, bem como empregados, sócios, administradores, dirigentes, prestadores de serviço ou prepostos do CONTRATADO, se houver, inclusive profissionais por este eventualmente agenciados/contratados, sendo o CONTRATADO o único responsável pelo pagamento de todas as despesas relativas às pessoas que venha a utilizar para a execução dos serviços abrangidos no objeto do presente Contrato, aí incluídos os respectivos salários, encargos trabalhistas, tributários e previdenciários.', 10, false, 0);

    // 5.3 Direitos autorais
    addLine(4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    checkPage(10);
    const daCap = '5.3  ';
    doc.text(daCap, mL, y);
    doc.text('DIREITOS AUTORAIS:', mL + doc.getTextWidth(daCap) + 1, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    para('O(A) CONTRATADO(A) cede ao CONTRATANTE, em caráter definitivo, permanente e irrevogável, todos os demais direitos de Propriedade Intelectual eventualmente aplicáveis sobre as criações resultantes dos serviços executados em função deste Contrato, inclusive marcas e desenhos industriais.', 10, false, 8);

    addLine(3);
    para('5.3.1  O CONTRATANTE poderá utilizar e dispor livremente dos direitos ora cedidos, inclusive por meio de terceiros por ele autorizados, não sendo devido nenhum ônus ou valor adicional ao(à) CONTRATADO(A) ou à sua equipe técnica – caso exista, em função da cessão ora realizada ou de novos usos do material, dando-se, por meio deste Contrato, plena e definitiva quitação, sendo a retribuição por sua utilização prevista no valor contratado. Mas obriga-se o CONTRATANTE a veicular os créditos da autoria do trabalho em favor do seu autor, seja ele a própria CONTRATADA ou pessoa de sua equipe técnica.', 10, false, 8);

    addLine(3);
    const nomeProjeto = projeto.nome_projeto || 'Museus Centro';
    const termoColab = projeto.termo_colaboracao || '';
    para(`5.3.2  O CONTRATANTE fica configurado como exclusivo titular da obra, nos termos dos artigos 28, 29 e 79 da Lei 9.610/98, podendo usar e dispor dos direitos cedidos no caput, pessoalmente ou por meio de terceiros, para livre utilização e fixação em qualquer meio ou mídia ou ceder total ou parcialmente tais direitos a terceiros parceiros do ${nomeProjeto}, no âmbito do ${termoColab ? termoColab + ' do ' : ''}Projeto ${nomeProjeto}, acima referido no presente instrumento, e desde que nas mesmas condições acima definidas.`, 10, false, 8);

    // ── ASSINATURAS ────────────────────────────────────────────────────────
    addLine(12);
    checkPage(55);

    // Data
    let dataStr = '';
    if (termo.data_assinatura) {
      dataStr = formatarData(termo.data_assinatura);
    }
    const localData = `${termo.cidade_assinatura || 'Belo Horizonte'}, ${dataStr || '_____ de _____________ de _______'}`;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(localData, pW / 2, y, { align: 'center' });
    addLine(18);

    // Assinatura Contratante
    const xLeft = mL + 10;
    const xRight = pW / 2 + 10;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    hLine(y);
    doc.setFont('helvetica', 'bold');
    doc.text('VIADUTO DAS ARTES - CONTRATANTE', xLeft, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(contratante.representante_completo || contratante.representante, xLeft, y + 10);

    // Assinatura Contratado
    hLine2(y, xRight, pW - mR - 10);
    doc.setFont('helvetica', 'bold');
    doc.text('CONTRATADO', xRight, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(termo.contratado_nome || '', xRight, y + 10);

    addLine(22);

    // Testemunhas
    checkPage(25);
    const yTest = y;

    // Testemunha 1
    hLine(yTest);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (termo.testemunha1_nome) {
      doc.text(`Nome: ${termo.testemunha1_nome}`, xLeft, yTest + 5);
      if (termo.testemunha1_cpf) doc.text(`CPF ${termo.testemunha1_cpf}`, xLeft, yTest + 10);
    }
    doc.setFont('helvetica', 'bold');
    doc.text('Testemunha', xLeft + 20, yTest + 16);

    // Testemunha 2
    hLine2(yTest, xRight, pW - mR - 10);
    doc.setFont('helvetica', 'normal');
    if (termo.testemunha2_nome) {
      doc.text(`Nome: ${termo.testemunha2_nome}`, xRight, yTest + 5);
      if (termo.testemunha2_cpf) doc.text(`CPF ${termo.testemunha2_cpf}`, xRight, yTest + 10);
    }
    doc.setFont('helvetica', 'bold');
    doc.text('Testemunha', xRight + 20, yTest + 16);

    // Paginação
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(String(i), pW - mR, pH - 10, { align: 'right' });
      doc.setTextColor(0);
    }

    // Retornar PDF
    const pdfBytes = doc.output('arraybuffer');
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=TC-${numTermo}-termo.pdf`,
      },
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});