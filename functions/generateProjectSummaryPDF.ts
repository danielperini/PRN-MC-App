import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';
import { jsPDF } from 'npm:jspdf@2.5.2';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const doc = new jsPDF();
    let y = 20;

    // Título
    doc.setFontSize(18);
    doc.setFont(undefined, 'bold');
    doc.text('PROJETO MUSEUS CENTRO', 105, y, { align: 'center' });
    y += 10;
    
    doc.setFontSize(14);
    doc.text('Resumo Executivo', 105, y, { align: 'center' });
    y += 15;

    // Destaque 3º Aditivo
    doc.setFontSize(12);
    doc.setFillColor(0, 0, 0);
    doc.rect(15, y - 5, 180, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont(undefined, 'bold');
    doc.text('INSTRUMENTO VIGENTE:', 20, y);
    y += 7;
    doc.setFontSize(11);
    doc.text('3º Termo Aditivo ao Termo de Colaboração', 20, y);
    y += 6;
    doc.text('Chamamento Público FMC nº 001/2024', 20, y);
    y += 6;
    doc.text('Vigência: até 29 de novembro de 2026', 20, y);
    y += 15;

    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, 'normal');

    // Parceria
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('PARCERIA', 15, y);
    y += 7;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text('• Fundação Municipal de Cultura (FMC)', 20, y);
    y += 5;
    doc.text('• OSC Viaduto das Artes', 20, y);
    y += 10;

    // Museus
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('MUSEUS ENVOLVIDOS', 15, y);
    y += 7;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text('• MUMO - Museu da Moda (1º museu público de moda do Brasil)', 20, y);
    y += 5;
    doc.text('• MIS BH - Museu da Imagem e do Som (90 mil+ itens)', 20, y);
    y += 5;
    doc.text('• MHAB - Museu Histórico Abílio Barreto (fundado 1941)', 20, y);
    y += 10;

    // Valor
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('VALOR GLOBAL', 15, y);
    y += 7;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text('R$ 3.891.800,00 (acréscimo 3º Aditivo: R$ 1.320.000,00)', 20, y);
    y += 10;

    // Princípios
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('PRINCÍPIOS FUNDAMENTAIS', 15, y);
    y += 7;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text('✓ TODAS as ações são GRATUITAS', 20, y);
    y += 5;
    doc.text('✓ Classificação indicativa LIVRE', 20, y);
    y += 5;
    doc.text('✓ Acessibilidade garantida', 20, y);
    y += 5;
    doc.text('✓ Trabalho colaborativo', 20, y);
    y += 15;

    // Nova página
    doc.addPage();
    y = 20;

    // Metas principais
    doc.setFontSize(14);
    doc.setFont(undefined, 'bold');
    doc.text('METAS PRINCIPAIS', 15, y);
    y += 10;

    const metas = [
      ['Ações Educativas', '60 (fase 1) + 30 (fase 3)'],
      ['Ações Culturais', '36 + 4 (Presente de Iemanjá)'],
      ['Educadores Fixos', '3 (40h/sem, 1 por museu)'],
      ['Diárias Educadores', '101 (público espontâneo)'],
      ['Exposições Novas', '3 (MHAB, MIS, MUMO)'],
      ['Mostras Curta Duração', '18'],
      ['Noturno nos Museus', '3 edições (2024-2026)'],
      ['Catálogos', '4 (300 exemplares cada)'],
      ['Maquete Tátil', '1'],
      ['Vídeos em Libras', '5'],
      ['Consultorias', '2 + 1 formação']
    ];

    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    
    metas.forEach(([meta, qtd]) => {
      doc.text(`• ${meta}:`, 20, y);
      doc.setFont(undefined, 'bold');
      doc.text(qtd, 120, y);
      doc.setFont(undefined, 'normal');
      y += 6;
    });

    y += 10;

    // Fase 3
    doc.setFontSize(12);
    doc.setFont(undefined, 'bold');
    doc.text('FASE 3 - MÊS 19 AO 28 (10 MESES)', 15, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text('• 30 ações educativas/culturais', 20, y);
    y += 5;
    doc.text('• Nova exposição MUMO + abertura', 20, y);
    y += 5;
    doc.text('• 2 consultorias temáticas', 20, y);
    y += 5;
    doc.text('• 1 formação em ambiente seguro e acessibilidade', 20, y);
    y += 5;
    doc.text('• Continuidade de 3 educadores fixos (10 parcelas)', 20, y);
    y += 15;

    // Público-alvo
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.text('PÚBLICO-ALVO', 15, y);
    y += 7;
    doc.setFont(undefined, 'normal');
    doc.setFontSize(10);
    doc.text('Crianças, jovens, adultos, idosos, PCDs, neurodivergentes,', 20, y);
    y += 5;
    doc.text('professores, artistas, pesquisadores e público geral.', 20, y);
    y += 5;
    doc.setFont(undefined, 'bold');
    doc.text('Público estimado: 100 mil pessoas', 20, y);
    y += 15;

    // Rodapé
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(128, 128, 128);
    doc.text('Gerado em: ' + new Date().toLocaleDateString('pt-BR'), 15, 280);
    doc.text('Fonte: 3º Termo Aditivo - Plano de Trabalho vigente', 15, 285);

    const pdfBytes = doc.output('arraybuffer');

    // Upload para Google Drive
    const { accessToken } = await base44.asServiceRole.connectors.getConnection('googledrive');
    
    let folderId = null;
    const searchResponse = await fetch(
      'https://www.googleapis.com/drive/v3/files?q=name=%27Treinamento%20Chatbot%20Museus%27%20and%20mimeType=%27application/vnd.google-apps.folder%27%20and%20trashed=false',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const searchData = await searchResponse.json();
    
    if (searchData.files && searchData.files.length > 0) {
      folderId = searchData.files[0].id;
    }

    if (folderId) {
      const pdfFormData = new FormData();
      const pdfFile = new File([pdfBytes], `resumo_3_aditivo_${new Date().toISOString().split('T')[0]}.pdf`);
      pdfFormData.append('metadata', new Blob([JSON.stringify({
        name: `resumo_3_aditivo_${new Date().toISOString().split('T')[0]}.pdf`,
        parents: [folderId]
      })], { type: 'application/json' }));
      pdfFormData.append('file', pdfFile);

      await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          body: pdfFormData
        }
      );
    }

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename=resumo_projeto_3_aditivo.pdf'
      }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});