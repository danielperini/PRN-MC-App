import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { jsPDF } from 'npm:jspdf@4.0.0';

const DADOS_CONTRATANTE = {
  nome: 'OSC Viaduto das Artes',
  cnpj: '23.843.648/0001-25',
  inscricao_municipal: '0.745.690/001-X',
  endereco: 'Av. Olinto Meireles, 45 - Barreiro, Belo Horizonte - MG, 30640-010',
  telefone: '(31) 98802-5140',
  email: 'viadutodasartes@viadutodasartes.org.br'
};

const LABELS_TIPO = {
  monitoria_mediacao: 'Monitoria/Mediação',
  oficina: 'Oficina',
  palestra: 'Palestra',
  acao_cultural: 'Ação Cultural',
  apresentacao_artistica: 'Apresentação Artística',
  projeto_videografico: 'Projeto Videográfico',
  consultoria: 'Consultoria',
  producao_apoio: 'Produção/Apoio',
  expografia: 'Expografia',
  outro: 'Outro'
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const termo = await req.json();

    // Formatar datas
    const formatarData = (data) => {
      if (!data) return '';
      const d = new Date(data);
      return d.toLocaleDateString('pt-BR');
    };

    const formatarValor = (valor) => {
      return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
      }).format(valor || 0);
    };

    // Criar PDF
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    let yPosition = 15;

    // Função auxiliar para adicionar linhas
    const addLine = (height = 1) => {
      yPosition += height;
      if (yPosition > pageHeight - 20) {
        doc.addPage();
        yPosition = 15;
      }
    };

    // Função para adicionar texto com quebra de linha
    const addText = (text, fontSize = 10, options = {}) => {
      doc.setFontSize(fontSize);
      const lines = doc.splitTextToSize(text, pageWidth - 30);
      lines.forEach(line => {
        if (yPosition > pageHeight - 20) {
          doc.addPage();
          yPosition = 15;
        }
        doc.text(line, 15, yPosition);
        yPosition += fontSize / 2.5;
      });
    };

    // Cabeçalho
    doc.setFontSize(16);
    doc.setFont(undefined, 'bold');
    doc.text('TERMO DE COMPROMISSO', pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 10;

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(`${LABELS_TIPO[termo.tipo_termo] || termo.tipo_termo}`, pageWidth / 2, yPosition, { align: 'center' });
    addLine(10);

    // Número do termo
    doc.setFont(undefined, 'bold');
    doc.text(`Número: ${termo.numero_termo || 'A DEFINIR'}`, 15, yPosition);
    yPosition += 7;

    // Dados básicos
    doc.setFont(undefined, 'normal');
    addText(`Projeto Museus Centro - Termo de Colaboração 01-031.069/24-80`, 9);
    addLine(2);

    // Contratante
    doc.setFont(undefined, 'bold');
    addText('1. CONTRATANTE');
    doc.setFont(undefined, 'normal');
    addText(`Razão Social: ${DADOS_CONTRATANTE.nome}`);
    addText(`CNPJ: ${DADOS_CONTRATANTE.cnpj}`);
    addText(`Inscrição Municipal: ${DADOS_CONTRATANTE.inscricao_municipal}`);
    addText(`Endereço: ${DADOS_CONTRATANTE.endereco}`);
    addText(`Telefone: ${DADOS_CONTRATANTE.telefone}`);
    addText(`Email: ${DADOS_CONTRATANTE.email}`);
    addLine(5);

    // Contratado
    doc.setFont(undefined, 'bold');
    addText('2. CONTRATADO');
    doc.setFont(undefined, 'normal');
    addText(`Nome: ${termo.contratado_nome}`);
    addText(`CPF: ${termo.contratado_cpf}`);
    if (termo.contratado_endereco) addText(`Endereço: ${termo.contratado_endereco}`);
    if (termo.contratado_telefone) addText(`Telefone: ${termo.contratado_telefone}`);
    if (termo.contratado_email) addText(`Email: ${termo.contratado_email}`);
    addLine(5);

    // Objeto
    doc.setFont(undefined, 'bold');
    addText('3. OBJETO');
    doc.setFont(undefined, 'normal');
    addText(termo.objeto);
    if (termo.escopo) {
      addLine(3);
      doc.setFont(undefined, 'bold');
      addText('Escopo:');
      doc.setFont(undefined, 'normal');
      addText(termo.escopo);
    }
    addLine(5);

    // Local e Prazo
    doc.setFont(undefined, 'bold');
    addText('4. LOCAL E PRAZO DE EXECUÇÃO');
    doc.setFont(undefined, 'normal');
    addText(`Local: ${termo.local_execucao || 'A definir'}`);
    addText(`Período: ${formatarData(termo.data_inicio)} a ${formatarData(termo.data_fim)}`);
    addLine(5);

    // Valores
    doc.setFont(undefined, 'bold');
    addText('5. VALORES E CONDIÇÕES DE PAGAMENTO');
    doc.setFont(undefined, 'normal');
    addText(`Valor Total: ${formatarValor(termo.valor_total)}`);
    addText(`Forma de Pagamento: ${termo.forma_pagamento || 'Conforme realizado'}`);
    
    if (termo.parcelas && termo.parcelas.length > 0) {
      addLine(2);
      doc.setFont(undefined, 'bold');
      addText('Parcelas:');
      doc.setFont(undefined, 'normal');
      termo.parcelas.forEach(p => {
        addText(`  ${p.numero}ª Parcela: ${formatarValor(p.valor)} - Vencimento: ${formatarData(p.data_vencimento)}`);
      });
    }

    if (termo.contratado_banco) {
      addLine(3);
      doc.setFont(undefined, 'bold');
      addText('Dados Bancários do Contratado:');
      doc.setFont(undefined, 'normal');
      addText(`Banco: ${termo.contratado_banco}`);
      if (termo.contratado_agencia) addText(`Agência: ${termo.contratado_agencia}`);
      if (termo.contratado_conta) addText(`Conta: ${termo.contratado_conta}`);
    }
    addLine(5);

    // Nota Fiscal
    if (termo.nota_fiscal_numero) {
      doc.setFont(undefined, 'bold');
      addText('6. DOCUMENTAÇÃO FISCAL');
      doc.setFont(undefined, 'normal');
      addText(`Nota Fiscal: ${termo.nota_fiscal_numero}`);
      addText(`Data da NF: ${formatarData(termo.nota_fiscal_data)}`);
      addLine(5);
    }

    // Cláusulas padrão
    doc.setFont(undefined, 'bold');
    addText('7. CLÁUSULAS GERAIS');
    doc.setFont(undefined, 'normal');
    addLine(2);

    doc.setFont(undefined, 'bold');
    addText('7.1 Direito de Imagem');
    doc.setFont(undefined, 'normal');
    addText('O contratado cede, a título gratuito, os direitos de imagem decorrentes da execução deste termo, autorizando o uso de fotografias, vídeos e registros audiovisuais para fins educacionais, de documentação e divulgação pela Contratante, sem necessidade de autorização adicional.');
    addLine(3);

    doc.setFont(undefined, 'bold');
    addText('7.2 Inexistência de Vínculo Trabalhista');
    doc.setFont(undefined, 'normal');
    addText('Fica expressamente acordado que não existe qualquer vínculo de natureza empregatícia, tributária ou previdenciária entre a Contratante e o Contratado, que realizará este trabalho de forma autônoma e independente, sendo responsável pelas suas obrigações fiscais e previdenciárias.');
    addLine(3);

    if (termo.observacoes) {
      doc.setFont(undefined, 'bold');
      addText('OBSERVAÇÕES');
      doc.setFont(undefined, 'normal');
      addText(termo.observacoes);
      addLine(3);
    }

    addLine(8);

    // Assinatura
    doc.setFont(undefined, 'bold');
    addText('Belo Horizonte, MG em _____ de _____________ de _______');
    addLine(8);

    doc.text('_______________________________', 15, yPosition);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text('Contratado', 15, yPosition + 5);

    doc.setFont(undefined, 'bold');
    doc.setFontSize(10);
    doc.text('_______________________________', 120, yPosition);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(9);
    doc.text('Contratante / Representante', 120, yPosition + 5);

    // Retornar PDF
    const pdfBytes = doc.output('arraybuffer');

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=termo-compromisso-${termo.numero_termo || 'novo'}.pdf`
      }
    });
  } catch (error) {
    console.error('Erro ao gerar PDF:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});