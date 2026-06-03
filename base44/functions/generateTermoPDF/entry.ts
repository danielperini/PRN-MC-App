import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';
import { jsPDF } from 'npm:jspdf@4.0.0';

const DADOS_CONTRATANTE_PADRAO = {
  nome: 'OSC Viaduto das Artes',
  nome_nf: 'Viaduto das Artes',
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

// Converte caracteres especiais para ASCII seguro compatível com jsPDF helvetica
function safe(str) {
  if (!str) return '';
  return String(str)
    .replace(/\u00e0/g, 'a').replace(/\u00e1/g, 'a').replace(/\u00e2/g, 'a').replace(/\u00e3/g, 'a').replace(/\u00e4/g, 'a')
    .replace(/\u00c0/g, 'A').replace(/\u00c1/g, 'A').replace(/\u00c2/g, 'A').replace(/\u00c3/g, 'A').replace(/\u00c4/g, 'A')
    .replace(/\u00e8/g, 'e').replace(/\u00e9/g, 'e').replace(/\u00ea/g, 'e').replace(/\u00eb/g, 'e')
    .replace(/\u00c8/g, 'E').replace(/\u00c9/g, 'E').replace(/\u00ca/g, 'E').replace(/\u00cb/g, 'E')
    .replace(/\u00ec/g, 'i').replace(/\u00ed/g, 'i').replace(/\u00ee/g, 'i').replace(/\u00ef/g, 'i')
    .replace(/\u00cc/g, 'I').replace(/\u00cd/g, 'I').replace(/\u00ce/g, 'I').replace(/\u00cf/g, 'I')
    .replace(/\u00f2/g, 'o').replace(/\u00f3/g, 'o').replace(/\u00f4/g, 'o').replace(/\u00f5/g, 'o').replace(/\u00f6/g, 'o')
    .replace(/\u00d2/g, 'O').replace(/\u00d3/g, 'O').replace(/\u00d4/g, 'O').replace(/\u00d5/g, 'O').replace(/\u00d6/g, 'O')
    .replace(/\u00f9/g, 'u').replace(/\u00fa/g, 'u').replace(/\u00fb/g, 'u').replace(/\u00fc/g, 'u')
    .replace(/\u00d9/g, 'U').replace(/\u00da/g, 'U').replace(/\u00db/g, 'U').replace(/\u00dc/g, 'U')
    .replace(/\u00e7/g, 'c').replace(/\u00c7/g, 'C')
    .replace(/\u00f1/g, 'n').replace(/\u00d1/g, 'N')
    .replace(/\u2013/g, '-').replace(/\u2014/g, '-').replace(/\u2019/g, "'").replace(/\u201c/g, '"').replace(/\u201d/g, '"')
    .replace(/[^\x00-\x7F]/g, '?');
}

function formatarData(data) {
  if (!data) return '';
  const d = new Date(data + 'T12:00:00');
  const meses = ['janeiro','fevereiro','marco','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
  return `${String(d.getDate()).padStart(2,'0')} de ${meses[d.getMonth()]} de ${d.getFullYear()}`;
}

function formatarValor(valor) {
  const num = parseFloat(valor || 0);
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Nao autorizado' }, { status: 401 });

    const termo = await req.json();
    const contratante = termo.dados_contratante || DADOS_CONTRATANTE_PADRAO;
    const projeto = termo.projeto_config || {};
    const numTermo = termo.numero_termo || '';

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    const pW = doc.internal.pageSize.getWidth();
    const pH = doc.internal.pageSize.getHeight();
    const mL = 20;
    const mR = 20;
    const textW = pW - mL - mR;
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

    function para(text, fontSize = 10, bold = false, indent = 0) {
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      const x = mL + indent;
      const w = textW - indent;
      const lines = doc.splitTextToSize(safe(text || ''), w);
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

    // TITULO
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text(safe(`TERMO DE COMPROMISSO DE PRESTACAO DE SERVICO ${numTermo}`), pW / 2, y, { align: 'center' });
    y += 10;

    // CONTRATANTE tabela
    const rowH = 7;
    const rows = [
      [safe(`CONTRATANTE: ${contratante.nome}`)],
      [safe(`Endereco: ${contratante.endereco}`)],
      [safe(`Contato: ${contratante.telefone}`), safe(`Email: ${contratante.email}`)],
      [safe(`CNPJ: ${contratante.cnpj}`)],
      [safe(`Representante Legal: ${contratante.representante}`), safe(`Cargo/Funcao: ${contratante.cargo}`)],
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
        doc.line(mL + textW / 2, y, mL + textW / 2, y + rowH);
      } else {
        doc.text(cols[0], mL + 2, y + 4.8);
      }
      y += rowH;
    });

    addLine(6);

    // CONTRATADO
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    const contratadoHeader = safe(`CONTRATADO: ${termo.contratado_nome || ''}`);
    let contratadoDetalhe = termo.contratado_cpf_cnpj?.includes('/')
      ? safe(`CNPJ: ${termo.contratado_cpf_cnpj}`)
      : safe(`CPF: ${termo.contratado_cpf_cnpj || ''}`);
    if (termo.contratado_endereco) contratadoDetalhe += safe(`, ${termo.contratado_endereco}`);
    if (termo.contratado_representante) {
      contratadoDetalhe += safe(`, representante legal ${termo.contratado_representante}`);
      if (termo.contratado_cpf_representante) contratadoDetalhe += safe(`, CPF ${termo.contratado_cpf_representante}`);
      contratadoDetalhe += ', mesmo endereco';
    }
    if (termo.contratado_telefone) contratadoDetalhe += safe(`, celular: ${termo.contratado_telefone}`);
    if (termo.contratado_email) contratadoDetalhe += safe(` e-mail ${termo.contratado_email}`);

    para(contratadoHeader + ', ' + contratadoDetalhe, 10);
    addLine(6);

    // 1. OBJETO
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    checkPage(12);
    doc.text('1', mL, y);
    doc.text('OBJETO:', mL + 8, y);
    doc.setFont('helvetica', 'normal');
    const objetoText = safe(termo.objeto || '');
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

    // 2. ESCOPO
    addLine(4);
    checkPage(12);
    doc.setFont('helvetica', 'bold');
    doc.text('2', mL, y);
    doc.text('ESCOPO:', mL + 8, y);
    doc.setFont('helvetica', 'normal');
    const escopoLines = doc.splitTextToSize(safe(termo.escopo || ''), textW - 30);
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

    // 2.1 Vinculacao
    addLine(3);
    const vinculacaoText = termo.texto_vinculacao_editavel || projeto.texto_vinculacao || '';
    if (vinculacaoText) {
      para('2.1 ' + vinculacaoText, 10, false, 8);
    }

    // 3. PRAZO E LOCAL
    addLine(5);
    checkPage(12);
    doc.setFont('helvetica', 'bold');
    doc.text('3', mL, y);
    doc.text(safe('PRAZO E LOCAL DA PRESTACAO:'), mL + 8, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    const prazoText = safe(`O servico sera prestado em ${termo.periodo_execucao || 'periodo a definir'}${termo.museu_local ? `, no ${termo.museu_local}` : ''}. O local da prestacao do servico sera no ${termo.museu_local || 'local a definir'}.`);
    para(prazoText, 10, false, 8);

    // 4. VALORES
    addLine(5);
    checkPage(14);
    doc.setFont('helvetica', 'bold');
    doc.text('4', mL, y);
    doc.text(safe('VALORES, PAGAMENTO E RESPONSABILIDADES'), mL + 8, y);
    y += 6;

    let pagamentoText = safe(`Pela prestacao do servico acima definido, o CONTRATANTE pagara ao(a) CONTRATADO(A) a quantia de `);
    pagamentoText += formatarValor(termo.valor_total);
    if (termo.detalhamento_valores) pagamentoText += safe(`, sendo ${termo.detalhamento_valores}`);
    pagamentoText += safe(`. O pagamento se dara por meio de ${termo.forma_pagamento || 'PIX, transferencia online ou deposito bancario'} em conta de exclusiva titularidade do(a) CONTRATADO(A), conforme dados bancarios destacados na Nota Fiscal, mediante a emissao da referida nota fiscal.`);
    para('4.1  ' + pagamentoText, 10, false, 0);

    if (termo.banco || termo.pix) {
      addLine(3);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(safe('Dados para pagamento:'), mL, y);
      y += 5;
      doc.setFont('helvetica', 'normal');
      const bancoDados = [
        termo.banco ? safe(`Banco: ${termo.banco}`) : null,
        termo.agencia ? safe(`Agencia: ${termo.agencia}`) : null,
        termo.conta ? safe(`Conta: ${termo.conta}`) : null,
        termo.pix ? safe(`Chave PIX: ${termo.pix}`) : null,
      ].filter(Boolean).join(';  ');
      para(bancoDados, 10, false, 4);
    }

    addLine(4);
    para(safe('4.2  O(A) CONTRATADO(A) devera disponibilizar nota fiscal do servico executado com os seguintes dados:'), 10, false, 0);
    addLine(2);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const nfDados = [
      safe(`Razao Social: ${contratante.nome_nf || 'Viaduto das Artes'}`),
      safe(`Endereco: ${contratante.endereco_nf}`),
      safe(`CNPJ: ${contratante.cnpj_nf}`),
      safe(`Inscricao Municipal: ${contratante.inscricao_municipal}`),
      safe(`Tel.: ${contratante.telefone}`),
      safe(`Email: ${contratante.email}`),
      safe(`Descricao: favor incluir na descricao: "${termo.descricao_nf_editavel || projeto.descricao_nf_base || ''}"`),
    ];
    nfDados.forEach(linha => {
      para(linha, 9, false, 10);
      y += 1;
    });

    addLine(3);
    para(safe('4.3  O pagamento sera apos a conclusao dos servicos e se dara em ate 5 (cinco) dias uteis a partir da emissao da nota fiscal.'), 10, false, 0);
    addLine(3);
    para(safe('4.4  Incorrerao por conta do(a) CONTRATADO(A) e estao incluidos no valor pago acima todos os custos, despesas, taxas e impostos necessarios para a prestacao dos servicos objeto do presente instrumento (inclusive transporte, locomocao, alimentacao, hospedagem, diarias, exceto quando para fora de Belo Horizonte).'), 10, false, 0);

    // 5. DEMAIS CONDICOES
    addLine(6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    checkPage(14);
    doc.text('5', mL, y);
    doc.text(safe('DEMAIS CONDICOES'), mL + 8, y);
    y += 6;

    para(safe('5.1  O CONTRATADO autoriza que o CONTRATANTE realize o registro fotografico, videografico e de audio das atividades e servicos por ele prestadas, inclusive para fins de divulgacao e veiculacao por quaisquer meios e cede desde ja os direitos autorais e de imagem referentes a tais registros ao CONTRATANTE ou a quem ele ceder, no ambito do ') + safe(projeto.nome_projeto || 'Projeto Museus Centro') + '.', 10, false, 0);

    addLine(4);
    para(safe('5.2  Da Inexistencia de Vinculo Trabalhista: Nao se estabelece, por forca deste Contrato, qualquer vinculo empregaticio entre o CONTRATANTE e o CONTRATADO, bem como empregados, socios, administradores, dirigentes, prestadores de servico ou prepostos do CONTRATADO, se houver, inclusive profissionais por este eventualmente agenciados/contratados, sendo o CONTRATADO o unico responsavel pelo pagamento de todas as despesas relativas as pessoas que venha a utilizar para a execucao dos servicos abrangidos no objeto do presente Contrato, ai incluidos os respectivos salarios, encargos trabalhistas, tributarios e previdenciarios.'), 10, false, 0);

    addLine(4);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    checkPage(10);
    const daCap = '5.3  ';
    doc.text(daCap, mL, y);
    doc.text(safe('DIREITOS AUTORAIS:'), mL + doc.getTextWidth(daCap) + 1, y);
    y += 5;
    doc.setFont('helvetica', 'normal');
    para(safe('O(A) CONTRATADO(A) cede ao CONTRATANTE, em carater definitivo, permanente e irrevogavel, todos os demais direitos de Propriedade Intelectual eventualmente aplicaveis sobre as criacoes resultantes dos servicos executados em funcao deste Contrato, inclusive marcas e desenhos industriais.'), 10, false, 8);

    addLine(3);
    para(safe('5.3.1  O CONTRATANTE podera utilizar e dispor livremente dos direitos ora cedidos, inclusive por meio de terceiros por ele autorizados, nao sendo devido nenhum onus ou valor adicional ao(a) CONTRATADO(A) ou a sua equipe tecnica - caso exista, em funcao da cessao ora realizada ou de novos usos do material, dando-se, por meio deste Contrato, plena e definitiva quitacao, sendo a retribuicao por sua utilizacao prevista no valor contratado. Mas obriga-se o CONTRATANTE a veicular os creditos da autoria do trabalho em favor do seu autor, seja ele a propria CONTRATADA ou pessoa de sua equipe tecnica.'), 10, false, 8);

    addLine(3);
    const nomeProjeto = safe(projeto.nome_projeto || 'Museus Centro');
    const termoColab = safe(projeto.termo_colaboracao || '');
    para(`5.3.2  O CONTRATANTE fica configurado como exclusivo titular da obra, nos termos dos artigos 28, 29 e 79 da Lei 9.610/98, podendo usar e dispor dos direitos cedidos no caput, pessoalmente ou por meio de terceiros, para livre utilizacao e fixacao em qualquer meio ou midia ou ceder total ou parcialmente tais direitos a terceiros parceiros do ${nomeProjeto}, no ambito do ${termoColab ? termoColab + ' do ' : ''}Projeto ${nomeProjeto}, acima referido no presente instrumento, e desde que nas mesmas condicoes acima definidas.`, 10, false, 8);

    // ASSINATURAS
    addLine(12);
    checkPage(55);

    let dataStr = '';
    if (termo.data_assinatura) {
      dataStr = formatarData(termo.data_assinatura);
    }
    const localData = safe(`${termo.cidade_assinatura || 'Belo Horizonte'}, ${dataStr || '_____ de _____________ de _______'}`);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(localData, pW / 2, y, { align: 'center' });
    addLine(18);

    const xLeft = mL + 10;
    const xRight = pW / 2 + 10;

    hLine(y);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('VIADUTO DAS ARTES - CONTRATANTE', xLeft, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(safe(contratante.representante_completo || contratante.representante), xLeft, y + 10);

    hLine2(y, xRight, pW - mR - 10);
    doc.setFont('helvetica', 'bold');
    doc.text('CONTRATADO', xRight, y + 5);
    doc.setFont('helvetica', 'normal');
    doc.text(safe(termo.contratado_nome || ''), xRight, y + 10);

    addLine(22);

    checkPage(25);
    const yTest = y;

    hLine(yTest);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    if (termo.testemunha1_nome) {
      doc.text(safe(`Nome: ${termo.testemunha1_nome}`), xLeft, yTest + 5);
      if (termo.testemunha1_cpf) doc.text(safe(`CPF ${termo.testemunha1_cpf}`), xLeft, yTest + 10);
    }
    doc.setFont('helvetica', 'bold');
    doc.text('Testemunha', xLeft + 20, yTest + 16);

    hLine2(yTest, xRight, pW - mR - 10);
    doc.setFont('helvetica', 'normal');
    if (termo.testemunha2_nome) {
      doc.text(safe(`Nome: ${termo.testemunha2_nome}`), xRight, yTest + 5);
      if (termo.testemunha2_cpf) doc.text(safe(`CPF ${termo.testemunha2_cpf}`), xRight, yTest + 10);
    }
    doc.setFont('helvetica', 'bold');
    doc.text('Testemunha', xRight + 20, yTest + 16);

    // Paginacao
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text(String(i), pW - mR, pH - 10, { align: 'right' });
      doc.setTextColor(0);
    }

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